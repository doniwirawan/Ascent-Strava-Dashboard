/* ── TRAINING LOAD & FATIGUE ─────────────────────────────────────────────────
   A TrainingPeaks-style Performance Management Chart, computed from `acts`.

   Per-activity daily LOAD (a unified TSS-equivalent), best signal first:
     1) power + FTP → TSS = (t·NP·IF)/(FTP·3600)·100
     2) Strava suffer_score (Relative Effort — already an HR-TRIMP)
     3) HR-TRIMP (Banister) from avg HR + observed max HR
     4) duration × moderate-intensity fallback
   CTL (fitness) = 42-day EWMA of load · ATL (fatigue) = 7-day EWMA ·
   TSB (form/freshness) = CTL − ATL · Ramp = ΔCTL over the last 7 days. */

// Calendar arithmetic on 'YYYY-MM-DD' keys (UTC-anchored so it's DST-proof).
function _trAddDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Local calendar day for an activity (start_date_local carries a fake 'Z').
function _trDayKey(a) { return (a.start_date_local || a.start_date || '').slice(0, 10); }
// Today's LOCAL calendar day.
function _trToday() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Load for one activity + which method produced it. Returns {load, basis} or null.
function _trActivityLoad(a, ftp, hrMax, hrRest) {
  const dur = a.moving_time || a.elapsed_time || 0;
  if (dur <= 0) return null;
  // 1) power-based TSS (rides with a power meter, when we have an FTP)
  const np = a.weighted_average_watts || a.average_watts || 0;
  if (np > 0 && ftp > 0) {
    const IF = np / ftp;
    return { load: (dur * np * IF) / (ftp * 3600) * 100, basis: 'power' };
  }
  // 2) Strava Relative Effort (suffer_score) — already an HR-TRIMP, ~TSS scale
  if (a.suffer_score > 0) return { load: a.suffer_score, basis: 'effort' };
  // 3) HR-TRIMP (Banister), scaled toward the TSS range
  if (a.average_heartrate > 0 && hrMax > hrRest) {
    const hrr = Math.min(1, Math.max(0, (a.average_heartrate - hrRest) / (hrMax - hrRest)));
    const trimp = (dur / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
    return { load: trimp * 0.6, basis: 'hr' };
  }
  // 4) duration fallback — assume a moderate ~50 load/hour
  return { load: (dur / 3600) * 50, basis: 'time' };
}

// Build the full PMC series + current metrics from `acts`.
function _trBuildSeries() {
  if (typeof acts === 'undefined' || !acts.length) return null;
  const ftpEst = (typeof estimateFtp === 'function' && estimateFtp()) || null;
  const ftp = ftpEst ? ftpEst.value : 0;
  const hrMax = (typeof observedMaxHr === 'function' && observedMaxHr()) || 0;
  const hrRest = 60; // no resting-HR in the API; a common recreational default

  // Sum load per calendar day + tally which basis was used (for transparency).
  const byDay = new Map();
  const basis = { power: 0, effort: 0, hr: 0, time: 0 };
  let earliest = null;
  for (const a of acts) {
    const key = _trDayKey(a);
    if (!key) continue;
    const r = _trActivityLoad(a, ftp, hrMax, hrRest);
    if (!r) continue;
    byDay.set(key, (byDay.get(key) || 0) + r.load);
    basis[r.basis]++;
    if (!earliest || key < earliest) earliest = key;
  }
  if (!earliest) return null;

  // Walk every day from the first activity to today, decaying CTL/ATL.
  const today = _trToday();
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  let ctl = 0, atl = 0;
  const series = [];
  for (let key = earliest; key <= today; key = _trAddDays(key, 1)) {
    const L = byDay.get(key) || 0;
    ctl += (L - ctl) * kC;
    atl += (L - atl) * kA;
    series.push({ date: key, load: L, ctl, atl, tsb: ctl - atl });
    if (series.length > 4000) break; // runaway guard (~11 years)
  }
  const last = series[series.length - 1];
  const ago7 = series[series.length - 8]; // ~7 days back
  const ramp = ago7 ? last.ctl - ago7.ctl : 0;
  return {
    series, basis, ftpEst,
    ctl: last.ctl, atl: last.atl, tsb: last.tsb, ramp,
  };
}

// Form (TSB) band → label, colour, and a one-line recovery recommendation.
function _trFormBand(tsb, ramp) {
  let band;
  if (tsb < -30)      band = { label: 'High fatigue', color: '#ef4444', advice: 'Prioritise recovery — easy spins or a rest day. Your fatigue is well above your fitness right now.' };
  else if (tsb < -10) band = { label: 'Productive', color: '#fb923c', advice: 'Productive training load. Keep hard days hard and easy days easy, and bank a recovery day this week.' };
  else if (tsb < 5)   band = { label: 'Neutral', color: '#eab308', advice: 'Balanced form. A good window for a quality session or a longer endurance ride.' };
  else if (tsb < 25)  band = { label: 'Fresh', color: '#22c55e', advice: 'Fresh and race-ready. Strong day for a hard effort, an event, or a PR attempt.' };
  else                band = { label: 'Very fresh', color: '#4da8ff', advice: 'Very fresh — fitness may start to fade. Time to add some training stimulus.' };
  if (ramp > 8)       band.advice += ` ⚠ Fitness is ramping fast (+${Math.round(ramp)}/wk) — watch for overreaching.`;
  else if (ramp < -6) band.advice += ` Fitness is drifting down (${Math.round(ramp)}/wk).`;
  return band;
}

function _trBasisNote(basis) {
  const parts = [];
  if (basis.power)  parts.push(`${basis.power} from power`);
  if (basis.effort) parts.push(`${basis.effort} from Relative Effort`);
  if (basis.hr)     parts.push(`${basis.hr} from heart rate`);
  if (basis.time)   parts.push(`${basis.time} from duration`);
  return parts.join(' · ');
}

/* ── CONSISTENCY SCORE ───────────────────────────────────────────────────────
   Regularity over raw mileage. Window = last 12 weeks (capped to how long the
   athlete has been riding). Consistency % rewards hitting a weekly ride target. */
function _trMondayOf(key) {
  const d = new Date(key + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;           // 0 = Monday
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

function _trConsistency() {
  if (typeof acts === 'undefined' || !acts.length) return null;
  const rides = acts.filter(a => isRide(a) && _trDayKey(a));
  if (!rides.length) return null;

  const today = _trToday();
  const curMon = _trMondayOf(today);
  const weekAgo = key => Math.round(
    (new Date(curMon + 'T00:00:00Z') - new Date(_trMondayOf(key) + 'T00:00:00Z')) / (7 * 86400000)
  );

  const perWeek = {};
  const daySet = new Set();
  let firstKey = null;
  for (const a of rides) {
    const k = _trDayKey(a);
    daySet.add(k);
    if (!firstKey || k < firstKey) firstKey = k;
    const w = weekAgo(k);
    if (w >= 0) perWeek[w] = (perWeek[w] || 0) + 1;
  }

  const target = 3;
  const WIN = Math.min(12, weekAgo(firstKey) + 1);   // don't punish a short history
  let sum = 0, weeksWith = 0, missed = 0;
  const weeks = [];                                   // oldest → newest, for the strip
  for (let w = WIN - 1; w >= 0; w--) {
    const n = perWeek[w] || 0;
    sum += Math.min(n / target, 1);
    if (n >= target) weeksWith++;
    if (n === 0) missed++;
    weeks.push(n);
  }
  const consistency = Math.round(sum / WIN * 100);

  // Days ridden in the current calendar month.
  const monthPrefix = today.slice(0, 7);
  const daysThisMonth = [...daySet].filter(k => k.slice(0, 7) === monthPrefix).length;
  const dayOfMonth = parseInt(today.slice(8, 10), 10);

  // Longest consecutive-day riding streak across loaded history.
  const sorted = [...daySet].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of sorted) {
    run = (prev && _trAddDays(prev, 1) === k) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = k;
  }

  return { consistency, weeksWith, missed, WIN, daysThisMonth, dayOfMonth, longest, target, weeks };
}

function _trConsColor(pct) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#fb923c' : '#ef4444';
}

function _trConsistencyHTML() {
  const c = _trConsistency();
  if (!c) return '';
  const col = _trConsColor(c.consistency);
  const stat = (val, lbl, sub) => `
    <div class="tr-cons-stat">
      <div class="tr-cons-stat-val">${val}</div>
      <div class="tr-cons-stat-lbl">${lbl}</div>
      ${sub ? `<div class="tr-cons-stat-sub">${sub}</div>` : ''}
    </div>`;
  const bars = c.weeks.map(n => {
    const color = n >= c.target ? '#22c55e' : n > 0 ? '#fb923c' : 'var(--surface3, #2a2a2a)';
    const h = Math.max(8, Math.min(n, 5) / 5 * 100);
    return `<span class="tr-week-bar" title="${n} ride${n === 1 ? '' : 's'}"><span style="height:${h}%;background:${color}"></span></span>`;
  }).join('');

  return `
    <div class="card tr-cons">
      <div class="tr-chart-title">Consistency — last ${c.WIN} week${c.WIN === 1 ? '' : 's'}</div>
      <div class="tr-cons-grid">
        <div class="tr-cons-score">
          <div class="tr-cons-pct" style="color:${col}">${c.consistency}<span>%</span></div>
          <div class="tr-cons-cap">consistency</div>
          <div class="tr-week-strip">${bars}</div>
        </div>
        <div class="tr-cons-stats">
          ${stat(c.daysThisMonth, 'Days ridden', 'this month · ' + c.dayOfMonth + ' elapsed')}
          ${stat(c.longest, 'Longest streak', 'consecutive days')}
          ${stat(c.weeksWith + '<span class="tr-cons-of">/' + c.WIN + '</span>', 'Weeks ≥3 rides', 'hit the target')}
          ${stat(c.missed, 'Missed weeks', 'zero rides')}
        </div>
      </div>
    </div>`;
}

function renderTraining() {
  const sec = document.getElementById('trainingSection');
  if (!sec) return;
  const body = document.getElementById('trainingBody');
  if (!body) return;

  const d = _trBuildSeries();
  if (!d) { body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">Load your activities to see training load &amp; fatigue.</div>'; return; }

  const band = _trFormBand(d.tsb, d.ramp);
  const tsbStr = (d.tsb >= 0 ? '+' : '') + Math.round(d.tsb);
  const rampStr = (d.ramp >= 0 ? '+' : '') + Math.round(d.ramp);

  const tile = (val, unit, lbl, color, sub) => `
    <div class="tr-tile card">
      <div class="tr-tile-val" style="color:${color || 'var(--text)'}">${val}<span class="tr-tile-unit">${unit || ''}</span></div>
      <div class="tr-tile-lbl">${lbl}</div>
      ${sub ? `<div class="tr-tile-sub">${sub}</div>` : ''}
    </div>`;

  body.innerHTML = `
    <div class="tr-tiles">
      ${tile(Math.round(d.ctl), '', 'Fitness · CTL', 'var(--orange)', '42-day load')}
      ${tile(Math.round(d.atl), '', 'Fatigue · ATL', '#a78bfa', '7-day load')}
      ${tile(tsbStr, '', 'Form · TSB', band.color, `<span style="color:${band.color};font-weight:700">${band.label}</span>`)}
      ${tile(rampStr, '/wk', 'Ramp rate', d.ramp > 8 ? '#ef4444' : 'var(--text)', 'CTL change, 7d')}
    </div>

    <div class="tr-rec card">
      <div class="tr-rec-head">
        <span class="tr-rec-dot" style="background:${band.color}"></span>
        <span>Recovery recommendation</span>
        <button id="trAiBtn" class="tr-ai-btn" onclick="trainingAiRec()">${(typeof AI_ICON !== 'undefined' ? AI_ICON : '')}Get AI plan</button>
      </div>
      <div class="tr-rec-body">${band.advice}</div>
      <div id="trAiOut" class="tr-ai-out" style="display:none"></div>
    </div>

    <div class="card" style="padding:16px">
      <div class="tr-chart-title">Performance Management Chart</div>
      <div style="height:300px"><canvas id="trPmcChart"></canvas></div>
      <div class="tr-basis-note">Daily load basis: ${_trBasisNote(d.basis)}${d.ftpEst ? ` · FTP ${d.ftpEst.value}w${d.ftpEst.estimated ? ' (est.)' : ''}` : ''}</div>
    </div>

    ${_trConsistencyHTML()}`;

  _trDrawChart(d.series);
}

// Draw the CTL / ATL / TSB chart (last ~180 days) with Chart.js.
function _trDrawChart(series) {
  if (typeof Chart === 'undefined') return;
  destroyChart('trPmc');
  const view = series.slice(-180);
  const labels = view.map(p => p.date);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const orange = css('--orange') || '#fc4c02';
  const ctx = document.getElementById('trPmcChart');
  if (!ctx) return;
  charts['trPmc'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Fitness (CTL)', data: view.map(p => +p.ctl.toFixed(1)), borderColor: orange, backgroundColor: 'rgba(252,76,2,.12)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.25, yAxisID: 'y' },
        { label: 'Fatigue (ATL)', data: view.map(p => +p.atl.toFixed(1)), borderColor: '#a78bfa', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: 'y' },
        { label: 'Form (TSB)', data: view.map(p => +p.tsb.toFixed(1)), borderColor: '#22c55e', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.25, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: '#888', font: { size: 11 }, boxWidth: 12, usePointStyle: true } },
        tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa' },
      },
      scales: {
        x: { grid: { color: '#1c1c1c' }, ticks: { color: '#555', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 } },
        y: { position: 'left', grid: { color: '#1c1c1c' }, ticks: { color: '#666', font: { size: 10 } }, title: { display: true, text: 'Load', color: '#666', font: { size: 10 } } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#22c55e', font: { size: 10 } }, title: { display: true, text: 'Form', color: '#22c55e', font: { size: 10 } } },
      },
    },
  });
}

/* ── AI recovery plan (owner-gated /api/ai, rule-based text is the fallback) ── */
async function trainingAiRec() {
  const out = document.getElementById('trAiOut');
  const btn = document.getElementById('trAiBtn');
  if (!out) return;
  const d = _trBuildSeries();
  if (!d) return;
  const token = localStorage.getItem('strava_access_token');
  if (!token) { out.style.display = ''; out.innerHTML = 'Connect Strava to use the AI coach.'; return; }

  if (btn) btn.disabled = true;
  out.style.display = '';
  out.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';

  const recent = d.series.slice(-14).map(p => Math.round(p.load));
  const payload = {
    fitness_ctl: Math.round(d.ctl), fatigue_atl: Math.round(d.atl),
    form_tsb: Math.round(d.tsb), ramp_rate_per_week: Math.round(d.ramp),
    daily_load_last_14: recent,
  };
  const { provider, model, key } = (typeof aiProviderModel === 'function') ? aiProviderModel() : { provider: 'deepseek' };
  const messages = [
    { role: 'system', content:
      'You are a concise endurance-cycling coach. Using ONLY the training-load numbers provided (TrainingPeaks model: CTL=fitness, ATL=fatigue, TSB=form/freshness, ramp=weekly CTL change), give a short, specific recovery-and-training recommendation for the next 3–5 days. Note overreaching risk if ramp is high or TSB very negative. Never invent data. Reply in English, short markdown, under 120 words.' },
    { role: 'user', content: 'My current training load:\n' + JSON.stringify(payload, null, 2) },
  ];
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model, key }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.text) {
      out.innerHTML = (typeof aiMd === 'function' ? aiMd(data.text) : data.text);
    } else if (data.error === 'not_authorized' || data.error === 'provider_not_configured') {
      out.innerHTML = 'AI coach isn\'t set up on this deployment — the guidance above is rule-based from your form (TSB) and ramp rate. (Owner: add a provider in AI Coach settings.)';
    } else {
      out.innerHTML = 'Couldn\'t reach the AI coach right now. The guidance above is rule-based from your numbers.';
    }
  } catch {
    out.innerHTML = 'Couldn\'t reach the AI coach right now. The guidance above is rule-based from your numbers.';
  }
  if (btn) btn.disabled = false;
}

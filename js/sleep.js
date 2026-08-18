/* ── SLEEP ──────────────────────────────────────────────────────────────────
   Owner-only section. Sleep comes from a one-off Huawei Health export
   (TruSleep stages) served by the owner-gated /api/sleep endpoint — it is
   personal health data, so it is never a static file in this public repo. The
   training side is joined live against `acts`, so comparisons refresh as new
   rides come in.

   A "night" is labelled with the date you WOKE UP — so the night labelled
   2026-08-09 is the sleep you got going into 9 Aug, and the night after a
   ride on 9 Aug is labelled 2026-08-10.
   ────────────────────────────────────────────────────────────────────────── */

let _slpData = null;          // {cols, rows, ...} once fetched
let _slpNights = null;        // [{date, asleep, deep, ...}] normalised
let _slpLoading = false;

function _slpIsOwner() {
  try { return localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID && !!CONFIG.accessToken; }
  catch { return false; }
}

async function _slpLoad() {
  if (_slpNights) return _slpNights;
  // Personal health data — fetched from the owner-gated endpoint, never a
  // static file, so it is not readable by anyone who visits the deploy.
  const res = await fetch('/api/sleep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: CONFIG.accessToken }),
  });
  if (!res.ok) throw new Error('sleep data unavailable (' + res.status + ')');
  _slpData = await res.json();
  const c = _slpData.cols;
  _slpNights = _slpData.rows.map(r => {
    const o = {};
    c.forEach((k, i) => { o[k] = r[i]; });
    return o;
  });
  return _slpNights;
}

/* ── small helpers ── */
const _slpMean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const _slpHM   = m => Math.floor(m / 60) + 'h ' + String(Math.round(m % 60)).padStart(2, '0') + 'm';
/* Date maths is done in UTC on purpose. Parsing 'YYYY-MM-DDT00:00:00' without a
   zone gives LOCAL midnight, and toISOString() then converts back to UTC — in
   Bali (+08:00) that silently rolls every date back a day and misaligns rides
   against nights. Anchoring both ends to Z keeps the label arithmetic exact. */
const _slpUTC  = d => new Date(d + 'T00:00:00Z');
const _slpISO  = t => t.toISOString().slice(0, 10);
const _slpDay  = d => _slpUTC(d).getUTCDay();                      // 0=Sun
const _slpNext = d => { const t = _slpUTC(d); t.setUTCDate(t.getUTCDate() + 1); return _slpISO(t); };
/* every calendar date from a→b inclusive */
function _slpRange(a, b) {
  const out = [];
  for (let t = _slpUTC(a); _slpISO(t) <= b; t.setUTCDate(t.getUTCDate() + 1)) out.push(_slpISO(t));
  return out;
}
function _slpClock(h) {                                            // -0.78 → "23:13"
  let x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x), mm = Math.round((x - hh) * 60);
  return String(mm === 60 ? hh + 1 : hh).padStart(2, '0') + ':' + String(mm === 60 ? 0 : mm).padStart(2, '0');
}

/* Days you trained, and the day's total Strava relative effort (fallback:
   moving minutes, so days before Strava recorded RE still bucket sensibly). */
function _slpTrainingDays() {
  const map = new Map();
  if (typeof acts === 'undefined' || !acts) return map;
  acts.forEach(a => {
    const d = (a.start_date_local || '').slice(0, 10);
    if (!d) return;
    const cur = map.get(d) || { load: 0, re: 0, min: 0, n: 0, dist: 0 };
    cur.n++;
    cur.re += a.suffer_score || 0;
    cur.min += (a.moving_time || 0) / 60;
    cur.dist += a.distance || 0;
    map.set(d, cur);
  });
  map.forEach(v => { v.load = v.re || v.min; });
  return map;
}

/* Only compare nights inside the window where BOTH sources exist, otherwise
   "rest day" silently includes the year before the Strava history starts. */
function _slpWindow(nights, train) {
  if (!train.size) return nights;
  const tDates = [...train.keys()].sort();
  const lo = tDates[0], hi = _slpNext(tDates[tDates.length - 1]);
  return nights.filter(n => n.date >= lo && n.date <= hi);
}

function _slpAgg(g) {
  return {
    n: g.length,
    asleep: _slpMean(g.map(x => x.asleep)),
    deep: _slpMean(g.map(x => x.deep)),
    rem: _slpMean(g.map(x => x.rem)),
    light: _slpMean(g.map(x => x.light)),
    wake: _slpMean(g.map(x => x.wake)),
    eff: _slpMean(g.filter(x => x.eff != null).map(x => x.eff)),
    bed: _slpMean(g.filter(x => x.bed != null).map(x => x.bed)),
  };
}

/* ── section render ── */
function renderSleep() {
  const sec = document.getElementById('sleepSection');
  const body = document.getElementById('sleepBody');
  if (!sec || !body) return;

  if (!_slpIsOwner()) { body.innerHTML = ''; return; }
  if (_slpLoading) return;
  _slpLoading = true;
  body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">' + tr('Loading sleep data…') + '</div>';

  _slpLoad().then(nights => {
    _slpLoading = false;
    try { _slpDraw(nights, body); }
    catch (e) { console.error('sleep render failed', e); body.innerHTML = '<div class="card" style="padding:24px;color:var(--muted)">' + tr('Could not render sleep data.') + '</div>'; }
  }).catch(e => {
    _slpLoading = false;
    console.error(e);
    body.innerHTML = '<div class="card" style="padding:24px;color:var(--muted)">' + tr('Sleep data could not be loaded.') + '</div>';
  });
}

function _slpDraw(nights, body) {
  const real = nights.filter(n => n.asleep >= 60);          // ignore stub nights
  const train = _slpTrainingDays();
  const win = _slpWindow(real, train);

  /* ── training vs rest: the night AFTER each day ── */
  const afterT = [], afterR = [];
  const byDate = new Map(real.map(n => [n.date, n]));
  const tDates = [...train.keys()].sort();
  const days = tDates.length ? _slpRange(tDates[0], tDates[tDates.length - 1]) : [];
  days.forEach(day => {
    const nn = byDate.get(_slpNext(day));
    if (!nn) return;
    (train.has(day) ? afterT : afterR).push(nn);
  });
  const aT = _slpAgg(afterT), aR = _slpAgg(afterR);

  /* ── dose–response: next-night sleep by that day's load ── */
  const loads = [...train.values()].map(v => v.load).filter(x => x > 0).sort((a, b) => a - b);
  const q = f => loads.length ? loads[Math.floor(loads.length * f)] : 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const buckets = { rest: [], easy: [], moderate: [], hard: [], vhard: [] };
  days.forEach(day => {
    const nn = byDate.get(_slpNext(day));
    if (!nn) return;
    const t = train.get(day);
    if (!t) { buckets.rest.push(nn); return; }
    const l = t.load;
    buckets[l <= cuts[0] ? 'easy' : l <= cuts[1] ? 'moderate' : l <= cuts[2] ? 'hard' : 'vhard'].push(nn);
  });

  /* ── day of week ── */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = DOW.map(() => []);
  const dowTrain = DOW.map(() => 0);
  win.forEach(n => dow[_slpDay(n.date)].push(n));
  // count every training day inside the same window, whether or not that night
  // happens to carry a sleep record — otherwise "training days" undercounts
  const wLo = win.length ? win[0].date : null, wHi = win.length ? win[win.length - 1].date : null;
  train.forEach((v, d) => { if (wLo && d >= wLo && d <= wHi) dowTrain[_slpDay(d)]++; });
  const ORDER = [1, 2, 3, 4, 5, 6, 0];                     // Mon-first
  const dowAgg = ORDER.map(i => ({ label: DOW[i], ...(_slpAgg(dow[i])), trained: dowTrain[i] }));
  const worst = dowAgg.filter(x => x.n >= 5).sort((a, b) => a.asleep - b.asleep)[0];

  /* ── monthly trend ── */
  const byMonth = new Map();
  real.forEach(n => {
    const m = n.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(n);
  });
  const months = [...byMonth.keys()].sort();

  const all = _slpAgg(real);
  const stageTotal = all.deep + all.light + all.rem;

  /* ── tiles ── */
  const tile = (val, unit, lbl, color, sub) => `
    <div class="slp-tile card">
      <div class="slp-tile-val" style="color:${color || 'var(--text)'}">${val}<span class="slp-tile-unit">${unit || ''}</span></div>
      <div class="slp-tile-lbl">${lbl}</div>
      ${sub ? `<div class="slp-tile-sub">${sub}</div>` : ''}
    </div>`;

  const span = real.length ? (real[0].date + ' → ' + real[real.length - 1].date) : '';

  /* ── comparison row ── */
  const cmp = (lbl, a, b, unit, betterHigh) => {
    const diff = a - b;
    const good = betterHigh ? diff > 0 : diff < 0;
    const sign = diff >= 0 ? '+' : '−';
    return `<tr>
      <td>${lbl}</td>
      <td class="slp-num">${unit === 'h' ? _slpHM(a) : Math.round(a) + unit}</td>
      <td class="slp-num">${unit === 'h' ? _slpHM(b) : Math.round(b) + unit}</td>
      <td class="slp-num" style="color:${good ? '#22c55e' : '#f59e0b'}">${sign}${unit === 'h' ? _slpHM(Math.abs(diff)) : Math.round(Math.abs(diff)) + unit}</td>
    </tr>`;
  };

  body.innerHTML = `
    <div class="slp-intro card">
      <div class="slp-intro-h">${trf('{0} nights of sleep, {1}', real.length, span)}</div>
      <div class="slp-intro-b">${tr('Sleep stages come from a one-off Huawei Health (TruSleep) export. Training is joined live from Strava, so every comparison below updates as you ride. A night is labelled by the morning you woke up.')}</div>
    </div>

    <div class="slp-tiles">
      ${tile(_slpHM(all.asleep), '', tr('Average night'), 'var(--orange)', trf('{0} in bed', _slpHM(_slpMean(real.filter(x => x.tib != null).map(x => x.tib)))))}
      ${tile(Math.round(all.deep), 'm', tr('Deep sleep'), '#6366f1', trf('{0}% of sleep', Math.round(100 * all.deep / stageTotal)))}
      ${tile(Math.round(all.rem), 'm', tr('REM sleep'), '#a78bfa', trf('{0}% of sleep', Math.round(100 * all.rem / stageTotal)))}
      ${tile(all.eff.toFixed(1), '%', tr('Efficiency'), all.eff >= 90 ? '#22c55e' : '#f59e0b', trf('{0} awake per night', _slpHM(all.wake)))}
      ${tile(_slpClock(all.bed), '', tr('Typical bedtime'), 'var(--text)', trf('up at {0}', _slpClock(_slpMean(real.filter(x => x.up != null).map(x => x.up)))))}
    </div>

    ${_slpHeadline(worst, dowAgg, aT, aR, real)}

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('The night after training vs the night after rest')}</div>
      <div class="slp-chart-sub">${trf('{0} nights following a training day · {1} nights following a rest day', aT.n, aR.n)}</div>
      <table class="slp-table">
        <thead><tr><th></th><th>${tr('After training')}</th><th>${tr('After rest')}</th><th>${tr('Difference')}</th></tr></thead>
        <tbody>
          ${cmp(tr('Total sleep'), aT.asleep, aR.asleep, 'h', true)}
          ${cmp(tr('Deep'), aT.deep, aR.deep, 'm', true)}
          ${cmp(tr('REM'), aT.rem, aR.rem, 'm', true)}
          ${cmp(tr('Light'), aT.light, aR.light, 'm', true)}
          ${cmp(tr('Awake'), aT.wake, aR.wake, 'm', false)}
        </tbody>
      </table>
      <div class="slp-note">${tr('Your body takes the extra sleep when you give it work to recover from — the deep and REM stages, the ones that actually rebuild you, are where the gain lands.')}</div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Dose–response: how hard you rode vs how you slept that night')}</div>
      <div class="slp-chart-sub">${tr('Training days split into quartiles by Strava relative effort')}</div>
      <div class="slp-chart-wrap"><canvas id="slpDoseChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Sleep by day of week')}</div>
      <div class="slp-chart-sub">${tr('Bars are sleep; the line is how many times you trained on that day')}</div>
      <div class="slp-chart-wrap"><canvas id="slpDowChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Two years of sleep, month by month')}</div>
      <div class="slp-chart-wrap"><canvas id="slpTrendChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Last 60 nights, stage by stage')}</div>
      <div class="slp-chart-wrap"><canvas id="slpStageChart"></canvas></div>
    </div>
  `;

  /* ── charts ── */
  const B = [
    { k: 'rest', lbl: tr('Rest') }, { k: 'easy', lbl: tr('Easy') },
    { k: 'moderate', lbl: tr('Moderate') }, { k: 'hard', lbl: tr('Hard') },
    { k: 'vhard', lbl: tr('Very hard') },
  ].filter(b => buckets[b.k].length);

  destroyChart('slpDoseChart');
  charts['slpDoseChart'] = new Chart(document.getElementById('slpDoseChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: B.map(b => b.lbl + ' (' + buckets[b.k].length + ')'),
      datasets: [
        { label: tr('Deep'), data: B.map(b => Math.round(_slpAgg(buckets[b.k]).deep)), backgroundColor: '#6366f1', stack: 's' },
        { label: tr('REM'), data: B.map(b => Math.round(_slpAgg(buckets[b.k]).rem)), backgroundColor: '#a78bfa', stack: 's' },
        { label: tr('Light'), data: B.map(b => Math.round(_slpAgg(buckets[b.k]).light)), backgroundColor: '#3f3f6b', stack: 's' },
      ],
    },
    options: (() => {
      const o = chartOpts('min', true);
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
      o.scales.y.title = { display: true, text: tr('minutes'), color: '#555', font: { size: 10 } };
      return o;
    })(),
  });

  destroyChart('slpDowChart');
  charts['slpDowChart'] = new Chart(document.getElementById('slpDowChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: dowAgg.map(d => tr(d.label)),
      datasets: [
        { label: tr('Sleep (min)'), data: dowAgg.map(d => Math.round(d.asleep)), backgroundColor: dowAgg.map(d => worst && d.label === worst.label ? '#ef4444' : 'rgba(252,76,2,.65)'), yAxisID: 'y', order: 2 },
        { label: tr('Deep (min)'), data: dowAgg.map(d => Math.round(d.deep)), backgroundColor: '#6366f1', yAxisID: 'y', order: 3 },
        { label: tr('Training days'), data: dowAgg.map(d => d.trained), type: 'line', borderColor: '#22c55e', backgroundColor: '#22c55e', tension: .35, pointRadius: 3, yAxisID: 'y1', order: 1 },
      ],
    },
    options: (() => {
      const o = chartOpts('', true);
      o.scales.y.beginAtZero = true;
      o.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#22c55e', font: { size: 10 } } };
      return o;
    })(),
  });

  destroyChart('slpTrendChart');
  charts['slpTrendChart'] = new Chart(document.getElementById('slpTrendChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: tr('Total sleep (min)'), data: months.map(m => Math.round(_slpAgg(byMonth.get(m)).asleep)), borderColor: '#FC4C02', backgroundColor: 'rgba(252,76,2,.07)', tension: .35, fill: true, pointRadius: 2 },
        { label: tr('Deep (min)'), data: months.map(m => Math.round(_slpAgg(byMonth.get(m)).deep)), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.06)', tension: .35, fill: true, pointRadius: 2 },
        { label: tr('REM (min)'), data: months.map(m => Math.round(_slpAgg(byMonth.get(m)).rem)), borderColor: '#a78bfa', tension: .35, pointRadius: 2 },
      ],
    },
    options: chartOpts('min', true),
  });

  const last60 = real.slice(-60);
  destroyChart('slpStageChart');
  charts['slpStageChart'] = new Chart(document.getElementById('slpStageChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: last60.map(n => fmtDt(n.date)),
      datasets: [
        { label: tr('Deep'), data: last60.map(n => n.deep), backgroundColor: '#6366f1', stack: 's' },
        { label: tr('REM'), data: last60.map(n => n.rem), backgroundColor: '#a78bfa', stack: 's' },
        { label: tr('Light'), data: last60.map(n => n.light), backgroundColor: '#3f3f6b', stack: 's' },
        { label: tr('Awake'), data: last60.map(n => n.wake), backgroundColor: '#4b5563', stack: 's' },
      ],
    },
    options: (() => {
      const o = chartOpts('min', true);
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
      return o;
    })(),
  });
}

/* ── the findings, written from the numbers actually on screen ── */
function _slpHeadline(worst, dowAgg, aT, aR, real) {
  const cards = [];

  if (worst) {
    const rest = dowAgg.filter(d => d.label !== worst.label);
    const restAvg = _slpMean(rest.map(d => d.asleep));
    const most = dowAgg.slice().sort((a, b) => b.trained - a.trained)[0];
    const clash = most && most.label === worst.label;
    cards.push({
      tone: clash ? 'warn' : 'info',
      title: clash
        ? trf('{0} is your biggest training day and your worst night of sleep', tr(worst.label))
        : trf('{0} is your shortest night of sleep', tr(worst.label)),
      body: clash
        ? trf('You sleep {0} before a {1}, against {2} on every other night — and {1} is also the day you train most ({3} sessions) and longest. You are riding your hardest on your thinnest sleep. Moving the {1} start an hour later, or protecting the Friday bedtime, is the single highest-value change in this whole section.',
            _slpHM(worst.asleep), tr(worst.label), _slpHM(restAvg), worst.trained)
        : trf('You sleep {0} on a {1}, against {2} on every other night.', _slpHM(worst.asleep), tr(worst.label), _slpHM(restAvg)),
    });
  }

  if (aT.n && aR.n) {
    const d = aT.asleep - aR.asleep;
    cards.push({
      tone: 'good',
      title: trf('Training buys you {0} more sleep', _slpHM(Math.abs(d))),
      body: trf('After a training day you sleep {0}; after a rest day, {1}. The extra is not just padding — deep sleep goes up {2} minutes and REM {3} minutes. Rest days are quietly your worst-sleeping days.',
        _slpHM(aT.asleep), _slpHM(aR.asleep), Math.round(aT.deep - aR.deep), Math.round(aT.rem - aR.rem)),
    });
  }

  /* bedtime is the lever with the largest measured effect */
  const withBed = real.filter(n => n.bed != null);
  if (withBed.length > 20) {
    const beds = withBed.map(n => n.bed).sort((a, b) => a - b);
    const med = beds[Math.floor(beds.length / 2)];
    const early = _slpAgg(withBed.filter(n => n.bed <= med));
    const late = _slpAgg(withBed.filter(n => n.bed > med));
    cards.push({
      tone: 'info',
      title: trf('Going to bed before {0} is worth {1} of sleep', _slpClock(med), _slpHM(early.asleep - late.asleep)),
      body: trf('Nights you turn in earlier than {0}: {1} asleep, {2} of deep. Later nights: {3} asleep, {4} of deep. You do not sleep in to make it up — the lost time is simply lost.',
        _slpClock(med), _slpHM(early.asleep), Math.round(early.deep) + 'm', _slpHM(late.asleep), Math.round(late.deep) + 'm'),
    });
  }

  const naps = real.filter(n => n.nap > 0);
  if (naps.length) {
    cards.push({
      tone: 'info',
      title: trf('You nap on {0}% of days, averaging {1} minutes', Math.round(100 * naps.length / real.length), Math.round(_slpMean(naps.map(n => n.nap)))),
      body: trf('Nap days follow a short night: {0} of night sleep against {1} on days you do not nap. The nap is compensation, not a bonus.',
        _slpHM(_slpMean(naps.map(n => n.asleep))), _slpHM(_slpMean(real.filter(n => !n.nap).map(n => n.asleep)))),
    });
  }

  return '<div class="slp-cards">' + cards.map(c => `
    <div class="slp-insight card slp-${c.tone}">
      <div class="slp-insight-t">${c.title}</div>
      <div class="slp-insight-b">${c.body}</div>
    </div>`).join('') + '</div>';
}

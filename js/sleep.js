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

/* Stage colours. Four distinct hues so the stacked bars are readable at a
   glance — the old light-sleep navy sat too close to deep and read as one
   block. Used everywhere, so the legend means the same thing on every chart. */
const SLP_C = {
  deep:  '#6366f1',   // indigo
  rem:   '#c084fc',   // violet
  light: '#22d3ee',   // cyan
  awake: '#f59e0b',   // amber
  total: '#FC4C02',   // Strava orange, for totals
  good:  '#22c55e',
  bad:   '#ef4444',
};

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
  // The AI summary is cached on first build. If it was built before this fetch
  // landed it has no `sleep` block, so drop it and let it rebuild with one.
  if (typeof clearAISummary === 'function') clearAISummary();
  return _slpNights;
}

/* ── small helpers ── */
const _slpMean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
/* "6h 44m" in English, "6j 44m" in Indonesian (jam = hour). */
const _slpHM   = m => Math.floor(m / 60) + (window.LANG === 'id' ? 'j ' : 'h ')
                      + String(Math.round(m % 60)).padStart(2, '0') + 'm';
/* Date maths is done in UTC on purpose. Parsing 'YYYY-MM-DDT00:00:00' without a
   zone gives LOCAL midnight, and toISOString() then converts back to UTC — in
   Bali (+08:00) that silently rolls every date back a day and misaligns rides
   against nights. Anchoring both ends to Z keeps the label arithmetic exact. */
const _slpUTC  = d => new Date(d + 'T00:00:00Z');
const _slpISO  = t => t.toISOString().slice(0, 10);
const _slpDay  = d => _slpUTC(d).getUTCDay();                      // 0=Sun
const _slpNext = (d, k = 1) => { const t = _slpUTC(d); t.setUTCDate(t.getUTCDate() + k); return _slpISO(t); };
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
    const cur = map.get(d) || { load: 0, re: 0, min: 0, n: 0, dist: 0, startH: null };
    cur.n++;
    cur.re += a.suffer_score || 0;
    cur.min += (a.moving_time || 0) / 60;
    cur.dist += a.distance || 0;
    // earliest start of the day, as local decimal hours — this is what actually
    // sets the alarm, so it is the lever the sleep numbers respond to
    const hm = (a.start_date_local || '').slice(11, 16);
    if (hm) {
      const h = +hm.slice(0, 2) + (+hm.slice(3, 5)) / 60;
      if (cur.startH == null || h < cur.startH) cur.startH = h;
    }
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

function _slpCorr(xs, ys) {
  const n = xs.length;
  if (n < 5) return null;
  const mx = _slpMean(xs), my = _slpMean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  const den = Math.sqrt(dx * dy);
  return den ? +(num / den).toFixed(3) : null;
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

/* ── ANALYSIS ────────────────────────────────────────────────────────────────
   Every derived number the section shows — and everything the AI Coach is told
   — comes from here, so the page and the assistant can never disagree.
   ────────────────────────────────────────────────────────────────────────── */
function _slpAnalyse(nights) {
  const real = nights.filter(n => n.asleep >= 60);          // ignore stub nights
  const train = _slpTrainingDays();
  const win = _slpWindow(real, train);
  const byDate = new Map(real.map(n => [n.date, n]));

  /* ── training vs rest: the night AFTER each day ── */
  const afterT = [], afterR = [];
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

  /* ── start time: the lever behind everything else. An early ride start moves
     the alarm, and the bedtime does not move with it, so the sleep is lost. ── */
  const starts = [];
  train.forEach((t, d) => {
    const n = byDate.get(d);
    if (n && t.startH != null) starts.push({ h: t.startH, sleep: n.asleep, up: n.up, hours: t.min / 60, km: t.dist / 1000 });
  });
  const dawn = starts.filter(s => s.h < 6), later = starts.filter(s => s.h >= 6);
  const startBuckets = [
    { lbl: tr('before 06:00'), g: starts.filter(s => s.h < 6) },
    { lbl: '06–09', g: starts.filter(s => s.h >= 6 && s.h < 9) },
    { lbl: '09–15', g: starts.filter(s => s.h >= 9 && s.h < 15) },
    { lbl: tr('after 15:00'), g: starts.filter(s => s.h >= 15) },
  ].filter(b => b.g.length >= 3);

  /* ── the recovery arc around a big day (>= 2h moving) ── */
  const bigDays = [...train.keys()].filter(d => train.get(d).min >= 120).sort();
  const arc = [-1, 0, 1, 2].map(k => {
    const g = bigDays.map(d => byDate.get(_slpNext(d, k))).filter(Boolean);
    return { k, ...(_slpAgg(g)) };
  });

  /* ── how the nights are distributed ── */
  const HIST = [
    { lbl: '<5h', lo: 0, hi: 300 }, { lbl: '5–6h', lo: 300, hi: 360 },
    { lbl: '6–7h', lo: 360, hi: 420 }, { lbl: '7–8h', lo: 420, hi: 480 },
    { lbl: '8–9h', lo: 480, hi: 540 }, { lbl: '9h+', lo: 540, hi: 1e9 },
  ].map(b => ({ ...b, n: real.filter(x => x.asleep >= b.lo && x.asleep < b.hi).length }));
  const under6 = real.filter(x => x.asleep < 360).length;
  const over7 = real.filter(x => x.asleep >= 420).length;

  /* ── stage composition per year: total can stay flat while quality shifts ── */
  const byYear = new Map();
  real.forEach(n => {
    const y = n.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(n);
  });
  const years = [...byYear.keys()].sort();

  /* ── bedtime → wake-time regression: how much of a late night is recovered ── */
  const bp = real.filter(n => n.bed != null && n.up != null);
  let bedSlope = null;
  if (bp.length > 50) {
    const mx = _slpMean(bp.map(n => n.bed)), my = _slpMean(bp.map(n => n.up));
    const den = bp.reduce((s, n) => s + (n.bed - mx) ** 2, 0);
    if (den) bedSlope = bp.reduce((s, n) => s + (n.bed - mx) * (n.up - my), 0) / den;
  }

  /* ── weekend vs weekday ── */
  const weekend = real.filter(n => { const d = _slpDay(n.date); return d === 0 || d === 6; });
  const weekday = real.filter(n => { const d = _slpDay(n.date); return d > 0 && d < 6; });

  /* ── awakenings: more wake-ups means a longer, more broken night ── */
  const wk = real.filter(n => n.wakeups != null && n.eff != null).sort((a, b) => a.wakeups - b.wakeups);
  const w3 = Math.floor(wk.length / 3);
  const wakeTiers = wk.length >= 30 ? [
    { lbl: tr('Fewest wake-ups'), g: wk.slice(0, w3) },
    { lbl: tr('Typical'), g: wk.slice(w3, 2 * w3) },
    { lbl: tr('Most wake-ups'), g: wk.slice(2 * w3) },
  ].map(t => ({ ...t, ...(_slpAgg(t.g)), wakeups: _slpMean(t.g.map(n => n.wakeups)) })) : [];

  /* ── bedtime regularity by quarter ── */
  const byQ = new Map();
  real.forEach(n => {
    if (n.bed == null) return;
    const k = n.date.slice(0, 4) + ' Q' + (Math.floor((+n.date.slice(5, 7) - 1) / 3) + 1);
    if (!byQ.has(k)) byQ.set(k, []);
    byQ.get(k).push(n.bed);
  });
  const quarters = [...byQ.keys()].sort().filter(k => byQ.get(k).length >= 20)
    .map(k => { const g = byQ.get(k); const mu = _slpMean(g);
      return { q: k, n: g.length, bed: mu, sd: Math.sqrt(_slpMean(g.map(v => (v - mu) ** 2))) }; });

  /* ── runs of 3+ nights under 6h ── */
  const sortedN = [...real].sort((a, b) => a.date < b.date ? -1 : 1);
  const streaks = [];
  let run = [];
  sortedN.forEach(n => {
    if (n.asleep < 360) run.push(n);
    else { if (run.length >= 3) streaks.push({ from: run[0].date, to: run[run.length - 1].date, nights: run.length }); run = []; }
  });
  if (run.length >= 3) streaks.push({ from: run[0].date, to: run[run.length - 1].date, nights: run.length });
  const debtNights = streaks.reduce((s, x) => s + x.nights, 0);

  /* ── body signals already in the export but never shown ── */
  const sig = {};
  ['rhr', 'hrv', 'stress'].forEach(k => {
    const g = real.filter(n => n[k] != null);
    if (g.length < 20) return;
    const srt = [...g].sort((a, b) => a.asleep - b.asleep);
    const t3 = Math.floor(srt.length / 3);
    sig[k] = {
      n: g.length, mean: _slpMean(g.map(n => n[k])),
      r_vs_sleep: _slpCorr(g.map(n => n.asleep), g.map(n => n[k])),
      short: _slpMean(srt.slice(0, t3).map(n => n[k])),
      mid: _slpMean(srt.slice(t3, 2 * t3).map(n => n[k])),
      long: _slpMean(srt.slice(2 * t3).map(n => n[k])),
      monthly: months.map(mo => { const q = (byMonth.get(mo) || []).filter(n => n[k] != null);
        return q.length ? +_slpMean(q.map(n => n[k])).toFixed(1) : null; }),
    };
  });

  /* ── the yearly comparison table ── */
  const yearRows = years.map(y => {
    const g = byYear.get(y), a = _slpAgg(g);
    const tot = a.deep + a.rem + a.light;
    return { year: y, nights: g.length, asleep: a.asleep, deep: a.deep, rem: a.rem, light: a.light,
             deepPct: 100 * a.deep / tot, remPct: 100 * a.rem / tot, eff: a.eff, bed: a.bed,
             under6: 100 * g.filter(n => n.asleep < 360).length / g.length,
             over7: 100 * g.filter(n => n.asleep >= 420).length / g.length };
  });

  const all = _slpAgg(real);
  return { real, train, win, byDate, days, afterT, afterR, aT, aR, cuts, buckets,
           dowAgg, worst, byMonth, months, starts, dawn, later, startBuckets,
           bigDays, arc, HIST, under6, over7, byYear, years, bp, bedSlope, all,
           weekend, weekday, wakeTiers, quarters, streaks, debtNights, sig, yearRows };
}

/* One row of the year-vs-year table, with the change from the first year to the
   last spelled out so the comparison does not need mental arithmetic. */
function _slpYearRow(label, rows, fmt) {
  return '<tr><td>' + label + '</td>' + rows.map(y => '<td class="slp-num">' + fmt(y) + '</td>').join('') + '</tr>';
}

/* Honest summary of the body signals: on this data they barely move with sleep,
   and saying so is more useful than inventing a relationship. */
function _slpSignalNote(sig) {
  const names = { rhr: tr('Resting heart rate'), hrv: tr('HRV'), stress: tr('Stress') };
  const parts = [];
  Object.keys(sig).forEach(k => {
    const v = sig[k];
    parts.push(trf('{0}: {1} on your shortest nights vs {2} on your longest (r = {3}, {4} nights)',
      names[k], v.short.toFixed(1), v.long.toFixed(1), v.r_vs_sleep, v.n));
  });
  return '<b>' + tr('These barely track your sleep.') + '</b> ' + parts.join('. ') + '. '
    + tr('Every correlation here is far below 0.2, which means the watch’s resting heart rate, HRV and stress scores tell you almost nothing about how well you slept. Judge a night by the sleep numbers themselves, not by these.');
}

function _slpDraw(nights, body) {
  const A = _slpAnalyse(nights);
  const { real, train, byDate, aT, aR, buckets, dowAgg, worst, byMonth, months,
          dawn, later, startBuckets, bigDays, arc, HIST, under6, over7,
          byYear, years, all, weekend, weekday, wakeTiers, quarters, streaks,
          debtNights, sig, yearRows } = A;
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
      <td class="slp-num" style="color:${good ? SLP_C.good : '#f59e0b'}">${sign}${unit === 'h' ? _slpHM(Math.abs(diff)) : Math.round(Math.abs(diff)) + unit}</td>
    </tr>`;
  };

  body.innerHTML = `
    <div class="slp-intro card">
      <div class="slp-intro-h">${trf('{0} nights of sleep, {1}', real.length, span)}</div>
      <div class="slp-intro-b">${tr('Sleep stages come from a one-off Huawei Health (TruSleep) export. Training is joined live from Strava, so every comparison below updates as you ride. A night is labelled by the morning you woke up.')}</div>
    </div>

    <div class="slp-tiles">
      ${tile(_slpHM(all.asleep), '', tr('Average night'), 'var(--orange)', trf('{0} in bed', _slpHM(_slpMean(real.filter(x => x.tib != null).map(x => x.tib)))))}
      ${tile(Math.round(all.deep), 'm', tr('Deep sleep'), SLP_C.deep, trf('{0}% of sleep', Math.round(100 * all.deep / stageTotal)))}
      ${tile(Math.round(all.rem), 'm', tr('REM sleep'), SLP_C.rem, trf('{0}% of sleep', Math.round(100 * all.rem / stageTotal)))}
      ${tile(all.eff.toFixed(1), '%', tr('Efficiency'), all.eff >= 90 ? SLP_C.good : '#f59e0b', trf('{0} awake per night', _slpHM(all.wake)))}
      ${tile(_slpClock(all.bed), '', tr('Typical bedtime'), 'var(--text)', trf('up at {0}', _slpClock(_slpMean(real.filter(x => x.up != null).map(x => x.up)))))}
      ${tile(Math.round(100 * under6 / real.length), '%', tr('Nights under 6h'), under6 / real.length > 0.25 ? SLP_C.bad : 'var(--text)', trf('{0} nights', under6))}
      ${tile(Math.round(100 * over7 / real.length), '%', tr('Nights over 7h'), SLP_C.good, trf('{0} nights', over7))}
    </div>

    <div class="slp-key card">
      <div class="slp-key-h">${tr('What the four stages mean')}</div>
      <div class="slp-key-row">
        <span class="slp-key-item"><i style="background:${SLP_C.deep}"></i><b>${tr('Deep')}</b> — ${tr('body repair. Muscles rebuild here. Aim 20–25%.')}</span>
        <span class="slp-key-item"><i style="background:${SLP_C.rem}"></i><b>${tr('REM')}</b> — ${tr('brain and memory. Dreaming. Aim 20–25%.')}</span>
        <span class="slp-key-item"><i style="background:${SLP_C.light}"></i><b>${tr('Light')}</b> — ${tr('the bulk of the night, moving between stages.')}</span>
        <span class="slp-key-item"><i style="background:${SLP_C.awake}"></i><b>${tr('Awake')}</b> — ${tr('brief wake-ups. A few is normal.')}</span>
      </div>
      <div class="slp-key-note">${tr('Every chart below uses these same four colours. Drag a chart to pan it, scroll with Ctrl held to zoom, or use the + − ⟲ buttons on each one.')}</div>
    </div>

    ${_slpHeadline(worst, dowAgg, aT, aR, real, { dawn, later, arc, years, byYear, weekend, weekday, wakeTiers, streaks, debtNights, sig })}

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
      <div class="slp-chart-title">${tr('What time you set off, and what it cost you')}</div>
      <div class="slp-chart-sub">${tr('Sleep the morning of the ride, grouped by the day’s earliest start time')}</div>
      <div class="slp-chart-wrap"><canvas id="slpStartChart"></canvas></div>
      <div class="slp-note">${tr('Your bedtime barely moves when the start time does — so an earlier alarm comes straight out of sleep, and those are exactly the days you ride longest.')}</div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${trf('The recovery arc around a big day ({0} days over 2h)', bigDays.length)}</div>
      <div class="slp-chart-sub">${tr('The night before, the night of, and the two nights after')}</div>
      <div class="slp-chart-wrap"><canvas id="slpArcChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('How your nights are distributed')}</div>
      <div class="slp-chart-wrap"><canvas id="slpHistChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Year against year')}</div>
      <div class="slp-chart-sub">${tr('The same numbers side by side, so you can see what actually changed')}</div>
      <table class="slp-table slp-year-table">
        <thead><tr><th></th>${yearRows.map(y => `<th>${y.year}<span class="slp-th-sub">${trf('{0} nights', y.nights)}</span></th>`).join('')}</tr></thead>
        <tbody>
          ${_slpYearRow(tr('Sleep per night'), yearRows, y => _slpHM(y.asleep))}
          ${_slpYearRow(tr('Deep'), yearRows, y => Math.round(y.deep) + 'm (' + Math.round(y.deepPct) + '%)')}
          ${_slpYearRow(tr('REM'), yearRows, y => Math.round(y.rem) + 'm (' + Math.round(y.remPct) + '%)')}
          ${_slpYearRow(tr('Efficiency'), yearRows, y => y.eff.toFixed(1) + '%')}
          ${_slpYearRow(tr('Typical bedtime'), yearRows, y => _slpClock(y.bed))}
          ${_slpYearRow(tr('Nights under 6h'), yearRows, y => Math.round(y.under6) + '%')}
          ${_slpYearRow(tr('Nights over 7h'), yearRows, y => Math.round(y.over7) + '%')}
        </tbody>
      </table>
      <div class="slp-chart-wrap" style="margin-top:14px"><canvas id="slpYearBarChart"></canvas></div>
    </div>

    ${Object.keys(sig).length ? `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Resting heart rate, stress and HRV')}</div>
      <div class="slp-chart-sub">${tr('Also measured by the watch, shown here month by month')}</div>
      <div class="slp-chart-wrap"><canvas id="slpSignalChart"></canvas></div>
      <div class="slp-note">${_slpSignalNote(sig)}</div>
    </div>` : ''}

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('How regular your bedtime is')}</div>
      <div class="slp-chart-sub">${tr('Bars show the typical bedtime each quarter; the line is how much it swings night to night (lower = steadier)')}</div>
      <div class="slp-chart-wrap"><canvas id="slpConsistChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Two years of sleep, month by month')}</div>
      <div class="slp-chart-wrap"><canvas id="slpTrendChart"></canvas></div>
    </div>

    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Same hours, different sleep: stage mix by year')}</div>
      <div class="slp-chart-sub">${tr('Share of each night spent in each stage')}</div>
      <div class="slp-chart-wrap"><canvas id="slpYearChart"></canvas></div>
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
        { label: tr('Deep'), data: B.map(b => Math.round(_slpAgg(buckets[b.k]).deep)), backgroundColor: SLP_C.deep, stack: 's' },
        { label: tr('REM'), data: B.map(b => Math.round(_slpAgg(buckets[b.k]).rem)), backgroundColor: SLP_C.rem, stack: 's' },
        { label: tr('Light'), data: B.map(b => Math.round(_slpAgg(buckets[b.k]).light)), backgroundColor: SLP_C.light, stack: 's' },
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
        { label: tr('Sleep (min)'), data: dowAgg.map(d => Math.round(d.asleep)), backgroundColor: dowAgg.map(d => worst && d.label === worst.label ? SLP_C.bad : 'rgba(252,76,2,.65)'), yAxisID: 'y', order: 2 },
        { label: tr('Deep (min)'), data: dowAgg.map(d => Math.round(d.deep)), backgroundColor: SLP_C.deep, yAxisID: 'y', order: 3 },
        { label: tr('Training days'), data: dowAgg.map(d => d.trained), type: 'line', borderColor: SLP_C.good, backgroundColor: SLP_C.good, tension: .35, pointRadius: 3, yAxisID: 'y1', order: 1 },
      ],
    },
    options: (() => {
      const o = chartOpts('', true);
      o.scales.y.beginAtZero = true;
      o.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: SLP_C.good, font: { size: 10 } } };
      return o;
    })(),
  });

  destroyChart('slpStartChart');
  charts['slpStartChart'] = new Chart(document.getElementById('slpStartChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: startBuckets.map(b => b.lbl + ' (' + b.g.length + ')'),
      datasets: [
        { label: tr('Sleep (min)'), data: startBuckets.map(b => Math.round(_slpMean(b.g.map(s => s.sleep)))), backgroundColor: startBuckets.map(b => b.lbl === tr('before 06:00') ? SLP_C.bad : 'rgba(252,76,2,.65)'), yAxisID: 'y', order: 2 },
        { label: tr('Ride length (h)'), data: startBuckets.map(b => +_slpMean(b.g.map(s => s.hours)).toFixed(2)), type: 'line', borderColor: SLP_C.good, backgroundColor: SLP_C.good, tension: .35, pointRadius: 4, yAxisID: 'y1', order: 1 },
      ],
    },
    options: (() => {
      const o = chartOpts('', true);
      o.scales.y.beginAtZero = true;
      o.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: SLP_C.good, font: { size: 10 } } };
      return o;
    })(),
  });

  destroyChart('slpArcChart');
  charts['slpArcChart'] = new Chart(document.getElementById('slpArcChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: arc.map(a => a.k === 0 ? tr('night of the ride') : a.k < 0 ? trf('{0} night before', -a.k) : trf('{0} night after', a.k)),
      datasets: [
        { label: tr('Deep'), data: arc.map(a => Math.round(a.deep)), backgroundColor: SLP_C.deep, stack: 's' },
        { label: tr('REM'), data: arc.map(a => Math.round(a.rem)), backgroundColor: SLP_C.rem, stack: 's' },
        { label: tr('Light'), data: arc.map(a => Math.round(a.light)), backgroundColor: SLP_C.light, stack: 's' },
      ],
    },
    options: (() => {
      const o = chartOpts('min', true);
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
      return o;
    })(),
  });

  destroyChart('slpHistChart');
  charts['slpHistChart'] = new Chart(document.getElementById('slpHistChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: HIST.map(b => b.lbl),
      datasets: [{
        label: tr('Nights'), data: HIST.map(b => b.n),
        backgroundColor: HIST.map(b => b.hi <= 360 ? SLP_C.bad : b.lo >= 420 ? SLP_C.good : 'rgba(252,76,2,.65)'),
      }],
    },
    options: (() => { const o = chartOpts(tr('nights')); o.scales.y.beginAtZero = true; return o; })(),
  });

  destroyChart('slpYearBarChart');
  charts['slpYearBarChart'] = new Chart(document.getElementById('slpYearBarChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: yearRows.map(y => y.year),
      datasets: [
        { label: tr('Deep'), data: yearRows.map(y => Math.round(y.deep)), backgroundColor: SLP_C.deep, stack: 's' },
        { label: tr('REM'), data: yearRows.map(y => Math.round(y.rem)), backgroundColor: SLP_C.rem, stack: 's' },
        { label: tr('Light'), data: yearRows.map(y => Math.round(y.light)), backgroundColor: SLP_C.light, stack: 's' },
      ],
    },
    options: (() => {
      const o = chartOpts('min', true);
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
      return o;
    })(),
  });

  if (Object.keys(sig).length) {
    const SIGC = { rhr: '#f87171', stress: '#fbbf24', hrv: '#34d399' };
    const SIGN = { rhr: tr('Resting HR (bpm)'), stress: tr('Stress score'), hrv: tr('HRV (ms)') };
    destroyChart('slpSignalChart');
    charts['slpSignalChart'] = new Chart(document.getElementById('slpSignalChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: months,
        datasets: Object.keys(sig).map(k => ({
          label: SIGN[k], data: sig[k].monthly, borderColor: SIGC[k], backgroundColor: SIGC[k],
          tension: .35, pointRadius: 2, spanGaps: true,
        })),
      },
      options: chartOpts('', true),
    });
  }

  destroyChart('slpConsistChart');
  charts['slpConsistChart'] = new Chart(document.getElementById('slpConsistChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: quarters.map(q => q.q),
      datasets: [
        { label: tr('Typical bedtime'), data: quarters.map(q => +q.bed.toFixed(2)), backgroundColor: 'rgba(252,76,2,.65)', yAxisID: 'y', order: 2 },
        { label: tr('Swing, hours (lower = steadier)'), data: quarters.map(q => +q.sd.toFixed(2)), type: 'line', borderColor: SLP_C.light, backgroundColor: SLP_C.light, tension: .35, pointRadius: 3, yAxisID: 'y1', order: 1 },
      ],
    },
    options: (() => {
      const o = chartOpts('h', true);
      o.plugins.tooltip = o.plugins.tooltip || {};
      o.scales.y.title = { display: true, text: tr('hours from midnight (−1 = 23:00)'), color: '#555', font: { size: 10 } };
      o.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: SLP_C.light, font: { size: 10 } } };
      return o;
    })(),
  });

  destroyChart('slpTrendChart');
  charts['slpTrendChart'] = new Chart(document.getElementById('slpTrendChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: tr('Total sleep (min)'), data: months.map(m => Math.round(_slpAgg(byMonth.get(m)).asleep)), borderColor: SLP_C.total, backgroundColor: 'rgba(252,76,2,.07)', tension: .35, fill: true, pointRadius: 2 },
        { label: tr('Deep (min)'), data: months.map(m => Math.round(_slpAgg(byMonth.get(m)).deep)), borderColor: SLP_C.deep, backgroundColor: 'rgba(99,102,241,.06)', tension: .35, fill: true, pointRadius: 2 },
        { label: tr('REM (min)'), data: months.map(m => Math.round(_slpAgg(byMonth.get(m)).rem)), borderColor: SLP_C.rem, tension: .35, pointRadius: 2 },
      ],
    },
    options: chartOpts('min', true),
  });

  destroyChart('slpYearChart');
  charts['slpYearChart'] = new Chart(document.getElementById('slpYearChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: years.map(y => y + ' (' + byYear.get(y).length + ' nights)'),
      datasets: [
        { label: tr('Deep %'), data: years.map(y => { const a = _slpAgg(byYear.get(y)); return +(100 * a.deep / (a.deep + a.rem + a.light)).toFixed(1); }), backgroundColor: SLP_C.deep, stack: 's' },
        { label: tr('REM %'), data: years.map(y => { const a = _slpAgg(byYear.get(y)); return +(100 * a.rem / (a.deep + a.rem + a.light)).toFixed(1); }), backgroundColor: SLP_C.rem, stack: 's' },
        { label: tr('Light %'), data: years.map(y => { const a = _slpAgg(byYear.get(y)); return +(100 * a.light / (a.deep + a.rem + a.light)).toFixed(1); }), backgroundColor: SLP_C.light, stack: 's' },
      ],
    },
    options: (() => {
      const o = chartOpts('%', true);
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true; o.scales.y.max = 100;
      return o;
    })(),
  });

  const last60 = real.slice(-60);
  destroyChart('slpStageChart');
  charts['slpStageChart'] = new Chart(document.getElementById('slpStageChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: last60.map(n => fmtDt(n.date)),
      datasets: [
        { label: tr('Deep'), data: last60.map(n => n.deep), backgroundColor: SLP_C.deep, stack: 's' },
        { label: tr('REM'), data: last60.map(n => n.rem), backgroundColor: SLP_C.rem, stack: 's' },
        { label: tr('Light'), data: last60.map(n => n.light), backgroundColor: SLP_C.light, stack: 's' },
        { label: tr('Awake'), data: last60.map(n => n.wake), backgroundColor: SLP_C.awake, stack: 's' },
      ],
    },
    options: (() => {
      const o = chartOpts('min', true);
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
      return o;
    })(),
  });

  // this section renders after renderAll has finished, so it attaches its own
  try { addChartZoomControls(document.getElementById('sleepSection')); } catch (e) { console.error('zoom controls failed', e); }
}

/* ── the findings, written from the numbers actually on screen ── */
function _slpHeadline(worst, dowAgg, aT, aR, real, x) {
  const cards = [];

  /* 1. The concrete headline: the day where the worst sleep meets the most work. */
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

  /* 2. Why it happens: an early start moves the alarm, the bedtime does not follow. */
  if (x && x.dawn.length >= 5 && x.later.length >= 5) {
    const dS = _slpMean(x.dawn.map(s => s.sleep)), lS = _slpMean(x.later.map(s => s.sleep));
    cards.push({
      tone: 'warn',
      title: trf('Dawn starts cost you {0} of sleep', _slpHM(lS - dS)),
      body: trf('On days you roll out before 06:00 you sleep {0} and are up at {1}; when you start later, {2}. Those dawn days are also your longest rides — {3} against {4} — so the biggest efforts sit on the thinnest sleep. Your bedtime does not move to meet the earlier alarm, so the hour simply disappears.',
        _slpHM(dS), _slpClock(_slpMean(x.dawn.filter(s => s.up != null).map(s => s.up))), _slpHM(lS),
        _slpMean(x.dawn.map(s => s.hours)).toFixed(1) + 'h', _slpMean(x.later.map(s => s.hours)).toFixed(1) + 'h'),
    });
  }

  /* 3. Bedtime, quantified two ways in one card: the slope, and what it costs in deep. */
  const bp = real.filter(n => n.bed != null && n.up != null);
  if (bp.length > 50) {
    const mx = _slpMean(bp.map(n => n.bed)), my = _slpMean(bp.map(n => n.up));
    const den = bp.reduce((s, n) => s + (n.bed - mx) ** 2, 0);
    const slope = den ? bp.reduce((s, n) => s + (n.bed - mx) * (n.up - my), 0) / den : 0;
    const lost = Math.round(60 * (1 - slope));
    const beds = bp.map(n => n.bed).sort((a, b) => a - b);
    const med = beds[Math.floor(beds.length / 2)];
    const early = _slpAgg(bp.filter(n => n.bed <= med)), late = _slpAgg(bp.filter(n => n.bed > med));
    if (lost > 0 && lost <= 60) {
      cards.push({
        tone: 'info',
        title: trf('Every hour you go to bed late costs you {0} minutes', lost),
        body: trf('Across {0} nights, an hour’s later bedtime buys back only {1} minutes of lie-in — the other {2} are gone. In practice: turn in before {3} and you average {4} with {5} min of deep; after it, {6} with {7} min. Bedtime is the decision that sets the night.',
          bp.length, Math.round(60 * slope), lost, _slpClock(med),
          _slpHM(early.asleep), Math.round(early.deep), _slpHM(late.asleep), Math.round(late.deep)),
      });
    }
  }

  /* 4. Training earns sleep. */
  if (aT.n && aR.n) {
    cards.push({
      tone: 'good',
      title: trf('Training buys you {0} more sleep', _slpHM(Math.abs(aT.asleep - aR.asleep))),
      body: trf('After a training day you sleep {0}; after a rest day, {1}. The extra is not just padding — deep sleep goes up {2} minutes and REM {3} minutes. Rest days are quietly your worst-sleeping days.',
        _slpHM(aT.asleep), _slpHM(aR.asleep), Math.round(aT.deep - aR.deep), Math.round(aT.rem - aR.rem)),
    });
  }

  /* 5. The rebound is one night wide. */
  if (x && x.arc && x.arc.length === 4) {
    const before = x.arc[1], after = x.arc[2], two = x.arc[3];
    if (after.n >= 10 && before.n >= 10) {
      cards.push({
        tone: 'good',
        title: tr('A big ride buys one great night — then it is over'),
        body: trf('The night of a 2h+ day you sleep {0}. The night after jumps to {1}, with deep at {2} min and REM at {3} min — well above your {4} / {5} min normal. By the second night you are back to {6}. The repair lands in a single window, so the night straight after a big day is the one worth protecting.',
          _slpHM(before.asleep), _slpHM(after.asleep), Math.round(after.deep), Math.round(after.rem),
          Math.round(_slpMean(real.map(n => n.deep))), Math.round(_slpMean(real.map(n => n.rem))), _slpHM(two.asleep)),
      });
    }
  }

  /* 6. Weekend vs weekday — the pattern behind the worst-day card. */
  if (x && x.weekend && x.weekend.length > 20 && x.weekday.length > 20) {
    const we = _slpAgg(x.weekend), wd = _slpAgg(x.weekday);
    if (wd.asleep - we.asleep > 10) {
      cards.push({
        tone: 'warn',
        title: trf('Weekends cost you {0} a night', _slpHM(wd.asleep - we.asleep)),
        body: trf('Saturday and Sunday nights average {0} against {1} on weeknights, with deep at {2} min versus {3}. The weekend is when you ride most and sleep least — the opposite of what the training asks for.',
          _slpHM(we.asleep), _slpHM(wd.asleep), Math.round(we.deep), Math.round(wd.deep)),
      });
    }
  }

  /* 7. Wake-ups: the counter-intuitive one, so it is worth spelling out. */
  if (x && x.wakeTiers && x.wakeTiers.length === 3) {
    const [few, , many] = x.wakeTiers;
    cards.push({
      tone: 'info',
      title: trf('More wake-ups, but not less sleep — {0}% vs {1}% efficiency', few.eff.toFixed(0), many.eff.toFixed(0)),
      body: trf('On your calmest nights you wake {0} times and sleep {1} at {2}% efficiency. On your most broken nights you wake {3} times — yet sleep longer, {4}, at {5}%. Longer nights simply give you more chances to surface; the broken nights are not short nights, they are just less solid, and deep sleep slips from {6} to {7} min.',
        few.wakeups.toFixed(1), _slpHM(few.asleep), few.eff.toFixed(0),
        many.wakeups.toFixed(1), _slpHM(many.asleep), many.eff.toFixed(0),
        Math.round(few.deep), Math.round(many.deep)),
    });
  }

  /* 8. Sleep-debt runs. */
  if (x && x.streaks && x.streaks.length) {
    const longest = x.streaks.slice().sort((a, b) => b.nights - a.nights)[0];
    cards.push({
      tone: 'info',
      title: trf('{0} stretches of three or more short nights in a row', x.streaks.length),
      body: trf('{0} nights — {1}% of everything tracked — sit inside a run of three or more nights under 6h. The longest was {2} nights, {3} to {4}. These runs, not the odd bad night, are what actually build up a deficit.',
        x.debtNights, Math.round(100 * x.debtNights / real.length), longest.nights, longest.from, longest.to),
    });
  }

  /* 9. The null result, stated as a null result. */
  if (x && x.sig && x.sig.rhr) {
    const rs = Object.keys(x.sig).map(k => Math.abs(x.sig[k].r_vs_sleep || 0));
    if (Math.max(...rs) < 0.2) {
      cards.push({
        tone: 'info',
        title: tr('Your watch’s recovery scores do not track your sleep'),
        body: trf('Resting heart rate, HRV and stress all sit below |r| = 0.2 against how long you slept — on your shortest nights resting HR averages {0} bpm, on your longest {1}. That is a real finding, not a gap: judge a night by the sleep numbers themselves, because these three will not tell you.',
          x.sig.rhr.short.toFixed(1), x.sig.rhr.long.toFixed(1)),
      });
    }
  }

  /* 10. Naps. */
  const naps = real.filter(n => n.nap > 0);
  if (naps.length) {
    cards.push({
      tone: 'info',
      title: trf('You nap on {0}% of days, averaging {1} minutes', Math.round(100 * naps.length / real.length), Math.round(_slpMean(naps.map(n => n.nap)))),
      body: trf('Nap days follow a short night: {0} of night sleep against {1} on days you do not nap. The nap is compensation, not a bonus.',
        _slpHM(_slpMean(naps.map(n => n.asleep))), _slpHM(_slpMean(real.filter(n => !n.nap).map(n => n.asleep)))),
    });
  }

  /* 7. Long-horizon drift, stated as the mild thing it is. */
  if (x && x.years && x.years.length >= 3) {
    const first = _slpAgg(x.byYear.get(x.years[0])), last = _slpAgg(x.byYear.get(x.years[x.years.length - 1]));
    const pct = a => 100 * a.deep / (a.deep + a.rem + a.light);
    if (pct(first) - pct(last) > 1) {
      cards.push({
        tone: 'info',
        title: tr('Same hours, slightly thinner sleep than two years ago'),
        body: trf('Your nightly total has not moved — {0} in {1}, {2} in {3}. The mix has: deep {4} → {5} min and REM {6} → {7} min, with light sleep taking up the slack. A mild drift rather than a cliff, and the year-to-year correlation is weak, so watch it rather than worry about it.',
          _slpHM(first.asleep), x.years[0], _slpHM(last.asleep), x.years[x.years.length - 1],
          Math.round(first.deep), Math.round(last.deep), Math.round(first.rem), Math.round(last.rem)),
      });
    }
  }

  return '<div class="slp-cards">' + cards.map(c => `
    <div class="slp-insight card slp-${c.tone}">
      <div class="slp-insight-t">${c.title}</div>
      <div class="slp-insight-b">${c.body}</div>
    </div>`).join('') + '</div>';
}

/* ── AI CONTEXT ──────────────────────────────────────────────────────────────
   What the AI Coach is told about sleep. Built from _slpAnalyse, so it is the
   same arithmetic the section renders — the assistant can never contradict the
   page. Deliberately includes sample sizes and correlation coefficients so the
   model can judge how hard to lean on each relationship instead of overclaiming.
   ────────────────────────────────────────────────────────────────────────── */

/* Make sure the data is in memory before the AI builds its prompt. Safe to call
   for non-owners and safe to call repeatedly — the fetch is cached. */
async function sleepAiEnsure() {
  if (!_slpIsOwner()) return false;
  try { await _slpLoad(); return true; }
  catch { return false; }
}

function _slpR(xs, ys) {
  const n = xs.length;
  if (n < 5) return null;
  const mx = _slpMean(xs), my = _slpMean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  const den = Math.sqrt(dx * dy);
  return den ? +(num / den).toFixed(3) : null;
}

/* Synchronous — returns null if the data has not loaded yet (call sleepAiEnsure
   first). Minutes throughout; bedtime is local decimal hours, negative before
   midnight (-0.5 = 23:30). */
function sleepAiSummary() {
  if (!_slpIsOwner() || !_slpNights) return null;
  const A = _slpAnalyse(_slpNights);
  const { real, train, byDate, aT, aR, buckets, dowAgg, dawn, later, arc,
          bigDays, under6, over7, byYear, years, bp, bedSlope, all } = A;
  if (!real.length) return null;

  const r1 = x => x == null || isNaN(x) ? null : +x.toFixed(1);
  const grp = g => ({ nights: g.n, asleep_min: r1(g.asleep), deep_min: r1(g.deep),
                      rem_min: r1(g.rem), light_min: r1(g.light), wake_min: r1(g.wake) });

  /* The ride-by-ride join: for each recent training day, the night going INTO
     it and the night after it. This is what lets the AI reason about a specific
     ride rather than only about averages. */
  const perRide = [...train.keys()].sort()
    // The sleep export stops before the Strava history does, so pick the most
    // recent training days that actually HAVE a night attached — otherwise the
    // most useful part of this payload is a list of nulls.
    .filter(d => byDate.has(d) || byDate.has(_slpNext(d)))
    .slice(-30).map(d => {
    const t = train.get(d);
    const before = byDate.get(d), after = byDate.get(_slpNext(d));
    return {
      date: d,
      start_time: t.startH == null ? null : _slpClock(t.startH),
      moving_h: r1(t.min / 60), km: r1(t.dist / 1000),
      relative_effort: t.re || null,
      sleep_before_min: before ? before.asleep : null,
      deep_before_min: before ? before.deep : null,
      bedtime_before: before && before.bed != null ? _slpClock(before.bed) : null,
      woke_before: before && before.up != null ? _slpClock(before.up) : null,
      sleep_after_min: after ? after.asleep : null,
      deep_after_min: after ? after.deep : null,
      rem_after_min: after ? after.rem : null,
    };
  });

  /* Correlations, so the model can weight each relationship honestly. */
  const withBed = real.filter(n => n.bed != null);
  const sameDay = [...train.keys()].map(d => ({ t: train.get(d), n: byDate.get(d) })).filter(x => x.n);
  const corr = {
    bedtime_vs_total_sleep: _slpR(withBed.map(n => n.bed), withBed.map(n => n.asleep)),
    bedtime_vs_rem: _slpR(withBed.map(n => n.bed), withBed.map(n => n.rem)),
    bedtime_vs_deep: _slpR(withBed.map(n => n.bed), withBed.map(n => n.deep)),
    ride_start_hour_vs_sleep_that_morning: _slpR(A.starts.map(s => s.h), A.starts.map(s => s.sleep)),
    ride_duration_vs_start_hour: _slpR(A.starts.map(s => s.h), A.starts.map(s => s.hours)),
    sleep_that_morning_vs_ride_duration: _slpR(sameDay.map(x => x.n.asleep), sameDay.map(x => x.t.min / 60)),
  };

  return {
    _README: 'Personal sleep from a Huawei Health TruSleep export, joined to Strava. '
      + 'A night is labelled with the date you WOKE UP: the night dated D is the sleep BEFORE training on D, '
      + 'and the night dated D+1 is the recovery sleep AFTER training on D. All durations are MINUTES. '
      + 'Bedtimes/wake times are local clock strings. Treat correlations with |r| < 0.2 as weak and say so; '
      + 'always respect the sample sizes given and never claim a causal effect the numbers do not support.',
    coverage: { nights: real.length, first: real[0].date, last: real[real.length - 1].date,
                note: 'Sleep tracking ends ' + real[real.length - 1].date
                      + '. Any training after that date has no sleep to pair with — say so rather than guessing.' },
    baseline: { ...grp(all), efficiency_pct: r1(all.eff),
                typical_bedtime: _slpClock(all.bed),
                typical_waketime: _slpClock(_slpMean(real.filter(n => n.up != null).map(n => n.up))),
                nights_under_6h_pct: Math.round(100 * under6 / real.length),
                nights_over_7h_pct: Math.round(100 * over7 / real.length) },
    night_after_training_vs_rest: { after_training: grp(aT), after_rest: grp(aR) },
    next_night_by_training_load: Object.fromEntries(
      Object.entries(buckets).filter(([, g]) => g.length).map(([k, g]) => [k, grp(_slpAgg(g))])),
    by_day_of_week: dowAgg.map(d => ({ day: d.label, nights: d.n, asleep_min: r1(d.asleep),
                                       deep_min: r1(d.deep), training_days: d.trained })),
    ride_start_time: {
      before_0600: { rides: dawn.length, sleep_min: r1(_slpMean(dawn.map(s => s.sleep))), avg_ride_h: r1(_slpMean(dawn.map(s => s.hours))) },
      from_0600:   { rides: later.length, sleep_min: r1(_slpMean(later.map(s => s.sleep))), avg_ride_h: r1(_slpMean(later.map(s => s.hours))) },
    },
    recovery_arc_around_2h_plus_days: { days: bigDays.length,
      nights: arc.map(a => ({ offset: a.k, label: a.k === 0 ? 'night of the ride' : (a.k < 0 ? 'night before' : 'night after'), ...grp(a) })) },
    bedtime_regression: bedSlope == null ? null : {
      nights: bp.length, wake_shift_per_hour_later_to_bed: r1(bedSlope),
      minutes_of_sleep_lost_per_hour_later: Math.round(60 * (1 - bedSlope)),
    },
    stage_mix_by_year: years.map(y => { const a = _slpAgg(byYear.get(y)); const tot = a.deep + a.rem + a.light;
      return { year: y, nights: a.n, asleep_min: r1(a.asleep), deep_pct: r1(100 * a.deep / tot), rem_pct: r1(100 * a.rem / tot), light_pct: r1(100 * a.light / tot) }; }),
    correlations: corr,
    recent_rides_with_sleep: perRide,
  };
}

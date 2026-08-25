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

/* Weekday names, module scope because the records and stress code need the
   same ordering the day-of-week chart uses. */
const _SLP_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

/* ── RECORDS ─────────────────────────────────────────────────────────────────
   The one part of this section that points at a specific date rather than an
   average, so every record carries what you actually did that day.
   ────────────────────────────────────────────────────────────────────────── */
function _slpRecords(real, train, byDate, byMonth) {
  if (!real.length) return null;
  const top = (g, f) => g.length ? g.reduce((b, n) => f(n) > f(b) ? n : b) : null;
  const bot = (g, f) => g.length ? g.reduce((b, n) => f(n) < f(b) ? n : b) : null;
  const has = (g, k) => g.filter(n => n[k] != null);
  /* Efficiency and wake-count records only mean anything on a night of real
     length — a 4h night that happened to be unbroken is not your best night. */
  const solid = real.filter(n => n.asleep >= 300);

  /* What preceded the night, so a record reads as an event and not a number. */
  const ctx = n => {
    const prev = train.get(_slpNext(n.date, -1));
    const bits = [];
    if (n.bed != null) bits.push(trf('to bed {0}', _slpClock(n.bed)));
    bits.push(prev ? trf('after {0}h riding', (prev.min / 60).toFixed(1)) : tr('after a rest day'));
    return bits.join(' · ');
  };

  const nights = [
    { lbl: tr('Longest night'),    n: top(real, n => n.asleep),             v: n => _slpHM(n.asleep),         c: SLP_C.total },
    { lbl: tr('Most deep sleep'),  n: top(real, n => n.deep),               v: n => Math.round(n.deep) + 'm', c: SLP_C.deep },
    { lbl: tr('Most REM'),         n: top(real, n => n.rem),                v: n => Math.round(n.rem) + 'm',  c: SLP_C.rem },
    { lbl: tr('Best efficiency'),  n: top(has(solid, 'eff'), n => n.eff),   v: n => n.eff.toFixed(1) + '%',   c: SLP_C.good },
    { lbl: tr('Least time awake'), n: bot(has(solid, 'wake'), n => n.wake), v: n => Math.round(n.wake) + 'm', c: SLP_C.good },
    { lbl: tr('Earliest to bed'),  n: bot(has(real, 'bed'), n => n.bed),    v: n => _slpClock(n.bed),         c: 'var(--text)' },
    { lbl: tr('Shortest night'),   n: bot(real, n => n.asleep),             v: n => _slpHM(n.asleep),         c: SLP_C.bad },
  ].filter(r => r.n)
   .map(r => ({ lbl: r.lbl, c: r.c, date: r.n.date, value: r.v(r.n), ctx: ctx(r.n) }));

  /* Rolling 7-night windows, counted only where all seven nights were actually
     tracked — a window with gaps in it would flatter or punish unfairly. */
  const span = _slpRange(real[0].date, real[real.length - 1].date);
  let bestWeek = null, worstWeek = null;
  for (let i = 0; i + 6 < span.length; i++) {
    const g = span.slice(i, i + 7).map(d => byDate.get(d));
    if (g.some(x => !x)) continue;
    const w = { from: span[i], to: span[i + 6], ...(_slpAgg(g)) };
    if (!bestWeek || w.asleep > bestWeek.asleep) bestWeek = w;
    if (!worstWeek || w.asleep < worstWeek.asleep) worstWeek = w;
  }

  /* Longest run of consecutive nights at 7h or more. */
  let goodRun = null, run = [];
  span.forEach(d => {
    const n = byDate.get(d);
    if (n && n.asleep >= 420) {
      run.push(n);
      if (!goodRun || run.length > goodRun.nights) goodRun = { nights: run.length, from: run[0].date, to: d };
    } else run = [];
  });

  /* The monthly ledger. A month needs 15 tracked nights before its average is
     worth ranking against a full one. */
  const months = [...byMonth.keys()].sort().map(m => {
    const g = byMonth.get(m), a = _slpAgg(g);
    return { month: m, nights: g.length, ...a,
             best: top(g, n => n.asleep), worst: bot(g, n => n.asleep),
             under6: g.filter(n => n.asleep < 360).length,
             over7: g.filter(n => n.asleep >= 420).length,
             full: g.length >= 15 };
  });
  const ranked = months.filter(m => m.full).sort((a, b) => b.asleep - a.asleep);
  const bestMonth = ranked[0] || null, worstMonth = ranked[ranked.length - 1] || null;

  /* Your best nights against your worst: the "recipe" comparison. What actually
     separates them is the question every average elsewhere cannot answer. */
  const srt = [...real].sort((a, b) => b.asleep - a.asleep);
  const k = Math.min(Math.max(10, Math.round(real.length * 0.1)), Math.floor(real.length / 2));
  const tier = g => {
    const a = _slpAgg(g);
    const trained = g.filter(n => train.has(_slpNext(n.date, -1))).length;
    const dowN = [0, 0, 0, 0, 0, 0, 0];
    g.forEach(n => dowN[_slpDay(n.date)]++);
    const pk = dowN.indexOf(Math.max(...dowN));
    return { ...a, n: g.length,
             up: _slpMean(g.filter(n => n.up != null).map(n => n.up)),
             wakeups: _slpMean(g.filter(n => n.wakeups != null).map(n => n.wakeups)),
             nap: _slpMean(g.map(n => n.nap || 0)),
             trainedPct: 100 * trained / g.length,
             dow: _SLP_DOW[pk], dowN: dowN[pk] };
  };

  return { nights, bestWeek, worstWeek, goodRun, months, bestMonth, worstMonth,
           bestTier: tier(srt.slice(0, k)), worstTier: tier(srt.slice(-k)), tierSize: k };
}

/* ── HEALTH RISK ─────────────────────────────────────────────────────────────
   Your own numbers read against ordinary adult sleep guidance, plus what the
   sleep-epidemiology literature associates with each pattern. These are
   population-level associations, not a diagnosis, and the disclaimer renders
   with the card rather than being optional. The four scored components are the
   ones with the most consistent evidence behind them: how long you sleep, how
   regular the timing is, how solid the night is, and how the stages divide up.
   ────────────────────────────────────────────────────────────────────────── */
function _slpRisk(real, all, sig, allDays) {
  if (real.length < 60) return null;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const band = (v, zero, full) => clamp(100 * (v - zero) / (full - zero), 0, 100);

  /* Regularity is measured on the sleep MIDPOINT rather than bedtime — it is
     what the mortality studies use, and it catches a steady bedtime paired with
     a wildly varying wake time, which a bedtime spread alone would miss. */
  const mids = real.filter(n => n.bed != null && n.up != null).map(n => n.bed + (n.up - n.bed) / 2);
  const midMu = _slpMean(mids);
  const midSD = mids.length > 30 ? Math.sqrt(_slpMean(mids.map(v => (v - midMu) ** 2))) : null;

  const shortPct = 100 * real.filter(n => n.asleep < 360).length / real.length;
  const longPct  = 100 * real.filter(n => n.asleep > 540).length / real.length;
  const stageTot = all.deep + all.rem + all.light;
  const deepPct = 100 * all.deep / stageTot, remPct = 100 * all.rem / stageTot;

  const comp = [
    /* Half the mark for the average, half for how often you fall short — an
       average alone hides a third of the nights being under 6h. */
    { k: 'duration', w: 0.40, lbl: tr('How long you sleep'),
      score: 0.5 * band(all.asleep, 300, 420) + 0.5 * band(shortPct, 40, 5),
      read: trf('{0} a night on average, and {1}% of nights fall under 6h.', _slpHM(all.asleep), Math.round(shortPct)),
      ev: tr('Adults who habitually sleep under 6–7h show higher rates of cardiovascular disease, type 2 diabetes and all-cause mortality across large cohort studies. The usual guideline band is 7–9h.') },
    { k: 'regularity', w: 0.25, lbl: tr('How regular the timing is'),
      score: midSD == null ? null : band(midSD, 2, 0.5),
      read: midSD == null ? tr('Not enough bedtime and wake-time data to score.')
            : trf('Your sleep midpoint sits around {0} and swings ±{1} minutes night to night.', _slpClock(midMu), Math.round(midSD * 60)),
      ev: tr('Irregular sleep timing predicts cardiometabolic risk and mortality about as strongly as short duration does, and independently of it — a steady schedule counts on its own.') },
    { k: 'efficiency', w: 0.20, lbl: tr('How solid the night is'),
      score: (all.eff == null || isNaN(all.eff)) ? null : band(all.eff, 70, 90),
      read: trf('{0}% efficiency — {1} of every night is spent awake in bed.', all.eff.toFixed(1), _slpHM(all.wake)),
      ev: tr('Fragmented, low-efficiency sleep is associated with higher blood pressure and poorer glucose control, separately from how many hours you log.') },
    { k: 'stages', w: 0.15, lbl: tr('How the stages divide up'),
      score: clamp(100 - 4 * (Math.abs(deepPct - 20) + Math.abs(remPct - 20)), 0, 100),
      read: trf('{0}% deep and {1}% REM, against a rough 20% target for each.', deepPct.toFixed(1), remPct.toFixed(1)),
      ev: tr('Deep sleep is when physical repair and growth-hormone release happen; REM is when memory consolidates. A wrist tracker estimates these rather than measuring them, so read the trend and not the decimal.') },
  ];

  const scored = comp.filter(c => c.score != null);
  const wsum = scored.reduce((s, c) => s + c.w, 0);
  const score = Math.round(scored.reduce((s, c) => s + c.score * c.w, 0) / wsum);
  const grade = score >= 80 ? { k: 'good',  lbl: tr('Strong') }
              : score >= 65 ? { k: 'ok',    lbl: tr('Reasonable') }
              : score >= 50 ? { k: 'watch', lbl: tr('Worth attention') }
                            : { k: 'poor',  lbl: tr('A real weak spot') };

  /* Named flags, each tied to a number that appears elsewhere on this page. */
  const flags = [];
  if (shortPct >= 25) flags.push({ tone: 'warn', t: trf('{0}% of your nights are under 6h', Math.round(shortPct)),
    b: tr('This is the pattern with the most consistent evidence behind it. Short sleep as a habit — not the occasional bad night — is what the cardiovascular and metabolic risk associations are built on.') });
  else if (shortPct >= 12) flags.push({ tone: 'info', t: trf('{0}% of your nights are under 6h', Math.round(shortPct)),
    b: tr('Not a habit, but not rare either. These nights cluster into runs, and it is the runs that accumulate.') });
  else flags.push({ tone: 'good', t: trf('Only {0}% of your nights drop under 6h', Math.round(shortPct)),
    b: tr('Short nights are the exception for you rather than the pattern, which is the part that matters most for long-term risk.') });

  if (midSD != null && midSD > 1) flags.push({ tone: 'warn', t: trf('Your sleep timing swings ±{0} minutes', Math.round(midSD * 60)),
    b: tr('A midpoint that moves by more than an hour night to night is the profile linked to raised cardiometabolic risk independently of duration. Anchoring the wake time is usually easier than anchoring the bedtime.') });
  else if (midSD != null) flags.push({ tone: 'good', t: trf('Your sleep timing is steady, ±{0} minutes', Math.round(midSD * 60)),
    b: tr('A consistent midpoint is protective on its own, and it is the cheapest of these four to hold on to.') });

  if (all.eff >= 88) flags.push({ tone: 'good', t: trf('Efficiency sits at {0}%', all.eff.toFixed(1)),
    b: tr('Above the 85% mark usually treated as healthy. When you are asleep you stay asleep — your weak spot is how long you are in bed, not how well you use it.') });
  else flags.push({ tone: 'info', t: trf('Efficiency sits at {0}%', all.eff.toFixed(1)),
    b: trf('You lose about {0} a night to lying awake. Below roughly 85% is where fragmentation starts being associated with higher blood pressure.', _slpHM(all.wake)) });

  if (longPct >= 10) flags.push({ tone: 'info', t: trf('{0}% of nights run past 9h', Math.round(longPct)),
    b: tr('Long sleep carries risk associations too, though these are widely read as illness causing the long sleep rather than the reverse. Worth noticing, not worth worrying about on its own.') });

  /* SpO2 is the one genuinely clinical signal in the export: a nightly minimum
     that keeps dipping into the low 90s is the standard screening flag for
     sleep-disordered breathing, which is exactly the kind of thing worth taking
     to a doctor rather than to a dashboard. */
  const sp = allDays.filter(d => d.spo2 != null && d.spo2min != null);
  if (sp.length >= 30) {
    const avg = _slpMean(sp.map(d => d.spo2));
    const lowNights = sp.filter(d => d.spo2min < 90).length;
    const lowPct = 100 * lowNights / sp.length;
    flags.push(lowPct >= 20
      ? { tone: 'warn', t: trf('Blood oxygen dips below 90% on {0}% of measured nights', Math.round(lowPct)),
          b: trf('Your average SpO2 is {0}%, which is normal, but the nightly minimum falls under 90% on {1} of {2} nights. Repeated overnight desaturation is the usual screening signal for sleep-disordered breathing. This is the one number here worth mentioning to a doctor rather than acting on yourself.', avg.toFixed(1), lowNights, sp.length) }
      : { tone: 'good', t: trf('Blood oxygen averages {0}%', avg.toFixed(1)),
          b: trf('The nightly minimum drops below 90% on only {0}% of measured nights, so there is no persistent desaturation pattern in this data.', Math.round(lowPct)) });
  }

  if (sig && sig.rhr) flags.push({ tone: 'info', t: trf('Resting heart rate averages {0} bpm', sig.rhr.mean.toFixed(0)),
    b: trf('For context rather than scoring: it barely moves with your sleep (r = {0}), so it does no work in the number above. Its long-run trend is still the most useful single cardiovascular marker your watch records.', sig.rhr.r_vs_sleep) });

  return { score, grade, comp, flags, shortPct, longPct, midSD, midMu, deepPct, remPct,
           spo2: sp.length >= 30 ? { n: sp.length, avg: _slpMean(sp.map(d => d.spo2)),
                                     lowPct: 100 * sp.filter(d => d.spo2min < 90).length / sp.length } : null };
}

/* ── HEALTHIEST YEAR ─────────────────────────────────────────────────────────
   Scores each calendar year against the others on the metrics the watch tracked
   all the way through. Everything is normalised across YOUR years only, so 100
   means "your best year on this measure", not "healthy in absolute terms".
   Ride volume is deliberately excluded: Strava only hands back the most recent
   activities, so the earlier years would look artificially quiet.
   ────────────────────────────────────────────────────────────────────────── */
function _slpYearHealth(years, byYear, allDays) {
  if (years.length < 2) return null;

  const rows = years.map(y => {
    const g = byYear.get(y);
    const days = allDays.filter(d => d.date.slice(0, 4) === y);
    const a = _slpAgg(g);
    const mids = g.filter(n => n.bed != null && n.up != null).map(n => n.bed + (n.up - n.bed) / 2);
    const mu = _slpMean(mids);
    const pick = k => { const q = days.filter(d => d[k] != null); return q.length >= 20 ? _slpMean(q.map(d => d[k])) : null; };
    const tot = a.deep + a.rem + a.light;
    return {
      year: y, nights: g.length, days: days.length,
      asleep: a.asleep, deep: a.deep, rem: a.rem, eff: a.eff,
      deepPct: 100 * a.deep / tot,
      reg: mids.length > 20 ? Math.sqrt(_slpMean(mids.map(v => (v - mu) ** 2))) : null,
      under6: 100 * g.filter(n => n.asleep < 360).length / g.length,
      rhr: pick('rhr'), hrv: pick('hrv'), stress: pick('stress'), spo2: pick('spo2'),
      steps: pick('steps'), cal: pick('cal'), active: pick('active'),
    };
  });

  /* dir +1 = higher is healthier, −1 = lower is healthier */
  const METRICS = [
    { k: 'asleep', w: 0.22, dir:  1, lbl: tr('Sleep per night') },
    { k: 'reg',    w: 0.15, dir: -1, lbl: tr('Timing regularity') },
    { k: 'under6', w: 0.10, dir: -1, lbl: tr('Short nights') },
    { k: 'eff',    w: 0.12, dir:  1, lbl: tr('Efficiency') },
    { k: 'deepPct',w: 0.08, dir:  1, lbl: tr('Deep sleep share') },
    { k: 'rhr',    w: 0.13, dir: -1, lbl: tr('Resting heart rate') },
    { k: 'hrv',    w: 0.08, dir:  1, lbl: tr('HRV') },
    { k: 'stress', w: 0.07, dir: -1, lbl: tr('Stress') },
    { k: 'steps',  w: 0.05, dir:  1, lbl: tr('Daily steps') },
  ].filter(m => rows.every(r => r[m.k] != null && !isNaN(r[m.k])));

  if (!METRICS.length) return null;
  const wsum = METRICS.reduce((s, m) => s + m.w, 0);

  /* Min–max across the years present. With a flat metric every year scores 50,
     so a metric that never moved cannot decide the ranking. */
  METRICS.forEach(m => {
    const vals = rows.map(r => r[m.k]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    rows.forEach(r => {
      const norm = hi === lo ? 50 : 100 * (r[m.k] - lo) / (hi - lo);
      r['_' + m.k] = m.dir > 0 ? norm : 100 - norm;
    });
  });
  rows.forEach(r => { r.score = Math.round(METRICS.reduce((s, m) => s + r['_' + m.k] * m.w, 0) / wsum); });

  const ranked = [...rows].sort((a, b) => b.score - a.score);
  const winner = ranked[0], loser = ranked[ranked.length - 1];
  /* What actually decided it, biggest weighted gap first. */
  const drivers = METRICS.map(m => ({ ...m, gap: (winner['_' + m.k] - loser['_' + m.k]) * m.w,
                                      wv: winner[m.k], lv: loser[m.k] }))
    .filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3);

  return { rows, ranked, winner, loser, metrics: METRICS, drivers };
}

/* ── DAILY STRESS ────────────────────────────────────────────────────────────
   The watch samples a stress score through the day; the export keeps the day's
   mean, min, max and how many samples it took. Huawei shows you the day. The
   point of doing it here is everything the app cannot join it to: last night's
   sleep, and yesterday's ride.
   ────────────────────────────────────────────────────────────────────────── */
function _slpStressAnalysis(allDays, train, byDate) {
  const g = allDays.filter(d => d.stress != null);
  if (g.length < 40) return null;

  const mean = _slpMean(g.map(d => d.stress));
  const withSpread = g.filter(d => d.smin != null && d.smax != null);

  /* Huawei's bands describe an instantaneous reading, so applying them to a
     day's MEAN buries 97% of days in one bucket and says nothing. Band the
     day's PEAK instead — "how high did it get today" is the question the bands
     were built to answer. */
  const peak = g.filter(d => d.smax != null);
  const BANDS = [
    { lbl: tr('Relaxed'),  lo: 0,  hi: 30,  c: '#22c55e' },
    { lbl: tr('Normal'),   lo: 30, hi: 60,  c: '#84cc16' },
    { lbl: tr('Medium'),   lo: 60, hi: 80,  c: '#f59e0b' },
    { lbl: tr('High'),     lo: 80, hi: 101, c: '#ef4444' },
  ].map(b => ({ ...b, n: peak.filter(d => d.smax >= b.lo && d.smax < b.hi).length }));
  const peakN = peak.length;

  /* by day of week */
  const dow = _SLP_DOW.map(() => []);
  g.forEach(d => dow[_slpDay(d.date)].push(d.stress));
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const byDow = ORDER.map(i => ({ label: _SLP_DOW[i], n: dow[i].length, stress: _slpMean(dow[i]) }))
    .filter(x => x.n >= 3);

  /* training vs rest, same day */
  const onRide = g.filter(d => train.has(d.date)), onRest = g.filter(d => !train.has(d.date));
  /* the day AFTER a ride — the recovery-cost view Huawei cannot produce */
  const afterRide = g.filter(d => train.has(_slpNext(d.date, -1)));
  const afterRest = g.filter(d => !train.has(_slpNext(d.date, -1)));

  /* how last night's sleep lands on today's stress, and vice versa */
  const sleepToday = g.filter(d => byDate.has(d.date) && byDate.get(d.date).asleep >= 60);
  const rStressVsSleep = _slpCorr(sleepToday.map(d => byDate.get(d.date).asleep), sleepToday.map(d => d.stress));
  const nextNight = g.map(d => ({ s: d.stress, n: byDate.get(_slpNext(d.date)) })).filter(x => x.n && x.n.asleep >= 60);
  const rStressVsNextSleep = _slpCorr(nextNight.map(x => x.s), nextNight.map(x => x.n.asleep));

  /* stress tiers against the night that followed */
  const srt = [...nextNight].sort((a, b) => a.s - b.s);
  const t3 = Math.floor(srt.length / 3);
  const tiers = srt.length >= 30 ? [
    { lbl: tr('Calmest days'), g: srt.slice(0, t3) },
    { lbl: tr('Typical'), g: srt.slice(t3, 2 * t3) },
    { lbl: tr('Most stressed days'), g: srt.slice(2 * t3) },
  ].map(t => ({ lbl: t.lbl, n: t.g.length, stress: _slpMean(t.g.map(x => x.s)),
                asleep: _slpMean(t.g.map(x => x.n.asleep)), deep: _slpMean(t.g.map(x => x.n.deep)) })) : [];

  /* monthly band */
  const byMo = new Map();
  g.forEach(d => { const m = d.date.slice(0, 7); if (!byMo.has(m)) byMo.set(m, []); byMo.get(m).push(d); });
  const months = [...byMo.keys()].sort();
  const monthly = months.map(m => {
    const q = byMo.get(m);
    return { m, n: q.length, mean: _slpMean(q.map(d => d.stress)),
             min: _slpMean(q.filter(d => d.smin != null).map(d => d.smin)),
             max: _slpMean(q.filter(d => d.smax != null).map(d => d.smax)) };
  });

  const hi = g.reduce((b, d) => d.stress > b.stress ? d : b);
  const lo = g.reduce((b, d) => d.stress < b.stress ? d : b);

  return { n: g.length, mean, bands: BANDS, peakN, byDow, monthly, months, tiers, hi, lo,
           spread: withSpread.length ? { min: _slpMean(withSpread.map(d => d.smin)),
                                         max: _slpMean(withSpread.map(d => d.smax)),
                                         cnt: _slpMean(withSpread.filter(d => d.scnt != null).map(d => d.scnt)) } : null,
           onRide: { n: onRide.length, stress: _slpMean(onRide.map(d => d.stress)) },
           onRest: { n: onRest.length, stress: _slpMean(onRest.map(d => d.stress)) },
           afterRide: { n: afterRide.length, stress: _slpMean(afterRide.map(d => d.stress)) },
           afterRest: { n: afterRest.length, stress: _slpMean(afterRest.map(d => d.stress)) },
           rStressVsSleep, rStressVsNextSleep };
}

/* ── ENERGY: CALORIES, STEPS, MOVEMENT ───────────────────────────────────────
   Straight from the watch's daily totals. Calories here are the ACTIVE burn the
   watch counted (it stores them in thousandths of a kcal), not a total daily
   expenditure — there is no height or age in the export to build a BMR from, so
   claiming a full TDEE would be inventing a number.
   ────────────────────────────────────────────────────────────────────────── */
function _slpEnergy(allDays, train) {
  const g = allDays.filter(d => d.cal != null && d.steps != null);
  if (g.length < 40) return null;

  const ride = g.filter(d => train.has(d.date)), rest = g.filter(d => !train.has(d.date));
  const sum = (a, k) => a.reduce((s, d) => s + (d[k] || 0), 0);

  const byMo = new Map();
  g.forEach(d => { const m = d.date.slice(0, 7); if (!byMo.has(m)) byMo.set(m, []); byMo.get(m).push(d); });
  const months = [...byMo.keys()].sort();
  const monthly = months.map(m => {
    const q = byMo.get(m);
    return { m, n: q.length, cal: _slpMean(q.map(d => d.cal)), steps: _slpMean(q.map(d => d.steps)),
             active: _slpMean(q.filter(d => d.active != null).map(d => d.active)) };
  });

  /* Two independent measurements of the same rides: the watch's calorie count
     against the mechanical work your power meter recorded, on days that have
     both. Cycling's ~22–25% gross efficiency is why kJ of work and kcal burned
     come out near 1:1, which makes this a genuine cross-check rather than a
     unit conversion. */
  let cross = null;
  if (typeof acts !== 'undefined' && acts) {
    const kjByDay = new Map();
    acts.forEach(a => {
      if (!a.kilojoules) return;
      const d = (a.start_date_local || '').slice(0, 10);
      if (d) kjByDay.set(d, (kjByDay.get(d) || 0) + a.kilojoules);
    });
    const pair = g.filter(d => kjByDay.has(d.date)).map(d => ({ date: d.date, watch: d.cal, kj: kjByDay.get(d.date) }));
    if (pair.length >= 8) cross = { n: pair.length, watch: _slpMean(pair.map(p => p.watch)),
                                    kj: _slpMean(pair.map(p => p.kj)), r: _slpCorr(pair.map(p => p.kj), pair.map(p => p.watch)), pair };
  }

  const topCal = g.reduce((b, d) => d.cal > b.cal ? d : b);
  const topSteps = g.reduce((b, d) => d.steps > b.steps ? d : b);
  const stepDays = g.filter(d => d.steps >= 10000).length;

  return {
    n: g.length, cal: _slpMean(g.map(d => d.cal)), steps: _slpMean(g.map(d => d.steps)),
    dist: _slpMean(g.filter(d => d.dist != null).map(d => d.dist)),
    active: _slpMean(g.filter(d => d.active != null).map(d => d.active)),
    floors: _slpMean(g.filter(d => d.floors != null).map(d => d.floors)),
    totalCal: sum(g, 'cal'), totalSteps: sum(g, 'steps'), totalDist: sum(g, 'dist'),
    ride: { n: ride.length, cal: _slpMean(ride.map(d => d.cal)), steps: _slpMean(ride.map(d => d.steps)), active: _slpMean(ride.filter(d => d.active != null).map(d => d.active)) },
    rest: { n: rest.length, cal: _slpMean(rest.map(d => d.cal)), steps: _slpMean(rest.map(d => d.steps)), active: _slpMean(rest.filter(d => d.active != null).map(d => d.active)) },
    monthly, months, topCal, topSteps, stepDays, cross,
  };
}

/* ── BIKE ↔ BODY ─────────────────────────────────────────────────────────────
   The join nothing else can do. Ride data comes off an iGPSport head unit into
   Strava; body data comes off the watch. Neither app sees the other's half, so
   "what a hard ride does to you the next morning" only exists here.
   ────────────────────────────────────────────────────────────────────────── */
function _slpBikeBody(allDays, train, byDate) {
  const byDay = new Map(allDays.map(d => [d.date, d]));
  const SIGS = [
    { k: 'rhr',    lbl: tr('Resting heart rate'), unit: 'bpm', dir: -1, c: '#f87171' },
    { k: 'hrv',    lbl: tr('HRV'),                unit: 'ms',  dir:  1, c: '#34d399' },
    { k: 'stress', lbl: tr('Stress'),             unit: '',    dir: -1, c: '#fbbf24' },
    { k: 'spo2',   lbl: tr('Blood oxygen'),       unit: '%',   dir:  1, c: '#60a5fa' },
  ];

  /* Load buckets from the same relative-effort quartiles the sleep charts use,
     then read each body signal on the MORNING AFTER. */
  const loads = [...train.values()].map(v => v.load).filter(x => x > 0).sort((a, b) => a - b);
  if (loads.length < 20) return null;
  const q = f => loads[Math.floor(loads.length * f)];
  const cuts = [q(0.33), q(0.66)];
  const label = d => {
    const t = train.get(d);
    if (!t) return 'rest';
    return t.load <= cuts[0] ? 'easy' : t.load <= cuts[1] ? 'moderate' : 'hard';
  };

  const KEYS = ['rest', 'easy', 'moderate', 'hard'];
  const groups = Object.fromEntries(KEYS.map(k => [k, []]));
  allDays.forEach(d => {
    const prev = _slpNext(d.date, -1);
    // only days that sit inside the Strava window, so "rest" is a real rest day
    // and not simply a date from before the activity history begins
    if (!train.has(prev) && !train.has(d.date) && !train.has(_slpNext(d.date, -2))) return;
    groups[label(prev)].push(d);
  });

  const rows = SIGS.map(s => {
    const cells = KEYS.map(k => {
      const q2 = groups[k].filter(d => d[s.k] != null);
      return { k, n: q2.length, v: q2.length >= 5 ? _slpMean(q2.map(d => d[s.k])) : null };
    });
    /* correlation of yesterday's load against today's reading */
    const pts = [];
    allDays.forEach(d => {
      const t = train.get(_slpNext(d.date, -1));
      if (t && t.load > 0 && d[s.k] != null) pts.push({ x: t.load, y: d[s.k] });
    });
    return { ...s, cells, r: _slpCorr(pts.map(p => p.x), pts.map(p => p.y)), n: pts.length };
  }).filter(r => r.cells.some(c => c.v != null));

  /* The single most useful line: what a hard day costs the next morning. */
  const restCell = k => { const r = rows.find(x => x.k === k); return r && (r.cells.find(c => c.k === 'rest') || {}).v; };
  const hardCell = k => { const r = rows.find(x => x.k === k); return r && (r.cells.find(c => c.k === 'hard') || {}).v; };

  /* Does riding cost you steps elsewhere, or add to them? */
  const withSteps = allDays.filter(d => d.steps != null);
  const rideSteps = withSteps.filter(d => train.has(d.date)), restSteps = withSteps.filter(d => !train.has(d.date));

  /* Ride volume against next-day resting HR, month by month — the long view. */
  return { rows, KEYS, groups, cuts,
           rhrRest: restCell('rhr'), rhrHard: hardCell('rhr'),
           stressRest: restCell('stress'), stressHard: hardCell('stress'),
           hrvRest: restCell('hrv'), hrvHard: hardCell('hrv'),
           steps: rideSteps.length >= 10 && restSteps.length >= 10
             ? { ride: _slpMean(rideSteps.map(d => d.steps)), rest: _slpMean(restSteps.map(d => d.steps)),
                 rideN: rideSteps.length, restN: restSteps.length } : null };
}

/* ── PHANTOM STEPS ───────────────────────────────────────────────────────────
   The watch counts steps from wrist movement, and a bike ride shakes the wrist
   for hours. Rides are recorded on an iGPSport head unit and land in Strava, so
   the watch never learns the ride happened and books the whole thing as walking
   — which is why a 10k-step day is so often a riding day, not a walking one.
   Huawei cannot correct for this because it does not have the ride. We do.
   ────────────────────────────────────────────────────────────────────────── */
function _slpSteps(allDays, train) {
  const g = allDays.filter(d => d.steps != null);
  const tDates = [...train.keys()].sort();
  if (g.length < 40 || !tDates.length) return null;

  /* Judge only days inside the Strava window. Outside it, "no ride recorded"
     just means the activity history does not reach back that far, and every
     old riding day would be misread as a walking day. */
  const lo = tDates[0], hi = tDates[tDates.length - 1];
  const win = g.filter(d => d.date >= lo && d.date <= hi);
  if (win.length < 30) return null;

  const rideDays = win.filter(d => train.has(d.date));
  const restDays = win.filter(d => !train.has(d.date));
  if (rideDays.length < 10 || restDays.length < 10) return null;

  const base = _slpMean(restDays.map(d => d.steps));
  const rideMean = _slpMean(rideDays.map(d => d.steps));

  /* Steps booked per hour on the bike: least-squares slope of step count
     against riding hours across ride days. */
  const pts = rideDays.map(d => ({ x: train.get(d.date).min / 60, y: d.steps, date: d.date }));
  let perHour = null, intercept = null;
  const mx = _slpMean(pts.map(p => p.x)), my = _slpMean(pts.map(p => p.y));
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (den) { perHour = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den; intercept = my - perHour * mx; }
  const r = _slpCorr(pts.map(p => p.x), pts.map(p => p.y));

  /* Attribute the ride-driven part of each ride day's steps, never below zero
     and never more than the day actually recorded. */
  const phantom = d => {
    const t = train.get(d.date);
    if (!t || perHour == null || perHour <= 0) return 0;
    return Math.max(0, Math.min(d.steps, perHour * (t.min / 60)));
  };

  const big = win.filter(d => d.steps >= 10000);
  const bigRide = big.filter(d => train.has(d.date));
  const bigWalk = big.filter(d => !train.has(d.date));
  /* A big day that survives the correction really was spent on your feet. */
  const bigReal = bigRide.filter(d => d.steps - phantom(d) >= 10000);

  const corrected = win.map(d => ({ date: d.date, raw: d.steps, ph: Math.round(phantom(d)),
                                    real: Math.round(d.steps - phantom(d)), ride: train.has(d.date) }));
  const worst = [...corrected].sort((a, b) => b.ph - a.ph)[0];

  return {
    n: win.length, from: lo, to: hi,
    base, rideMean, perHour, r, rN: pts.length,
    rawMean: _slpMean(win.map(d => d.steps)),
    realMean: _slpMean(corrected.map(c => c.real)),
    big: big.length, bigRide: bigRide.length, bigWalk: bigWalk.length, bigReal: bigReal.length,
    rideDays: rideDays.length, restDays: restDays.length,
    worst, corrected,
    topWalk: bigWalk.length ? bigWalk.reduce((b, d) => d.steps > b.steps ? d : b) : null,
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
  const DOW = _SLP_DOW;
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

  /* Everything below joins the watch's DAILY metrics — calories, steps, the
     stress spread, SpO2 — which exist on days with no sleep record too, so
     they run off `nights` rather than the sleep-only `real`. */
  const allDays = nights;
  const records = _slpRecords(real, train, byDate, byMonth);
  const risk = _slpRisk(real, all, sig, allDays);
  const yearHealth = _slpYearHealth(years, byYear, allDays);
  const stress = _slpStressAnalysis(allDays, train, byDate);
  const energy = _slpEnergy(allDays, train);
  const bike = _slpBikeBody(allDays, train, byDate);
  const steps = _slpSteps(allDays, train);

  return { real, allDays, records, risk, yearHealth, stress, energy, bike, steps,
           train, win, byDate, days, afterT, afterR, aT, aR, cuts, buckets,
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

/* ── HTML BUILDERS FOR THE BODY-DATA CARDS ───────────────────────────────────
   Each one returns '' when its data is missing, so a thin export degrades to a
   shorter page instead of a broken one.
   ────────────────────────────────────────────────────────────────────────── */

const _slpNum = n => Math.round(n).toLocaleString();
/* score → colour, shared by the risk bars and the year ranking */
const _slpScoreC = s => s >= 80 ? SLP_C.good : s >= 65 ? '#84cc16' : s >= 50 ? '#f59e0b' : SLP_C.bad;

function _slpRecordsHTML(R) {
  if (!R) return '';
  const tile = r => `
    <div class="slp-rec">
      <div class="slp-rec-lbl">${r.lbl}</div>
      <div class="slp-rec-val" style="color:${r.c}">${r.value}</div>
      <div class="slp-rec-date">${fmtDt(r.date)}</div>
      <div class="slp-rec-ctx">${r.ctx}</div>
    </div>`;

  const wide = [];
  if (R.bestWeek) wide.push({ lbl: tr('Best 7 nights in a row'), value: _slpHM(R.bestWeek.asleep),
    date: R.bestWeek.from + ' → ' + R.bestWeek.to,
    ctx: trf('{0} min deep · {1} min REM a night', Math.round(R.bestWeek.deep), Math.round(R.bestWeek.rem)), c: SLP_C.good });
  if (R.worstWeek) wide.push({ lbl: tr('Worst 7 nights in a row'), value: _slpHM(R.worstWeek.asleep),
    date: R.worstWeek.from + ' → ' + R.worstWeek.to,
    ctx: trf('{0} min deep · {1} min REM a night', Math.round(R.worstWeek.deep), Math.round(R.worstWeek.rem)), c: SLP_C.bad });
  if (R.goodRun) wide.push({ lbl: tr('Longest run of 7h+ nights'), value: trf('{0} nights', R.goodRun.nights),
    date: R.goodRun.from + ' → ' + R.goodRun.to, ctx: tr('back to back, no night under 7h'), c: SLP_C.good });

  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Your records')}</div>
      <div class="slp-chart-sub">${tr('The single best and worst nights on file, and what you had done that day')}</div>
      <div class="slp-recs">${R.nights.map(tile).join('')}</div>
      <div class="slp-recs slp-recs-wide">${wide.map(tile).join('')}</div>
    </div>`;
}

/* Your best nights against your worst — the comparison that says what to copy. */
function _slpRecipeHTML(R) {
  if (!R) return '';
  const b = R.bestTier, w = R.worstTier;
  const row = (lbl, bv, wv) => `<tr><td>${lbl}</td><td class="slp-num">${bv}</td><td class="slp-num">${wv}</td></tr>`;
  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${trf('Your {0} best nights against your {0} worst', R.tierSize)}</div>
      <div class="slp-chart-sub">${tr('Same data, sorted by how long you slept — what separates the two ends')}</div>
      <table class="slp-table">
        <thead><tr><th></th><th>${tr('Best nights')}</th><th>${tr('Worst nights')}</th></tr></thead>
        <tbody>
          ${row(tr('Total sleep'), _slpHM(b.asleep), _slpHM(w.asleep))}
          ${row(tr('Bedtime'), _slpClock(b.bed), _slpClock(w.bed))}
          ${row(tr('Wake time'), _slpClock(b.up), _slpClock(w.up))}
          ${row(tr('Deep'), Math.round(b.deep) + 'm', Math.round(w.deep) + 'm')}
          ${row(tr('REM'), Math.round(b.rem) + 'm', Math.round(w.rem) + 'm')}
          ${row(tr('Efficiency'), b.eff.toFixed(1) + '%', w.eff.toFixed(1) + '%')}
          ${row(tr('Wake-ups'), b.wakeups.toFixed(1), w.wakeups.toFixed(1))}
          ${row(tr('Rode the day before'), Math.round(b.trainedPct) + '%', Math.round(w.trainedPct) + '%')}
          ${row(tr('Most common day'), tr(b.dow), tr(w.dow))}
        </tbody>
      </table>
      <div class="slp-note">${(() => {
        /* Which end of the night actually moves? Written from the two gaps
           rather than asserted, because either one could dominate. */
        const bedGap = Math.abs((w.bed - b.bed) * 60), upGap = Math.abs((b.up - w.up) * 60);
        const lead = bedGap > upGap * 1.5 ? 'bed' : upGap > bedGap * 1.5 ? 'up' : 'both';
        const head = trf('Your best nights start at {0} and end at {1}; your worst start at {2} and end at {3}.',
          _slpClock(b.bed), _slpClock(b.up), _slpClock(w.bed), _slpClock(w.up));
        const tail = lead === 'bed'
          ? trf('The bedtime moves {0} between the two groups while the wake time barely shifts — the morning is fixed for you, so the whole difference is decided the night before.', _slpHM(bedGap))
          : lead === 'up'
          ? trf('The wake time moves {0} while the bedtime barely shifts, so what separates a good night from a bad one is whether you got to stay in bed, not when you turned in.', _slpHM(upGap))
          : trf('Both ends move, and by almost the same amount — {0} earlier to bed and {1} later up. A good night is not one thing going right, it is an early bedtime and an unhurried morning arriving together, which is why they cluster on the days with nothing scheduled.', _slpHM(bedGap), _slpHM(upGap));
        return head + ' ' + tail;
      })()}</div>
    </div>`;
}

function _slpMonthHTML(R) {
  if (!R || !R.months.length) return '';
  const rows = [...R.months].reverse().map(m => {
    const isB = R.bestMonth && m.month === R.bestMonth.month;
    const isW = R.worstMonth && m.month === R.worstMonth.month;
    const tag = isB ? `<span class="slp-tag slp-tag-good">${tr('best')}</span>`
              : isW ? `<span class="slp-tag slp-tag-bad">${tr('worst')}</span>` : '';
    return `<tr class="${isB ? 'slp-row-good' : isW ? 'slp-row-bad' : ''}">
      <td>${m.month}${tag}${m.full ? '' : `<span class="slp-tag">${trf('{0} nights', m.nights)}</span>`}</td>
      <td class="slp-num">${_slpHM(m.asleep)}</td>
      <td class="slp-num">${Math.round(m.deep)}m</td>
      <td class="slp-num">${Math.round(m.rem)}m</td>
      <td class="slp-num">${isNaN(m.eff) ? '—' : m.eff.toFixed(1) + '%'}</td>
      <td class="slp-num">${Math.round(100 * m.under6 / m.nights)}%</td>
      <td class="slp-num">${_slpHM(m.best.asleep)}<span class="slp-cell-sub">${fmtDt(m.best.date)}</span></td>
    </tr>`;
  }).join('');

  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Month by month')}</div>
      <div class="slp-chart-sub">${tr('Every month on record, newest first. Months with fewer than 15 tracked nights are marked and left out of the best/worst ranking.')}</div>
      <div class="slp-scroll">
        <table class="slp-table slp-month-table">
          <thead><tr><th>${tr('Month')}</th><th>${tr('Sleep')}</th><th>${tr('Deep')}</th><th>${tr('REM')}</th><th>${tr('Eff.')}</th><th>${tr('Under 6h')}</th><th>${tr('Best night')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="slp-chart-wrap" style="margin-top:14px"><canvas id="slpMonthChart"></canvas></div>
      ${R.bestMonth && R.worstMonth ? `<div class="slp-note">${trf('Your best full month was {0} at {1} a night; your worst was {2} at {3}. That is a swing of {4} a night between two months of your own life — bigger than the gap between your training days and your rest days.',
        R.bestMonth.month, _slpHM(R.bestMonth.asleep), R.worstMonth.month, _slpHM(R.worstMonth.asleep),
        _slpHM(R.bestMonth.asleep - R.worstMonth.asleep))}</div>` : ''}
    </div>`;
}

function _slpRiskHTML(K) {
  if (!K) return '';
  const bar = c => {
    const s = Math.round(c.score);
    return `<div class="slp-risk-row">
      <div class="slp-risk-top"><span class="slp-risk-lbl">${c.lbl}</span><span class="slp-risk-score" style="color:${_slpScoreC(s)}">${s}<small>/100</small></span></div>
      <div class="slp-risk-bar"><i style="width:${s}%;background:${_slpScoreC(s)}"></i></div>
      <div class="slp-risk-read">${c.read}</div>
      <div class="slp-risk-ev">${c.ev}</div>
    </div>`;
  };
  const flag = f => `<div class="slp-flag slp-${f.tone}"><div class="slp-flag-t">${f.t}</div><div class="slp-flag-b">${f.b}</div></div>`;

  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('What this means for your long-term health')}</div>
      <div class="slp-chart-sub">${tr('Your numbers against ordinary adult sleep guidance, and what the research associates with each pattern')}</div>

      <div class="slp-score-wrap">
        <div class="slp-score-ring" style="--v:${K.score};--c:${_slpScoreC(K.score)}">
          <div class="slp-score-n" style="color:${_slpScoreC(K.score)}">${K.score}</div>
          <div class="slp-score-o">/ 100</div>
        </div>
        <div class="slp-score-side">
          <div class="slp-score-grade" style="color:${_slpScoreC(K.score)}">${K.grade.lbl}</div>
          <div class="slp-score-txt">${tr('A weighted read of the four sleep measures with the strongest health evidence behind them: duration (40%), timing regularity (25%), efficiency (20%) and stage balance (15%). It is scored against published guidance, not against other people.')}</div>
        </div>
      </div>

      <div class="slp-risk-list">${K.comp.filter(c => c.score != null).map(bar).join('')}</div>
      <div class="slp-flags">${K.flags.map(flag).join('')}</div>

      <div class="slp-disclaimer">${tr('These are population-level associations from sleep research, applied to your own tracked numbers — not a diagnosis, a screening result, or medical advice. A wrist tracker estimates sleep stages rather than measuring them. If something here worries you, particularly the blood-oxygen figures, take it to a doctor rather than to a dashboard.')}</div>
    </div>`;
}

function _slpYearHealthHTML(Y) {
  if (!Y) return '';
  const fmt = {
    asleep: v => _slpHM(v), reg: v => '±' + Math.round(v * 60) + 'm', under6: v => Math.round(v) + '%',
    eff: v => v.toFixed(1) + '%', deepPct: v => v.toFixed(1) + '%', rhr: v => Math.round(v) + ' bpm',
    hrv: v => Math.round(v) + ' ms', stress: v => Math.round(v), steps: v => _slpNum(v),
  };
  const head = Y.rows.map(r => `<th class="${r.year === Y.winner.year ? 'slp-th-win' : ''}">${r.year}<span class="slp-th-sub">${trf('{0} nights', r.nights)}</span></th>`).join('');
  const body = Y.metrics.map(m => `<tr><td>${m.lbl}<span class="slp-cell-sub">${m.dir > 0 ? tr('higher is better') : tr('lower is better')}</span></td>${
    Y.rows.map(r => {
      const best = Math.max(...Y.rows.map(x => x['_' + m.k]));
      const win = r['_' + m.k] === best;
      return `<td class="slp-num${win ? ' slp-num-win' : ''}">${(fmt[m.k] || (v => v))(r[m.k])}</td>`;
    }).join('')}</tr>`).join('');
  const scoreRow = `<tr class="slp-row-score"><td><b>${tr('Composite score')}</b></td>${
    Y.rows.map(r => `<td class="slp-num"><b style="color:${_slpScoreC(r.score)}">${r.score}</b></td>`).join('')}</tr>`;

  const d = Y.drivers.map(x => trf('{0} ({1} vs {2})', x.lbl,
    (fmt[x.k] || (v => v))(x.wv), (fmt[x.k] || (v => v))(x.lv))).join(', ');

  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${trf('Your healthiest year was {0}', Y.winner.year)}</div>
      <div class="slp-chart-sub">${tr('Each measure normalised across your own years, then weighted. 100 means your best year on that measure — this ranks your years against each other, not against anybody else.')}</div>
      <table class="slp-table slp-year-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${body}${scoreRow}</tbody>
      </table>
      <div class="slp-note">${trf('{0} comes out ahead, mostly on {1}. The weakest year was {2}. Ride volume is deliberately left out of this score: Strava only returns your most recent activities, so the earlier years would look artificially quiet and would drag the ranking around for no real reason. Note too that the first and last years on file are partial.',
        Y.winner.year, d, Y.loser.year)}</div>
    </div>`;
}

function _slpStressHTML(S) {
  if (!S) return '';
  const bandRow = S.peakN ? `<div class="slp-key-h">${tr('How high the day’s stress peaked')}</div><div class="slp-key-row slp-bands">`
    + S.bands.map(b => `<span class="slp-key-item"><i style="background:${b.c}"></i>${b.lbl} <b>${Math.round(100 * b.n / S.peakN)}%</b></span>`).join('')
    + '</div>' : '';
  const dRide = S.onRide.stress - S.onRest.stress;
  const dAfter = S.afterRide.stress - S.afterRest.stress;

  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Daily stress')}</div>
      <div class="slp-chart-sub">${trf('{0} days measured. The watch samples a stress score through the day — about {1} readings a day — and the export keeps the day’s mean, low and high.', S.n, Math.round(S.spread ? S.spread.cnt : 0))}</div>

      <div class="slp-tiles slp-tiles-in">
        ${['', ''].length ? '' : ''}
        <div class="slp-tile card"><div class="slp-tile-val" style="color:#fbbf24">${Math.round(S.mean)}</div><div class="slp-tile-lbl">${tr('Average day')}</div>${S.spread ? `<div class="slp-tile-sub">${trf('{0} low · {1} high', Math.round(S.spread.min), Math.round(S.spread.max))}</div>` : ''}</div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.good}">${Math.round(S.lo.stress)}</div><div class="slp-tile-lbl">${tr('Calmest day')}</div><div class="slp-tile-sub">${fmtDt(S.lo.date)}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.bad}">${Math.round(S.hi.stress)}</div><div class="slp-tile-lbl">${tr('Most stressed day')}</div><div class="slp-tile-sub">${fmtDt(S.hi.date)}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${dRide < 0 ? SLP_C.good : '#f59e0b'}">${dRide >= 0 ? '+' : '−'}${Math.abs(dRide).toFixed(1)}</div><div class="slp-tile-lbl">${tr('Riding days vs rest')}</div><div class="slp-tile-sub">${trf('{0} vs {1}', S.onRide.stress.toFixed(1), S.onRest.stress.toFixed(1))}</div></div>
      </div>

      ${bandRow}

      <div class="slp-chart-wrap"><canvas id="slpStressMonthChart"></canvas></div>
      <div class="slp-chart-wrap" style="margin-top:14px"><canvas id="slpStressDowChart"></canvas></div>

      ${S.tiers.length ? `
      <table class="slp-table" style="margin-top:14px">
        <thead><tr><th></th><th>${tr('Stress that day')}</th><th>${tr('Sleep the next night')}</th><th>${tr('Deep')}</th></tr></thead>
        <tbody>${S.tiers.map(t => `<tr><td>${t.lbl} <span class="slp-cell-sub">${trf('{0} days', t.n)}</span></td><td class="slp-num">${t.stress.toFixed(1)}</td><td class="slp-num">${_slpHM(t.asleep)}</td><td class="slp-num">${Math.round(t.deep)}m</td></tr>`).join('')}</tbody>
      </table>` : ''}

      <div class="slp-note">${trf('Stress on a riding day runs {0} against {1} on a rest day, and the morning AFTER a ride sits at {2} against {3}. Against last night’s sleep the correlation is r = {4}, and against the night that follows r = {5} — both weak, so treat this as a mood-and-load barometer rather than something that predicts your sleep. This is also the join the Huawei app cannot make: it never sees the rides, because they come off the head unit into Strava.',
        S.onRide.stress.toFixed(1), S.onRest.stress.toFixed(1), S.afterRide.stress.toFixed(1), S.afterRest.stress.toFixed(1),
        S.rStressVsSleep, S.rStressVsNextSleep)}</div>
    </div>`;
}

function _slpEnergyHTML(E) {
  if (!E) return '';
  const yrs = E.totalCal / 1000;
  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Calories and movement')}</div>
      <div class="slp-chart-sub">${trf('{0} days of the watch’s own daily totals. These are ACTIVE calories — the burn the watch attributes to movement — not a full daily energy expenditure: the export carries no height or age, so there is no honest way to build a resting rate from it.', E.n)}</div>

      <div class="slp-tiles slp-tiles-in">
        <div class="slp-tile card"><div class="slp-tile-val" style="color:var(--orange)">${_slpNum(E.cal)}</div><div class="slp-tile-lbl">${tr('Active kcal a day')}</div><div class="slp-tile-sub">${trf('{0} kcal in total', _slpNum(E.totalCal))}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.light}">${_slpNum(E.steps)}</div><div class="slp-tile-lbl">${tr('Steps a day')}</div><div class="slp-tile-sub">${trf('{0} days over 10k', E.stepDays)}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.good}">${Math.round(E.active)}<span class="slp-tile-unit">m</span></div><div class="slp-tile-lbl">${tr('Active minutes a day')}</div><div class="slp-tile-sub">${trf('{0} km walked a day', (E.dist / 1000).toFixed(1))}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.rem}">${_slpNum(E.topCal.cal)}</div><div class="slp-tile-lbl">${tr('Biggest burn')}</div><div class="slp-tile-sub">${fmtDt(E.topCal.date)}</div></div>
      </div>

      <div class="slp-chart-wrap"><canvas id="slpEnergyChart"></canvas></div>

      <table class="slp-table" style="margin-top:14px">
        <thead><tr><th></th><th>${tr('Riding days')}</th><th>${tr('Rest days')}</th><th>${tr('Difference')}</th></tr></thead>
        <tbody>
          <tr><td>${tr('Active kcal')}</td><td class="slp-num">${_slpNum(E.ride.cal)}</td><td class="slp-num">${_slpNum(E.rest.cal)}</td><td class="slp-num" style="color:${SLP_C.good}">+${_slpNum(E.ride.cal - E.rest.cal)}</td></tr>
          <tr><td>${tr('Steps')}</td><td class="slp-num">${_slpNum(E.ride.steps)}</td><td class="slp-num">${_slpNum(E.rest.steps)}</td><td class="slp-num" style="color:${SLP_C.good}">+${_slpNum(E.ride.steps - E.rest.steps)}</td></tr>
          <tr><td>${tr('Active minutes')}</td><td class="slp-num">${Math.round(E.ride.active)}</td><td class="slp-num">${Math.round(E.rest.active)}</td><td class="slp-num" style="color:${SLP_C.good}">+${Math.round(E.ride.active - E.rest.active)}</td></tr>
        </tbody>
      </table>

      ${E.cross ? `<div class="slp-note">${trf('Two devices that have never spoken to each other, measuring the same rides: on the {0} days your power meter recorded work, the iGPSport logged {1} kJ of mechanical work while the watch counted {2} active kcal — a ratio of {3} to 1, correlating at r = {4}. Cycling runs at roughly 22–25% gross efficiency, which is why kJ of work and kcal burned are expected to land near 1:1. {5}',
        E.cross.n, _slpNum(E.cross.kj), _slpNum(E.cross.watch), (E.cross.watch / E.cross.kj).toFixed(2), E.cross.r,
        Math.abs(E.cross.watch / E.cross.kj - 1) < 0.25
          ? tr('Yours land close to it, so the two devices genuinely corroborate each other.')
          : tr('Yours do not, so treat the watch’s calorie figure as its own rough estimate rather than a measurement — the bike’s power data is the more trustworthy of the two.'))}</div>` : ''}

      <div class="slp-note">${trf('Across {0} tracked days the watch counted {1} active kcal and {2} steps. Read the calories as a relative measure — good for comparing your months against each other, not for balancing against food.', E.n, _slpNum(E.totalCal), _slpNum(E.totalSteps))}</div>
    </div>`;
}

function _slpStepsHTML(P) {
  if (!P) return '';
  const pct = Math.round(100 * P.bigRide / Math.max(1, P.big));
  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Your step count is lying to you')}</div>
      <div class="slp-chart-sub">${tr('Big step days, checked against Strava to see whether you were actually walking')}</div>

      <div class="slp-tiles slp-tiles-in">
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.bad}">${pct}<span class="slp-tile-unit">%</span></div><div class="slp-tile-lbl">${tr('of 10k+ days were ride days')}</div><div class="slp-tile-sub">${trf('{0} of {1} days', P.bigRide, P.big)}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.awake}">${_slpNum(P.perHour)}</div><div class="slp-tile-lbl">${tr('phantom steps per riding hour')}</div><div class="slp-tile-sub">${trf('r = {0} across {1} ride days', P.r, P.rN)}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.light}">${_slpNum(P.rawMean)}</div><div class="slp-tile-lbl">${tr('Steps the watch claims')}</div><div class="slp-tile-sub">${tr('daily average, uncorrected')}</div></div>
        <div class="slp-tile card"><div class="slp-tile-val" style="color:${SLP_C.good}">${_slpNum(P.realMean)}</div><div class="slp-tile-lbl">${tr('Steps you actually walked')}</div><div class="slp-tile-sub">${trf('{0}% lower', Math.round(100 * (1 - P.realMean / P.rawMean)))}</div></div>
      </div>

      <div class="slp-chart-wrap"><canvas id="slpStepsChart"></canvas></div>

      <div class="slp-note">${trf('Your rides are recorded on an iGPSport head unit and reach this dashboard through Strava — the watch on your wrist never learns the ride happened, so it books four hours of road buzz as walking. On rest days you average {0} steps; on riding days {1}. That gap tracks riding time closely enough ({2} steps per hour on the bike, r = {3}) that it can be subtracted out.',
        _slpNum(P.base), _slpNum(P.rideMean), _slpNum(P.perHour), P.r)}</div>

      <div class="slp-note">${trf('Corrected, only {0} of your {1} ten-thousand-step days were genuinely spent on your feet, and your real daily walking average is {2} rather than the {3} on the watch face. Your biggest phantom day was {4}: {5} steps recorded, an estimated {6} of them from the bike. This is the one number in the whole section the Huawei app can never get right, because the correction needs the ride data and the ride data is not in Huawei.',
        P.bigReal + P.bigWalk, P.big, _slpNum(P.realMean), _slpNum(P.rawMean),
        fmtDt(P.worst.date), _slpNum(P.worst.raw), _slpNum(P.worst.ph))}</div>
    </div>`;
}

function _slpBikeHTML(B) {
  if (!B) return '';
  const LBL = { rest: tr('Rest day'), easy: tr('Easy'), moderate: tr('Moderate'), hard: tr('Hard') };
  const head = B.KEYS.map(k => `<th>${LBL[k]}<span class="slp-th-sub">${trf('{0} days', (B.groups[k] || []).length)}</span></th>`).join('');
  const rows = B.rows.map(r => `<tr>
    <td><span class="slp-dot" style="background:${r.c}"></span>${r.lbl}<span class="slp-cell-sub">${r.r == null ? '' : trf('r = {0} vs load', r.r)}</span></td>
    ${r.cells.map(c => `<td class="slp-num">${c.v == null ? '—' : (r.k === 'spo2' ? c.v.toFixed(1) : Math.round(c.v)) + (r.unit ? ' ' + r.unit : '')}</td>`).join('')}
  </tr>`).join('');

  const dR = (B.rhrHard != null && B.rhrRest != null) ? B.rhrHard - B.rhrRest : null;
  const dS = (B.stressHard != null && B.stressRest != null) ? B.stressHard - B.stressRest : null;

  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('What the bike does to your body the next morning')}</div>
      <div class="slp-chart-sub">${tr('Every body signal the watch recorded, read on the morning AFTER a ride and grouped by how hard that ride was')}</div>
      <table class="slp-table">
        <thead><tr><th>${tr('The morning after a…')}</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="slp-chart-wrap" style="margin-top:14px"><canvas id="slpBikeChart"></canvas></div>

      <div class="slp-note">${dR != null
        ? trf('The morning after your hardest third of rides your resting heart rate reads {0} bpm against {1} after a rest day — a {2} bpm cost that clears within a day. {3}This is the whole point of joining the two sources: Strava knows what you did, the watch knows what it cost, and neither app can see the other half.',
            Math.round(B.rhrHard), Math.round(B.rhrRest), (dR >= 0 ? '+' : '−') + Math.abs(dR).toFixed(1),
            dS != null ? trf('Stress follows the same shape, {0} against {1}. ', Math.round(B.stressHard), Math.round(B.stressRest)) : '')
        : tr('Strava knows what you did and the watch knows what it cost — joining them is the only way to see the price of a hard day.')}</div>

      ${B.steps ? `<div class="slp-note">${trf('Worth reading alongside the step correction above: you record {0} steps on riding days against {1} on rest days, and most of that gap is the bike shaking your wrist rather than extra walking.', _slpNum(B.steps.ride), _slpNum(B.steps.rest))}</div>` : ''}
    </div>`;
}

/* ── EXPORT ──────────────────────────────────────────────────────────────────
   One wide table, one row per calendar date, joining everything this section
   knows: the watch's nightly sleep and daily body metrics, the Strava/iGPSport
   ride for that day, and the derived columns (corrected steps, sleep midpoint).
   That join is the part worth exporting — the two halves live in different
   apps and nothing else puts them in the same row.

   CSV for spreadsheets and pandas, JSON for code, SQL for a database. All three
   are built in the browser; the data never leaves the machine.
   ────────────────────────────────────────────────────────────────────────── */

/* Columns are declared once, so every format stays in step. */
const _SLP_EXPORT_COLS = [
  ['date',            'TEXT',    'calendar date; sleep columns describe the night you woke up ON this date'],
  ['weekday',         'TEXT',    'Mon–Sun'],
  ['asleep_min',      'INTEGER', 'total sleep, minutes'],
  ['deep_min',        'INTEGER', 'deep sleep, minutes'],
  ['light_min',       'INTEGER', 'light sleep, minutes'],
  ['rem_min',         'INTEGER', 'REM sleep, minutes'],
  ['awake_min',       'INTEGER', 'time awake in bed, minutes'],
  ['nap_min',         'INTEGER', 'daytime naps, minutes; excluded from asleep_min'],
  ['wakeups',         'INTEGER', 'number of times you surfaced'],
  ['time_in_bed_min', 'INTEGER', 'minutes between lights out and getting up'],
  ['efficiency_pct',  'REAL',    'asleep_min / time_in_bed_min'],
  ['bedtime_h',       'REAL',    'local decimal hours, negative before midnight (-0.5 = 23:30)'],
  ['bedtime',         'TEXT',    'local clock time'],
  ['waketime_h',      'REAL',    'local decimal hours'],
  ['waketime',        'TEXT',    'local clock time'],
  ['midpoint_h',      'REAL',    'midpoint of the night, decimal hours; the regularity metric'],
  ['resting_hr',      'INTEGER', 'bpm'],
  ['hr_min',          'INTEGER', 'lowest bpm that day'],
  ['hr_max',          'INTEGER', 'highest bpm that day'],
  ['hrv',             'INTEGER', 'ms'],
  ['hrv_min',         'INTEGER', 'ms'],
  ['hrv_max',         'INTEGER', 'ms'],
  ['stress_mean',     'INTEGER', "day's mean stress score, 0–100"],
  ['stress_min',      'INTEGER', "day's lowest stress reading"],
  ['stress_max',      'INTEGER', "day's highest stress reading"],
  ['stress_samples',  'INTEGER', 'how many stress readings were taken'],
  ['spo2_avg',        'REAL',    'average blood oxygen, %'],
  ['spo2_min',        'REAL',    'lowest blood oxygen, %'],
  ['calories_active', 'INTEGER', 'kcal the watch attributes to movement; NOT total daily expenditure'],
  ['steps_raw',       'INTEGER', 'steps as the watch counted them, inflated on riding days'],
  ['steps_phantom',   'INTEGER', 'estimated steps produced by riding rather than walking'],
  ['steps_walked',    'INTEGER', 'steps_raw minus steps_phantom'],
  ['walk_distance_m', 'INTEGER', 'metres, as counted from steps'],
  ['active_min',      'INTEGER', 'minutes the watch counted as active'],
  ['floors',          'INTEGER', 'floors climbed'],
  ['mood_happy',      'INTEGER', 'self-logged mood entries'],
  ['mood_peaceful',   'INTEGER', 'self-logged mood entries'],
  ['mood_unhappy',    'INTEGER', 'self-logged mood entries'],
  ['trained',         'INTEGER', '1 if Strava recorded an activity on this date'],
  ['ride_count',      'INTEGER', 'activities recorded that day'],
  ['ride_min',        'REAL',    'total moving time, minutes'],
  ['ride_km',         'REAL',    'total distance'],
  ['relative_effort', 'INTEGER', "Strava's suffer score for the day"],
  ['ride_start',      'TEXT',    'earliest start time that day, local clock'],
];

/* Build the joined rows. Recomputed from source on each click so an export can
   never disagree with what the page is showing. */
function _slpExportRows() {
  const A = _slpAnalyse(_slpNights);
  const train = A.train;
  /* Reuse the fitted phantom-step rate rather than refitting it here. */
  const ph = new Map((A.steps ? A.steps.corrected : []).map(c => [c.date, c]));
  const r1 = v => (v == null || isNaN(v)) ? null : Math.round(v * 100) / 100;

  return A.allDays.map(n => {
    const t = train.get(n.date);
    const p = ph.get(n.date);
    const mid = (n.bed != null && n.up != null) ? n.bed + (n.up - n.bed) / 2 : null;
    return {
      date: n.date,
      weekday: _SLP_DOW[_slpDay(n.date)],
      asleep_min: n.asleep || null,
      deep_min: n.deep || null,
      light_min: n.light || null,
      rem_min: n.rem || null,
      awake_min: n.wake == null ? null : n.wake,
      nap_min: n.nap == null ? null : n.nap,
      wakeups: n.wakeups,
      time_in_bed_min: n.tib,
      efficiency_pct: r1(n.eff),
      bedtime_h: r1(n.bed),
      bedtime: n.bed == null ? null : _slpClock(n.bed),
      waketime_h: r1(n.up),
      waketime: n.up == null ? null : _slpClock(n.up),
      midpoint_h: r1(mid),
      resting_hr: n.rhr, hr_min: n.hrmin, hr_max: n.hrmax,
      hrv: n.hrv, hrv_min: n.hrvmin, hrv_max: n.hrvmax,
      stress_mean: n.stress, stress_min: n.smin, stress_max: n.smax, stress_samples: n.scnt,
      spo2_avg: n.spo2, spo2_min: n.spo2min,
      calories_active: n.cal,
      steps_raw: n.steps,
      steps_phantom: p ? p.ph : null,
      steps_walked: p ? p.real : (n.steps == null ? null : n.steps),
      walk_distance_m: n.dist, active_min: n.active, floors: n.floors,
      mood_happy: n.mhappy, mood_peaceful: n.mpeace, mood_unhappy: n.mbad,
      trained: t ? 1 : 0,
      ride_count: t ? t.n : 0,
      ride_min: t ? r1(t.min) : null,
      ride_km: t ? r1(t.dist / 1000) : null,
      relative_effort: t && t.re ? t.re : null,
      ride_start: t && t.startH != null ? _slpClock(t.startH) : null,
    };
  });
}

function _slpDownload(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slpExport(fmt) {
  let rows;
  try { rows = _slpExportRows(); }
  catch (e) { console.error('sleep export failed', e); setStatus(tr('Could not build the export.'), 'error'); return; }
  if (!rows.length) return;

  const cols = _SLP_EXPORT_COLS.map(c => c[0]);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = 'ascent-health-' + stamp;
  const NOTE = 'Sleep and body metrics from a Huawei Health (TruSleep) export, joined by date to '
    + 'cycling recorded on an iGPSport head unit and synced through Strava. A night is labelled with '
    + 'the date you WOKE UP: sleep columns dated D are the sleep BEFORE training on D. Durations are '
    + 'minutes; bedtime_h and waketime_h are local decimal hours, negative before midnight. '
    + 'calories_active is the watch movement burn, not total daily expenditure. steps_phantom is an '
    + 'estimate of the steps a ride produced by shaking the wrist, fitted from your own ride hours.';

  if (fmt === 'csv') {
    /* RFC 4180: quote anything containing a comma, quote or newline. */
    const q = v => v == null ? ''
      : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const out = [cols.join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\n');
    _slpDownload(base + '.csv', 'text/csv', out);

  } else if (fmt === 'json') {
    _slpDownload(base + '.json', 'application/json', JSON.stringify({
      generated: new Date().toISOString(),
      note: NOTE,
      columns: Object.fromEntries(_SLP_EXPORT_COLS.map(c => [c[0], c[2]])),
      days: rows.length,
      data: rows,
    }, null, 2));

  } else {
    /* SQLite-compatible, and close enough to standard SQL for Postgres/MySQL. */
    const lit = v => v == null ? 'NULL'
      : typeof v === 'number' ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
    const L = ['-- ' + NOTE.replace(/(.{1,96})(\s|$)/g, '-- $1\n').slice(3).trim(),
               '', 'DROP TABLE IF EXISTS health_daily;', 'CREATE TABLE health_daily ('];
    L.push(_SLP_EXPORT_COLS.map((c, i) =>
      '  ' + c[0] + ' ' + c[1] + (i === 0 ? ' PRIMARY KEY' : '') + ',  -- ' + c[2]).join('\n').replace(/,(\s+--[^\n]*)$/, '$1'));
    L.push(');', '');
    /* Batched inserts keep the file small enough to paste into a console. */
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      L.push('INSERT INTO health_daily (' + cols.join(', ') + ') VALUES');
      L.push(chunk.map(r => '  (' + cols.map(c => lit(r[c])).join(', ') + ')').join(',\n') + ';');
      L.push('');
    }
    _slpDownload(base + '.sql', 'application/sql', L.join('\n'));
  }
}

function _slpExportHTML(A) {
  if (!A || !A.allDays || !A.allDays.length) return '';
  const cols = _SLP_EXPORT_COLS.length;
  return `
    <div class="slp-chart-card card">
      <div class="slp-chart-title">${tr('Take your data with you')}</div>
      <div class="slp-chart-sub">${trf('{0} days × {1} columns in one table — every sleep stage, body signal and daily total from the watch, joined by date to the ride Strava recorded that day. Built in your browser; nothing is uploaded.', A.allDays.length, cols)}</div>
      <div class="slp-export-btns">
        <button class="btn btn-ghost" onclick="slpExport('csv')">${tr('Download CSV')}</button>
        <button class="btn btn-ghost" onclick="slpExport('json')">${tr('Download JSON')}</button>
        <button class="btn btn-ghost" onclick="slpExport('sql')">${tr('Download SQL')}</button>
      </div>
      <div class="slp-note">${tr('CSV opens straight in Excel, Sheets or pandas. JSON carries a column dictionary describing every field and its units. SQL drops and recreates a health_daily table, so it loads into SQLite or Postgres as-is. All three share the same columns and the same night-labelling rule: a night is dated by the morning you woke up, so sleep dated D is the sleep before you rode on D.')}</div>
    </div>`;
}

function _slpDraw(nights, body) {
  const A = _slpAnalyse(nights);
  const { real, train, byDate, aT, aR, buckets, dowAgg, worst, byMonth, months,
          records, risk, yearHealth, stress, energy, bike, steps,
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

    ${_slpRecordsHTML(records)}
    ${_slpRecipeHTML(records)}
    ${_slpMonthHTML(records)}
    ${_slpRiskHTML(risk)}
    ${_slpYearHealthHTML(yearHealth)}

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

    ${_slpStressHTML(stress)}
    ${_slpEnergyHTML(energy)}
    ${_slpStepsHTML(steps)}
    ${_slpBikeHTML(bike)}
    ${_slpExportHTML(A)}
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


  /* ── charts for the records, stress, energy and bike↔body cards ── */
  if (records && records.months.length) {
    const M = records.months;
    destroyChart('slpMonthChart');
    charts['slpMonthChart'] = new Chart(document.getElementById('slpMonthChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: M.map(m => m.month),
        datasets: [
          { label: tr('Deep'), data: M.map(m => Math.round(m.deep)), backgroundColor: SLP_C.deep, stack: 's', yAxisID: 'y', order: 3 },
          { label: tr('REM'), data: M.map(m => Math.round(m.rem)), backgroundColor: SLP_C.rem, stack: 's', yAxisID: 'y', order: 3 },
          { label: tr('Light'), data: M.map(m => Math.round(m.light)), backgroundColor: SLP_C.light, stack: 's', yAxisID: 'y', order: 3 },
          { label: tr('Nights under 6h (%)'), data: M.map(m => Math.round(100 * m.under6 / m.nights)),
            type: 'line', borderColor: SLP_C.bad, backgroundColor: SLP_C.bad, tension: .35, pointRadius: 2, yAxisID: 'y1', order: 1 },
        ],
      },
      options: (() => {
        const o = chartOpts('min', true);
        o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
        o.scales.y1 = { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: SLP_C.bad, font: { size: 10 } } };
        return o;
      })(),
    });
  }

  if (stress) {
    destroyChart('slpStressMonthChart');
    charts['slpStressMonthChart'] = new Chart(document.getElementById('slpStressMonthChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: stress.monthly.map(m => m.m),
        datasets: [
          { label: tr('Daily high'), data: stress.monthly.map(m => +m.max.toFixed(1)), borderColor: 'rgba(239,68,68,.5)', backgroundColor: 'rgba(239,68,68,.10)', tension: .35, pointRadius: 0, fill: '+1' },
          { label: tr('Daily average'), data: stress.monthly.map(m => +m.mean.toFixed(1)), borderColor: '#fbbf24', backgroundColor: '#fbbf24', tension: .35, pointRadius: 2, borderWidth: 2.5 },
          { label: tr('Daily low'), data: stress.monthly.map(m => +m.min.toFixed(1)), borderColor: 'rgba(34,197,94,.5)', backgroundColor: 'rgba(34,197,94,.10)', tension: .35, pointRadius: 0 },
        ],
      },
      options: (() => { const o = chartOpts('', true); o.scales.y.beginAtZero = true; return o; })(),
    });

    destroyChart('slpStressDowChart');
    charts['slpStressDowChart'] = new Chart(document.getElementById('slpStressDowChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: stress.byDow.map(d => tr(d.label)),
        datasets: [{ label: tr('Average stress'), data: stress.byDow.map(d => +d.stress.toFixed(1)),
          backgroundColor: stress.byDow.map(d => d.stress >= 60 ? SLP_C.bad : d.stress >= 30 ? '#fbbf24' : SLP_C.good) }],
      },
      options: (() => { const o = chartOpts(''); o.scales.y.beginAtZero = true; return o; })(),
    });
  }

  if (energy) {
    destroyChart('slpEnergyChart');
    charts['slpEnergyChart'] = new Chart(document.getElementById('slpEnergyChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: energy.months,
        datasets: [
          { label: tr('Active kcal a day'), data: energy.monthly.map(m => Math.round(m.cal)), backgroundColor: 'rgba(252,76,2,.65)', yAxisID: 'y', order: 2 },
          { label: tr('Steps a day'), data: energy.monthly.map(m => Math.round(m.steps)), type: 'line', borderColor: SLP_C.light, backgroundColor: SLP_C.light, tension: .35, pointRadius: 2, yAxisID: 'y1', order: 1 },
        ],
      },
      options: (() => {
        const o = chartOpts('', true);
        o.scales.y.beginAtZero = true;
        o.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: SLP_C.light, font: { size: 10 } } };
        return o;
      })(),
    });
  }

  if (steps) {
    /* Monthly means of what the watch claimed against what survives the ride
       correction, so the size of the illusion is visible over time. */
    const byMo = new Map();
    steps.corrected.forEach(c => {
      const m = c.date.slice(0, 7);
      if (!byMo.has(m)) byMo.set(m, []);
      byMo.get(m).push(c);
    });
    const mos = [...byMo.keys()].sort();
    destroyChart('slpStepsChart');
    charts['slpStepsChart'] = new Chart(document.getElementById('slpStepsChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: mos,
        datasets: [
          { label: tr('Steps you actually walked'), data: mos.map(m => Math.round(_slpMean(byMo.get(m).map(c => c.real)))), backgroundColor: SLP_C.good, stack: 's' },
          { label: tr('Phantom steps from riding'), data: mos.map(m => Math.round(_slpMean(byMo.get(m).map(c => c.ph)))), backgroundColor: SLP_C.awake, stack: 's' },
        ],
      },
      options: (() => {
        const o = chartOpts(tr('steps'), true);
        o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.y.beginAtZero = true;
        return o;
      })(),
    });
  }

  if (bike) {
    const LBL2 = { rest: tr('Rest day'), easy: tr('Easy'), moderate: tr('Moderate'), hard: tr('Hard') };
    const rhr = bike.rows.find(r => r.k === 'rhr'), str = bike.rows.find(r => r.k === 'stress');
    if (rhr || str) {
      destroyChart('slpBikeChart');
      charts['slpBikeChart'] = new Chart(document.getElementById('slpBikeChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: bike.KEYS.map(k => LBL2[k]),
          datasets: [
            rhr && { label: tr('Resting HR next morning (bpm)'), data: rhr.cells.map(c => c.v == null ? null : +c.v.toFixed(1)), backgroundColor: '#f87171', yAxisID: 'y', order: 2 },
            str && { label: tr('Stress next day'), data: str.cells.map(c => c.v == null ? null : +c.v.toFixed(1)), type: 'line', borderColor: '#fbbf24', backgroundColor: '#fbbf24', tension: .35, pointRadius: 4, yAxisID: 'y1', order: 1 },
          ].filter(Boolean),
        },
        options: (() => {
          const o = chartOpts('', true);
          o.scales.y.beginAtZero = false;
          o.scales.y1 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#fbbf24', font: { size: 10 } } };
          return o;
        })(),
      });
    }
  }

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

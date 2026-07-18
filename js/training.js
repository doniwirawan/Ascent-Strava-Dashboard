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

/* ── FTP / THRESHOLD CARD ────────────────────────────────────────────────────
   Promotes estimateFtp() into a proper card: watts, W/kg, an approximate
   ability band, and the basis (Strava-set / power estimate / weight estimate). */
function _trWkgLabel(wkg) {
  if (wkg >= 5.0) return 'Elite';
  if (wkg >= 4.0) return 'Excellent';
  if (wkg >= 3.3) return 'Very good';
  if (wkg >= 2.7) return 'Good';
  if (wkg >= 2.0) return 'Moderate';
  return 'Building';
}

function _trFtpCardHTML(ftpEst) {
  if (!ftpEst) return '';
  const ath = (typeof currentAthlete !== 'undefined' && currentAthlete) || {};
  const weight = ath.weight || 0;                    // kg (Strava stores metric)
  const wkg = weight > 0 ? ftpEst.value / weight : 0;
  const basisText = ftpEst.basis === 'strava'
    ? 'From your Strava profile FTP.'
    : ftpEst.basis === 'power'
      ? 'Estimated from your best sustained power (≈20-min effort × 0.95).'
      : 'Estimated from body weight (~2.5 W/kg baseline) — add power data for a sharper number.';
  const name = [ath.firstname, ath.lastname].filter(Boolean).join(' ');

  return `
    <div class="card tr-ftp">
      <div class="tr-ftp-main">
        <div class="tr-ftp-num">${ftpEst.value}<span class="tr-ftp-unit">W</span></div>
        <div class="tr-ftp-meta">
          <div class="tr-ftp-title">Functional Threshold Power${ftpEst.estimated ? ' <span class="tr-ftp-est">est.</span>' : ''}</div>
          <div class="tr-ftp-basis">${name ? name + ' · ' : ''}${basisText}</div>
        </div>
      </div>
      ${wkg > 0 ? `
      <div class="tr-ftp-wkg">
        <div class="tr-ftp-wkg-val">${wkg.toFixed(1)}<span>W/kg</span></div>
        <div class="tr-ftp-wkg-band">${_trWkgLabel(wkg)}</div>
      </div>` : `
      <div class="tr-ftp-wkg tr-ftp-wkg-empty">
        <div class="tr-ftp-wkg-hint">Add your weight on Strava for W/kg</div>
      </div>`}
    </div>`;
}

/* ── FITNESS TREND (ZONE-2) / SEASONAL / SIMILAR RIDE ─────────────────────────
   Three list-data insight cards, no extra API calls. */

const _TR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _trMonthLabel(ym) { const [y, m] = ym.split('-'); return `${_TR_MON[(+m) - 1]} ${y}`; }
function _trOrdinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// Fitness Trend: avg power & speed on Zone-2 (aerobic) rides over time.
function _trZone2Trend() {
  if (typeof hrZoneFor !== 'function') return null;
  const rides = acts.filter(a => isRide(a) && a.average_heartrate > 0 && a.average_speed > 0);
  const z2 = rides.filter(a => { const z = hrZoneFor(a.average_heartrate); return z && z.n === 2; });
  if (z2.length < 3) return null;
  z2.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const recent = z2.slice(-15);
  const months = {};
  recent.forEach(a => {
    const m = (a.start_date_local || a.start_date || '').slice(0, 7);
    const g = months[m] || (months[m] = { n: 0, spd: 0, w: 0, wn: 0 });
    g.n++; g.spd += a.average_speed;
    if (a.average_watts > 0) { g.w += a.average_watts; g.wn++; }
  });
  const rows = Object.keys(months).sort().map(m => {
    const g = months[m];
    return { month: m, kmh: kmh(g.spd / g.n), w: g.wn ? Math.round(g.w / g.wn) : null, n: g.n };
  });
  if (rows.length < 2) return null;
  const first = rows[0], last = rows[rows.length - 1];
  const spdDelta = +(last.kmh - first.kmh).toFixed(1);
  return { rows, count: recent.length, spdDelta };
}

// Seasonal Insights: best year/month, YTD vs last year, this-month strength.
function _trSeasonal() {
  const rides = acts.filter(isRide);
  if (rides.length < 8) return null;
  const today = _trToday();
  const yr = +today.slice(0, 4), md = today.slice(5); // MM-DD cutoff
  const byYear = {}, byMonth = {};
  rides.forEach(a => {
    const ds = (a.start_date_local || a.start_date || ''); if (!ds) return;
    const y = ds.slice(0, 4), m = ds.slice(0, 7);
    (byYear[y] = byYear[y] || { dist: 0 }).dist += a.distance || 0;
    const g = (byMonth[m] = byMonth[m] || { dist: 0, spd: 0, n: 0 });
    g.dist += a.distance || 0; if (a.average_speed > 0) { g.spd += a.average_speed; g.n++; }
  });
  // best year / best month by distance
  const bestYear = Object.keys(byYear).sort((a, b) => byYear[b].dist - byYear[a].dist)[0];
  const bestMonth = Object.keys(byMonth).sort((a, b) => byMonth[b].dist - byMonth[a].dist)[0];
  // YTD (Jan 1 → today's MM-DD) this year vs last year
  const ytd = y => rides.reduce((s, a) => { const ds = (a.start_date_local || a.start_date || ''); return (ds.slice(0, 4) == y && ds.slice(5, 10) <= md) ? s + (a.distance || 0) : s; }, 0);
  const ytdNow = ytd(yr), ytdPrev = ytd(yr - 1);
  const ytdPct = ytdPrev > 0 ? Math.round((ytdNow - ytdPrev) / ytdPrev * 100) : null;
  // this calendar month avg speed vs same month last year
  const curM = today.slice(0, 7), prevM = (yr - 1) + today.slice(4, 7);
  const avgKmh = m => (byMonth[m] && byMonth[m].n) ? kmh(byMonth[m].spd / byMonth[m].n) : null;
  const spdNow = avgKmh(curM), spdPrev = avgKmh(prevM);
  const spdDelta = (spdNow != null && spdPrev != null) ? +(spdNow - spdPrev).toFixed(1) : null;
  return {
    bestYear, bestYearKm: byYear[bestYear].dist,
    bestMonth, bestMonthKm: byMonth[bestMonth].dist,
    ytdNow, ytdPct, curMonthName: _TR_MON[+today.slice(5, 7) - 1], spdDelta,
  };
}

// Similar Ride: rank the latest ride among past rides of similar distance/elevation.
function _trSimilar() {
  const rides = acts.filter(a => isRide(a) && a.distance > 0)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  if (rides.length < 4) return null;
  const cur = rides[0], curElev = cur.total_elevation_gain || 0;
  const similar = rides.slice(1).filter(a => {
    if (Math.abs((a.distance - cur.distance) / cur.distance) > 0.15) return false;
    if (curElev > 50) { const er = Math.abs(((a.total_elevation_gain || 0) - curElev) / curElev); if (er > 0.4) return false; }
    return true;
  }).slice(0, 12);
  if (similar.length < 2) return null;
  const pool = [cur, ...similar];
  const rank = (val, key, desc) => {
    const arr = pool.map(x => x[key] || 0).sort((a, b) => desc ? b - a : a - b);
    return arr.indexOf(val) + 1;
  };
  return {
    cur, n: similar.length, total: pool.length,
    spdRank: rank(cur.average_speed || 0, 'average_speed', true),
    hrRank: cur.average_heartrate ? rank(cur.average_heartrate, 'average_heartrate', false) : null,
    climbRank: rank(curElev, 'total_elevation_gain', true),
  };
}

// Climbing Ability: ride-level climbing rate, gradient, best VAM.
function _trClimbing() {
  const rides = acts.filter(a => isRide(a) && a.moving_time > 0 && a.distance > 0);
  if (rides.length < 3) return null;
  let totElev = 0, totTime = 0, totDist = 0, bestVam = null;
  rides.forEach(a => {
    const elev = a.total_elevation_gain || 0, hrs = a.moving_time / 3600;
    totElev += elev; totTime += a.moving_time; totDist += a.distance;
    const grad = elev / a.distance;
    if (hrs >= 0.5 && grad >= 0.015) { const vam = elev / hrs; if (!bestVam || vam > bestVam.vam) bestVam = { vam, a }; }
  });
  return {
    mPerHour: totTime > 0 ? totElev / (totTime / 3600) : 0,
    avgGrad: totDist > 0 ? totElev / totDist * 100 : 0,
    elevPerKm: totDist > 0 ? totElev / (totDist / 1000) : 0,
    bestVam,
  };
}

// Personal Records Explorer: fun bests from list data (weather-based ones need
// the 🌦 upgrade). Each record → {label, value, ride, date} or null when absent.
function _trPRRecords() {
  const rides = acts.filter(isRide);
  if (rides.length < 3) return null;
  const maxBy = (f, filter) => { let best = null, bv = -Infinity; rides.forEach(a => { if (filter && !filter(a)) return; const v = f(a); if (v > bv) { bv = v; best = a; } }); return best; };
  const minBy = (f, filter) => { let best = null, bv = Infinity; rides.forEach(a => { if (filter && !filter(a)) return; const v = f(a); if (v < bv) { bv = v; best = a; } }); return best; };
  const z2 = a => { const z = (typeof hrZoneFor === 'function') && a.average_heartrate > 0 && hrZoneFor(a.average_heartrate); return z && z.n === 2; };
  const rec = (label, a, val) => a ? { label, value: val, name: a.name || 'Ride', date: a.start_date } : null;

  const list = [
    rec('Longest ride', maxBy(a => a.distance || 0), a => fmtD(a.distance)),
    rec('Biggest climbing day', maxBy(a => a.total_elevation_gain || 0), a => fmtElev(a.total_elevation_gain || 0)),
    rec('Fastest century', maxBy(a => a.average_speed || 0, a => a.distance >= 100000), a => fmtSpeed(a.average_speed)),
    rec('Longest Zone-2 ride', maxBy(a => a.moving_time || 0, z2), a => fmtT(a.moving_time)),
    rec('Highest avg cadence', maxBy(a => a.average_cadence || 0, a => a.average_cadence > 0), a => Math.round(a.average_cadence) + ' rpm'),
    rec('Highest avg power', maxBy(a => a.average_watts || 0, a => a.average_watts > 0), a => Math.round(a.average_watts) + ' W'),
    rec('Hottest ride', maxBy(a => a.average_temp != null ? a.average_temp : -999, a => a.average_temp != null), a => Math.round(a.average_temp) + '°C'),
    rec('Coldest ride', minBy(a => a.average_temp != null ? a.average_temp : 999, a => a.average_temp != null), a => Math.round(a.average_temp) + '°C'),
  ].filter(Boolean);
  // resolve value fns
  return list.map(r => ({ label: r.label, name: r.name, date: r.date, value: r.value(rides.find(a => (a.name || 'Ride') === r.name && a.start_date === r.date) || {}) }));
}

// Ride Quality Score: latest ride scored 0–100 by percentile vs the athlete's
// own ride history (endurance / climbing / efficiency / effort).
function _trRideQuality() {
  const rides = acts.filter(a => isRide(a) && a.moving_time > 0);
  if (rides.length < 8) return null;
  const cur = rides.slice().sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0];
  const pct = (val, arr) => { const s = arr.filter(v => v > 0).sort((a, b) => a - b); if (!s.length) return null; let c = 0; s.forEach(v => { if (v <= val) c++; }); return c / s.length; };
  const endurance = pct(cur.moving_time || 0, rides.map(a => a.moving_time || 0));
  const climbing = pct(cur.total_elevation_gain || 0, rides.map(a => a.total_elevation_gain || 0));
  const efficiency = pct(cur.average_speed || 0, rides.map(a => a.average_speed || 0));
  const effVal = cur.suffer_score || cur.average_heartrate || 0;
  const effort = effVal ? pct(effVal, rides.map(a => a.suffer_score || a.average_heartrate || 0)) : null;
  const parts = [endurance, climbing, efficiency, effort].filter(v => v != null);
  const overall = Math.round(parts.reduce((s, v) => s + v, 0) / parts.length * 100);
  const s10 = v => v == null ? null : +(v * 10).toFixed(1);
  return { cur, overall, endurance: s10(endurance), climbing: s10(climbing), efficiency: s10(efficiency), effort: s10(effort) };
}

function _trTrendsHTML() {
  let html = '';

  // Climbing Ability
  const cl = _trClimbing();
  if (cl) {
    const tile = (val, unit, lbl, sub) => `<div class="tr-seas-tile"><div class="tr-seas-val">${val}<span style="font-size:13px;font-weight:700;color:var(--muted);margin-left:2px">${unit}</span></div><div class="tr-seas-lbl">${lbl}</div>${sub ? `<div class="tr-tile-sub">${sub}</div>` : ''}</div>`;
    html += `<div class="card tr-seas">
      <div class="tr-chart-title">Climbing Ability</div>
      <div class="tr-seas-grid">
        ${tile(Math.round(cl.mPerHour), 'm/h', 'Climb rate', 'elevation per moving hour')}
        ${tile(cl.avgGrad.toFixed(1), '%', 'Avg gradient', 'net climb over distance')}
        ${tile(Math.round(cl.elevPerKm), 'm/' + distUnit(), 'Elevation density', 'climb per ' + distUnit())}
        ${cl.bestVam ? tile(Math.round(cl.bestVam.vam), 'VAM', 'Best ride', (cl.bestVam.a.name || 'Ride')) : tile('—', '', 'Best VAM', 'no sustained climbs')}
      </div>
      <div class="tr-basis-note">Ride-level estimate — per-climb VAM from GPS streams is a future upgrade.</div>
    </div>`;
  }

  // Fitness Trend

  // Fitness Trend
  const ft = _trZone2Trend();
  if (ft) {
    const rows = ft.rows.map(r => `<tr>
      <td>${_trMonthLabel(r.month)}</td><td>${r.n}</td>
      <td>${r.w != null ? r.w + ' W' : '—'}</td><td>${r.kmh.toFixed(1)} ${speedUnit()}</td>
    </tr>`).join('');
    const trend = ft.spdDelta > 0 ? `<span style="color:#22c55e">▲ +${ft.spdDelta} ${speedUnit()}</span> at the same aerobic effort`
      : ft.spdDelta < 0 ? `<span style="color:#ef4444">▼ ${ft.spdDelta} ${speedUnit()}</span> at the same aerobic effort`
      : 'holding steady at the same aerobic effort';
    html += `<div class="card tr-trend">
      <div class="tr-chart-title">Fitness Trend — last ${ft.count} Zone-2 rides</div>
      <div class="tr-trend-sub">Speed on easy aerobic rides ${trend}. Rising numbers at Zone 2 signal real fitness gains.</div>
      <div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>Month</th><th>Rides</th><th>Avg power</th><th>Avg speed</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }

  // Seasonal Insights
  const se = _trSeasonal();
  if (se) {
    const tile = (val, lbl, color) => `<div class="tr-seas-tile"><div class="tr-seas-val" style="color:${color || 'var(--text)'}">${val}</div><div class="tr-seas-lbl">${lbl}</div></div>`;
    const ytdCol = se.ytdPct == null ? 'var(--text)' : se.ytdPct >= 0 ? '#22c55e' : '#ef4444';
    const ytdVal = se.ytdPct == null ? '—' : (se.ytdPct >= 0 ? '+' : '') + se.ytdPct + '%';
    const spdCol = se.spdDelta == null ? 'var(--text)' : se.spdDelta >= 0 ? '#22c55e' : '#ef4444';
    const spdVal = se.spdDelta == null ? '—' : (se.spdDelta >= 0 ? '+' : '') + se.spdDelta + ' ' + speedUnit();
    html += `<div class="card tr-seas">
      <div class="tr-chart-title">Seasonal Insights</div>
      <div class="tr-seas-grid">
        ${tile(Math.round(kmVal(se.bestYearKm)).toLocaleString() + ' ' + distUnit(), 'Biggest year · ' + se.bestYear, 'var(--orange)')}
        ${tile(Math.round(kmVal(se.bestMonthKm)).toLocaleString() + ' ' + distUnit(), 'Biggest month · ' + _trMonthLabel(se.bestMonth))}
        ${tile(ytdVal, 'Distance vs same point last year', ytdCol)}
        ${tile(spdVal, se.curMonthName + ' avg speed vs last year', spdCol)}
      </div>
    </div>`;
  }

  // Personal Records Explorer
  const pr = _trPRRecords();
  if (pr && pr.length) {
    const tiles = pr.map(r => `<div class="tr-pr-tile">
      <div class="tr-pr-val">${r.value}</div>
      <div class="tr-pr-lbl">${r.label}</div>
      <div class="tr-pr-ride">${r.name} · ${fmtDt(r.date)}</div>
    </div>`).join('');
    html += `<div class="card tr-seas">
      <div class="tr-chart-title">Personal Records Explorer</div>
      <div class="tr-pr-grid">${tiles}</div>
    </div>`;
  }

  // Ride Quality Score
  const rq = _trRideQuality();
  if (rq) {
    const col = rq.overall >= 80 ? '#22c55e' : rq.overall >= 60 ? '#fb923c' : '#ef4444';
    const bar = (lbl, v) => v == null ? '' : `<div class="tr-rq-row">
      <span class="tr-rq-lbl">${lbl}</span>
      <span class="tr-rq-track"><span style="width:${v * 10}%;background:${col}"></span></span>
      <span class="tr-rq-num">${v.toFixed(1)}</span>
    </div>`;
    html += `<div class="card tr-rq">
      <div class="tr-chart-title">Ride Quality Score — latest ride</div>
      <div class="tr-rq-grid">
        <div class="tr-rq-overall">
          <div class="tr-rq-big" style="color:${col}">${rq.overall}<span>/100</span></div>
          <div class="tr-rq-name">${rq.cur.name || 'Ride'}</div>
        </div>
        <div class="tr-rq-bars">
          ${bar('Endurance', rq.endurance)}
          ${bar('Climbing', rq.climbing)}
          ${bar('Efficiency', rq.efficiency)}
          ${bar('Effort', rq.effort)}
        </div>
      </div>
      <div class="tr-basis-note">Each dimension is this ride's percentile against your own ride history.</div>
    </div>`;
  }

  // Similar Ride
  const si = _trSimilar();
  if (si) {
    const chip = (rank, total, best, word) => `<span class="tr-sim-chip${rank === 1 ? ' tr-sim-best' : ''}">${rank === 1 ? best : _trOrdinal(rank) + ' ' + word} <span class="tr-sim-of">of ${total}</span></span>`;
    const chips = [
      chip(si.spdRank, si.total, 'Fastest', 'fastest'),
      si.hrRank ? chip(si.hrRank, si.total, 'Lowest HR', 'lowest HR') : '',
      chip(si.climbRank, si.total, 'Most climbing', 'most climbing'),
    ].filter(Boolean).join('');
    html += `<div class="card tr-sim">
      <div class="tr-chart-title">Similar Ride Comparison</div>
      <div class="tr-sim-head">Your latest ride — <b>${si.cur.name || 'Ride'}</b> · ${fmtD(si.cur.distance)}, ${fmtElev(si.cur.total_elevation_gain || 0)} — vs ${si.n} similar past ride${si.n === 1 ? '' : 's'}:</div>
      <div class="tr-sim-chips">${chips}</div>
    </div>`;
  }
  return html;
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
    ${_trFtpCardHTML(d.ftpEst)}
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

    ${_trConsistencyHTML()}
    ${_trTrendsHTML()}
    ${typeof _trPowerCurveHTML === 'function' ? _trPowerCurveHTML() : ''}
    ${typeof _trHrDecouplingHTML === 'function' ? _trHrDecouplingHTML() : ''}`;

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

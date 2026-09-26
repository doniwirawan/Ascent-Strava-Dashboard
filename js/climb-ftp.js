/* ── CLIMB POWER (FTP without a power meter) ──────────────────────────────────
   Without a meter Strava's watts are its own guess from speed, and FTP / VO2max
   built on them are guesses of guesses. On a sustained climb, though, power is
   mostly lifting weight — P ≈ m·g·(vertical speed) — which the altitude stream
   measures directly; rolling resistance and (small, at climbing speed) aero
   drag are added from physics.

   Climbs are rarely ridden all-out, so the best climb alone undersells FTP.
   Instead every steady 8-min climbing window becomes a (heart rate, watts)
   point; a robust line through them (Theil–Sen, so altimeter glitches don't
   drag it) is read at threshold HR for FTP and at max HR for VO2max power.

   Streams: time, altitude, distance, moving, heartrate — fetched once per ride
   and reduced to a few points cached in localStorage (strava_climbp_<id>).
   On-demand and owner-gated, like the Power Curve (Strava's rate limit is per
   app, shared by every visitor). */

const CP_WIN = 480;                    // seconds per climbing window
const CP_MIN_GRADE = 0.03;             // steep enough that lifting weight dominates
const CP_MAX_RIDES = 40;               // the hilliest rides; caps the stream fetch
const CP_MIN_GAIN_M = 250;             // rides with less climbing rarely hold 8 min uphill
const CP_MIN_POINTS = 8;               // fewer than this and the line means little
const CP_LTHR_FRAC = 0.89;             // threshold HR ≈ 89% of max HR (cyclists)
const CP_AGG_KEY = 'strava_climbp_agg';
const CP_KIT_KG = 1.5;                 // shoes, helmet, bottles, head unit
const CP_BIKE_KG_DEFAULT = 10;
// Physics constants: rolling resistance, drag area (hoods), air density (warm,
// near sea level), drivetrain efficiency.
const CP_CRR = 0.005, CP_CDA = 0.40, CP_RHO = 1.15, CP_ETA = 0.97, CP_G = 9.81;

// Pure: power (W) to hold speed v (m/s) while rising at vz (m/s), total mass m.
function cpPower(m, v, vz) {
  return (m * CP_G * vz + CP_CRR * m * CP_G * v + 0.5 * CP_RHO * CP_CDA * v * v * v) / CP_ETA;
}

// Pure: streams → non-overlapping steady climbing windows [{w, hr, grade, vam, kmh}].
// A window must be ≥3% on average, moving ≥95% of the time, carry heart rate,
// and contain no single-sample altitude jump (altimeter glitch).
function cpPointsFromStreams(s, massKg) {
  const T = s.time, H = s.altitude, D = s.distance, M = s.moving, HR = s.heartrate;
  if (!T || !H || !D || !HR || T.length < 10) return [];
  const n = T.length;
  if (H.length !== n || D.length !== n || HR.length !== n) return [];
  const mov = new Int32Array(n + 1), bad = new Int32Array(n + 1), hr = new Float64Array(n + 1), hrN = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    mov[i + 1] = mov[i] + ((!M || M[i]) ? 1 : 0);
    const dt = i ? Math.max(1, T[i] - T[i - 1]) : 1;
    bad[i + 1] = bad[i] + ((i && Math.abs(H[i] - H[i - 1]) / dt > 3) ? 1 : 0);
    const h = HR[i] > 40 ? HR[i] : 0;
    hr[i + 1] = hr[i] + h; hrN[i + 1] = hrN[i] + (h ? 1 : 0);
  }
  const pts = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (j < i) j = i;
    while (j < n - 1 && T[j] - T[i] < CP_WIN) j++;
    const dt = T[j] - T[i];
    if (dt < CP_WIN || dt > CP_WIN * 1.1) continue;         // gap in the recording
    const k = j - i + 1;
    if ((mov[j + 1] - mov[i]) / k < 0.95 || bad[j + 1] - bad[i] > 0) continue;
    if ((hrN[j + 1] - hrN[i]) / k < 0.9) continue;
    const dz = H[j] - H[i], dd = D[j] - D[i];
    if (dd <= 0 || dz / dd < CP_MIN_GRADE) continue;
    const v = dd / dt, vz = dz / dt;
    if (v < 1.2 || v > 12 || vz * 3600 > 1600) continue;    // > 1600 m/h VAM is pro-level
    pts.push({
      w: Math.round(cpPower(massKg, v, vz)),
      hr: Math.round((hr[j + 1] - hr[i]) / (hrN[j + 1] - hrN[i])),
      grade: +(dz / dd * 100).toFixed(1), vam: Math.round(vz * 3600), kmh: +(v * 3.6).toFixed(1),
    });
    i = j;                                                  // next window starts after this one
  }
  return pts;
}

// Pure: Theil–Sen line watts = a + b·hr (median of pairwise slopes).
function cpFit(pts) {
  if (!pts || pts.length < CP_MIN_POINTS) return null;
  const sl = [];
  for (let i = 0; i < pts.length; i++)
    for (let k = i + 1; k < pts.length; k++)
      if (Math.abs(pts[k].hr - pts[i].hr) >= 3) sl.push((pts[k].w - pts[i].w) / (pts[k].hr - pts[i].hr));
  if (sl.length < 10) return null;
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const b = med(sl);
  if (!(b > 0)) return null;
  const a = med(pts.map(p => p.w - b * p.hr));
  const hrs = pts.map(p => p.hr);
  return { a, b, n: pts.length, hrLo: Math.min(...hrs), hrHi: Math.max(...hrs) };
}

// Bike weight from Strava (/gear/{id} has it; the athlete summary doesn't), cached.
async function _cpBikeKg(gearId) {
  if (!gearId) return CP_BIKE_KG_DEFAULT;
  const ck = 'strava_gear_kg_' + gearId;
  try { const c = parseFloat(localStorage.getItem(ck)); if (c > 0) return c; } catch {}
  try {
    const g = await api(`/gear/${gearId}`);
    if (g && g.weight > 0) { try { localStorage.setItem(ck, String(g.weight)); } catch {} return g.weight; }
  } catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) throw e; }
  return CP_BIKE_KG_DEFAULT;
}

// Per-ride climbing points, localStorage-first. Throws on 429.
async function _cpPointsForRide(a) {
  const ck = 'strava_climbp_' + a.id;
  const mass = Math.round((athWeightKg() + await _cpBikeKg(a.gear_id) + CP_KIT_KG) * 10) / 10;
  // cached per mass: a new body weight means the watts must be recomputed
  try { const c = localStorage.getItem(ck); if (c) { const o = JSON.parse(c); if (o && o.v === 2 && o.m === mass) return o.pts; } } catch {}
  let raw;
  try { raw = await api(`/activities/${a.id}/streams?keys=time,altitude,distance,moving,heartrate&key_by_type=true`); }
  catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) throw e; return []; }
  const pick = k => raw && raw[k] && raw[k].data;
  const pts = cpPointsFromStreams({ time: pick('time'), altitude: pick('altitude'), distance: pick('distance'), moving: pick('moving'), heartrate: pick('heartrate') }, mass);
  try { localStorage.setItem(ck, JSON.stringify({ v: 2, m: mass, pts })); } catch {}
  return pts;
}

function cpLoadAgg() { try { const o = JSON.parse(localStorage.getItem(CP_AGG_KEY)); return o && o.v === 2 ? o : null; } catch { return null; } }
function _cpSaveAgg(a) { try { localStorage.setItem(CP_AGG_KEY, JSON.stringify(a)); } catch {} }

// Threshold / max HR used to read the line.
function _cpHrMax() { return (typeof observedMaxHr === 'function' && observedMaxHr()) || 0; }

// FTP (W) from the climb line at threshold HR, or null before a scan.
function climbFtp() {
  const agg = cpLoadAgg(), hrMax = _cpHrMax();
  if (!agg || !agg.fit || !hrMax) return null;
  const w = agg.fit.a + agg.fit.b * hrMax * CP_LTHR_FRAC;
  return w > 0 ? Math.round(w) : null;
}
// Power at max HR (≈ power at VO2max), or null.
function climbPmax() {
  const agg = cpLoadAgg(), hrMax = _cpHrMax();
  if (!agg || !agg.fit || !hrMax) return null;
  const w = agg.fit.a + agg.fit.b * hrMax;
  return w > 0 ? Math.round(w) : null;
}

function _cpPool() {
  return acts.filter(a => isRide(a) && a.id && a.has_heartrate && !a.trainer && a.sport_type !== 'VirtualRide' && (a.total_elevation_gain || 0) >= CP_MIN_GAIN_M)
    .sort((a, b) => (b.total_elevation_gain || 0) - (a.total_elevation_gain || 0))
    .slice(0, CP_MAX_RIDES);
}

function _cpMarkup(agg, opts = {}) {
  const hrMax = _cpHrMax(), lthr = Math.round(hrMax * CP_LTHR_FRAC);
  let html = '';
  if (agg.fit) {
    const f = agg.fit, at = h => Math.round(f.a + f.b * h);
    html += `<div class="cp-row"><span class="cp-lbl">${tr('Line')}</span><span class="cp-w">+${f.b.toFixed(1)} W</span><span class="cp-ctx">${trf('per extra bpm, from {0} climbs ({1}–{2} bpm)', f.n, f.hrLo, f.hrHi)}</span></div>`;
    html += `<div class="cp-row"><span class="cp-lbl">FTP</span><span class="cp-w">${at(lthr)} W</span><span class="cp-ctx">${trf('at threshold HR ≈ {0} bpm (89% of your {1} max)', lthr, hrMax)}</span></div>`;
    html += `<div class="cp-row"><span class="cp-lbl">${tr('At max HR')}</span><span class="cp-w">${at(hrMax)} W</span><span class="cp-ctx">${tr('≈ power at VO₂max (used for the VO₂max estimate)')}</span></div>`;
  } else {
    html += `<div class="tr-basis-note">${trf('Only {0} steady climbs with heart rate so far — need {1} for a reliable line.', agg.count, CP_MIN_POINTS)}</div>`;
  }
  if (agg.top) html += `<div class="cp-row"><span class="cp-lbl">${tr('Hardest climb')}</span><span class="cp-w">${agg.top.w} W</span><span class="cp-ctx"><a href="#" onclick="openActivityModal('${agg.top.id}');return false">${agg.top.name}</a> · 8 min · ${agg.top.grade}% · VAM ${agg.top.vam} m/h · ${agg.top.hr} bpm</span></div>`;
  html += `<div class="tr-basis-note">${opts.progress
    ? trf('Scanning climbs… {0}', opts.progress)
    : trf('Watts from the altitude of your {0} hilliest rides at {1} kg total — not Strava’s estimated watts.', agg.rides, agg.mass)}</div>`;
  if (opts.note) html += `<div class="tr-basis-note">${opts.note}</div>`;
  if (opts.button) html += `<button class="tr-ai-btn" style="margin-top:10px" onclick="computeClimbPower()">${opts.button}</button>`;
  return html;
}

// Training card. Only without a real power meter (then the Power Curve is better).
function _trClimbPowerHTML() {
  if (typeof acts === 'undefined' || acts.some(a => isRide(a) && a.device_watts === true && a.average_watts > 0)) return '';
  if (!_cpPool().length) return '';
  const owner = (typeof _isHrzOwner === 'function') && _isHrzOwner();
  const agg = cpLoadAgg();
  let inner;
  if (agg && agg.rides) inner = _cpMarkup(agg, { button: owner ? tr('Rescan climbs') : null, note: agg.partial ? tr('Partial — rate-limited last time; click to resume (done rides are cached).') : '' });
  else if (owner) inner = `<div class="tr-basis-note">${tr('No power meter, so Strava’s watts are guesses. Your climbs give a real number: going uphill, power is mostly lifting your weight, which the altitude data measures. Paired with your heart rate, even easy climbs reveal your threshold.')}</div>
      <button class="tr-ai-btn" style="margin-top:10px" onclick="computeClimbPower()">${tr('Scan my climbs')}</button>`;
  else inner = `<div class="tr-basis-note">${tr("The power curve is computed on the owner's device — it fetches ride streams, and Strava's rate limit is shared across the app.")}</div>`;
  return `<div class="card tr-pc">
    <div class="tr-chart-title">${tr('Climbing Power')} <span class="gm-hint">${tr('FTP without a power meter')}</span></div>
    <div id="cpBody">${inner}</div>
  </div>`;
}

let _cpRunning = false;
async function computeClimbPower() {
  const body = document.getElementById('cpBody');
  if (!body || _cpRunning) return;
  if (!(typeof _isHrzOwner === 'function' && _isHrzOwner())) return;
  const pool = _cpPool();
  _cpRunning = true;
  const agg = { v: 2, rides: 0, count: 0, pts: [], top: null, mass: Math.round((athWeightKg() + CP_BIKE_KG_DEFAULT + CP_KIT_KG) * 10) / 10 };
  let done = 0, stopped = false;
  for (const a of pool) {
    try {
      const pts = await _cpPointsForRide(a);
      agg.rides++;
      pts.forEach(p => {
        agg.pts.push({ w: p.w, hr: p.hr });
        if (!agg.top || p.w > agg.top.w) agg.top = { ...p, id: a.id, name: a.name || 'Ride' };
      });
    } catch (e) { stopped = true; break; }
    done++;
    agg.count = agg.pts.length;
    if (done % 3 === 0) body.innerHTML = _cpMarkup(agg, { progress: `${done}/${pool.length}` });
  }
  agg.count = agg.pts.length;
  agg.fit = cpFit(agg.pts);
  agg.partial = stopped;
  _cpSaveAgg(agg);
  _cpRunning = false;
  // FTP, W/kg, VO2max and the run predictions all read from this — redraw the page.
  if (typeof renderTraining === 'function') renderTraining();
}

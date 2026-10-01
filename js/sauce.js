/* ── SAUCE MODEL — estimated power without a power meter ─────────────────────
   Maths ported from Sauce for Strava (github.com/SauceLLC/sauce4strava —
   src/common/lib.js and src/common/eftp.mjs), MIT License,
   Copyright (c) 2015 Justin Mayfield. Full notice: licenses/sauce4strava.txt.

   Without a meter, every second of a ride gets a watts value from physics:
   gravity + rolling resistance + aero drag + acceleration, from the speed,
   grade, rider + bike weight and the bike's tyres/position (Sauce's
   cyclingPowerEstimate, plus a kinetic term). From that 1 Hz stream:
     · peaks at each duration, with stops removed rather than counted as 0 W
       (Sauce's Break semantics), so a café stop doesn't sink a 20-min best
     · NP / IF / TSS → feeds Training load for rides with no real power
     · Morton critical power (CP) and W′ fitted over the whole power curve
     · W′ balance per ride, hrTSS (Sauce's TRIMP-based tTSS), heart-rate /
       speed / VAM peaks, Coggan power-profile rank, calories as food
   Full-res streams cost one API call per ride on the app-shared rate limit,
   so the bulk scan is owner-only and every ride's result is cached
   (strava_sauce_<id>), including its watts stream packed as deflated varints. */

const SP_WINDOWS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const SP_LABELS = { 5: '5s', 15: '15s', 30: '30s', 60: '1min', 120: '2min', 300: '5min', 600: '10min', 1200: '20min', 1800: '30min', 3600: '60min' };
const SP_SHOW = [5, 60, 300, 1200, 3600];            // rows in the curve card
const SP_FIT = [120, 300, 600, 1200, 1800, 3600];   // durations the CP model fits
const SP_MAX_RIDES = 60;
const SP_BREAK_S = 10;                               // a gap longer than this is a pause
const SP_KIT_KG = 1.5;
const SP_KEYS = 'time,velocity_smooth,grade_smooth,altitude,moving,heartrate';
const SP_AGG_KEY = 'strava_sauce_agg';
const SP_V = 1;
// Tyres and position per Strava frame_type (1 MTB, 2 cross, 3 road, 4 TT, 5 gravel).
const SP_BIKES = {
  1: { crr: 0.012, cda: 0.50, label: 'MTB' },
  2: { crr: 0.008, cda: 0.40, label: 'cross' },
  3: { crr: 0.005, cda: 0.36, label: 'road' },
  4: { crr: 0.005, cda: 0.28, label: 'TT' },
  5: { crr: 0.008, cda: 0.40, label: 'gravel' },
};

/* ── Physics (Sauce lib.js: gravityForce, rollingResistanceForce,
   aeroDragForce, airDensity, cyclingPowerEstimate) ── */
const SP_G = 9.80655;
function spAirDensity(el, tempC) {
  const p0 = 1.225, M0 = 0.0289644, R = 8.3144598, T0 = 288.15;
  const rho = p0 * Math.exp((-SP_G * M0 * (el || 0)) / (R * T0));
  return tempC != null ? rho * T0 / (273.15 + tempC) : rho;   // warm air is thinner
}
// Watts to hold speed v (m/s) on slope (rise/run), total mass m, accelerating at acc (m/s²).
function spPowerAt(v, slope, m, bike, rho, acc = 0) {
  const th = Math.atan(slope || 0);
  const Fg = SP_G * Math.sin(th) * m;
  const Fr = SP_G * Math.cos(th) * m * bike.crr;
  const Fa = 0.5 * bike.cda * rho * v * v;
  return (Fg + Fr + Fa + m * acc) * v / (1 - 0.035);           // 3.5% drivetrain loss
}

/* ── Streams → 1 Hz "active" series. Each sample fills the seconds since the
   previous one; stopped samples and gaps over SP_BREAK_S are dropped, so
   windows run across pauses instead of averaging them in. ── */
function _spActive(s, cols) {
  const T = s.time, M = s.moving, out = cols.map(() => []);
  for (let i = 1; i < T.length; i++) {
    const dt = T[i] - T[i - 1];
    if (dt <= 0 || dt > SP_BREAK_S || (M && !M[i])) continue;
    for (let c = 0; c < cols.length; c++) {
      const v = cols[c][i];
      for (let k = 0; k < dt; k++) out[c].push(v);
    }
  }
  return out;
}
// Best mean over each window — sliding sum; null-safe (null counts as 0).
function _spBest(arr, windows) {
  const best = {};
  for (const w of windows) {
    if (arr.length < w) continue;
    let sum = 0;
    for (let i = 0; i < w; i++) sum += arr[i] || 0;
    let mx = sum;
    for (let i = w; i < arr.length; i++) { sum += (arr[i] || 0) - (arr[i - w] || 0); if (sum > mx) mx = sum; }
    best[w] = mx / w;
  }
  return best;
}
// Normalized Power (Sauce calcNP): 30 s rolling mean, 4th-power mean, 4th root.
function spNP(w) {
  if (!w || w.length < 300) return null;
  let sum = 0, tot = 0, n = 0;
  for (let i = 0; i < w.length; i++) {
    sum += w[i] - (i >= 30 ? w[i - 30] : 0);
    if (i >= 29) { const a = sum / 30; tot += a * a * a * a; n++; }
  }
  return n ? (tot / n) ** 0.25 : null;
}
function spTSS(np, secs, ftp) { return np > 0 && ftp > 0 ? (secs * np * (np / ftp)) / (ftp * 3600) * 100 : null; }

// Pure: raw streams + profile → per-second estimated watts (same length as time).
function spEstimateWatts(s, mass, bike, tempC) {
  const T = s.time, V = s.velocity, Gr = s.grade, A = s.altitude, n = T.length;
  const w = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const v = V[i] || 0;
    if (v < 0.5 || (s.moving && !s.moving[i])) continue;
    const slope = Math.max(-0.25, Math.min(0.25, (Gr && Gr[i] || 0) / 100));
    // Acceleration over ~5 s, so GPS speed jitter can't fake sprint watts.
    const j = Math.max(0, i - 5), dt = T[i] - T[j];
    const acc = dt > 0 && dt <= 15 ? Math.max(-1.5, Math.min(1.5, (v - (V[j] || 0)) / dt)) : 0;
    const p = spPowerAt(v, slope, mass, bike, spAirDensity(A ? A[i] : 0, tempC), acc);
    w[i] = Math.max(0, Math.min(2000, Math.round(p)));
  }
  return w;
}

// Pure: streams → per-ride summary (the cached record, minus the packed stream).
function spAnalyze(s, mass, bike, tempC) {
  const watts = spEstimateWatts(s, mass, bike, tempC);
  const [W, H, V, A] = _spActive(s, [watts, s.heartrate || [], s.velocity, s.altitude || []]);
  if (W.length < 120) return null;
  const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  const kj = W.reduce((t, x) => t + x, 0) / 1000;
  const hasHr = H.some(x => x > 40);
  // Climbing rate: best ascent over 5/10/20 min, in m/h.
  const vam = {};
  if (A.length && A.some(x => x != null)) for (const win of [300, 600, 1200]) {
    let mx = 0;
    for (let i = win; i < A.length; i++) if (A[i] != null && A[i - win] != null) mx = Math.max(mx, A[i] - A[i - win]);
    if (A.length >= win && mx > 0) vam[win] = Math.round(mx / win * 3600);
  }
  // HR histogram (bpm → seconds) for hrTSS, recomputable when max/rest HR change.
  const hrh = {};
  if (hasHr) for (const h of H) if (h > 40 && h < 230) hrh[h] = (hrh[h] || 0) + 1;
  return {
    v: SP_V, mass: +mass.toFixed(1), bike: bike.label, secs: W.length,
    avgW: Math.round(kj * 1000 / W.length), np: Math.round(spNP(W) || 0) || null, kj: Math.round(kj),
    best: round(_spBest(W, SP_WINDOWS)),
    hr: hasHr ? round(_spBest(H, [60, 300, 1200])) : null,
    spd: Object.fromEntries(Object.entries(_spBest(V, [60, 300, 1200, 3600])).map(([k, v]) => [k, +v.toFixed(2)])),
    vam, hrh: hasHr ? hrh : null,
    _w: W,                                            // active 1 Hz watts, packed by spRide
  };
}

/* ── Packed streams (Sauce lib.js toVarintArray + compress): a watts stream
   as unsigned varints, deflated, base64 — a 2 h ride fits in a few KB. ── */
function _spVarints(arr) {
  const out = [];
  for (let v of arr) { v = Math.max(0, v | 0); while (v > 127) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); }
  return new Uint8Array(out);
}
function _spFromVarints(buf) {
  const out = [];
  for (let i = 0, v = 0, sh = 0; i < buf.length; i++) {
    v |= (buf[i] & 127) << sh;
    if (buf[i] & 128) sh += 7; else { out.push(v); v = 0; sh = 0; }
  }
  return out;
}
async function _spPipe(bytes, Stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer());
}
async function spPack(arr) {
  let b = _spVarints(arr), z = 0;
  if (typeof CompressionStream === 'function') { try { b = await _spPipe(b, CompressionStream); z = 1; } catch {} }
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return z + ':' + btoa(s);
}
async function spUnpack(str) {
  if (!str) return null;
  const z = str[0] === '1', bin = atob(str.slice(2));
  let b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  if (z) b = await _spPipe(b, DecompressionStream);
  return _spFromVarints(b);
}

/* ── Morton critical power (Sauce eftp.mjs fitMorton):
   P = CP + W′/(t − k), least squares in CP & W′ for each k, best k kept. ── */
function spFitMorton(mmp) {
  if (!mmp || mmp.length < 3) return null;
  let best = null;
  const minT = Math.min(...mmp.map(p => p.duration));
  for (let k = 0; k <= minT * 0.9; k += 1) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const { duration: t, power: p } of mmp) { const x = 1 / (t - k); n++; sx += x; sy += p; sxx += x * x; sxy += x * p; }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) continue;
    const WPrime = (n * sxy - sx * sy) / den, CP = (sy - WPrime * sx) / n;
    let error = 0;
    for (const { duration: t, power: p } of mmp) { const r = CP + WPrime / (t - k) - p; error += r * r; }
    if (!best || error < best.error) best = { CP, WPrime, k, error };
  }
  return best && best.CP > 0 && best.WPrime > 0 ? best : null;
}

/* ── W′ balance (Sauce calcWPrimeBalDifferential — Froncioni/Skiba/Clarke) ── */
function spWPrimeBal(watts, cp, wPrime) {
  const out = new Array(watts.length);
  let bal = wPrime;
  for (let i = 0; i < watts.length; i++) {
    const p = watts[i] || 0;
    bal += p < cp ? (cp - p) * (wPrime - bal) / wPrime : cp - p;
    out[i] = bal;
  }
  return out;
}

/* ── hrTSS (Sauce tTSS / calcTRIMP): TRIMP of the ride ÷ TRIMP of an hour at
   threshold HR, × 100 — from the ride's HR histogram. ── */
function _spTrimp(secs, hrr, female) { return (secs / 60) * hrr * 0.64 * Math.exp(hrr * (female ? 1.67 : 1.92)); }
function spHrTSS(hrh, hrMax, hrRest, female) {
  if (!hrh || !(hrMax > hrRest)) return null;
  const lthr = hrMax * (typeof CP_LTHR_FRAC !== 'undefined' ? CP_LTHR_FRAC : 0.89);
  let t = 0;
  for (const bpm in hrh) {
    const h = +bpm;
    if (h < hrRest * 0.7 || h > hrMax * 1.5) continue;
    t += _spTrimp(hrh[bpm], Math.max(0, (h - hrRest) / (hrMax - hrRest)), female);
  }
  const hour = _spTrimp(3600, (lthr - hrRest) / (hrMax - hrRest), female);
  return hour > 0 ? t / hour * 100 : null;
}

/* ── Coggan power-profile rank (Sauce lib.js rankConstants / _rankScaler) ── */
const SP_RANK = {
  male: { high: [2.82, 2500, 1.4, 3.6, 6.08], low: [2, 3000, 1.3, 1, 1.74] },
  female: { high: [2.65, 2500, 1, 3.6, 5.39], low: [2.15, 300, 6, 1.5, 1.4] },
};
const SP_RANK_LEVELS = [[7 / 8, 'World Class'], [6 / 8, 'Pro'], [5 / 8, 'Cat 1'], [4 / 8, 'Cat 2'], [3 / 8, 'Cat 3'], [2 / 8, 'Cat 4'], [1 / 8, 'Cat 5'], [0, 'Recreational']];
function _spRankScaler(d, [slopeFactor, slopePeriod, slopeAdjust, slopeOffset, baseOffset]) {
  const slope = Math.log10((slopePeriod / d) * slopeAdjust + slopeOffset);
  const enduro = d > 3600 ? 1 / ((Math.log(d / 3600) * 0.1) + 1) : 1;
  return (Math.pow(slope, slopeFactor) + baseOffset) * enduro;
}
function spRank(duration, watts, kg, female) {
  if (!(watts > 0 && kg > 0)) return null;
  const c = SP_RANK[female ? 'female' : 'male'];
  const hi = _spRankScaler(duration, c.high), lo = _spRankScaler(duration, c.low);
  const level = (watts / kg - lo) / (hi - lo);
  const hit = SP_RANK_LEVELS.find(([req]) => level >= req) || SP_RANK_LEVELS[SP_RANK_LEVELS.length - 1];
  return { level, label: hit[1] };
}

/* ── Calories as food (Sauce src/site/foods.json, plus local plates). ── */
const SP_FOODS = [
  ['nasi goreng', 'nasi goreng', 640, '🍛'], ['hamburger', 'burger', 520, '🍔'], ['pizza', 'pizza', 272, '🍕'],
  ['rice', 'nasi', 205, '🍚'], ['donut', 'donat', 204, '🍩'], ['beer', 'bir', 153, '🍺'],
  ['es teh manis', 'es teh manis', 120, '🧋'], ['banana', 'pisang', 89, '🍌'], ['egg', 'telur', 77, '🥚'],
];
// kcal → up to two foods, biggest that fits first ("2 🍛 + 1 🍌").
function spFoods(kcal) {
  if (!(kcal > 40)) return '';
  const id = window.LANG === 'id';
  const parts = [];
  let left = kcal;
  for (const [en, idn, k, icon] of SP_FOODS) {
    if (parts.length === 2) break;
    const n = Math.floor(left / k);
    if (n < 1) continue;
    parts.push(`${n} ${icon} ${id ? idn : en}`);
    left -= n * k;
  }
  return parts.join(' + ');
}

/* ── IO: gear profile, per-ride cache, the bulk scan ── */
const _spFemale = () => !!(typeof currentAthlete !== 'undefined' && currentAthlete && currentAthlete.sex === 'F');
const _spOwner = () => typeof _isHrzOwner === 'function' && _isHrzOwner();
function _spHr() {
  const max = (typeof observedMaxHr === 'function' && observedMaxHr()) || 0;
  let rest = 60;
  try { const r = window._ownerRestHr || parseInt(localStorage.getItem('owner_rest_hr') || '0', 10); if (r > 25 && r < 110) rest = r; } catch {}
  return { max, rest };
}

// Bike weight + frame type from /gear/{id}, cached; sport_type decides when unknown.
async function _spGear(a) {
  const byType = a.sport_type === 'MountainBikeRide' ? 1 : a.sport_type === 'GravelRide' ? 5 : 3;
  if (!a.gear_id) return { kg: 10, frame: byType };
  const ck = 'strava_gear_info_' + a.gear_id;
  try { const c = JSON.parse(localStorage.getItem(ck)); if (c && c.kg > 0) return c; } catch {}
  try {
    const g = await api(`/gear/${a.gear_id}`);
    const info = { kg: g && g.weight > 0 ? g.weight : 10, frame: (g && SP_BIKES[g.frame_type]) ? g.frame_type : byType };
    try { localStorage.setItem(ck, JSON.stringify(info)); } catch {}
    return info;
  } catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) throw e; return { kg: 10, frame: byType }; }
}

function spRideCache(id) {
  try { const o = JSON.parse(localStorage.getItem('strava_sauce_' + id)); return o && o.v === SP_V ? o : null; } catch { return null; }
}
function _spEligible(a) { return a && a.id && isRide(a) && !a.trainer && a.sport_type !== 'VirtualRide' && (a.moving_time || 0) >= 300 && !a.manual; }

// Per-ride analysis, cache-first. Throws on 429; null when the ride has no usable streams.
async function spRide(a) {
  const c = spRideCache(a.id);
  if (c && c.kgRider === athWeightKg()) return c;
  const gear = await _spGear(a);
  let raw;
  try { raw = await api(`/activities/${a.id}/streams?keys=${SP_KEYS}&key_by_type=true`); }
  catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) throw e; return null; }
  const pick = k => raw && raw[k] && raw[k].data;
  const s = { time: pick('time'), velocity: pick('velocity_smooth'), grade: pick('grade_smooth'), altitude: pick('altitude'), moving: pick('moving'), heartrate: pick('heartrate') };
  if (!s.time || !s.velocity || s.time.length < 60) return null;
  const mass = athWeightKg() + gear.kg + SP_KIT_KG;
  const r = spAnalyze(s, mass, SP_BIKES[gear.frame], a.average_temp != null ? a.average_temp : 27);
  if (!r) return null;
  r.kgRider = athWeightKg();
  try { r.w = await spPack(r._w); } catch {}
  delete r._w;
  try { localStorage.setItem('strava_sauce_' + a.id, JSON.stringify(r)); }
  catch { delete r.w; try { localStorage.setItem('strava_sauce_' + a.id, JSON.stringify(r)); } catch {} }   // quota: keep the summary
  return r;
}

function _spPool() {
  return (typeof acts === 'undefined' ? [] : acts).filter(_spEligible)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')).slice(0, SP_MAX_RIDES);
}
function spLoadAgg() { try { const o = JSON.parse(localStorage.getItem(SP_AGG_KEY)); return o && o.v === SP_V ? o : null; } catch { return null; } }
function _spSig() { return athWeightKg() + '|' + _spPool().map(a => a.id).join(','); }

// Aggregate over every cached ride: all-time bests, CP fit, latest ride.
function spSummary() {
  const rides = [];
  for (const a of _spPool()) { const r = spRideCache(a.id); if (r) rides.push({ a, r }); }
  if (!rides.length) return null;
  const top = (field, keys) => {
    const o = {};
    for (const { a, r } of rides) for (const k of keys) {
      const v = r[field] && r[field][k];
      if (v != null && (!o[k] || v > o[k].v)) o[k] = { v, id: a.id, name: a.name || 'Ride' };
    }
    return o;
  };
  const best = top('best', SP_WINDOWS);
  const fit = spFitMorton(SP_FIT.filter(d => best[d]).map(d => ({ duration: d, power: best[d].v })));
  return { rides, best, fit, hr: top('hr', [60, 300, 1200]), spd: top('spd', [1200, 3600]), vam: top('vam', [600, 1200]), latest: rides[0] };
}

// Training-load hook: TSS from estimated NP for scanned rides, else null.
function spRideLoad(a, ftp) {
  if (!_spEligible(a) || !(ftp > 0)) return null;
  const r = spRideCache(a.id);
  const tss = r && r.np ? spTSS(r.np, r.secs, ftp) : null;
  return tss ? { load: tss, basis: 'estpower' } : null;
}

/* ── Training card ── */
function _spFtp() { const f = typeof estimateFtp === 'function' && estimateFtp(); return f ? f.value : 0; }

function _spRideLine(r) {
  const ftp = _spFtp(), hr = _spHr();
  const tss = r.np ? spTSS(r.np, r.secs, ftp) : null;
  const hrTss = spHrTSS(r.hrh, hr.max, hr.rest, _spFemale());
  const bits = [`${tr('avg')} <b>${r.avgW} W</b>`];
  if (r.np) bits.push(`NP <b>${r.np} W</b>`);
  if (r.np && ftp) bits.push(`IF <b>${(r.np / ftp).toFixed(2)}</b>`);
  if (tss) bits.push(`TSS <b>${Math.round(tss)}</b>`);
  if (hrTss) bits.push(`hrTSS <b>${Math.round(hrTss)}</b>`);
  bits.push(`<b>${r.kj}</b> kJ`);
  return bits.join(' · ');
}

function _spMarkup(sum, opts = {}) {
  const kg = athWeightKg(), female = _spFemale();
  let html = '';
  if (sum) {
    const maxV = Math.max(1, ...SP_SHOW.map(w => sum.best[w] ? sum.best[w].v : 0));
    html += SP_SHOW.map(w => {
      const b = sum.best[w];
      if (!b) return '';
      const rk = spRank(w, b.v, kg, female);
      return `<div class="pc-row">
        <span class="pc-dur">${SP_LABELS[w]}</span>
        <span class="pc-track"><span style="width:${Math.round(b.v / maxV * 100)}%"></span></span>
        <span class="pc-w">${b.v} W</span>
        <span class="pc-wkg">${(b.v / kg).toFixed(1)} W/kg</span>
        <span class="pc-wkg pc-rank" title="${tr('Coggan power profile, from estimated watts')}">${rk ? tr(rk.label) : ''}</span>
      </div>`;
    }).join('');
    const row = (lbl, w, ctx) => `<div class="cp-row"><span class="cp-lbl">${lbl}</span><span class="cp-w">${w}</span><span class="cp-ctx">${ctx}</span></div>`;
    const link = o => `<a href="#" onclick="openActivityModal('${o.id}');return false">${o.name}</a>`;
    if (sum.fit) {
      const ftp = _spFtp();
      html += row(tr('Critical Power'), Math.round(sum.fit.CP) + ' W',
        trf('Morton fit over 2–60 min bests{0}', ftp ? ' · ' + trf('your FTP card says {0} W', ftp) : ''));
      html += row('W′', (sum.fit.WPrime / 1000).toFixed(1) + ' kJ', tr('anaerobic reserve above CP — what a sprint or a hard climb spends'));
    }
    if (sum.vam[1200]) html += row(tr('Best VAM'), sum.vam[1200].v + ' m/h', trf('20 min climbing · {0}', link(sum.vam[1200])));
    if (sum.hr[1200]) html += row(tr('Best 20-min HR'), sum.hr[1200].v + ' bpm', link(sum.hr[1200]));
    if (sum.spd[3600]) html += row(tr('Best 60-min speed'), kmh(sum.spd[3600].v) + ' ' + speedUnit(), link(sum.spd[3600]));
    const L = sum.latest;
    html += row(tr('Latest ride'), '', `${link({ id: L.a.id, name: L.a.name || 'Ride' })} · ${_spRideLine(L.r)}`);
    const food = spFoods(L.a.calories || L.r.kj);
    if (food) html += row(tr('Burned'), '', '≈ ' + food);
  }
  html += `<div class="tr-basis-note">${opts.progress
    ? trf('Estimating… {0}', opts.progress)
    : trf('Watts estimated from speed, grade, wind-free physics and {0} kg + your bike, over your last {1} {2} — stops removed. Model from Sauce for Strava (MIT).', kg, sum ? sum.rides.length : 0, tr(sum && sum.rides.length === 1 ? 'ride' : 'rides'))}</div>`;
  if (opts.note) html += `<div class="tr-basis-note">${opts.note}</div>`;
  if (opts.button) html += `<button class="tr-ai-btn" style="margin-top:10px" onclick="computeSaucePower()">${opts.button}</button>`;
  return html;
}

// Only without a power meter — with one, the real Power Curve card says it better.
function _trSauceHTML() {
  if (typeof acts === 'undefined' || acts.some(a => isRide(a) && a.device_watts === true && a.average_watts > 0)) return '';
  if (!_spPool().length) return '';
  const owner = _spOwner(), sum = spSummary(), agg = spLoadAgg();
  let inner;
  if (sum) inner = _spMarkup(sum, {
    button: owner ? (agg && agg.sig === _spSig() ? tr('Recompute') : tr('Update with new rides')) : null,
    note: agg && agg.partial ? tr('Partial — rate-limited last time; click to resume (done rides are cached).') : '',
  });
  else if (owner) inner = `<div class="tr-basis-note">${tr('No power meter? Physics can still read your watts: speed, gradient and your weight give the power for every second of a ride — then peaks, critical power, W′ and TSS follow.')}</div>
    <button class="tr-ai-btn" style="margin-top:10px" onclick="computeSaucePower()">${tr('Estimate my power')}</button>`;
  else inner = `<div class="tr-basis-note">${tr("The power curve is computed on the owner's device — it fetches ride streams, and Strava's rate limit is shared across the app.")}</div>`;
  return `<div class="card tr-pc tr-sp">
    <div class="tr-chart-title">${tr('Estimated Power')} <span class="gm-hint">${tr('every ride, no power meter')}</span></div>
    <div id="spBody">${inner}</div>
  </div>`;
}

let _spRunning = false;
async function computeSaucePower() {
  const body = document.getElementById('spBody');
  if (!body || _spRunning || !_spOwner()) return;
  const pool = _spPool();
  _spRunning = true;
  let idx = 0, done = 0, stopped = false;
  const worker = async () => {
    while (idx < pool.length && !stopped) {
      const a = pool[idx++];
      try { await spRide(a); } catch { stopped = true; return; }
      done++;
      if (done % 3 === 0) body.innerHTML = _spMarkup(spSummary(), { progress: `${done}/${pool.length}` });
    }
  };
  body.innerHTML = _spMarkup(spSummary(), { progress: `0/${pool.length}` });
  await Promise.all(Array.from({ length: 3 }, worker));
  try { localStorage.setItem(SP_AGG_KEY, JSON.stringify({ v: SP_V, sig: _spSig(), partial: stopped })); } catch {}
  _spRunning = false;
  // Training load and the fitness chart read these rides now — redraw the page.
  if (typeof renderTraining === 'function') renderTraining();
}

/* ── Activity modal block: this ride's estimated power, W′ balance, food ── */
async function renderActivitySauce(a) {
  const host = document.getElementById('actSauce');
  if (!host) return;
  if (!_spEligible(a) || acts.some(x => isRide(x) && x.device_watts === true && x.average_watts > 0)) { host.innerHTML = ''; return; }
  const head = '<div class="actd-hrd-h">⚡ ' + tr('Estimated Power') + ' <span class="actd-hrd-sub">' + tr('physics from speed, grade & weight') + '</span></div>';
  let r = spRideCache(a.id);
  if (!r) {
    host.innerHTML = `<div class="actd-hrd">${head}<button class="btn actd-stats-btn" type="button" id="spActBtn">${tr('Estimate power for this ride')}</button></div>`;
    document.getElementById('spActBtn').onclick = async () => {
      host.innerHTML = `<div class="actd-hrd">${head}<span class="ai-dots"><span></span><span></span><span></span></span></div>`;
      try { r = await spRide(a); } catch { r = null; }
      if (document.getElementById('actSauce') !== host) return;
      if (r) _spDrawActivity(a, r, host, head);
      else host.innerHTML = `<div class="actd-hrd">${head}<div class="tr-basis-note">${tr("Couldn't load stream data for this ride.")}</div></div>`;
    };
    return;
  }
  _spDrawActivity(a, r, host, head);
}

async function _spDrawActivity(a, r, host, head) {
  const kg = athWeightKg();
  const peaks = [5, 60, 300, 1200].filter(w => r.best[w]).map(w =>
    `<div class="actd-stat"><div class="actd-stat-val">${r.best[w]} W</div><div class="actd-stat-lbl">${SP_LABELS[w]} · ${(r.best[w] / kg).toFixed(1)} W/kg</div></div>`).join('');
  const food = spFoods(a.calories || r.kj);
  host.innerHTML = `<div class="actd-hrd">${head}
    <div class="tr-basis-note">${_spRideLine(r)}</div>
    <div class="actd-grid">${peaks}</div>
    ${food ? `<div class="tr-basis-note">🍽 ${trf('Burned ≈ {0}', food)}</div>` : ''}
    <div id="spWbal"></div>
    <div class="tr-basis-note">${trf('{0} kg total on the {1} profile · an estimate, not a power meter.', r.mass, tr(r.bike))}</div>
  </div>`;
  // W′ balance needs the packed stream and a CP fit.
  const sum = spSummary(), fit = sum && sum.fit;
  const wts = r.w ? await spUnpack(r.w).catch(() => null) : null;
  const el = document.getElementById('spWbal');
  if (!el || !fit || !wts || typeof Chart === 'undefined') return;
  const bal = spWPrimeBal(wts, fit.CP, fit.WPrime);
  const min = Math.min(...bal);
  const step = Math.max(1, Math.floor(bal.length / 300));
  const pts = [];
  for (let i = 0; i < bal.length; i += step) pts.push({ x: i / 60, y: Math.max(0, bal[i] / 1000) });
  el.innerHTML = `<div class="tr-basis-note">${trf('W′ balance — lowest {0} kJ of {1} ({2}% left at the hardest point)', Math.max(0, min / 1000).toFixed(1), (fit.WPrime / 1000).toFixed(1), Math.max(0, Math.round(min / fit.WPrime * 100)))}</div>
    <div style="height:140px"><canvas id="spWbalCv"></canvas></div>`;
  destroyChart('sp_wbal');
  charts.sp_wbal = new Chart(document.getElementById('spWbalCv'), {
    type: 'line',
    data: { datasets: [{ data: pts, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,.15)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => Math.round(c[0].parsed.x) + ' min', label: c => c.parsed.y.toFixed(1) + ' kJ' } } },
      scales: { x: { type: 'linear', ticks: { callback: v => v + "'" } }, y: { min: 0, max: Math.ceil(fit.WPrime / 1000), ticks: { callback: v => v + ' kJ' } } },
    },
  });
}

/* ── Segment helper: watts to ride a segment at a target time ── */
function spSegmentWatts(distance, gradePct, secs) {
  if (!(distance > 0 && secs > 0)) return null;
  const v = distance / secs;
  const w = spPowerAt(v, (gradePct || 0) / 100, athWeightKg() + 10 + SP_KIT_KG, SP_BIKES[3], spAirDensity(0, 27));
  return w > 0 ? Math.round(w) : null;
}

/* ── POWER CURVE ──────────────────────────────────────────────────────────────
   Best (max) average power at each duration, aggregated across the athlete's
   rides — the classic power-duration profile.

   The shared stream cache in render-charts.js downsamples to 200 points, which
   is too lossy for short bests (5s/1min), so this fetches the FULL-resolution
   watts stream per ride, computes each window's best, and caches only those few
   numbers (strava_pcurve_<id>). The all-time curve is the max across rides.

   On-demand + owner-gated: Strava rate limits are per-application (shared across
   every visitor), so only the owner triggers the bulk stream fetch — same policy
   as the Overview HR-zone upgrade. */

const PC_WINDOWS = [5, 30, 60, 300, 1200, 3600];
const PC_LABELS = { 5: '5s', 30: '30s', 60: '1min', 300: '5min', 1200: '20min', 3600: '60min' };
const PC_MAX_RIDES = 80;               // cap the bulk fetch to protect the rate limit
const PC_AGG_KEY = 'strava_pcurve_agg';

// Pure: raw watts (+ optional time) → watts per second, from 0 to the last sample.
// Smart recording logs a sample every few seconds, so each value holds until the
// next sample; a gap over 30 s is a stop → 0 W. For W′ balance (time matters).
function pcSeconds(watts, time) {
  const T = (time && time.length === watts.length) ? time : watts.map((_, i) => i);
  const maxT = T[T.length - 1] || (watts.length - 1);
  const arr = new Float64Array(maxT + 1);
  for (let i = 0; i < watts.length; i++) {
    const t = T[i], w = watts[i];
    if (!(t >= 0 && t <= maxT) || w == null || isNaN(w)) continue;
    const end = i + 1 < T.length && T[i + 1] - t <= 30 ? T[i + 1] : t + 1;
    for (let k = t; k < end && k <= maxT; k++) arr[k] = w;
  }
  return arr;
}

// Pure: best average over `win` seconds the way Strava reads a smart-recorded
// file — the mean of the samples whose time falls inside the window, not weighted
// by the gaps between them (checked on the owner's rides: it lands where Strava's
// best minute is). On 1 s data it's the plain rolling average. → {w, from, to} | null
function pcBestWindow(watts, T, win) {
  let a = 0, sum = 0, mx = -1, from = -1, to = -1;
  for (let b = 0; b < watts.length; b++) {
    sum += watts[b] || 0;
    while (T[b] - T[a] >= win) { sum -= watts[a] || 0; a++; }
    if (T[b] - T[0] >= win - 1) { const v = sum / (b - a + 1); if (v > mx) { mx = v; from = a; to = b; } }
  }
  return mx < 0 ? null : { w: mx, from, to };
}

// Pure: raw watts (+ optional time) stream → best avg power per window. No IO.
function _pcBestFromStreams(watts, time) {
  if (!watts || !watts.length) return null;
  const T = (time && time.length === watts.length) ? time : watts.map((_, i) => i);
  const best = {};
  for (const win of PC_WINDOWS) {
    const r = pcBestWindow(watts, T, win);
    if (r) best[win] = Math.round(r.w);
  }
  return Object.keys(best).length ? best : null;
}

// Per-ride best power, localStorage-first (fetched once). Throws on 429 so the
// caller can stop; returns null when a ride has no usable power stream.
async function _pcBestForRide(id) {
  const ck = 'strava_pcurve_' + id;
  try { const c = localStorage.getItem(ck); if (c) { const o = JSON.parse(c); if (o && o.v === 3) return o.best; } } catch {}
  let raw;
  try { raw = await api(`/activities/${id}/streams?keys=time,watts&key_by_type=true`); }
  catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) throw e; return null; }
  const watts = raw && raw.watts && raw.watts.data;
  const time = raw && raw.time && raw.time.data;
  const best = _pcBestFromStreams(watts, time);
  try { localStorage.setItem(ck, JSON.stringify({ v: 3, best: best || null })); } catch {}
  pcVer++;
  return best;
}

// A ride's cached bests ({5: W, 60: W, …}) or null when it hasn't been analysed.
function pcRidePeaks(id) {
  try { const o = JSON.parse(localStorage.getItem('strava_pcurve_' + id)); return o && o.v === 3 ? o.best : null; } catch { return null; }
}

// The all-time curve rebuilt from every analysed power-meter ride (no fetching).
function pcRebuildAgg() {
  const agg = { sig: _pcSig(), best: {}, count: 0 };
  acts.forEach(a => {
    if (!isRide(a) || a.device_watts !== true) return;
    const best = pcRidePeaks(a.id);
    if (!best) return;
    agg.count++;
    for (const w of PC_WINDOWS) {
      const v = best[w];
      if (v != null && (!agg.best[w] || v > agg.best[w].v)) agg.best[w] = { v, name: a.name || 'Ride', date: a.start_date };
    }
  });
  pcSaveAgg(agg);
  pcVer++;
  return agg;
}

// Best 20-min power over the last 180 days of power-meter rides — the FTP-test
// number. Memoised: estimateFtp() runs for every table cell.
let pcVer = 0, _pc20Memo = null;
function pcBest20() {
  const sig = acts.length + ':' + pcVer;
  if (_pc20Memo && _pc20Memo.sig === sig) return _pc20Memo.v;
  const since = Date.now() - 180 * 864e5;
  let v = 0;
  acts.forEach(a => {
    if (!isRide(a) || a.device_watts !== true || new Date(a.start_date).getTime() < since) return;
    const b = pcRidePeaks(a.id);
    if (b && b[1200] > v) v = b[1200];
  });
  _pc20Memo = { sig, v };
  return v;
}

function _pcSig() { return acts.length + ':' + ((acts[0] && acts[0].id) || ''); }
function pcLoadAgg() { try { return JSON.parse(localStorage.getItem(PC_AGG_KEY)) || null; } catch { return null; } }
function pcSaveAgg(a) { try { localStorage.setItem(PC_AGG_KEY, JSON.stringify(a)); } catch {} }

// Curve markup from an aggregate. opts: {progress, note, button}.
function pcCurveMarkup(agg, opts = {}) {
  const weight = (typeof athWeightKg === 'function') ? athWeightKg() : ((typeof currentAthlete !== 'undefined' && currentAthlete && currentAthlete.weight) || 0);
  const maxV = Math.max(1, ...PC_WINDOWS.map(w => (agg.best[w] ? agg.best[w].v : 0)));
  const rows = PC_WINDOWS.map(w => {
    const b = agg.best[w];
    if (!b) return '';
    const wkg = weight ? (b.v / weight).toFixed(1) + ' W/kg' : '';
    return `<div class="pc-row">
      <span class="pc-dur">${PC_LABELS[w]}</span>
      <span class="pc-track"><span style="width:${Math.round(b.v / maxV * 100)}%"></span></span>
      <span class="pc-w">${b.v} W</span>
      <span class="pc-wkg">${wkg}</span>
    </div>`;
  }).join('');
  let extra = opts.progress
    ? `<div class="tr-basis-note">${trf('Computing… {0} rides ({1} with power)', opts.progress, agg.count)}</div>`
    : `<div class="tr-basis-note">${trf('Best power across {0} {1}.', agg.count, tr(agg.count === 1 ? 'ride' : 'rides'))}</div>`;
  if (opts.note) extra += `<div class="tr-basis-note">${opts.note}</div>`;
  if (opts.button) extra += `<button class="tr-ai-btn" style="margin-top:10px" onclick="computePowerCurve()">${opts.button}</button>`;
  return rows + extra;
}

function pcRenderCurve(agg, body, opts) { if (body) body.innerHTML = pcCurveMarkup(agg, opts); }

// Card HTML for the Training section. Hidden when the athlete has no power data.
function _trPowerCurveHTML() {
  // Only for riders with a real power meter — device_watts is true only when
  // Strava's watts come from a meter, not its speed/weight estimate. Hidden
  // entirely otherwise (an estimated "power curve" would be misleading).
  if (typeof acts === 'undefined' || !acts.some(a => isRide(a) && a.device_watts === true && a.average_watts > 0)) return '';
  const owner = (typeof _isHrzOwner === 'function') && _isHrzOwner();
  const agg = pcLoadAgg();
  let inner;
  if (agg && agg.count) {
    inner = pcCurveMarkup(agg, {
      button: owner ? (agg.sig === _pcSig() ? tr('Recompute') : tr('Update with new rides')) : null,
      note: agg.partial ? tr('Partial — rate-limited last time; click to resume (done rides are cached).') : '',
    });
  } else if (owner) {
    inner = `<div class="tr-basis-note">${tr('Estimate your all-time best power at each duration from your ride streams.')}</div>
      <button class="tr-ai-btn" style="margin-top:10px" onclick="computePowerCurve()">${tr('Compute power curve')}</button>`;
  } else {
    inner = `<div class="tr-basis-note">${tr("The power curve is computed on the owner's device — it fetches ride streams, and Strava's rate limit is shared across the app.")}</div>`;
  }
  return `<div class="card tr-pc">
    <div class="tr-chart-title">${tr('Power Curve')} <span class="gm-hint">${tr('best average power at each duration')}</span></div>
    <div id="pcBody">${inner}</div>
  </div>`;
}

let _pcRunning = false;
async function computePowerCurve() {
  const body = document.getElementById('pcBody');
  if (!body || _pcRunning) return;
  if (!(typeof _isHrzOwner === 'function' && _isHrzOwner())) {
    body.innerHTML = '<div class="tr-basis-note">' + tr('Owner-only (shared Strava rate limit).') + '</div>';
    return;
  }
  const rides = acts.filter(a => isRide(a) && a.average_watts > 0 && a.id)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  if (!rides.length) { body.innerHTML = '<div class="tr-basis-note">' + tr('No rides with power data.') + '</div>'; return; }
  const pool = rides.slice(0, PC_MAX_RIDES);

  _pcRunning = true;
  const cached = pcLoadAgg();
  const agg = (cached && cached.sig === _pcSig()) ? cached : { sig: _pcSig(), best: {}, count: 0 };
  const merge = (best, a) => {
    for (const w of PC_WINDOWS) {
      const v = best[w];
      if (v == null) continue;
      if (!agg.best[w] || v > agg.best[w].v) agg.best[w] = { v, name: a.name || 'Ride', date: a.start_date };
    }
  };
  let idx = 0, done = 0, stopped = false;
  const worker = async () => {
    while (idx < pool.length) {
      const a = pool[idx++];
      try { const best = await _pcBestForRide(a.id); if (best) { merge(best, a); agg.count++; } done++; }
      catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) { stopped = true; return; } done++; }
      if (done % 3 === 0) { pcSaveAgg(agg); pcRenderCurve(agg, body, { progress: `${done}/${pool.length}` }); }
    }
  };
  pcRenderCurve(agg, body, { progress: `0/${pool.length}` });
  await Promise.all(Array.from({ length: 3 }, worker));
  agg.partial = stopped;
  pcSaveAgg(agg);
  pcRenderCurve(agg, body, {
    button: agg.sig === _pcSig() ? tr('Recompute') : tr('Update with new rides'),
    note: stopped ? tr('Rate-limited — reopen later to resume; fetched rides are cached.') : '',
  });
  _pcRunning = false;
}

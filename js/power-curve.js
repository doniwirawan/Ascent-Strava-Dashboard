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

// Pure: raw watts (+ optional time) stream → best avg power per window. No IO.
function _pcBestFromStreams(watts, time) {
  if (!watts || !watts.length) return null;
  const T = (time && time.length === watts.length) ? time : watts.map((_, i) => i);
  const maxT = T[T.length - 1] || (watts.length - 1);
  const arr = new Float64Array(maxT + 1);                 // 1 Hz grid; gaps/coasting = 0 W
  for (let i = 0; i < watts.length; i++) {
    const t = T[i], w = watts[i];
    if (t >= 0 && t <= maxT && w != null && !isNaN(w)) arr[t] = w;
  }
  const best = {};
  for (const win of PC_WINDOWS) {
    if (arr.length < win) continue;
    let sum = 0;
    for (let i = 0; i < win; i++) sum += arr[i];
    let mx = sum;
    for (let i = win; i < arr.length; i++) { sum += arr[i] - arr[i - win]; if (sum > mx) mx = sum; }
    best[win] = Math.round(mx / win);
  }
  return Object.keys(best).length ? best : null;
}

// Per-ride best power, localStorage-first (fetched once). Throws on 429 so the
// caller can stop; returns null when a ride has no usable power stream.
async function _pcBestForRide(id) {
  const ck = 'strava_pcurve_' + id;
  try { const c = localStorage.getItem(ck); if (c) { const o = JSON.parse(c); if (o && o.v === 1) return o.best; } } catch {}
  let raw;
  try { raw = await api(`/activities/${id}/streams?keys=time,watts&key_by_type=true`); }
  catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) throw e; return null; }
  const watts = raw && raw.watts && raw.watts.data;
  const time = raw && raw.time && raw.time.data;
  const best = _pcBestFromStreams(watts, time);
  try { localStorage.setItem(ck, JSON.stringify({ v: 1, best: best || null })); } catch {}
  return best;
}

function _pcSig() { return acts.length + ':' + ((acts[0] && acts[0].id) || ''); }
function pcLoadAgg() { try { return JSON.parse(localStorage.getItem(PC_AGG_KEY)) || null; } catch { return null; } }
function pcSaveAgg(a) { try { localStorage.setItem(PC_AGG_KEY, JSON.stringify(a)); } catch {} }

// Curve markup from an aggregate. opts: {progress, note, button}.
function pcCurveMarkup(agg, opts = {}) {
  const weight = (typeof currentAthlete !== 'undefined' && currentAthlete && currentAthlete.weight) || 0;
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
    ? `<div class="tr-basis-note">Computing… ${opts.progress} rides (${agg.count} with power)</div>`
    : `<div class="tr-basis-note">Best power across ${agg.count} ride${agg.count === 1 ? '' : 's'}.</div>`;
  if (opts.note) extra += `<div class="tr-basis-note">${opts.note}</div>`;
  if (opts.button) extra += `<button class="tr-ai-btn" style="margin-top:10px" onclick="computePowerCurve()">${opts.button}</button>`;
  return rows + extra;
}

function pcRenderCurve(agg, body, opts) { if (body) body.innerHTML = pcCurveMarkup(agg, opts); }

// Card HTML for the Training section. Hidden when the athlete has no power data.
function _trPowerCurveHTML() {
  if (typeof acts === 'undefined' || !acts.some(a => isRide(a) && a.average_watts > 0)) return '';
  const owner = (typeof _isHrzOwner === 'function') && _isHrzOwner();
  const agg = pcLoadAgg();
  let inner;
  if (agg && agg.count) {
    inner = pcCurveMarkup(agg, {
      button: owner ? (agg.sig === _pcSig() ? 'Recompute' : 'Update with new rides') : null,
      note: agg.partial ? 'Partial — rate-limited last time; click to resume (done rides are cached).' : '',
    });
  } else if (owner) {
    inner = `<div class="tr-basis-note">Estimate your all-time best power at each duration from your ride streams.</div>
      <button class="tr-ai-btn" style="margin-top:10px" onclick="computePowerCurve()">Compute power curve</button>`;
  } else {
    inner = `<div class="tr-basis-note">The power curve is computed on the owner's device — it fetches ride streams, and Strava's rate limit is shared across the app.</div>`;
  }
  return `<div class="card tr-pc">
    <div class="tr-chart-title">Power Curve <span class="gm-hint">best average power at each duration</span></div>
    <div id="pcBody">${inner}</div>
  </div>`;
}

let _pcRunning = false;
async function computePowerCurve() {
  const body = document.getElementById('pcBody');
  if (!body || _pcRunning) return;
  if (!(typeof _isHrzOwner === 'function' && _isHrzOwner())) {
    body.innerHTML = '<div class="tr-basis-note">Owner-only (shared Strava rate limit).</div>';
    return;
  }
  const rides = acts.filter(a => isRide(a) && a.average_watts > 0 && a.id)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  if (!rides.length) { body.innerHTML = '<div class="tr-basis-note">No rides with power data.</div>'; return; }
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
    button: agg.sig === _pcSig() ? 'Recompute' : 'Update with new rides',
    note: stopped ? 'Rate-limited — reopen later to resume; fetched rides are cached.' : '',
  });
  _pcRunning = false;
}

/* ── HEART RATE DECOUPLING (aerobic drift) ────────────────────────────────────
   Splits the latest long ride into halves and compares the efficiency factor
   (output ÷ HR) between them. If HR climbs for the same output, the second half
   is less efficient → positive decoupling = cardiac drift / limited aerobic
   endurance for that effort. Friel's rule of thumb: <5% is well-coupled.

   Reuses the existing compact stream cache (_getActivityStreams, ~200 points) —
   plenty of resolution for half-vs-half means, and already cached per activity. */

// Latest ride with HR and enough duration (≥40 min) to make drift meaningful.
function _hrdPickRide() {
  return acts.filter(a => isRide(a) && a.id && a.average_heartrate > 0 && (a.moving_time || 0) >= 2400)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0] || null;
}

// Pure: compact streams → {usePower, hr1, hr2, o1, o2, decoupling%}. null if thin.
function _hrdCompute(streams) {
  const hr = streams && streams.series && streams.series.hr && streams.series.hr.data;
  if (!hr) return null;
  const watts = streams.series.watts && streams.series.watts.data;
  const speed = streams.series.speed && streams.series.speed.data;
  const out = watts || speed;
  if (!out) return null;
  const n = Math.min(hr.length, out.length);
  if (n < 8) return null;
  const mid = Math.floor(n / 2);
  const avg = (arr, s, e) => { let sum = 0, c = 0; for (let i = s; i < e; i++) { const v = arr[i]; if (v != null && !isNaN(v)) { sum += v; c++; } } return c ? sum / c : null; };
  const hr1 = avg(hr, 0, mid), hr2 = avg(hr, mid, n), o1 = avg(out, 0, mid), o2 = avg(out, mid, n);
  if (!hr1 || !hr2 || !o1 || !o2) return null;
  const ef1 = o1 / hr1, ef2 = o2 / hr2;
  return { usePower: !!watts, hr1, hr2, o1, o2, decoupling: (ef1 - ef2) / ef1 * 100 };
}

function _hrdBand(dc) {
  if (dc < 0)   return { color: '#4da8ff', text: tr('Negative drift — you held or raised output as HR settled (negative split or long warm-up). Strong aerobic control.') };
  if (dc <= 5)  return { color: '#22c55e', text: tr('Well-coupled (<5%). Strong aerobic endurance for this effort — HR stayed steady against your output.') };
  if (dc <= 10) return { color: '#fb923c', text: tr('Moderate drift (5–10%). Normal for a hard or long ride; watch fuelling and pacing on the back half.') };
  return { color: '#ef4444', text: tr('High decoupling (>10%). Aerobic endurance, pacing, heat or fuelling limited the second half — a target to build.') };
}

function _hrdMarkup(a, d) {
  const outVal = v => d.usePower ? Math.round(v) + ' W' : kmh(v) + ' ' + speedUnit();
  const dcStr = (d.decoupling >= 0 ? '+' : '') + d.decoupling.toFixed(1) + '%';
  const band = _hrdBand(d.decoupling);
  const half = (n, hr, o) => `<div class="hrd-half">
    <div class="hrd-half-lbl">${trf('{0} half', n)}</div>
    <div class="hrd-half-row"><span>${Math.round(hr)} bpm</span><span>${outVal(o)}</span></div>
  </div>`;
  return `
    <div class="hrd-grid">
      ${half(tr('First'), d.hr1, d.o1)}
      <div class="hrd-dc"><div class="hrd-dc-val" style="color:${band.color}">${dcStr}</div><div class="hrd-dc-lbl">${tr('decoupling')}</div></div>
      ${half(tr('Second'), d.hr2, d.o2)}
    </div>
    <div class="tr-basis-note">${band.text}</div>
    <div class="tr-basis-note">${trf('Latest ride: {0} · {1} vs HR.', a.name || 'Ride', tr(d.usePower ? 'power' : 'speed'))}</div>`;
}

function _trHrDecouplingHTML() {
  const a = _hrdPickRide();
  if (!a) return '';
  return `<div class="card tr-hrd">
    <div class="tr-chart-title">${tr('Heart Rate Decoupling')} <span class="gm-hint">${tr('aerobic drift, first vs second half')}</span></div>
    <div id="hrdBody">
      <div class="tr-basis-note">${tr('See how much your heart rate drifts up relative to your pace/power over a long ride.')}</div>
      <button class="tr-ai-btn" style="margin-top:10px" onclick="analyzeHrDecoupling()">${trf('Analyse {0}', a.name || tr('latest ride'))}</button>
    </div>
  </div>`;
}

let _hrdRunning = false;
async function analyzeHrDecoupling() {
  const body = document.getElementById('hrdBody');
  if (!body || _hrdRunning) return;
  const a = _hrdPickRide();
  if (!a) { body.innerHTML = '<div class="tr-basis-note">' + tr('No long ride with heart-rate data yet.') + '</div>'; return; }
  _hrdRunning = true;
  body.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';
  let streams = null;
  try { streams = (typeof _getActivityStreams === 'function') ? await _getActivityStreams(a.id) : null; } catch {}
  if (!streams) { body.innerHTML = '<div class="tr-basis-note">' + tr("Couldn't load stream data for this ride.") + '</div>'; _hrdRunning = false; return; }
  const d = _hrdCompute(streams);
  body.innerHTML = d ? _hrdMarkup(a, d) : '<div class="tr-basis-note">' + tr('Not enough continuous HR/output data in this ride to measure drift.') + '</div>';
  _hrdRunning = false;
}

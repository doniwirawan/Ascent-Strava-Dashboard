/* ── TIME LOST ANALYSIS ───────────────────────────────────────────────────────
   "Where did today's average speed disappear?" Breaks the latest ride's MOVING
   time into climbing / descending / flat-pedalling / coasting from the stream,
   and reports STOPPED time exactly as elapsed − moving. Compares moving-average
   speed against overall (elapsed) speed so the cost of stops is explicit.

   Reuses the compact stream cache (_getActivityStreams): speed, altitude and
   cadence at ~200 evenly-timed points is enough for a proportional breakdown. */

function _tlPickRide() {
  return acts.filter(a => isRide(a) && a.id && (a.moving_time || 0) >= 1200 && a.distance > 0)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0] || null;
}

// Pure: activity + compact streams → time breakdown (seconds) + speed loss.
function _tlCompute(a, streams) {
  const s = streams && streams.series;
  const spd = s && s.speed && s.speed.data;
  if (!spd) return null;
  const alt = s.altitude && s.altitude.data;
  const cad = s.cadence && s.cadence.data;
  const x = streams.x;
  const N = spd.length;
  const cat = { climb: 0, desc: 0, flat: 0, coast: 0, move: 0 };
  for (let i = 1; i < N; i++) {
    const v = spd[i];
    if (v == null || v < 0.8) continue;               // near-stationary → via elapsed−moving
    cat.move++;
    let grade = 0;
    if (alt && x && x[i] != null && x[i - 1] != null) { const dx = x[i] - x[i - 1]; if (dx > 0.5) grade = (alt[i] - alt[i - 1]) / dx; }
    if (grade > 0.02) cat.climb++;
    else if (grade < -0.02) cat.desc++;
    else { const c = cad ? cad[i] : null; if (c != null && c > 5) cat.flat++; else cat.coast++; }
  }
  if (cat.move < 8) return null;
  const mt = a.moving_time || 0, et = a.elapsed_time || mt;
  const f = k => cat[k] / cat.move;
  return {
    climbT: f('climb') * mt, descT: f('desc') * mt, flatT: f('flat') * mt, coastT: f('coast') * mt,
    stopped: Math.max(0, et - mt),
    movingAvg: a.average_speed || (a.distance / (mt || 1)),
    overallAvg: a.distance / (et || 1),
    lostPct: et > 0 ? Math.max(0, et - mt) / et * 100 : 0,
    mt, et,
  };
}

function _tlMarkup(a, d) {
  const rows = [
    { lbl: tr('Climbing'),       t: d.climbT, c: '#ef4444' },
    { lbl: tr('Descending'),     t: d.descT,  c: '#4da8ff' },
    { lbl: tr('Flat pedalling'), t: d.flatT,  c: '#22c55e' },
    { lbl: tr('Coasting'),       t: d.coastT, c: '#eab308' },
    { lbl: tr('Stopped'),        t: d.stopped, c: 'var(--muted)' },
  ];
  const total = rows.reduce((s, r) => s + r.t, 0) || 1;
  const bars = rows.map(r => `<div class="tl-row">
    <span class="tl-lbl">${r.lbl}</span>
    <span class="tl-track"><span style="width:${Math.round(r.t / total * 100)}%;background:${r.c}"></span></span>
    <span class="tl-t">${fmtT(Math.round(r.t))}</span>
    <span class="tl-pct">${Math.round(r.t / total * 100)}%</span>
  </div>`).join('');
  const biggest = rows.slice().sort((x, y) => y.t - x.t)[0];
  return `
    <div class="tl-head">
      <div class="tl-avg"><span class="tl-avg-v">${kmh(d.movingAvg)}</span> <span class="tl-avg-u">${speedUnit()} ${tr('moving')}</span></div>
      <div class="tl-avg tl-avg-dim"><span class="tl-avg-v">${kmh(d.overallAvg)}</span> <span class="tl-avg-u">${speedUnit()} ${tr('overall')}</span></div>
      <div class="tl-lost">${trf('{0}% of the clock spent stopped', d.lostPct.toFixed(0))}</div>
    </div>
    ${bars}
    <div class="tr-basis-note">${trf('Most of your moving time went to {0}. Latest ride: {1}.', '<b>' + biggest.lbl.toLowerCase() + '</b>', a.name || 'Ride')}</div>`;
}

function _trTimeLostHTML() {
  const a = _tlPickRide();
  if (!a) return '';
  return `<div class="card tr-tl">
    <div class="tr-chart-title">${tr('Time Lost Analysis')} <span class="gm-hint">${tr('where your average speed went')}</span></div>
    <div id="tlBody">
      <div class="tr-basis-note">${tr('Break your latest ride into climbing, descending, pedalling, coasting and stopped time.')}</div>
      <button class="tr-ai-btn" style="margin-top:10px" onclick="analyzeTimeLost()">${trf('Analyse {0}', a.name || tr('latest ride'))}</button>
    </div>
  </div>`;
}

let _tlRunning = false;
async function analyzeTimeLost() {
  const body = document.getElementById('tlBody');
  if (!body || _tlRunning) return;
  const a = _tlPickRide();
  if (!a) { body.innerHTML = '<div class="tr-basis-note">' + tr('No ride long enough to analyse yet.') + '</div>'; return; }
  _tlRunning = true;
  body.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';
  let streams = null;
  try { streams = (typeof _getActivityStreams === 'function') ? await _getActivityStreams(a.id) : null; } catch {}
  if (!streams) { body.innerHTML = '<div class="tr-basis-note">' + tr("Couldn't load stream data for this ride.") + '</div>'; _tlRunning = false; return; }
  const d = _tlCompute(a, streams);
  body.innerHTML = d ? _tlMarkup(a, d) : '<div class="tr-basis-note">' + tr('Not enough stream detail in this ride to break down.') + '</div>';
  _tlRunning = false;
}

/* ── CHASE ROUTES (owner only) ────────────────────────────────────────────────
   Loops built offline to "chase the heatmap": each one strings together roads
   you've never ridden in one regency. They start and finish at home, so the
   data comes from the owner-gated /api/chase-routes (private/chase-routes.json),
   never a static file. Never-ridden stretches are drawn bold; GPX download per
   route. */
let _crData = null, _crMap = null, _crLayer = null, _crPick = '';
try { _crPick = localStorage.getItem('chase_pick') || ''; } catch {}

async function renderChase() {
  const body = document.getElementById('chaseBody');
  if (!body) return;
  if (!_slpIsOwner()) { body.innerHTML = ''; return; }
  if (!_crData) {
    body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">' + tr('Loading routes…') + '</div>';
    try {
      const r = await fetch('/api/chase-routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken }) });
      if (!r.ok) throw new Error(r.status);
      _crData = await r.json();
    } catch (e) {
      body.innerHTML = _crAi() + '<div class="card" style="padding:24px;color:var(--muted)">' + tr('Could not load the routes.') + '</div>';
      _crAiRestore();
      return;
    }
  }
  const routes = _crData.routes || [];
  if (!routes.length) { body.innerHTML = _crAi(); _crAiRestore(); return; }
  const cur = routes.find(r => r.id === _crPick) || routes[0];
  _crPick = cur.id;

  body.innerHTML = _crAi() + `
    <div class="card">
      <div class="chart-note">${tr('Loops through roads you have never ridden, one per regency. Bold orange = never ridden, faint = roads you know. Right-click the map to open a spot in Google Maps.')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0">${routes.map(r =>
        `<button class="year-btn${r.id === cur.id ? ' active' : ''}" onclick="chasePick('${r.id}')">${r.name}</button>`).join('')}</div>
      <div class="cycling-hero cyc-grid">
        <div class="hero-box hi"><div class="hero-label">${tr('Distance')}</div><div class="hero-value">${cur.total_km} <span class="hero-unit">km</span></div></div>
        <div class="hero-box"><div class="hero-label">${tr('Never ridden')}</div><div class="hero-value">${cur.new_km} <span class="hero-unit">km</span></div>
          <div class="hero-sub">${trf('{0}% of the route', Math.round(cur.new_km / cur.total_km * 100))}</div></div>
        <div class="hero-box" style="display:flex;align-items:center;justify-content:center">
          <button class="btn btn-primary" onclick="chaseGpx('${cur.id}')">${tr('Download GPX')}</button></div>
      </div>
      <div id="chaseMap" style="height:540px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border)"></div>
    </div>`;

  if (_crMap) { _crMap.remove(); _crMap = null; }
  _crMap = L.map('chaseMap', { zoomControl: true, scrollWheelZoom: true });
  addBasemap(_crMap, { switcher: true });
  mapPointMenu(_crMap);
  // known stretches faint, never-ridden stretches bold — split into runs by flag
  const runs = []; let run = null;
  cur.pts.forEach((p, i) => {
    const f = cur.new[i] || 0;
    if (!run || run.f !== f) { run = { f, pts: i ? [cur.pts[i - 1]] : [] }; runs.push(run); }
    run.pts.push(p);
  });
  _crLayer = L.layerGroup(runs.map(r => L.polyline(r.pts, r.f
    ? { color: '#fc4c02', weight: 5, opacity: 1 }
    : { color: '#fc4c02', weight: 3, opacity: 0.4 }))).addTo(_crMap);
  const b = L.latLngBounds(cur.pts);
  const fit = () => { try { _crMap.invalidateSize(); _crMap.fitBounds(b, { padding: [20, 20] }); } catch {} };
  fit(); setTimeout(fit, 300);
  _crAiRestore();
}

// the AI route generator card (js/chase-ai.js) sits on top; keep its request and result across re-renders
let _crAiText = '', _crAiShown = false;
function _crAi() {
  const t = document.getElementById('caiText'); if (t) _crAiText = t.value;
  _crAiShown = !!document.querySelector('#caiResult #caiMap') || _crAiShown;
  return typeof chaseAiCard === 'function' ? chaseAiCard() : '';
}
function _crAiRestore() {
  const t = document.getElementById('caiText'); if (t && _crAiText) t.value = _crAiText;
  if (_crAiShown && typeof chaseAiShow === 'function') chaseAiShow(typeof _caiPick !== 'undefined' ? _caiPick : 0);
}

function chasePick(id) {
  _crPick = id; try { localStorage.setItem('chase_pick', id); } catch {}
  renderChase();
}

function chaseGpx(id) {
  const r = _crData && _crData.routes.find(x => x.id === id);
  if (!r) return;
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ascent" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + `<trk><name>Chase ${r.name} — ${r.total_km} km</name><trkseg>\n`
    + r.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('\n')
    + '\n</trkseg></trk></gpx>\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = 'chase-' + r.id + '.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

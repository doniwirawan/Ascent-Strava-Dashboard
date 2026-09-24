/* ── RIDE DESTINATIONS BY REGENCY (Activities page) ──
   Bali split into its 9 regencies (8 kabupaten + Kota Denpasar; OSM
   admin_level 5, simplified into data/bali-regencies.json). Each activity is
   counted in the regency containing its destination — the route point furthest
   from the start; a loop that never gets 2 km away counts where it stayed.
   Point-in-polygon on the real boundaries, so it doesn't depend on the
   reverse-geocoded names. Hover (tap on phones) shows count, km, top village. */
let _regGeo = null, _regMap = null, _regLayer = null, _regLabels = null, _regBy = null;
const _regPoint = {}, _regOf = {}, _regPiece = {}; // activity id → destination [lat, lng] / regency name / polygon piece (memoised)

function _regDest(a) {
  if (_regPoint[a.id]) return _regPoint[a.id];
  const pl = a.map && a.map.summary_polyline;
  if (!pl) return null;
  const pts = decodePolyline(pl);
  if (!pts.length) return null;
  const home = a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng : pts[0];
  let far = home, farKm = 0;
  pts.forEach(p => { const d = aiHaversine(home[0], home[1], p[0], p[1]); if (d > farKm) { farKm = d; far = p; } });
  return (_regPoint[a.id] = farKm >= 2 ? far : home);
}

/* Ray casting; rings are GeoJSON [lng, lat]. First ring = outer, rest = holes. */
function _regInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function _regPieceAt(geom, lng, lat) { // index of the polygon piece containing the point, or -1
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.findIndex(rings => _regInRing(lng, lat, rings[0]) && !rings.slice(1).some(h => _regInRing(lng, lat, h)));
}
function _regContains(geom, lng, lat) { return _regPieceAt(geom, lng, lat) >= 0; }

/* A label point well inside the shape (rough pole of inaccessibility): sample a
   grid over the bounds, keep points inside, take the one furthest from any
   vertex. The bbox centre can fall on the border for long thin regencies.
   `piece` = which island to label (Klungkung's rides are on the mainland,
   not on Nusa Penida, its biggest piece); defaults to the biggest. */
function _regLabelPoint(geom, piece) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const main = polys[piece] || polys.reduce((m, r) => r[0].length > m[0].length ? r : m, polys[0]);
  const xs = main[0].map(c => c[0]), ys = main[0].map(c => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = null, bestD = -1;
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
    const x = x0 + (x1 - x0) * i / 24, y = y0 + (y1 - y0) * j / 24;
    if (!_regContains({ type: 'Polygon', coordinates: main }, x, y)) continue;
    let d = Infinity; main[0].forEach(c => { const e = (c[0] - x) ** 2 + (c[1] - y) ** 2; if (e < d) d = e; });
    if (d > bestD) { bestD = d; best = [y, x]; }
  }
  return best || [(y0 + y1) / 2, (x0 + x1) / 2];
}

function _regStats(list) {
  const by = {}; let outside = 0;
  _regGeo.features.forEach(f => { by[f.properties.name] = { n: 0, m: 0, dest: {}, pieces: {}, acts: [] }; });
  list.forEach(a => {
    if (!(a.id in _regOf)) {
      const p = _regDest(a);
      let name = p ? '' : null;
      if (p) _regGeo.features.some(f => { const k = _regPieceAt(f.geometry, p[1], p[0]); if (k < 0) return false; name = f.properties.name; _regPiece[a.id] = k; return true; });
      _regOf[a.id] = name;
    }
    const name = _regOf[a.id];
    if (name === null) return;
    if (!name) { outside++; return; }
    const s = by[name];
    s.n++; s.m += a.distance || 0; s.acts.push(a);
    s.pieces[_regPiece[a.id]] = (s.pieces[_regPiece[a.id]] || 0) + 1;
    const v = a.route_places && a.route_places.furthest_place;
    if (v) { const d = v.split(',')[0]; s.dest[d] = (s.dest[d] || 0) + 1; }
  });
  return { by, outside };
}

async function renderRegencyMap() {
  const card = document.getElementById('regencyCard');
  if (!card || typeof acts === 'undefined' || !window.L) return;
  const list = (typeof modeActs === 'function' ? modeActs() : acts).filter(a => a.map && a.map.summary_polyline);
  if (!list.length) { card.style.display = 'none'; return; }
  if (!_regGeo) {
    try { _regGeo = await (await fetch('data/bali-regencies.json')).json(); } catch { return; }
  }
  const { by, outside } = _regStats(list);
  _regBy = by;
  renderRegencyTags();
  const max = Math.max(1, ...Object.values(by).map(s => s.n));
  if (!Object.values(by).some(s => s.n)) { card.style.display = 'none'; return; }
  card.style.display = '';

  const T = typeof tr === 'function' ? tr : (x => x), TF = typeof trf === 'function' ? trf : ((s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const topOf = s => Object.entries(s.dest).sort((x, y) => y[1] - x[1])[0];
  const tip = (name, s) => '<b>' + name + '</b><br>' + TF('{0} rides', s.n) + ' · ' + fmtD(s.m)
    + (topOf(s) ? '<br>' + TF('Top destination: {0} ({1}×)', topOf(s)[0], topOf(s)[1]) : '');

  // map (built once; restyled on re-render)
  const el = document.getElementById('regencyMap');
  if (!_regMap) {
    _regMap = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: false, zoomSnap: 0.25 });
    addBasemap(_regMap);
  }
  if (_regLayer) _regLayer.remove();
  if (_regLabels) _regLabels.remove();
  const labels = [];
  _regLayer = L.geoJSON(_regGeo, {
    style: f => { const s = by[f.properties.name]; const k = s.n ? Math.sqrt(s.n / max) : 0;
      return { color: s.n ? '#fc4c02' : '#666', weight: 1.4, fillColor: '#fc4c02', fillOpacity: s.n ? 0.12 + 0.6 * k : 0.03 }; },
    onEachFeature: (f, layer) => {
      const name = f.properties.name, s = by[name];
      const touch = window.matchMedia && matchMedia('(hover: none)').matches;
      layer.bindTooltip(tip(name, s), { sticky: !touch, direction: touch ? 'top' : 'auto', className: 'regency-tip' });
      layer.on('mouseover', () => layer.setStyle({ weight: 3, color: '#ffffff' }));
      layer.on('mouseout', () => _regLayer.resetStyle(layer));
      layer.on('click', () => { if (s.n) openRegencyRides(name); });
      if (s.n) labels.push(L.tooltip({ permanent: true, direction: 'center', className: 'regency-count', interactive: false })
        .setLatLng(_regLabelPoint(f.geometry, +Object.entries(s.pieces).sort((x, y) => y[1] - x[1])[0][0])).setContent(String(s.n)));
    },
  }).addTo(_regMap);
  _regLabels = L.layerGroup(labels).addTo(_regMap);
  const fit = () => { try { _regMap.invalidateSize(); _regMap.fitBounds(_regLayer.getBounds(), { padding: [10, 10] }); } catch {} };
  fit(); setTimeout(fit, 300);

  // ranked list beside / under the map
  const rows = Object.entries(by).filter(([, s]) => s.n).sort((x, y) => y[1].n - x[1].n);
  document.getElementById('regencyList').innerHTML = rows.map(([name, s]) => {
    const t = topOf(s);
    return '<div class="regency-row" role="button" tabindex="0" onclick="openRegencyRides(\'' + name + '\')"><div class="regency-row-head"><span class="regency-name">' + name + '</span><span class="regency-n">' + s.n + '</span></div>'
      + '<div class="regency-bar"><span style="width:' + Math.round(s.n / max * 100) + '%"></span></div>'
      + '<div class="regency-sub">' + fmtD(s.m) + (t ? ' · ' + TF('mostly {0}', t[0]) : '') + '</div></div>';
  }).join('') + (outside ? '<div class="regency-sub regency-outside">' + TF('{0} outside Bali', outside) + '</div>' : '');
}

/* Popup listing the rides whose destination is in a regency (newest first).
   Sits under the activity modal, so closing a ride returns to this list. */
function openRegencyRides(name) {
  const s = _regBy && _regBy[name];
  const box = document.getElementById('regencyModal');
  if (!s || !box) return;
  const TF = typeof trf === 'function' ? trf : ((t, ...a) => t.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const rides = s.acts.slice().sort((x, y) => new Date(y.start_date) - new Date(x.start_date));
  document.getElementById('regencyModalTitle').textContent = name;
  document.getElementById('regencyModalBody').innerHTML =
    '<div class="regency-modal-sum">' + TF('{0} rides', s.n) + ' · ' + fmtD(s.m) + '</div>'
    + '<div class="act-list regency-rides">' + rides.map(a => {
      const dest = a.route_places && a.route_places.furthest_place;
      return '<div class="act-row" role="button" tabindex="0" onclick="openActivityModal(\'' + a.id + '\')">'
        + '<div style="flex:1;min-width:0"><div class="act-name">' + (a.name || 'Activity').replace(/</g, '&lt;') + '</div>'
        + '<div class="act-meta">' + fmtDt(a.start_date_local || a.start_date) + '</div>'
        + (dest ? '<div class="act-where"><span class="act-place">📍 ' + dest + '</span></div>' : '') + '</div>'
        + '<div class="act-right"><div class="act-dist">' + fmtD(a.distance) + '</div><div class="act-time">' + fmtT(a.moving_time) + '</div></div></div>';
    }).join('') + '</div>';
  box.classList.add('open');
}
function closeRegencyRides() { const b = document.getElementById('regencyModal'); if (b) b.classList.remove('open'); }
document.addEventListener('click', e => { if (e.target && e.target.id === 'regencyModal') closeRegencyRides(); });

/* Regency tag chips under the activity search: tap to filter the list to rides
   whose destination is in that regency (combines with the text search). */
function renderRegencyTags() {
  const el = document.getElementById('actRegTags');
  if (!el || !_regBy) return;
  const rows = Object.entries(_regBy).filter(([, s]) => s.n).sort((x, y) => y[1].n - x[1].n);
  if (_actRegency && !(_regBy[_actRegency] && _regBy[_actRegency].n)) _actRegency = '';
  el.innerHTML = rows.map(([name, s]) => '<button type="button" class="act-reg-tag' + (name === _actRegency ? ' on' : '') + '" data-reg="' + name + '">'
    + name + ' <b>' + s.n + '</b></button>').join('');
  el.querySelectorAll('.act-reg-tag').forEach(b => b.onclick = () => {
    _actRegency = _actRegency === b.dataset.reg ? '' : b.dataset.reg;
    el.querySelectorAll('.act-reg-tag').forEach(x => x.classList.toggle('on', x.dataset.reg === _actRegency));
    _renderActList((document.getElementById('actSearch') || {}).value || '');
  });
}

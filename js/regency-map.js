/* ── RIDE DESTINATIONS BY REGENCY (Activities page) ──
   Bali split into its 9 regencies (8 kabupaten + Kota Denpasar; OSM
   admin_level 5, simplified into data/bali-regencies.json). Each activity is
   counted in the regency containing its destination — the route point furthest
   from the start; a loop that never gets 2 km away counts where it stayed.
   Point-in-polygon on the real boundaries, so it doesn't depend on the
   reverse-geocoded names. Hover (tap on phones) shows count, km, top village. */
let _regGeo = null, _regMap = null, _regLayer = null, _regLabels = null;
const _regPoint = {}, _regOf = {}; // activity id → destination [lat, lng] / regency name (memoised)

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
function _regContains(geom, lng, lat) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some(rings => _regInRing(lng, lat, rings[0]) && !rings.slice(1).some(h => _regInRing(lng, lat, h)));
}

/* A label point well inside the shape (rough pole of inaccessibility): sample a
   grid over the bounds, keep points inside, take the one furthest from any
   vertex. The bbox centre can fall on the border for long thin regencies. */
function _regLabelPoint(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const main = polys.reduce((m, r) => r[0].length > m[0].length ? r : m, polys[0]); // biggest piece
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
  _regGeo.features.forEach(f => { by[f.properties.name] = { n: 0, m: 0, dest: {} }; });
  list.forEach(a => {
    if (!(a.id in _regOf)) {
      const p = _regDest(a);
      const f = p && _regGeo.features.find(f => _regContains(f.geometry, p[1], p[0]));
      _regOf[a.id] = p ? (f ? f.properties.name : '') : null;
    }
    const name = _regOf[a.id];
    if (name === null) return;
    if (!name) { outside++; return; }
    const s = by[name];
    s.n++; s.m += a.distance || 0;
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
      layer.on('click', e => layer.openTooltip(e.latlng)); // phones: tap to show the count
      if (s.n) labels.push(L.tooltip({ permanent: true, direction: 'center', className: 'regency-count', interactive: false })
        .setLatLng(f._labelAt || (f._labelAt = _regLabelPoint(f.geometry))).setContent(String(s.n)));
    },
  }).addTo(_regMap);
  _regLabels = L.layerGroup(labels).addTo(_regMap);
  const fit = () => { try { _regMap.invalidateSize(); _regMap.fitBounds(_regLayer.getBounds(), { padding: [10, 10] }); } catch {} };
  fit(); setTimeout(fit, 300);

  // ranked list beside / under the map
  const rows = Object.entries(by).filter(([, s]) => s.n).sort((x, y) => y[1].n - x[1].n);
  document.getElementById('regencyList').innerHTML = rows.map(([name, s]) => {
    const t = topOf(s);
    return '<div class="regency-row"><div class="regency-row-head"><span class="regency-name">' + name + '</span><span class="regency-n">' + s.n + '</span></div>'
      + '<div class="regency-bar"><span style="width:' + Math.round(s.n / max * 100) + '%"></span></div>'
      + '<div class="regency-sub">' + fmtD(s.m) + (t ? ' · ' + TF('mostly {0}', t[0]) : '') + '</div></div>';
  }).join('') + (outside ? '<div class="regency-sub regency-outside">' + TF('{0} outside Bali', outside) + '</div>' : '');
}

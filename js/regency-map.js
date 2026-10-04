/* ── RIDE DESTINATIONS BY REGENCY (Activities page) ──
   Bali split into its 9 regencies (8 kabupaten + Kota Denpasar; OSM
   admin_level 5, simplified into data/bali-regencies.json). Each activity is
   counted in the regency containing its destination — the route point furthest
   from the start; a loop that never gets 2 km away counts where it stayed.
   Point-in-polygon on the real boundaries, so it doesn't depend on the
   reverse-geocoded names. Hover (tap on phones) shows count, km, top village.

   Outside Bali the areas come from Nominatim instead: a destination no known
   shape contains is looked up once at zoom 8 (≈ regency level — Gianyar, a
   Singapore planning area like Tampines, Paris) and the returned boundary is
   kept in localStorage, so later points inside it match locally. Areas are
   grouped into places (state, else city, else country) — Bali, Singapore… —
   and the card shows one place at a time. */
let _regGeo = null, _regMap = null, _regLayer = null, _regLabels = null, _regBy = null, _regGroup = '';
// the place last picked on the card — kept while a sport filter hides it, and across visits
let _regPick = ''; try { _regPick = localStorage.getItem('reg_group') || ''; } catch {}
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

/* Areas fetched from Nominatim: feats = GeoJSON features, pts = rounded
   point → area name ('' = no area there, e.g. out at sea). */
const AREA_LS = 'areas_v2'; // v1 could hold a whole-province "Bali" area (see _regNearBali)
let _areaStore = null;
function _areas() {
  if (!_areaStore) { try { _areaStore = JSON.parse(localStorage.getItem(AREA_LS) || 'null'); } catch {} }
  return _areaStore || (_areaStore = { feats: [], pts: {} });
}
function _areasSave() { try { localStorage.setItem(AREA_LS, JSON.stringify(_areas())); } catch {} }
const _ptKey = p => p[0].toFixed(3) + ',' + p[1].toFixed(3);

function _regStats(list) {
  const by = {}, missing = []; let outside = 0;
  _regGeo.features.forEach(f => { const pr = f.properties; by[pr.name] = { n: 0, m: 0, dest: {}, pieces: {}, acts: [], group: pr.group, cc: pr.cc }; });
  list.forEach(a => {
    if (!(a.id in _regOf)) {
      const p = _regDest(a);
      let name = p ? '' : null;
      if (p && !_regGeo.features.some(f => { const k = _regPieceAt(f.geometry, p[1], p[0]); if (k < 0) return false; name = f.properties.name; _regPiece[a.id] = k; return true; })) {
        const k = _regNearBali(p) || _areas().pts[_ptKey(p)];
        if (k === undefined) { missing.push(p); outside++; return; } // not looked up yet
        name = k; _regPiece[a.id] = -1;
      }
      _regOf[a.id] = name;
    }
    const name = _regOf[a.id];
    if (name === null) return;
    if (!name || !by[name]) { outside++; return; }
    const s = by[name];
    s.n++; s.m += a.distance || 0; s.acts.push(a);
    s.pieces[_regPiece[a.id]] = (s.pieces[_regPiece[a.id]] || 0) + 1;
    const v = a.route_places && a.route_places.furthest_place;
    if (v) { const d = a.route_places.furthest_landmark || v.split(',')[0]; s.dest[d] = (s.dest[d] || 0) + 1; }
  });
  return { by, outside, missing };
}

/* Beaches, Serangan, the harbour: Bali destinations that fall just outside the
   simplified regency outlines. Within 1.5 km of one (Java is further across
   the strait) they belong to the nearest regency — Nominatim would answer with
   the whole province instead. */
function _regNearBali(p) {
  const k = Math.cos(p[0] * Math.PI / 180), px = p[1] * k, py = p[0];
  let best = 1.5, name;
  _regGeo.features.forEach(f => {
    if (f.properties.group !== 'Bali') return;
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(rings => {
      const r = rings[0];
      for (let i = 1; i < r.length; i++) {
        const ax = r[i - 1][0] * k, ay = r[i - 1][1], dx = r[i][0] * k - ax, dy = r[i][1] - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const km = Math.hypot(px - ax - t * dx, py - ay - t * dy) * 111.32;
        if (km < best) { best = km; name = f.properties.name; }
      }
    });
  });
  return name;
}

/* Add a Nominatim zoom-8 result as an area; returns its name ('' if none).
   A result naming an area we already have (a Bali point just off the coast
   comes back as "Gianyar") maps onto that one instead of a duplicate. */
function _areaAdd(r) {
  const g = r && r.geojson, ad = (r && r.address) || {};
  if (!g || !/Polygon$/.test(g.type)) return '';
  const group = ad.state || ad.city || ad.country || '';
  let name = r.name || ad.suburb || ad.city_district || ad.city || ad.county || '';
  // a whole province / state is too coarse to be an area (and overlaps the rest)
  if (!name || name === group && /^(state|province)$/.test(r.addresstype || '')) return '';
  const same = _regGeo.features.find(f => f.properties.group === group && normKab(f.properties.name) === normKab(name));
  if (same) return same.properties.name;
  if (_regGeo.features.some(f => f.properties.name === name)) name += ', ' + group;
  const f = { type: 'Feature', geometry: g, properties: { name, group, cc: ad.country_code || '' } };
  _regGeo.features.push(f); _areas().feats.push(f);
  return name;
}

/* Look up the area of each destination no known shape contains (through the
   shared rate-limited Nominatim queue), then re-render the maps once. */
let _regBusy = false;
async function _regResolve(points) {
  if (_regBusy || !points.length || typeof _geoThrottled !== 'function') return 0;
  _regBusy = true;
  const st = _areas(); let added = 0;
  for (const p of points) {
    const k = _ptKey(p);
    if (k in st.pts || _regGeo.features.some(f => _regContains(f.geometry, p[1], p[0]))) continue;
    const r = await _geoThrottled(() => fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=8&polygon_geojson=1&polygon_threshold=0.002&lat=' + p[0] + '&lon=' + p[1], { headers: { Accept: 'application/json' } })
      .then(x => x.ok ? x.json() : null).catch(() => null));
    if (!r) continue; // network trouble — retried on a later render
    st.pts[k] = _areaAdd(r); added++;
  }
  _regBusy = false;
  if (added) {
    _areasSave(); renderRegencyMap();
    if (typeof heatMode !== 'undefined' && heatMode === 'regency' && typeof renderHeatmap === 'function' && typeof leafletMapInst !== 'undefined' && leafletMapInst) renderHeatmap();
  }
  return added;
}

/* Country most activities start in — picks "regency / village" wording or
   the neutral "area / place". Places saved before the country was recorded
   are all Bali; with nothing placed yet, fall back to the athlete profile. */
function mainCountry() {
  const c = {};
  (typeof acts !== 'undefined' ? acts : []).forEach(a => { const r = a.route_places; if (r && r.start_place) { const k = r.cc || 'id'; c[k] = (c[k] || 0) + 1; } });
  const top = Object.entries(c).sort((x, y) => y[1] - x[1])[0];
  if (top) return top[0];
  const ca = typeof currentAthlete !== 'undefined' && currentAthlete;
  return ca && ca.country && !/indonesia/i.test(ca.country) ? 'xx' : 'id';
}
const areaIsRegency = () => mainCountry() === 'id';
// true / false once the Bali shapes are loaded, null before
function inBali(lat, lng) {
  return _regGeo ? _regGeo.features.some(f => f.properties.group === 'Bali' && _regContains(f.geometry, lng, lat)) : null;
}

/* Choropleth + count labels for `by` (from _regStats) on any Leaflet map.
   Shared by the Activities regency card and the Heatmap's Regency mode.
   Returns [polygonLayer, labelLayer], both already added to `map`. */
function regencyLayers(map, by) {
  const TF = typeof trf === 'function' ? trf : ((s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const max = Math.max(1, ...Object.values(by).map(s => s.n));
  const topOf = s => Object.entries(s.dest).sort((x, y) => y[1] - x[1])[0];
  const tip = (name, s) => '<b>' + name + '</b><br>' + _regCount(s.acts) + ' · ' + fmtD(s.m)
    + (topOf(s) ? '<br>' + TF('Top destination: {0} ({1}×)', topOf(s)[0], topOf(s)[1]) : '');
  const labels = [];
  const layer = L.geoJSON(_regGeo, {
    style: f => { const s = by[f.properties.name]; const k = s.n ? Math.sqrt(s.n / max) : 0;
      return { color: s.n ? '#fc4c02' : '#666', weight: 1.4, fillColor: '#fc4c02', fillOpacity: s.n ? 0.12 + 0.6 * k : 0.03 }; },
    onEachFeature: (f, l) => {
      const name = f.properties.name, s = by[name];
      const touch = window.matchMedia && matchMedia('(hover: none)').matches;
      l.bindTooltip(tip(name, s), { sticky: !touch, direction: touch ? 'top' : 'auto', className: 'regency-tip' });
      l.on('mouseover', () => l.setStyle({ weight: 3, color: '#ffffff' }));
      l.on('mouseout', () => layer.resetStyle(l));
      l.on('click', () => { if (s.n) openRegencyRides(name); });
      if (s.n) labels.push(L.tooltip({ permanent: true, direction: 'center', className: 'regency-count', interactive: false })
        .setLatLng(_regLabelPoint(f.geometry, +Object.entries(s.pieces).sort((x, y) => y[1] - x[1])[0][0])).setContent(String(s.n)));
    },
  }).addTo(map);
  return [layer, L.layerGroup(labels).addTo(map)];
}

/* "3 rides" / "1 walk" / "4 activities" — named after what is actually in the
   list, since with the All sports mode an area can hold walks and runs too. */
function _regCount(list) {
  const TF = typeof trf === 'function' ? trf : ((s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const kind = a => isRide(a) ? 'ride' : isRun(a) ? 'run' : isWalk(a) ? 'walk' : isSwim(a) ? 'swim' : '';
  const kinds = new Set(list.map(kind)), k = kinds.size === 1 ? [...kinds][0] : '';
  const W = { ride: ['{0} ride', '{0} rides'], run: ['{0} run', '{0} runs'], walk: ['{0} walk', '{0} walks'],
    swim: ['{0} swim', '{0} swims'], '': ['{0} activity', '{0} activities'] };
  return TF(W[k][list.length === 1 ? 0 : 1], list.length);
}

// Load the Bali regency boundaries once, plus the areas fetched on earlier
// visits (null if the file can't be fetched).
async function regencyGeo() {
  if (!_regGeo) {
    let base; try { base = await (await fetch('data/bali-regencies.json')).json(); } catch { return null; }
    base.features.forEach(f => Object.assign(f.properties, { group: 'Bali', cc: 'id' }));
    _regGeo = { type: 'FeatureCollection', features: base.features.concat(_areas().feats) };
  }
  return _regGeo;
}

async function renderRegencyMap() {
  const card = document.getElementById('regencyCard');
  if (!card || typeof acts === 'undefined' || !window.L) return;
  const list = (typeof modeActs === 'function' ? modeActs() : acts).filter(a => a.map && a.map.summary_polyline);
  if (!list.length) { card.style.display = 'none'; return; }
  if (!await regencyGeo()) return;
  const { by, missing } = _regStats(list);
  _regBy = by;
  renderRegencyTags();
  _regResolve(missing);
  if (!Object.values(by).some(s => s.n)) { card.style.display = 'none'; return; }
  card.style.display = '';

  const T = typeof tr === 'function' ? tr : (x => x);
  const TF = typeof trf === 'function' ? trf : ((s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const topOf = s => Object.entries(s.dest).sort((x, y) => y[1] - x[1])[0];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // places (Bali, Singapore, …) by activity count; the card shows one at a time
  const groups = {};
  Object.values(by).forEach(s => { if (s.n) (groups[s.group] = groups[s.group] || { n: 0, cc: s.cc }).n += s.n; });
  const gl = Object.entries(groups).sort((x, y) => y[1].n - x[1].n);
  _regGroup = groups[_regPick] ? _regPick : gl[0][0];
  const G = groups[_regGroup], inG = Object.entries(by).filter(([, s]) => s.group === _regGroup);
  const max = Math.max(1, ...inG.map(([, s]) => s.n));
  const elsewhere = list.length - G.n;
  card.querySelector('.card-title').textContent = T(G.cc === 'id' ? 'Ride destinations by regency' : 'Destinations by area');
  card.querySelector('.chart-note').textContent = T(_regGroup === 'Bali'
    ? "Where each ride turned around, on Bali's regencies. Loops count where they stayed. Hover or tap a regency for details."
    : 'Where each activity turned around, by area. Loops count where they stayed. Hover or tap an area for details.');
  const pl = document.getElementById('regencyPlaces');
  pl.style.display = gl.length > 1 ? '' : 'none';
  pl.innerHTML = gl.map(([g, o]) => '<button type="button" class="act-reg-tag' + (g === _regGroup ? ' on' : '') + '" data-g="' + esc(g) + '">' + esc(g) + ' <b>' + o.n + '</b></button>').join('');
  pl.querySelectorAll('button').forEach(b => b.onclick = () => {
    _regPick = b.dataset.g; try { localStorage.setItem('reg_group', _regPick); } catch {}
    renderRegencyMap();
  });

  // map (built once; restyled on re-render)
  const el = document.getElementById('regencyMap');
  if (!_regMap) {
    _regMap = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: false, zoomSnap: 0.25 });
    addBasemap(_regMap);
  }
  if (_regLayer) _regLayer.remove();
  if (_regLabels) _regLabels.remove();
  [_regLayer, _regLabels] = regencyLayers(_regMap, by);
  // Bali frames all its regencies; fetched areas only exist where you went
  const shown = L.geoJSON({ type: 'FeatureCollection', features: _regGeo.features.filter(f => f.properties.group === _regGroup && (_regGroup === 'Bali' || by[f.properties.name].n)) });
  const fit = () => { try { _regMap.invalidateSize(); _regMap.fitBounds(shown.getBounds(), { padding: [10, 10] }); } catch {} };
  fit(); setTimeout(fit, 300);

  // ranked list beside / under the map
  const rows = inG.filter(([, s]) => s.n).sort((x, y) => y[1].n - x[1].n);
  const listEl = document.getElementById('regencyList');
  listEl.innerHTML = rows.map(([name, s]) => {
    const t = topOf(s);
    return '<div class="regency-row" role="button" tabindex="0" data-reg="' + esc(name) + '"><div class="regency-row-head"><span class="regency-name">' + esc(name) + '</span><span class="regency-n">' + s.n + '</span></div>'
      + '<div class="regency-bar"><span style="width:' + Math.round(s.n / max * 100) + '%"></span></div>'
      + '<div class="regency-sub">' + fmtD(s.m) + (t ? ' · ' + TF('mostly {0}', t[0]) : '') + '</div></div>';
  }).join('') + (elsewhere > 0 ? '<div class="regency-sub regency-outside">' + TF(_regGroup === 'Bali' ? '{0} outside Bali' : '{0} elsewhere', elsewhere) + '</div>' : '');
  listEl.querySelectorAll('.regency-row').forEach(r => r.onclick = () => openRegencyRides(r.dataset.reg));
}

/* Popup listing the rides whose destination is in a regency (newest first).
   Sits under the activity modal, so closing a ride returns to this list. */
function openRegencyRides(name) {
  const s = _regBy && _regBy[name];
  const box = document.getElementById('regencyModal');
  if (!s || !box) return;
  const TF = typeof trf === 'function' ? trf : ((t, ...a) => t.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  document.getElementById('regencyModalTitle').textContent = name;
  document.getElementById('regencyModalBody').innerHTML =
    '<div class="regency-modal-sum">' + _regCount(s.acts) + ' · ' + fmtD(s.m) + '</div>' + _regRideRows(s.acts);
  box.classList.add('open');
}

// Clickable ride rows (newest first) for the list popups.
function _regRideRows(list) {
  const rides = list.slice().sort((x, y) => new Date(y.start_date) - new Date(x.start_date));
  return '<div class="act-list regency-rides">' + rides.map(a => {
    const dest = a.route_places && a.route_places.furthest_place && destName(a.route_places);
    return '<div class="act-row" role="button" tabindex="0" onclick="openActivityModal(\'' + a.id + '\')">'
      + '<div style="flex:1;min-width:0"><div class="act-name">' + (a.name || 'Activity').replace(/</g, '&lt;') + '</div>'
      + '<div class="act-meta">' + fmtDt(a.start_date_local || a.start_date) + '</div>'
      + (dest ? '<div class="act-where"><span class="act-place">📍 ' + dest + '</span></div>' : '') + '</div>'
      + '<div class="act-right"><div class="act-dist">' + fmtD(a.distance) + '</div><div class="act-time">' + fmtT(a.moving_time) + '</div></div></div>';
  }).join('') + '</div>';
}

/* ── VILLAGES REACHED popup (Overview "Villages reached" card) ──
   Every desa a ride started in or turned around at, grouped Kabupaten →
   Kecamatan with visit counts; tap a desa for the rides through it. Built from
   each activity's reverse-geocoded route_places. Outside Indonesia the same
   levels read region → district → neighbourhood, and with more than one
   country the list is split by country first. */
let _villages = null; // place → {desa, kec, kab, acts[]}
// The geocoder is inconsistent: "Kabupaten Klungkung" vs "Gianyar", and
// sometimes only the province ("Bali"). Province-only means unknown.
const _PROVINCES = /^(Bali|Nusa Tenggara (Barat|Timur)|Jawa (Barat|Tengah|Timur))$/i;
function normKab(k) { k = (k || '').replace(/^(Kabupaten|Kota)\s+/i, '').trim(); return _PROVINCES.test(k) ? '' : k; }
function setVillages(list) {
  const v = {};
  const add = (place, kec, kab, a, cc, country) => {
    if (!place) return;
    const desa = place.split(',')[0].trim();
    if (!desa || _PROVINCES.test(desa)) return;          // no village, just a province
    // places saved before a fix was known (see PLACE_ADMIN_FIXES)
    if (typeof fixPlaceAdmin === 'function') ({ kec, kab } = fixPlaceAdmin(desa, (kec || '').trim(), kab));
    // saved before the country was recorded = Bali
    const o = v[place] || (v[place] = { desa, kec: (kec || '').trim(), kab: normKab(kab), cc: cc || 'id', country: country || (cc ? cc.toUpperCase() : 'Indonesia'), acts: [] });
    if (!o.kab) o.kab = normKab(kab);
    if (!o.kec && kec) o.kec = kec.trim();
    if (!o.acts.includes(a)) o.acts.push(a);
  };
  list.forEach(a => {
    const r = a.route_places; if (!r) return;
    add(r.start_place, r.start_kec, r.start_kab, a, r.cc, r.country);
    add(r.furthest_place, r.furthest_kec, r.furthest_kab, a, r.furthest_cc || r.cc, r.furthest_country || r.country);
  });
  _villages = v;
  const all = Object.values(v);
  return (_villageStats = { villages: all.length, kecs: new Set(all.map(o => o.kec).filter(Boolean)), kabs: new Set(all.map(o => o.kab).filter(Boolean)),
    countries: new Set(all.map(o => o.country)) });
}
let _villageStats = null;
function openVillageList() {
  const box = document.getElementById('regencyModal');
  if (!_villages || !box) return;
  const T = typeof tr === 'function' ? tr : (x => x), TF = typeof trf === 'function' ? trf : ((t, ...a) => t.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // country → kab → kec → places; '' kec (outside Indonesia) = no sub-heading
  const tree = {};
  Object.entries(_villages).forEach(([place, o]) => {
    const id = o.cc === 'id';
    const kab = o.kab || T(id ? 'Unknown regency' : 'Unknown area'), kec = o.kec || (id ? T('Unknown kecamatan') : '');
    const c = tree[o.country] || (tree[o.country] = {});
    ((c[kab] = c[kab] || { id, kecs: {} }).kecs[kec] = c[kab].kecs[kec] || []).push([place, o]);
  });
  const n = o => o.acts.length;
  const sum = arr => arr.reduce((s, [, o]) => s + n(o), 0);
  const kabSum = k => sum(Object.values(k.kecs).flat());
  const ctySum = c => Object.values(c).reduce((s, k) => s + kabSum(k), 0);
  const multi = Object.keys(tree).length > 1, reg = areaIsRegency();
  document.getElementById('regencyModalTitle').textContent = T(reg ? 'Villages reached' : 'Places reached');
  document.getElementById('regencyModalBody').innerHTML =
    '<div class="regency-modal-sum">' + TF(reg ? '{0} villages · {1} kecamatan · {2} regencies' : '{0} places · {1} districts · {2} regions', _villageStats.villages, _villageStats.kecs.size, _villageStats.kabs.size) + '</div>'
    + '<div class="vil-list">' + Object.entries(tree).sort((x, y) => ctySum(y[1]) - ctySum(x[1])).map(([cty, kabs]) =>
      (multi ? '<div class="vil-country">' + esc(cty) + '</div>' : '')
      + Object.entries(kabs).sort((x, y) => kabSum(y[1]) - kabSum(x[1])).map(([kab, k]) =>
        '<div class="vil-kab">' + esc(kab) + '</div>'
        + Object.entries(k.kecs).sort((x, y) => sum(y[1]) - sum(x[1])).map(([kec, vs]) =>
          (kec ? '<div class="vil-kec">' + (k.id ? TF('Kec. {0}', esc(kec)) : esc(kec)) + '</div>' : '')
          + vs.sort((x, y) => n(y[1]) - n(x[1])).map(([place, o]) =>
            '<div class="vil-row" role="button" tabindex="0" data-place="' + esc(place) + '"><span>' + esc(o.desa) + '</span><b>' + TF('{0}×', n(o)) + '</b></div>').join('')
        ).join('')
      ).join('')
    ).join('') + '</div>';
  document.querySelectorAll('#regencyModalBody .vil-row').forEach(r => {
    const open = () => openVillageRides(r.dataset.place);
    r.onclick = open;
    r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
  box.classList.add('open');
}
function openVillageRides(place) {
  const o = _villages && _villages[place];
  if (!o) return;
  const T = typeof tr === 'function' ? tr : (x => x), TF = typeof trf === 'function' ? trf : ((t, ...a) => t.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  document.getElementById('regencyModalTitle').textContent = o.desa;
  document.getElementById('regencyModalBody').innerHTML =
    '<button type="button" class="vil-back" onclick="openVillageList()">← ' + T(areaIsRegency() ? 'All villages' : 'All places') + '</button>'
    + '<div class="regency-modal-sum">' + [o.kec && (o.cc === 'id' ? TF('Kec. {0}', o.kec) : o.kec), o.kab, o.cc !== 'id' && o.country].filter(Boolean).join(' · ') + ' · ' + _regCount(o.acts) + '</div>'
    + _regRideRows(o.acts);
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

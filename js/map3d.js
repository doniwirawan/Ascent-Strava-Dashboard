/* ── 3D MAP ──
   A "3D" button on the heatmap opens the same spot as a tilted 3D view: Esri
   satellite imagery draped over real terrain (AWS/Mapzen Terrain Tiles, key-free,
   terrarium-encoded), with your routes drawn on the ground. MapLibre GL is only
   downloaded the first time 3D is opened. The view lives inside the Leaflet
   container, so the ⛶ full-screen mode carries over. */
const M3D_VER = '4.7.1';
const M3D_ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
let _m3dLib = null;

function _m3dLoad() {
  if (window.maplibregl) return Promise.resolve();
  if (_m3dLib) return _m3dLib;
  _m3dLib = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `https://unpkg.com/maplibre-gl@${M3D_VER}/dist/maplibre-gl.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `https://unpkg.com/maplibre-gl@${M3D_VER}/dist/maplibre-gl.js`;
    s.onload = res;
    s.onerror = () => { _m3dLib = null; rej(new Error('MapLibre failed to load')); };
    document.head.appendChild(s);
  });
  return _m3dLib;
}

// Close the 3D view in this Leaflet container (also called before the 2D map is rebuilt).
function close3d(host) {
  if (!host || !host._m3d) return;
  try { host._m3d.map && host._m3d.map.remove(); } catch {}
  try { host._m3d.box.remove(); } catch {}
  document.removeEventListener('keydown', host._m3d.onKey);
  host._m3d = null;
}

/* tracks: [[ [lat,lng], … ], …] — the routes the 2D map is showing. */
async function open3d(lmap, tracks) {
  const host = lmap.getContainer();
  if (host._m3d) return;
  const box = L.DomUtil.create('div', 'map3d', host);
  // keep Leaflet from panning/zooming underneath while you fly around in 3D
  L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
  ['pointerdown', 'touchstart', 'contextmenu', 'keydown'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation()));
  const onKey = e => { if (e.key === 'Escape' && !document.fullscreenElement) close3d(host); };
  host._m3d = { box, map: null, onKey };
  document.addEventListener('keydown', onKey);

  const close = '<button type="button" class="map3d-close">✕ ' + tr('Back to 2D') + '</button>';
  box.innerHTML = '<div class="map3d-msg">' + tr('Loading 3D…') + '</div>' + close;
  box.querySelector('.map3d-close').onclick = () => close3d(host);
  try { await _m3dLoad(); } catch {
    box.querySelector('.map3d-msg').textContent = tr('Couldn’t load the 3D map — check your connection and try again.');
    return;
  }
  if (host._m3d?.box !== box) return; // closed while loading

  const labelsOn = !!(lmap._labels && lmap.hasLayer(lmap._labels));
  const raster = (url, extra) => Object.assign({ type: 'raster', tiles: [url], tileSize: 256, maxzoom: 19 }, extra);
  const style = {
    version: 8,
    sources: {
      sat: raster(M3D_ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery &copy; Esri' }),
      dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
             tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Terrain: Mapzen / AWS Terrain Tiles' },
      roads: raster(M3D_ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { attribution: 'Labels &copy; Esri' }),
      places: raster(M3D_ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'),
      routes: { type: 'geojson', data: { type: 'Feature', properties: {},
        geometry: { type: 'MultiLineString', coordinates: tracks.map(t => t.map(p => [p[1], p[0]])) } } },
    },
    layers: [
      { id: 'sat', type: 'raster', source: 'sat' },
      // same grey treatment as the 2D overlay, so its roads never look like routes
      { id: 'roads', type: 'raster', source: 'roads', layout: { visibility: labelsOn ? 'visible' : 'none' }, paint: { 'raster-saturation': -1, 'raster-opacity': 0.85 } },
      { id: 'places', type: 'raster', source: 'places', layout: { visibility: labelsOn ? 'visible' : 'none' } },
      { id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': 4.5, 'line-opacity': 0.45 } },
      { id: 'routes', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#fc4c02', 'line-width': 2.6 } },
    ],
    terrain: { source: 'dem', exaggeration: 1.5 },
  };
  box.querySelector('.map3d-msg').remove();
  const c = lmap.getCenter();
  // MapLibre zooms are one step off Leaflet's (512 px vs 256 px tiles)
  const m = new maplibregl.Map({ container: box, style, center: [c.lng, c.lat], zoom: Math.max(1, lmap.getZoom() - 1),
    pitch: 65, bearing: -20, maxPitch: 85, attributionControl: { compact: true } });
  host._m3d.map = m;
  m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  m.addControl(new maplibregl.FullscreenControl({ container: host }), 'top-right');

  const bar = L.DomUtil.create('div', 'map3d-bar', box);
  bar.innerHTML = close
    + '<label class="map3d-chk"><input type="checkbox"' + (labelsOn ? ' checked' : '') + '> ' + tr('Road & place names') + '</label>'
    + '<span class="map3d-hint">' + tr('Right-drag or two fingers to tilt and turn') + '</span>';
  bar.querySelector('.map3d-close').onclick = () => close3d(host);
  bar.querySelector('input').onchange = e => {
    const v = e.target.checked ? 'visible' : 'none';
    ['roads', 'places'].forEach(id => m.setLayoutProperty(id, 'visibility', v));
  };
}

function map3dControl(lmap, tracks) {
  const c = L.control({ position: 'topright' });
  c.onAdd = () => {
    const b = L.DomUtil.create('a', 'leaflet-bar map-fs-btn map-3d-btn');
    b.href = '#'; b.setAttribute('role', 'button'); b.textContent = '3D'; b.title = tr('3D view');
    L.DomEvent.disableClickPropagation(b);
    L.DomEvent.on(b, 'click', e => { L.DomEvent.preventDefault(e); open3d(lmap, tracks); });
    return b;
  };
  c.addTo(lmap);
}

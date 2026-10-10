/* ── 3D MAP ──
   A "3D" button on the heatmap opens the same spot as a tilted 3D view: Esri
   satellite imagery draped over real terrain (AWS/Mapzen Terrain Tiles, key-free,
   terrarium-encoded), with your routes drawn on the ground. MapLibre GL is only
   downloaded the first time 3D is opened. The view lives inside the Leaflet
   container, so the ⛶ full-screen mode carries over. */
const M3D_VER = '4.7.1';
const M3D_ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
let _m3dLib = null;
const M3D_DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/* Looks for the 3D view and the flyover video. Satellite/Topo are Esri imagery;
   Dark, Midnight and Paper are drawn by MapLibre itself — a background colour plus
   hillshading computed from the same elevation tiles, so every colour is ours. */
const M3D_THEMES = {
  sat:      { name: 'Satellite', route: '#fc4c02', ghost: '#ffffff', casing: '#000' },
  dark:     { name: 'Dark', route: '#fc4c02', ghost: '#8b93a3', casing: '#000', bg: '#0e1014', base: 'Canvas/World_Dark_Gray_Base',
              hs: { shadow: '#000000', highlight: '#4a5263', accent: '#1c2028', exag: 0.65 },
              sky: { sky: '#0e1014', horizon: '#232833', fog: '#0e1014' } },
  midnight: { name: 'Midnight', route: '#22d3ee', ghost: '#818cf8', casing: '#020617', glow: true, bg: '#04060d',
              hs: { shadow: '#000000', highlight: '#2c4f9e', accent: '#0c1838', exag: 0.85 },
              sky: { sky: '#04060d', horizon: '#14204a', fog: '#04060d' } },
  paper:    { name: 'Paper', route: '#e4572e', ghost: '#5f574b', casing: '#fff', bg: '#ebe5d8',
              hs: { shadow: '#6f6455', highlight: '#ffffff', accent: '#c7bca8', exag: 0.75 },
              sky: { sky: '#f4efe4', horizon: '#ebe5d8', fog: '#ebe5d8' } },
  topo:     { name: 'Topo', route: '#fc4c02', ghost: '#3b3b3b', casing: '#fff', base: 'World_Topo_Map' },
};
function m3dThemeId() { try { const t = localStorage.getItem('m3d_theme'); if (M3D_THEMES[t]) return t; } catch {} return 'sat'; }

// The theme's sources + the layers that go under the routes, and the terrain/sky.
function m3dBase(id) {
  const t = M3D_THEMES[id] || M3D_THEMES.sat;
  const dem = { type: 'raster-dem', tiles: [M3D_DEM], tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Terrain: Mapzen / AWS Terrain Tiles' };
  const sources = { dem, hs: Object.assign({}, dem) };   // hillshade gets its own copy, as MapLibre advises
  const layers = [];
  if (t.bg) layers.push({ id: 'bg', type: 'background', paint: { 'background-color': t.bg } });
  const base = id === 'sat' ? 'World_Imagery' : t.base;
  if (base) {
    sources.base = { type: 'raster', tiles: [M3D_ESRI + base + '/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: id === 'sat' ? 19 : 16, attribution: '&copy; Esri' };
    layers.push({ id: 'base', type: 'raster', source: 'base' });
  }
  if (t.hs) layers.push({ id: 'hs', type: 'hillshade', source: 'hs', paint: {
    'hillshade-shadow-color': t.hs.shadow, 'hillshade-highlight-color': t.hs.highlight,
    'hillshade-accent-color': t.hs.accent, 'hillshade-exaggeration': t.hs.exag } });
  const extra = { terrain: { source: 'dem', exaggeration: 1.5 } };
  if (t.sky) extra.sky = { 'sky-color': t.sky.sky, 'horizon-color': t.sky.horizon, 'fog-color': t.sky.fog,
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.6, 'atmosphere-blend': 0 };
  return { t, sources, layers, extra };
}

// Route line layers in the theme's colours (+ a soft glow for Midnight).
function m3dRouteLayers(t, source, width) {
  const lay = { 'line-join': 'round', 'line-cap': 'round' };
  return [
    t.glow ? { id: source + '-glow', type: 'line', source, layout: lay, paint: { 'line-color': t.route, 'line-width': width * 4, 'line-opacity': 0.35, 'line-blur': width * 3 } } : null,
    { id: source + '-casing', type: 'line', source, layout: lay, paint: { 'line-color': t.casing, 'line-width': width + 2, 'line-opacity': 0.45 } },
    { id: source, type: 'line', source, layout: lay, paint: { 'line-color': t.route, 'line-width': width } },
  ].filter(Boolean);
}

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

/* Warm-up: download MapLibre in the background when the browser is idle, so
   pressing 3D (or 🎬) doesn't wait for it. Safe to call often. */
function m3dPreload() {
  if (window.maplibregl || _m3dLib) return;
  const go = () => _m3dLoad().catch(() => {});
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
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

  let labelsOn = !!(lmap._labels && lmap.hasLayer(lmap._labels));
  const raster = (url, extra) => Object.assign({ type: 'raster', tiles: [url], tileSize: 256, maxzoom: 19 }, extra);
  const routeData = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: tracks.map(t => t.map(p => [p[1], p[0]])) } };
  const build = themeId => {
    const b = m3dBase(themeId), vis = labelsOn ? 'visible' : 'none';
    return Object.assign({
      version: 8,
      sources: Object.assign(b.sources, {
        roads: raster(M3D_ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { attribution: 'Labels &copy; Esri' }),
        places: raster(M3D_ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'),
        routes: { type: 'geojson', data: routeData },
      }),
      layers: b.layers.concat([
        // same grey treatment as the 2D overlay, so its roads never look like routes
        { id: 'roads', type: 'raster', source: 'roads', layout: { visibility: vis }, paint: { 'raster-saturation': -1, 'raster-opacity': 0.85 } },
        { id: 'places', type: 'raster', source: 'places', layout: { visibility: vis } },
      ], m3dRouteLayers(b.t, 'routes', 2.6)),
    }, b.extra);
  };
  const style = build(m3dThemeId());
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
    + '<select class="map3d-theme" aria-label="' + tr('Map style') + '">' + Object.keys(M3D_THEMES).map(k =>
        '<option value="' + k + '"' + (k === m3dThemeId() ? ' selected' : '') + '>' + tr(M3D_THEMES[k].name) + '</option>').join('') + '</select>'
    + '<label class="map3d-chk"><input type="checkbox"' + (labelsOn ? ' checked' : '') + '> ' + tr('Road & place names') + '</label>'
    + '<span class="map3d-hint">' + tr('Right-drag or two fingers to tilt and turn') + '</span>';
  bar.querySelector('.map3d-close').onclick = () => close3d(host);
  bar.querySelector('input').onchange = e => {
    labelsOn = e.target.checked;
    const v = labelsOn ? 'visible' : 'none';
    ['roads', 'places'].forEach(id => m.setLayoutProperty(id, 'visibility', v));
  };
  bar.querySelector('.map3d-theme').onchange = e => {
    try { localStorage.setItem('m3d_theme', e.target.value); } catch {}
    m.setStyle(build(e.target.value));
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

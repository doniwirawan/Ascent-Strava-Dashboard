/* ── SAVE PAGE AS IMAGE ──
   Renders the data on the currently visible section into a clean PNG of the
   chosen aspect ratio (Desktop 16:9 / Mobile 9:16) and resolution, so users
   never have to screenshot. Uses html2canvas to rasterise the section DOM. */

let _saveImgOrient = 'desktop';
let _saveImgRes    = 'hd';

const _SAVE_IMG_DIMS = {
  desktop: { hd: [1920, 1080], ultra: [3840, 2160] },
  mobile:  { hd: [1080, 1920], ultra: [2160, 3840] },
};

// human-readable label for the active section, used in the filename
function _currentSectionName() {
  const id = _ALL_SECTIONS.find(s => { const e = document.getElementById(s); return e && e.style.display !== 'none'; }) || 'statRow';
  const el = document.getElementById(id);
  const t = el && el.querySelector('.section-title');
  const name = t ? t.textContent.trim() : (id === 'statRow' ? 'Overview' : id);
  return name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';
}

function _currentSectionEl() {
  const id = _ALL_SECTIONS.find(s => { const e = document.getElementById(s); return e && e.style.display !== 'none'; }) || 'statRow';
  return document.getElementById(id);
}

function _openSaveImg() {
  document.getElementById('saveImgModal').classList.add('open');
}
function _closeSaveImg() {
  document.getElementById('saveImgModal').classList.remove('open');
}

// Rasterise a Leaflet map (tiles + route polylines) to a canvas using
// Leaflet's own projection math. html2canvas can't do this: Leaflet positions
// its panes with CSS transforms it mis-reads, so tiles land at the wrong offset
// and the SVG route overlay (the heatmap traces) is dropped entirely.
//
// With no target size it mirrors the on-screen map (used as a live overlay for
// other sections). Given targetW/targetH it re-frames the current view to fill
// that aspect ratio at full output resolution — so a mobile (9:16) export is a
// full-bleed map, not the wide on-screen strip letterboxed into a tall frame.
async function _mapToCanvas(map, targetW, targetH) {
  const ts = 256; // tile size in px
  let W, H, z, origin, dpr;

  if (targetW && targetH) {
    W = targetW; H = targetH;
    dpr = 1; // already rendering at output resolution; @2x tiles supersample

    // frame to the routes themselves (not the wide on-screen viewport) so they
    // fill the chosen aspect; fall back to the current view if no routes
    let b = null;
    map.eachLayer(l => {
      if (!(l instanceof L.Polyline) || !l.getBounds) return;
      const lb = l.getBounds();
      if (!lb.isValid()) return;
      b ? b.extend(lb) : (b = L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()));
    });
    if (!b) b = map.getBounds();

    // largest integer zoom whose route bounds still fit the frame (with a small
    // margin so traces don't touch the edges)
    const pad = 0.9, nw = b.getNorthWest(), se = b.getSouthEast();
    z = Math.min(19, map.getMaxZoom ? map.getMaxZoom() : 19);
    while (z > 0) {
      const a = map.project(nw, z), c = map.project(se, z);
      if (Math.abs(c.x - a.x) <= W * pad && Math.abs(c.y - a.y) <= H * pad) break;
      z--;
    }
    origin = map.project(b.getCenter(), z).subtract([W / 2, H / 2])._round();
  } else {
    const size = map.getSize();              // CSS px
    W = size.x; H = size.y;
    z = map.getZoom();
    origin = map.getPixelBounds().min;       // world-px coord of top-left corner
    dpr = 2;
  }

  const cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0e0e0e'; // dark basemap tone — only shows if a tile is missing
  ctx.fillRect(0, 0, W, H);

  // ── basemap tiles (CARTO supports CORS, so crossOrigin keeps the canvas
  // untainted and exportable; @2x tiles match the dpr=2 device resolution) ──
  const subs = ['a', 'b', 'c', 'd'];
  const max = Math.pow(2, z);
  const x0 = Math.floor(origin.x / ts), x1 = Math.floor((origin.x + W) / ts);
  const y0 = Math.floor(origin.y / ts), y1 = Math.floor((origin.y + H) / ts);
  const loads = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= max) continue;
      const tx = ((x % max) + max) % max;
      const url = `https://${subs[((x % 4) + 4) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${tx}/${y}@2x.png`;
      const dx = x * ts - origin.x, dy = y * ts - origin.y;
      loads.push(new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { try { ctx.drawImage(img, dx, dy, ts, ts); } catch {} res(); };
        img.onerror = () => res();
        img.src = url;
      }));
    }
  }
  await Promise.all(loads);

  // project a latlng to container px the same way Leaflet does, so vectors
  // line up exactly with the tiles
  const toPx = ll => map.project(ll, z).subtract(origin);

  // ── route polylines ──
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  map.eachLayer(layer => {
    if (!(layer instanceof L.Polyline) || !layer.getLatLngs) return;
    const o = layer.options;
    ctx.strokeStyle = o.color || '#FC4C02';
    ctx.globalAlpha = o.opacity != null ? o.opacity : 1;
    ctx.lineWidth = o.weight || 2;
    const drawRing = lls => {
      ctx.beginPath();
      lls.forEach((ll, i) => { const p = toPx(ll); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.stroke();
    };
    const rings = layer.getLatLngs();
    Array.isArray(rings[0]) ? rings.forEach(drawRing) : drawRing(rings);
  });

  // ── circle markers (segment start/end dots) — drawn on top of the route ──
  map.eachLayer(layer => {
    if (!(layer instanceof L.CircleMarker) || layer instanceof L.Circle) return;
    const o = layer.options;
    const p = toPx(layer.getLatLng());
    ctx.beginPath();
    ctx.arc(p.x, p.y, o.radius || 4, 0, Math.PI * 2);
    ctx.globalAlpha = o.fillOpacity != null ? o.fillOpacity : 1;
    ctx.fillStyle = o.fillColor || o.color || '#FC4C02';
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  return cv;
}

// Before html2canvas captures a section, replace every live Leaflet map in it
// with a static, correctly-projected canvas snapshot (html2canvas mangles
// Leaflet's transform-positioned panes). Returns a restore() to undo it.
async function _freezeMapsIn(section) {
  const candidates = [];
  if (typeof leafletMapInst !== 'undefined' && leafletMapInst) candidates.push(leafletMapInst);
  if (typeof segMaps !== 'undefined' && Array.isArray(segMaps)) segMaps.forEach(s => s && s.m && candidates.push(s.m));

  const restores = [];
  for (const map of candidates) {
    let el; try { el = map.getContainer(); } catch { continue; }
    if (!el || !section.contains(el) || !el.offsetParent) continue; // skip hidden / out-of-section maps
    let cv; try { cv = await _mapToCanvas(map); } catch { continue; }
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1000;';
    const pane = el.querySelector('.leaflet-map-pane');
    const ctrl = el.querySelector('.leaflet-control-container');
    const pv = pane && pane.style.visibility, cvv = ctrl && ctrl.style.visibility;
    if (pane) pane.style.visibility = 'hidden';
    if (ctrl) ctrl.style.visibility = 'hidden';
    el.appendChild(cv);
    restores.push(() => { cv.remove(); if (pane) pane.style.visibility = pv || ''; if (ctrl) ctrl.style.visibility = cvv || ''; });
  }
  return () => restores.forEach(r => { try { r(); } catch {} });
}

async function _doSaveImg() {
  const section = _currentSectionEl();
  if (!section) return;

  // The heatmap is a single full-bleed map: render it directly so html2canvas's
  // simulated-viewport relayout can't stretch it (which would visibly drift the
  // basemap from the routes). Other sections keep the html2canvas path.
  const isHeatmap = section.id === 'heatSection' && typeof leafletMapInst !== 'undefined' && leafletMapInst;
  if (!isHeatmap && typeof html2canvas === 'undefined') return;

  const go = document.getElementById('saveImgGo');
  const prev = go.textContent;
  go.textContent = 'Rendering…';
  go.disabled = true;

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#090909';
  const [W, H] = _SAVE_IMG_DIMS[_saveImgOrient][_saveImgRes];

  // Render at a wide simulated viewport so responsive grids lay out in full
  // (multiple columns) rather than the phone's 1–2 column stack — this fills
  // the frame instead of producing a tall, narrow strip on mobile.
  const winW = _saveImgOrient === 'desktop' ? 1400 : 900;

  let restoreMaps = null;
  try {
    let shot;
    if (isHeatmap) {
      shot = await _mapToCanvas(leafletMapInst, W, H);
    } else {
      // Leaflet maps in the section (e.g. segment thumbnails) are rasterised
      // separately — html2canvas can't read their transform-positioned tiles.
      restoreMaps = await _freezeMapsIn(section);
      shot = await html2canvas(section, {
        backgroundColor: bg,
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: winW,
      });
    }

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';

    if (isHeatmap) {
      // the map was rendered at the frame's exact aspect → fill edge to edge
      ctx.drawImage(shot, 0, 0, W, H);
    } else {
      // contain-fit the capture into the frame with a small margin
      const pad = Math.round(Math.min(W, H) * 0.04);
      const availW = W - pad * 2, availH = H - pad * 2;
      const scale = Math.min(availW / shot.width, availH / shot.height);
      const dw = shot.width * scale, dh = shot.height * scale;
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      ctx.drawImage(shot, dx, dy, dw, dh);
    }

    const a = document.createElement('a');
    a.download = `ascent-${_currentSectionName()}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
    _closeSaveImg();
  } catch (e) {
    console.error('Save image failed', e);
    setStatus('Could not render image — try again.', '');
  } finally {
    if (restoreMaps) restoreMaps();
    go.textContent = prev;
    go.disabled = false;
  }
}

/* wire up controls */
document.getElementById('saveImgBtn').addEventListener('click', _openSaveImg);
document.getElementById('saveImgClose').addEventListener('click', _closeSaveImg);
document.getElementById('saveImgCancel').addEventListener('click', _closeSaveImg);
document.getElementById('saveImgModal').addEventListener('click', e => { if (e.target === e.currentTarget) _closeSaveImg(); });
document.getElementById('saveImgGo').addEventListener('click', _doSaveImg);

document.getElementById('saveImgOrient').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  _saveImgOrient = b.dataset.orient;
  [...e.currentTarget.children].forEach(c => c.classList.toggle('active', c === b));
});
document.getElementById('saveImgRes').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  _saveImgRes = b.dataset.res;
  [...e.currentTarget.children].forEach(c => c.classList.toggle('active', c === b));
});

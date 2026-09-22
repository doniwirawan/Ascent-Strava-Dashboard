/* ── SEGMENT GAPS ─────────────────────────────────────────────────────────────
   Stretches of road you ride regularly that none of your known segments covers
   — the places a new "A -> B" is worth drawing.

   Everything here is computed from data already in the browser: the simplified
   ride polylines on `acts` and the segment geometry `_allSegs` already carries
   (or that can be carved out of the parent ride). No Strava calls are made, so
   opening this section never costs rate limit.

   Strava has no segment-creation endpoint, so the payoff is a precise brief —
   start/end coordinates and how far into which ride they fall — that you take
   to Strava's own "Create Segment" screen. */

const _GAP_CELL_M    = 25;    // coverage grid resolution
const _GAP_DILATE    = 2;     // ±cells of slack: GPS noise + polyline simplification
const _GAP_MIN_M     = 500;   // shorter than this isn't worth a segment
const _GAP_MAX_M     = 5000;  // longer than this is a route, not a segment
const _GAP_MIN_RIDES = 3;     // must be road you actually use, not a one-off
const _GAP_JOIN_M    = 500;  // how close a named segment endpoint must be to name a gap

let _gapCache = null;   // {sig, gaps} — recomputed only when the inputs change
let _gapMaps  = [];     // Leaflet instances, for invalidateSize on show

/* ── grid helpers ──
   Cells are metre-ish squares. Longitude degrees shrink with latitude, so the
   scale is fixed from a reference latitude rather than recomputed per point —
   otherwise cells drift and paths stop lining up. */
function _gapGrid(refLat) {
  const dLat = _GAP_CELL_M / 111320;
  const dLng = _GAP_CELL_M / (111320 * Math.cos(refLat * Math.PI / 180) || 1);
  return { dLat, dLng };
}
const _gapKey = (lat, lng, g) => Math.round(lat / g.dLat) + ':' + Math.round(lng / g.dLng);

function _gapHav(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dy = (b[0] - a[0]) * rad, dx = (b[1] - a[1]) * rad;
  const m = Math.cos((a[0] + b[0]) / 2 * rad);
  return Math.sqrt(dy * dy + dx * dx * m * m) * R;
}

/* Walk a path and mark every cell it touches, plus a halo of ±_GAP_DILATE.
   Points are interpolated to ~half a cell so sparse polylines don't leave
   holes that would read as gaps. */
function _gapMarkPath(set, pts, g) {
  const step = _GAP_CELL_M / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = _gapHav(a, b);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n, lat = a[0] + (b[0] - a[0]) * t, lng = a[1] + (b[1] - a[1]) * t;
      const gy = Math.round(lat / g.dLat), gx = Math.round(lng / g.dLng);
      for (let dy = -_GAP_DILATE; dy <= _GAP_DILATE; dy++)
        for (let dx = -_GAP_DILATE; dx <= _GAP_DILATE; dx++)
          set.add((gy + dy) + ':' + (gx + dx));
    }
  }
}

/* Segment geometry without touching the network: whatever the object carries,
   else carved out of the ride it was set on, else a straight start→finish line.
   (_segCoords in render-sections.js is the same idea but may hit the API.) */
function _gapSegCoords(s) {
  const own = s.map && (s.map.polyline || s.map.summary_polyline);
  if (own) { try { const c = decodePolyline(own); if (c.length > 1) return c; } catch {} }
  if (typeof _segPolyCache !== 'undefined' && _segPolyCache && _segPolyCache[s.id]) {
    try { const c = decodePolyline(_segPolyCache[s.id]); if (c.length > 1) return c; } catch {}
  }
  if (s._srcAct && s.start_latlng && s.end_latlng && typeof _sliceRouteFromActivity === 'function') {
    const sl = _sliceRouteFromActivity(s._srcAct, s.start_latlng, s.end_latlng);
    if (sl && sl.length > 1) return sl;
  }
  if (s.start_latlng && s.end_latlng) return [s.start_latlng, s.end_latlng];
  return [];
}

/* A segment named "P -> Q" starts at P and ends at Q. That's the whole naming
   convention, so a gap sitting between two segments can propose its own name. */
function _gapSplitName(name) {
  const m = (name || '').split(/\s*(?:→|->|⇒|=>)\s*/);
  return m.length === 2 ? { from: m[0].trim(), to: m[1].trim() } : null;
}

/* The nearest named place to a point: whichever endpoint of whichever "P -> Q"
   segment lies closest. A segment's start is P and its end is Q, so either end
   yields a place name — matching only end→start would name far fewer gaps. */
function _gapNearestPlace(ll, segs) {
  let best = null, bd = _GAP_JOIN_M;
  for (const s of segs) {
    const parts = _gapSplitName(s.name);
    if (!parts) continue;
    if (s.start_latlng) { const d = _gapHav(s.start_latlng, ll); if (d < bd) { bd = d; best = { place: parts.from, seg: s.name }; } }
    if (s.end_latlng) { const d = _gapHav(s.end_latlng, ll); if (d < bd) { bd = d; best = { place: parts.to, seg: s.name }; } }
  }
  return best;
}

function _gapSuggestName(gap, segs) {
  const a = _gapNearestPlace(gap.start, segs);
  const b = _gapNearestPlace(gap.end, segs);
  const before = a ? a.seg : null, after = b ? b.seg : null;
  if (a && b && a.place !== b.place) return { name: a.place + ' -> ' + b.place, before, after };
  if (a && b) return { name: a.place + ' loop', before, after };
  if (a) return { name: a.place + ' -> ?', before, after };
  if (b) return { name: '? -> ' + b.place, before, after };
  return { name: null, before, after };
}

/* ── the scan ──
   For each ride, walk its track and collect maximal runs of points that fall
   outside every segment's coverage. Runs from different rides along the same
   road are then merged, and the ride count is what makes a gap worth acting on. */
function computeSegmentGaps() {
  const segs = (typeof _allSegs !== 'undefined' && _allSegs) || [];
  const rides = (typeof acts !== 'undefined' ? acts : []).filter(a => a && a.map && a.map.summary_polyline);
  if (!rides.length) return [];

  let ref = 0, n = 0;
  for (const a of rides) { if (a.start_latlng && a.start_latlng.length) { ref += a.start_latlng[0]; n++; } }
  const g = _gapGrid(n ? ref / n : 0);

  const covered = new Set();
  for (const s of segs) {
    const c = _gapSegCoords(s);
    if (c.length > 1) _gapMarkPath(covered, c, g);
  }

  // raw uncovered runs, one pass per ride
  const runs = [];
  for (const a of rides) {
    let pts; try { pts = decodePolyline(a.map.summary_polyline); } catch { continue; }
    if (pts.length < 2) continue;

    // cumulative distance along the simplified track, rescaled to the ride's
    // real distance so "x km into the ride" matches Strava's own slider
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + _gapHav(pts[i - 1], pts[i]);
    const polyLen = cum[cum.length - 1] || 1;
    const scale = a.distance ? a.distance / polyLen : 1;

    let start = -1;
    for (let i = 0; i <= pts.length; i++) {
      const inGap = i < pts.length && !covered.has(_gapKey(pts[i][0], pts[i][1], g));
      if (inGap && start < 0) start = i;
      if (!inGap && start >= 0) {
        const slice = pts.slice(start, i);
        const len = cum[i - 1] - cum[start];
        if (slice.length > 1 && len >= _GAP_MIN_M && len <= _GAP_MAX_M) {
          runs.push({
            actId: a.id, actName: a.name, pts: slice, len,
            start: slice[0], end: slice[slice.length - 1],
            atStart: cum[start] * scale, atEnd: cum[i - 1] * scale,
            cells: new Set(slice.map(p => _gapKey(p[0], p[1], g)))
          });
        }
        start = -1;
      }
    }
  }

  // merge runs that trace the same road (majority of cells shared)
  const groups = [];
  for (const r of runs) {
    let hit = null;
    for (const grp of groups) {
      let shared = 0;
      for (const c of r.cells) if (grp.cells.has(c)) shared++;
      if (shared / Math.min(r.cells.size, grp.cells.size) > 0.5) { hit = grp; break; }
    }
    if (hit) {
      hit.runs.push(r);
      for (const c of r.cells) hit.cells.add(c);
      if (r.len > hit.best.len) hit.best = r;
    } else {
      groups.push({ runs: [r], cells: new Set(r.cells), best: r });
    }
  }

  const gaps = groups.map(grp => {
    const b = grp.best;
    const ridesN = new Set(grp.runs.map(r => r.actId)).size;
    const gap = {
      pts: b.pts, len: b.len, start: b.start, end: b.end,
      actId: b.actId, actName: b.actName, atStart: b.atStart, atEnd: b.atEnd,
      rides: ridesN, score: ridesN * (b.len / 1000)
    };
    Object.assign(gap, _gapSuggestName(gap, segs));
    return gap;
  }).filter(x => x.rides >= _GAP_MIN_RIDES);

  gaps.sort((a, b) => b.score - a.score);
  return gaps;
}

/* ── render ── */
function _gapSig() {
  const segs = (typeof _allSegs !== 'undefined' && _allSegs) || [];
  const rides = (typeof acts !== 'undefined' ? acts : []);
  return rides.length + ':' + segs.length + ':' + ((rides[0] && rides[0].id) || 0);
}

function renderGaps(force) {
  const el = document.getElementById('gapsGrid');
  if (!el) return;
  const note = m => { el.innerHTML = '<p style="color:var(--muted);padding:8px">' + m + '</p>'; };

  if (typeof acts === 'undefined' || !acts || !acts.length) { note('Load your activities first.'); return; }
  const segs = (typeof _allSegs !== 'undefined' && _allSegs) || [];
  if (!segs.length) { note('Open the Segments section once so your segments are loaded, then come back.'); return; }

  const sig = _gapSig();
  if (force || !_gapCache || _gapCache.sig !== sig) {
    note('Comparing your rides against your segments…');
    // let the note paint before the scan blocks the thread
    setTimeout(() => {
      let gaps = [];
      try { gaps = computeSegmentGaps(); }
      catch (e) { console.error('gap scan failed:', e); note('Gap scan failed (' + e.message + ').'); return; }
      _gapCache = { sig, gaps };
      _gapPaint(el, gaps);
    }, 30);
    return;
  }
  _gapPaint(el, _gapCache.gaps);
}

function _gapPaint(el, gaps) {
  if (!gaps.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:8px">No gaps found — every stretch you ride at least '
      + _GAP_MIN_RIDES + ' times is already covered by a segment. Scan more rides in the Segments section to widen the search.</p>';
    return;
  }

  const c5 = ll => ll[0].toFixed(5) + ', ' + ll[1].toFixed(5);
  const head = `<div class="gap-head">
    <span class="gap-head-n">${gaps.length} gap${gaps.length > 1 ? 's' : ''}</span>
    <span class="gap-head-sub">road you've ridden ${_GAP_MIN_RIDES}+ times with no segment on it · ranked by rides × length</span>
    <button class="seg-scan" id="gapRescan">${ic('repeat')} Rescan</button>
  </div>`;

  el.innerHTML = head + '<div class="gap-grid">' + gaps.map((x, i) => {
    const gm = 'https://www.google.com/maps/dir/' + x.start[0].toFixed(5) + ',' + x.start[1].toFixed(5)
             + '/' + x.end[0].toFixed(5) + ',' + x.end[1].toFixed(5);
    return `<article class="gap-card">
      <div class="gap-map" id="gapmap-${i}"></div>
      <div class="gap-body">
        <div class="gap-name">${x.name ? x.name : 'Unnamed stretch'}</div>
        ${x.before || x.after ? `<div class="gap-between">between ${x.before ? '<b>' + x.before + '</b>' : '—'} and ${x.after ? '<b>' + x.after + '</b>' : '—'}</div>` : ''}
        <div class="gap-metrics">
          <div class="gap-m"><span class="gap-m-lbl">Length</span><span class="gap-m-val">${kmVal(x.len).toFixed(2)} ${distUnit()}</span></div>
          <div class="gap-m"><span class="gap-m-lbl">Ridden</span><span class="gap-m-val">${x.rides}×</span></div>
        </div>
        <div class="gap-coords">
          <div class="gap-co"><span class="gap-co-lbl">Start</span><code>${c5(x.start)}</code>
            <button class="gap-copy" onclick="gapCopy('${c5(x.start)}',this)" title="Copy">copy</button></div>
          <div class="gap-co"><span class="gap-co-lbl">End</span><code>${c5(x.end)}</code>
            <button class="gap-copy" onclick="gapCopy('${c5(x.end)}',this)" title="Copy">copy</button></div>
        </div>
        <div class="gap-create">
          Create it from <a href="https://www.strava.com/activities/${x.actId}" target="_blank" rel="noopener">${x.actName || 'this ride'}</a>
          — drag the slider from <b>${kmVal(x.atStart).toFixed(2)}</b> to <b>${kmVal(x.atEnd).toFixed(2)} ${distUnit()}</b> into the ride.
        </div>
        <div class="gap-links">
          <a class="seg-link" href="https://www.strava.com/activities/${x.actId}" target="_blank" rel="noopener">Open ride →</a>
          <a class="seg-link" href="${gm}" target="_blank" rel="noopener">Google Maps →</a>
        </div>
      </div>
    </article>`;
  }).join('') + '</div>';

  const re = document.getElementById('gapRescan');
  if (re) re.onclick = () => { _gapCache = null; renderGaps(true); };

  _gapMaps = [];
  if (!window.L) return;
  gaps.forEach((x, i) => {
    const t = document.getElementById('gapmap-' + i);
    if (!t) return;
    try {
      const m = L.map(t, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
      addBasemap(m);
      const line = L.polyline(x.pts, { color: '#FC4C02', weight: 5, opacity: .95 }).addTo(m);
      L.circleMarker(x.pts[0], { radius: 5, color: '#4ade80', fillColor: '#4ade80', fillOpacity: 1, weight: 0 }).addTo(m);
      L.circleMarker(x.pts[x.pts.length - 1], { radius: 5, color: '#FC4C02', fillColor: '#FC4C02', fillOpacity: 1, weight: 0 }).addTo(m);
      m.fitBounds(line.getBounds(), { padding: [16, 16] });
      _gapMaps.push({ m, line });
      // built inside a hidden section → size is 0×0 until it's shown
      setTimeout(() => { try { m.invalidateSize(); m.fitBounds(line.getBounds(), { padding: [16, 16] }); } catch {} }, 300);
    } catch {}
  });
}

function gapCopy(txt, btn) {
  try {
    navigator.clipboard.writeText(txt);
    const old = btn.textContent;
    btn.textContent = 'copied';
    setTimeout(() => { btn.textContent = old; }, 1200);
  } catch {}
}

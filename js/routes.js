/* ── ROUTE BUILDER ───────────────────────────────────────────────────────────
   Generates a brand-new road loop of your chosen distance via OpenRouteService
   (round-trip routing), proxied through /api/route so the ORS key stays server
   side. You pick sport, start area, elevation preference and distance tolerance;
   a few candidate loops are generated (in parallel) and the best match is drawn.
   An optional AI pass (reuses the AI Coach provider) names & describes it, and
   the loop downloads as a GPX. Last-used inputs and every generated route are
   remembered in localStorage. */

let _rbRoute = null;   // { coordinates:[[lng,lat,ele]], distance, ascent, descent, name }
let _rbMap = null, _rbLine = null;

const rbEsc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const _rbVal = id => (document.getElementById(id) || {}).value;
function _rbSetVal(id, v) {
  if (v == null) return;
  const el = document.getElementById(id); if (!el) return;
  if (el.tagName === 'SELECT') { if ([...el.options].some(o => o.value === String(v))) el.value = v; }
  else el.value = v;
}

function openRouteModal() {
  const m = document.getElementById('routeModal');
  if (!m) return;
  rbBuildStartOptions();
  rbRestorePrefs();
  _rbSetVal('rb-start', RB_HOME); // always start & finish at Home (never a stale GPS pick)
  // Save selections whenever they change (reassign, never stack listeners).
  ['rb-dist', 'rb-sport', 'rb-start', 'rb-elev', 'rb-tol'].forEach(id => {
    const el = document.getElementById(id); if (el) el.onchange = rbSavePrefs;
  });
  rbRenderHistory();
  m.classList.add('open');
  try { localStorage.setItem('route_modal_open', '1'); } catch {} // remember it was open
  rbInitMap(); // show the map (centred on Home) right away — before any route is generated
}

/* Create the map centred on Home so it's visible the moment the modal opens.
   Safe to call repeatedly; only builds the map once. */
function rbInitMap() {
  const el = document.getElementById('rb-map');
  if (!el || !window.L) return;
  const [hlat, hlng] = RB_HOME.split(',').map(Number);
  if (!_rbMap) {
    _rbMap = L.map(el, { zoomControl: true, scrollWheelZoom: true, attributionControl: false }).setView([hlat, hlng], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(_rbMap);
    L.circleMarker([hlat, hlng], { radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1, weight: 0 }).addTo(_rbMap);
  }
  // Map containers measure 0×0 while hidden — fix once visible.
  setTimeout(() => { try { _rbMap.invalidateSize(); if (_rbLine) _rbMap.fitBounds(_rbLine.getBounds(), { padding: [24, 24] }); } catch {} }, 200);
}
function closeRouteModal() {
  const m = document.getElementById('routeModal');
  if (m) m.classList.remove('open');
  try { localStorage.setItem('route_modal_open', '0'); } catch {}
}

/* Default start/end (Bali home) — appears first and is selected by default. */
const RB_HOME = '-8.606198,115.283307';
/* Sport labels + the short word used in auto-generated names. */
const RB_SPORTS = { road: 'Road ride', gravel: 'Gravel ride', ride: 'Ride', run: 'Run' };
const RB_SPORT_WORD = { road: 'road', gravel: 'gravel', ride: 'ride', run: 'run' };
const rbSportLabel = s => RB_SPORTS[s] || 'Ride';

/* Build the "start area" dropdown from the start points of recent activities,
   de-duplicated by rough location, plus a live-GPS option. */
function rbBuildStartOptions() {
  const sel = document.getElementById('rb-start');
  if (!sel || sel.dataset.built) return;
  let html = '<option value="' + RB_HOME + '">🏠 Home (start &amp; finish)</option>'
           + '<option value="geo">📍 My current location (GPS)</option>';
  const seen = new Set();
  for (const a of (typeof acts !== 'undefined' ? acts : [])) {
    const ll = a.start_latlng;
    if (!ll || ll.length !== 2) continue;
    const key = ll[0].toFixed(2) + ',' + ll[1].toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);
    const where = a.location_city || a.name || 'Activity start';
    html += `<option value="${ll[0]},${ll[1]}">${rbEsc(where)}</option>`;
    if (seen.size >= 15) break;
  }
  sel.innerHTML = html;
  sel.dataset.built = '1';
}

/* ── Remember last-used inputs ── */
function rbSavePrefs() {
  try {
    localStorage.setItem('route_prefs', JSON.stringify({
      dist: _rbVal('rb-dist'), sport: _rbVal('rb-sport'), start: _rbVal('rb-start'),
      elev: _rbVal('rb-elev'), tol: _rbVal('rb-tol'),
    }));
  } catch {}
}
function rbRestorePrefs() {
  let p; try { p = JSON.parse(localStorage.getItem('route_prefs') || '{}'); } catch { p = {}; }
  _rbSetVal('rb-dist', p.dist); _rbSetVal('rb-sport', p.sport); _rbSetVal('rb-start', p.start);
  _rbSetVal('rb-elev', p.elev); _rbSetVal('rb-tol', p.tol);
}

/* ── Remember generated routes (history) ── */
function rbLoadHistory() {
  try { const a = JSON.parse(localStorage.getItem('route_history') || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function rbSaveHistory(list) {
  // Keep every loved route; cap the rest (newest first). On quota errors, drop
  // the oldest NON-loved entry first so favourites are never lost.
  const cap = 30;
  const favCount = list.filter(r => r.fav).length;
  let kept = 0;
  let arr = list.filter(r => r.fav || (++kept <= cap - favCount));
  while (arr.length) {
    try { localStorage.setItem('route_history', JSON.stringify(arr)); return; }
    catch {
      let idx = -1;
      for (let i = arr.length - 1; i >= 0; i--) { if (!arr[i].fav) { idx = i; break; } }
      arr.splice(idx === -1 ? arr.length - 1 : idx, 1);
    }
  }
  try { localStorage.removeItem('route_history'); } catch {}
}
function rbPushHistory(route) {
  const list = rbLoadHistory();
  const id = Date.now();
  list.unshift({
    id, ts: id, name: route.name || 'Route', sport: route.sport, target: route.target,
    distance: route.distance, ascent: route.ascent || 0, descent: route.descent || 0,
    coordinates: route.coordinates,
  });
  rbSaveHistory(list);
  rbRenderHistory();
  return id;
}
function rbUpdateHistoryName(id, name) {
  const list = rbLoadHistory();
  const e = list.find(r => r.id === id);
  if (e) { e.name = name; rbSaveHistory(list); rbRenderHistory(); }
}
function rbDeleteHistory(id) {
  rbSaveHistory(rbLoadHistory().filter(r => r.id !== id));
  rbRenderHistory();
}
function rbToggleFav(id) {
  const list = rbLoadHistory();
  const e = list.find(r => r.id === id);
  if (e) { e.fav = !e.fav; rbSaveHistory(list); rbRenderHistory(); }
}
function rbClearHistory() {
  if (!confirm('Clear generation history? Loved routes (♥) are kept.')) return;
  rbSaveHistory(rbLoadHistory().filter(r => r.fav)); // keep only loved routes
  rbRenderHistory();
}
function rbRenderHistory() {
  const el = document.getElementById('rb-history');
  if (!el) return;
  let list = rbLoadHistory();
  if (!list.length) { el.innerHTML = ''; return; }
  list = [...list].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0)); // loved routes first
  el.innerHTML =
    `<div class="rb-hist-head"><span>Generation history (${list.length})</span><button class="rb-hist-clear" onclick="rbClearHistory()">Clear history</button></div>` +
    list.map(r => `<div class="rb-hist-item">
      <button class="rb-hist-main" onclick="rbLoadFromHistory(${r.id})" title="Load on map">
        <span class="rb-hist-name">${rbEsc(r.name)}</span>
        <span class="rb-hist-meta">${rbSportLabel(r.sport)} · ${fmtKm(r.distance)} ${distUnit()} · ${Math.round(elevVal(r.ascent || 0)).toLocaleString()} ${elevUnit()} · ${fmtDt(r.ts)}</span>
      </button>
      <button class="rb-hist-fav${r.fav ? ' on' : ''}" onclick="rbToggleFav(${r.id})" title="${r.fav ? 'Loved — click to remove' : 'Love this route (keeps it when clearing)'}" aria-label="Love">${r.fav ? '♥' : '♡'}</button>
      <button class="rb-hist-del" onclick="rbDeleteHistory(${r.id})" title="Delete" aria-label="Delete">✕</button>
    </div>`).join('');
}
function rbLoadFromHistory(id) {
  const r = rbLoadHistory().find(x => x.id === id);
  if (!r) return;
  _rbRoute = { coordinates: r.coordinates, distance: r.distance, ascent: r.ascent, descent: r.descent, name: r.name, sport: r.sport, target: r.target, histId: r.id };
  rbDrawRoute(_rbRoute);
  rbShowStats(_rbRoute);
  document.getElementById('rb-ai').innerHTML = `<div class="rb-ai-name">${rbEsc(r.name)}</div>`;
  document.getElementById('rb-download').disabled = false;
  rbStatus('Loaded a saved route — download the GPX, or generate a new one.', 'ok');
}

function rbStatus(msg, cls) {
  const el = document.getElementById('rb-status');
  if (!el) return;
  el.className = 'rb-status' + (cls ? ' ' + cls : '');
  el.innerHTML = msg || '';
}

/* Resolve the chosen start to {lat,lng}. Uses geolocation for the GPS option. */
function rbResolveStart() {
  const v = _rbVal('rb-start') || 'geo';
  if (v !== 'geo') {
    const [lat, lng] = v.split(',').map(Number);
    return Promise.resolve({ lat, lng });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not available — pick a start from the list instead.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Could not get your location — allow location access or pick a start from the list.')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function rbToken() {
  try { if (isTokenExpired()) await doRefresh(); } catch {}
  return localStorage.getItem('strava_access_token');
}

/* One candidate request, with a hard timeout so it can never hang the UI. */
async function rbFetchRoute(body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 35000);
  try {
    const r = await fetch('/api/route', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data };
  } finally { clearTimeout(t); }
}

/* "Loopiness": enclosed area ÷ perimeter² on the route polygon. A real circuit
   encloses a lot of area (≈0.08 for a perfect circle); an out-and-back / U-turn
   "bolak-balik" route retraces itself and encloses ≈0. Used to reject the weird
   back-and-forth routes. Planar (degrees) — fine for ranking small loops. */
function rbLoopiness(coords) {
  if (!coords || coords.length < 4) return 0;
  let area = 0, per = 0;
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i], b = coords[(i + 1) % coords.length];
    area += a[0] * b[1] - b[0] * a[1];
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return per > 0 ? Math.abs(area) / 2 / (per * per) : 0;
}

/* Let the AI Coach provider (DeepSeek by default) pick the best finalist.
   Returns an index, or -1 if AI isn't available / fails (caller falls back). */
async function rbAIPickIndex(cands, opts) {
  const pm = (typeof aiProviderModel === 'function') ? aiProviderModel() : null;
  if (!pm || cands.length < 2) return -1;
  const lines = cands.map((c, i) =>
    `${i}: ${(c.distance / 1000).toFixed(1)}km, climb ${Math.round(c.ascent || 0)}m, loopScore ${(c.loop * 1000).toFixed(1)}`
  ).join('\n');
  const prompt =
    `You pick the best ${rbSportLabel(opts.sport)} loop for a rider. Target ≈${opts.dist} km, ` +
    `elevation preference: ${opts.elev}. STRONGLY prefer a sensible round circuit — high loopScore ` +
    `(higher = rounder; low = back-and-forth/out-and-back, which is bad) — that is close to the target ` +
    `distance and matches the elevation preference. Candidates:\n${lines}\n` +
    `Reply with ONLY the index number of your pick.`;
  try {
    const token = await rbToken();
    const r = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, provider: pm.provider, model: pm.model, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.text) return -1;
    const m = d.text.match(/\d+/);
    const idx = m ? parseInt(m[0], 10) : -1;
    return (idx >= 0 && idx < cands.length) ? idx : -1;
  } catch { return -1; }
}

async function routeGenerate() {
  const btn = document.getElementById('rb-generate');
  const dist = Math.max(2, Math.min(200, parseFloat(_rbVal('rb-dist')) || 0));
  const sport = _rbVal('rb-sport') || 'ride';
  const elev = _rbVal('rb-elev') || 'any';
  const tol = (parseInt(_rbVal('rb-tol'), 10) || 15) / 100;
  if (!dist) { rbStatus('Enter a distance first.', 'err'); return; }
  rbSavePrefs();

  btn.disabled = true;
  document.getElementById('rb-download').disabled = true;
  _rbRoute = null;
  rbStatus('<span class="rb-spin"></span> Finding your start…');

  let start;
  try { start = await rbResolveStart(); }
  catch (e) { rbStatus(e.message, 'err'); btn.disabled = false; return; }

  const token = await rbToken();
  const targetM = dist * 1000;

  rbStatus('<span class="rb-spin"></span> Generating candidate loops…');
  // Fire candidates in PARALLEL. points:4 makes rounder circuits (fewer
  // back-and-forth/out-and-back loops than 3); two length scales bracket ORS's
  // overshoot so some land near the target. Several seeds give variety.
  const combos = [];
  for (const sc of [0.8, 1.0]) for (const seed of [7, 23, 42]) {
    combos.push({ length: Math.round(targetM * sc), points: 4, seed });
  }
  const results = await Promise.allSettled(combos.map(c =>
    rbFetchRoute({ token, sport, lat: start.lat, lng: start.lng, length: c.length, points: c.points, seed: c.seed })
  ));

  const cands = [];
  let lastErr = null;
  for (const res of results) {
    if (res.status !== 'fulfilled') continue; // aborted/network — ignore
    const { ok, data } = res.value;
    if (ok && data.coordinates && data.coordinates.length > 1) { data.loop = rbLoopiness(data.coordinates); cands.push(data); }
    else if (!ok) lastErr = data;
  }
  if (!cands.length) {
    rbStatus(lastErr ? rbErr(lastErr) : 'No route could be generated from that point. Try another start or distance.', 'err');
    btn.disabled = false; return;
  }

  // Candidates close enough to the target distance (fall back to the 3 closest).
  const within = cands.filter(c => Math.abs(c.distance - targetM) / targetM <= tol);
  const pool = within.length ? within
    : [...cands].sort((a, b) => Math.abs(a.distance - targetM) - Math.abs(b.distance - targetM)).slice(0, 3);
  // Sensible loops first (reject bolak-balik), keep the top few as finalists.
  const finalists = [...pool].sort((a, b) => b.loop - a.loop).slice(0, 4);
  // Heuristic default per elevation preference (used if AI can't pick).
  let hi = 0;
  if (elev === 'flat')       hi = finalists.reduce((bi, c, i, a) => c.ascent < a[bi].ascent ? i : bi, 0);
  else if (elev === 'hilly') hi = finalists.reduce((bi, c, i, a) => c.ascent > a[bi].ascent ? i : bi, 0);

  rbStatus('<span class="rb-spin"></span> Choosing the best loop…');
  let idx = await rbAIPickIndex(finalists, { dist, sport, elev });
  if (idx < 0) idx = hi;
  const pick = finalists[idx];

  pick.sport = sport;
  pick.target = targetM;
  pick.name = `${Math.round(dist)} ${distUnit()} ${RB_SPORT_WORD[sport] || 'ride'} loop`; // until AI renames
  _rbRoute = pick;
  rbDrawRoute(pick);
  rbShowStats(pick);
  pick.histId = rbPushHistory(pick);           // remember it now (AI may rename it shortly)
  rbStatus(within.length ? 'Route ready — download the GPX or generate again for a different loop.'
                         : 'Closest match shown (none hit your tolerance) — try a wider tolerance or different start.', within.length ? 'ok' : '');
  document.getElementById('rb-download').disabled = false;
  btn.disabled = false;

  // Optional AI naming/description — only if a provider is configured.
  rbNameRoute(pick, { dist, sport, elev });
}

function rbDrawRoute(route) {
  const el = document.getElementById('rb-map');
  if (!el || !window.L) return;
  const latlngs = route.coordinates.map(c => [c[1], c[0]]);
  if (!_rbMap) {
    _rbMap = L.map(el, { zoomControl: true, scrollWheelZoom: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(_rbMap);
  }
  if (_rbLine) { try { _rbMap.removeLayer(_rbLine); } catch {} }
  // Group the route line + start marker so they draw, fit and clear together.
  _rbLine = L.featureGroup([
    L.polyline(latlngs, { color: '#FC4C02', weight: 4, opacity: .95 }),
    L.circleMarker(latlngs[0], { radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1, weight: 0 }),
  ]).addTo(_rbMap);
  setTimeout(() => { try { _rbMap.invalidateSize(); _rbMap.fitBounds(_rbLine.getBounds(), { padding: [24, 24] }); } catch {} }, 120);
}

function rbShowStats(route) {
  const asc = Math.round(elevVal(route.ascent || 0));
  document.getElementById('rb-stats').innerHTML = `
    <div class="rb-stat"><div class="rb-stat-v">${fmtKm(route.distance)}</div><div class="rb-stat-l">${distUnit()}</div></div>
    <div class="rb-stat"><div class="rb-stat-v">${asc.toLocaleString()}</div><div class="rb-stat-l">${elevUnit()} climb</div></div>
    <div class="rb-stat"><div class="rb-stat-v">${route.coordinates.length}</div><div class="rb-stat-l">points</div></div>`;
}

/* Ask the AI Coach provider for a name + one-line description (best-effort). */
async function rbNameRoute(route, opts) {
  const aiBox = document.getElementById('rb-ai');
  if (!aiBox) return;
  aiBox.innerHTML = '';
  // Reuse the AI Coach provider/model if that helper is loaded.
  const pm = (typeof aiProviderModel === 'function') ? aiProviderModel() : null;
  if (!pm) return;

  const place = document.getElementById('rb-start')?.selectedOptions?.[0]?.textContent || 'the start';
  const ascDisp = Math.round(elevVal(route.ascent || 0)) + ' ' + elevUnit();
  const prompt = `Name a ${rbSportLabel(opts.sport)} route loop and describe it in one short sentence. ` +
    `It is ${fmtKm(route.distance)} ${distUnit()} long with ${ascDisp} of climbing, starting near "${place}". ` +
    `Elevation preference: ${opts.elev}. Reply EXACTLY as two lines:\nName: <max 4 words>\nDesc: <one sentence>`;

  aiBox.innerHTML = '<span class="rb-spin"></span> Naming your route…';
  try {
    const token = await rbToken();
    const r = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, provider: pm.provider, model: pm.model, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.text) { aiBox.innerHTML = ''; return; }
    const name = (data.text.match(/Name:\s*(.+)/i) || [])[1]?.trim();
    const desc = (data.text.match(/Desc:\s*(.+)/i) || [])[1]?.trim() || '';
    if (name && _rbRoute) { _rbRoute.name = name; if (_rbRoute.histId) rbUpdateHistoryName(_rbRoute.histId, name); }
    aiBox.innerHTML = `<div class="rb-ai-name">${rbEsc(name || (_rbRoute && _rbRoute.name))}</div>${desc ? `<div class="rb-ai-desc">${rbEsc(desc)}</div>` : ''}`;
  } catch { aiBox.innerHTML = ''; }
}

/* Build GPX 1.1 from the route's [lng,lat,ele] points and trigger a download. */
function routeDownloadGpx() {
  if (!_rbRoute || !_rbRoute.coordinates.length) return;
  const name = _rbRoute.name || 'Ascent route';
  const pts = _rbRoute.coordinates.map(c =>
    `<trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${c[2] != null ? `<ele>${(+c[2]).toFixed(1)}</ele>` : ''}</trkpt>`
  ).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ascent — Strava Dashboard" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${rbEsc(name)}</name></metadata>
  <trk><name>${rbEsc(name)}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') + '.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Map an /api/route error payload to a clear message. */
function rbErr(data) {
  const code = data && data.error;
  if (code === 'provider_not_configured') return 'Route engine isn\'t set up: add <code>' + ((data && data.envVar) || 'ORS_API_KEY') + '</code> in Vercel → Settings → Environment Variables, then redeploy.';
  if (code === 'not_authorized' || code === 'invalid_strava_token') return 'Your Strava session expired — hit Refresh and try again.';
  if (code === 'provider_error') return 'The routing service rejected the request: ' + (data.detail || '') + '. Try a different start or distance.';
  return 'Could not generate a route right now. Try again shortly.';
}

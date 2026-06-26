/* ── ROUTE BUILDER ───────────────────────────────────────────────────────────
   Generates a brand-new road loop of your chosen distance via OpenRouteService
   (round-trip routing), proxied through /api/route so the ORS key stays server
   side. You pick sport, start area, elevation preference and distance tolerance;
   a few candidate loops are generated and the best match is drawn on the map.
   An optional AI pass (reuses the AI Coach provider) names & describes it, and
   the loop downloads as a GPX you can load onto a head unit. */

let _rbRoute = null;   // { coordinates:[[lng,lat,ele]], distance, ascent, descent, name }
let _rbMap = null, _rbLine = null;

function openRouteModal() {
  const m = document.getElementById('routeModal');
  if (!m) return;
  rbBuildStartOptions();
  m.classList.add('open');
  // Map containers measure 0×0 while hidden — fix once visible.
  if (_rbMap) setTimeout(() => { try { _rbMap.invalidateSize(); } catch {} }, 200);
}
function closeRouteModal() {
  const m = document.getElementById('routeModal');
  if (m) m.classList.remove('open');
}

/* Build the "start area" dropdown from the start points of recent activities,
   de-duplicated by rough location, plus a live-GPS option. */
function rbBuildStartOptions() {
  const sel = document.getElementById('rb-start');
  if (!sel || sel.dataset.built) return;
  let html = '<option value="geo">📍 My current location (GPS)</option>';
  const seen = new Set();
  for (const a of (typeof acts !== 'undefined' ? acts : [])) {
    const ll = a.start_latlng;
    if (!ll || ll.length !== 2) continue;
    const key = ll[0].toFixed(2) + ',' + ll[1].toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);
    const where = a.location_city || a.name || 'Activity start';
    html += `<option value="${ll[0]},${ll[1]}">${where}</option>`;
    if (seen.size >= 15) break;
  }
  sel.innerHTML = html;
  sel.dataset.built = '1';
}

function rbStatus(msg, cls) {
  const el = document.getElementById('rb-status');
  if (!el) return;
  el.className = 'rb-status' + (cls ? ' ' + cls : '');
  el.innerHTML = msg || '';
}

/* Resolve the chosen start to {lat,lng}. Uses geolocation for the GPS option. */
function rbResolveStart() {
  const v = (document.getElementById('rb-start') || {}).value || 'geo';
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

async function routeGenerate() {
  const btn = document.getElementById('rb-generate');
  const dist = Math.max(2, Math.min(200, parseFloat((document.getElementById('rb-dist') || {}).value) || 0));
  const sport = (document.getElementById('rb-sport') || {}).value || 'ride';
  const elev = (document.getElementById('rb-elev') || {}).value || 'any';
  const tol = (parseInt((document.getElementById('rb-tol') || {}).value, 10) || 15) / 100;
  if (!dist) { rbStatus('Enter a distance first.', 'err'); return; }

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
  const seeds = [1, 7, 23]; // a few different shapes to choose from
  const cands = [];
  let lastErr = null;
  for (const seed of seeds) {
    try {
      const r = await fetch('/api/route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sport, lat: start.lat, lng: start.lng, length: targetM, points: 5, seed }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { lastErr = data; continue; }
      if (data.coordinates && data.coordinates.length > 1) cands.push(data);
    } catch { lastErr = null; /* network — try next seed */ }
  }
  if (!cands.length) {
    rbStatus(lastErr ? rbErr(lastErr) : 'No route could be generated from that point. Try another start or distance.', 'err');
    btn.disabled = false; return;
  }

  // Prefer candidates within tolerance of the target distance.
  const within = cands.filter(c => Math.abs(c.distance - targetM) / targetM <= tol);
  const pool = within.length ? within : cands;
  let pick;
  if (elev === 'flat')      pick = pool.reduce((a, c) => c.ascent < a.ascent ? c : a);
  else if (elev === 'hilly') pick = pool.reduce((a, c) => c.ascent > a.ascent ? c : a);
  else                      pick = pool.reduce((a, c) => Math.abs(c.distance - targetM) < Math.abs(a.distance - targetM) ? c : a);

  _rbRoute = pick;
  rbDrawRoute(pick);
  rbShowStats(pick);
  rbStatus('Route ready — download the GPX or generate again for a different loop.', 'ok');
  document.getElementById('rb-download').disabled = false;
  btn.disabled = false;

  // Optional AI naming/description — only if a provider is configured.
  rbNameRoute(pick, { dist, sport, elev, start });
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
  _rbLine = L.polyline(latlngs, { color: '#FC4C02', weight: 4, opacity: .95 }).addTo(_rbMap);
  L.circleMarker(latlngs[0], { radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1, weight: 0 }).addTo(_rbLine);
  setTimeout(() => { try { _rbMap.invalidateSize(); _rbMap.fitBounds(_rbLine.getBounds(), { padding: [24, 24] }); } catch {} }, 120);
}

function rbShowStats(route) {
  const km = (route.distance / 1000);
  const asc = Math.round(elevVal(route.ascent || 0));
  document.getElementById('rb-stats').innerHTML = `
    <div class="rb-stat"><div class="rb-stat-v">${fmtKm(route.distance)}</div><div class="rb-stat-l">${distUnit()}</div></div>
    <div class="rb-stat"><div class="rb-stat-v">${asc.toLocaleString()}</div><div class="rb-stat-l">${elevUnit()} climb</div></div>
    <div class="rb-stat"><div class="rb-stat-v">${route.coordinates.length}</div><div class="rb-stat-l">points</div></div>`;
  void km;
}

/* Ask the AI Coach provider for a name + one-line description (best-effort). */
async function rbNameRoute(route, opts) {
  const aiBox = document.getElementById('rb-ai');
  if (!aiBox) return;
  aiBox.innerHTML = '';
  // Reuse the AI Coach provider/model if that helper is loaded.
  const pm = (typeof aiProviderModel === 'function') ? aiProviderModel() : null;
  const fallback = `${Math.round(opts.dist)} ${distUnit()} ${opts.sport === 'run' ? 'run' : 'ride'} loop`;
  if (!pm) { _rbRoute.name = fallback; return; }

  const place = (document.getElementById('rb-start') || {}).selectedOptions?.[0]?.textContent || 'the start';
  const ascDisp = Math.round(elevVal(route.ascent || 0)) + ' ' + elevUnit();
  const prompt = `Name a ${opts.sport} route loop and describe it in one short sentence. ` +
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
    if (!r.ok || !data.text) { aiBox.innerHTML = ''; _rbRoute.name = fallback; return; }
    const name = (data.text.match(/Name:\s*(.+)/i) || [])[1]?.trim() || fallback;
    const desc = (data.text.match(/Desc:\s*(.+)/i) || [])[1]?.trim() || '';
    _rbRoute.name = name;
    aiBox.innerHTML = `<div class="rb-ai-name">${name}</div>${desc ? `<div class="rb-ai-desc">${desc}</div>` : ''}`;
  } catch { aiBox.innerHTML = ''; _rbRoute.name = fallback; }
}

/* Build GPX 1.1 from the route's [lng,lat,ele] points and trigger a download. */
function routeDownloadGpx() {
  if (!_rbRoute || !_rbRoute.coordinates.length) return;
  const name = _rbRoute.name || 'Ascent route';
  const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const pts = _rbRoute.coordinates.map(c =>
    `<trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${c[2] != null ? `<ele>${(+c[2]).toFixed(1)}</ele>` : ''}</trkpt>`
  ).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ascent — Strava Dashboard" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
  <trk><name>${esc(name)}</name><trkseg>
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

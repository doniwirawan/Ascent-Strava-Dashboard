/* ── CHASE ROUTES: AI route generator + live regency loops (owner only) ──
   Type the ride you want in plain words — "70 km loop via Bedugul, lots of
   climbing", "out to Amed along the coast", "100 km max, rice fields". The AI
   turns it into a plan: a distance (treated as a maximum) and the places to ride
   through; for a theme it picks real Bali places that fit. Places are geocoded
   (OpenStreetMap, Bali only) and the route is worked out on Bali's major roads
   (js/route-suggest.js graph), start → places → end, in one of three modes:
     new  — never-ridden roads cost less (the heatmap suggester's rule)
     any  — every road the same, roads you ride a lot are fine
     fast — main roads preferred, most direct
   Start/end default to your usual start (home, worked out here from your rides);
   either can be any typed place. The per-regency buttons build a live loop
   through that regency's never-ridden roads from the current rides, so a road
   ridden this morning no longer counts as new.

   Privacy: the AI sees the request and place names only — never home or any
   coordinates. Elevation comes from Open-Meteo for ~100 points along the route. */
const CHASE_AI_LS = 'chase_ai_v2';
let _caiBusy = false, _caiMap = null, _caiPick = 0, _caiLast = null;
let _caiMode = 'new', _caiLine = 'uniform';
try { _caiMode = localStorage.getItem('cai_mode') || 'new'; _caiLine = localStorage.getItem('cai_line') || 'uniform'; } catch {}
const _caiSaved = () => { try { return JSON.parse(localStorage.getItem(CHASE_AI_LS) || '[]'); } catch { return []; } };
const _caiSave = list => { try { localStorage.setItem(CHASE_AI_LS, JSON.stringify(list.slice(0, 6))); } catch {} };
const _caiEsc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const CAI_MODES = [['new', '🆕', 'New roads'], ['any', '🛣️', 'Any roads'], ['fast', '⚡', 'Fastest']];
const CAI_REGENCIES = ['Badung', 'Bangli', 'Buleleng', 'Denpasar', 'Gianyar', 'Jembrana', 'Karangasem', 'Klungkung', 'Tabanan'];

function chaseAiCard() {
  const saved = _caiSaved();
  const ex = window.LANG === 'id'
    ? ['Loop 70 km lewat Bedugul, banyak tanjakan', 'Ke Amed lewat pantai timur, sekali jalan', 'Maks 100 km lewat sawah', 'Kintamani lewat jalur berbeda']
    : ['70 km loop via Bedugul, lots of climbing', 'One way to Amed along the east coast', '100 km max through rice fields', 'Kintamani by a different way'];
  return `<div class="card cai-card">
    <div class="card-title">✨ ${tr('AI route generator')}</div>
    <div class="chart-note">${tr('Describe the ride you want — distance (as a maximum), places, climbing, coast, rice fields. The AI plans it and the route is worked out on real roads.')}</div>
    <div class="cai-row">
      <textarea id="caiText" rows="2" placeholder="${_caiEsc(ex[0])}"></textarea>
      <button class="btn btn-primary" id="caiGo" onclick="chaseAiGo()">${tr('Generate')}</button>
    </div>
    <div class="cai-opts">
      <div class="cai-seg" id="caiModes" role="radiogroup" aria-label="${tr('Route mode')}">${CAI_MODES.map(([id, ic, name]) =>
        `<button type="button" role="radio" aria-checked="${_caiMode === id}" class="${_caiMode === id ? 'on' : ''}" onclick="chaseAiMode('${id}')">${ic} ${tr(name)}</button>`).join('')}</div>
      <label class="cai-se">${tr('Start')} <input id="caiStart" placeholder="${_caiEsc(tr('Usual start (home)'))}"></label>
      <label class="cai-se">${tr('End')} <input id="caiEnd" placeholder="${_caiEsc(tr('Same as start'))}"></label>
    </div>
    <div class="cai-ex">${ex.map(e => `<button type="button" class="year-btn" onclick="document.getElementById('caiText').value=this.textContent">${_caiEsc(e)}</button>`).join('')}</div>
    <div class="cai-ex"><span class="cai-lbl">${tr('Live loop through a regency’s new roads')}:</span>${CAI_REGENCIES.map(r =>
      `<button type="button" class="year-btn" onclick="chaseAiRegency('${r}')">${r}</button>`).join('')}</div>
    <div class="cai-status" id="caiStatus"></div>
    <div id="caiResult"></div>
    ${saved.length ? `<div class="cai-saved"><span>${tr('Recent')}:</span>${saved.map((r, i) =>
      `<button type="button" class="year-btn" onclick="chaseAiShow(${i})">${_caiEsc(r.title)} · ${r.km} km</button>`).join('')}</div>` : ''}
  </div>`;
}

function chaseAiMode(m) {
  _caiMode = m; try { localStorage.setItem('cai_mode', m); } catch {}
  document.querySelectorAll('#caiModes button').forEach((b, i) => { const on = CAI_MODES[i][0] === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
}

// 1) request → plan, via the AI. Only the words go out.
async function _caiPlan(text) {
  const { provider, model, key } = typeof aiProviderModel === 'function' ? aiProviderModel() : { provider: 'deepseek' };
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken, provider, model, key, messages: [
    { role: 'system', content: 'You plan road-cycling rides in Bali, Indonesia, from a request. The ride starts and ends at a start point you never know — never guess or mention it. The rider usually rides under 100 km. '
      + 'Turn the request into the places to ride through, in riding order: real, mappable Bali places (villages, towns, landmarks, temples, beaches, lakes) on or next to a proper road. '
      + 'If the request only describes a theme (climbing, coast, rice fields, waterfalls, lakes, quiet roads…), add 1–2 well-known places in Bali that fit it, close to each other. If it names places, use those (fix spelling). Never add a place just as a starting point. '
      + 'named = true only for places the rider actually asked for; false for ones you added for the theme. '
      + 'km = the distance asked for, as a number (a maximum), or null. loop = false only if the rider clearly wants one way. '
      + 'Reply ONLY with JSON: {"km": number|null, "loop": true|false, "places": [{"name": "Place, Regency", "named": true|false}, …], "summary": "one short sentence describing the plan"}. Max 4 places.' },
    { role: 'user', content: text },
  ] }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.text) throw new Error((typeof aiErrorMessage === 'function' ? aiErrorMessage(d, r.status) : 'AI error').replace(/<[^>]+>/g, ''));
  const j = JSON.parse(String(d.text).replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  const places = (Array.isArray(j.places) ? j.places : []).slice(0, 4)
    .map(p => typeof p === 'string' ? { name: p, named: true } : { name: String(p.name || ''), named: p.named !== false }).filter(p => p.name);
  return { km: +j.km > 0 ? Math.min(300, +j.km) : null, loop: j.loop !== false, places, summary: String(j.summary || '') };
}

// 2) place names → coordinates (Nominatim, bounded to Bali, ≤ 1 request/s)
async function _caiGeocode(places, onStep) {
  const out = [];
  for (const pl of places) {
    const n = pl.name;
    onStep(n);
    try {
      const q = /bali/i.test(n) ? n : n + ', Bali';
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=114.40,-8.04,115.75,-8.90&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
      const j = r.ok ? await r.json() : [];
      if (j[0]) out.push({ name: n.split(',')[0], lat: +j[0].lat, lng: +j[0].lon, named: pl.named });
    } catch {}
    await new Promise(res => setTimeout(res, 1100));
  }
  return out;
}

// the road graph shared with the heatmap suggester, built from the current rides
async function _caiGraph() {
  const list = modeActs().filter(a => isRide(a) && a.map && a.map.summary_polyline), gk = list.length + ':' + (list[0] && list[0].id);
  if (!_rsG || _rsGKey !== gk) {
    const d = await (await fetch('data/bali-major-roads.json')).json();
    _rsGKey = gk;
    _rsG = _rsBuild(d.ways.map(w => decodePolyline(w[1])), d.ways.map(w => w[0]), list.map(a => decodePolyline(a.map.summary_polyline)));
  }
  return _rsG;
}

// A* between two nodes; edge cost depends on the mode (see top). E.f > 1 marks trunk roads.
function _caiPath(g, a, b, used, mode) {
  const N = g.lat.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const h = n => g.m([g.lat[n], g.lng[n]], [g.lat[b], g.lng[b]]) * 0.55;
  const cost = (E, e) => {
    const u = used.get(e) || 0;
    if (mode === 'fast') return E.L * (E.f > 1 ? 0.8 : 1.1) * (1 + 2 * u);
    if (mode === 'any') return E.L * (1 + 4 * u);
    return E.L * E.f * (E.nw && !u ? 0.55 : 1) * (1 + 4 * u);
  };
  const heap = [[h(a), a]]; dist[a] = 0;
  const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const x = 2 * i + 1, y = x + 1; let s = i; if (x < heap.length && heap[x][0] < heap[s][0]) s = x; if (y < heap.length && heap[y][0] < heap[s][0]) s = y; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return t; };
  while (heap.length) {
    const [f, x] = pop();
    if (x === b) break;
    if (f - h(x) > dist[x] + 1e-6) continue;
    for (const e of g.adj[x]) {
      const E = g.E[e], y = E.u === x ? E.v : E.u, c = cost(E, e);
      if (dist[x] + c < dist[y]) { dist[y] = dist[x] + c; prev[y] = e; push([dist[y] + h(y), y]); }
    }
  }
  if (a !== b && prev[b] < 0) return null;
  const es = []; for (let n = b; n !== a; ) { const e = prev[n]; es.push(e); n = g.E[e].u === n ? g.E[e].v : g.E[e].u; }
  return es.reverse();
}

const _caiD = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180));

// Stops in riding order: nearest-next from the start (no zigzag); one way ends at
// the named place furthest from the start (the destination) unless an end is set.
function _caiOrder(stops, from, oneWayToStop) {
  if (stops.length < 2) return stops;
  let last = null;
  if (oneWayToStop) {
    const named = stops.filter(s => s.named);
    last = (named.length ? named : stops).reduce((m, s) => _caiD(from, [s.lat, s.lng]) > _caiD(from, [m.lat, m.lng]) ? s : m);
  }
  const rest = stops.filter(s => s !== last), out = [];
  let cur = from;
  while (rest.length) {
    let k = 0; rest.forEach((s, i) => { if (_caiD(cur, [s.lat, s.lng]) < _caiD(cur, [rest[k].lat, rest[k].lng])) k = i; });
    const s = rest.splice(k, 1)[0]; out.push(s); cur = [s.lat, s.lng];
  }
  return last ? out.concat(last) : out;
}

// 3) start → stops → end on the graph
function _caiRoute(g, start, stops, end, mode) {
  const h0 = _rsNearest(g, start[0], start[1]); if (h0 < 0) return null;
  const nodes = stops.map(s => _rsNearest(g, s.lat, s.lng)).filter(n => n >= 0);
  if (end) { const e0 = _rsNearest(g, end[0], end[1]); if (e0 >= 0) nodes.push(e0); }
  const used = new Map(), path = []; let cur = h0;
  for (const w of nodes) {
    if (w === cur) continue;
    const es = _caiPath(g, cur, w, used, mode); if (!es) return null;
    es.forEach(e => { used.set(e, (used.get(e) || 0) + 1); path.push(e); }); cur = w;
  }
  if (!path.length) return null;
  let n = h0; const pts = [[g.lat[n], g.lng[n]]], nwf = [0]; let total = 0, nw = 0;
  path.forEach(e => { const E = g.E[e]; n = E.u === n ? E.v : E.u; pts.push([g.lat[n], g.lng[n]]); nwf.push(E.nw ? 1 : 0); total += E.L; if (E.nw) nw += E.L; });
  return { pts, nwf, total, nw };
}

// ~100 points along the route → elevation (Open-Meteo) → profile + climb
async function _caiElevation(pts) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + _rsG.m(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1], N = Math.min(100, Math.max(2, pts.length)), samp = [];
  for (let k = 0, i = 0; k < N; k++) {
    const d = total * k / (N - 1); while (i < cum.length - 2 && cum[i + 1] < d) i++;
    samp.push({ d, p: pts[i] });
  }
  try {
    const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + samp.map(s => s.p[0].toFixed(5)).join(',') + '&longitude=' + samp.map(s => s.p[1].toFixed(5)).join(','));
    const j = r.ok ? await r.json() : null;
    if (!j || !Array.isArray(j.elevation)) return null;
    let climb = 0, ref = j.elevation[0];
    j.elevation.forEach(e => { if (e > ref + 3) { climb += e - ref; ref = e; } else if (e < ref - 3) ref = e; }); // ignore ±3 m noise
    return { d: samp.map(s => Math.round(s.d)), e: j.elevation.map(Math.round), climb: Math.round(climb) };
  } catch { return null; }
}

// Title + one line for the result, from facts only (no start, no coordinates).
async function _caiName(o) {
  try {
    const { provider, model, key } = typeof aiProviderModel === 'function' ? aiProviderModel() : { provider: 'deepseek' };
    const facts = { request: o.request, kind: o.loop ? 'loop (back to the start)' : 'one way', total_km: o.km, never_ridden_km: o.nwKm, climb_m: o.elev ? o.elev.climb : null, through: (o.stops || []).map(s => s.name), mode: o.mode };
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken, provider, model, key, messages: [
      { role: 'system', content: 'You name a planned road-cycling ride in Bali. Give a short catchy title (max 6 words) and one sentence on why it is worth riding, using only the facts given (say "loop" only if kind is a loop). Never mention where the ride starts. ' + (window.LANG === 'id' ? 'Reply in Indonesian.' : 'Reply in English.') + ' Reply ONLY with JSON: {"title":"…","desc":"…"}' },
      { role: 'user', content: JSON.stringify(facts) },
    ] }) });
    const d = await r.json();
    return JSON.parse(String(d.text || '').replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  } catch { return null; }
}

const _caiSay = t => { const st = document.getElementById('caiStatus'); if (st) { st.className = 'cai-status'; st.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span> ' + _caiEsc(t); } };
const _caiFail = t => { const st = document.getElementById('caiStatus'); if (st) { st.className = 'cai-status err'; st.innerHTML = t; } };

// start / end: typed place, else the usual start (home)
async function _caiEnds(loop) {
  const sTxt = (document.getElementById('caiStart') || {}).value || '', eTxt = (document.getElementById('caiEnd') || {}).value || '';
  let start = null, end = null, startName = '', endName = '';
  if (sTxt.trim()) { const r = await _caiGeocode([{ name: sTxt.trim(), named: true }], n => _caiSay(trf('Finding {0} on the map…', n))); if (!r[0]) throw new Error(trf('Couldn’t find “{0}” on the map.', _caiEsc(sTxt))); start = [r[0].lat, r[0].lng]; startName = r[0].name; }
  else start = _rsHome();
  if (!start) throw new Error(tr('No usual start found in your rides — type a start place.'));
  if (eTxt.trim()) { const r = await _caiGeocode([{ name: eTxt.trim(), named: true }], n => _caiSay(trf('Finding {0} on the map…', n))); if (!r[0]) throw new Error(trf('Couldn’t find “{0}” on the map.', _caiEsc(eTxt))); end = [r[0].lat, r[0].lng]; endName = r[0].name; }
  else if (loop) end = start;
  return { start, end, startName, endName };
}

// Build, fit to the max distance, measure, name, keep, show.
async function _caiBuild(req) {
  const g = await _caiGraph();
  const { start, end, startName, endName } = req.ends;
  const oneWayToStop = !end;
  let stops = _caiOrder(req.stops, start, oneWayToStop);
  _caiSay(tr('Working out the route…'));
  let route = stops.length ? _caiRoute(g, start, stops, end, req.mode) : null;
  const max = req.km ? req.km * 1100 : null;                     // a little over the max is fine, not more
  // too long? drop places the AI added for the theme (never ones you named), best fit first
  while (route && max && route.total > max && stops.some(s => !s.named)) {
    let best = null;
    stops.forEach((s, k) => {
      if (s.named) return;
      const rest = stops.filter((_, x) => x !== k), r2 = rest.length ? _caiRoute(g, start, _caiOrder(rest, start, oneWayToStop), end, req.mode) : null;
      if (r2 && (!best || Math.abs(r2.total - req.km * 1000) < Math.abs(best.r.total - req.km * 1000))) best = { r: r2, rest };
    });
    if (!best) break;
    route = best.r; stops = _caiOrder(best.rest, start, oneWayToStop);
  }
  if (!route) throw new Error(tr('No route found on the major roads for that — try another place.'));
  // still over the max while chasing new roads? the most direct roads may fit (or get closer)
  let direct = false;
  if (max && route.total > max && req.mode === 'new') {
    const r2 = _caiRoute(g, start, stops, end, 'any');
    if (r2 && r2.total < route.total * 0.95) { route = r2; direct = true; }
  }
  const o = Object.assign(route, { stops, request: req.text, km: Math.round(route.total / 1000), nwKm: Math.round(route.nw / 1000), wantKm: req.km,
    loop: !!end && end === start, mode: req.mode, startName, endName, plan: req.plan, at: Date.now() });
  o.over = !!(max && route.total > max);
  o.direct = direct;
  _caiSay(tr('Measuring the climbing…'));
  o.elev = await _caiElevation(o.pts);
  _caiSay(tr('Naming the route…'));
  const nm = req.title ? null : await _caiName(o);
  o.title = req.title || (nm && nm.title) || stops.map(s => s.name).join(' · ') || trf('{0} km loop', o.km);
  o.desc = req.desc || (nm && nm.desc) || req.summary || '';
  const list = [o].concat(_caiSaved().filter(x => !(x.request === o.request && x.mode === o.mode)));
  _caiSave(list);
  const st = document.getElementById('caiStatus'); if (st) st.textContent = '';
  chaseAiShow(0, list);
}

async function chaseAiGo(forceOneWay) {
  if (_caiBusy) return;
  const text = (document.getElementById('caiText').value || '').trim();
  if (!text) { _caiFail(tr('Type the ride you want first.')); return; }
  _caiBusy = true; const go = document.getElementById('caiGo'); if (go) go.disabled = true;
  try {
    _caiSay(tr('Planning your ride…'));
    const plan = forceOneWay && _caiLast && _caiLast.text === text ? _caiLast.plan : await _caiPlan(text);
    if (forceOneWay) plan.loop = false;
    _caiSay(tr('Loading roads…'));
    await _caiGraph();
    const ends = await _caiEnds(plan.loop);
    if (!plan.places.length) {
      if (!plan.km) throw new Error(tr('Say where you want to go or how far — e.g. "60 km loop via Tabanan".'));
      // no places: the best never-ridden loop of that length from home
      _caiSay(tr('Working out the route…'));
      const opts = await _rsSuggest(plan.km);
      if (!opts[0]) throw new Error(tr('No route found on the major roads for that — try another place.'));
      const o = opts[0]; _caiLast = { text, plan };
      const stops = [];
      // the suggester's loop, as-is (always from the usual start)
      Object.assign(o, { stops, request: text, km: Math.round(o.total / 1000), nwKm: Math.round(o.nw / 1000), wantKm: plan.km, loop: true, mode: 'new', startName: '', endName: '', plan, at: Date.now() });
      _caiSay(tr('Measuring the climbing…')); o.elev = await _caiElevation(o.pts);
      _caiSay(tr('Naming the route…')); const nm = await _caiName(o);
      o.title = (nm && nm.title) || trf('{0} km loop', o.km); o.desc = (nm && nm.desc) || plan.summary;
      const list = [o].concat(_caiSaved()); _caiSave(list);
      document.getElementById('caiStatus').textContent = ''; chaseAiShow(0, list);
    } else {
      const stops = await _caiGeocode(plan.places, n => _caiSay(trf('Finding {0} on the map…', n.split(',')[0])));
      if (!stops.length) throw new Error(tr('Couldn’t find those places on the map — try naming a town or landmark.'));
      _caiLast = { text, plan };
      await _caiBuild({ text, plan, stops, km: plan.km, mode: _caiMode, ends, summary: plan.summary });
    }
  } catch (e) {
    _caiFail(_caiEsc((e && e.message) || tr('Could not work out a route right now.')));
  }
  _caiBusy = false; if (go) go.disabled = false;
}

// Live loop through one regency's never-ridden roads (no AI for the route itself).
async function chaseAiRegency(name) {
  if (_caiBusy) return;
  _caiBusy = true;
  try {
    _caiSay(tr('Loading roads…'));
    const g = await _caiGraph();
    const geo = typeof regencyGeo === 'function' ? await regencyGeo() : null;
    const f = geo && geo.features.find(x => x.properties.name === name);
    if (!f) throw new Error(tr('Could not work out a route right now.'));
    const ends = await _caiEnds(true);
    // never-ridden stretches inside the regency; the loop calls at three of them,
    // spread by direction from the start, so it goes out one way and back another
    const pts = [];
    g.E.forEach(E => { if (!E.nw) return; const la = (g.lat[E.u] + g.lat[E.v]) / 2, lo = (g.lng[E.u] + g.lng[E.v]) / 2; if (_regContains(f.geometry, lo, la)) pts.push([la, lo, E.L]); });
    if (pts.length < 3) throw new Error(trf('No never-ridden major roads left in {0} — nice!', name));
    const ang = p => Math.atan2(p[0] - ends.start[0], (p[1] - ends.start[1]) * Math.cos(ends.start[0] * Math.PI / 180));
    pts.sort((a, b) => ang(a) - ang(b));
    const stops = [0.2, 0.5, 0.8].map(q => { const p = pts[Math.min(pts.length - 1, Math.floor(q * pts.length))]; return { lat: p[0], lng: p[1], named: true, name }; });
    await _caiBuild({ text: 'regency:' + name, plan: null, stops, km: null, mode: 'new', ends, summary: '' });
  } catch (e) {
    _caiFail(_caiEsc((e && e.message) || tr('Could not work out a route right now.')));
  }
  _caiBusy = false;
}

function chaseAiLine(v) { _caiLine = v; try { localStorage.setItem('cai_line', v); } catch {} chaseAiShow(_caiPick); }

function chaseAiShow(i, list) {
  const o = (list || _caiSaved())[i]; if (!o) return;
  _caiPick = i;
  const box = document.getElementById('caiResult'); if (!box) return;
  const over = o.over && o.wantKm
    ? `<div class="cai-warn">${trf('Over your {0} km max: {1} km. The places you named need that much.', o.wantKm, o.km)}${o.loop && o.plan ? ` <button type="button" class="btn" onclick="chaseAiGo(true)">${tr('Make it one way')}</button>` : ''}</div>` : '';
  const ends = (o.startName || o.endName) ? `<div class="hero-sub">${_caiEsc(o.startName || tr('Usual start'))} → ${_caiEsc(o.endName || (o.loop ? tr('back to start') : (o.stops[o.stops.length - 1] || {}).name || ''))}</div>` : '';
  const modeName = (CAI_MODES.find(m => m[0] === o.mode) || CAI_MODES[0]);
  box.innerHTML = `
    <div class="cai-head">
      <div><b>${_caiEsc(o.title)}</b><span>${_caiEsc(o.desc)}</span></div>
      <div class="cai-head-act">
        <div class="cai-seg small">${[['uniform', 'Uniform'], ['highlight', 'Highlight new roads']].map(([id, n]) =>
          `<button type="button" class="${_caiLine === id ? 'on' : ''}" onclick="chaseAiLine('${id}')">${tr(n)}</button>`).join('')}</div>
        <button class="btn cai-gpx" onclick="chaseAiGpx()">⬇ GPX</button>
      </div>
    </div>
    ${over}${o.direct ? `<div class="hero-sub" style="margin:-4px 0 10px">${tr('Took the most direct roads to stay near your max.')}</div>` : ''}
    <div class="cycling-hero cyc-grid">
      <div class="hero-box hi"><div class="hero-label">${tr('Distance')}</div><div class="hero-value">${o.km} <span class="hero-unit">km</span></div>${ends || `<div class="hero-sub">${modeName[1]} ${tr(modeName[2])} · ${o.loop ? tr('loop') : tr('one way')}</div>`}</div>
      <div class="hero-box"><div class="hero-label">${tr('Never ridden')}</div><div class="hero-value">${o.nwKm} <span class="hero-unit">km</span></div>
        <div class="hero-sub">${trf('{0}% of the route', o.km ? Math.round(o.nwKm / o.km * 100) : 0)}</div></div>
      <div class="hero-box"><div class="hero-label">${tr('Climbing')}</div><div class="hero-value">${o.elev ? o.elev.climb.toLocaleString() : '—'} <span class="hero-unit">m</span></div>
        <div class="hero-sub">${o.elev ? trf('highest {0} m', Math.max(...o.elev.e)) : ''}</div></div>
    </div>
    <div id="caiMap" class="cai-map"></div>
    ${o.elev ? '<canvas id="caiProfile" class="cai-profile"></canvas>' : ''}`;
  if (_caiMap) { try { _caiMap.remove(); } catch {} _caiMap = null; }
  _caiMap = L.map('caiMap', { zoomControl: true, scrollWheelZoom: true });
  addBasemap(_caiMap, { switcher: true });
  mapPointMenu(_caiMap);
  if (_caiLine === 'highlight') {
    const runs = []; let run = null;
    o.pts.forEach((p, k) => { const f = o.nwf[k] || 0; if (!run || run.f !== f) { run = { f, pts: k ? [o.pts[k - 1]] : [] }; runs.push(run); } run.pts.push(p); });
    runs.forEach(r => L.polyline(r.pts, r.f ? { color: '#fc4c02', weight: 5, opacity: 1 } : { color: '#fc4c02', weight: 3, opacity: .45 }).addTo(_caiMap));
  } else {
    L.polyline(o.pts, { color: '#000', weight: 7, opacity: .35 }).addTo(_caiMap);
    L.polyline(o.pts, { color: '#fc4c02', weight: 4, opacity: 1 }).addTo(_caiMap);
  }
  (o.stops || []).forEach((s, k) => L.circleMarker([s.lat, s.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#fc4c02', fillOpacity: 1 })
    .bindTooltip((k + 1) + '. ' + _caiEsc(s.name), { permanent: true, direction: 'top', offset: [0, -8], className: 'cai-tip' }).addTo(_caiMap));
  const b = L.latLngBounds(o.pts);
  const fit = () => { try { _caiMap.invalidateSize(); _caiMap.fitBounds(b, { padding: [24, 24] }); } catch {} };
  fit(); setTimeout(() => { fit(); if (typeof routeArrows === 'function') routeArrows(_caiMap, o.pts, { every: 120 }); }, 300);
  if (o.elev) _caiDrawProfile(o.elev);
}

// elevation profile: filled area, km along the bottom, metres at the side
function _caiDrawProfile(ev) {
  const cv = document.getElementById('caiProfile'); if (!cv) return;
  const W = cv.clientWidth || 600, H = 130, dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lo = Math.min(...ev.e), hi = Math.max(...ev.e), tot = ev.d[ev.d.length - 1] || 1, pl = 40, pb = 18, pt = 8;
  const X = d => pl + (W - pl - 6) * d / tot, Y = e => pt + (H - pt - pb) * (1 - (e - lo) / Math.max(1, hi - lo));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
  c.font = '10px system-ui, sans-serif'; c.fillStyle = css('--muted');
  c.fillText(hi + ' m', 2, pt + 8); c.fillText(lo + ' m', 2, H - pb);
  for (let k = 0; k <= 4; k++) { const d = tot * k / 4; c.fillText(Math.round(d / 1000) + ' km', Math.min(W - 34, X(d) - 8), H - 4); }
  c.beginPath(); c.moveTo(X(0), H - pb);
  ev.e.forEach((e, k) => c.lineTo(X(ev.d[k]), Y(e)));
  c.lineTo(X(tot), H - pb); c.closePath();
  const g = c.createLinearGradient(0, pt, 0, H - pb); g.addColorStop(0, 'rgba(252,76,2,.55)'); g.addColorStop(1, 'rgba(252,76,2,.08)');
  c.fillStyle = g; c.fill();
  c.beginPath(); ev.e.forEach((e, k) => k ? c.lineTo(X(ev.d[k]), Y(e)) : c.moveTo(X(ev.d[k]), Y(e)));
  c.strokeStyle = '#fc4c02'; c.lineWidth = 2; c.stroke();
}

function chaseAiGpx() {
  const o = _caiSaved()[_caiPick]; if (!o) return;
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ascent" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + '<trk><name>' + String(o.title + ' — ' + o.km + ' km').replace(/[<&>]/g, '') + '</name><trkseg>\n'
    + o.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('\n') + '\n</trkseg></trk></gpx>\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = 'route-' + o.km + 'km.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

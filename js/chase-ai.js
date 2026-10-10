/* ── AI ROUTE GENERATOR (Chase Routes page, owner only) ──
   Type the ride you want in plain words — "70 km loop via Bedugul, lots of
   climbing", "out to Amed along the coast", "rice fields, roads I haven't
   ridden". The AI turns it into a plan: a distance and the places to ride
   through, in order; for a theme it picks real Bali places that fit. Those are
   geocoded (OpenStreetMap, Bali only) and the route is worked out on the major
   roads by the same never-ridden-first search as the heatmap's suggester
   (js/route-suggest.js): home → places → home, or one way.

   Privacy: the AI sees the request and place names only — never home or any
   coordinates (home is worked out here, in the browser). */
const CHASE_AI_LS = 'chase_ai_v1';
let _caiBusy = false, _caiMap = null, _caiPick = 0;
const _caiSaved = () => { try { return JSON.parse(localStorage.getItem(CHASE_AI_LS) || '[]'); } catch { return []; } };
const _caiSave = list => { try { localStorage.setItem(CHASE_AI_LS, JSON.stringify(list.slice(0, 5))); } catch {} };
const _caiEsc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function chaseAiCard() {
  const saved = _caiSaved();
  const ex = window.LANG === 'id'
    ? ['Loop 70 km lewat Bedugul, banyak tanjakan', 'Ke Amed lewat pantai timur', '60 km lewat sawah, jalan yang belum pernah', 'Kintamani lewat jalur berbeda']
    : ['70 km loop via Bedugul, lots of climbing', 'Out to Amed along the east coast', '60 km through rice fields, new roads', 'Kintamani by a different way'];
  return `<div class="card cai-card">
    <div class="card-title">✨ ${tr('AI route generator')}</div>
    <div class="chart-note">${tr('Describe the ride you want — distance, places, climbing, coast, rice fields. The AI plans it, the route uses real roads and prefers ones you have never ridden.')}</div>
    <div class="cai-row">
      <textarea id="caiText" rows="2" placeholder="${_caiEsc(ex[0])}"></textarea>
      <button class="btn btn-primary" id="caiGo" onclick="chaseAiGo()">${tr('Generate')}</button>
    </div>
    <div class="cai-ex">${ex.map(e => `<button type="button" class="year-btn" onclick="document.getElementById('caiText').value=this.textContent">${_caiEsc(e)}</button>`).join('')}</div>
    <div class="cai-status" id="caiStatus"></div>
    <div id="caiResult"></div>
    ${saved.length ? `<div class="cai-saved"><span>${tr('Recent')}:</span>${saved.map((r, i) =>
      `<button type="button" class="year-btn" onclick="chaseAiShow(${i})">${_caiEsc(r.title)} · ${r.km} km</button>`).join('')}</div>` : ''}
  </div>`;
}

// 1) request → plan, via the AI. Only the words go out.
async function _caiPlan(text) {
  const { provider, model, key } = typeof aiProviderModel === 'function' ? aiProviderModel() : { provider: 'deepseek' };
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken, provider, model, key, messages: [
    { role: 'system', content: 'You plan road-cycling rides in Bali, Indonesia, from a request. The ride starts and ends at the rider\'s home (you never know where that is — never guess or mention it). '
      + 'Turn the request into the places to ride through, in riding order: real, mappable Bali places (villages, towns, landmarks, temples, beaches, lakes) that are on or next to a proper road. '
      + 'If the request only describes a theme (climbing, coast, rice fields, waterfalls, lakes, quiet roads…), choose 1–3 well-known places in Bali that fit it. If it names places, use those (fix spelling). '
      + 'km = requested total distance as a number, or null. loop = false only if the rider clearly wants one way. '
      + 'Reply ONLY with JSON: {"km": number|null, "loop": true|false, "places": ["Place, Regency", …], "summary": "one short sentence describing the plan"}. Max 4 places.' },
    { role: 'user', content: text },
  ] }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.text) throw new Error((typeof aiErrorMessage === 'function' ? aiErrorMessage(d, r.status) : 'AI error').replace(/<[^>]+>/g, ''));
  const j = JSON.parse(String(d.text).replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  return { km: +j.km > 0 ? Math.min(300, +j.km) : null, loop: j.loop !== false, places: (Array.isArray(j.places) ? j.places : []).slice(0, 4).map(String), summary: String(j.summary || '') };
}

// 2) place names → coordinates (Nominatim, bounded to Bali, ≤ 1 request/s)
async function _caiGeocode(names, onStep) {
  const out = [];
  for (const n of names) {
    onStep(n);
    try {
      const q = /bali/i.test(n) ? n : n + ', Bali';
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=114.40,-8.04,115.75,-8.90&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
      const j = r.ok ? await r.json() : [];
      if (j[0]) out.push({ name: n.split(',')[0], lat: +j[0].lat, lng: +j[0].lon });
    } catch {}
    await new Promise(res => setTimeout(res, 1100));
  }
  return out;
}

// the road graph shared with the heatmap suggester, built from your rides
async function _caiGraph() {
  const list = modeActs().filter(a => isRide(a) && a.map && a.map.summary_polyline), gk = list.length + ':' + (list[0] && list[0].id);
  if (!_rsG || _rsGKey !== gk) {
    const d = await (await fetch('data/bali-major-roads.json')).json();
    _rsGKey = gk;
    _rsG = _rsBuild(d.ways.map(w => decodePolyline(w[1])), d.ways.map(w => w[0]), list.map(a => decodePolyline(a.map.summary_polyline)));
  }
  return _rsG;
}

// 3) home → places (→ home), never-ridden roads cheap, repeats expensive
function _caiRoute(g, stops, loop) {
  const home = _rsHome(); if (!home) return null;
  const h0 = _rsNearest(g, home[0], home[1]); if (h0 < 0) return null;
  const nodes = stops.map(s => _rsNearest(g, s.lat, s.lng)).filter(n => n >= 0);
  const seq = loop ? [...nodes, h0] : nodes;
  const used = new Map(), path = []; let cur = h0;
  for (const w of seq) {
    if (w === cur) continue;
    const es = _rsPath(g, cur, w, used); if (!es) return null;
    es.forEach(e => { used.set(e, (used.get(e) || 0) + 1); path.push(e); }); cur = w;
  }
  let n = h0; const pts = [[g.lat[n], g.lng[n]]], nwf = [0]; let total = 0, nw = 0;
  path.forEach(e => { const E = g.E[e]; n = E.u === n ? E.v : E.u; pts.push([g.lat[n], g.lng[n]]); nwf.push(E.nw ? 1 : 0); total += E.L; if (E.nw) nw += E.L; });
  return { pts, nwf, total, nw };
}

async function chaseAiGo() {
  if (_caiBusy) return;
  const text = (document.getElementById('caiText').value || '').trim();
  const st = document.getElementById('caiStatus'), go = document.getElementById('caiGo');
  if (!text) { st.textContent = tr('Type the ride you want first.'); return; }
  _caiBusy = true; go.disabled = true;
  const say = t => { st.className = 'cai-status'; st.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span> ' + _caiEsc(t); };
  try {
    say(tr('Planning your ride…'));
    const plan = await _caiPlan(text);
    let route = null, stops = [];
    say(tr('Loading roads…'));
    const g = await _caiGraph();
    if (plan.places.length) {
      stops = await _caiGeocode(plan.places, n => say(trf('Finding {0} on the map…', n.split(',')[0])));
      if (!stops.length) throw new Error(tr('Couldn’t find those places on the map — try naming a town or landmark.'));
      say(tr('Working out the route…'));
      route = _caiRoute(g, stops, plan.loop);
    } else if (plan.km) {
      const opts = await _rsSuggest(plan.km);      // no places: the best never-ridden loop of that length
      route = opts[0] || null;
    } else throw new Error(tr('Say where you want to go or how far — e.g. "60 km loop via Tabanan".'));
    if (!route) throw new Error(tr('No route found on the major roads for that — try another place.'));
    const o = Object.assign(route, { stops, request: text, summary: plan.summary, km: Math.round(route.total / 1000), nwKm: Math.round(route.nw / 1000), wantKm: plan.km, loop: plan.loop });
    say(tr('Naming the route…'));
    const names = typeof _rsAiNames === 'function' ? await _rsAiNames([o]) : null;
    o.title = (names && names[0] && names[0].title) || stops.map(s => s.name).join(' · ') || trf('{0} km loop', o.km);
    o.desc = (names && names[0] && names[0].desc) || plan.summary;
    const list = [o].concat(_caiSaved().filter(x => x.request !== text));
    _caiSave(list);
    st.textContent = '';
    chaseAiShow(0, list);
  } catch (e) {
    st.className = 'cai-status err'; st.textContent = (e && e.message) || tr('Could not work out a route right now.');
  }
  _caiBusy = false; go.disabled = false;
}

function chaseAiShow(i, list) {
  const o = (list || _caiSaved())[i]; if (!o) return;
  _caiPick = i;
  const box = document.getElementById('caiResult'); if (!box) return;
  const off = o.wantKm && Math.abs(o.km - o.wantKm) > 0.2 * o.wantKm
    ? `<div class="hero-sub">${trf('asked for {0} km — the places set the distance', o.wantKm)}</div>` : '';
  box.innerHTML = `
    <div class="cai-head"><b>${_caiEsc(o.title)}</b><span>${_caiEsc(o.desc)}</span></div>
    <div class="cycling-hero cyc-grid">
      <div class="hero-box hi"><div class="hero-label">${tr('Distance')}</div><div class="hero-value">${o.km} <span class="hero-unit">km</span></div>${off}</div>
      <div class="hero-box"><div class="hero-label">${tr('Never ridden')}</div><div class="hero-value">${o.nwKm} <span class="hero-unit">km</span></div>
        <div class="hero-sub">${trf('{0}% of the route', o.km ? Math.round(o.nwKm / o.km * 100) : 0)}</div></div>
      <div class="hero-box" style="display:flex;align-items:center;justify-content:center">
        <button class="btn btn-primary" onclick="chaseAiGpx()">${tr('Download GPX')}</button></div>
    </div>
    <div id="caiMap" style="height:480px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border)"></div>`;
  if (_caiMap) { try { _caiMap.remove(); } catch {} _caiMap = null; }
  _caiMap = L.map('caiMap', { zoomControl: true, scrollWheelZoom: true });
  addBasemap(_caiMap, { switcher: true });
  mapPointMenu(_caiMap);
  const runs = []; let run = null;
  o.pts.forEach((p, k) => { const f = o.nwf[k] || 0; if (!run || run.f !== f) { run = { f, pts: k ? [o.pts[k - 1]] : [] }; runs.push(run); } run.pts.push(p); });
  runs.forEach(r => L.polyline(r.pts, r.f ? { color: '#fc4c02', weight: 5, opacity: 1 } : { color: '#fc4c02', weight: 3, opacity: .45 }).addTo(_caiMap));
  (o.stops || []).forEach((s, k) => L.circleMarker([s.lat, s.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#fc4c02', fillOpacity: 1 })
    .bindTooltip((k + 1) + '. ' + _caiEsc(s.name), { permanent: true, direction: 'top', offset: [0, -8], className: 'cai-tip' }).addTo(_caiMap));
  const b = L.latLngBounds(o.pts);
  const fit = () => { try { _caiMap.invalidateSize(); _caiMap.fitBounds(b, { padding: [24, 24] }); } catch {} };
  fit(); setTimeout(() => { fit(); if (typeof routeArrows === 'function') routeArrows(_caiMap, o.pts, { every: 120 }); }, 300);
}

function chaseAiGpx() {
  const o = _caiSaved()[_caiPick]; if (!o) return;
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ascent" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + '<trk><name>' + String(o.title + ' — ' + o.km + ' km').replace(/[<&>]/g, '') + '</name><trkseg>\n'
    + o.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('\n') + '\n</trkseg></trk></gpx>\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = 'ai-route-' + o.km + 'km.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

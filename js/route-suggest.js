/* ── ROUTE SUGGESTER (Heatmap · Never-ridden mode) ────────────────────────────
   Suggests loops from home and back that soak up as many never-ridden major &
   medium roads as possible. Home = where most of your rides start (worked out
   here, in the browser).

   The routing is plain code, not AI: a graph of Bali's major roads
   (data/bali-major-roads.json), each piece marked ridden / never ridden with the
   same check as the map (rideCoverage). For the chosen distance it tries loops
   through three turning points on a circle through home, in 12 directions and 3
   sizes; each leg is an A* search that makes never-ridden roads cheap and
   already-used roads in this loop expensive, so it explores instead of doubling
   back. Roads you have ridden are fine to use. The three best loops in clearly
   different directions are offered.

   AI only names and describes the options. It is told distances and which
   regencies the never-ridden parts are in — never the start (home) or any
   coordinates. */
let _rsG = null, _rsGKey = '', _rsOpts = null, _rsPick = 0, _rsLayer = null, _rsBusy = false, _rsKm = 80;
try { _rsKm = +localStorage.getItem('rs_km') || 80; } catch {}

// where most rides start, ~200 m clusters
function _rsHome() {
  const c = {};
  (typeof acts !== 'undefined' ? acts : []).forEach(a => {
    const s = a.start_latlng; if (!s || s.length !== 2) return;
    const k = Math.round(s[0] / 0.002) + ',' + Math.round(s[1] / 0.002);
    (c[k] = c[k] || []).push(s);
  });
  const top = Object.values(c).sort((x, y) => y.length - x.length)[0];
  return top ? [top.reduce((s, p) => s + p[0], 0) / top.length, top.reduce((s, p) => s + p[1], 0) / top.length] : null;
}

// Road graph: nodes at every road point (shared points join roads), edges with
// length, cost factor (busy trunk roads a bit dearer) and never-ridden flag.
function _rsBuild(roads, cls, tracks) {
  const { m, riddenShare } = rideCoverage(tracks);
  const id = new Map(), lat = [], lng = [], adj = [], E = [];
  const node = p => { const k = p[0] + ',' + p[1]; let i = id.get(k); if (i == null) { i = lat.length; id.set(k, i); lat.push(p[0]); lng.push(p[1]); adj.push([]); } return i; };
  roads.forEach((p, w) => {
    const f = cls[w] === 0 ? 1.15 : 1;
    for (let i = 1; i < p.length; i++) {
      const u = node(p[i - 1]), v = node(p[i]); if (u === v) continue;
      const L = m(p[i - 1], p[i]), e = E.length;
      E.push({ u, v, L, f, nw: riddenShare(p[i - 1], p[i]) < 0.5 });
      adj[u].push(e); adj[v].push(e);
    }
  });
  // keep the biggest connected network (stray bits can't be routed to)
  const comp = new Int32Array(lat.length).fill(-1); let best = -1, bestN = 0;
  for (let s = 0, c = 0; s < lat.length; s++) {
    if (comp[s] >= 0) continue;
    let n = 0; const st = [s]; comp[s] = c;
    while (st.length) { const x = st.pop(); n++; adj[x].forEach(e => { const y = E[e].u === x ? E[e].v : E[e].u; if (comp[y] < 0) { comp[y] = c; st.push(y); } }); }
    if (n > bestN) { bestN = n; best = c; } c++;
  }
  // coarse grid for "nearest node"
  const grid = new Map(), G = 0.01;
  for (let i = 0; i < lat.length; i++) if (comp[i] === best) {
    const k = Math.floor(lat[i] / G) + ',' + Math.floor(lng[i] / G); (grid.get(k) || grid.set(k, []).get(k)).push(i);
  }
  return { lat, lng, adj, E, m, grid, G };
}

function _rsNearest(g, la, lo) {
  let best = -1, bd = Infinity;
  for (let r = 0; r < 6 && best < 0; r++) {
    const i0 = Math.floor(la / g.G), j0 = Math.floor(lo / g.G);
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      (g.grid.get(i + ',' + j) || []).forEach(n => { const d = (g.lat[n] - la) ** 2 + (g.lng[n] - lo) ** 2; if (d < bd) { bd = d; best = n; } });
    }
  }
  return best;
}

// A* from a to b; never-ridden edges cost 0.55×, edges already in this loop 5× per use
function _rsPath(g, a, b, used) {
  const N = g.lat.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const h = n => g.m([g.lat[n], g.lng[n]], [g.lat[b], g.lng[b]]) * 0.55;
  const heap = [[h(a), a]]; dist[a] = 0;
  const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a1 = 2 * i + 1, b1 = a1 + 1; let s = i; if (a1 < heap.length && heap[a1][0] < heap[s][0]) s = a1; if (b1 < heap.length && heap[b1][0] < heap[s][0]) s = b1; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return t; };
  while (heap.length) {
    const [f, x] = pop();
    if (x === b) break;
    if (f - h(x) > dist[x] + 1e-6) continue;
    for (const e of g.adj[x]) {
      const E = g.E[e], y = E.u === x ? E.v : E.u;
      const c = E.L * E.f * (E.nw && !used.has(e) ? 0.55 : 1) * (1 + 4 * (used.get(e) || 0));
      if (dist[x] + c < dist[y]) { dist[y] = dist[x] + c; prev[y] = e; push([dist[y] + h(y), y]); }
    }
  }
  if (a !== b && prev[b] < 0) return null;
  const es = []; for (let n = b; n !== a; ) { const e = prev[n]; es.push(e); n = g.E[e].u === n ? g.E[e].v : g.E[e].u; }
  return es.reverse();
}

async function _rsSuggest(km) {
  const g = _rsG, home = _rsHome(); if (!g || !home) return [];
  const h0 = _rsNearest(g, home[0], home[1]); if (h0 < 0) return [];
  const D = km * 1000, kx = Math.cos(home[0] * Math.PI / 180), out = [];
  const status = document.getElementById('rsStatus');
  let tried = 0;
  for (const rk of [0.6, 0.75, 0.9]) for (let th = 0; th < 360; th += 30) {
    tried++; if (status) status.textContent = trf('Working out routes… {0}/36', tried);
    await new Promise(r => setTimeout(r, 0));                       // keep the page responsive
    const r = D / (2 * Math.PI) * rk, t = th * Math.PI / 180;
    const c = [home[0] + r / 111320 * Math.cos(t), home[1] + r / (111320 * kx) * Math.sin(t)];
    const wps = [-90, 0, 90].map(o => { const a = (th + o) * Math.PI / 180; return _rsNearest(g, c[0] + r / 111320 * Math.cos(a), c[1] + r / (111320 * kx) * Math.sin(a)); });
    if (wps.some(w => w < 0)) continue;
    const used = new Map(), path = []; let cur = h0, ok = true;
    for (const w of [...wps, h0]) {
      const es = _rsPath(g, cur, w, used); if (!es) { ok = false; break; }
      es.forEach(e => { used.set(e, (used.get(e) || 0) + 1); path.push(e); }); cur = w;
    }
    if (!ok || !path.length) continue;
    let total = 0, nw = 0, rep = 0;
    used.forEach((n, e) => { const L = g.E[e].L; total += L * n; rep += L * (n - 1); if (g.E[e].nw) nw += L; });
    // new road counts most, but a loop more than ~10% off the asked distance pays heavily for it
    const off = Math.max(0, Math.abs(total - D) - 0.1 * D);
    out.push({ th, path, total, nw, rep, score: nw / 1000 - 2.5 * off / 1000 - 0.8 * rep / 1000 });
  }
  // best three, at least 90° apart so they really are different rides, none more than 25% off the distance
  out.sort((a, b) => b.score - a.score);
  const pick = [];
  for (const o of out) { if (Math.abs(o.total - D) > 0.25 * D && pick.length) continue; if (pick.every(p => Math.min(Math.abs(p.th - o.th), 360 - Math.abs(p.th - o.th)) >= 90)) pick.push(o); if (pick.length === 3) break; }
  return pick.map(o => {
    // node chain → coordinates, plus a per-point never-ridden flag for drawing
    let n = h0; const pts = [[g.lat[n], g.lng[n]]], nwf = [0];
    o.path.forEach(e => { const E = g.E[e]; n = E.u === n ? E.v : E.u; pts.push([g.lat[n], g.lng[n]]); nwf.push(E.nw ? 1 : 0); });
    return { pts, nwf, total: o.total, nw: o.nw };
  });
}

// regencies the never-ridden parts are in (km each), minus the home regency — what the AI may see
async function _rsAreas(o, homeReg) {
  const geo = typeof regencyGeo === 'function' ? await regencyGeo() : null; if (!geo) return [];
  const km = {}; let acc = 0;
  for (let i = 1; i < o.pts.length; i++) {
    if (!o.nwf[i]) continue;
    acc += _rsG.m(o.pts[i - 1], o.pts[i]); if (acc < 500) continue;
    const f = geo.features.find(f => _regContains(f.geometry, o.pts[i][1], o.pts[i][0]));
    if (f && f.properties.name !== homeReg) km[f.properties.name] = (km[f.properties.name] || 0) + acc / 1000;
    acc = 0;
  }
  return Object.entries(km).sort((a, b) => b[1] - a[1]).map(([n, k]) => n + ' ' + Math.round(k) + ' km');
}

async function _rsAiNames(opts) {
  try {
    const geo = typeof regencyGeo === 'function' ? await regencyGeo() : null, home = _rsHome();
    const hf = geo && home && geo.features.find(f => _regContains(f.geometry, home[1], home[0]));
    const homeReg = hf ? hf.properties.name : '';
    const rows = [];
    for (let i = 0; i < opts.length; i++) rows.push({ option: i + 1, total_km: Math.round(opts[i].total / 1000), never_ridden_km: Math.round(opts[i].nw / 1000), never_ridden_roads_in: await _rsAreas(opts[i], homeReg) });
    const { provider, model, key } = (typeof aiProviderModel === 'function') ? aiProviderModel() : { provider: 'deepseek' };
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken, provider, model, key, messages: [
      { role: 'system', content: 'You name road-cycling loops in Bali for a rider chasing roads they have never ridden. For each option give a short catchy title (max 6 words) and one sentence on what makes it worth riding, using only the facts given. Never mention where the ride starts. ' + (window.LANG === 'id' ? 'Reply in Indonesian.' : 'Reply in English.') + ' Reply ONLY with JSON: [{"title":"…","desc":"…"}, …] in option order.' },
      { role: 'user', content: JSON.stringify(rows) },
    ] }) });
    const d = await r.json();
    const j = JSON.parse(String(d.text || '').replace(/^[^[]*/, '').replace(/[^\]]*$/, ''));
    return Array.isArray(j) ? j : null;
  } catch { return null; }
}

function _rsDraw() {
  if (_rsLayer) { try { _rsLayer.remove(); } catch {} _rsLayer = null; }
  const map = typeof leafletMapInst !== 'undefined' && leafletMapInst;
  const o = _rsOpts && _rsOpts[_rsPick];
  if (!map || !o || heatMode !== 'unridden') return;
  _rsLayer = L.layerGroup([
    L.polyline(o.pts, { color: '#000', weight: 7, opacity: 0.55, interactive: false }),
    L.polyline(o.pts, { color: '#ffffff', weight: 4, opacity: 0.95, interactive: false }),
  ]).addTo(map);
  try { map.fitBounds(L.latLngBounds(o.pts), { padding: [24, 24] }); } catch {}
}

function _rsPanel() {
  const box = document.getElementById('routeSuggest'); if (!box) return;
  box.style.display = heatMode === 'unridden' ? '' : 'none';
  if (heatMode !== 'unridden') return;
  const kms = [40, 60, 80, 100, 120];
  const T = tr, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  box.innerHTML = `<div class="card-title">${T('Suggest a route')}</div>
    <div class="chart-note">${T('A loop from home and back through as many never-ridden major roads as possible. Routes are worked out from the road map; AI only names them.')}</div>
    <div class="rs-row">${kms.map(k => `<button class="year-btn${k === _rsKm ? ' active' : ''}" onclick="rsSetKm(${k})">${k} km</button>`).join('')}
      <button class="btn btn-primary" id="rsGo" onclick="rsGo()"${_rsBusy ? ' disabled' : ''}>${T('Suggest')}</button></div>
    <div class="hrz-note" id="rsStatus"></div>
    <div class="rs-opts">${(_rsOpts || []).map((o, i) => `
      <div class="rs-opt${i === _rsPick ? ' on' : ''}" onclick="rsPick(${i})">
        <div class="rs-t">${i === 0 ? `<span class="rs-best">${T('Best')}</span>` : ''}${esc(o.title || T('Option') + ' ' + (i + 1))}</div>
        ${o.desc ? `<div class="rs-d">${esc(o.desc)}</div>` : ''}
        <div class="rs-s"><b>${(o.total / 1000).toFixed(0)} km</b> · ${trf('{0} km never ridden', (o.nw / 1000).toFixed(0))}</div>
        <button class="seg-scan" onclick="event.stopPropagation();rsGpx(${i})">${T('Download GPX')}</button>
      </div>`).join('')}</div>`;
}

function rsSetKm(k) { _rsKm = k; try { localStorage.setItem('rs_km', k); } catch {} _rsPanel(); }
function rsPick(i) { _rsPick = i; _rsPanel(); _rsDraw(); }

async function rsGo() {
  if (_rsBusy) return;
  _rsBusy = true; _rsPanel();
  const st = () => document.getElementById('rsStatus');
  try {
    // same activities as the map (follows the sport filter); rebuilt when they change
    const list = modeActs().filter(a => a.map && a.map.summary_polyline), gk = list.length + ':' + (list[0] && list[0].id);
    if (!_rsG || _rsGKey !== gk) {
      st().textContent = tr('Loading roads…');
      const d = await (await fetch('data/bali-major-roads.json')).json();
      const tracks = list.map(a => decodePolyline(a.map.summary_polyline)); _rsGKey = gk;
      _rsG = _rsBuild(d.ways.map(w => decodePolyline(w[1])), d.ways.map(w => w[0]), tracks);
    }
    const opts = await _rsSuggest(_rsKm);
    if (!opts.length) { _rsOpts = null; _rsBusy = false; _rsPanel(); st().textContent = tr('No loop found from home on the major roads.'); return; }
    _rsOpts = opts; _rsPick = 0; _rsBusy = false; _rsPanel(); _rsDraw();
    st().textContent = tr('Naming the routes…');
    const names = await _rsAiNames(opts);
    if (names) opts.forEach((o, i) => { if (names[i]) { o.title = names[i].title; o.desc = names[i].desc; } });
    _rsPanel();
  } catch (e) {
    console.error(e); _rsBusy = false; _rsPanel();
    const s = st(); if (s) s.textContent = tr('Could not work out a route right now.');
  }
}

function rsGpx(i) {
  const o = _rsOpts && _rsOpts[i]; if (!o) return;
  const name = (o.title || 'Never-ridden loop') + ' — ' + Math.round(o.total / 1000) + ' km';
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ascent" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + '<trk><name>' + name.replace(/[<&>]/g, '') + '</name><trkseg>\n'
    + o.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('\n') + '\n</trkseg></trk></gpx>\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = 'never-ridden-' + Math.round(o.total / 1000) + 'km.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

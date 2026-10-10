/* ── 3D FLYOVER VIDEO (Reels / Story, 9:16) ──
   Renders an activity as an MP4 right in the browser: the camera follows the
   route over 3D terrain (the same MapLibre + satellite + elevation setup as the
   heatmap's 3D view, js/map3d.js), the ridden part draws itself in orange, and a
   live panel shows speed, heart rate and power (or elevation without a power
   meter) from the activity's streams, with an elevation profile underneath.

   Frame by frame, not screen-recorded: each frame waits for its map tiles, then
   goes to a WebCodecs H.264 encoder with an exact timestamp and is muxed to MP4
   (mp4-muxer). So the video is smooth however slow the device, and plays in
   Instagram as-is. Needs WebCodecs (Chrome / Edge; recent Safari).

   Privacy: on by default, everything within 500 m of the start (home) is cut —
   from the route, the camera path and the numbers. */
const V3D_W = 720, V3D_H = 1280, V3D_FPS = 30, V3D_HOME_M = 500;
const V3D_MUXER = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.js';
let _v3dMuxP = null, _v3dBusy = false, _v3dCancel = false;

function _v3dLoadMuxer() {
  if (window.Mp4Muxer) return Promise.resolve();
  return _v3dMuxP || (_v3dMuxP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = V3D_MUXER; s.onload = res;
    s.onerror = () => { _v3dMuxP = null; rej(new Error('mp4-muxer failed to load')); };
    document.head.appendChild(s);
  }));
}

const _v3dHav = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
};
const _v3dBearing = (a, b) => {
  const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};

/* Streams → samples [{ll, d, alt, v, hr, w}] with the home zone removed, the
   distance re-based to the first kept sample, and a light smoothing on HR/power. */
async function _v3dSamples(a, hideHome) {
  const raw = await api(`/activities/${a.id}/streams?keys=latlng,distance,altitude,velocity_smooth,heartrate,watts&key_by_type=true`);
  const g = k => raw[k] && raw[k].data;
  const ll = g('latlng'), d = g('distance');
  if (!ll || !d || ll.length < 10) return null;
  let v = g('velocity_smooth');
  if (v && typeof fixSpeedSpikes === 'function') {
    const own = localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID;
    v = fixSpeedSpikes(v, own ? { ceiling: MAX_SPEED_CEILING } : { k: 6 }).data;
  }
  const alt = g('altitude'), hr = g('heartrate'), w = g('watts');
  const avg = (arr, i, n) => { if (!arr) return null; let s = 0, c = 0; for (let j = Math.max(0, i - n); j <= i; j++) if (arr[j] != null) { s += arr[j]; c++; } return c ? s / c : null; };
  const home = a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng : ll[0];
  const out = [];
  for (let i = 0; i < ll.length; i++) {
    if (!ll[i]) continue;
    if (hideHome && _v3dHav(home, ll[i]) < V3D_HOME_M) continue;
    out.push({ ll: ll[i], d: d[i], alt: alt ? alt[i] : null, v: v ? v[i] : null, hr: avg(hr, i, 3), w: avg(w, i, 3) });
  }
  if (out.length < 10) return null;
  const d0 = out[0].d; out.forEach(s => { s.d -= d0; });
  return out;
}

// Sample at a given distance along the (kept) route — binary search + lerp of the position.
function _v3dAt(S, dist) {
  let lo = 0, hi = S.length - 1;
  if (dist <= S[0].d) return { i: 0, ll: S[0].ll, s: S[0] };
  if (dist >= S[hi].d) return { i: hi, ll: S[hi].ll, s: S[hi] };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].d <= dist) lo = m; else hi = m; }
  const a = S[lo], b = S[hi], t = b.d > a.d ? (dist - a.d) / (b.d - a.d) : 0;
  return { i: lo, ll: [a.ll[0] + (b.ll[0] - a.ll[0]) * t, a.ll[1] + (b.ll[1] - a.ll[1]) * t], s: a };
}

/* ── HUD drawn on the 2D compositing canvas over each map frame ── */
function _v3dRound(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function _v3dHud(c, st) {
  const { a, S, cur, total, prof, phase, fade, power, dest } = st;
  const W = V3D_W, H = V3D_H, F = '"Inter","Segoe UI",system-ui,sans-serif';
  // top: shade + title + date
  let g = c.createLinearGradient(0, 0, 0, 230); g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, 230);
  c.fillStyle = '#fc4c02'; c.font = `800 22px ${F}`; c.textBaseline = 'top';
  c.fillText('ASCENT', 36, 38);
  c.fillStyle = '#fff'; c.font = `800 34px ${F}`;
  const words = String(a.name || 'Ride').split(' '); let line = '', y = 72;
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > W - 72 && line) { c.fillText(line, 36, y); y += 42; line = wd; if (y > 120) break; } else line = t; }
  if (y <= 120) c.fillText(line, 36, y);
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `600 20px ${F}`;
  const when = new Date(a.start_date_local || a.start_date);
  c.fillText(when.toLocaleDateString(window.LANG === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + (dest ? '  ·  📍 ' + dest : ''), 36, y + 50);

  if (phase === 'outro') return _v3dOutro(c, st);

  // bottom: shade + live tiles + elevation profile
  g = c.createLinearGradient(0, H - 470, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.35, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
  c.fillStyle = g; c.fillRect(0, H - 470, W, 470);
  c.globalAlpha = fade;
  const s = cur.s, tiles = [
    ['SPEED', s.v != null ? (s.v * 3.6).toFixed(1) : '—', 'km/h', '#fc4c02'],
    ['HEART RATE', s.hr != null ? Math.round(s.hr) : '—', 'bpm', '#ef4444'],
    power ? ['POWER', s.w != null ? Math.round(s.w) : '—', 'W', '#facc15'] : ['ELEVATION', s.alt != null ? Math.max(0, Math.round(s.alt)) : '—', 'm', '#60a5fa'], // GPS dips below sea level on the coast
  ];
  const tw = (W - 72 - 2 * 16) / 3, ty = H - 380;
  tiles.forEach(([lbl, val, unit, col], k) => {
    const x = 36 + k * (tw + 16);
    c.fillStyle = 'rgba(20,20,20,.72)'; _v3dRound(c, x, ty, tw, 128, 18); c.fill();
    c.fillStyle = col; c.fillRect(x + 18, ty + 18, 26, 4);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `700 15px ${F}`; c.fillText(lbl, x + 18, ty + 32);
    c.fillStyle = '#fff'; c.font = `800 46px ${F}`; c.fillText(String(val), x + 18, ty + 56);
    const vw = c.measureText(String(val)).width; c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `700 18px ${F}`; c.fillText(unit, x + 24 + vw, ty + 80);
  });
  // distance + elevation profile with a moving dot
  const px = 36, pw = W - 72, py = H - 220, ph = 110;
  const dTxt = (cur.dist / 1000).toFixed(1) + ' km';
  c.fillStyle = '#fff'; c.font = `800 26px ${F}`; c.fillText(dTxt, px, py - 44);
  const dW = c.measureText(dTxt).width;
  c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `600 20px ${F}`; c.fillText(' / ' + (total / 1000).toFixed(1) + ' km', px + dW + 4, py - 40);
  if (prof) {
    const { pts, lo, hi } = prof, X = f => px + f * pw, Y = v => py + ph - (hi > lo ? (v - lo) / (hi - lo) : .5) * ph;
    const f = total ? cur.dist / total : 0;
    c.beginPath(); c.moveTo(X(0), py + ph); pts.forEach((v, i) => c.lineTo(X(i / (pts.length - 1)), Y(v))); c.lineTo(X(1), py + ph); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fill();
    c.save(); c.beginPath(); c.rect(px, py - 4, f * pw, ph + 8); c.clip();
    c.beginPath(); c.moveTo(X(0), py + ph); pts.forEach((v, i) => c.lineTo(X(i / (pts.length - 1)), Y(v))); c.lineTo(X(1), py + ph); c.closePath();
    c.fillStyle = 'rgba(252,76,2,.55)'; c.fill(); c.restore();
    const vi = Math.min(pts.length - 1, Math.round(f * (pts.length - 1)));
    c.beginPath(); c.arc(X(f), Y(pts[vi]), 8, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#fc4c02'; c.stroke();
  }
  c.globalAlpha = 1;
  c.fillStyle = 'rgba(255,255,255,.45)'; c.font = `500 13px ${F}`; c.textBaseline = 'bottom';
  c.fillText('Imagery © Esri · Terrain © Mapzen', 36, H - 30); c.textBaseline = 'top';
}

// Closing card: the whole ride in numbers.
function _v3dOutro(c, st) {
  const { a, fade, power } = st, W = V3D_W, H = V3D_H, F = '"Inter","Segoe UI",system-ui,sans-serif';
  c.globalAlpha = fade;
  c.fillStyle = 'rgba(10,10,10,.8)'; _v3dRound(c, 36, H - 560, W - 72, 500, 26); c.fill();
  const hms = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm'; };
  const rows = [
    ['DISTANCE', ((a.distance || 0) / 1000).toFixed(1) + ' km'], ['MOVING TIME', hms(a.moving_time || 0)],
    ['ELEVATION', Math.round(a.total_elevation_gain || 0) + ' m'], ['AVG SPEED', ((a.average_speed || 0) * 3.6).toFixed(1) + ' km/h'],
    ['AVG HEART RATE', a.average_heartrate ? Math.round(a.average_heartrate) + ' bpm' : '—'],
    [power ? 'AVG POWER' : 'MAX SPEED', power ? Math.round(a.weighted_average_watts || a.average_watts || 0) + ' W' : ((a.max_speed || 0) * 3.6).toFixed(1) + ' km/h'],
  ];
  rows.forEach(([l, v], k) => {
    const x = 72 + (k % 2) * ((W - 144) / 2), y = H - 510 + Math.floor(k / 2) * 140;
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `700 17px ${F}`; c.fillText(l, x, y);
    c.fillStyle = '#fff'; c.font = `800 44px ${F}`; c.fillText(v, x, y + 28);
  });
  c.globalAlpha = 1;
}

/* ── the render ── */
async function _v3dRender(a, opts, ui) {
  ui.step(tr('Fetching your ride’s data…'), .01);
  const S = await _v3dSamples(a, opts.hideHome);
  if (!S) throw new Error(tr('This activity has no GPS stream to fly over.'));
  ui.step(tr('Loading the 3D engine…'), .03);
  await Promise.all([_m3dLoad(), _v3dLoadMuxer()]);
  if (typeof VideoEncoder === 'undefined') throw new Error(tr('This browser can’t encode video — use Chrome or Edge on a laptop or Android.'));

  const total = S[S.length - 1].d;
  const power = S.some(s => s.w != null);
  const alts = S.map(s => s.alt).filter(x => x != null);
  const prof = alts.length > 10 ? (() => { const n = 160, pts = []; for (let k = 0; k < n; k++) pts.push(_v3dAt(S, total * k / (n - 1)).s.alt ?? alts[0]); return { pts, lo: Math.min(...pts), hi: Math.max(...pts) }; })() : null;
  const rp = a.route_places, dest = rp && rp.furthest_place && typeof destName === 'function' ? destName(rp) : '';

  // the map renders off-screen at exactly 720×1280 device pixels
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-20000px;top:0;width:${V3D_W / 2}px;height:${V3D_H / 2}px;`;
  document.body.appendChild(box);
  const route = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: S.map(s => [s.ll[1], s.ll[0]]) } };
  const step = Math.max(1, Math.floor(S.length / 3000));
  const map = new maplibregl.Map({
    container: box, pixelRatio: 2, preserveDrawingBuffer: true, interactive: false, attributionControl: false, fadeDuration: 0,
    center: [S[0].ll[1], S[0].ll[0]], zoom: 13, pitch: 60,
    style: { version: 8,
      sources: {
        sat: { type: 'raster', tiles: [M3D_ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
        dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' },
        all: { type: 'geojson', data: route },
        done: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } },
      },
      layers: [
        { id: 'sat', type: 'raster', source: 'sat' },
        { id: 'all', type: 'line', source: 'all', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 2.2, 'line-opacity': .45 } },
        { id: 'done-case', type: 'line', source: 'done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000', 'line-width': 7, 'line-opacity': .35 } },
        { id: 'done', type: 'line', source: 'done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fc4c02', 'line-width': 4.5 } },
      ],
      terrain: { source: 'dem', exaggeration: 1.5 } },
  });
  const idle = (ms = 4000) => new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; map.once('idle', fin); setTimeout(fin, ms); map.triggerRepaint(); });
  ui.step(tr('Loading satellite imagery and terrain…'), .05);
  await new Promise(res => map.once('load', res));

  try { return await _v3dFrames(); } finally { try { map.remove(); } catch {} box.remove(); }

  async function _v3dFrames() {
  const out = document.createElement('canvas'); out.width = V3D_W; out.height = V3D_H;
  const c = out.getContext('2d');

  let encErr = null;
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: V3D_W, height: V3D_H }, fastStart: 'in-memory' });
  const enc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { encErr = e; } });
  let cfg = null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42001f']) {
    const cand = { codec, width: V3D_W, height: V3D_H, bitrate: 8e6, framerate: V3D_FPS };
    try { if ((await VideoEncoder.isConfigSupported(cand)).supported) { cfg = cand; break; } } catch {}
  }
  if (!cfg) throw new Error(tr('This browser can’t encode H.264 video.'));
  enc.configure(cfg);

  // timeline: 2 s overview → fly along the route → 1 s pull back → 3 s summary
  const secs = opts.secs, nIntro = 2 * V3D_FPS, nRide = Math.round((secs - 6) * V3D_FPS), nPull = V3D_FPS, nOutro = 3 * V3D_FPS;
  const N = nIntro + nRide + nPull + nOutro;
  const bounds = S.reduce((b, s) => b.extend([s.ll[1], s.ll[0]]), new maplibregl.LngLatBounds([S[0].ll[1], S[0].ll[0]], [S[0].ll[1], S[0].ll[0]]));
  const ov = map.cameraForBounds(bounds, { padding: { top: 130, bottom: 210, left: 25, right: 25 }, pitch: 45 }) || { center: bounds.getCenter(), zoom: 11 };
  const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const lerpAng = (a0, a1, t) => { const d = ((a1 - a0 + 540) % 360) - 180; return (a0 + d * t + 360) % 360; };
  const FOLLOW_Z = 14.2, LOOK = Math.min(900, total / 20);
  let bearing = _v3dBearing(S[0].ll, _v3dAt(S, LOOK).ll);
  const setDone = dist => {
    const k = _v3dAt(S, dist);
    const coords = []; for (let i = 0; i <= k.i; i += step) coords.push([S[i].ll[1], S[i].ll[0]]);
    coords.push([k.ll[1], k.ll[0]]);
    map.getSource('done').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
    return k;
  };
  const ovCenter = ov.center.toArray ? ov.center.toArray() : [ov.center.lng, ov.center.lat];

  for (let f = 0; f < N; f++) {
    if (_v3dCancel) break;
    if (encErr) throw encErr;
    let phase = 'ride', cur, fade = 1;
    if (f < nIntro) {                                   // overview, then dive to the start
      const t = ease(f / nIntro), k = setDone(0);
      cur = { dist: 0, s: k.s };
      map.jumpTo({ center: [ovCenter[0] + (k.ll[1] - ovCenter[0]) * t, ovCenter[1] + (k.ll[0] - ovCenter[1]) * t],
        zoom: ov.zoom + (FOLLOW_Z - ov.zoom) * t, pitch: 45 + 15 * t, bearing: lerpAng(0, bearing, t), padding: { top: 0, bottom: 0, left: 0, right: 0 } });
      fade = t;
    } else if (f < nIntro + nRide) {                     // follow the route
      const p = (f - nIntro) / Math.max(1, nRide - 1), dist = total * p;
      const k = setDone(dist), ahead = _v3dAt(S, Math.min(total, dist + LOOK));
      if (_v3dHav(k.ll, ahead.ll) > 30) bearing = lerpAng(bearing, _v3dBearing(k.ll, ahead.ll), .06);
      map.jumpTo({ center: [k.ll[1], k.ll[0]], zoom: FOLLOW_Z, pitch: 60, bearing });
      cur = { dist, s: k.s };
    } else {                                              // pull back to the whole route + summary
      const t = ease(Math.min(1, (f - nIntro - nRide) / nPull)), k = setDone(total);
      map.jumpTo({ center: [k.ll[1] + (ovCenter[0] - k.ll[1]) * t, k.ll[0] + (ovCenter[1] - k.ll[0]) * t],
        zoom: FOLLOW_Z + (ov.zoom - FOLLOW_Z) * t, pitch: 60 - 15 * t, bearing: lerpAng(bearing, 0, t) });
      cur = { dist: total, s: k.s };
      phase = f >= nIntro + nRide + nPull ? 'outro' : 'ride';
      if (phase === 'outro') fade = Math.min(1, (f - nIntro - nRide - nPull) / 12);
    }
    if (f === 0) ui.step(tr('Loading the first view…'), .07);
    await idle(f === 0 ? 15000 : 4000);
    c.drawImage(map.getCanvas(), 0, 0, V3D_W, V3D_H);
    if (phase !== 'outro' && f >= nIntro) {             // rider dot
      const at = _v3dAt(S, cur.dist).ll, pt = map.project([at[1], at[0]]);
      c.beginPath(); c.arc(pt.x * 2, pt.y * 2, 13, 0, 7); c.fillStyle = 'rgba(252,76,2,.35)'; c.fill();
      c.beginPath(); c.arc(pt.x * 2, pt.y * 2, 8, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#fc4c02'; c.stroke();
    }
    _v3dHud(c, { a, S, cur, total, prof, phase, fade, power, dest });
    const vf = new VideoFrame(out, { timestamp: Math.round(f * 1e6 / V3D_FPS), duration: Math.round(1e6 / V3D_FPS) });
    enc.encode(vf, { keyFrame: f % (V3D_FPS * 2) === 0 }); vf.close();
    if (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 20));
    if (f === 0) ui.preview(out);                        // show the canvas once it has a picture
    ui.progress((f + 1) / N);
  }
  await enc.flush(); enc.close();
  if (_v3dCancel) return null;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }
}

/* ── the dialog ── */
function openVideo3d(id) {
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
  if (!a) return;
  let m = document.getElementById('v3dModal');
  if (!m) { m = document.createElement('div'); m.id = 'v3dModal'; m.className = 'v3d-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="v3d-box">
      <div class="v3d-head"><b>🎬 ${tr('3D flyover video')}</b><button type="button" class="v3d-x" aria-label="${tr('Close')}">✕</button></div>
      <div class="v3d-stage"><div class="v3d-ph">${tr('A 9:16 video for Reels & Story: the camera flies your route in 3D with live speed, heart rate and power.')}</div></div>
      <div class="v3d-opts">
        <label>${tr('Length')} <select id="v3dSecs"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="45">45 s</option></select></label>
        <label><input type="checkbox" id="v3dHome" checked> ${tr('Hide 500 m around the start (home)')}</label>
      </div>
      <div class="v3d-bar"><i></i></div>
      <div class="v3d-msg"></div>
      <div class="v3d-actions"><button type="button" class="btn btn-primary" id="v3dGo">${tr('Render video')}</button></div>
    </div>`;
  m.classList.add('open');
  const msg = m.querySelector('.v3d-msg'), bar = m.querySelector('.v3d-bar i'), go = m.querySelector('#v3dGo'), stage = m.querySelector('.v3d-stage');
  const close = () => { if (_v3dBusy) _v3dCancel = true; m.classList.remove('open'); };
  m.querySelector('.v3d-x').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  go.onclick = async () => {
    if (_v3dBusy) { _v3dCancel = true; return; }
    _v3dBusy = true; _v3dCancel = false;
    go.textContent = tr('Cancel'); msg.className = 'v3d-msg';
    // setup steps fill the first 8% of the bar (shimmering while they wait); frames the rest
    const barBox = bar.parentElement, SETUP = .08;
    barBox.classList.add('busy');
    stage.innerHTML = '<div class="v3d-wait"><span class="v3d-spin"></span><span class="v3d-wait-t"></span></div>';
    let t0 = 0;
    try {
      const blob = await _v3dRender(a, { secs: +m.querySelector('#v3dSecs').value, hideHome: m.querySelector('#v3dHome').checked }, {
        step: (label, p) => {
          bar.style.width = (p * 100).toFixed(1) + '%';
          msg.textContent = label;
          const w = stage.querySelector('.v3d-wait-t'); if (w) w.textContent = label;
        },
        preview: cv => { barBox.classList.remove('busy'); stage.innerHTML = ''; stage.appendChild(cv); },
        progress: p => {
          if (!t0) t0 = Date.now();                       // ETA from the frames only, not the setup
          const tot = SETUP + p * (1 - SETUP);
          bar.style.width = (tot * 100).toFixed(1) + '%';
          const el = (Date.now() - t0) / 1000, left = p > .03 ? el / p - el : 0;
          msg.textContent = trf('Rendering… {0}%', Math.round(tot * 100)) + (left ? ' · ' + trf('about {0} left', left > 90 ? Math.round(left / 60) + ' min' : Math.round(left) + ' s') : '') + ' — ' + tr('keep this tab open');
        },
      });
      barBox.classList.remove('busy');
      if (blob) {
        const url = URL.createObjectURL(blob), name = 'ascent-3d-' + a.id + '.mp4';
        stage.innerHTML = `<video src="${url}" controls autoplay loop muted playsinline></video>`;
        msg.className = 'v3d-msg ok'; msg.textContent = '✓ ' + tr('Ready') + ' — ' + (blob.size / 1048576).toFixed(1) + ' MB MP4';
        const acts = m.querySelector('.v3d-actions');
        acts.innerHTML = `<a class="btn btn-primary" href="${url}" download="${name}">${tr('Download MP4')}</a>`;
        const file = new File([blob], name, { type: 'video/mp4' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          const sh = document.createElement('button'); sh.type = 'button'; sh.className = 'btn'; sh.textContent = tr('Share');
          sh.onclick = () => navigator.share({ files: [file], title: a.name }).catch(() => {});
          acts.appendChild(sh);
        }
      } else { msg.textContent = tr('Cancelled.'); }
    } catch (e) {
      bar.parentElement.classList.remove('busy');
      if (stage.querySelector('.v3d-wait')) stage.innerHTML = '<div class="v3d-ph">⚠️</div>';
      msg.className = 'v3d-msg err'; msg.textContent = (e && e.message) || String(e);
    }
    _v3dBusy = false; _v3dCancel = false;
    if (go.isConnected) go.textContent = tr('Render video');
  };
}

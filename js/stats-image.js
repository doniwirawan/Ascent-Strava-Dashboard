/* ── STATS IMAGE (activity modal) ──
   A Garmin-style 4:5 summary picture of one activity: name, date (no clock
   times), destination, route shape and key stats. Strava's public API can't
   attach photos to an activity, so the image is previewed here and then
   shared (phone share sheet → Strava) or downloaded to add by hand.
   The route matches the activity map: the full polyline as a plain line, no
   start/finish dots and no home trimming (the athlete's choice). */
const SI_W = 1080, SI_H = 1350;
const SI_FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";
const SI_ORANGE = '#fc4c02';

function _siKm(a, b) {
  const R = 6371, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* The route as one segment — the same polyline the activity map draws. */
function _siRouteSegments(a) {
  const pl = a.map && a.map.summary_polyline;
  if (!pl) return [];
  const pts = decodePolyline(pl);
  return pts.length < 2 ? [] : [pts];
}

/* Wrap text to at most maxLines lines of width w (ellipsis on the last). */
function _siWrap(ctx, text, w, maxLines) {
  const words = String(text || '').split(/\s+/), lines = [];
  let line = '';
  words.forEach(word => {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width > w && line) { lines.push(line); line = word; } else line = t;
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > w) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function _siPin(ctx, x, y, s, color) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, s * 0.5, Math.PI, 0); ctx.lineTo(x, y + s * 0.95); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* Weather condition words (AI_WMO) → icon kind. Night = the ride started after
   dark or before dawn; only picks a moon over a sun, no time is shown. */
function _siWeatherKind(cond, a) {
  const c = String(cond || '').toLowerCase();
  const h = parseInt(String(a.start_date_local || '').slice(11, 13), 10);
  const night = h >= 18 || h < 6;
  if (/thunder/.test(c)) return 'storm';
  if (/snow/.test(c)) return 'snow';
  if (/rain|drizzle|shower/.test(c)) return 'rain';
  if (/fog/.test(c)) return 'fog';
  if (/overcast/.test(c)) return 'cloud';
  if (/partly|mainly/.test(c)) return night ? 'moon-cloud' : 'sun-cloud';
  return night ? 'moon' : 'sun';
}

/* Weather-app style icon centred at (x, y), s = overall size. */
function _siWeatherIcon(ctx, kind, x, y, s) {
  const SUN = '#ffc53d', MOON = '#e8e4d0', CLOUD = '#e9edf2', CLOUD2 = '#aab3bf', RAIN = '#4da3ff', BOLT = '#ffd23f';
  const sun = (cx, cy, r) => {
    ctx.fillStyle = SUN; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = SUN; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const t = i * Math.PI / 4; ctx.beginPath();
      ctx.moveTo(cx + Math.cos(t) * r * 1.45, cy + Math.sin(t) * r * 1.45); ctx.lineTo(cx + Math.cos(t) * r * 1.85, cy + Math.sin(t) * r * 1.85); ctx.stroke(); }
  };
  const moon = (cx, cy, r) => { // crescent cut on its own canvas so the cut-out doesn't punch through the image
    const m = document.createElement('canvas'); m.width = m.height = Math.ceil(r * 2 + 2);
    const g = m.getContext('2d'); g.fillStyle = MOON;
    g.beginPath(); g.arc(r + 1, r + 1, r, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(r + 1 + r * 0.55, r + 1 - r * 0.35, r * 0.85, 0, Math.PI * 2); g.fill();
    ctx.drawImage(m, cx - r - 1, cy - r - 1);
  };
  const cloud = (cx, cy, w, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.arc(cx - w * 0.28, cy + w * 0.05, w * 0.22, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.02, cy - w * 0.1, w * 0.3, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.3, cy + w * 0.06, w * 0.2, 0, Math.PI * 2);
    ctx.fill(); ctx.fillRect(cx - w * 0.28, cy + w * 0.02, w * 0.58, w * 0.24);
  };
  ctx.save();
  if (kind === 'sun') sun(x, y, s * 0.24);
  else if (kind === 'moon') moon(x, y, s * 0.36);
  else if (kind === 'sun-cloud' || kind === 'moon-cloud') {
    kind === 'sun-cloud' ? sun(x + s * 0.12, y - s * 0.14, s * 0.18) : moon(x + s * 0.14, y - s * 0.16, s * 0.24);
    cloud(x - s * 0.06, y + s * 0.08, s * 0.8, CLOUD);
  } else {
    const dark = kind === 'rain' || kind === 'storm';
    cloud(x, y - s * 0.1, s * 0.9, dark ? CLOUD2 : CLOUD);
    if (kind === 'rain') { ctx.strokeStyle = RAIN; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      [-0.22, 0, 0.22].forEach(o => { ctx.beginPath(); ctx.moveTo(x + s * o, y + s * 0.26); ctx.lineTo(x + s * (o - 0.07), y + s * 0.44); ctx.stroke(); }); }
    if (kind === 'storm') { ctx.fillStyle = BOLT; ctx.beginPath();
      ctx.moveTo(x + s * 0.04, y + s * 0.18); ctx.lineTo(x - s * 0.12, y + s * 0.38); ctx.lineTo(x, y + s * 0.38);
      ctx.lineTo(x - s * 0.08, y + s * 0.55); ctx.lineTo(x + s * 0.14, y + s * 0.3); ctx.lineTo(x + s * 0.02, y + s * 0.3); ctx.closePath(); ctx.fill(); }
    if (kind === 'snow') { ctx.fillStyle = '#ffffff';
      [-0.22, 0, 0.22].forEach((o, i) => { ctx.beginPath(); ctx.arc(x + s * o, y + s * (0.32 + (i % 2) * 0.1), s * 0.05, 0, Math.PI * 2); ctx.fill(); }); }
    if (kind === 'fog') { ctx.strokeStyle = CLOUD2; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
      [0.3, 0.44].forEach((o, i) => { ctx.beginPath(); ctx.moveTo(x - s * (0.34 - i * 0.08), y + s * o); ctx.lineTo(x + s * (0.34 - i * 0.04), y + s * o); ctx.stroke(); }); }
  }
  ctx.restore();
}

/* Up to 9 stats that exist for this activity. */
function _siStats(a, wx) {
  const ride = isRide(a), S = [];
  S.push(['Distance', fmtD(a.distance)]);
  if (a.moving_time) S.push(['Moving time', fmtT(a.moving_time)]);
  if (a.total_elevation_gain) S.push(['Elevation', fmtElev(a.total_elevation_gain)]);
  if (a.average_speed) S.push(ride ? ['Avg speed', fmtSpeed(a.average_speed)] : ['Avg pace', fmtPace(a.average_speed)]);
  if (ride && typeof cleanMax === 'function' && cleanMax(a)) S.push(['Max speed', fmtSpeed(cleanMax(a))]);
  if (a.average_heartrate) S.push(['Avg HR', Math.round(a.average_heartrate) + ' bpm']);
  if (a.average_watts) S.push(['Avg power', Math.round(a.average_watts) + ' W']);
  if (a.kilojoules) S.push(['Energy', Math.round(a.kilojoules).toLocaleString() + ' kJ']);
  else if (a.calories) S.push(['Calories', Math.round(a.calories).toLocaleString()]);
  if (wx && wx.temp_c != null) S.push(['Weather', wx.temp_c + '°C', _siWeatherKind(wx.condition, a)]);
  if (a.pr_count) S.push(['PRs', String(a.pr_count)]);
  return S.slice(0, 9);
}

/* Map looks offered in the preview. Tiles come from providers that send CORS
   headers (OSM, Esri), so the canvas stays exportable. `shade` darkens the
   tiles so the orange route pops; `invert` turns light OSM tiles into a dark map. */
const SI_STYLES = [
  { id: 'sat', name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', shade: 0.42, credit: 'Imagery © Esri' },
  { id: 'dark', name: 'Dark', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', invert: true, shade: 0.1, credit: '© OpenStreetMap' },
  { id: 'relief', name: 'Relief', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', relief: true, shade: 0.15, credit: 'Hillshade © Esri' },
  { id: 'plain', name: 'Plain' },
];
const _siStyle = id => SI_STYLES.find(s => s.id === id) || SI_STYLES[0];

/* Web Mercator world pixel coords at zoom z. */
function _siMerc(p, z) {
  const n = 256 * 2 ** z, sin = Math.sin(p[0] * Math.PI / 180);
  return [(p[1] + 180) / 360 * n, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n];
}

function _siTile(url) {
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const t = setTimeout(() => res(null), 8000);
    img.onload = () => { clearTimeout(t); res(img); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = url;
  });
}

/* Draw the basemap for the route into box and return {X, Y} projectors so the
   route lands exactly on it. Plain style (or tile failure) = no map, same fit. */
async function _siMap(ctx, segs, box, styleId, pad) {
  const st = _siStyle(styleId), all = segs.flat();
  const fitW = box.w - pad * 2, fitH = box.h - 90;
  // largest zoom where the route still fits, then scale tiles to fill exactly
  let z = 16;
  const size = zz => { const m = all.map(p => _siMerc(p, zz)); const xs = m.map(q => q[0]), ys = m.map(q => q[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }; };
  let b = size(z);
  while (z > 3 && ((b.maxX - b.minX) > fitW || (b.maxY - b.minY) > fitH)) { z--; b = size(z); }
  const k = Math.min(fitW / Math.max(b.maxX - b.minX, 1), fitH / Math.max(b.maxY - b.minY, 1), 2);
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const X = p => box.x + box.w / 2 + (_siMerc(p, z)[0] - cx) * k;
  const Y = p => box.y + box.h / 2 + (_siMerc(p, z)[1] - cy) * k;
  if (!st.url) return { X, Y };

  // tiles covering the box, drawn onto an offscreen canvas
  const off = document.createElement('canvas'); off.width = box.w; off.height = box.h;
  const o = off.getContext('2d');
  const wx0 = cx - box.w / 2 / k, wy0 = cy - box.h / 2 / k, ts = 256 * k, max = 2 ** z;
  const jobs = [];
  for (let tx = Math.floor(wx0 / 256); tx <= Math.floor((wx0 + box.w / k) / 256); tx++)
    for (let ty = Math.floor(wy0 / 256); ty <= Math.floor((wy0 + box.h / k) / 256); ty++) {
      if (ty < 0 || ty >= max) continue;
      const url = st.url.replace('{z}', z).replace('{x}', ((tx % max) + max) % max).replace('{y}', ty);
      jobs.push(_siTile(url).then(img => { if (img) o.drawImage(img, (tx * 256 - wx0) * k, (ty * 256 - wy0) * k, ts + 1, ts + 1); return !!img; }));
    }
  const ok = (await Promise.all(jobs)).filter(Boolean).length;
  if (!ok) return { X, Y };
  if (st.invert) { // light OSM → dark, slightly cool grey map
    const d = o.getImageData(0, 0, box.w, box.h), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = 255 - (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11);
      px[i] = g * 0.62; px[i + 1] = g * 0.66; px[i + 2] = g * 0.74;
    }
    o.putImageData(d, 0, 0);
  }
  if (st.relief) { // flat grey hillshade → high-contrast, cool-toned terrain
    const d = o.getImageData(0, 0, box.w, box.h), px = d.data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 16) { sum += px[i]; n++; }
    const mean = sum / Math.max(n, 1); // anchor flat ground to a dark tone
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.max(0, Math.min(255, (px[i] - mean) * 2.6 + 58));
      px[i] = g * 0.72; px[i + 1] = g * 0.8; px[i + 2] = g * 0.95;
    }
    o.putImageData(d, 0, 0);
  }
  ctx.drawImage(off, box.x, box.y);
  // darken, then fade the top and bottom edges into the background
  ctx.fillStyle = 'rgba(12,12,13,' + st.shade + ')'; ctx.fillRect(box.x, box.y, box.w, box.h);
  const fade = (y0, y1, from) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, from); g.addColorStop(1, 'rgba(20,20,22,0)'); ctx.fillStyle = g; ctx.fillRect(box.x, Math.min(y0, y1), box.w, Math.abs(y1 - y0)); };
  fade(box.y, box.y + 110, '#171719');
  fade(box.y + box.h, box.y + box.h - 150, '#111112');
  const v = ctx.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, box.h * 0.35, box.x + box.w / 2, box.y + box.h / 2, box.w * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = v; ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.font = '500 18px ' + SI_FONT; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.textAlign = 'right';
  ctx.fillText(st.credit, box.x + box.w - pad, box.y + box.h - 14); ctx.textAlign = 'left';
  return { X, Y };
}

async function drawStatsImage(canvas, a, wx, style) {
  canvas.width = SI_W; canvas.height = SI_H;
  const ctx = canvas.getContext('2d'), P = 72;

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, SI_H);
  bg.addColorStop(0, '#1a1a1c'); bg.addColorStop(1, '#0c0c0d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SI_W, SI_H);
  ctx.fillStyle = SI_ORANGE; ctx.fillRect(0, 0, SI_W, 10);

  // header: sport + date (day only — never a clock time)
  const when = a.start_date_local || a.start_date;
  const date = when ? new Date(when).toLocaleDateString(window.LANG === 'id' ? 'id-ID' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const sport = tr(String(a.sport_type || a.type || 'Activity').replace(/([a-z])([A-Z])/g, '$1 $2')).toUpperCase();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 30px ' + SI_FONT; ctx.fillStyle = SI_ORANGE; ctx.fillText(sport, P, 100);
  ctx.font = '500 30px ' + SI_FONT; ctx.fillStyle = '#9a9a9a';
  ctx.textAlign = 'right'; ctx.fillText(date, SI_W - P, 100); ctx.textAlign = 'left';

  // title
  ctx.font = '800 64px ' + SI_FONT; ctx.fillStyle = '#ffffff';
  const lines = _siWrap(ctx, a.name || 'Activity', SI_W - P * 2, 2);
  let y = 190;
  lines.forEach(l => { ctx.fillText(l, P, y); y += 74; });

  // destination only — the start village (home) is never written on the image;
  // the route line/map still show the whole ride. Font shrinks to fit one line.
  const rp = a.route_places;
  const placeLine = rp && rp.furthest_place ? destName(rp) + '  ·  ' + kmOut(rp.furthest_km_from_start) : '';
  if (placeLine) {
    _siPin(ctx, P + 14, y - 20, 30, SI_ORANGE);
    let fs = 34;
    do { ctx.font = '600 ' + fs + 'px ' + SI_FONT; } while (ctx.measureText(placeLine).width > SI_W - P * 2 - 44 && --fs > 22);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(_siWrap(ctx, placeLine, SI_W - P * 2 - 44, 1)[0], P + 44, y);
    y += 30;
  }

  // route on a map, full-bleed between header and stats
  const top = y + 20, statsTop = 860;
  const segs = _siRouteSegments(a);
  const proj = segs.length ? await _siMap(ctx, segs, { x: 0, y: top, w: SI_W, h: statsTop - 30 - top }, style, P) : null;
  if (proj) {
    const { X, Y } = proj;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[22, 'rgba(252,76,2,.22)'], [12, 'rgba(252,76,2,.35)'], [7, SI_ORANGE]].forEach(([lw, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      segs.forEach(s => { ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))); ctx.stroke(); });
    });
    // turnaround marker at the point furthest from the start
    const all = segs.flat();
    const home = a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng : all[0];
    const far = all.reduce((m, p) => _siKm(home, p) > _siKm(home, m) ? p : m, all[0]);
    if (rp && rp.furthest_place) _siPin(ctx, X(far), Y(far) - 34, 40, '#ffffff');
  }

  // stats grid (3 columns)
  const stats = _siStats(a, wx), cols = 3, cw = (SI_W - P * 2) / cols, rh = 130;
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(P, statsTop - 20, SI_W - P * 2, 2);
  stats.forEach(([lbl, val, icon], i) => {
    const cx = P + (i % cols) * cw, cy = statsTop + 30 + Math.floor(i / cols) * rh;
    ctx.font = '600 24px ' + SI_FONT; ctx.fillStyle = '#8a8a8a'; ctx.fillText(tr(lbl).toUpperCase(), cx, cy);
    let tx = cx;
    if (icon) { _siWeatherIcon(ctx, icon, cx + 24, cy + 38, 50); tx = cx + 58; }
    ctx.font = '800 ' + (val.length > 12 ? 36 : 48) + 'px ' + SI_FONT; ctx.fillStyle = '#ffffff';
    ctx.fillText(_siWrap(ctx, val, cw - 20 - (tx - cx), 1)[0], tx, cy + 56);
  });

  // footer
  ctx.font = '600 24px ' + SI_FONT; ctx.fillStyle = '#6a6a6a';
  ctx.fillText('ASCENT ANALYTICS', P, SI_H - 50);
  ctx.textAlign = 'right'; ctx.fillText('ascent-analytics.doniwirawan.xyz', SI_W - P, SI_H - 50); ctx.textAlign = 'left';
}

/* Build the image and show it in the activity modal's panel with Share/Download. */
async function openStatsImage(id) {
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
  const panel = document.getElementById('actAiPanel');
  if (!a || !panel) return;
  panel.innerHTML = '<div class="ai-cap-loading"><span class="ai-dots"><span></span><span></span><span></span></span> ' + tr('Drawing your image…') + '</div>';
  try { if (typeof aiRoutePlaces === 'function') await aiRoutePlaces(a); } catch {}
  let wx = null; try { if (typeof aiWeather === 'function') wx = await aiWeather(a); } catch {}
  let style = 'sat'; try { style = _siStyle(localStorage.getItem('si_style')).id; } catch {}
  const cv = document.createElement('canvas');
  await drawStatsImage(cv, a, wx, style);
  panel._siCanvas = cv;
  panel.innerHTML = '<img class="si-preview" id="siPreview" alt="Stats image preview" src="' + cv.toDataURL('image/png') + '">'
    + '<div class="si-styles" role="group" aria-label="' + tr('Map style') + '">'
    + SI_STYLES.map(s => '<button type="button" class="si-style' + (s.id === style ? ' active' : '') + '" data-style="' + s.id + '">' + tr(s.name) + '</button>').join('')
    + '</div>'
    + '<div class="ai-cap-actions">'
    + '<button class="btn btn-primary" type="button" onclick="shareStatsImage(\'' + a.id + '\')">' + tr('Share') + '</button>'
    + '<button class="btn" type="button" onclick="downloadStatsImage(\'' + a.id + '\')">' + tr('Download') + '</button>'
    + '<button class="btn" type="button" onclick="document.getElementById(\'actAiPanel\').innerHTML=\'\'">' + tr('Close') + '</button></div>'
    + '<div class="ai-cap-status" id="siStatus">' + tr('Strava doesn\'t let apps attach photos, so share it to the Strava app or download it and add it to the activity there.') + '</div>';
  // switch map style: redraw in place and remember the pick
  panel.querySelectorAll('.si-style').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.style, img = document.getElementById('siPreview');
      panel.querySelectorAll('.si-style').forEach(x => x.classList.toggle('active', x === b));
      try { localStorage.setItem('si_style', id); } catch {}
      if (img) img.style.opacity = '.4';
      const c = document.createElement('canvas');
      await drawStatsImage(c, a, wx, id);
      if (!b.classList.contains('active')) return; // another style was picked meanwhile
      panel._siCanvas = c;
      if (img) { img.src = c.toDataURL('image/png'); img.style.opacity = ''; }
    };
  });
}

function _siBlob() {
  const cv = (document.getElementById('actAiPanel') || {})._siCanvas;
  return new Promise(res => cv ? cv.toBlob(res, 'image/png') : res(null));
}

async function downloadStatsImage(id) {
  const blob = await _siBlob(); if (!blob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'activity-' + id + '.png';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

async function shareStatsImage(id) {
  const blob = await _siBlob(); if (!blob) return;
  const file = new File([blob], 'activity-' + id + '.png', { type: 'image/png' });
  const status = document.getElementById('siStatus');
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch {}
  } else {
    downloadStatsImage(id);
    if (status) status.textContent = tr('Sharing isn\'t supported in this browser — downloaded instead.');
  }
}

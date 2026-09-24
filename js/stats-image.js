/* ── STATS IMAGE (activity modal) ──
   A Garmin-style 4:5 summary picture of one activity: name, date (no clock
   times), destination, route shape and key stats. Strava's public API can't
   attach photos to an activity, so the image is previewed here and then
   shared (phone share sheet → Strava) or downloaded to add by hand.
   Privacy: the start is the athlete's home — the route is drawn without a
   basemap and every point within HOME_CLIP_KM of the start is left out. */
const SI_W = 1080, SI_H = 1350, HOME_CLIP_KM = 1;
const SI_FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";
const SI_ORANGE = '#fc4c02';

function _siKm(a, b) {
  const R = 6371, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Route split into segments, with everything near the start (home) removed. */
function _siRouteSegments(a) {
  const pl = a.map && a.map.summary_polyline;
  if (!pl) return [];
  const pts = decodePolyline(pl);
  if (pts.length < 2) return [];
  const home = a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng : pts[0];
  const segs = []; let cur = [];
  pts.forEach(p => {
    if (_siKm(home, p) < HOME_CLIP_KM) { if (cur.length > 1) segs.push(cur); cur = []; }
    else cur.push(p);
  });
  if (cur.length > 1) segs.push(cur);
  return segs;
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
  if (wx && wx.temp_c != null) S.push(['Weather', wx.temp_c + '°C' + (wx.condition ? ' · ' + wx.condition : '')]);
  if (a.pr_count) S.push(['PRs', String(a.pr_count)]);
  return S.slice(0, 9);
}

function drawStatsImage(canvas, a, wx) {
  canvas.width = SI_W; canvas.height = SI_H;
  const ctx = canvas.getContext('2d'), P = 72;

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, SI_H);
  bg.addColorStop(0, '#1a1a1c'); bg.addColorStop(1, '#0c0c0d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SI_W, SI_H);
  ctx.fillStyle = SI_ORANGE; ctx.fillRect(0, 0, SI_W, 10);

  // header: sport + date (day only — never a clock time)
  const when = a.start_date_local || a.start_date;
  const date = when ? new Date(when).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const sport = String(a.sport_type || a.type || 'Activity').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 30px ' + SI_FONT; ctx.fillStyle = SI_ORANGE; ctx.fillText(sport, P, 100);
  ctx.font = '500 30px ' + SI_FONT; ctx.fillStyle = '#9a9a9a';
  ctx.textAlign = 'right'; ctx.fillText(date, SI_W - P, 100); ctx.textAlign = 'left';

  // title
  ctx.font = '800 64px ' + SI_FONT; ctx.fillStyle = '#ffffff';
  const lines = _siWrap(ctx, a.name || 'Activity', SI_W - P * 2, 2);
  let y = 190;
  lines.forEach(l => { ctx.fillText(l, P, y); y += 74; });

  // destination (never the start)
  const rp = a.route_places;
  if (rp && rp.furthest_place) {
    _siPin(ctx, P + 14, y - 20, 30, SI_ORANGE);
    ctx.font = '600 34px ' + SI_FONT; ctx.fillStyle = '#e8e8e8';
    ctx.fillText(rp.furthest_place + '  ·  ' + fmtD(rp.furthest_km_from_start * 1000) + ' out', P + 44, y);
    y += 30;
  }

  // route shape (home clipped out)
  const top = y + 30, statsTop = 860, boxH = statsTop - 40 - top, boxW = SI_W - P * 2;
  const segs = _siRouteSegments(a);
  if (segs.length && boxH > 120) {
    const all = segs.flat();
    const lats = all.map(p => p[0]), lngs = all.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180); // lng degrees are shorter away from the equator
    const spanX = ((maxLng - minLng) || 0.001) * kx, spanY = (maxLat - minLat) || 0.001;
    const sc = Math.min(boxW * 0.9 / spanX, boxH * 0.9 / spanY);
    const ox = P + (boxW - spanX * sc) / 2, oy = top + (boxH - spanY * sc) / 2;
    const X = lng => ox + (lng - minLng) * kx * sc, Y = lat => oy + (maxLat - lat) * sc;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[18, 'rgba(252,76,2,.18)'], [7, SI_ORANGE]].forEach(([lw, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      segs.forEach(s => { ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(X(p[1]), Y(p[0])) : ctx.moveTo(X(p[1]), Y(p[0]))); ctx.stroke(); });
    });
    // turnaround marker at the point furthest from the start
    const home = a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng : all[0];
    const far = all.reduce((m, p) => _siKm(home, p) > _siKm(home, m) ? p : m, all[0]);
    if (rp && rp.furthest_place) _siPin(ctx, X(far[1]), Y(far[0]) - 34, 40, '#ffffff');
  }

  // stats grid (3 columns)
  const stats = _siStats(a, wx), cols = 3, cw = (SI_W - P * 2) / cols, rh = 130;
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(P, statsTop - 20, SI_W - P * 2, 2);
  stats.forEach(([lbl, val], i) => {
    const cx = P + (i % cols) * cw, cy = statsTop + 30 + Math.floor(i / cols) * rh;
    ctx.font = '600 24px ' + SI_FONT; ctx.fillStyle = '#8a8a8a'; ctx.fillText(lbl.toUpperCase(), cx, cy);
    ctx.font = '800 ' + (val.length > 12 ? 36 : 48) + 'px ' + SI_FONT; ctx.fillStyle = '#ffffff';
    ctx.fillText(_siWrap(ctx, val, cw - 20, 1)[0], cx, cy + 56);
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
  const cv = document.createElement('canvas');
  drawStatsImage(cv, a, wx);
  const url = cv.toDataURL('image/png');
  panel._siCanvas = cv;
  panel.innerHTML = '<img class="si-preview" alt="Stats image preview" src="' + url + '">'
    + '<div class="ai-cap-actions">'
    + '<button class="btn btn-primary" type="button" onclick="shareStatsImage(\'' + a.id + '\')">' + tr('Share') + '</button>'
    + '<button class="btn" type="button" onclick="downloadStatsImage(\'' + a.id + '\')">' + tr('Download') + '</button>'
    + '<button class="btn" type="button" onclick="document.getElementById(\'actAiPanel\').innerHTML=\'\'">' + tr('Close') + '</button></div>'
    + '<div class="ai-cap-status" id="siStatus">' + tr('Strava doesn\'t let apps attach photos, so share it to the Strava app or download it and add it to the activity there.') + '</div>';
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

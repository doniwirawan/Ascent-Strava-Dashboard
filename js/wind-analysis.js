/* ── WIND ANALYSIS ────────────────────────────────────────────────────────────
   Joins the ride's GPS route bearings with historical wind (Open-Meteo, free, no
   key — same source the AI coach already uses) to show how much of the ride was
   into a headwind / tailwind / crosswind, and the net wind component along the
   direction of travel. Reframes a "slow" ride that was actually strong.

   Fetches the latlng stream once per ride (on demand) and one cached weather
   lookup. Wind is approximated by the ride's start hour + location. */

const _WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function _windDirName(d) { return _WIND_DIRS[Math.round(((d % 360) / 45)) % 8]; }

// Initial bearing a→b in degrees (a,b = [lat,lng]).
function _windBearing(a, b) {
  const toR = d => d * Math.PI / 180;
  const dLng = toR(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(toR(b[0]));
  const x = Math.cos(toR(a[0])) * Math.sin(toR(b[0])) - Math.sin(toR(a[0])) * Math.cos(toR(b[0])) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Pure: route points + wind (km/h, from-direction °) → head/tail/cross split and
// net along-travel component (km/h, + tailwind / − headwind).
function _windAnalyze(pts, windKmh, windFromDeg) {
  if (!pts || pts.length < 4) return null;
  const windMs = windKmh / 3.6;
  const blowTo = (windFromDeg + 180) % 360;   // direction the wind blows toward
  let head = 0, tail = 0, cross = 0, total = 0, compSum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dy = b[0] - a[0], dx = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180);
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) continue;
    const hd = _windBearing(a, b);
    let rel = Math.abs(hd - windFromDeg) % 360; if (rel > 180) rel = 360 - rel;
    if (rel < 45) head += dist; else if (rel > 135) tail += dist; else cross += dist;
    compSum += windMs * Math.cos((hd - blowTo) * Math.PI / 180) * dist; // + tail, − head
    total += dist;
  }
  if (total <= 0) return null;
  return {
    headPct: Math.round(head / total * 100),
    tailPct: Math.round(tail / total * 100),
    crossPct: Math.round(cross / total * 100),
    netComponentKmh: +(compSum / total * 3.6).toFixed(1),
    windKmh: Math.round(windKmh), windFromDeg: Math.round(windFromDeg),
  };
}

function _windPickRide() {
  return acts.filter(a => isRide(a) && a.id && a.start_latlng && a.start_latlng.length === 2 && (a.moving_time || 0) >= 1200)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0] || null;
}

async function _windLatlng(id) {
  try {
    const raw = await api('/activities/' + id + '/streams?keys=latlng&key_by_type=true');
    const d = raw && raw.latlng && raw.latlng.data;
    if (!d || d.length < 4) return null;
    const step = Math.max(1, Math.floor(d.length / 150));
    const out = []; for (let i = 0; i < d.length; i += step) out.push(d[i]);
    return out;
  } catch { return null; }
}

async function _windWeather(a) {
  const ll = a.start_latlng, when = a.start_date_local || a.start_date || '', date = when.slice(0, 10);
  if (!ll || ll.length !== 2 || !date) return null;
  const hour = parseInt(when.slice(11, 13) || '0', 10) || 0;
  const key = 'wind_wx_' + ll[0].toFixed(2) + '_' + ll[1].toFixed(2) + '_' + date + '_' + hour;
  const cached = localStorage.getItem(key);
  if (cached) { try { return JSON.parse(cached); } catch { return null; } }
  const ageDays = (Date.now() - new Date(date).getTime()) / 86400000;
  const base = ageDays > 5 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const url = base + '?latitude=' + ll[0] + '&longitude=' + ll[1] + '&start_date=' + date + '&end_date=' + date
    + '&hourly=wind_speed_10m,wind_direction_10m&timezone=auto';
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const j = await r.json(); const H = j.hourly;
    if (!H || !H.wind_speed_10m) return null;
    const idx = Math.min(hour, H.wind_speed_10m.length - 1);
    const out = { speed: H.wind_speed_10m[idx], dir: H.wind_direction_10m[idx] };
    try { localStorage.setItem(key, JSON.stringify(out)); } catch {}
    return out;
  } catch { return null; }
}

function _windMarkup(a, w) {
  const rows = [
    { lbl: tr('Headwind'), v: w.headPct, c: '#ef4444' },
    { lbl: tr('Tailwind'), v: w.tailPct, c: '#22c55e' },
    { lbl: tr('Crosswind'), v: w.crossPct, c: '#eab308' },
  ].map(r => `<div class="tl-row"><span class="tl-lbl">${r.lbl}</span><span class="tl-track"><span style="width:${r.v}%;background:${r.c}"></span></span><span class="tl-pct" style="width:40px">${r.v}%</span></div>`).join('');
  const net = w.netComponentKmh;
  const netTxt = net >= 0.3
    ? `<span style="color:#22c55e">≈ +${net.toFixed(1)} ${speedUnit()}</span>${tr(' net tailwind — the wind helped your speed.')}`
    : net <= -0.3
      ? `<span style="color:#ef4444">≈ ${net.toFixed(1)} ${speedUnit()}</span>${tr(' net headwind — you were stronger than the raw speed suggests.')}`
      : tr('roughly neutral — wind mostly crossed your route.');
  const windVal = `<b>${w.windKmh} ${speedUnit()}</b>`, windDir = `<b>${_windDirName(w.windFromDeg)}</b>`;
  return `
    <div class="tr-basis-note" style="margin-bottom:10px">${trf('Wind was {0} from the {1} ({2}°).', windVal, windDir, w.windFromDeg)}</div>
    ${rows}
    <div class="tr-basis-note">${tr('Net wind along your direction of travel: ')}${netTxt}</div>
    <div class="tr-basis-note">${trf('Your direction comes from the GPS route bearings of {0}; wind speed & direction from Open-Meteo historical weather, sampled at the ride’s start hour and location.', a.name || tr('latest ride'))}</div>`;
}

function _trWindHTML() {
  const a = _windPickRide();
  if (!a) return '';
  return `<div class="card tr-wind">
    <div class="tr-chart-title">${tr('Wind Analysis')} <span class="gm-hint">${tr('headwind / tailwind / crosswind')}</span></div>
    <div id="windBody">
      <div class="tr-basis-note">${tr('See how much of your latest ride fought a headwind — sometimes a "slow" ride was actually a strong one.')}</div>
      <button class="tr-ai-btn" style="margin-top:10px" onclick="analyzeWind()">${trf('Analyse {0}', a.name || tr('latest ride'))}</button>
    </div>
  </div>`;
}

let _windRunning = false;
async function analyzeWind() {
  const body = document.getElementById('windBody');
  if (!body || _windRunning) return;
  const a = _windPickRide();
  if (!a) { body.innerHTML = '<div class="tr-basis-note">' + tr('No outdoor GPS ride to analyse yet.') + '</div>'; return; }
  _windRunning = true;
  body.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';
  let pts = null, wx = null;
  try { [pts, wx] = await Promise.all([_windLatlng(a.id), _windWeather(a)]); } catch {}
  if (!pts) { body.innerHTML = '<div class="tr-basis-note">' + tr("Couldn't load the GPS track for this ride.") + '</div>'; _windRunning = false; return; }
  if (!wx) { body.innerHTML = '<div class="tr-basis-note">' + tr("Couldn't load historical wind for this ride's time and place.") + '</div>'; _windRunning = false; return; }
  const w = _windAnalyze(pts, wx.speed, wx.dir);
  body.innerHTML = w ? _windMarkup(a, w) : '<div class="tr-basis-note">' + tr('Not enough GPS detail to analyse wind.') + '</div>';
  _windRunning = false;
}

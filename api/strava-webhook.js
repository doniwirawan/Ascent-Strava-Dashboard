// Strava webhook: when the owner uploads a NEW activity, auto-generate an AI
// title + description (from the real stats, with a light roast) and apply it.
//
//   GET  = Strava's subscription-validation handshake (echo hub.challenge)
//   POST = activity/athlete events. We act only on activity "create" for the
//          owner, ack instantly (<2s, as Strava requires), then do the AI work
//          in the background via waitUntil so Strava never retry-storms.
//
// Required env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, OWNER_REFRESH_TOKEN
//   (the owner's Strava refresh token), OWNER_ATHLETE_ID, DEEPSEEK_API_KEY,
//   STRAVA_WEBHOOK_VERIFY_TOKEN. Optional: AUTO_CAPTION=off to disable.
const { waitUntil } = require('@vercel/functions');
const STRAVA = 'https://www.strava.com/api/v3';
const { nearestLandmark } = require('../js/landmarks.js');

async function ownerAccessToken() {
  const client_id = (process.env.STRAVA_CLIENT_ID || '').replace(/\s+/g, '');
  const client_secret = (process.env.STRAVA_CLIENT_SECRET || '').replace(/\s+/g, '');
  const refresh_token = (process.env.OWNER_REFRESH_TOKEN || '').replace(/\s+/g, '');
  if (!client_id || !client_secret || !refresh_token) return null;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_secret, grant_type: 'refresh_token', refresh_token }),
  });
  if (!r.ok) return null;
  return (await r.json()).access_token || null;
}

const WMO = { 0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'light showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };

async function fetchWeather(a) {
  const ll = a.start_latlng;
  const when = a.start_date_local || a.start_date || '';
  const date = when.slice(0, 10);
  if (!ll || ll.length !== 2 || !date) return a.average_temp != null ? { temp_c: Math.round(a.average_temp) } : null;
  const hour = parseInt(when.slice(11, 13) || '0', 10) || 0;
  const ageDays = (Date.now() - new Date(date).getTime()) / 86400000;
  const base = ageDays > 5 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  try {
    const r = await fetch(base + '?latitude=' + ll[0] + '&longitude=' + ll[1] + '&start_date=' + date + '&end_date=' + date + '&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto');
    if (r.ok) {
      const h = ((await r.json()) || {}).hourly;
      if (h && h.time && h.time.length) {
        let idx = h.time.findIndex(t => t.slice(11, 13) === String(hour).padStart(2, '0'));
        if (idx < 0) idx = Math.min(hour, h.time.length - 1);
        return {
          temp_c: h.temperature_2m ? Math.round(h.temperature_2m[idx]) : null,
          condition: h.weather_code ? (WMO[h.weather_code[idx]] || null) : null,
          wind_kmh: h.wind_speed_10m ? Math.round(h.wind_speed_10m[idx]) : null,
          precip_mm: h.precipitation ? h.precipitation[idx] : null,
        };
      }
    }
  } catch {}
  return a.average_temp != null ? { temp_c: Math.round(a.average_temp) } : null;
}

function decodePolyline(enc) {
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < enc.length) {
    let s = 0, r = 0, b; do { b = enc.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    s = r = 0; do { b = enc.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

// Nominatim reverse geocode → "Desa, Kecamatan" (e.g. "Guwang, Sukawati"). Its usage policy requires a
// real User-Agent from servers.
async function placeName(lat, lng) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=' + lat + '&lon=' + lng,
      { headers: { Accept: 'application/json', 'User-Agent': 'ascent-analytics/1.0 (https://ascent-analytics.doniwirawan.xyz)' } });
    if (!r.ok) return '';
    const a = ((await r.json()) || {}).address || {};
    const local = a.village || a.suburb || a.neighbourhood || a.hamlet || a.town || a.city || a.municipality || a.county || '';
    let area = a.town || a.city || a.municipality || a.county || '';
    if (!area || area === local) area = a.region || a.state_district || a.state || a.country || '';
    return [local, area && area !== local ? area : ''].filter(Boolean).join(', ');
  } catch { return ''; }
}

// Start place + the route point furthest from the start (the turnaround, not
// the finish — which is usually back home).
async function routePlaces(a) {
  const pl = a.map && (a.map.summary_polyline || a.map.polyline);
  if (!pl) return null;
  const pts = decodePolyline(pl);
  if (pts.length < 2) return null;
  // Strava's start_latlng is full precision; the summary polyline is simplified
  const [sLat, sLng] = a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng : pts[0];
  let far = pts[0], farKm = 0;
  pts.forEach(p => { const d = haversineKm(sLat, sLng, p[0], p[1]); if (d > farKm) { farKm = d; far = p; } });
  const start = await placeName(sLat, sLng);
  const out = { start_place: start || null };
  if (farKm >= 2) {
    await new Promise(res => setTimeout(res, 1100)); // Nominatim: max 1 req/s
    const furthest = await placeName(far[0], far[1]);
    if (furthest && furthest !== start) {
      out.furthest_place = furthest; out.furthest_km_from_start = Math.round(farKm);
      const lm = nearestLandmark(far[0], far[1]); if (lm) out.furthest_landmark = lm.n;
    }
  }
  return out;
}

async function generateCaption(a) {
  const KEY = (process.env.DEEPSEEK_API_KEY || '').replace(/\s+/g, '');
  if (!KEY) return null;
  const data = {
    type: a.sport_type || a.type,
    km: +(((a.distance || 0) / 1000).toFixed(1)),
    moving_min: Math.round((a.moving_time || 0) / 60),
    elev_m: Math.round(a.total_elevation_gain || 0),
    avg_kmh: a.average_speed ? +((a.average_speed * 3.6).toFixed(1)) : null,
    max_kmh: a.max_speed ? +((a.max_speed * 3.6).toFixed(1)) : null,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    avg_watts: a.average_watts ? Math.round(a.average_watts) : null,
    prs: a.pr_count || 0,
  };
  const wx = await fetchWeather(a);
  if (wx) data.weather = wx;
  const rp = await routePlaces(a).catch(() => null);
  // destination only — the start is the athlete's home and must never reach the AI
  if (rp && rp.furthest_place) Object.assign(data, { furthest_landmark: rp.furthest_landmark, furthest_place: rp.furthest_place, furthest_km_from_start: rp.furthest_km_from_start });
  const messages = [
    { role: 'system', content:
      'You write Strava activity titles and descriptions in the athlete\'s first person ("I"). Always write in English; translate any Indonesian terms (pagi=morning, siang=midday, sore=evening, malam=night, bersepeda=cycling, lari=run, jalan=walk, renang=swim). Be fun and witty with a light, good-natured roast of the effort. If "furthest_place" is present it is the furthest point I reached (my turnaround/destination) — name it naturally as where I rode to (e.g. "rode out to X"). If "furthest_landmark" is present (e.g. Tanah Lot), that is the landmark I rode to — prefer naming it over the village. NEVER mention, guess or hint at where I started or where I live. If a "weather" field is present, weave the conditions in naturally (the heat, rain, wind). Base everything ONLY on the real numbers provided — never invent. Weave in 2–4 key stats naturally. Title: punchy, under 60 characters. Description: 2–4 short sentences. Return EXACTLY the title on the first line, then a blank line, then the description. No labels, no markdown, no surrounding quotes.' },
    { role: 'user', content: 'Activity data (JSON):\n' + JSON.stringify(data) + '\n\nWrite my new title and description.' },
  ];
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 400, temperature: 0.7 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const text = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || null;
  // always state the destination in the description: "📍 Kintamani, Bangli · 46 km out".
  // Never the start — that's home.
  if (text && rp && rp.furthest_place) {
    return text.trim() + '\n\n📍 ' + (rp.furthest_landmark || rp.furthest_place) + ' · ' + rp.furthest_km_from_start + ' km out';
  }
  return text;
}

async function processActivity(activityId) {
  const token = await ownerAccessToken();
  if (!token) return;
  const ar = await fetch(STRAVA + '/activities/' + activityId, { headers: { Authorization: 'Bearer ' + token } });
  if (!ar.ok) return;
  const act = await ar.json();
  const text = await generateCaption(act);
  if (!text) return;
  const lines = text.trim().split('\n');
  const name = (lines.shift() || '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 100);
  let description = lines.join('\n').trim();
  if (!name) return;
  if (description) description += '\n\n— AI-written by Ascent Analytics';
  await fetch(STRAVA + '/activities/' + activityId, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

module.exports = async (req, res) => {
  // Subscription validation handshake
  if (req.method === 'GET') {
    const q = req.query || {};
    const verify = (process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || '').trim();
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === verify && verify) {
      res.status(200).json({ 'hub.challenge': q['hub.challenge'] });
    } else {
      res.status(403).json({ error: 'verify_failed' });
    }
    return;
  }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const owner = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  const enabled = (process.env.AUTO_CAPTION || 'on').toLowerCase() !== 'off';
  // Only auto-caption a brand-new activity from the owner. We never act on
  // "update" events, so our own PUT can't trigger a loop.
  if (enabled && body.object_type === 'activity' && body.aspect_type === 'create'
      && (!owner || String(body.owner_id) === owner)) {
    waitUntil(processActivity(body.object_id).catch(() => {}));
  }

  // Ack immediately so Strava doesn't retry (it requires a 200 within ~2s).
  res.status(200).json({ ok: true });
};

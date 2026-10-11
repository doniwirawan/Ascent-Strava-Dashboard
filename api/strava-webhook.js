// Strava webhook: when the owner uploads a NEW activity, auto-generate an AI
// title + description (from the real stats, with a light roast) and a coach
// analysis as the private note, and apply them.
//
//   GET  = Strava's subscription-validation handshake (echo hub.challenge)
//   POST = activity/athlete events. We act only on activity "create" for the
//          owner, ack instantly (<2s, as Strava requires), then do the AI work
//          in the background via waitUntil so Strava never retry-storms.
//
// Required env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, OWNER_ATHLETE_ID,
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (owner's refresh token, saved on
//   login — see api/_owner-token.js; OWNER_REFRESH_TOKEN env as fallback), DEEPSEEK_API_KEY,
//   STRAVA_WEBHOOK_VERIFY_TOKEN. Optional: AUTO_CAPTION=off to disable.
const { waitUntil } = require('@vercel/functions');
const STRAVA = 'https://www.strava.com/api/v3';
const { nearestLandmark } = require('../js/landmarks.js');
const { sb, ownerAccessToken, saveActivityAi, logEvent } = require('./_owner-token.js');

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

// The kind of bike used, e.g. "road bike" — from Strava's frame_type (GET /gear/{id}),
// else a guess from the bike's name. Rides only. Never the name: no brands in captions.
const FRAME_TYPE = { 1: 'Mountain', 2: 'Cyclocross', 3: 'Road', 4: 'Time trial', 5: 'Gravel' };
async function bikeInfo(a, token) {
  if (!a.gear_id || !/ride/i.test(a.sport_type || a.type || '')) return undefined;
  let g = a.gear || {};
  try { const r = await fetch(STRAVA + '/gear/' + a.gear_id, { headers: { Authorization: 'Bearer ' + token } }); if (r.ok) g = await r.json(); } catch {}
  const name = g.nickname || g.name || '';
  const n = (name + ' ' + (g.model_name || '')).toLowerCase();
  const type = FRAME_TYPE[g.frame_type] || (/gravel|gvl|\bcx\b|cyclocross/.test(n) ? 'Gravel' : /road|race|aero|sr\d/.test(n) ? 'Road' : undefined);
  return type ? type.toLowerCase() + ' bike' : undefined;
}

async function deepseek(messages, max_tokens) {
  const KEY = (process.env.DEEPSEEK_API_KEY || '').replace(/\s+/g, '');
  if (!KEY) return null;
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens, temperature: 0.7 }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || null;
}

// Coach read for the private note (only the athlete sees it) — same brief as the
// dashboard's "Performance analysis", as plain text since Strava shows no markdown.
// Always Bahasa Indonesia (titles/captions are always English).
// Returns { note, analysis } — the analysis (no sign-off) is kept for the dashboard.
async function generateNote(data) {
  const text = await deepseek([
    { role: 'system', content:
      'You are an expert cycling and running coach. Analyse ONE activity using ONLY the numbers provided — never invent data. '
      + 'Address the athlete directly as "kamu". Always write entirely in natural Bahasa Indonesia (keep numbers, units and place names unchanged) — the private note is always Indonesian, even though captions are English. '
      + 'Plain text, no markdown: a one-line "Kesimpulan:", then "Kelebihan:" with 2–3 lines starting "• ", '
      + '"Perlu diperbaiki:" with 2–3 lines starting "• ", and one concrete "Lain kali:" tip. Reference the real stats (speed, HR, power, elevation). If watts_source is "power meter", the watts are measured — always use the power numbers (avg_watts, np_watts normalized power, max_watts, kj) as key stats. If watts_source is a Strava estimate, the watts are a guess: call them estimated and never build the story around them. Weather, if present, is an approximate estimate — treat it as uncertain. '
      + 'Never mention where the athlete started or lives. Keep it under ~160 words. No preamble.' },
    { role: 'user', content: 'Activity data (JSON):\n' + JSON.stringify(data) + '\n\nAnalyse my performance.' },
  ], 450);
  if (!text) return null;
  const analysis = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  return { analysis, note: (analysis + '\n\n— AI analysis by Ascent').slice(0, 2000) };
}

// No AI (out of credit, no key, provider down): the dashboard's "Stats title &
// description" template (aiStatsTemplate in js/ai-coach.js), in km.
function statsCaption(a, wx, rp) {
  const ride = /ride/i.test(a.sport_type || a.type || '');
  const when = a.start_date_local || a.start_date || '';
  const h = parseInt(when.slice(11, 13) || '0', 10) || 0;
  const tod = h < 11 ? 'Morning' : h < 15 ? 'Afternoon' : h < 19 ? 'Evening' : 'Night';
  const type = String(a.sport_type || a.type || 'Activity').replace(/([a-z])([A-Z])/g, '$1 $2');
  const km = m => (m / 1000).toFixed(1) + ' km';
  const hms = s => { const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60); return hh ? hh + 'h ' + String(mm).padStart(2, '0') + 'm' : mm + 'm'; };
  const title = (tod + ' ' + type + ' · ' + km(a.distance || 0) + (a.total_elevation_gain > 100 ? ' · ' + Math.round(a.total_elevation_gain) + ' m' : '')).slice(0, 100);
  const L = ['Distance: ' + km(a.distance || 0)];
  if (rp && rp.furthest_place) L.push('Destination: ' + (rp.furthest_landmark || rp.furthest_place) + ' (' + rp.furthest_km_from_start + ' km out)');
  if (a.moving_time) L.push('Time: ' + hms(a.moving_time));
  if (a.total_elevation_gain) L.push('Elevation: ' + Math.round(a.total_elevation_gain) + ' m');
  if (a.average_speed) L.push(ride ? 'Avg speed: ' + (a.average_speed * 3.6).toFixed(1) + ' km/h'
    : 'Avg pace: ' + (s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0'))(1000 / a.average_speed) + ' /km');
  if (a.max_speed && ride) L.push('Max speed: ' + (a.max_speed * 3.6).toFixed(1) + ' km/h');
  if (a.average_heartrate) L.push('Avg HR: ' + Math.round(a.average_heartrate) + ' bpm');
  if (a.average_watts) L.push('Avg power: ' + Math.round(a.average_watts) + ' W' + (a.device_watts === true ? '' : ' (est.)'));
  if (a.average_cadence) L.push('Cadence: ' + (ride ? Math.round(a.average_cadence) + ' rpm' : Math.round(a.average_cadence * 2) + ' spm'));
  if (a.kilojoules) L.push('Energy: ' + Math.round(a.kilojoules).toLocaleString('en') + ' kJ');
  if (wx && (wx.temp_c != null || wx.condition)) {
    L.push('Weather: ' + [wx.temp_c != null ? wx.temp_c + '°C' : '', wx.condition || ''].filter(Boolean).join(', ')
      + (wx.wind_kmh ? ', wind ' + wx.wind_kmh + ' km/h' : ''));
  }
  return title + '\n\n' + L.join('\n');
}

async function generateCaption(a, token, withNote = true) {
  const data = {
    type: a.sport_type || a.type,
    km: +(((a.distance || 0) / 1000).toFixed(1)),
    moving_min: Math.round((a.moving_time || 0) / 60),
    stopped_min: a.elapsed_time && a.moving_time ? Math.max(0, Math.round((a.elapsed_time - a.moving_time) / 60)) : null,
    elev_m: Math.round(a.total_elevation_gain || 0),
    avg_kmh: a.average_speed ? +((a.average_speed * 3.6).toFixed(1)) : null,
    max_kmh: a.max_speed ? +((a.max_speed * 3.6).toFixed(1)) : null,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    avg_watts: a.average_watts ? Math.round(a.average_watts) : null,
    watts_source: a.average_watts ? (a.device_watts === true ? 'power meter' : 'Strava estimate (no power meter)') : undefined,
    np_watts: a.device_watts === true && a.weighted_average_watts ? Math.round(a.weighted_average_watts) : undefined,
    max_watts: a.device_watts === true && a.max_watts ? Math.round(a.max_watts) : undefined,
    kj: a.kilojoules ? Math.round(a.kilojoules) : undefined,
    // Strava stores run/walk cadence per leg — double it for steps/min
    avg_cadence: a.average_cadence ? (/ride/i.test(a.sport_type || a.type || '') ? Math.round(a.average_cadence) + ' rpm' : Math.round(a.average_cadence * 2) + ' spm') : null,
    prs: a.pr_count || 0,
    bike: token ? await bikeInfo(a, token) : undefined,
  };
  const wx = await fetchWeather(a);
  if (wx) data.weather = wx;
  const rp = await routePlaces(a).catch(() => null);
  // destination only — the start is the athlete's home and must never reach the AI
  if (rp && rp.furthest_place) Object.assign(data, { furthest_landmark: rp.furthest_landmark, furthest_place: rp.furthest_place, furthest_km_from_start: rp.furthest_km_from_start });
  const messages = [
    { role: 'system', content:
      'You write Strava activity titles and descriptions in the athlete\'s first person ("I"). Always write in English; translate any Indonesian terms (pagi=morning, siang=midday, sore=evening, malam=night, bersepeda=cycling, lari=run, jalan=walk, renang=swim). ROAST me in first person like a friend in the group chat who just opened my file: specific, sharp, funny, PG-13. Find the weakest or most ridiculous number (slow average, long stopped time, low cadence, short distance, barely any climbing) and go after it; twist the good numbers into backhanded compliments; absurd comparisons, one punchline per sentence. Never mock body, weight, looks, age, gender, race, religion or money; no slurs. If "furthest_place" is present it is the furthest point I reached (my turnaround/destination) — name it naturally as where I rode to (e.g. "rode out to X"). If "furthest_landmark" is present (e.g. Tanah Lot), that is the landmark I rode to — prefer naming it over the village. If a "bike" field is present, that is the kind of bike I rode (e.g. road bike, gravel bike) — mention it naturally when it fits (e.g. "took the gravel bike out"); never name a bike brand or model. If "avg_cadence" is present, always mention it. If watts_source is "power meter", the watts are measured — always use the power numbers (avg_watts, np_watts normalized power, max_watts, kj) as key stats. If watts_source is a Strava estimate, the watts are a guess: call them estimated and never build the story around them. NEVER mention, guess or hint at where I started or where I live. If a "weather" field is present, weave the conditions in naturally (the heat, rain, wind). Base everything ONLY on the real numbers provided — never invent. Stopped time is NOT a café, coffee, food, nap or any other stop — I never told you why I stopped, so never say or joke about where or why (just roast the minutes). Weave in 2–4 key stats naturally. Title: punchy, under 60 characters. Description: 2–4 short sentences. Return EXACTLY the title on the first line, then a blank line, then the description. No labels, no markdown, no surrounding quotes.' },
    { role: 'user', content: 'Activity data (JSON):\n' + JSON.stringify(data) + '\n\nWrite my new title and description.' },
  ];
  const [text, nt] = await Promise.all([deepseek(messages, 400), withNote ? generateNote(data).catch(() => null) : null]);
  // always state the destination in the description: "📍 Kintamani, Bangli · 46 km out".
  // Never the start — that's home.
  if (!text) return { text: statsCaption(a, wx, rp), stats: true }; // AI unavailable → stats caption, no note
  const caption = rp && rp.furthest_place
    ? text.trim() + '\n\n📍 ' + (rp.furthest_landmark || rp.furthest_place) + ' · ' + rp.furthest_km_from_start + ' km out'
    : text;
  return { text: caption, note: nt && nt.note, analysis: nt && nt.analysis };
}

// Which bike each auto-caption was written for (Supabase auto_captions), so
// changing the bike afterwards re-captions it — unless I've renamed it myself.
async function captionRecord(id, rec) {
  const s = sb(); if (!s) return null;
  const url = s.url.replace(/owner_tokens$/, 'auto_captions');
  try {
    if (rec) {
      await fetch(url + '?on_conflict=activity_id', { method: 'POST', headers: { ...s.H, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ activity_id: String(id), gear_id: rec.gear_id || null, name: rec.name, updated_at: new Date().toISOString() }) });
      return null;
    }
    const r = await fetch(url + '?activity_id=eq.' + encodeURIComponent(id) + '&select=gear_id,name', { headers: s.H });
    return r.ok ? ((await r.json())[0] || null) : null;
  } catch { return null; }
}

// → a short outcome for the webhook_events log. A new activity gets title +
// description + private note; a re-caption (bike change) rewrites only the title
// and description and leaves the private note as it is.
async function processActivity(activityId, isUpdate, updates, userToken, captionOnly) {
  const withNote = !isUpdate && !captionOnly;
  const token = userToken || await ownerAccessToken();
  if (!token) return 'skipped: no owner token with write access — log in to the dashboard once';
  const ar = await fetch(STRAVA + '/activities/' + activityId, { headers: { Authorization: 'Bearer ' + token } });
  if (!ar.ok) return 'failed: could not read the activity (' + ar.status + ')';
  const act = await ar.json();
  if (isUpdate) {
    // our own PUT fires an update too — only act when the bike really changed
    const rec = await captionRecord(activityId);
    if (rec) {
      if (rec.name !== act.name) return 'skipped: title was renamed by hand';
      if ((rec.gear_id || null) === (act.gear_id || null)) return 'skipped: bike unchanged';
    } else {
      // captioned before this log existed, or from the dashboard: re-caption a recent
      // AI-written ride once (then the record above takes over) — never a manual rename
      const recent = Date.now() - new Date(act.start_date).getTime() < 2 * 86400000;
      if (updates && updates.title) return 'skipped: title change';
      if (!recent || !/AI-written by Ascent/.test(act.description || '')) return 'skipped: not a recent AI-captioned activity';
    }
  }
  const { text, note, analysis, stats } = (await generateCaption(act, token, withNote)) || {};
  if (!text) return 'failed: no caption could be built';
  const lines = text.trim().split('\n');
  const name = (lines.shift() || '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 100);
  let description = lines.join('\n').trim();
  if (!name) return 'failed: AI returned no title';
  if (description) description += stats ? '\n\n— by Ascent Analytics' : '\n\n— AI-written by Ascent Analytics';
  const put = body => fetch(STRAVA + '/activities/' + activityId, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // private_note isn't in Strava's documented update API — if it's refused, still save the caption
  let r = await put(note ? { name, description, private_note: note } : { name, description });
  let noteOk = !!note && r.ok;
  if (!r.ok && note) r = await put({ name, description });
  if (!r.ok) return 'failed: Strava refused the update (' + r.status + ')';
  if (note && !noteOk) noteOk = (await put({ private_note: note })).ok; // one more go on its own
  await captionRecord(activityId, { gear_id: act.gear_id, name });
  // so the dashboard shows it when the activity is opened
  await saveActivityAi(activityId, { caption_title: name, caption_desc: description, ...(analysis ? { analysis } : {}) });
  if (stats) return 'stats caption (AI unavailable — out of credit or down; no private note): ' + name;
  return (withNote ? 'captioned' + (noteOk ? ' + private note' : ' (private note failed)') : 're-captioned (private note kept)') + ': ' + name;
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
  // Auto-caption a brand-new activity from the owner; on "update", re-caption
  // only if the bike changed since (processActivity checks, so our own PUT can't loop).
  if (enabled && body.object_type === 'activity' && ['create', 'update'].includes(body.aspect_type)
      && (!owner || String(body.owner_id) === owner)) {
    if (body.aspect_type === 'update') console.log('strava update event', body.object_id, JSON.stringify(body.updates || {}));
    waitUntil((async () => {
      const done = await logEvent(body.aspect_type, body.object_id);
      await done(await processActivity(body.object_id, body.aspect_type === 'update', body.updates)
        .catch(e => 'failed: ' + ((e && e.message) || e)));
    })());
  }

  // Ack immediately so Strava doesn't retry (it requires a 200 within ~2s).
  res.status(200).json({ ok: true });
};

// for the activity pop-up's bike picker (api/ai-chats.js action 'set-bike')
module.exports.processActivity = processActivity;
module.exports.captionRecord = captionRecord;

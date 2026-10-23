// Personal REST API — the owner's own data for their own apps (phone, scripts).
//
//   /api/v1/*  is rewritten to /api/stats?v1=* (vercel.json), which hands the
//   request here — so this adds no Serverless Function (the Hobby plan allows 12).
//
// Two kinds of auth:
//   • Data (GET):    Authorization: Bearer asc_…   — a personal API token
//   • Tokens:        X-Strava-Token: <Strava access token of OWNER_ATHLETE_ID>
//                    (what the dashboard's Settings → Personal API sends)
//
// Tokens are random, shown once, and stored only as a SHA-256 hash in the
// Supabase table api_tokens (RLS on, no policies: service-role only). Revoked
// tokens stop working immediately. Everything is read-only and never cached.
// API.md has the full reference.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.
// Optional: NEON_PURCHASES_URL (purchases, bikes), STRAVA_CLIENT_ID/SECRET (live Strava).
const crypto = require('crypto');
const { ownerAccessToken } = require('./_owner-token.js');

const env = k => (process.env[k] || '').replace(/\s+/g, '').replace(/\\n$/, '');
const sbUrl = () => env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/';
const sbH = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'), 'Content-Type': 'application/json' });
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

class HttpError extends Error { constructor(status, code, extra) { super(code); this.status = status; this.body = { error: code, ...(extra || {}) }; } }

async function sb(path, opts = {}) {
  const r = await fetch(sbUrl() + path, { ...opts, headers: { ...sbH(), ...(opts.headers || {}) } });
  if (!r.ok) throw new HttpError(502, 'store_unavailable', { status: r.status });
  const text = await r.text();                      // writes with return=minimal answer 201 + empty body
  return text ? JSON.parse(text) : null;
}

async function neon(id) {
  const db = env('NEON_PURCHASES_URL');
  if (!db) throw new HttpError(501, 'not_configured', { need: ['NEON_PURCHASES_URL'] });
  const r = await fetch('https://' + new URL(db).hostname + '/sql', {
    method: 'POST', headers: { 'Neon-Connection-String': db, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select data, updated_at from purchase_data where id = $1', params: [id] }),
  });
  if (!r.ok) throw new HttpError(502, 'store_unavailable');
  return ((await r.json()).rows || [])[0] || null;
}

// Live Strava calls with the owner's own token (memoised per warm instance).
let stravaTok = { at: 0, t: null };
async function strava(path) {
  if (!stravaTok.t || Date.now() - stravaTok.at > 3600000) stravaTok = { at: Date.now(), t: await ownerAccessToken() };
  if (!stravaTok.t) throw new HttpError(502, 'strava_unavailable');
  const r = await fetch('https://www.strava.com/api/v3' + path, { headers: { Authorization: 'Bearer ' + stravaTok.t } });
  if (r.status === 404) throw new HttpError(404, 'not_found');
  if (r.status === 429) throw new HttpError(429, 'strava_rate_limited');
  if (!r.ok) throw new HttpError(502, 'strava_unavailable', { status: r.status });
  return r.json();
}

/* ── auth ── */
async function requireOwnerStrava(req) {
  const t = req.headers['x-strava-token'];
  if (!t) throw new HttpError(401, 'missing_strava_token');
  let id = null;
  try { const r = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: 'Bearer ' + t } }); if (r.ok) id = (await r.json()).id; } catch {}
  if (!id) throw new HttpError(401, 'invalid_strava_token');
  if (String(id) !== env('OWNER_ATHLETE_ID')) throw new HttpError(403, 'not_authorized');
}
async function requireApiToken(req) {
  const m = /^Bearer\s+(asc_[A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'missing_api_token', { hint: 'Authorization: Bearer asc_…' });
  const rows = await sb('api_tokens?token_hash=eq.' + sha(m[1]) + '&revoked_at=is.null&select=id');
  if (!rows.length) throw new HttpError(401, 'invalid_api_token');
  // record use without slowing the response
  sb('api_tokens?id=eq.' + rows[0].id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => {});
}

/* ── token management (owner's Strava token) ── */
async function tokens(req, id) {
  await requireOwnerStrava(req);
  if (req.method === 'GET' && !id) return { tokens: await sb('api_tokens?select=id,name,prefix,created_at,last_used_at,revoked_at&order=created_at.desc') };
  if (req.method === 'POST' && !id) {
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const name = String((body && body.name) || 'My app').slice(0, 60);
    const token = 'asc_' + crypto.randomBytes(32).toString('base64url');
    const [row] = await sb('api_tokens', { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, token_hash: sha(token), prefix: token.slice(0, 10) }) });
    return { token, id: row.id, name: row.name, prefix: row.prefix, created_at: row.created_at, note: 'Shown once. Store it in your app; it cannot be read back.' };
  }
  if (req.method === 'DELETE' && id) {
    await sb('api_tokens?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
    return { ok: true, revoked: id };
  }
  throw new HttpError(405, 'method_not_allowed');
}

/* ── data ── */
let cacheMemo = { at: 0, row: null };
async function cachedActivities() {
  if (!cacheMemo.row || Date.now() - cacheMemo.at > 60000) {
    const [row] = await sb('strava_cache?id=eq.' + encodeURIComponent(env('OWNER_ATHLETE_ID')) + '&select=activities,synced_at');
    cacheMemo = { at: Date.now(), row: row || { activities: [], synced_at: null } };
  }
  return cacheMemo.row;
}
const when = a => a.start_date_local || a.start_date || '';

async function activities(q) {
  const { activities: all, synced_at } = await cachedActivities();
  let list = (all || []).filter(a => a && when(a));
  if (q.type) { const t = String(q.type).toLowerCase().split(','); list = list.filter(a => t.includes(String(a.sport_type || a.type).toLowerCase())); }
  if (q.after) list = list.filter(a => when(a).slice(0, 10) >= q.after);
  if (q.before) list = list.filter(a => when(a).slice(0, 10) < q.before);
  list.sort((x, y) => when(y).localeCompare(when(x)));
  const limit = Math.min(Math.max(+q.limit || 50, 1), 500), offset = Math.max(+q.offset || 0, 0);
  return { synced_at, total: list.length, limit, offset, activities: list.slice(offset, offset + limit) };
}

async function activity(id, q) {
  const { activities: all } = await cachedActivities();
  const a = (all || []).find(x => String(x.id) === String(id));
  const out = { activity: a || (q.live === '1' ? await strava('/activities/' + encodeURIComponent(id)) : null) };
  if (!out.activity) throw new HttpError(404, 'not_found', { hint: 'Not in the cached activities; add ?live=1 to ask Strava.' });
  // detail=1: Strava's full activity — segment efforts and PRs (no coordinates)
  if (q.detail === '1') {
    const d = await strava('/activities/' + encodeURIComponent(id));
    const eff = e => ({ name: e.name, elapsed_time: e.elapsed_time, moving_time: e.moving_time, distance: e.distance, pr_rank: e.pr_rank || null,
      kom_rank: e.kom_rank || null, average_watts: e.average_watts || null, average_heartrate: e.average_heartrate || null,
      average_grade: e.segment ? e.segment.average_grade : null, climb_category: e.segment ? e.segment.climb_category : null });
    out.detail = { description: d.description || '', calories: d.calories || null, device_name: d.device_name || '',
      achievement_count: d.achievement_count || 0, pr_count: d.pr_count || 0,
      segment_efforts: (d.segment_efforts || []).map(eff), best_efforts: (d.best_efforts || []).map(eff) };
  }
  // photos=1: the activity's photos (largest size, caption, date; no photo locations)
  if (q.photos === '1') {
    const ph = await strava('/activities/' + encodeURIComponent(id) + '/photos?size=1024&photo_sources=true');
    out.photos = (ph || []).map(p => ({ url: p.urls ? (p.urls['1024'] || Object.values(p.urls)[0]) : null, caption: p.caption || '',
      created_at: p.created_at_local || p.created_at || null, video: !!p.video_url, sizes: p.sizes && p.sizes['1024'] || null })).filter(p => p.url);
  }
  if (q.streams) {
    const keys = String(q.streams === '1' ? 'time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth' : q.streams).replace(/[^a-z_,]/g, '');
    out.streams = await strava('/activities/' + encodeURIComponent(id) + '/streams?keys=' + keys + '&key_by_type=true');
  }
  return out;
}

// POST /sleep — nights from the Android app (Health Connect, e.g. JoyoFit + a
// Huawei watch). Body { source, nights: [{ date, asleep, deep, light, rem, wake,
// nap, wakeups, bed, up, tib, eff, napt, steps, dist, cal, rhr, hrv, … }] } in the
// same columns as the export import (js/sleep-import.js). Merged into the
// sleep_data row by date: new nights are added; nights that came from the Huawei
// export are never overwritten, only their empty columns are filled in (a watch
// day can add the blood oxygen the export lacked); nights an earlier app sync
// wrote are replaced (hc_dates).
const SLEEP_FIELDS = ['asleep', 'deep', 'light', 'rem', 'wake', 'nap', 'wakeups', 'bed', 'up', 'tib', 'eff', 'napt', 'steps', 'dist', 'cal', 'rhr', 'hrv',
  'hrmin', 'hrmax', 'hrvmin', 'hrvmax', 'spo2', 'spo2min', 'stress', 'smin', 'smax', 'scnt', 'active', 'floors'];
async function saveSleep(req) {
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const nights = Array.isArray(body && body.nights) ? body.nights.filter(n => n && /^\d{4}-\d{2}-\d{2}$/.test(n.date)) : null;
  if (!nights || !nights.length) throw new HttpError(400, 'bad_request', { need: ['nights[].date'] });
  const owner = env('OWNER_ATHLETE_ID');
  const [row] = await sb('sleep_data?id=eq.' + encodeURIComponent(owner) + '&select=data');
  let data = row && row.data && Array.isArray(row.data.rows) ? row.data : null;
  if (!data) { try { data = JSON.parse(JSON.stringify(require('../private/sleep.json'))); } catch { throw new HttpError(404, 'no_sleep_data'); } }
  const col = Object.fromEntries(data.cols.map((c, i) => [c, i]));
  const byDate = new Map(data.rows.map(r => [r[0], r]));
  const hc = new Set(data.hc_dates || []);
  let added = 0, updated = 0, kept = 0, filled = 0;
  for (const n of nights) {
    let r = byDate.get(n.date);
    if (r && r[col.asleep] > 0 && !hc.has(n.date)) {                          // the export's night wins…
      kept++;
      let f = 0;                                                              // …but its empty columns are filled
      SLEEP_FIELDS.forEach(k => { if (k in col && n[k] != null && r[col[k]] == null) { r[col[k]] = n[k]; f++; } });
      if (f) filled++;
      continue;
    }
    if (!r) { r = data.cols.map(() => null); r[0] = n.date; ['asleep', 'deep', 'light', 'rem', 'wake', 'nap'].forEach(k => { r[col[k]] = 0; }); data.rows.push(r); byDate.set(n.date, r); added++; }
    else updated++;
    SLEEP_FIELDS.forEach(k => { if (k in col && n[k] != null) r[col[k]] = n[k]; });
    hc.add(n.date);
  }
  data.rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  data.hc_dates = [...hc].sort();
  data.hc_source = String((body && body.source) || 'Health Connect').slice(0, 80);
  data.hc_synced_at = new Date().toISOString();
  await sb('sleep_data?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: owner, data, synced_at: new Date().toISOString() }) });
  return { ok: true, added, updated, kept_from_export: kept, filled_in_export: filled, last: data.rows[data.rows.length - 1][0] };
}

async function sleep() {
  const [row] = await sb('sleep_data?id=eq.' + encodeURIComponent(env('OWNER_ATHLETE_ID')) + '&select=data');
  if (row && row.data) return row.data;
  try { return require('../private/sleep.json'); } catch { throw new HttpError(404, 'no_sleep_data'); }
}

const HUAWEI_COLS = 'record_id,sport_type,sport,start_time,end_time,tz,duration_s,distance_m,climb_m,min_alt_m,max_alt_m,avg_hr,max_hr,calories,steps,polyline,start_latlng,strava_id,strava_kind';
async function huawei(id) {
  const base = 'huawei_workouts?athlete_id=eq.' + encodeURIComponent(env('OWNER_ATHLETE_ID'));
  if (!id) return { workouts: await sb(base + '&select=' + HUAWEI_COLS + '&order=start_time.desc') };
  const [row] = await sb(base + '&record_id=eq.' + encodeURIComponent(id) + '&select=*');
  if (!row) throw new HttpError(404, 'not_found');
  return { workout: row };
}

async function purchases(q) {
  const row = await neon('items');
  let items = (row && row.data && row.data.items) || [];
  if (q.category) items = items.filter(x => String(x.category).toLowerCase() === String(q.category).toLowerCase());
  if (q.after) items = items.filter(x => (x.date || '') >= q.after);
  if (q.before) items = items.filter(x => (x.date || '') < q.before);
  if (q.cancelled !== '1') items = items.filter(x => !x.cancelled);
  return { updated_at: row && row.updated_at, total: items.length, paid_total: items.reduce((s, x) => s + (x.paid || 0), 0), items };
}

async function bikes() {
  const [cfg, items] = await Promise.all([neon('bikes'), neon('items')]);
  const c = (cfg && cfg.data) || {};
  const list = c.bikes && c.bikes.length ? c.bikes : [{ id: 'camp', name: 'Camp SR3D', kind: 'Road' }, { id: 'mosso', name: 'Mosso 735 GVL', kind: 'Gravel' }, { id: 'xtrada', name: 'Polygon Xtrada 6', kind: 'MTB' }];
  const key = i => [i.site, i.order_id, i.item, i.variant].join('|').slice(0, 400);
  const all = ((items && items.data && items.data.items) || []).filter(i => i.category === 'Cycling' && !i.cancelled);
  // same as finance app src/lib/bikes.ts: saved assignment, else its first-guess rules
  const RULES = [[/camp roadbike|sr3d/i, 'camp'], [/think ?rider|goldix aero chainring|fc-r7100/i, 'camp'], [/mosso gravel|735 ?gvl|grx/i, 'mosso'], [/xtrada/i, 'xtrada']];
  const place = i => { const a = (c.assign || {})[key(i)]; if (a) return a; const t = i.item + ' ' + i.variant; for (const [re, b] of RULES) if (re.test(t)) return b; return i.sub === 'Tools & maintenance' ? 'shared' : null; };
  const parts = id => all.filter(i => place(i) === id);
  return { bikes: list.map(b => ({ ...b, spent: parts(b.id).reduce((s, i) => s + (i.paid || 0), 0), parts: parts(b.id) })),
    shared: parts('shared'), note: 'Parts are the purchases assigned to each bike on finance.doniwirawan.xyz/bikes.' };
}

// Segments, live from Strava: starred, one segment, your effort history on it, and your KOMs.
async function segments(id, sub) {
  if (!id) return { segments: await strava('/segments/starred?per_page=200') };
  const seg = '/segments/' + encodeURIComponent(id);
  if (sub === 'efforts') {
    const list = await strava(seg + '/all_efforts?per_page=200');
    return { efforts: (list || []).map(e => ({ id: e.id, activity_id: e.activity && e.activity.id, elapsed_time: e.elapsed_time, moving_time: e.moving_time,
      start_date_local: e.start_date_local, average_watts: e.average_watts || null, average_heartrate: e.average_heartrate || null, pr_rank: e.pr_rank || null, kom_rank: e.kom_rank || null })) };
  }
  return { segment: await strava(seg) };
}

async function koms() {
  let list = [];
  for (let page = 1; page <= 4; page++) {
    const r = await strava('/athletes/' + env('OWNER_ATHLETE_ID') + '/koms?page=' + page + '&per_page=50');
    if (!r || !r.length) break;
    list = list.concat(r);
    if (r.length < 50) break;
  }
  return { koms: list };
}

async function ai(sub) {
  if (sub === 'chats') return { chats: await sb('ai_chats?athlete_id=eq.' + encodeURIComponent(env('OWNER_ATHLETE_ID')) + '&select=id,title,ts,messages&order=ts.desc&limit=500') };
  return { activities: await sb('activity_ai?select=*') };
}

// The Android app's self-update: the newest build in the private storage bucket
// (android/publish-update.mjs puts it there) and a 10-minute signed link to it.
async function appRelease() {
  const store = env('SUPABASE_URL').replace(/\/$/, '') + '/storage/v1/';
  const r = await fetch(store + 'object/private-apps/ascent-latest.json', { headers: sbH() });
  if (!r.ok) throw new HttpError(404, 'no_release');
  const meta = await r.json();
  const s = await fetch(store + 'object/sign/private-apps/' + encodeURIComponent(meta.file), {
    method: 'POST', headers: sbH(), body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!s.ok) throw new HttpError(502, 'store_unavailable');
  return { ...meta, url: store.replace(/\/$/, '') + (await s.json()).signedURL };
}

const INDEX = {
  name: 'Ascent personal API', version: 1, auth: 'Authorization: Bearer asc_… (create one in Settings → Personal API)',
  endpoints: {
    'GET /api/v1/me': 'Your Strava profile, bikes and shoes (live from Strava)',
    'GET /api/v1/activities?limit=&offset=&type=&after=YYYY-MM-DD&before=': 'Cached activities, newest first (full Strava summaries)',
    'GET /api/v1/activities/{id}?streams=1&detail=1&photos=1&live=1': 'One activity; streams=1 (or a key list) adds its streams from Strava, detail=1 its segment efforts and PRs, photos=1 its photos',
    'GET /api/v1/stats': 'Totals, YTD, bests, by month / sport, calendar, streak, fitness',
    'GET /api/v1/strava-stats': 'Strava’s own all-time / YTD / 4-week totals',
    'GET /api/v1/sleep': 'Sleep nights from the Huawei export (and the Android app)',
    'POST /api/v1/sleep': 'Add nights { nights: [{ date, asleep, deep, light, rem, … }] } — the Android app’s Health Connect sync',
    'GET /api/v1/huawei': 'Huawei workouts (GET /api/v1/huawei/{record_id} for one with its track)',
    'GET /api/v1/purchases?category=&after=&before=&cancelled=1': 'Purchases from the finance app',
    'GET /api/v1/bikes': 'Each bike and what its parts cost',
    'GET /api/v1/ai': 'AI analyses and captions per activity (GET /api/v1/ai/chats for coach chats)',
    'GET /api/v1/segments': 'Starred segments (GET /api/v1/segments/{id} for one, /segments/{id}/efforts for your effort history on it)',
    'GET /api/v1/koms': 'Your KOM / QOM / CR segments',
    'GET /api/v1/app': 'Newest Android build: versionCode, versionName and a 10-minute download link',
  },
};

async function route(req, parts) {
  const [head, id, sub] = parts;
  if (head === 'tokens') return tokens(req, id);
  // the one write: the Android app adding sleep nights from Health Connect
  if (head === 'sleep' && req.method === 'POST') { await requireApiToken(req); return saveSleep(req); }
  if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
  await requireApiToken(req);
  const q = req.query || {};
  switch (head || '') {
    case '': return INDEX;
    case 'me': return strava('/athlete');
    case 'activities': return id ? activity(id, q) : activities(q);
    case 'stats': { const { status, body } = await require('./stats.js').loadStats(); if (status !== 200) throw new HttpError(status, body.error || 'stats_unavailable'); return body; }
    case 'strava-stats': return strava('/athletes/' + env('OWNER_ATHLETE_ID') + '/stats');
    case 'sleep': return sleep();
    case 'huawei': return huawei(id);
    case 'purchases': return purchases(q);
    case 'bikes': return bikes();
    case 'ai': return ai(id);
    case 'segments': return segments(id, sub);
    case 'koms': return koms();
    case 'app': return appRelease();
  }
  throw new HttpError(404, 'unknown_endpoint', { see: '/api/v1' });
}

module.exports = async (req, res) => {
  // Bearer tokens, no cookies, so any origin may call it (CORS isn't auth).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-strava-token');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY') || !env('OWNER_ATHLETE_ID')) { res.status(500).json({ error: 'not_configured' }); return; }
  const parts = String((req.query && req.query.v1) || '').split('/').filter(Boolean);
  try { res.status(200).json(await route(req, parts)); }
  catch (e) {
    if (e instanceof HttpError) res.status(e.status).json(e.body);
    else { console.error('v1', parts.join('/'), e); res.status(500).json({ error: 'server_error' }); }
  }
};

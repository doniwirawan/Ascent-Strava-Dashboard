const CONFIG = {
  clientId:     '__STRAVA_CLIENT_ID__', // public; used to build the authorize URL
  // clientSecret is intentionally NOT shipped to the browser — the token
  // exchange/refresh happens server-side in /api/strava-token
  accessToken:  localStorage.getItem('strava_access_token')  || '',
  refreshToken: localStorage.getItem('strava_refresh_token') || ''
};

/* ── CACHE — client-side only ──
   The app stores your activities only in your own browser (localStorage); no
   copy is kept on any server. The Supabase remote cache is intentionally
   disabled so "everything runs in your browser" is literally true. Flip
   _haveRemote back to the env check to re-enable cross-device caching. */
const _sbUrl = '__SUPABASE_URL__';
const _sbKey = '__SUPABASE_KEY__';
const _haveRemote = false;
const _fnUrl = _haveRemote ? _sbUrl.replace(/\/$/, '') + '/functions/v1/strava-cache' : null;
const _fnImg = _haveRemote ? _sbUrl.replace(/\/$/, '') + '/functions/v1/img' : null; // image download proxy

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── localStorage cache (per athlete, survives offline / no Supabase) ──
function _lsKey(athleteId) { return 'strava_acts_' + athleteId; }

function lsCacheLoad(athleteId) {
  try {
    const raw = localStorage.getItem(_lsKey(athleteId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (Date.now() - new Date(o.synced_at).getTime() > CACHE_TTL_MS) return null;
    return o.activities;
  } catch { return null; }
}

function lsCacheSave(athleteId, activities, syncedAt) {
  try {
    localStorage.setItem(_lsKey(athleteId), JSON.stringify({
      activities, synced_at: syncedAt || new Date().toISOString()
    }));
  } catch { /* quota / private mode — non-fatal */ }
}

// Instant local-only load (no token/network needed) for the given athlete.
function cacheLoadLocal(athleteId) {
  return athleteId ? lsCacheLoad(athleteId) : null;
}

// Remote load via Edge Function. Identity is derived from the Strava token
// server-side, so no athlete id is sent. Warms the local copy on hit.
async function cacheLoadRemote(athleteId) {
  if (!_fnUrl || !CONFIG.accessToken) return null;
  try {
    const r = await fetch(_fnUrl, {
      headers: { apikey: _sbKey, 'x-strava-token': CONFIG.accessToken }
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !data.activities || !data.activities.length) return null;
    if (athleteId) lsCacheSave(athleteId, data.activities, data.synced_at);
    return data.activities;
  } catch { return null; }
}

async function cacheSave(activities, athleteId) {
  if (athleteId) lsCacheSave(athleteId, activities);
  if (!_fnUrl || !CONFIG.accessToken) return;
  try {
    await fetch(_fnUrl, {
      method: 'POST',
      headers: {
        apikey: _sbKey,
        'x-strava-token': CONFIG.accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ activities })
    });
  } catch { /* non-fatal */ }
}

let acts = [], charts = {};
let currentAthlete = null;
let leafletMapInst = null;

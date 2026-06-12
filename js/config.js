const CONFIG = {
  clientId:     '__STRAVA_CLIENT_ID__',
  clientSecret: '__STRAVA_CLIENT_SECRET__',
  accessToken:  localStorage.getItem('strava_access_token')  || '',
  refreshToken: localStorage.getItem('strava_refresh_token') || ''
};

/* ── REMOTE CACHE (via strava-cache Edge Function) ── */
// The browser never touches the table directly. It calls the Edge Function,
// which verifies the Strava token server-side and reads/writes only that
// athlete's row with the service role. The table itself is locked by RLS.
const _sbUrl = '__SUPABASE_URL__';
const _sbKey = '__SUPABASE_KEY__';
const _haveRemote = _sbUrl && !_sbUrl.startsWith('__') && _sbKey && !_sbKey.startsWith('__');
const _fnUrl = _haveRemote ? _sbUrl.replace(/\/$/, '') + '/functions/v1/strava-cache' : null;

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

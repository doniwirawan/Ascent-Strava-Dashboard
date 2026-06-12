const CONFIG = {
  clientId:     '__STRAVA_CLIENT_ID__',
  clientSecret: '__STRAVA_CLIENT_SECRET__',
  accessToken:  localStorage.getItem('strava_access_token')  || '',
  refreshToken: localStorage.getItem('strava_refresh_token') || ''
};

/* ── SUPABASE CACHE ── */
const _sbUrl = '__SUPABASE_URL__';
const _sbKey = '__SUPABASE_KEY__';
const _sb = (typeof supabase !== 'undefined' && _sbUrl && !_sbUrl.startsWith('__') && _sbKey && !_sbKey.startsWith('__'))
  ? supabase.createClient(_sbUrl, _sbKey)
  : null;

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

async function cacheLoad(athleteId) {
  if (!athleteId) return null;
  // Fast path: local copy for this athlete
  const local = lsCacheLoad(athleteId);
  if (local && local.length) return local;
  if (!_sb) return null;
  try {
    const { data, error } = await _sb
      .from('strava_cache')
      .select('activities, synced_at')
      .eq('id', athleteId)
      .maybeSingle();
    if (error || !data) return null;
    const age = Date.now() - new Date(data.synced_at).getTime();
    if (age > CACHE_TTL_MS) return null; // stale
    lsCacheSave(athleteId, data.activities, data.synced_at); // warm local copy
    return data.activities;
  } catch { return null; }
}

async function cacheSave(activities, athleteId) {
  if (!athleteId) return;
  const syncedAt = new Date().toISOString();
  lsCacheSave(athleteId, activities, syncedAt);
  if (!_sb) return;
  try {
    await _sb.from('strava_cache').upsert(
      { id: athleteId, activities, synced_at: syncedAt },
      { onConflict: 'id' }
    );
  } catch { /* non-fatal */ }
}

let acts = [], charts = {};
let currentAthlete = null;
let leafletMapInst = null;

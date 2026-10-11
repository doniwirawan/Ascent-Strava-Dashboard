// Public read-only stats API.
//
//   GET /api/stats            → aggregate numbers only (no activity list, no GPS)
//
// Source is the owner's row in the Supabase `strava_cache` table (the same 200
// activities the dashboard caches). That table is RLS-locked and unreachable
// with the anon key, so we read it here with the service-role key — server-side
// only, never shipped to a browser.
//
// No polylines and no coordinates ever leave this function, so nothing reveals
// where rides start. Beyond counts, sums and bests it returns km per day (for the
// calendar card) and the latest ride's auto-caption title, which only names the
// destination.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.

// Browsers on these origins may call us. CORS is not authentication — it only
// stops *other websites'* JS from reading the response; curl still works.
const ALLOWED_ORIGINS = [
  'https://doniwirawan.xyz',
  'https://www.doniwirawan.xyz',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const { ownerAccessToken } = require('./_owner-token.js');

const RIDE_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
const isRide = a => RIDE_TYPES.includes(a.sport_type || a.type);

const km = m => +((m || 0) / 1000).toFixed(1);
const hrs = s => +((s || 0) / 3600).toFixed(1);
const kmh = ms => +((ms || 0) * 3.6).toFixed(1);

// Sum one bucket of activities into the shape we expose everywhere.
function totals(list) {
  return {
    activities: list.length,
    rides: list.filter(isRide).length,
    distance_km: km(list.reduce((t, a) => t + (a.distance || 0), 0)),
    elevation_m: Math.round(list.reduce((t, a) => t + (a.total_elevation_gain || 0), 0)),
    moving_hours: hrs(list.reduce((t, a) => t + (a.moving_time || 0), 0)),
  };
}

function bests(list) {
  const max = (fn) => list.reduce((m, a) => Math.max(m, fn(a) || 0), 0);
  return {
    longest_ride_km: km(max(a => a.distance)),
    biggest_climb_m: Math.round(max(a => a.total_elevation_gain)),
    fastest_avg_kmh: kmh(max(a => a.average_speed)),
    longest_moving_hours: hrs(max(a => a.moving_time)),
    highest_avg_watts: Math.round(max(a => a.average_watts)) || null,
  };
}

// Distance per calendar month, oldest → newest. Months with no activity are
// omitted rather than zero-filled — the consumer can gap-fill if it wants.
function byMonth(list) {
  const m = new Map();
  list.forEach(a => {
    const key = (a.start_date_local || a.start_date || '').slice(0, 7);
    if (!key) return;
    const row = m.get(key) || { month: key, activities: 0, distance_km: 0, elevation_m: 0 };
    row.activities++;
    row.distance_km += (a.distance || 0) / 1000;
    row.elevation_m += a.total_elevation_gain || 0;
    m.set(key, row);
  });
  return [...m.values()]
    .sort((x, y) => x.month.localeCompare(y.month))
    .map(r => ({ ...r, distance_km: +r.distance_km.toFixed(1), elevation_m: Math.round(r.elevation_m) }));
}

function bySport(list) {
  const m = new Map();
  list.forEach(a => {
    const key = a.sport_type || a.type || 'Other';
    const row = m.get(key) || { sport: key, activities: 0, distance_km: 0, moving_hours: 0 };
    row.activities++;
    row.distance_km += (a.distance || 0) / 1000;
    row.moving_hours += (a.moving_time || 0) / 3600;
    m.set(key, row);
  });
  return [...m.values()]
    .map(r => ({ ...r, distance_km: +r.distance_km.toFixed(1), moving_hours: +r.moving_hours.toFixed(1) }))
    .sort((x, y) => y.distance_km - x.distance_km);
}

// ── Extras for the cards and doniwirawan.xyz ────────────────────────────────

const TZ = 'Asia/Makassar';                 // the owner rides in Bali (UTC+8)
const EVEREST_M = 8849, EARTH_KM = 40075;
const BABI_GULING_KCAL = 700;               // one plate of nasi babi guling, roughly
const dayKey = a => (a.start_date_local || a.start_date).slice(0, 10);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const monday = key => addDays(key, -((new Date(key + 'T00:00:00Z').getUTCDay() + 6) % 7));

// km per day for the last 53 weeks (days with no activity are omitted).
function calendar(list) {
  const from = addDays(monday(today()), -52 * 7);
  const m = new Map();
  list.forEach(a => { const d = dayKey(a); if (d >= from) m.set(d, (m.get(d) || 0) + (a.distance || 0) / 1000); });
  return { from, to: today(), days: [...m].sort().map(([date, k]) => ({ date, km: +k.toFixed(1) })) };
}

// Weeks in a row (Mon–Sun) with at least one activity. The current week only
// breaks the streak once it is over, so a quiet Monday doesn't reset it.
function streak(list) {
  const weeks = new Set(list.map(a => monday(dayKey(a))));
  let w = monday(today());
  if (!weeks.has(w)) w = addDays(w, -7);
  let current = 0;
  while (weeks.has(w)) { current++; w = addDays(w, -7); }
  let best = 0, run = 0, prev = null;
  [...weeks].sort().forEach(k => { run = prev && addDays(prev, 7) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  const year = today().slice(0, 4);
  return { weeks: current, best_weeks: best, active_days_this_year: new Set(list.map(dayKey).filter(d => d.startsWith(year))).size };
}

// Fitness / fatigue / form, the same model as the dashboard's Training section
// (js/training.js) minus estimated power: Relative Effort → HR-TRIMP → time.
function fitness(list) {
  const hrMax = list.reduce((m, a) => Math.max(m, a.max_heartrate || 0), 0), hrRest = 60;
  const load = a => {
    const dur = a.moving_time || a.elapsed_time || 0;
    if (a.suffer_score > 0) return a.suffer_score;
    if (a.average_heartrate > 0 && hrMax > hrRest) {
      const hrr = Math.min(1, Math.max(0, (a.average_heartrate - hrRest) / (hrMax - hrRest)));
      return (dur / 60) * hrr * 0.64 * Math.exp(1.92 * hrr) * 0.6;
    }
    return (dur / 3600) * 50;
  };
  const byDay = new Map();
  list.forEach(a => byDay.set(dayKey(a), (byDay.get(dayKey(a)) || 0) + load(a)));
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  let ctl = 0, atl = 0;
  const series = [];
  for (let d = [...byDay.keys()].sort()[0], end = today(); d <= end; d = addDays(d, 1)) {
    const L = byDay.get(d) || 0;
    ctl += (L - ctl) * kC; atl += (L - atl) * kA;
    series.push({ date: d, ctl: Math.round(ctl), tsb: Math.round(ctl - atl) });
  }
  const tsb = ctl - atl;
  const ago7 = series[series.length - 8];
  const form = tsb < -30 ? 'High fatigue' : tsb < -10 ? 'Productive' : tsb < 5 ? 'Neutral' : tsb < 25 ? 'Fresh' : 'Detraining';
  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(tsb), ramp: ago7 ? Math.round(ctl - ago7.ctl) : 0, form, last_90_days: series.slice(-90) };
}

// The newest ride. Its name is the auto-caption, which only ever names the
// destination — never where the ride started.
function latest(list) {
  const a = [...list].filter(isRide).sort((x, y) => dayKey(y).localeCompare(dayKey(x)) || (y.start_date || '').localeCompare(x.start_date || ''))[0];
  return a ? {
    name: a.name || null, sport: a.sport_type || a.type, date: dayKey(a),
    distance_km: km(a.distance), elevation_m: Math.round(a.total_elevation_gain || 0),
    moving_minutes: Math.round((a.moving_time || 0) / 60), avg_kmh: kmh(a.average_speed),
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
  } : null;
}

// Bikes and all-time ride totals come from Strava itself (the cache only holds
// recent activities). Memoised per warm instance so card traffic can't burn
// through the Strava rate limit.
let stravaMemo = { at: 0, data: null };
async function stravaExtras(owner) {
  if (stravaMemo.data && Date.now() - stravaMemo.at < 3600000) return stravaMemo.data;
  try {
    const token = await ownerAccessToken();
    if (!token) return null;
    const H = { headers: { Authorization: 'Bearer ' + token } };
    const [me, st] = await Promise.all([
      fetch('https://www.strava.com/api/v3/athlete', H).then(r => r.ok ? r.json() : null),
      fetch('https://www.strava.com/api/v3/athletes/' + owner + '/stats', H).then(r => r.ok ? r.json() : null),
    ]);
    const all = (st && st.all_ride_totals) || null;
    const data = {
      bikes: ((me && me.bikes) || []).filter(b => !b.retired)
        .map(b => ({ name: b.nickname || b.name, distance_km: Math.round((b.distance || 0) / 1000) }))
        .sort((x, y) => y.distance_km - x.distance_km),
      all_time: all ? {
        rides: all.count || 0, distance_km: Math.round((all.distance || 0) / 1000),
        elevation_m: Math.round(all.elevation_gain || 0), moving_hours: Math.round((all.moving_time || 0) / 3600),
        longest_ride_km: Math.round((st.biggest_ride_distance || 0) / 1000),
        biggest_climb_m: Math.round(st.biggest_climb_elevation_gain || 0),
      } : null,
    };
    stravaMemo = { at: Date.now(), data };
    return data;
  } catch { return null; }
}

// Ride energy: Strava's kJ of work ≈ kcal burned (body efficiency ~24% cancels
// the 4.184 kJ/kcal), falling back to ~500 kcal per riding hour.
function fun(list, allTime) {
  const year = today().slice(0, 4);
  const kcal = list.filter(a => isRide(a) && dayKey(a).startsWith(year))
    .reduce((t, a) => t + (a.kilojoules || ((a.moving_time || 0) / 3600) * 500), 0);
  const base = allTime || { distance_km: km(list.reduce((t, a) => t + (a.distance || 0), 0)), elevation_m: list.reduce((t, a) => t + (a.total_elevation_gain || 0), 0), moving_hours: hrs(list.reduce((t, a) => t + (a.moving_time || 0), 0)) };
  return {
    basis: allTime ? 'all_time' : 'sample',
    babi_guling_this_year: Math.round(kcal / BABI_GULING_KCAL),
    kcal_this_year: Math.round(kcal),
    everests: +(base.elevation_m / EVEREST_M).toFixed(1),
    around_the_earth_pct: Math.round((base.distance_km / EARTH_KM) * 100),
    days_in_the_saddle: +(base.moving_hours / 24).toFixed(1),
  };
}

// Read the owner's cache and compute the public payload. Returns { status, body };
// shared with api/card.js so the README card shows exactly what this API exposes.
async function loadStats() {
  const url = (process.env.SUPABASE_URL || '').replace(/\s+/g, '').replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  const owner = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (!url || !key || !owner) {
    return { status: 500, body: { error: 'not_configured', need: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OWNER_ATHLETE_ID'] } };
  }

  let row;
  try {
    const r = await fetch(
      url + '/rest/v1/strava_cache?id=eq.' + encodeURIComponent(owner) + '&select=activities,synced_at',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } }
    );
    if (!r.ok) return { status: 502, body: { error: 'upstream_error', status: r.status } };
    row = (await r.json())[0];
  } catch (e) {
    return { status: 502, body: { error: 'upstream_error', detail: String((e && e.message) || e) } };
  }

  const acts = (row && Array.isArray(row.activities) ? row.activities : [])
    .filter(a => a && (a.start_date_local || a.start_date));
  if (!acts.length) return { status: 200, body: { error: 'no_data', synced_at: (row && row.synced_at) || null } };

  const now = Date.now();
  const since = days => acts.filter(a => now - new Date(a.start_date_local || a.start_date).getTime() <= days * 86400000);
  const year = String(new Date().getFullYear());
  const ytd = acts.filter(a => (a.start_date_local || a.start_date).startsWith(year));
  const extras = await stravaExtras(owner);

  return { status: 200, body: {
    athlete_id: +owner,
    synced_at: row.synced_at || null,        // when the dashboard last refreshed the cache
    generated_at: new Date().toISOString(),
    sample: {                                 // what these numbers are computed from
      activities: acts.length,
      first: (acts.reduce((m, a) => { const d = (a.start_date_local || a.start_date).slice(0, 10); return !m || d < m ? d : m; }, null)),
      last: (acts.reduce((m, a) => { const d = (a.start_date_local || a.start_date).slice(0, 10); return !m || d > m ? d : m; }, null)),
      note: 'Strava cache holds the most recent 200 activities; totals are over that window, not all time.',
    },
    totals: totals(acts),
    ytd: totals(ytd),
    last_30_days: totals(since(30)),
    last_7_days: totals(since(7)),
    bests: bests(acts),
    by_month: byMonth(acts),
    by_sport: bySport(acts),
    calendar: calendar(acts),
    streak: streak(acts),
    fitness: fitness(acts),
    latest_ride: latest(acts),
    bikes: extras ? extras.bikes : null,
    all_time: extras ? extras.all_time : null,
    fun: fun(acts, extras && extras.all_time),
  } };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const { status, body } = await loadStats();
  // Serve from Vercel's CDN for 10 min, and keep serving a stale copy for an
  // hour while it revalidates — so traffic on doniwirawan.xyz can't run up
  // Supabase requests, and stays comfortably inside both free tiers.
  if (status === 200 && !body.error) res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(status).json(body);
};

module.exports.loadStats = loadStats;

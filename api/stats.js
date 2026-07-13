// Public read-only stats API.
//
//   GET /api/stats            → aggregate numbers only (no activity list, no GPS)
//
// Source is the owner's row in the Supabase `strava_cache` table (the same 200
// activities the dashboard caches). That table is RLS-locked and unreachable
// with the anon key, so we read it here with the service-role key — server-side
// only, never shipped to a browser.
//
// Nothing about an individual activity leaves this function: no names, no dates,
// no polylines, no coordinates. Only counts, sums and bests.
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

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const url = (process.env.SUPABASE_URL || '').replace(/\s+/g, '').replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  const owner = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (!url || !key || !owner) {
    res.status(500).json({ error: 'not_configured', need: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OWNER_ATHLETE_ID'] });
    return;
  }

  let row;
  try {
    const r = await fetch(
      url + '/rest/v1/strava_cache?id=eq.' + encodeURIComponent(owner) + '&select=activities,synced_at',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } }
    );
    if (!r.ok) { res.status(502).json({ error: 'upstream_error', status: r.status }); return; }
    row = (await r.json())[0];
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
    return;
  }

  const acts = (row && Array.isArray(row.activities) ? row.activities : [])
    .filter(a => a && (a.start_date_local || a.start_date));
  if (!acts.length) { res.status(200).json({ error: 'no_data', synced_at: (row && row.synced_at) || null }); return; }

  const now = Date.now();
  const since = days => acts.filter(a => now - new Date(a.start_date_local || a.start_date).getTime() <= days * 86400000);
  const year = String(new Date().getFullYear());
  const ytd = acts.filter(a => (a.start_date_local || a.start_date).startsWith(year));

  // Serve from Vercel's CDN for 10 min, and keep serving a stale copy for an
  // hour while it revalidates — so traffic on doniwirawan.xyz can't run up
  // Supabase requests, and stays comfortably inside both free tiers.
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(200).json({
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
  });
};

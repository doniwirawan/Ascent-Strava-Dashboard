// Workouts from the Huawei Health export (Supabase huawei_workouts), for the
// "Only on Huawei" card: the ones that never reached Strava, with their full
// track so the browser can build a GPX and upload it.
//
// Gated to the owner exactly like api/sleep.js: a valid Strava token that
// resolves to OWNER_ATHLETE_ID. Personal health data, so nobody else can read
// or change it.
//
// POST { token, action: 'list' }                  → { workouts: [...] } (no tracks)
// POST { token, action: 'track', id }             → { track }
// POST { token, action: 'link', id, strava_id }   → { ok } — mark as uploaded
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.

const LIST_COLS = 'record_id,sport_type,sport,start_time,end_time,tz,duration_s,distance_m,climb_m,min_alt_m,max_alt_m,avg_hr,max_hr,calories,steps,polyline,start_latlng,strava_id';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { token, action, id } = body;
  if (!token || !['list', 'track', 'link'].includes(action)) { res.status(400).json({ error: 'bad_request' }); return; }

  // Gate to the owner: a valid Strava token that resolves to OWNER_ATHLETE_ID.
  let athleteId = null;
  try {
    const ar = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: 'Bearer ' + token } });
    if (ar.ok) { const a = await ar.json(); athleteId = a && a.id; }
  } catch { /* fall through to 401 */ }
  if (!athleteId) { res.status(401).json({ error: 'invalid_strava_token' }); return; }

  const url   = (process.env.SUPABASE_URL || '').replace(/\s+/g, '').replace(/\/$/, '');
  const key   = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  const owner = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (!url || !key || !owner) {
    res.status(500).json({ error: 'not_configured', need: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OWNER_ATHLETE_ID'] });
    return;
  }
  if (String(athleteId) !== owner) { res.status(403).json({ error: 'not_authorized' }); return; }

  const H = { apikey: key, Authorization: 'Bearer ' + key };
  const base = url + '/rest/v1/huawei_workouts?athlete_id=eq.' + encodeURIComponent(owner);
  try {
    if (action === 'list') {
      const r = await fetch(base + '&select=' + LIST_COLS + '&order=start_time.desc', { headers: H });
      if (!r.ok) throw new Error('supabase ' + r.status);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json({ workouts: await r.json() });
      return;
    }
    if (!id) { res.status(400).json({ error: 'bad_request', need: ['id'] }); return; }
    const one = base + '&record_id=eq.' + encodeURIComponent(id);
    if (action === 'track') {
      const r = await fetch(one + '&select=track', { headers: H });
      if (!r.ok) throw new Error('supabase ' + r.status);
      const row = (await r.json())[0];
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(row ? 200 : 404).json(row ? { track: row.track } : { error: 'not_found' });
      return;
    }
    // link: remember which Strava activity this workout became
    const sid = String(body.strava_id || '').replace(/\D/g, '');
    if (!sid) { res.status(400).json({ error: 'bad_request', need: ['strava_id'] }); return; }
    const r = await fetch(one, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ strava_id: sid }),
    });
    if (!r.ok) throw new Error('supabase ' + r.status);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
  }
};

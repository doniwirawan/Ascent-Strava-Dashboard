// Private sleep data. This is personal health data from a Huawei Health
// export, so it deliberately does NOT ship as a static file under dist/ — the
// repo is public and anything in dist/ is fetchable by anyone who guesses the
// URL. It is only handed out to a caller holding a Strava token that resolves
// to OWNER_ATHLETE_ID — the same gate api/ai.js and api/route.js use.
//
// Source of truth: the sleep_data row in Supabase, written by api/sleep-upload.js
// when you drop a new export into the dashboard. If Supabase is unreachable or
// has no row yet, we fall back to the bundled private/sleep.json snapshot
// (gitignored, uploaded by `vercel --prod`) so the section keeps working.
//
// Required env: OWNER_ATHLETE_ID. Optional (for live re-uploads):
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
const bundled = require('../private/sleep.json');

async function fromSupabase(owner) {
  const url = (process.env.SUPABASE_URL || '').replace(/\s+/g, '').replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  if (!url || !key) return null;
  try {
    const r = await fetch(
      url + '/rest/v1/sleep_data?id=eq.' + encodeURIComponent(owner) + '&select=data',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } }
    );
    if (!r.ok) return null;
    const row = (await r.json())[0];
    return (row && row.data && Array.isArray(row.data.rows)) ? row.data : null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const token = body.token;
  if (!token) { res.status(400).json({ error: 'bad_request' }); return; }

  // Gate to the owner: a valid Strava token that resolves to OWNER_ATHLETE_ID.
  let athleteId = null;
  try {
    const ar = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: 'Bearer ' + token } });
    if (ar.ok) { const a = await ar.json(); athleteId = a && a.id; }
  } catch { /* fall through to 401 */ }
  if (!athleteId) { res.status(401).json({ error: 'invalid_strava_token' }); return; }

  const OWNER = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (!OWNER) { res.status(500).json({ error: 'not_configured', need: ['OWNER_ATHLETE_ID'] }); return; }
  if (String(athleteId) !== OWNER) { res.status(403).json({ error: 'not_authorized' }); return; }

  // Prefer the live Supabase copy (updated by re-uploads); fall back to the
  // snapshot bundled with the deploy so the section never goes blank.
  const live = await fromSupabase(OWNER);

  // Never let a CDN or shared cache hold personal health data.
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(live || bundled);
};

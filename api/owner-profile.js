// Owner-only profile facts Strava's API doesn't expose (the birth date, for
// age-based heart-rate zones, and what each bike cost, for cost per km). The repo is public, so the value lives
// in a Vercel env var and is only handed to a caller holding a Strava token
// that resolves to OWNER_ATHLETE_ID — the same gate as api/sleep.js.
//
// Required env: OWNER_ATHLETE_ID, OWNER_BIRTHDATE (YYYY-MM-DD).
// Optional: OWNER_GEAR_COSTS — JSON, Rupiah: bike prices keyed by a bike-name
//   substring, plus shared tools/workshop gear, e.g.
//   {"bikes":{"Mosso":23056292,"SR3D":9674168},"tools":2258216}
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const token = (body || {}).token;
  if (!token) { res.status(400).json({ error: 'bad_request' }); return; }

  let athleteId = null;
  try {
    const ar = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: 'Bearer ' + token } });
    if (ar.ok) { const a = await ar.json(); athleteId = a && a.id; }
  } catch { /* fall through to 401 */ }
  if (!athleteId) { res.status(401).json({ error: 'invalid_strava_token' }); return; }

  const OWNER = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (!OWNER) { res.status(500).json({ error: 'not_configured', need: ['OWNER_ATHLETE_ID'] }); return; }
  if (String(athleteId) !== OWNER) { res.status(403).json({ error: 'not_authorized' }); return; }

  const birthdate = (process.env.OWNER_BIRTHDATE || '').replace(/\s+/g, '').replace(/\\n$/, '');
  res.setHeader('Cache-Control', 'private, no-store');
  let gear_costs = null;
  try { gear_costs = JSON.parse((process.env.OWNER_GEAR_COSTS || '').trim().replace(/\\n$/, '')); } catch {}
  res.status(200).json({ birthdate: /^\d{4}-\d{2}-\d{2}$/.test(birthdate) ? birthdate : null, gear_costs });
};

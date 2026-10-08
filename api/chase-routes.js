// Private "chase the heatmap" routes: loops that start and finish at the owner's
// home, so they deliberately do NOT ship as a static file under dist/ (the repo
// is public and anything in dist/ is fetchable by URL). Handed out only to a
// caller holding a Strava token that resolves to OWNER_ATHLETE_ID — the same
// gate api/sleep.js uses.
//
// Source: private/chase-routes.json (gitignored, uploaded by `vercel --prod`).
// Required env: OWNER_ATHLETE_ID.
const routes = require('../private/chase-routes.json');

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

  // Never let a CDN or shared cache hold the home-based routes.
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(routes);
};

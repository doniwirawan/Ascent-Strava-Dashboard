// Private sleep data. This is personal health data from a one-off Huawei Health
// export, so it deliberately does NOT ship as a static file under dist/ — the
// repo is public and anything in dist/ is fetchable by anyone who guesses the
// URL. It lives in private/ (gitignored, uploaded by `vercel --prod`) and is
// only handed out to a caller holding a Strava token that resolves to
// OWNER_ATHLETE_ID — the same gate api/ai.js and api/route.js use.
//
// Required env: OWNER_ATHLETE_ID.
const sleep = require('../private/sleep.json');

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

  // Never let a CDN or shared cache hold personal health data.
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(sleep);
};

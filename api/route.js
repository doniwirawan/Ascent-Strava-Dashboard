// Route proxy. Keeps the OpenRouteService API key on the server (Vercel env) so
// it never ships to the browser, and solves CORS on direct browser → ORS calls.
// Access is gated to the dashboard owner exactly like api/ai.js: the client sends
// its Strava access token, we resolve it to an athlete id and reject anyone who
// isn't OWNER_ATHLETE_ID — so only you can spend your ORS quota.
//
// It asks ORS for a "round trip" — a loop of approximately the requested length
// starting/ending at one point — and returns a trimmed result the browser can
// draw and turn into GPX.

const PROFILES = {
  ride: 'cycling-regular',
  run:  'foot-walking',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { token, sport = 'ride', lat, lng, length, points, seed, test } = body;
  if (!token) { res.status(400).json({ error: 'bad_request' }); return; }

  const KEY = (process.env.ORS_API_KEY || '').replace(/\s+/g, '');
  if (!KEY) { res.status(500).json({ error: 'provider_not_configured', envVar: 'ORS_API_KEY' }); return; }

  // Gate to the owner: a valid Strava token that resolves to OWNER_ATHLETE_ID.
  let athleteId = null;
  try {
    const ar = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: 'Bearer ' + token } });
    if (ar.ok) { const a = await ar.json(); athleteId = a && a.id; }
  } catch { /* fall through to 401 */ }
  if (!athleteId) { res.status(401).json({ error: 'invalid_strava_token' }); return; }

  const OWNER = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (OWNER && String(athleteId) !== OWNER) { res.status(403).json({ error: 'not_authorized' }); return; }

  // "Test connection" — confirms the key is set + you're authorized, no routing.
  if (test) { res.status(200).json({ ok: true }); return; }

  const profile = PROFILES[sport] || PROFILES.ride;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !(length > 0)) {
    res.status(400).json({ error: 'bad_request' }); return;
  }

  const payload = {
    coordinates: [[lng, lat]],
    options: { round_trip: { length: Math.round(length), points: points || 5, seed: seed || 1 } },
    elevation: true,
    instructions: false,
  };

  try {
    const r = await fetch('https://api.openrouteservice.org/v2/directions/' + profile + '/geojson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: KEY },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    const feat = data && data.features && data.features[0];
    if (!r.ok || !feat) {
      const e = data && data.error;
      const detail = (e && (e.message || e.code)) || (typeof e === 'string' ? e : null) || ('HTTP ' + r.status);
      res.status(r.status >= 400 ? r.status : 502).json({ error: 'provider_error', detail, status: r.status });
      return;
    }
    const coords = (feat.geometry && feat.geometry.coordinates) || [];
    const sum = feat.properties && feat.properties.summary || {};
    res.status(200).json({
      coordinates: coords,                          // [[lng,lat,ele], ...]
      distance: sum.distance || 0,                  // metres
      ascent: feat.properties && feat.properties.ascent || 0,
      descent: feat.properties && feat.properties.descent || 0,
    });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
  }
};

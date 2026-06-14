// Server-side Strava OAuth token exchange & refresh.
// Keeps STRAVA_CLIENT_SECRET on the server (Vercel env) so it never ships to
// the browser. The client POSTs { code } (initial auth) or { refresh_token }.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: 'server_not_configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { code, refresh_token } = body;

  const payload = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };
  if (code) { payload.code = code; payload.grant_type = 'authorization_code'; }
  else if (refresh_token) { payload.refresh_token = refresh_token; payload.grant_type = 'refresh_token'; }
  else { res.status(400).json({ error: 'missing_code_or_refresh_token' }); return; }

  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    // never echo our credentials back
    if (data && typeof data === 'object') { delete data.client_id; delete data.client_secret; }
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String(e && e.message || e) });
  }
};

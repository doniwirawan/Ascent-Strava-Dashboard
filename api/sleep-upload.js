// Receives a parsed sleep dataset from the dashboard and stores it in Supabase
// so /api/sleep serves it everywhere (phone + public deploy), not just the
// browser that parsed the export. The heavy lifting — decrypting the Huawei
// zip and building the {cols,rows} table — happens in the browser
// (js/sleep-import.js); this endpoint only persists the finished JSON.
//
// Gated to the owner exactly like api/sleep.js / api/ai.js: a valid Strava
// token that resolves to OWNER_ATHLETE_ID. Personal health data, so nobody
// else can write (or overwrite) it.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const token = body.token;
  const data = body.data;
  if (!token || !data || !Array.isArray(data.cols) || !Array.isArray(data.rows)) {
    res.status(400).json({ error: 'bad_request', need: ['token', 'data.cols', 'data.rows'] });
    return;
  }

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

  // Upsert the single owner row. resolution=merge-duplicates makes the POST an
  // upsert on the primary key so a re-upload replaces the previous export.
  try {
    const r = await fetch(url + '/rest/v1/sleep_data', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ id: owner, data, synced_at: new Date().toISOString() }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      res.status(502).json({ error: 'upstream_error', status: r.status, detail: detail.slice(0, 300) });
      return;
    }
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ ok: true, rows: data.rows.length, synced_at: new Date().toISOString() });
};

// Owner-only: the cycling items from the purchase tracker (purchase.doniwirawan.xyz),
// read from the purchase_data table in Supabase. Personal spending data, so it is
// only handed to a Strava token that resolves to OWNER_ATHLETE_ID — the same gate
// as api/sleep.js. Nothing about purchases lives in this (public) repo.
//
// Required env: OWNER_ATHLETE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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
  if (!OWNER || String(athleteId) !== OWNER) { res.status(403).json({ error: 'not_authorized' }); return; }

  const url = (process.env.SUPABASE_URL || '').replace(/\s+/g, '').replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  if (!url || !key) { res.status(500).json({ error: 'not_configured' }); return; }
  try {
    const r = await fetch(url + '/rest/v1/purchase_data?id=eq.items&select=data,updated_at', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('supabase ' + r.status);
    const row = (await r.json())[0];
    const items = ((row && row.data && row.data.items) || [])
      .filter(x => x.category === 'Cycling')
      .map(({ site, date, date_approx, order_id, shop, item, variant, qty, list_price, paid, status, cancelled, sub }) =>
        ({ site, date, date_approx, order_id, shop, item, variant, qty, list_price, paid, status, cancelled, sub }));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ updated_at: row ? row.updated_at : null, items });
  } catch (e) {
    res.status(502).json({ error: 'store_unavailable' });
  }
};

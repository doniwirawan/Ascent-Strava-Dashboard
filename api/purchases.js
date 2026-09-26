// Owner-only: the cycling items from the owner's finance app
// (finance.doniwirawan.xyz), which took over the purchase tracker on 2026-09-26
// and keeps the purchase_data table in its Neon database. Personal spending
// data, so it is only handed to a Strava token that resolves to
// OWNER_ATHLETE_ID — the same gate as api/sleep.js. Nothing about purchases
// lives in this (public) repo.
//
// NEON_PURCHASES_URL is a connection string for a read-only role that can
// SELECT purchase_data and nothing else in that database. Queried over Neon's
// HTTP SQL endpoint, so no Postgres driver is needed.
//
// Required env: OWNER_ATHLETE_ID, NEON_PURCHASES_URL.
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

  const db = (process.env.NEON_PURCHASES_URL || '').replace(/\s+/g, '').replace(/\\n$/, '');
  if (!db) { res.status(500).json({ error: 'not_configured' }); return; }
  try {
    const r = await fetch('https://' + new URL(db).hostname + '/sql', {
      method: 'POST',
      headers: { 'Neon-Connection-String': db, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'select data, updated_at from purchase_data where id = $1', params: ['items'] }),
    });
    // Tell the page WHY it's empty, since the data lives in another app that
    // can change under us: table renamed / role lost access, row gone, or the
    // "Cycling" category renamed.
    if (!r.ok) {
      const msg = String(((await r.json().catch(() => ({}))) || {}).message || '');
      const code = /does not exist/i.test(msg) ? 'source_missing'
                 : /permission denied|password authentication/i.test(msg) ? 'no_access' : 'store_unavailable';
      res.status(502).json({ error: code });
      return;
    }
    const row = ((await r.json()).rows || [])[0];
    const all = row && row.data && Array.isArray(row.data.items) ? row.data.items : null;
    if (!all) { res.status(502).json({ error: 'no_items_row' }); return; }
    const items = all
      .filter(x => x.category === 'Cycling')
      .map(({ site, date, date_approx, order_id, shop, item, variant, qty, list_price, paid, status, cancelled, sub }) =>
        ({ site, date, date_approx, order_id, shop, item, variant, qty, list_price, paid, status, cancelled, sub }));
    res.setHeader('Cache-Control', 'private, no-store');
    // total lets the page tell "no Cycling items" apart from "no purchases at all"
    res.status(200).json({ updated_at: row.updated_at, total: all.length, items });
  } catch (e) {
    res.status(502).json({ error: 'store_unavailable' });
  }
};

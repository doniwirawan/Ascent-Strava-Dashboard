// Saved AI output per activity (Supabase activity_ai): the performance analysis
// and the last AI caption, so reopening an activity shows them again.
//
// Gated to the owner exactly like api/huawei.js: a valid Strava token that
// resolves to OWNER_ATHLETE_ID.
//
// POST { token, action: 'list' }  → { rows: [{ activity_id, analysis, caption_title, caption_desc }] }
// POST { token, action: 'save', id, analysis?, caption_title?, caption_desc? } → { ok }
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.
const { saveActivityAi } = require('./_owner-token.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { token, action } = body;
  if (!token || !['list', 'save'].includes(action)) { res.status(400).json({ error: 'bad_request' }); return; }

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

  try {
    if (action === 'list') {
      const r = await fetch(url + '/rest/v1/activity_ai?select=activity_id,analysis,caption_title,caption_desc',
        { headers: { apikey: key, Authorization: 'Bearer ' + key } });
      if (!r.ok) throw new Error('supabase ' + r.status);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json({ rows: await r.json() });
      return;
    }
    const id = String(body.id || '').replace(/\D/g, '');
    if (!id) { res.status(400).json({ error: 'bad_request', need: ['id'] }); return; }
    const fields = {};
    ['analysis', 'caption_title', 'caption_desc'].forEach(k => { if (typeof body[k] === 'string') fields[k] = body[k].slice(0, 5000); });
    if (!Object.keys(fields).length) { res.status(400).json({ error: 'bad_request', need: ['analysis|caption_title|caption_desc'] }); return; }
    if (!(await saveActivityAi(id, fields))) throw new Error('supabase write failed');
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
  }
};

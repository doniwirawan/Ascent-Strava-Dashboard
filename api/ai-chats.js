// AI Coach conversation history, kept in Supabase (ai_chats) so it follows the
// owner across devices. The browser keeps its own copy too (localStorage) and
// merges the two — see aiCloudSync in js/ai-coach.js.
//
// Gated to the owner exactly like api/sleep.js: a valid Strava token that
// resolves to OWNER_ATHLETE_ID. Chats talk about personal training and
// health data, so nobody else can read or write them.
//
// POST { token, action: 'list' }              → { chats: [{id, title, ts, messages}] }
// POST { token, action: 'save', chat }        → { ok } — upsert one conversation
// POST { token, action: 'delete', id }        → { ok }
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { token, action } = body;
  if (!token || !['list', 'save', 'delete'].includes(action)) { res.status(400).json({ error: 'bad_request' }); return; }

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

  const H = { apikey: key, Authorization: 'Bearer ' + key };
  const table = url + '/rest/v1/ai_chats';
  const mine = 'athlete_id=eq.' + encodeURIComponent(owner);
  try {
    if (action === 'list') {
      const r = await fetch(table + '?' + mine + '&select=id,title,ts,messages&order=ts.desc&limit=500', { headers: H });
      if (!r.ok) throw new Error('supabase ' + r.status);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json({ chats: await r.json() });
      return;
    }
    if (action === 'delete') {
      const id = String(body.id || '').slice(0, 40);
      if (!id) { res.status(400).json({ error: 'bad_request', need: ['id'] }); return; }
      const r = await fetch(table + '?' + mine + '&id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
      if (!r.ok) throw new Error('supabase ' + r.status);
      res.status(200).json({ ok: true });
      return;
    }
    // save: keep only the fields we use, and only text turns
    const c = body.chat || {};
    const id = String(c.id || '').slice(0, 40);
    const messages = Array.isArray(c.messages) ? c.messages.slice(-400)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 20000) })) : [];
    if (!id || !messages.length) { res.status(400).json({ error: 'bad_request', need: ['chat.id', 'chat.messages'] }); return; }
    const row = { athlete_id: owner, id, title: String(c.title || '').slice(0, 120), ts: +c.ts || Date.now(), messages, updated_at: new Date().toISOString() };
    const r = await fetch(table + '?on_conflict=athlete_id,id', {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
  }
};

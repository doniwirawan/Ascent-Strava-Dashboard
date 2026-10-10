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
// Also the saved AI output per activity (activity_ai: performance analysis + last
// AI caption, written here by the dashboard and by api/strava-webhook.js) — kept in
// this function because the Hobby plan caps the project at 12 functions:
// POST { token, action: 'act-list' }          → { rows: [{activity_id, analysis, caption_title, caption_desc}] }
// POST { token, action: 'act-save', id, analysis?, caption_title?, caption_desc? } → { ok }
//
// And the auto-caption webhook's health, for Settings:
// POST { token, action: 'webhook-status' } → { subscription, token: {saved_at, write}, events: [...] }
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_ATHLETE_ID.
const { saveActivityAi, getOwnerRefreshToken, saveOwnerRefreshToken } = require('./_owner-token.js');

// Is the webhook set up and able to act? Subscription (Strava), the saved owner
// token and whether it can write, and the latest logged events.
async function webhookStatus(url, H) {
  const cid = (process.env.STRAVA_CLIENT_ID || '').replace(/\s+/g, '');
  const sec = (process.env.STRAVA_CLIENT_SECRET || '').replace(/\s+/g, '');
  const out = { subscription: null, token: { saved_at: null, write: null }, events: [] };
  try {
    const r = await fetch('https://www.strava.com/api/v3/push_subscriptions?client_id=' + cid + '&client_secret=' + sec);
    const subs = r.ok ? await r.json() : [];
    out.subscription = subs[0] ? { id: subs[0].id, callback_url: subs[0].callback_url } : false;
  } catch {}
  try {
    const r = await fetch(url + '/rest/v1/owner_tokens?id=eq.strava&select=updated_at', { headers: H });
    const row = r.ok ? (await r.json())[0] : null;
    out.token.saved_at = row ? row.updated_at : null;
  } catch {}
  const rt = await getOwnerRefreshToken();
  if (rt) {
    try {
      const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cid, client_secret: sec, grant_type: 'refresh_token', refresh_token: rt }) });
      const d = r.ok ? await r.json() : null;
      if (d && d.refresh_token && d.refresh_token !== rt) await saveOwnerRefreshToken(d.refresh_token);
      out.token.write = d ? /activity:write/.test(d.scope || '') : false;
    } catch {}
  }
  try {
    const r = await fetch(url + '/rest/v1/webhook_events?select=at,aspect,activity_id,result&order=at.desc&limit=10', { headers: H });
    if (r.ok) out.events = await r.json();
  } catch {}
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { token, action } = body;
  if (!token || !['list', 'save', 'delete', 'act-list', 'act-save', 'webhook-status'].includes(action)) { res.status(400).json({ error: 'bad_request' }); return; }

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
    if (action === 'webhook-status') {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json(await webhookStatus(url, H));
      return;
    }
    if (action === 'act-list') {
      const r = await fetch(url + '/rest/v1/activity_ai?select=activity_id,analysis,caption_title,caption_desc', { headers: H });
      if (!r.ok) throw new Error('supabase ' + r.status);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json({ rows: await r.json() });
      return;
    }
    if (action === 'act-save') {
      const id = String(body.id || '').replace(/\D/g, '');
      const fields = {};
      ['analysis', 'caption_title', 'caption_desc'].forEach(k => { if (typeof body[k] === 'string') fields[k] = body[k].slice(0, 5000); });
      if (!id || !Object.keys(fields).length) { res.status(400).json({ error: 'bad_request', need: ['id', 'analysis|caption_title|caption_desc'] }); return; }
      if (!(await saveActivityAi(id, fields))) throw new Error('supabase write failed');
      res.status(200).json({ ok: true });
      return;
    }
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

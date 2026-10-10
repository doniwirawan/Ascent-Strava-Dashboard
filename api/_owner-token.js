// The owner's latest Strava refresh token, kept in Supabase (owner_tokens) so the
// webhook can act on new activities. Strava rotates refresh tokens, so a static env
// var goes stale — api/strava-token.js saves a fresh one whenever the owner logs in
// or the dashboard refreshes, and the webhook saves any rotation it sees.
// Falls back to the OWNER_REFRESH_TOKEN env var.
function sb() {
  const url = (process.env.SUPABASE_URL || '').replace(/\s+/g, '').replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  return url && key ? { url: url + '/rest/v1/owner_tokens', H: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } } : null;
}

async function getOwnerRefreshToken() {
  const s = sb();
  if (s) {
    try {
      const r = await fetch(s.url + '?id=eq.strava&select=refresh_token', { headers: s.H });
      if (r.ok) { const rows = await r.json(); if (rows[0] && rows[0].refresh_token) return rows[0].refresh_token; }
    } catch {}
  }
  return (process.env.OWNER_REFRESH_TOKEN || '').replace(/\s+/g, '') || null;
}

async function saveOwnerRefreshToken(refresh_token) {
  const s = sb();
  if (!s || !refresh_token) return;
  try {
    await fetch(s.url + '?on_conflict=id', {
      method: 'POST', headers: { ...s.H, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'strava', refresh_token, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

// Upsert AI output for one activity into activity_ai (see api/ai-chats.js).
async function saveActivityAi(activity_id, fields) {
  const s = sb();
  if (!s) return false;
  try {
    const r = await fetch(s.url.replace(/owner_tokens$/, 'activity_ai') + '?on_conflict=activity_id', {
      method: 'POST', headers: { ...s.H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ activity_id: String(activity_id), ...fields, updated_at: new Date().toISOString() }),
    });
    return r.ok;
  } catch { return false; }
}

// webhook_events: one row per owner event — logEvent() inserts it, the returned
// function records the outcome (see Settings → Auto-caption webhook).
async function logEvent(aspect, activity_id) {
  const s = sb();
  const url = s && s.url.replace(/owner_tokens$/, 'webhook_events');
  let id = null;
  if (url) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { ...s.H, Prefer: 'return=representation' },
        body: JSON.stringify({ aspect, activity_id: String(activity_id), result: 'processing…' }) });
      if (r.ok) id = ((await r.json())[0] || {}).id;
    } catch {}
  }
  return async result => {
    if (!id) return;
    try { await fetch(url + '?id=eq.' + id, { method: 'PATCH', headers: { ...s.H, Prefer: 'return=minimal' }, body: JSON.stringify({ result: String(result).slice(0, 300) }) }); } catch {}
  };
}

module.exports = { sb, getOwnerRefreshToken, saveOwnerRefreshToken, saveActivityAi, logEvent };

// AI proxy. Keeps each provider's API key on the server (Vercel env) so it
// never ships to the browser, and solves the CORS block on direct browser →
// LLM calls. Access is gated to the dashboard owner: the client sends its
// Strava access token, we resolve it to an athlete id and reject anyone who
// isn't OWNER_ATHLETE_ID — so only you can spend your keys.
//
// "Various AI agents": pick a provider per request. Most are OpenAI-compatible
// (one shape); Anthropic uses its own. Set only the env keys you actually use.
const PROVIDERS = {
  deepseek:   { base: 'https://api.deepseek.com/chat/completions',        keyEnv: 'DEEPSEEK_API_KEY',   model: 'deepseek-chat',             shape: 'openai' },
  openai:     { base: 'https://api.openai.com/v1/chat/completions',       keyEnv: 'OPENAI_API_KEY',     model: 'gpt-4o-mini',               shape: 'openai' },
  openrouter: { base: 'https://openrouter.ai/api/v1/chat/completions',    keyEnv: 'OPENROUTER_API_KEY', model: 'deepseek/deepseek-chat',    shape: 'openai' },
  groq:       { base: 'https://api.groq.com/openai/v1/chat/completions',  keyEnv: 'GROQ_API_KEY',       model: 'llama-3.3-70b-versatile',   shape: 'openai' },
  mistral:    { base: 'https://api.mistral.ai/v1/chat/completions',       keyEnv: 'MISTRAL_API_KEY',    model: 'mistral-small-latest',      shape: 'openai' },
  anthropic:  { base: 'https://api.anthropic.com/v1/messages',            keyEnv: 'ANTHROPIC_API_KEY',  model: 'claude-haiku-4-5',          shape: 'anthropic' },
};

const MAX_TOKENS = 800; // hard output cap so a request can't run up the bill

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { token, messages, provider = 'deepseek', model, test } = body;
  if (!token) { res.status(400).json({ error: 'bad_request' }); return; }
  if (!test && (!Array.isArray(messages) || !messages.length)) {
    res.status(400).json({ error: 'bad_request' }); return;
  }

  const cfg = PROVIDERS[provider];
  if (!cfg) { res.status(400).json({ error: 'unknown_provider', provider }); return; }

  const KEY = (process.env[cfg.keyEnv] || '').replace(/\s+/g, '');
  if (!KEY) { res.status(500).json({ error: 'provider_not_configured', envVar: cfg.keyEnv }); return; }

  // Gate to the owner: a valid Strava token that resolves to OWNER_ATHLETE_ID.
  let athleteId = null;
  try {
    const ar = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: 'Bearer ' + token } });
    if (ar.ok) { const a = await ar.json(); athleteId = a && a.id; }
  } catch { /* fall through to 401 */ }
  if (!athleteId) { res.status(401).json({ error: 'invalid_strava_token' }); return; }

  const OWNER = (process.env.OWNER_ATHLETE_ID || '').replace(/\s+/g, '');
  if (OWNER && String(athleteId) !== OWNER) { res.status(403).json({ error: 'not_authorized' }); return; }

  // "Test connection" — confirms the key is set + you're authorized, without
  // spending any tokens on the LLM.
  if (test) { res.status(200).json({ ok: true, provider, model: model || cfg.model }); return; }

  const useModel = model || cfg.model;
  try {
    let url, headers, payload, pickText;
    if (cfg.shape === 'anthropic') {
      // Anthropic: system is a top-level field, messages are user/assistant only,
      // and temperature is rejected on Opus models — so we omit it.
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const msgs = messages.filter(m => m.role !== 'system');
      url = cfg.base;
      headers = { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' };
      payload = { model: useModel, max_tokens: MAX_TOKENS, system: sys, messages: msgs };
      pickText = d => { const b = d && d.content && d.content.find(x => x.type === 'text'); return b && b.text; };
    } else {
      url = cfg.base;
      headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY };
      payload = { model: useModel, messages, max_tokens: MAX_TOKENS, temperature: 0.5, stream: false };
      pickText = d => d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    }

    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({}));
    const text = pickText(data);
    if (!r.ok || !text) {
      // Surface the upstream provider's own message (e.g. "Insufficient Balance",
      // "invalid api key") as a plain string so the UI can show the real reason.
      const e = data && data.error;
      const detail = (e && (e.message || e.type)) || (typeof e === 'string' ? e : null) || ('HTTP ' + r.status);
      res.status(r.status >= 400 ? r.status : 502).json({ error: 'provider_error', detail, status: r.status, provider, model: useModel });
      return;
    }
    res.status(200).json({ text, usage: (data && data.usage) || null, provider, model: useModel });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', detail: String((e && e.message) || e) });
  }
};

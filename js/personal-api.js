/* ── PERSONAL API (Settings) ──
   Owner-only card to create and revoke tokens for /api/v1 (api/_v1.js), so the
   owner's own apps can read their data. A new token is shown once — the server
   keeps only its hash. Managed with the owner's Strava token (X-Strava-Token). */
const PAPI_BASE = location.origin + '/api/v1';

async function _papi(method, path, body) {
  const token = localStorage.getItem('strava_access_token');
  const r = await fetch('/api/v1/tokens' + (path || ''), { method, headers: { 'Content-Type': 'application/json', 'X-Strava-Token': token || '' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
  return d;
}

async function renderPersonalApi() {
  const card = document.getElementById('papiCard');
  if (!card || !(typeof _isHrzOwner === 'function' && _isHrzOwner())) return;
  card.style.display = '';
  document.getElementById('papiBase').textContent = PAPI_BASE;
  const list = document.getElementById('papiList');
  list.innerHTML = '<div class="hrz-note">' + tr('Loading…') + '</div>';
  let d;
  try { d = await _papi('GET'); } catch (e) { list.innerHTML = '<div class="ai-test-result err">' + tr('Could not load your tokens') + ' (' + e.message + ')</div>'; return; }
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const day = t => t ? new Date(t).toLocaleString() : tr('never');
  const live = d.tokens.filter(t => !t.revoked_at);
  list.innerHTML = live.length ? live.map(t => `<div class="papi-row">
      <div><b>${esc(t.name)}</b> <code>${esc(t.prefix)}…</code><small>${tr('Created')} ${day(t.created_at)} · ${tr('Last used')} ${day(t.last_used_at)}</small></div>
      <button class="ai-chip" type="button" data-id="${esc(t.id)}">${tr('Revoke')}</button></div>`).join('')
    : '<div class="hrz-note">' + tr('No tokens yet.') + '</div>';
  list.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await _papi('DELETE', '/' + b.dataset.id); } catch {}
    renderPersonalApi();
  });
}

async function papiCreate() {
  const name = (document.getElementById('papiName').value || '').trim() || 'My app';
  const out = document.getElementById('papiNew');
  out.style.display = '';
  out.className = 'ai-test-result';
  out.textContent = tr('Creating…');
  let d;
  try { d = await _papi('POST', '', { name }); } catch (e) { out.className = 'ai-test-result err'; out.textContent = tr('Could not create a token') + ' (' + e.message + ')'; return; }
  out.className = 'ai-test-result ok';
  out.innerHTML = `<b>${tr('Copy this token now — it is shown only once.')}</b>
    <div class="papi-token"><code id="papiTok">${d.token}</code><button class="ai-chip" type="button" id="papiCopy">${tr('Copy')}</button></div>
    <pre class="papi-ex">curl -H "Authorization: Bearer ${d.token}" ${PAPI_BASE}/activities?limit=5</pre>`;
  document.getElementById('papiCopy').onclick = () => { try { navigator.clipboard.writeText(d.token); document.getElementById('papiCopy').textContent = tr('Copied'); } catch {} };
  document.getElementById('papiName').value = '';
  renderPersonalApi();
}

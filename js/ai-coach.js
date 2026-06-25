/* ── AI COACH ──────────────────────────────────────────────────────────────
   Sends a COMPACT aggregated summary of `acts` (not the raw 200 activities) to
   the /api/ai serverless proxy, which forwards to DeepSeek. Small payloads keep
   each request cheap. The proxy holds the key and gates access to the owner. */

const AI_SYS =
  'You are a concise, encouraging endurance-sports coach analysing ONE athlete\'s ' +
  'Strava history. Use only the numbers in the provided JSON — never invent data. ' +
  'Reply in short markdown (a heading or two, bullets). Stay under ~250 words unless ' +
  'asked for more. Distances are km, elevation m, durations as given, speed km/h. ' +
  'avg_kmh is average speed, max_kmh is peak/top speed — never confuse the two. ' +
  '`fastest_rides_all_time` covers the ENTIRE history; `recent` is only the latest activities.';

let aiMessages = [];      // {role,content} chat turns (display + context)
let aiSummaryCache = null; // rebuilt whenever data reloads (see clearAISummary)

function clearAISummary() { aiSummaryCache = null; }

/* Aggregate `acts` into a small JSON blob. Metric throughout, independent of the
   km/mi UI toggle, so the model always gets stable units. */
function aiBuildSummary() {
  const sorted = [...acts].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  const now = Date.now(), DAY = 86400000;
  const ageDays = d => (now - new Date(d).getTime()) / DAY;

  const km = m => +((m || 0) / 1000).toFixed(1);
  const sum = (arr, f) => arr.reduce((s, a) => s + (f(a) || 0), 0);
  const agg = arr => ({
    activities: arr.length,
    km: km(sum(arr, a => a.distance)),
    elev_m: Math.round(sum(arr, a => a.total_elevation_gain)),
    hours: +(sum(arr, a => a.moving_time) / 3600).toFixed(1),
  });

  // per-sport totals
  const bySport = {};
  sorted.forEach(a => {
    const t = a.type || 'Other';
    (bySport[t] || (bySport[t] = { activities: 0, km: 0, elev_m: 0 }));
    bySport[t].activities++;
    bySport[t].km += km(a.distance);
    bySport[t].elev_m += Math.round(a.total_elevation_gain || 0);
  });
  Object.values(bySport).forEach(s => s.km = +s.km.toFixed(1));

  // last 6 calendar months of distance
  const monthly = {};
  sorted.forEach(a => {
    if (ageDays(a.start_date) > 190) return;
    const k = a.start_date.slice(0, 7);
    monthly[k] = +((monthly[k] || 0) + km(a.distance)).toFixed(1);
  });

  const kmh = ms => +(((ms || 0) * 3.6)).toFixed(1);
  const rideRow = a => ({
    date: a.start_date.slice(0, 10), type: a.type, km: km(a.distance),
    elev_m: Math.round(a.total_elevation_gain || 0),
    avg_kmh: kmh(a.average_speed), max_kmh: kmh(a.max_speed),
  });

  // fastest rides across the ENTIRE history (by average speed) — so the AI is
  // never blind to a fast ride just because it's older than the recent few.
  const fastest = sorted.filter(a => (a.average_speed || 0) > 0)
    .sort((x, y) => (y.average_speed || 0) - (x.average_speed || 0))
    .slice(0, 5).map(rideRow);

  return {
    totals: { ...agg(sorted), date_range: [sorted.at(-1)?.start_date.slice(0, 10), sorted[0]?.start_date.slice(0, 10)] },
    by_sport: bySport,
    last_4_weeks: agg(sorted.filter(a => ageDays(a.start_date) <= 28)),
    prev_4_weeks: agg(sorted.filter(a => ageDays(a.start_date) > 28 && ageDays(a.start_date) <= 56)),
    monthly_km_last_6mo: monthly,
    fastest_rides_all_time: fastest,
    recent: sorted.slice(0, 8).map(a => ({ name: a.name, min: Math.round((a.moving_time || 0) / 60), ...rideRow(a) })),
  };
}

/* Tiny markdown → HTML (headings, bold, bullets, numbered, tables, paragraphs). */
function aiMd(s) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const isDelim = l => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(l) || /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l);

  const lines = s.split('\n');
  let html = '', inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };

  for (let i = 0; i < lines.length; i++) {
    let ln = lines[i];

    // GitHub-style table: header row + delimiter row + body rows
    if (ln.includes('|') && i + 1 < lines.length && isDelim(lines[i + 1])) {
      closeLists();
      const head = cells(ln);
      const body = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) { body.push(cells(lines[j])); j++; }
      html += '<div class="ai-tablewrap"><table class="ai-table"><thead><tr>'
        + head.map(h => '<th>' + inline(h) + '</th>').join('')
        + '</tr></thead><tbody>'
        + body.map(r => '<tr>' + head.map((_, c) => '<td>' + inline(r[c] || '') + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>';
      i = j - 1;
      continue;
    }

    let m;
    if ((m = ln.match(/^#{1,6}\s+(.*)/))) { closeLists(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = ln.match(/^\s*[-*]\s+(.*)/))) { if (inOl) { html += '</ol>'; inOl = false; } if (!inUl) { html += '<ul>'; inUl = true; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = ln.match(/^\s*\d+\.\s+(.*)/))) { if (inUl) { html += '</ul>'; inUl = false; } if (!inOl) { html += '<ol>'; inOl = true; } html += `<li>${inline(m[1])}</li>`; }
    else if (ln.trim()) { closeLists(); html += `<p>${inline(ln)}</p>`; }
    else closeLists();
  }
  closeLists();
  return html;
}

function aiAppend(role, html, cls) {
  const log = document.getElementById('aiLog');
  const div = document.createElement('div');
  div.className = 'ai-msg ai-' + role + (cls ? ' ' + cls : '');
  div.innerHTML = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

/* Turn an /api/ai error response into a clear, specific message. */
function aiErrorMessage(data, status) {
  const code = data && data.error;
  const fixed = {
    provider_not_configured: 'No API key is set on the server for this provider yet. Add <code>' + ((data && data.envVar) || 'the API key') + '</code> in Vercel → Settings → Environment Variables, then redeploy.',
    not_authorized: 'The AI Coach is limited to the dashboard owner\'s Strava account.',
    invalid_strava_token: 'Your Strava session expired — hit Refresh and try again.',
    unknown_provider: 'That AI provider isn\'t supported.',
    bad_request: 'The request was malformed. Try reloading the page.',
  };
  if (fixed[code]) return fixed[code];

  if (code === 'provider_error') {
    const detail = String((data && data.detail) || ('HTTP ' + (data && data.status))).trim();
    const d = detail.toLowerCase();
    const st = data && data.status;
    let hint;
    if (st === 402 || /balance|credit|quota|insufficient|billing|payment/.test(d))
      hint = '💳 This usually means the account is <b>out of credit</b>. Top up your provider account (DeepSeek is prepaid — add a few dollars in the DeepSeek console).';
    else if (st === 401 || st === 403 || /invalid.*key|unauthor|authentication|api key/.test(d))
      hint = '🔑 Your <b>API key looks invalid</b>. Double-check the value you set in Vercel for this provider.';
    else if (st === 429 || /rate.?limit|too many/.test(d))
      hint = '⏳ You\'ve hit the provider\'s <b>rate limit</b>. Wait a moment and try again.';
    else if (st === 404 || /model/.test(d))
      hint = 'ℹ️ The model name may be wrong. Clear the model box in Settings to use the default, or check the provider\'s model list.';
    return 'The AI provider rejected the request:<br><b>“' + detail + '”</b>' + (hint ? '<br>' + hint : '');
  }

  if (code === 'upstream_error') return 'Could not reach the AI provider (network/upstream error). Try again shortly.';
  return 'Something went wrong' + (status ? ' (HTTP ' + status + ')' : '') + '. Try again.';
}

async function aiSend(userText) {
  if (typeof acts === 'undefined' || !acts.length) { aiAppend('bot', 'Load your activities first.', 'err'); return; }
  const token = localStorage.getItem('strava_access_token');
  if (!token) { aiAppend('bot', 'You need to be connected to Strava.', 'err'); return; }

  aiAppend('user', aiMd(userText));
  aiMessages.push({ role: 'user', content: userText });
  const thinking = aiAppend('bot', '<span class="ai-dots"><span></span><span></span><span></span></span>');

  const summary = aiSummaryCache || (aiSummaryCache = aiBuildSummary());
  const sys = { role: 'system', content: AI_SYS + '\n\nAthlete data (JSON):\n' + JSON.stringify(summary) };
  const messages = [sys, ...aiMessages.slice(-16)]; // keep ~8 exchanges of memory

  const provider = (document.getElementById('aiProvider') || {}).value || 'deepseek';
  const model = ((document.getElementById('aiModel') || {}).value || '').trim() || undefined;

  try {
    const r = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, messages, provider, model }),
    });
    const data = await r.json().catch(() => ({}));
    thinking.remove();
    if (!r.ok || !data.text) {
      aiAppend('bot', aiErrorMessage(data, r.status), 'err');
      return;
    }
    aiAppend('bot', aiMd(data.text));
    aiMessages.push({ role: 'assistant', content: data.text });
  } catch (e) {
    thinking.remove();
    aiAppend('bot', 'Network error — could not reach the AI.', 'err');
  }
}

/* ── wire UI (elements live in index.html, so this runs at load) ── */
(function () {
  const form = document.getElementById('aiForm');
  if (!form) return;
  const input = document.getElementById('aiInput');

  // remember the chosen provider/model across visits
  const prov = document.getElementById('aiProvider'), mdl = document.getElementById('aiModel');
  if (prov) {
    const saved = localStorage.getItem('ai_provider'); if (saved) prov.value = saved;
    prov.onchange = () => localStorage.setItem('ai_provider', prov.value);
  }
  if (mdl) {
    mdl.value = localStorage.getItem('ai_model') || '';
    mdl.onchange = () => localStorage.setItem('ai_model', mdl.value.trim());
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    aiSend(t);
  });
  // Enter sends, Shift+Enter newline
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  // Settings → Test connection (verifies key + auth without spending tokens)
  const testBtn = document.getElementById('aiTestBtn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const out = document.getElementById('aiTestResult');
      const token = localStorage.getItem('strava_access_token');
      if (!token) { out.className = 'ai-test-result err'; out.textContent = 'Connect to Strava first.'; return; }
      const provider = (prov && prov.value) || 'deepseek';
      const model = (mdl && mdl.value.trim()) || undefined;
      out.className = 'ai-test-result'; out.textContent = 'Testing ' + provider + '…';
      testBtn.disabled = true;
      try {
        const r = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, provider, model, test: true }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.ok) { out.className = 'ai-test-result ok'; out.innerHTML = '✓ ' + provider + ' is configured and ready.'; }
        else { out.className = 'ai-test-result err'; out.innerHTML = aiErrorMessage(data, r.status); }
      } catch { out.className = 'ai-test-result err'; out.textContent = 'Network error — could not reach the server.'; }
      finally { testBtn.disabled = false; }
    });
  }

  document.querySelectorAll('#aiSection [data-ai-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      let p = btn.getAttribute('data-ai-prompt');
      if (p === '__goal__') {
        const g = (document.getElementById('aiGoal').value || '').trim();
        if (!g) { document.getElementById('aiGoal').focus(); return; }
        p = `My goal is: "${g}". Based on my data, how am I tracking toward it, and what should I adjust over the next few weeks?`;
      }
      aiSend(p);
    });
  });
})();

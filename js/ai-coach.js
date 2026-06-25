/* ── AI COACH ──────────────────────────────────────────────────────────────
   Sends a COMPACT aggregated summary of `acts` (not the raw 200 activities) to
   the /api/ai serverless proxy, which forwards to DeepSeek. Small payloads keep
   each request cheap. The proxy holds the key and gates access to the owner. */

const AI_SYS =
  'You are a concise, encouraging endurance-sports coach analysing ONE athlete\'s ' +
  'Strava history. Use only the numbers in the provided JSON — never invent data. ' +
  'Reply in short markdown (a heading or two, bullets). Stay under ~250 words unless ' +
  'asked for more. Distances are km, elevation m, durations as given, speed km/h.';

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

  return {
    totals: { ...agg(sorted), date_range: [sorted.at(-1)?.start_date.slice(0, 10), sorted[0]?.start_date.slice(0, 10)] },
    by_sport: bySport,
    last_4_weeks: agg(sorted.filter(a => ageDays(a.start_date) <= 28)),
    prev_4_weeks: agg(sorted.filter(a => ageDays(a.start_date) > 28 && ageDays(a.start_date) <= 56)),
    monthly_km_last_6mo: monthly,
    recent: sorted.slice(0, 8).map(a => ({
      date: a.start_date.slice(0, 10), type: a.type, name: a.name,
      km: km(a.distance), elev_m: Math.round(a.total_elevation_gain || 0),
      min: Math.round((a.moving_time || 0) / 60),
      kmh: +(((a.average_speed || 0) * 3.6)).toFixed(1),
    })),
  };
}

/* Tiny markdown → HTML (headings, bold, bullets, numbered, paragraphs). */
function aiMd(s) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc(s).split('\n');
  let html = '', inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
  for (let ln of lines) {
    ln = ln.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    let m;
    if ((m = ln.match(/^#{1,6}\s+(.*)/))) { closeLists(); html += `<h4>${m[1]}</h4>`; }
    else if ((m = ln.match(/^\s*[-*]\s+(.*)/))) { if (inOl) { html += '</ol>'; inOl = false; } if (!inUl) { html += '<ul>'; inUl = true; } html += `<li>${m[1]}</li>`; }
    else if ((m = ln.match(/^\s*\d+\.\s+(.*)/))) { if (inUl) { html += '</ul>'; inUl = false; } if (!inOl) { html += '<ol>'; inOl = true; } html += `<li>${m[1]}</li>`; }
    else if (ln.trim()) { closeLists(); html += `<p>${ln}</p>`; }
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

async function aiSend(userText) {
  if (typeof acts === 'undefined' || !acts.length) { aiAppend('bot', 'Load your activities first.', 'err'); return; }
  const token = localStorage.getItem('strava_access_token');
  if (!token) { aiAppend('bot', 'You need to be connected to Strava.', 'err'); return; }

  aiAppend('user', aiMd(userText));
  aiMessages.push({ role: 'user', content: userText });
  const thinking = aiAppend('bot', '<span class="ai-dots"><span></span><span></span><span></span></span>');

  const summary = aiSummaryCache || (aiSummaryCache = aiBuildSummary());
  const sys = { role: 'system', content: AI_SYS + '\n\nAthlete data (JSON):\n' + JSON.stringify(summary) };
  const messages = [sys, ...aiMessages.slice(-6)]; // cap history → cheaper, stable

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
      const map = {
        provider_not_configured: 'This provider\'s key isn\'t set on the server yet (add ' + (data.envVar || 'the API key') + ' in Vercel).',
        not_authorized: 'This AI Coach is limited to the dashboard owner\'s account.',
        invalid_strava_token: 'Your Strava session expired — refresh and try again.',
        unknown_provider: 'That AI provider isn\'t supported.',
      };
      aiAppend('bot', map[data.error] || ('Something went wrong (' + (data.error || r.status) + ').'), 'err');
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

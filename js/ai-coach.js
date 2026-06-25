/* ── AI COACH ──────────────────────────────────────────────────────────────
   Sends a COMPACT aggregated summary of `acts` (not the raw 200 activities) to
   the /api/ai serverless proxy, which forwards to DeepSeek. Small payloads keep
   each request cheap. The proxy holds the key and gates access to the owner. */

const AI_SYS =
  'You are a concise, encouraging endurance-sports coach analysing ONE athlete\'s ' +
  'Strava history. Use only the numbers in the provided JSON — never invent data. ' +
  'Always reply in English. ' +
  'Reply in short markdown (a heading or two, bullets). Stay under ~250 words unless ' +
  'asked for more. Distances are km, elevation m, durations as given, speed km/h. ' +
  'avg_kmh is average speed, max_kmh is peak/top speed — never confuse the two. ' +
  '`fastest_rides_all_time` covers the ENTIRE history; `recent` is only the latest activities.';

/* Inline SVG used wherever the assistant is represented (no emoji). */
const AI_ICON = '<svg class="ai-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l1.5 4.1 4.1 1.5-4.1 1.5L12 13.8l-1.5-4.1L6.4 8.2l4.1-1.5L12 2.6zM18.5 12l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85L18.5 12zM5.4 12.6l.75 2.05 2.05.75-2.05.75-.75 2.05-.75-2.05L4.6 15.4l2.05-.75L5.4 12.6z"/></svg>';

/* Credit appended to captions written via the app, so they're identifiable. */
function aiCredit(desc, isAI) {
  desc = (desc || '').trim();
  if (!desc || /by Ascent Analytics/.test(desc)) return desc;
  return desc + (isAI ? '\n\n— AI-written by Ascent Analytics' : '\n\n— by Ascent Analytics');
}

/* Persist edited acts (new names/descriptions) to the local + remote cache so a
   reload doesn't restore the old names. */
function aiSyncCache() {
  try { const aid = localStorage.getItem('strava_athlete_id'); if (aid && typeof cacheSave === 'function') cacheSave(acts, aid); } catch {}
}

let aiMessages = [];      // {role,content} chat turns (display + context)
let aiSummaryCache = null; // rebuilt whenever data reloads (see clearAISummary)

function clearAISummary() { aiSummaryCache = null; }

/* Persist the conversation so it survives reloads. SAFE: we store only the
   question/answer TEXT — never the API key (server-side only) or Strava tokens.
   localStorage is per-origin, readable only by this site. */
try { aiMessages = JSON.parse(localStorage.getItem('ai_chat') || '[]'); if (!Array.isArray(aiMessages)) aiMessages = []; } catch { aiMessages = []; }
function aiPersist() { try { localStorage.setItem('ai_chat', JSON.stringify(aiMessages.slice(-40))); } catch {} }

function aiRenderHistory() {
  const log = document.getElementById('aiLog');
  if (!log) return;
  log.innerHTML = '';
  aiMessages.forEach(m => aiAppend(m.role === 'user' ? 'user' : 'bot', aiMd(m.content)));
}

/* Saved past conversations (the chat log). SAFE: only Q&A text, no secrets. */
function aiLoadChats() { try { const a = JSON.parse(localStorage.getItem('ai_chats') || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function aiSaveChats(a) { try { localStorage.setItem('ai_chats', JSON.stringify(a.slice(0, 40))); } catch {} }

/* Archive the current conversation into the chat log (if it has any messages). */
function aiArchiveCurrent() {
  if (!aiMessages.length) return;
  const firstUser = aiMessages.find(m => m.role === 'user');
  const title = (firstUser ? firstUser.content : 'Conversation').replace(/\s+/g, ' ').trim().slice(0, 60);
  const chats = aiLoadChats();
  chats.unshift({ id: Date.now(), ts: Date.now(), title, messages: aiMessages.slice() });
  aiSaveChats(chats);
}

/* "New chat" — archive the current conversation, then start fresh (not lost). */
function aiClearChat() {
  aiArchiveCurrent();
  aiMessages = [];
  aiPersist();
  const log = document.getElementById('aiLog');
  if (log) log.innerHTML = '';
  const h = document.getElementById('aiHistory');
  if (h && h.style.display !== 'none') aiToggleHistory(); // back to chat view
}

function aiTimeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function aiRenderChatList() {
  const wrap = document.getElementById('aiHistory');
  if (!wrap) return;
  const chats = aiLoadChats();
  if (!chats.length) { wrap.innerHTML = '<div class="ai-hist-empty">No saved conversations yet. Your chats are saved here when you start a new one.</div>'; return; }
  wrap.innerHTML = '<div class="ai-hist-title">Past conversations</div>' + chats.map(c =>
    '<div class="ai-hist-row" onclick="aiOpenChat(' + c.id + ')">'
    + '<div class="ai-hist-info"><div class="ai-hist-name">' + (c.title || 'Conversation').replace(/</g, '&lt;') + '</div>'
    + '<div class="ai-hist-meta">' + aiTimeAgo(c.ts) + ' · ' + Math.ceil(c.messages.length / 2) + ' messages</div></div>'
    + '<button class="ai-hist-del" title="Delete" onclick="event.stopPropagation();aiDeleteChat(' + c.id + ')">✕</button></div>'
  ).join('');
}

function aiOpenChat(id) {
  const chats = aiLoadChats();
  const idx = chats.findIndex(c => c.id === id);
  if (idx < 0) return;
  aiArchiveCurrent();                    // keep the current chat too
  const chat = chats.splice(idx, 1)[0];  // becomes the active one
  aiSaveChats(chats);
  aiMessages = (chat.messages || []).slice();
  aiPersist();
  aiRenderHistory();                     // render into the log
  if (document.getElementById('aiHistory').style.display !== 'none') aiToggleHistory();
}

function aiDeleteChat(id) {
  aiSaveChats(aiLoadChats().filter(c => c.id !== id));
  aiRenderChatList();
}

/* Toggle the history panel (hides the chat composer/log while browsing, then
   restores exactly what was visible before). */
function aiToggleHistory() {
  const h = document.getElementById('aiHistory');
  if (!h) return;
  const open = h.style.display === 'none'; // currently hidden → we're opening it
  const others = [
    document.getElementById('aiLog'), document.getElementById('aiGoal'), document.getElementById('aiHighlight'),
    document.querySelector('#aiModal .ai-form'), document.querySelector('#aiModal .ai-quick'),
  ].filter(Boolean);
  if (open) {
    aiRenderChatList();
    others.forEach(e => { if (e.style.display !== 'none') e.dataset.histHidden = '1'; e.style.display = 'none'; });
    h.style.display = '';
  } else {
    h.style.display = 'none';
    others.forEach(e => { if (e.dataset.histHidden) { delete e.dataset.histHidden; e.style.display = ''; } });
  }
  const hb = document.getElementById('aiHistBtn'); if (hb) hb.textContent = open ? 'Back' : 'History';
}

let aiInsightOff = false; // set true once we learn the provider isn't configured

/* Read the current provider/model (from Settings selects, falling back to saved). */
function aiProviderModel() {
  const provider = (document.getElementById('aiProvider') || {}).value || localStorage.getItem('ai_provider') || 'deepseek';
  const model = ((document.getElementById('aiModel') || {}).value || localStorage.getItem('ai_model') || '').trim() || undefined;
  return { provider, model };
}

/* ── AI activity caption/title rewrite (in the activity modal) ─────────────── */
function aiActivityData(a) {
  const ride = isRide(a);
  return {
    type: a.sport_type || a.type,
    current_name: a.name,
    date: (a.start_date_local || a.start_date || '').slice(0, 10),
    km: +(((a.distance || 0) / 1000).toFixed(1)),
    moving_min: Math.round((a.moving_time || 0) / 60),
    elev_m: Math.round(a.total_elevation_gain || 0),
    avg_kmh: a.average_speed ? +((a.average_speed * 3.6).toFixed(1)) : null,
    max_kmh: a.max_speed ? +((a.max_speed * 3.6).toFixed(1)) : null,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    avg_watts: a.average_watts ? Math.round(a.average_watts) : null,
    kj: a.kilojoules ? Math.round(a.kilojoules) : null,
    location: [a.location_city, a.location_state, a.location_country].filter(Boolean).join(', ') || null,
    prs: a.pr_count || 0, kudos: a.kudos_count || 0, is_ride: ride,
  };
}

/* WMO weather codes → plain words. */
const AI_WMO = { 0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };

/* Historical weather at the activity's place + hour (Open-Meteo, free, no key).
   Archive API for older dates, forecast API for the last few days. Cached. */
async function aiWeather(a) {
  const ll = a.start_latlng;
  const when = a.start_date_local || a.start_date || '';
  const date = when.slice(0, 10);
  if (!ll || ll.length !== 2 || !date) return a.average_temp != null ? { temp_c: Math.round(a.average_temp) } : null;
  const hour = parseInt(when.slice(11, 13) || '0', 10) || 0;
  const key = 'ai_wx_' + ll[0].toFixed(2) + '_' + ll[1].toFixed(2) + '_' + date + '_' + hour;
  const cached = localStorage.getItem(key);
  if (cached !== null) { try { return JSON.parse(cached); } catch { return null; } }

  const ageDays = (Date.now() - new Date(date).getTime()) / 86400000;
  const base = ageDays > 5 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const url = base + '?latitude=' + ll[0] + '&longitude=' + ll[1] + '&start_date=' + date + '&end_date=' + date
    + '&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto';
  let wx = null;
  try {
    const r = await fetch(url);
    if (r.ok) {
      const h = ((await r.json()) || {}).hourly;
      if (h && h.time && h.time.length) {
        let idx = h.time.findIndex(t => t.slice(11, 13) === String(hour).padStart(2, '0'));
        if (idx < 0) idx = Math.min(hour, h.time.length - 1);
        wx = {
          temp_c: h.temperature_2m ? Math.round(h.temperature_2m[idx]) : null,
          condition: h.weather_code ? (AI_WMO[h.weather_code[idx]] || null) : null,
          wind_kmh: h.wind_speed_10m ? Math.round(h.wind_speed_10m[idx]) : null,
          precip_mm: h.precipitation ? h.precipitation[idx] : null,
        };
      }
    }
  } catch {}
  if (!wx && a.average_temp != null) wx = { temp_c: Math.round(a.average_temp) };
  localStorage.setItem(key, JSON.stringify(wx));
  return wx;
}

/* Activity data + weather, for the caption prompt. */
async function aiWithWeather(a) {
  const data = aiActivityData(a);
  try { const wx = await aiWeather(a); if (wx) data.weather = wx; } catch {}
  return data;
}

async function aiCaptionActivity(id) {
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
  const panel = document.getElementById('actAiPanel');
  if (!a || !panel) return;
  const token = localStorage.getItem('strava_access_token');
  if (!token) { panel.innerHTML = '<div class="ai-cap-status err">Connect to Strava first.</div>'; return; }

  const roast = document.getElementById('aiCapRoast') ? document.getElementById('aiCapRoast').checked : true;
  panel.innerHTML = '<div class="ai-cap-loading"><span class="ai-dots"><span></span><span></span><span></span></span> Writing your caption…</div>';
  const { provider, model } = aiProviderModel();
  const messages = [
    { role: 'system', content:
      'You write Strava activity titles and descriptions in the athlete\'s first person ("I"). '
      + 'Always write in English; translate any Indonesian terms (pagi=morning, siang=midday, sore=evening, malam=night, bersepeda=cycling, lari=run, jalan=walk, renang=swim). '
      + (roast ? 'Be fun and witty with a light, good-natured ROAST of the effort. ' : 'Keep an upbeat, motivating tone. ')
      + 'Base everything ONLY on the real numbers provided — never invent. Weave in 2–4 key stats naturally. '
      + 'Title: punchy, under 60 characters. Description: 2–4 short sentences. '
      + 'If a "weather" field is present, weave the conditions in naturally (the heat, rain, wind, etc.). '
      + 'Return EXACTLY the title on the first line, then a blank line, then the description. No labels, no markdown, no surrounding quotes.' },
    { role: 'user', content: 'Activity data (JSON):\n' + JSON.stringify(await aiWithWeather(a)) + '\n\nWrite my new title and description.' },
  ];
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.text) { panel.innerHTML = '<div class="ai-cap-status err">' + aiErrorMessage(data, r.status) + '</div>'; return; }
    const lines = data.text.trim().split('\n');
    const title = (lines.shift() || '').replace(/^["'\s]+|["'\s]+$/g, '');
    const desc = lines.join('\n').replace(/^\s+/, '').trim();
    aiShowCaptionPreview(id, title, desc, 'ai', roast);
  } catch { panel.innerHTML = '<div class="ai-cap-status err">Network error — try again.</div>'; }
}

/* Shared editable preview used by both the AI and the stats (no-AI) buttons. */
function aiShowCaptionPreview(id, title, desc, source, roast) {
  const panel = document.getElementById('actAiPanel');
  if (!panel) return;
  panel.dataset.aiSource = source;
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const regen = source === 'stats' ? "aiStatsCaption('" + id + "')" : "aiCaptionActivity('" + id + "')";
  panel.innerHTML =
    '<div class="ai-cap-field"><label>Title</label><input id="aiCapTitle" class="ai-cap-input" maxlength="100" value="' + esc(title) + '"></div>'
    + '<div class="ai-cap-field"><label>Description</label><textarea id="aiCapDesc" class="ai-cap-input" rows="6">' + esc(desc) + '</textarea></div>'
    + (source === 'ai' ? '<label class="ai-cap-roast"><input type="checkbox" id="aiCapRoast"' + (roast ? ' checked' : '') + '> add roast</label>' : '')
    + '<div class="ai-cap-actions">'
    + '<button class="btn btn-primary" type="button" onclick="aiCaptionApply(\'' + id + '\')">Apply to Strava</button>'
    + '<button class="btn" type="button" onclick="' + regen + '">Regenerate</button>'
    + '<button class="btn" type="button" onclick="document.getElementById(\'actAiPanel\').innerHTML=\'\'">Cancel</button></div>'
    + '<div id="aiCapStatus" class="ai-cap-status"></div>';
}

/* Build a title + stats description purely from the numbers — no AI, no cost. */
function aiStatsTemplate(a, wx) {
  const ride = isRide(a);
  const when = a.start_date_local || a.start_date || '';
  const h = parseInt(when.slice(11, 13) || '0', 10) || 0;
  const tod = h < 11 ? 'Morning' : h < 15 ? 'Afternoon' : h < 19 ? 'Evening' : 'Night';
  const typeLabel = String(a.sport_type || a.type || 'Activity').replace(/([a-z])([A-Z])/g, '$1 $2');
  const title = (tod + ' ' + typeLabel + ' · ' + fmtD(a.distance) + (a.total_elevation_gain > 100 ? ' · ' + fmtElev(a.total_elevation_gain) : '')).slice(0, 100);

  const L = ['Distance: ' + fmtD(a.distance)];
  if (a.moving_time) L.push('Time: ' + fmtT(a.moving_time));
  if (a.total_elevation_gain) L.push('Elevation: ' + fmtElev(a.total_elevation_gain));
  if (a.average_speed) L.push(ride ? 'Avg speed: ' + fmtSpeed(a.average_speed) : 'Avg pace: ' + fmtPace(a.average_speed));
  if (a.max_speed && ride) L.push('Max speed: ' + fmtSpeed(a.max_speed));
  if (a.average_heartrate) L.push('Avg HR: ' + Math.round(a.average_heartrate) + ' bpm');
  if (a.average_watts) L.push('Avg power: ' + Math.round(a.average_watts) + ' W');
  if (a.kilojoules) L.push('Energy: ' + Math.round(a.kilojoules).toLocaleString() + ' kJ');
  if (wx && (wx.temp_c != null || wx.condition)) {
    L.push('Weather: ' + [wx.temp_c != null ? wx.temp_c + '°C' : '', wx.condition || ''].filter(Boolean).join(', ')
      + (wx.wind_kmh ? ', wind ' + wx.wind_kmh + ' km/h' : ''));
  }
  return { title, desc: L.join('\n') };
}

async function aiStatsCaption(id) {
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
  const panel = document.getElementById('actAiPanel');
  if (!a || !panel) return;
  panel.innerHTML = '<div class="ai-cap-loading"><span class="ai-dots"><span></span><span></span><span></span></span> Building from stats…</div>';
  let wx = null; try { wx = await aiWeather(a); } catch {}
  const { title, desc } = aiStatsTemplate(a, wx);
  aiShowCaptionPreview(id, title, desc, 'stats');
}

async function aiCaptionApply(id) {
  const title = (document.getElementById('aiCapTitle') || {}).value || '';
  const desc = (document.getElementById('aiCapDesc') || {}).value || '';
  const status = document.getElementById('aiCapStatus');
  if (!title.trim()) { if (status) { status.className = 'ai-cap-status err'; status.textContent = 'Title cannot be empty.'; } return; }
  if (status) { status.className = 'ai-cap-status'; status.textContent = 'Updating Strava…'; }
  try {
    const src = (document.getElementById('actAiPanel') || {}).dataset ? document.getElementById('actAiPanel').dataset.aiSource : 'ai';
    const tagged = aiCredit(desc, src !== 'stats');
    await apiPut('/activities/' + id, { name: title.trim(), description: tagged });
    const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
    if (a) { a.name = title.trim(); a.description = tagged; }
    aiSyncCache();
    const t = document.getElementById('actModalTitle'); if (t) t.textContent = title.trim();
    if (status) { status.className = 'ai-cap-status ok'; status.textContent = '✓ Updated on Strava.'; }
  } catch (e) {
    if (status) { status.className = 'ai-cap-status err'; status.textContent = 'Update failed (' + ((e && e.message) || e) + '). Your login may need the activity:write permission — reconnect Strava.'; }
  }
}

/* ── Bulk caption tools (gear-style multi-select; AI and no-AI/stats) ─────────
   One generic implementation, instantiated twice via a prefix: 'aiBulk' (mode
   'ai') and 'stBulk' (mode 'stats'). Lives on the Activities page. */
const bulkStop = {};

function bulkBuildList(p) {
  const list = document.getElementById(p + 'List');
  if (!list || typeof acts === 'undefined') return;
  list.innerHTML = (acts || []).map(a => '<label class="gr-row" data-name="' + (a.name || '').toLowerCase().replace(/"/g, '') + '">'
    + '<input type="checkbox" class="bulk-cb" value="' + a.id + '">'
    + '<span class="gr-date">' + fmtDt(a.start_date) + '</span>'
    + '<span class="gr-name">' + (a.name || 'Activity').replace(/</g, '&lt;') + '</span>'
    + '<span class="gr-dist">' + fmtD(a.distance) + '</span>'
    + '</label>').join('');
  const cbs = () => [...list.querySelectorAll('.bulk-cb')];
  const upd = () => { const c = document.getElementById(p + 'Count'); if (c) c.textContent = cbs().filter(x => x.checked).length; };
  list.onchange = upd;
  const all = document.getElementById(p + 'All');
  if (all) { all.checked = false; all.onchange = e => { cbs().forEach(cb => { if (cb.closest('.gr-row').style.display !== 'none') cb.checked = e.target.checked; }); upd(); }; }
  const search = document.getElementById(p + 'Search');
  if (search) search.oninput = e => { const q = e.target.value.toLowerCase(); list.querySelectorAll('.gr-row').forEach(r => { r.style.display = r.dataset.name.includes(q) ? '' : 'none'; }); };
  upd();
}

async function bulkRun(p, mode) {
  const list = document.getElementById(p + 'List'), status = document.getElementById(p + 'Status'), btn = document.getElementById(p + 'Btn'), bar = document.getElementById(p + 'Bar');
  if (!list || !btn) return;
  if (btn.dataset.running === '1') { bulkStop[p] = true; btn.textContent = 'Stopping…'; return; }

  const token = localStorage.getItem('strava_access_token');
  if (!token) { status.className = 'gr-status err'; status.textContent = 'Connect to Strava first.'; return; }
  const ids = [...list.querySelectorAll('.bulk-cb')].filter(c => c.checked).map(c => c.value);
  if (!ids.length) { status.className = 'gr-status warn'; status.textContent = 'Select at least one activity first.'; return; }
  const what = (document.getElementById(p + 'What') || {}).value || 'both';
  const roast = !!(document.getElementById(p + 'Roast') || {}).checked;
  if (!confirm('Rewrite the ' + (what === 'title' ? 'title' : 'title and description') + ' of ' + ids.length + ' activit' + (ids.length > 1 ? 'ies' : 'y') + ' on Strava' + (mode === 'ai' ? ' with AI' : ' from stats') + '?\nThis overwrites them and cannot be undone.')) return;

  bulkStop[p] = false; btn.dataset.running = '1'; btn.textContent = 'Stop';
  const label = btn.dataset.label || 'Apply';
  const restore = () => { btn.dataset.running = ''; btn.innerHTML = label + ' (<span id="' + p + 'Count">' + [...list.querySelectorAll('.bulk-cb')].filter(c => c.checked).length + '</span>)'; };
  const { provider, model } = aiProviderModel();
  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i++) {
    if (bulkStop[p]) break;
    status.className = 'gr-status'; status.textContent = 'Updating ' + (i + 1) + ' / ' + ids.length + '…';
    const a = (acts || []).find(x => String(x.id) === String(ids[i]));
    if (!a) { fail++; continue; }
    try {
      let name = '', desc = '';
      if (mode === 'stats') {
        let wx = null; try { wx = await aiWeather(a); } catch {}
        const t = aiStatsTemplate(a, wx); name = t.title; desc = t.desc;
      } else {
        const messages = [
          { role: 'system', content: 'You write Strava activity titles and descriptions in first person ("I"). Always write in English; translate any Indonesian terms (pagi=morning, siang=midday, sore=evening, malam=night, bersepeda=cycling, lari=run, jalan=walk, renang=swim). ' + (roast ? 'Be fun and witty with a light, good-natured roast. ' : 'Keep an upbeat, motivating tone. ') + 'If a "weather" field is present, weave the conditions in naturally. Base everything ONLY on the real numbers provided — never invent. Weave in 2–4 key stats. Title under 60 characters. Description 2–4 short sentences. Return EXACTLY the title on the first line, a blank line, then the description. No labels, no markdown, no quotes.' },
          { role: 'user', content: 'Activity data (JSON):\n' + JSON.stringify(await aiWithWeather(a)) + '\n\nWrite my new title and description.' },
        ];
        const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model }) });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.text) { const lines = data.text.trim().split('\n'); name = (lines.shift() || '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 100); desc = lines.join('\n').trim(); }
      }
      if (name) {
        const credited = aiCredit(desc, mode !== 'stats');
        await apiPut('/activities/' + a.id, what === 'title' ? { name } : { name, description: credited });
        a.name = name; if (what !== 'title') a.description = credited;
        const cb = list.querySelector('.bulk-cb[value="' + a.id + '"]');
        if (cb) { const row = cb.closest('.gr-row'); const nm = row.querySelector('.gr-name'); if (nm) nm.textContent = name; cb.checked = false; row.classList.add('gr-done'); }
        ok++;
      } else fail++;
    } catch { fail++; }
    if (bar) bar.style.width = Math.round((i + 1) / ids.length * 100) + '%';
    await new Promise(res => setTimeout(res, mode === 'stats' ? 400 : 800)); // throttle for Strava rate limits
  }
  restore();
  if (ok) { aiSyncCache(); if (typeof renderAll === 'function') { try { renderAll(); } catch {} } }
  status.className = 'gr-status ' + (fail && !ok ? 'err' : 'ok');
  status.textContent = (bulkStop[p] ? 'Stopped. ' : 'Done. ') + 'Updated ' + ok + (fail ? ', ' + fail + ' failed' : '') + '.';
  setTimeout(() => { if (bar) bar.style.width = '0%'; }, 1500);
}

/* Verify the selected provider works (no tokens spent). Reused by the Test
   button and auto-run when the provider/model changes, so the choice is clearly
   saved AND confirmed working. */
async function aiTestConnection(savedHint) {
  const out = document.getElementById('aiTestResult');
  const btn = document.getElementById('aiTestBtn');
  if (!out) return;
  const token = localStorage.getItem('strava_access_token');
  if (!token) { out.className = 'ai-test-result err'; out.textContent = 'Connect to Strava first.'; return; }
  const { provider, model } = aiProviderModel();
  out.className = 'ai-test-result'; out.textContent = (savedHint ? 'Saved ✓ — ' : '') + 'checking ' + provider + '…';
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, provider, model, test: true }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) { aiInsightOff = false; out.className = 'ai-test-result ok'; out.innerHTML = '✓ Saved — <b>' + provider + '</b> is configured and ready.'; }
    else { out.className = 'ai-test-result err'; out.innerHTML = aiErrorMessage(data, r.status); }
  } catch { out.className = 'ai-test-result err'; out.textContent = 'Network error — could not reach the server.'; }
  finally { if (btn) btn.disabled = false; }
}

/* Per-section AI insight — analyses exactly what is RENDERED ON THE PAGE (the
   actual stat cards / tables / numbers the user sees, in their chosen units),
   not the global summary. Cached per section by a hash of the on-screen text,
   so it only calls the AI when what's shown actually changes. */
const AI_SECTION_LABEL = {
  statRow:           'Overview',
  cyclingSection:    'Cycling',
  runningSection:    'Running',
  trendsSection:     'Trends',
  monthlySection:    'Monthly',
  bestSection:       'Best Efforts',
  milestonesSection: 'Milestones',
  rewindSection:     'Rewind',
  challengesSection: 'Trophies — all-time, year-to-date and last-4-week training totals (these are training stats, NOT KOM/segment awards)',
  calSection:        'Calendar — activity frequency and consistency',
  heatSection:       'Heatmap — where you train (geographic spread of routes)',
};

/* Per-section computed context for pages whose data isn't readable from the DOM
   (a map, a calendar grid). Kept factual and aggregate — no place names. */
const AI_SECTION_EXTRA = {
  async heatSection() {
    const mapped = acts.filter(a => a.start_latlng && a.start_latlng.length === 2);
    if (!mapped.length) return 'No GPS-mapped activities.';

    // densest ~1km cell = the area ridden most often
    const cells = {};
    mapped.forEach(a => {
      const k = a.start_latlng[0].toFixed(2) + ',' + a.start_latlng[1].toFixed(2);
      (cells[k] || (cells[k] = { n: 0, lat: 0, lng: 0 }));
      cells[k].n++; cells[k].lat += a.start_latlng[0]; cells[k].lng += a.start_latlng[1];
    });
    const top = Object.values(cells).sort((x, y) => y.n - x.n)[0];
    const mainLat = top.lat / top.n, mainLng = top.lng / top.n;
    const mainArea = await aiReverseGeocode(mainLat, mainLng, 14);

    // rides furthest from that main area, with their location names
    const byDist = mapped.map(a => ({ a, d: aiHaversine(mainLat, mainLng, a.start_latlng[0], a.start_latlng[1]) }))
      .sort((x, y) => y.d - x.d);
    const far = [];
    for (let i = 0; i < byDist.length && far.length < 2; i++) {
      if (byDist[i].d < 5) break; // not meaningfully far from home
      const w = byDist[i];
      const loc = await aiReverseGeocode(w.a.start_latlng[0], w.a.start_latlng[1], 12);
      far.push('"' + ((w.a.name || 'a ride').slice(0, 40)) + '"' + (loc ? ' in ' + loc : '') + ' (~' + Math.round(w.d) + ' km from home)');
    }

    let s = mapped.length + ' of ' + acts.length + ' activities have GPS routes. Most-ridden area: ' + (mainArea || 'home area') + ' — ' + top.n + ' rides start there.';
    if (far.length) s += ' Furthest rides from there: ' + far.join('; ') + '.';
    return s;
  },
  calSection() {
    const now = Date.now(), DAY = 86400000, days = new Set();
    let d30 = 0, d90 = 0;
    acts.forEach(a => {
      if (a.start_date) days.add(a.start_date.slice(0, 10));
      const age = (now - new Date(a.start_date).getTime()) / DAY;
      if (age <= 30) d30++; if (age <= 90) d90++;
    });
    return acts.length + ' activities across ' + days.size + ' distinct days. Last 30 days: ' + d30 + ' activities; last 90 days: ' + d90 + '.';
  },
};

function aiHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h.toString(36); }

/* Distance between two lat/lng points in km (haversine). */
function aiHaversine(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Reverse-geocode to a place name (cached). zoom controls granularity:
   ~14 → district/suburb, ~12 → town/city. Returns '' on failure (also cached). */
async function aiReverseGeocode(lat, lng, zoom) {
  zoom = zoom || 12;
  const key = 'ai_geo_' + zoom + '_' + lat.toFixed(3) + '_' + lng.toFixed(3);
  const cached = localStorage.getItem(key);
  if (cached !== null) return cached;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=' + zoom + '&lat=' + lat + '&lon=' + lng, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const a = ((await r.json()) || {}).address || {};
      const local = a.suburb || a.neighbourhood || a.city_district || a.village || a.town || a.municipality || a.city || a.county || a.state_district || '';
      const region = a.city || a.county || a.state || a.country || '';
      const place = [local, region && region !== local ? region : ''].filter(Boolean).join(', ');
      localStorage.setItem(key, place);
      return place;
    }
  } catch {}
  return '';
}

/* Visible text of a section, excluding the insight banner itself. */
function aiSectionText(sec) {
  const parts = [];
  sec.childNodes.forEach(n => {
    if (n.nodeType === 1 && n.classList && n.classList.contains('ai-insight')) return;
    const t = (n.innerText || n.textContent || '').trim();
    if (t) parts.push(t);
  });
  return parts.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 1800);
}

/* Data behind the charts on a page (Chart.js draws numbers into <canvas>, so
   they're invisible to text scraping). Reads each chart's labels + series. */
function aiChartData(sec) {
  if (typeof charts === 'undefined' || !charts) return '';
  const out = [];
  sec.querySelectorAll('canvas').forEach(cv => {
    const ch = charts[cv.id];
    if (!ch || !ch.data || !ch.data.datasets) return;
    let title = '', p = cv.parentElement, hops = 0;
    while (p && p !== sec && hops < 4 && !title) {
      const head = p.querySelector('[class*="title" i], h2, h3, h4');
      if (head && head.innerText) title = head.innerText.trim().split('\n')[0];
      p = p.parentElement; hops++;
    }
    const labels = ch.data.labels || [];
    ch.data.datasets.forEach(ds => {
      const vals = (ds.data || []).map((v, i) => {
        const num = (v && typeof v === 'object') ? (v.y != null ? v.y : (v.r != null ? v.r : '')) : v;
        return (labels[i] != null ? labels[i] : i) + '=' + num;
      });
      if (vals.length) out.push((title || ds.label || 'series') + (title && ds.label ? ' / ' + ds.label : '') + ': ' + vals.join(', '));
    });
  });
  return out.join('\n').slice(0, 2600);
}

async function aiSectionInsight(sectionId, tries = 0) {
  const label = AI_SECTION_LABEL[sectionId];
  if (!label || aiInsightOff) return;
  if (typeof acts === 'undefined' || !acts.length) return;
  const sec = document.getElementById(sectionId);
  if (!sec) return;

  let el = sec.querySelector(':scope > .ai-insight');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ai-insight';
    const title = sec.querySelector(':scope > .section-title');
    if (title) title.insertAdjacentElement('afterend', el); else sec.insertBefore(el, sec.firstChild);
  }
  const render = txt => { el.style.display = ''; el.innerHTML = '<span class="ai-ins-icon">' + AI_ICON + '</span><div class="ai-ins-text">' + txt + '</div>'; };

  // Build context from what's on the page: visible text + chart data + any
  // per-section computed extras (for map/calendar pages with no on-screen text).
  const screen = aiSectionText(sec);
  const chartTxt = aiChartData(sec);
  let extra = '';
  try { const fn = AI_SECTION_EXTRA[sectionId]; extra = fn ? await fn() : ''; } catch {}
  const combined = [screen, chartTxt && ('Chart data (label=value):\n' + chartTxt), extra].filter(Boolean).join('\n\n').trim();

  // Some pages (Trophies, Gear, Segments) load asynchronously — retry until ready.
  if (combined.length < 30) {
    if (tries < 8) { render('<span class="ai-dots"><span></span><span></span><span></span></span>'); setTimeout(() => aiSectionInsight(sectionId, tries + 1), 500); }
    else el.remove();
    return;
  }
  const key = 'ai_ins_' + sectionId, sig = aiHash(combined); // changes if displayed numbers/units change
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.sig === sig && c.text) { render(aiMd(c.text)); return; } } catch {}

  const token = localStorage.getItem('strava_access_token');
  if (!token) { el.remove(); return; }
  const { provider, model } = aiProviderModel();
  const messages = [
    { role: 'system', content:
      'You are a sharp, neutral sports-data analyst. From what is shown on one dashboard page, surface ONE specific, non-obvious insight that CONNECTS multiple numbers — e.g. how speed relates to distance or elevation, a trend across weeks/months, the balance between sports, consistency, or an outlier and what it implies. '
      + 'Do NOT just praise a single headline stat (like top speed) and do NOT use motivational filler or exclamations. Use ONLY the numbers given; never invent data or mention metrics that are not present. Always reply in English. 1–2 plain sentences, max 40 words. No headings, no preamble.' },
    { role: 'user', content: 'This is the "' + label + '" page. On-screen content (headings, stats and chart data):\n"""\n' + combined + '\n"""\nGive one analytical insight connecting these numbers.' },
  ];
  render('<span class="ai-dots"><span></span><span></span><span></span></span>');
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.text) { localStorage.setItem(key, JSON.stringify({ sig, text: data.text })); render(aiMd(data.text)); }
    else { if (data.error === 'provider_not_configured' || data.error === 'not_authorized') aiInsightOff = true; el.remove(); }
  } catch { el.remove(); }
}

/* A signature of the current activity data — changes when a new activity
   appears (or a refresh adds data), so we can cache the highlight until then. */
function aiDataSig() {
  if (typeof acts === 'undefined' || !acts.length) return 'none';
  const a = acts[0] || {};
  return acts.length + ':' + (a.id || '') + ':' + (a.start_date || '');
}

/* Auto "highlight" shown at the top of the popup. Cached in localStorage and
   only regenerated when the data signature changes (new activity / refresh). */
async function aiLoadHighlight() {
  const el = document.getElementById('aiHighlight');
  if (!el) return;
  if (typeof acts === 'undefined' || !acts.length) { el.style.display = 'none'; return; }
  const sig = aiDataSig();
  const show = inner => { el.style.display = ''; el.innerHTML = '<div class="ai-hl-label">' + AI_ICON + ' Highlight</div><div class="ai-hl-body">' + inner + '</div>'; };

  // serve cached highlight unless new data has arrived
  if (localStorage.getItem('ai_highlight_sig') === sig) {
    const cached = localStorage.getItem('ai_highlight');
    if (cached) { show(aiMd(cached)); return; }
  }
  const token = localStorage.getItem('strava_access_token');
  if (!token) { el.style.display = 'none'; return; }
  const provider = (document.getElementById('aiProvider') || {}).value || localStorage.getItem('ai_provider') || 'deepseek';
  const model = ((document.getElementById('aiModel') || {}).value || localStorage.getItem('ai_model') || '').trim() || undefined;
  const summary = aiSummaryCache || (aiSummaryCache = aiBuildSummary());
  const messages = [
    { role: 'system', content: AI_SYS + '\n\nAthlete data (JSON):\n' + JSON.stringify(summary) },
    { role: 'user', content: 'In ONE short sentence (max 25 words), give the single most noteworthy highlight about my recent training. No preamble, no headings, no markdown.' },
  ];
  show('<span class="ai-dots"><span></span><span></span><span></span></span>');
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.text) {
      localStorage.setItem('ai_highlight', data.text);
      localStorage.setItem('ai_highlight_sig', sig);
      show(aiMd(data.text));
    } else { el.style.display = 'none'; }
  } catch { el.style.display = 'none'; }
}

/* Popup open/close (global so inline onclick can call them). */
function openAIModal() {
  const m = document.getElementById('aiModal');
  if (!m) return;
  m.classList.add('open');
  aiLoadHighlight();
  setTimeout(() => { const i = document.getElementById('aiInput'); if (i) i.focus(); }, 60);
}
function closeAIModal() {
  const m = document.getElementById('aiModal');
  if (m) m.classList.remove('open');
}

/* Developer mode: visit with ?dev=1 to reveal owner/dev-only setup notes
   (Vercel env-var steps, key-safety disclaimer). Persists; ?dev=0 turns it off. */
(function () {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('dev') === '1') localStorage.setItem('dev_mode', '1');
    if (p.get('dev') === '0') localStorage.removeItem('dev_mode');
    if (localStorage.getItem('dev_mode') === '1' && document.body) document.body.classList.add('dev');
  } catch {}
})();

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
  const row = document.createElement('div');
  row.className = 'ai-row ai-row-' + role;
  if (role === 'bot') {
    const av = document.createElement('div');
    av.className = 'ai-avatar';
    av.innerHTML = AI_ICON;
    row.appendChild(av);
  }
  const div = document.createElement('div');
  div.className = 'ai-msg ai-' + role + (cls ? ' ' + cls : '');
  div.innerHTML = html;
  row.appendChild(div);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return row; // return the row so the "thinking" placeholder removes cleanly
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
  aiPersist();
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
    aiPersist();
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

  // remember the chosen provider/model across visits — and on change, save +
  // auto-check so it's obvious the choice stuck and whether that provider works
  const prov = document.getElementById('aiProvider'), mdl = document.getElementById('aiModel');
  if (prov) {
    const saved = localStorage.getItem('ai_provider'); if (saved) prov.value = saved;
    prov.onchange = () => { localStorage.setItem('ai_provider', prov.value); aiTestConnection(true); };
  }
  if (mdl) {
    mdl.value = localStorage.getItem('ai_model') || '';
    mdl.onchange = () => { localStorage.setItem('ai_model', mdl.value.trim()); aiTestConnection(true); };
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

  // Settings → Save (persist choice) and Test connection (token-free check)
  const saveBtn = document.getElementById('aiSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (prov) localStorage.setItem('ai_provider', prov.value);
    if (mdl) localStorage.setItem('ai_model', mdl.value.trim());
    const out = document.getElementById('aiTestResult');
    if (out) { out.className = 'ai-test-result ok'; out.innerHTML = 'Saved ✓ — <b>' + (prov ? prov.value : 'provider') + '</b> selected. Tap “Test connection” to verify it works.'; }
  });
  const testBtn = document.getElementById('aiTestBtn');
  if (testBtn) testBtn.addEventListener('click', () => aiTestConnection(false));

  // restore saved conversation; close modal on backdrop click or Esc
  aiRenderHistory();
  const aiModal = document.getElementById('aiModal');
  if (aiModal) aiModal.addEventListener('click', e => { if (e.target === aiModal) closeAIModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && aiModal && aiModal.classList.contains('open')) closeAIModal(); });

  document.querySelectorAll('#aiModal [data-ai-prompt]').forEach(btn => {
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

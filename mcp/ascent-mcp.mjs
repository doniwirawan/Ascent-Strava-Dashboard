#!/usr/bin/env node
// Ascent MCP server — the owner's own data (Personal API, /api/v1) as tools for Claude.
//
//   Runs locally over stdio (newline-delimited JSON-RPC), no dependencies. Read-only:
//   the API's one write (POST /sleep) is left out on purpose.
//
//   Token: ASCENT_API_TOKEN, else API_TOKEN from android/personal.properties
//   (gitignored). Make / revoke tokens in Settings → Personal API.
//
//   claude mcp add --scope user ascent -- node <repo>/mcp/ascent-mcp.mjs
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const BASE = (process.env.ASCENT_API_BASE || 'https://ascent-analytics.doniwirawan.xyz/api/v1').replace(/\/$/, '');
const clean = s => String(s || '').trim().replace(/^["']|["']$/g, '').replace(/\\n$/, '').trim();

function token() {
  if (process.env.ASCENT_API_TOKEN) return clean(process.env.ASCENT_API_TOKEN);
  try {
    const props = readFileSync(new URL('../android/personal.properties', import.meta.url), 'utf8');
    const m = props.match(/^\s*API_TOKEN\s*=\s*(.+)$/m);
    return m ? clean(m[1]) : '';
  } catch { return ''; }
}

async function api(path, query = {}) {
  const t = token();
  if (!t) throw new Error('No API token: set ASCENT_API_TOKEN or API_TOKEN in android/personal.properties');
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(BASE + path + (qs.size ? '?' + qs : ''), { headers: { Authorization: 'Bearer ' + t } });
  const body = await r.json().catch(() => ({ error: 'bad_json', status: r.status }));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
  return body;
}

const flag = b => (b ? '1' : undefined);
// Rides start at home: no coordinates, routes or start town ever reach the model.
const PRIVATE = new Set(['start_latlng', 'end_latlng', 'polyline', 'summary_polyline', 'latlng', 'track', 'location_city', 'location_state', 'location_country']);
const scrub = v => Array.isArray(v) ? v.map(scrub)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !PRIVATE.has(k)).map(([k, x]) => [k, scrub(x)])) : v;

const TOOLS = [
  { name: 'profile', description: 'Strava profile with bikes and shoes (live from Strava).',
    inputSchema: { type: 'object', properties: {} }, run: () => api('/me') },

  { name: 'activities', description: 'Cached Strava activities, newest first. Distances in metres, speeds in m/s, times in seconds.',
    inputSchema: { type: 'object', properties: {
      limit: { type: 'integer', description: '1–500, default 50' }, offset: { type: 'integer' },
      type: { type: 'string', description: 'Comma list of sport types, e.g. Ride,GravelRide,Run' },
      after: { type: 'string', description: 'YYYY-MM-DD, inclusive' }, before: { type: 'string', description: 'YYYY-MM-DD, exclusive' } } },
    run: a => api('/activities', { limit: a.limit, offset: a.offset, type: a.type, after: a.after, before: a.before }) },

  { name: 'activity', description: 'One activity by Strava id. detail adds segment efforts, best efforts and PR/KOM ranks; streams adds per-second data (large).',
    inputSchema: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, detail: { type: 'boolean' },
      streams: { type: 'string', description: 'Comma list (watts,heartrate,cadence,velocity_smooth,altitude,distance,time,grade_smooth,temp) or "all"; latlng is never returned' },
      live: { type: 'boolean', description: 'Ask Strava when it is not cached' } } },
    run: a => api('/activities/' + encodeURIComponent(a.id), { detail: flag(a.detail), live: flag(a.live), streams: a.streams === 'all' ? '1' : a.streams }) },

  { name: 'stats', description: 'Dashboard totals: all-time, YTD, last 7/30 days, bests, by month / sport, calendar, streak, fitness (CTL/ATL/TSB).',
    inputSchema: { type: 'object', properties: {} }, run: () => api('/stats') },

  { name: 'strava_stats', description: 'Strava’s own all-time / YTD / last-4-week totals.',
    inputSchema: { type: 'object', properties: {} }, run: () => api('/strava-stats') },

  { name: 'sleep', description: 'Sleep nights (Huawei export + Health Connect). Minutes; bed/up are local hours (bed negative before midnight); a night is dated by the morning woken. Returned as one object per night.',
    inputSchema: { type: 'object', properties: {
      after: { type: 'string', description: 'YYYY-MM-DD, inclusive' }, before: { type: 'string', description: 'YYYY-MM-DD, exclusive' },
      last: { type: 'integer', description: 'Only the newest N nights (default 30 when no dates given)' } } },
    run: async a => {
      const { cols, rows, ...meta } = await api('/sleep');
      let nights = rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]]).filter(([, v]) => v !== null)));
      if (a.after) nights = nights.filter(n => n.date >= a.after);
      if (a.before) nights = nights.filter(n => n.date < a.before);
      nights.sort((x, y) => x.date.localeCompare(y.date));
      const last = a.last || (a.after || a.before ? 0 : 30);
      if (last) nights = nights.slice(-last);
      return { ...meta, total: nights.length, nights };
    } },

  { name: 'huawei_workouts', description: 'Huawei watch workouts, or one by record_id (no GPS track).',
    inputSchema: { type: 'object', properties: { record_id: { type: 'string' }, limit: { type: 'integer', description: 'List only: newest N, default 50' } } },
    run: async a => {
      if (a.record_id) return api('/huawei/' + encodeURIComponent(a.record_id));
      const { workouts } = await api('/huawei');
      return { total: workouts.length, workouts: workouts.slice(0, a.limit || 50) };
    } },

  { name: 'purchases', description: 'Purchases from the finance app (IDR). Cancelled orders hidden unless cancelled=true.',
    inputSchema: { type: 'object', properties: {
      category: { type: 'string', description: 'e.g. Cycling' }, after: { type: 'string' }, before: { type: 'string' }, cancelled: { type: 'boolean' } } },
    run: a => api('/purchases', { category: a.category, after: a.after, before: a.before, cancelled: flag(a.cancelled) }) },

  { name: 'bikes', description: 'Each bike with the parts assigned to it and what they cost.',
    inputSchema: { type: 'object', properties: {} }, run: () => api('/bikes') },

  { name: 'ai', description: 'Saved AI analyses + captions per activity, or the AI Coach chats.',
    inputSchema: { type: 'object', properties: { chats: { type: 'boolean', description: 'Coach conversations instead of per-activity analyses' } } },
    run: a => api(a.chats ? '/ai/chats' : '/ai') },

  { name: 'app_release', description: 'Newest published Android build (versionCode, versionName, notes).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => { const { url, ...r } = await api('/app'); return r; } },
];

/* ── MCP over stdio ── */
const send = msg => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle({ id, method, params }) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} },
        serverInfo: { name: 'ascent', version: '1.0.0' },
        instructions: 'The owner’s own cycling / training / sleep / spending data from Ascent (ascent-analytics.doniwirawan.xyz). Read-only. Coordinates and start towns are stripped because rides start at the owner’s home; never guess or mention where rides start.' };
    case 'ping': return {};
    case 'tools/list': return { tools: TOOLS.map(({ run, ...t }) => t) };
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params.name);
      if (!tool) throw Object.assign(new Error('Unknown tool: ' + params.name), { code: -32602 });
      try { return { content: [{ type: 'text', text: JSON.stringify(scrub(await tool.run(params.arguments || {}))) }] }; }
      catch (e) { return { content: [{ type: 'text', text: String(e.message || e) }], isError: true }; }
    }
  }
  if (id === undefined) return;                 // notifications (initialized, cancelled) need no answer
  throw Object.assign(new Error('Method not found: ' + method), { code: -32601 });
}

createInterface({ input: process.stdin }).on('line', async line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  try { const result = await handle(msg); if (msg.id !== undefined && result !== undefined) send({ id: msg.id, result }); }
  catch (e) { if (msg.id !== undefined) send({ id: msg.id, error: { code: e.code || -32603, message: e.message } }); }
});

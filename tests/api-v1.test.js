// Personal API write routes, against a stubbed fetch (no Supabase / Strava calls).
const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k', OWNER_ATHLETE_ID: '1',
  STRAVA_CLIENT_ID: 'c', STRAVA_CLIENT_SECRET: 's',
});

let description = '';
const puts = [];
global.fetch = async (url, init = {}) => {
  const json = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.startsWith('https://sb.test/rest/v1/api_tokens')) return json(init.method === 'PATCH' ? null : [{ id: 7 }]);
  if (url.startsWith('https://sb.test/rest/v1/owner_tokens')) return json([{ refresh_token: 'r' }]);
  if (url === 'https://www.strava.com/oauth/token') return json({ access_token: 'a', refresh_token: 'r' });
  if (url === 'https://www.strava.com/api/v3/activities/42') {
    if (init.method === 'PUT') { const b = JSON.parse(init.body); puts.push(b); description = b.description; return json({}); }
    return json({ description });
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

const handler = require('../api/_v1.js');
function call(path, method, body, auth = 'Bearer asc_' + 'x'.repeat(24)) {
  return new Promise(done => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(b) { done({ code: this.code, body: b }); }, end() { done({ code: this.code }); } };
    handler({ method, query: { v1: path }, headers: { authorization: auth }, body }, res);
  });
}

test('gps-note appends the note and keeps the rest of the description', async () => {
  description = 'Morning loop\nwith friends';
  const r = await call('activities/42/gps-note', 'POST', { raw: 30, fixed: 15 });
  assert.equal(r.code, 200);
  assert.equal(description, 'Morning loop\nwith friends\n\n⚠️ GPS glitch: recorded max 108.0 km/h → real max ≈ 54.0 km/h (normalized in dashboard)');
  assert.deepEqual(Object.keys(puts.at(-1)), ['description']);   // nothing but the description is sent
});

test('gps-note replaces an older note instead of stacking', async () => {
  await call('activities/42/gps-note', 'POST', JSON.stringify({ raw: 25, fixed: 14 }));
  assert.equal(description.split('GPS glitch').length - 1, 1);
  assert.ok(description.startsWith('Morning loop\nwith friends\n\n⚠️ GPS glitch: recorded max 90.0 km/h'));
});

test('gps-note rejects bad numbers, missing tokens and GET', async () => {
  const n = puts.length;
  assert.equal((await call('activities/42/gps-note', 'POST', { raw: 10, fixed: 15 })).code, 400);
  assert.equal((await call('activities/42/gps-note', 'POST', { raw: 'x' })).code, 400);
  assert.equal((await call('activities/42/gps-note', 'POST', { raw: 30, fixed: 15 }, '')).code, 401);
  assert.equal((await call('activities/42/gps-note', 'PUT', { raw: 30, fixed: 15 })).code, 405);
  assert.equal(puts.length, n);
});

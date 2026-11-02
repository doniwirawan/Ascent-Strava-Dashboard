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
    return json({ description, id: 42, name: 'Morning Ride', sport_type: 'Ride', type: 'Ride', distance: 40000, moving_time: 5400, elapsed_time: 6000,
      total_elevation_gain: 300, average_speed: 7.4, max_speed: 14, start_date: '2026-10-30T23:00:00Z', start_date_local: '2026-10-31T07:00:00Z' });
  }
  if (url.startsWith('https://sb.test/rest/v1/huawei_workouts')) {
    const id = /record_id=eq\.([^&]+)/.exec(url)[1];
    if (init.method === 'PATCH') { links.push({ id, ...JSON.parse(init.body) }); return json(null); }
    return json(workouts[id] ? [workouts[id]] : []);
  }
  if (url === 'https://www.strava.com/api/v3/uploads' && init.method === 'POST') {
    const f = init.body.get('file'); uploads.push({ type: init.body.get('data_type'), name: init.body.get('name'), file: await f.text() });
    return json({ id_str: '9', activity_id: null });
  }
  if (url === 'https://www.strava.com/api/v3/uploads/9') return json({ id_str: '9', activity_id: 77 });
  if (url === 'https://www.strava.com/api/v3/activities/77' && init.method === 'PUT') { puts.push({ id: 77, ...JSON.parse(init.body) }); return json({}); }
  if (url === 'https://www.strava.com/api/v3/activities' && init.method === 'POST') { created.push(JSON.parse(init.body)); return json({ id: 88 }); }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const links = [], uploads = [], created = [];
const workouts = {
  badm: { record_id: 'badm', sport_type: 129, sport: 'Badminton', start_time: '2026-10-30T11:00:00Z', end_time: '2026-10-30T12:00:00Z', tz: '+0800',
    duration_s: 3600, avg_hr: 140, max_hr: 175, calories: 500, hr_samples: 2, polyline: null,
    track: { cols: ['t', 'hr'], rows: [[1793358000, 120], [1793361600, 150]] } },
  yoga: { record_id: 'yoga', sport_type: 999, start_time: '2026-10-29T23:00:00Z', end_time: '2026-10-30T00:00:00Z', tz: '+0800', duration_s: 3600, hr_samples: 0, polyline: null },
  done: { record_id: 'done', strava_id: '5', strava_kind: 'file' },
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

test('caption rewrites title + description through the webhook pipeline (stats fallback without an AI key)', async () => {
  delete process.env.DEEPSEEK_API_KEY;
  const n = puts.length;
  const r = await call('activities/42/caption', 'POST', {});
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.ok(r.body.ok && r.body.name);
  const sent = puts.slice(n);
  assert.ok(sent.length >= 1);
  assert.ok(sent.every(b => !('private_note' in b)), 'the private note is never touched');
  assert.equal(sent.at(-1).name, r.body.name);
});

test('huawei upload: HR-only workout goes up as a TCX, gets its sport + stats line, and is linked', async () => {
  const r = await call('huawei/badm/upload', 'POST', { name: 'Badminton night' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.strava_id, r.body.kind], ['77', 'file']);
  assert.equal(uploads[0].type, 'tcx');
  assert.equal(uploads[0].name, 'Badminton night');
  assert.ok(uploads[0].file.includes('<HeartRateBpm><Value>150</Value>'));
  const put = puts.find(p => p.id === 77);
  assert.equal(put.sport_type, 'Badminton');
  assert.ok(put.description.startsWith('⌚ Huawei: 1h 0m'));
  assert.deepEqual(links.at(-1), { id: 'badm', strava_id: '77', strava_kind: 'file' });
});

test('huawei upload: no GPS and no HR becomes a manual activity in local time', async () => {
  const r = await call('huawei/yoga/upload', 'POST', {});
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(created[0].start_date_local, '2026-10-30T07:00:00');
  assert.equal(created[0].sport_type, 'Workout');
  assert.equal(created[0].name, 'Morning Workout');
  assert.deepEqual(links.at(-1), { id: 'yoga', strava_id: '88', strava_kind: 'manual' });
});

test('huawei upload refuses a workout already on Strava, and unknown ones', async () => {
  assert.equal((await call('huawei/done/upload', 'POST', {})).code, 409);
  assert.equal((await call('huawei/nope/upload', 'POST', {})).code, 404);
});

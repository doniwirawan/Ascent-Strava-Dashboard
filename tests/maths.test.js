// Unit tests for the power / training maths. Run: npm test
// The js/ files are plain browser scripts, so they're loaded into one VM context
// (shared globals, like the page) with just enough stubs to evaluate.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const store = {};
const ctx = {
  console, setTimeout, clearTimeout,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  Blob, Response, CompressionStream, DecompressionStream, btoa, atob,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['utils', 'fitness', 'sauce', 'power-curve', 'training']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const g = ctx;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const fill = (n, v) => new Array(n).fill(v);
const range = n => Array.from({ length: n }, (_, i) => i);

/* ── power-curve.js ── */

test('pcSeconds holds each smart-recorded sample until the next one', () => {
  const s = Array.from(g.pcSeconds([100, 200, 300], [0, 8, 16]));
  assert.equal(s.length, 17);
  assert.deepEqual(s.slice(0, 8), fill(8, 100));
  assert.deepEqual(s.slice(8, 16), fill(8, 200));
  assert.equal(s[16], 300);
});

test('pcSeconds treats a gap over 30 s as a stop (0 W)', () => {
  const s = Array.from(g.pcSeconds([200, 200], [0, 100]));
  assert.equal(s[0], 200);
  assert.ok(s.slice(1, 100).every(x => x === 0));
  assert.equal(s[100], 200);
});

test('pcBestWindow finds a 60 s block on 1 Hz data', () => {
  const w = [...fill(300, 150), ...fill(60, 320), ...fill(300, 150)];
  const r = g.pcBestWindow(w, range(w.length), 60);
  assert.equal(r.w, 320);
  assert.equal(r.from, 300);
  assert.equal(r.to, 359);
});

test('pcBestWindow on smart recording averages the samples, not the gaps', () => {
  // 8 s sampling: a 60 s window holds 8 samples, never more.
  const T = range(100).map(i => i * 8);
  const w = T.map((_, i) => (i >= 40 && i < 48 ? 400 : 100));
  near(g.pcBestWindow(w, T, 60).w, 400, 1e-9);
});

test('pcBestWindow returns null when the ride is shorter than the window', () => {
  assert.equal(g.pcBestWindow(fill(30, 200), range(30), 60), null);
});

/* ── sauce.js: physics ── */

test('spAirDensity is 1.225 kg/m³ at sea level, 15 °C, and thins with altitude and heat', () => {
  near(g.spAirDensity(0, 15), 1.225, 1e-9);
  assert.ok(g.spAirDensity(1000, 15) < 1.225);
  assert.ok(g.spAirDensity(0, 32) < g.spAirDensity(0, 15));
});

test('spPowerAt matches pure gravity work on a climb (no drag, no rolling)', () => {
  const bike = { crr: 0, cda: 0 }, m = 85, v = 3, slope = 0.08;
  const expect = 9.80655 * Math.sin(Math.atan(slope)) * m * v / (1 - 0.035);
  near(g.spPowerAt(v, slope, m, bike, 1.2), expect, 1e-9);
  assert.equal(g.spPowerAt(0, slope, m, { crr: 0.005, cda: 0.3 }, 1.2), 0);
});

test('spEstimateWatts gives 0 W when stopped and clamps to 0–2000 W', () => {
  const n = 20, s = { time: range(n), velocity: [...fill(10, 0), ...fill(10, 30)], grade: fill(n, 25), altitude: fill(n, 0) };
  const w = g.spEstimateWatts(s, 85, { crr: 0.005, cda: 0.3 }, 25);
  assert.ok(w.slice(0, 10).every(x => x === 0));
  assert.ok(w.every(x => x >= 0 && x <= 2000));
  assert.equal(w[19], 2000);
});

/* ── sauce.js: active series + peaks ── */

test('_spActive fills seconds between samples and drops stops and long gaps', () => {
  const s = { time: [0, 5, 10, 30, 35], moving: [true, true, false, true, true] };
  const [w] = g._spActive(s, [[0, 100, 200, 300, 400]]);
  // i=1: dt 5 → 5×100 · i=2: not moving → dropped · i=3: dt 20 > 10 → dropped · i=4: dt 5 → 5×400
  assert.deepEqual([...w], [...fill(5, 100), ...fill(5, 400)]);
});

test('_spBest returns the best mean per window and skips windows longer than the data', () => {
  const b = g._spBest([...fill(100, 100), ...fill(5, 500), ...fill(100, 100)], [5, 60, 300]);
  assert.equal(b[5], 500);
  near(b[60], (5 * 500 + 55 * 100) / 60, 1e-9);
  assert.equal(b[300], undefined);
});

/* ── sauce.js: NP / TSS / hrTSS ── */

test('spNP of a steady ride equals its power, and is above average power when surgy', () => {
  near(g.spNP(fill(600, 200)), 200, 1e-9);
  const surgy = range(1200).map(i => (Math.floor(i / 60) % 2 ? 300 : 100));
  assert.ok(g.spNP(surgy) > 200);
  assert.equal(g.spNP(fill(299, 200)), null);
});

test('spTSS: an hour at FTP is 100, half an hour at FTP is 50', () => {
  near(g.spTSS(250, 3600, 250), 100, 1e-9);
  near(g.spTSS(250, 1800, 250), 50, 1e-9);
  assert.equal(g.spTSS(0, 3600, 250), null);
});

test('spHrTSS: an hour at threshold HR is 100', () => {
  const hrMax = 190, hrRest = 50, lthr = Math.round(hrMax * 0.89);   // sauce.js default (climb-ftp.js not loaded)
  const hrh = { [lthr]: 3600 };
  // Rounding LTHR to a whole bpm moves it by < 0.5 bpm → about 1 %.
  near(g.spHrTSS(hrh, hrMax, hrRest, false), 100, 1.5);
  assert.equal(g.spHrTSS(hrh, 50, 60, false), null);
});

test('estimated-power calibration falls back to 0.73 with no power-meter rides', () => {
  assert.equal(g.spNpCal(), 0.73);
});

/* ── sauce.js: CP model + W′ balance ── */

test('spFitMorton recovers CP and W′ from an exact 2-parameter curve', () => {
  const CP = 240, WP = 18000;
  const mmp = [120, 300, 600, 1200, 1800, 3600].map(t => ({ duration: t, power: CP + WP / t }));
  const r = g.spFitMorton(mmp);
  near(r.CP, CP, 0.5, 'CP');
  near(r.WPrime, WP, 50, 'W′');
  assert.equal(g.spFitMorton(mmp.slice(0, 2)), null);
});

test('spWPrimeBal: stays full below CP, drains 1 J per watt-second above it, recovers after', () => {
  const cp = 250, wp = 20000;
  assert.ok(g.spWPrimeBal(fill(600, 200), cp, wp).every(x => x === wp));
  const bal = g.spWPrimeBal([...fill(100, 350), ...fill(600, 100)], cp, wp);
  assert.equal(bal[99], wp - 100 * 100);
  assert.ok(bal[699] > bal[99] && bal[699] <= wp);
});

/* ── sauce.js: packing, rank ── */

test('varint packing round-trips, including values over 127', async () => {
  const w = [0, 1, 127, 128, 255, 300, 1999, 16384, ...range(500)];
  assert.deepEqual([...g._spFromVarints(g._spVarints(w))], w);
  assert.deepEqual([...await g.spUnpack(await g.spPack(w))], w);
});

test('spRank climbs with watts per kilo', () => {
  const lo = g.spRank(1200, 150, 79, false), hi = g.spRank(1200, 350, 79, false);
  assert.ok(hi.level > lo.level);
  assert.equal(g.spRank(1200, 0, 79, false), null);
});

/* ── fitness.js: power zones ── */

test('_pwzHist ignores stopped samples and scales the rest to moving time', () => {
  const st = { series: { watts: { data: [100, 100, 250, 250] }, speed: { data: [5, 0, 5, 5] } } };
  const h = g._pwzHist(st, 300);
  // 3 moving samples → 100 s each; 100 W → bucket 10, 250 W → bucket 25.
  assert.equal(h[10], 100);
  assert.equal(h[25], 200);
});

/* ── training.js: load + calendar ── */

test('_trActivityLoad: a power-meter hour at FTP is 100 TSS', () => {
  const r = g._trActivityLoad({ moving_time: 3600, device_watts: true, weighted_average_watts: 200 }, 200, 190, 50);
  assert.equal(r.basis, 'power');
  near(r.load, 100, 1e-9);
});

test('_trActivityLoad: Strava-estimated watts never count as power', () => {
  const r = g._trActivityLoad({ id: 1, moving_time: 3600, device_watts: false, weighted_average_watts: 200, suffer_score: 42 }, 200, 190, 50);
  assert.equal(r.basis, 'effort');
  assert.equal(r.load, 42);
});

test('_trActivityLoad falls back to HR-TRIMP, then to time', () => {
  assert.equal(g._trActivityLoad({ moving_time: 3600, average_heartrate: 140 }, 0, 190, 50).basis, 'hr');
  const t = g._trActivityLoad({ moving_time: 7200 }, 0, 0, 0);
  assert.equal(t.basis, 'time');
  near(t.load, 100, 1e-9);
  assert.equal(g._trActivityLoad({ moving_time: 0 }, 200, 190, 50), null);
});

test('_trAddDays crosses months, leap days and years', () => {
  assert.equal(g._trAddDays('2028-02-28', 1), '2028-02-29');
  assert.equal(g._trAddDays('2026-12-31', 1), '2027-01-01');
  assert.equal(g._trAddDays('2026-03-01', -1), '2026-02-28');
});

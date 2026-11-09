// Unit tests for the Plan section maths (js/plan.js). Run: npm test
// Same VM approach as maths.test.js: the browser scripts share one global context.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const store = {};
const ctx = {
  console, setTimeout, clearTimeout, TextEncoder,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  Blob, Response, CompressionStream, DecompressionStream, btoa, atob,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['utils', 'fitness', 'sauce', 'power-curve', 'training', 'plan']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const g = ctx;
g.tr = s => s; g.trf = s => s;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

test('plDur reads the duration forms', () => {
  assert.equal(g.plDur('90m'), 5400);
  assert.equal(g.plDur('1h30m'), 5400);
  assert.equal(g.plDur('4m30s'), 270);
  assert.equal(g.plDur('30s'), 30);
  assert.equal(g.plDur('1:30'), 90);
  assert.equal(g.plDur('abc'), 0);
});

test('plParse: steps, ramps, repeats and bad lines', () => {
  const { blocks, errors } = g.plParse('10m 50-75%\n5x(4m 115%, 4m 50%)\n# a comment\nnonsense\n10m 50%');
  assert.equal(blocks.length, 3);
  assert.deepEqual({ ...blocks[0].steps[0] }, { d: 600, p: 0.5, p2: 0.75 });
  assert.equal(blocks[1].n, 5);
  assert.equal(blocks[1].steps[0].p, 1.15);
  assert.deepEqual([...errors], [4]);
});

test('plMetrics: an hour at FTP is 100 TSS, IF 1', () => {
  const m = g.plMetrics(g.plParse('60m 100%').blocks);
  assert.equal(m.secs, 3600);
  near(m.tss, 100, 1e-6);
  near(m.if, 1, 1e-9);
  near(g.plMetrics(g.plParse('60m 50%').blocks).tss, 25, 1e-6);
});

test('plMetrics: intervals raise NP above the average', () => {
  const m = g.plMetrics(g.plParse('5x(4m 115%, 4m 50%)').blocks);
  assert.ok(m.if > m.avg + 0.05, `IF ${m.if} vs avg ${m.avg}`);
});

test('every library workout parses', () => {
  for (const w of vm.runInContext('PL_LIB', ctx)) {
    const r = g.plParse(w.text);
    assert.equal(r.errors.length, 0, w.id);
    assert.ok(g.plMetrics(r.blocks).tss > 10, w.id);
  }
});

test('plWeekTssFor and plCtlAfterWeek are inverses', () => {
  const { plWeekTssFor, plCtlAfterWeek } = vm.runInContext('({ plWeekTssFor, plCtlAfterWeek })', ctx);
  const tss = plWeekTssFor(40, 44);
  near(plCtlAfterWeek(40, tss), 44, 1e-9);
  near(plWeekTssFor(50, 50), 350, 1e-9);   // holding CTL = 7 × CTL a week
});

test('plSeasonWeeks: phases run Base → Build → Peak → Taper → Race', () => {
  const w = g.plSeasonWeeks({ date: '2027-03-07', ramp: 4 }, 40, '2026-11-09');
  assert.equal(w[0].mon, '2026-11-09');
  assert.equal(w[w.length - 1].phase, 'race');
  assert.equal(w[w.length - 2].phase, 'taper');
  const order = ['base', 'build', 'peak', 'taper', 'race'];
  for (let i = 1; i < w.length; i++) assert.ok(order.indexOf(w[i].phase) >= order.indexOf(w[i - 1].phase));
  assert.ok(w.some(x => x.rec), 'has recovery weeks');
  assert.ok(Math.max(...w.map(x => x.ctl)) > 55, 'CTL climbs');
  near(w[0].ctl, 43, 1, 'first base week ≈ +0.8×ramp');
});

test('plSeasonWeeks respects a target CTL cap', () => {
  const w = g.plSeasonWeeks({ date: '2027-06-06', ramp: 6, target: 50 }, 40, '2026-11-09');
  assert.ok(Math.max(...w.map(x => x.ctl)) <= 51);
});

test('plCompliance colours', () => {
  const T = '2026-11-09';
  assert.equal(g.plCompliance(100, 100, '2026-11-08', T), 'green');
  assert.equal(g.plCompliance(100, 60, '2026-11-08', T), 'yellow');
  assert.equal(g.plCompliance(100, 20, '2026-11-08', T), 'orange');
  assert.equal(g.plCompliance(100, 0, '2026-11-08', T), 'red');
  assert.equal(g.plCompliance(100, 0, T, T), 'future');
  assert.equal(g.plCompliance(0, 50, '2026-11-08', T), 'extra');
});

test('plWeekWorkouts lands near the weekly target', () => {
  const ws = g.plWeekWorkouts('2026-11-16', 'base', 420, '2026-11-09', new Set());
  assert.equal(ws.length, 5);
  const tot = ws.reduce((s, w) => s + g.plWkMetrics(w).tss, 0);
  near(tot, 420, 40);
  // skips busy days and days already gone (Thu 19th on: Thu + Sun, Sat is busy)
  assert.equal(g.plWeekWorkouts('2026-11-16', 'base', 420, '2026-11-19', new Set(['2026-11-21'])).length, 2);
});

test('plFit writes a FIT file with valid header and file CRCs', () => {
  const f = g.plFit('Sweet spot', g.plParse('15m 50-75%\n3x(15m 90%, 5m 55%)\n10m 50%').blocks, Date.UTC(2026, 10, 9));
  assert.equal(f[0], 14);
  assert.equal(String.fromCharCode(f[8], f[9], f[10], f[11]), '.FIT');
  const size = f[4] | (f[5] << 8) | (f[6] << 16) | (f[7] << 24);
  assert.equal(f.length, 14 + size + 2);
  let c = 0; for (let i = 0; i < 14; i++) c = g._plCrc(c, f[i]);
  assert.equal(c, 0, 'header CRC');
  c = 0; for (const b of f) c = g._plCrc(c, b);
  assert.equal(c, 0, 'file CRC');
});

test('plZwo uses IntervalsT for on/off repeats and Warmup/Cooldown ramps', () => {
  const x = g.plZwo('VO2', g.plParse('15m 50-75%\n5x(4m 115%, 4m 50%)\n10m 60-50%').blocks);
  assert.match(x, /<Warmup Duration="900" PowerLow="0.5" PowerHigh="0.75"\/>/);
  assert.match(x, /<IntervalsT Repeat="5" OnDuration="240" OffDuration="240" OnPower="1.15" OffPower="0.5"\/>/);
  assert.match(x, /<Cooldown Duration="600" PowerLow="0.6" PowerHigh="0.5"\/>/);
});

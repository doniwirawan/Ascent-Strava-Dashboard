// Zwift / MyWhoosh rides (js/utils.js): counted as rides, game GPS and speed set aside.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ctx = { console, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8'), ctx, { filename: 'utils.js' });
const g = vm.runInContext('({ isRide, isVirtual, realSpeed, virtualApp, separateVirtualGps, cleanMax })', ctx);

const zwift = () => ({ id: 1, type: 'VirtualRide', sport_type: 'VirtualRide', name: 'Zwift - Watopia', device_name: 'Zwift',
  average_speed: 11, max_speed: 20, map: { id: 'a1', summary_polyline: 'abc' }, start_latlng: [-11.6, 166.9], end_latlng: [-11.6, 166.9] });

test('virtual rides are rides, but not real speed', () => {
  const a = zwift();
  assert.ok(g.isRide(a));
  assert.ok(g.isVirtual(a));
  assert.ok(!g.realSpeed(a));
  assert.equal(g.cleanMax(a), 0);
  assert.ok(g.isVirtual({ type: 'Ride', trainer: true }));
  assert.ok(!g.isVirtual({ type: 'Ride', max_speed: 15 }));
  // a treadmill run or pool swim keeps its real pace
  assert.ok(!g.isVirtual({ type: 'Run', trainer: true }));
  assert.ok(!g.isVirtual({ type: 'Swim', trainer: true }));
  assert.ok(g.isVirtual({ type: 'VirtualRun' }));
  assert.equal(g.cleanMax({ type: 'Ride', max_speed: 15 }), 15);
});

test('virtualApp names the app', () => {
  assert.equal(g.virtualApp(zwift()), 'Zwift');
  assert.equal(g.virtualApp({ type: 'VirtualRide', name: 'MyWhoosh - Khalidiya Loop', device_name: '' }), 'MyWhoosh');
  assert.equal(g.virtualApp({ type: 'Ride', trainer: true, name: 'Trainer' }), 'Indoor');
});

test('separateVirtualGps moves game GPS aside, once', () => {
  const a = zwift(), road = { type: 'Ride', map: { summary_polyline: 'xyz' }, start_latlng: [-8.6, 115.2] };
  g.separateVirtualGps([a, road]);
  assert.equal(a.map.summary_polyline, null);
  assert.equal(a.virtual_map.summary_polyline, 'abc');
  assert.equal(a.start_latlng.length, 0);
  assert.deepEqual([...a.virtual_start], [-11.6, 166.9]);
  g.separateVirtualGps([a]);                      // idempotent
  assert.equal(a.virtual_map.summary_polyline, 'abc');
  assert.equal(road.map.summary_polyline, 'xyz');  // real rides untouched
});

// Copies JoyoFit's Huawei watch link (github.com/dzulfikar08/joyofit,
// modules/huawei-wear, AGPL-3.0-or-later) into this Gradle module, unchanged,
// so a newer JoyoFit is one run of this script away.
//
//   node huawei-wear/sync-from-joyofit.mjs [commit]      (from android/)
//
// Left out: the Expo bridge to JoyoFit's JavaScript (Ascent drives the link
// natively, see app/.../Watch.kt) and expo-sqlite's connection (replaced by
// src/ascent/.../AndroidSqlConnection.kt). The few Expo types the protocol
// code still names come from the shim in src/ascent/java/expo.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const COMMIT = process.argv[2] || '073170021e194246f7916014fa45c841d7e6dfbe';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SKIP = [
  /ModuleApi\.kt$/, /^HuaweiWearModule\.kt$/, /^ExpoSqliteConnection\.java$/,
  /^HealthConnectPermissionContract\.kt$/,      // an Expo activity-result contract
  /^HealthConnectExporter\.kt$/,                // needs connect-client 1.1.0; Ascent doesn't write Health Connect (stub in src/ascent)
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joyofit-'));
const tgz = path.join(tmp, 'src.tgz');
const res = await fetch(`https://codeload.github.com/dzulfikar08/joyofit/tar.gz/${COMMIT}`);
if (!res.ok) { console.error('Download failed', res.status); process.exit(1); }
fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
execFileSync('tar', ['xzf', 'src.tgz'], { cwd: tmp });     // relative: GNU tar reads "C:" as a host
const root = path.join(tmp, fs.readdirSync(tmp).find(d => d.startsWith('joyofit-')));
const mod = path.join(root, 'modules', 'huawei-wear');

const dest = path.join(here, 'src', 'main');
fs.rmSync(path.join(dest, 'java'), { recursive: true, force: true });
let n = 0, skipped = [];
(function copy(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) { copy(s, d); continue; }
    if (SKIP.some(r => r.test(e.name))) { skipped.push(e.name); continue; }
    fs.mkdirSync(to, { recursive: true }); fs.copyFileSync(s, d); n++;
  }
})(path.join(mod, 'android', 'src', 'main', 'java'), path.join(dest, 'java'));

fs.mkdirSync(path.join(dest, 'assets'), { recursive: true });
for (const f of fs.readdirSync(path.join(mod, 'schema'))) fs.copyFileSync(path.join(mod, 'schema', f), path.join(dest, 'assets', f));
for (const f of ['LICENSE', 'NOTICE']) fs.copyFileSync(path.join(root, f), path.join(here, 'JOYOFIT_' + f));
fs.writeFileSync(path.join(here, 'JOYOFIT_COMMIT'), COMMIT + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Copied ${n} files from JoyoFit ${COMMIT.slice(0, 7)}; left out ${skipped.join(', ')}`);

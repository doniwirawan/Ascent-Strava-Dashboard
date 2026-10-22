// Publishes the release APK as the Android app's newest version, so installed
// apps offer it as an update (api/_v1.js /app, android/.../Updater.kt).
//
//   1. bump versionCode / versionName in app/build.gradle
//   2. gradle assembleRelease -Ppersonal      (or without -Ppersonal)
//   3. node publish-update.mjs "What changed"
//
// It uploads app/build/outputs/apk/release/app-release.apk to the PRIVATE
// Supabase bucket `private-apps` under a random name, then rewrites
// ascent-latest.json. Nothing is public: the app gets a 10-minute signed link
// from the API, and only with a Personal API token.
//
// Needs SUPABASE_SERVICE_ROLE_KEY in the environment, or SUPABASE_ACCESS_TOKEN
// (a Supabase CLI token) to look it up. SUPABASE_URL comes from ../.env.local.
import fs from 'fs';
import crypto from 'crypto';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const envFile = fs.existsSync(here + '../.env.local') ? fs.readFileSync(here + '../.env.local', 'utf8') : '';
const fromEnvFile = k => ((envFile.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '').replace(/\\n$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || fromEnvFile('SUPABASE_URL')).replace(/\/$/, '');
let key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!key && process.env.SUPABASE_ACCESS_TOKEN) {
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN } })).json();
  key = (keys.find(k => k.name === 'service_role') || {}).api_key || '';
}
if (!SUPABASE_URL || !key) { console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ACCESS_TOKEN).'); process.exit(1); }

const gradle = fs.readFileSync(here + 'app/build.gradle', 'utf8');
const versionCode = +(gradle.match(/versionCode\s+(\d+)/) || [])[1];
const versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
const apk = here + 'app/build/outputs/apk/release/app-release.apk';
if (!fs.existsSync(apk)) { console.error('Build first: no ' + apk); process.exit(1); }

const H = { apikey: key, Authorization: 'Bearer ' + key };
const store = SUPABASE_URL + '/storage/v1/';
await fetch(store + 'bucket', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'private-apps', name: 'private-apps', public: false }) });

const file = `ascent-${versionCode}-${crypto.randomBytes(6).toString('hex')}.apk`;
const up = await fetch(store + 'object/private-apps/' + file, { method: 'POST', headers: { ...H, 'Content-Type': 'application/vnd.android.package-archive' }, body: fs.readFileSync(apk) });
if (!up.ok) { console.error('Upload failed', up.status, await up.text()); process.exit(1); }

const meta = { versionCode, versionName, notes: process.argv[2] || '', file, published_at: new Date().toISOString() };
const m = await fetch(store + 'object/private-apps/ascent-latest.json', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(meta) });
if (!m.ok) { console.error('Could not write ascent-latest.json', m.status, await m.text()); process.exit(1); }
console.log(`Published ${versionName} (${versionCode}) as ${file}`);

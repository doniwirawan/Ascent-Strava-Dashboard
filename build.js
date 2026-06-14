const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const ID           = (process.env.STRAVA_CLIENT_ID     || '').replace(/\n/g, '').trim();
const SECRET       = (process.env.STRAVA_CLIENT_SECRET || '').replace(/\n/g, '').trim();
const SUPA_URL     = (process.env.SUPABASE_URL          || '').replace(/\n/g, '').trim();
const SUPA_KEY     = (process.env.SUPABASE_ANON_KEY     || '').replace(/\n/g, '').trim();

// changes every build → busts the browser HTTP cache for js/ and css/ assets
const BUILD = Date.now().toString(36);

function injectIndexHtml() {
  let content = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  content = content.replace(/__STRAVA_CLIENT_ID__/g,     ID);
  content = content.replace(/__STRAVA_ACCESS_TOKEN__/g,  '');
  content = content.replace(/__STRAVA_REFRESH_TOKEN__/g, '');
  content = content.replace(/__SUPABASE_URL__/g,         SUPA_URL);
  content = content.replace(/__SUPABASE_KEY__/g,         SUPA_KEY);
  // cache-bust local script/style URLs so a new deploy is always picked up
  content = content.replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, `$1="$2?v=${BUILD}"`);
  return content;
}

function injectCallbackHtml() {
  // callback.html no longer embeds any credentials — the token exchange is
  // done server-side via /api/strava-token
  return fs.readFileSync(path.join(__dirname, 'callback.html'), 'utf8');
}

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'),    injectIndexHtml());
fs.writeFileSync(path.join(__dirname, 'dist', 'callback.html'), injectCallbackHtml());

// copy static PWA + legal files (sw.js gets the build id for its cache name)
['manifest.json', 'sw.js', 'icon.png', 'apple-touch-icon.png', 'privacy.html', 'terms.html'].forEach(f => {
  const src = path.join(__dirname, f);
  if (!fs.existsSync(src)) return;
  const dest = path.join(__dirname, 'dist', f);
  if (f === 'sw.js') {
    fs.writeFileSync(dest, fs.readFileSync(src, 'utf8').replace(/__BUILD__/g, BUILD));
  } else {
    fs.copyFileSync(src, dest);
  }
});

// copy css/ and js/ folders — inject placeholders into JS files
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(file => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDir(srcFile, destFile);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(srcFile, 'utf8');
      content = content.replace(/__STRAVA_CLIENT_ID__/g,     ID);
      content = content.replace(/__SUPABASE_URL__/g,         SUPA_URL);
      content = content.replace(/__SUPABASE_KEY__/g,         SUPA_KEY);
      fs.writeFileSync(destFile, content);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}
['css', 'js', 'images'].forEach(dir => {
  const src = path.join(__dirname, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(__dirname, 'dist', dir));
});

console.log('Build complete → dist/');
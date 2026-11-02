// Ascent for Strava (v0): a "Story card" button on activity pages.
// It only links to the dashboard's ?story=<id> deep link (js/app.js); the
// dashboard does the work with its own Strava login, so this script reads
// nothing from the page and needs no permissions or tokens.
const ASCENT = 'https://ascent-analytics.doniwirawan.xyz/';
const BTN_ID = 'ascent-story-btn';

function sync() {
  const m = /^\/activities\/(\d+)/.exec(location.pathname);
  let btn = document.getElementById(BTN_ID);
  if (!m) { if (btn) btn.remove(); return; }
  if (!btn) {
    btn = document.createElement('a');
    btn.id = BTN_ID;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = 'Story card';
    btn.title = 'Open this activity in the Ascent story card generator';
    // fixed in the corner: Strava's own markup changes too often to anchor to
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
      padding: '10px 16px', borderRadius: '999px', background: '#fc5200', color: '#fff',
      font: '600 14px/1 system-ui, sans-serif', textDecoration: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    });
    document.body.appendChild(btn);
  }
  btn.href = ASCENT + '?story=' + m[1];
}

sync();
// Strava's newer pages navigate without a reload
setInterval(sync, 1000);

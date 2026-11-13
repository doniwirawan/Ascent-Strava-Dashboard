/* ── STORY MODAL EVENTS ── */
function _closeStory(){ document.getElementById('storyModal').classList.remove('open'); localStorage.removeItem('story_open'); }
document.getElementById('shareBtn').addEventListener('click', () => { track('story_open'); openStoryModal(); });
document.getElementById('modalClose').addEventListener('click',  _closeStory);
document.getElementById('modalClose2').addEventListener('click', _closeStory);
document.getElementById('storyModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) _closeStory(); });
document.getElementById('downloadBtn').addEventListener('click', ()=>{
  const canvas = document.getElementById('storyCanvas');
  // re-render without the custom drag guides so they never appear in the export
  const wasEditing = customEditMode;
  const editable = activeLayout === 'custom' || activeLayout === 'collage';
  if (editable && wasEditing) { customEditMode = false; drawStoryCanvas(); }
  const a = document.createElement('a');
  a.download = 'strava-story.png';
  track('story_download', { template: activeLayout });
  a.href = canvas.toDataURL('image/png');
  a.click();
  if (editable && wasEditing) { customEditMode = true; drawStoryCanvas(); }
});

/* ── SHARE STORY (Web Share API → Instagram / WhatsApp / Facebook / … ) ── */
(function () {
  const btn = document.getElementById('shareStoryBtn');
  if (!btn) return;
  // only show when the browser can share files (mostly mobile); else stick to Download
  let canShareFiles = false;
  try {
    canShareFiles = !!(navigator.canShare &&
      navigator.canShare({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] }));
  } catch { canShareFiles = false; }
  if (!canShareFiles) return; // leave hidden — Download PNG remains the path
  btn.style.display = '';

  btn.addEventListener('click', () => {
    const canvas = document.getElementById('storyCanvas');
    const wasEditing = customEditMode;
    const editable = activeLayout === 'custom' || activeLayout === 'collage';
    if (editable && wasEditing) { customEditMode = false; drawStoryCanvas(); }
    canvas.toBlob(async (blob) => {
      if (editable && wasEditing) { customEditMode = true; drawStoryCanvas(); }
      if (!blob) return;
      const file = new File([blob], 'strava-story.png', { type: 'image/png' });
      try {
        await navigator.share({ files: [file], title: 'My activity', text: 'Made with Ascent' });
        track('story_share', { template: activeLayout });
      } catch { /* user cancelled or share failed — no-op */ }
    }, 'image/png');
  });
})();

/* ── MAIN BUTTON EVENTS ── */
document.getElementById('mainBtn').addEventListener('click', () => loadData(true));
document.getElementById('logoutBtn').addEventListener('click', () => {
  const aid = localStorage.getItem('strava_athlete_id');
  if (aid) localStorage.removeItem('strava_acts_' + aid);
  localStorage.removeItem('strava_athlete_id');
  localStorage.removeItem('strava_bikes_v1');
  localStorage.removeItem('strava_access_token');
  localStorage.removeItem('strava_refresh_token');
  localStorage.removeItem('strava_expires_at');
  location.reload();
});

/* ── MOBILE SIDEBAR DRAWER ── */
(function(){
  const btn=document.getElementById('hamburgerBtn');
  const sidebar=document.getElementById('sidebar');
  if(!btn||!sidebar) return;
  const backdrop=document.createElement('div');
  backdrop.className='sidebar-backdrop';
  // Insert the backdrop as the sidebar's sibling (same parent) so z-index
  // ordering is guaranteed in one stacking context — appending to <body>
  // let WebKit/iOS paint the backdrop OVER the sidebar (it darkened the drawer).
  sidebar.parentNode.insertBefore(backdrop, sidebar);
  const open=()=>{ sidebar.classList.add('open'); backdrop.classList.add('open'); btn.classList.add('open'); document.body.classList.add('drawer-open'); };
  const close=()=>{ sidebar.classList.remove('open'); backdrop.classList.remove('open'); btn.classList.remove('open'); document.body.classList.remove('drawer-open'); };
  btn.addEventListener('click',()=>{ sidebar.classList.contains('open')?close():open(); });
  backdrop.addEventListener('click',close);
  // tapping a section link (or an action) closes the drawer
  sidebar.addEventListener('click',e=>{ if(e.target.closest('.nav-link,.sidebar-act')) close(); });
})();

/* ── INIT ── */
if (!CONFIG.refreshToken) {
  // first-time / logged-out visitor → show the landing page, hide the app
  const SCOPE    = 'read,activity:read_all,profile:read_all,activity:write,profile:write';
  const REDIRECT = encodeURIComponent(window.location.origin + '/callback');
  const authUrl  = `https://www.strava.com/oauth/authorize?client_id=${CONFIG.clientId}&response_type=code&redirect_uri=${REDIRECT}&approval_prompt=force&scope=${SCOPE}`;
  document.body.classList.add('logged-out');
  document.querySelectorAll('.js-connect').forEach(el => { el.href = authUrl; el.onclick = () => { window.location.href = authUrl; return false; }; });
  // keep the in-app reconnect affordance wired too (harmless while hidden)
  showReconnect();
  setStatus('Not connected, <a href="' + authUrl + '" style="color:var(--orange);font-weight:700">Connect with Strava →</a>');
  const mb = document.getElementById('mainBtn');
  if (mb) { mb.textContent = tr('Connect'); mb.onclick = () => { window.location.href = authUrl; }; }
} else {
  // reopen the Share Story modal if that's where the user left off
  loadData().then(() => {
    // ?story=<activity id> (the Android app's Story card button) opens the story for that ride
    const storyId = new URLSearchParams(location.search).get('story');
    if (storyId && typeof acts !== 'undefined' && acts.length) {
      history.replaceState(null, '', location.pathname);
      openStoryModal();
      const i = acts.slice(0, 50).findIndex(a => String(a.id) === storyId);
      const picker = document.getElementById('activityPicker');
      if (i >= 0 && picker) { picker.value = String(i); if (picker.onchange) picker.onchange(); }
      // the browser extension links any Strava activity, not only the latest 50 of yours
      else if (i < 0) setStatus(tr('That activity isn’t among your 50 latest, so the story shows the latest one.'));
      return;
    }
    // ?stats=<id> / ?social=<id> (the app's ride page) open that activity with the tool already open
    const q = new URLSearchParams(location.search), shareId = q.get('stats') || q.get('social');
    if (shareId && typeof acts !== 'undefined' && acts.some(a => String(a.id) === shareId)) {
      history.replaceState(null, '', location.pathname);
      openActivityModal(shareId);
      if (q.get('stats')) openStatsImage(shareId); else if (typeof openSocialPost === 'function') openSocialPost(shareId);
      setTimeout(() => { const p = document.getElementById('actAiPanel'); if (p) p.scrollIntoView({ block: 'start' }); }, 400);
      return;
    }
    if (localStorage.getItem('story_open') === '1' && typeof acts !== 'undefined' && acts.length) openStoryModal();
  });
}

/* ── LANDING: GitHub star count + the sample-data demo ── */
(function(){
  // GitHub star count — fetched live, fails silently (button still links out)
  const starEl=document.getElementById('ghStars');
  if(starEl){
    fetch('https://api.github.com/repos/doniwirawan/Ascent-Strava-Dashboard')
      .then(r=>r.ok?r.json():Promise.reject())
      .then(d=>{ const n=d.stargazers_count; if(typeof n==='number'){ starEl.textContent=n>=1000?(n/1000).toFixed(1)+'k':n; starEl.classList.add('show'); } })
      .catch(()=>{});
  }
})();

// "Try it with sample data" on the landing page: show the app with loadDemo()'s
// seeded activities. No Strava access is used; a reload returns here.
function startDemo(){
  document.body.classList.remove('logged-out');
  const nav=document.getElementById('sidebarNav'); if(nav) nav.classList.remove('locked');
  loadDemo();
  navScrollTo('statRow', document.querySelector('.sidebar-nav .nav-link'));
  window.scrollTo(0,0);
}

/* ── SERVICE WORKER ── */
/* Auto-update: the SW skips waiting + claims clients, and on activating an
   UPDATE it force-reloads open tabs itself (see sw.js). We deliberately do NOT
   reload on controllerchange here, because that also fires on the very first
   visit (initial claim) and would cause a needless reload/flash. */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then(reg => { reg.update(); setInterval(() => reg.update(), 60 * 60 * 1000); })
    .catch(() => {});
}

// a Strava connect that just completed on callback.html
try { if (localStorage.getItem('ga_login')) { localStorage.removeItem('ga_login'); track('login', { method: 'Strava' }); } } catch {}

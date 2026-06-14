/* ── STORY MODAL EVENTS ── */
function _closeStory(){ document.getElementById('storyModal').classList.remove('open'); localStorage.removeItem('story_open'); }
document.getElementById('shareBtn').addEventListener('click', openStoryModal);
document.getElementById('modalClose').addEventListener('click',  _closeStory);
document.getElementById('modalClose2').addEventListener('click', _closeStory);
document.getElementById('storyModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) _closeStory(); });
document.getElementById('downloadBtn').addEventListener('click', ()=>{
  const canvas = document.getElementById('storyCanvas');
  // re-render without the custom drag guides so they never appear in the export
  const wasEditing = customEditMode;
  if (activeLayout === 'custom' && wasEditing) { customEditMode = false; drawStoryCanvas(); }
  const a = document.createElement('a');
  a.download = 'strava-story.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  if (activeLayout === 'custom' && wasEditing) { customEditMode = true; drawStoryCanvas(); }
});

/* ── MAIN BUTTON EVENTS ── */
document.getElementById('mainBtn').addEventListener('click', () => loadData(true));
document.getElementById('logoutBtn').addEventListener('click', () => {
  const aid = localStorage.getItem('strava_athlete_id');
  if (aid) localStorage.removeItem('strava_acts_' + aid);
  localStorage.removeItem('strava_athlete_id');
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
  document.body.appendChild(backdrop);
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
  const SCOPE    = 'read,activity:read_all,profile:read_all,activity:write';
  const REDIRECT = encodeURIComponent(window.location.origin + '/callback');
  const authUrl  = `https://www.strava.com/oauth/authorize?client_id=${CONFIG.clientId}&response_type=code&redirect_uri=${REDIRECT}&approval_prompt=force&scope=${SCOPE}`;
  document.body.classList.add('logged-out');
  document.querySelectorAll('.js-connect').forEach(el => { el.href = authUrl; el.onclick = () => { window.location.href = authUrl; return false; }; });
  // keep the in-app reconnect affordance wired too (harmless while hidden)
  showReconnect();
  setStatus('Not connected — <a href="' + authUrl + '" style="color:var(--orange);font-weight:700">Connect with Strava →</a>');
  const mb = document.getElementById('mainBtn');
  if (mb) { mb.textContent = 'Connect'; mb.onclick = () => { window.location.href = authUrl; }; }
} else {
  // reopen the Share Story modal if that's where the user left off
  loadData().then(() => {
    if (localStorage.getItem('story_open') === '1' && typeof acts !== 'undefined' && acts.length) openStoryModal();
  });
}

/* ── SERVICE WORKER ── */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

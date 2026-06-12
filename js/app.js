/* ── STORY MODAL EVENTS ── */
document.getElementById('shareBtn').addEventListener('click', openStoryModal);
document.getElementById('modalClose').addEventListener('click',  ()=>document.getElementById('storyModal').classList.remove('open'));
document.getElementById('modalClose2').addEventListener('click', ()=>document.getElementById('storyModal').classList.remove('open'));
document.getElementById('storyModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) e.currentTarget.classList.remove('open'); });
document.getElementById('downloadBtn').addEventListener('click', ()=>{
  const canvas = document.getElementById('storyCanvas');
  const a = document.createElement('a');
  a.download = 'strava-story.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
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
  showReconnect();
  // Change status text for first-time users (not "session expired")
  const SCOPE    = 'read,activity:read_all,profile:read_all,activity:write';
  const REDIRECT = encodeURIComponent(window.location.origin + '/callback');
  const authUrl  = `https://www.strava.com/oauth/authorize?client_id=${CONFIG.clientId}&response_type=code&redirect_uri=${REDIRECT}&approval_prompt=force&scope=${SCOPE}`;
  setStatus('Not connected — <a href="' + authUrl + '" style="color:var(--orange);font-weight:700">Connect with Strava →</a>');
  document.getElementById('mainBtn').textContent = 'Connect';
  document.getElementById('mainBtn').onclick = () => { window.location.href = authUrl; };
} else {
  loadData();
}

/* ── SERVICE WORKER ── */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

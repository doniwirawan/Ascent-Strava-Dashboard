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

/* ── HAMBURGER MENU ── */
(function(){
  const btn=document.getElementById('hamburgerBtn');
  const menu=document.getElementById('mobileMenu');
  if(!btn||!menu) return;
  const links=document.getElementById('navLinks');
  function close(){menu.classList.remove('open');btn.classList.remove('open');}
  function syncMenu(){
    menu.innerHTML='';
    // nav links
    links.querySelectorAll('.nav-link').forEach(l=>{
      const cl=l.cloneNode(true);
      cl.addEventListener('click',close);
      menu.appendChild(cl);
    });
    // divider
    const hr=document.createElement('div');
    hr.style.cssText='border-top:1px solid var(--border);margin:6px 0 2px;';
    menu.appendChild(hr);
    // profile badge
    const badge=document.getElementById('badge');
    if(badge&&badge.style.display==='flex'){
      const bc=document.createElement('div');
      bc.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;color:var(--text);font-size:13px;font-weight:600;';
      const img=badge.querySelector('img');
      if(img){const i=img.cloneNode(true);i.style.width='28px';i.style.height='28px';bc.appendChild(i);}
      const nm=badge.querySelector('span');
      if(nm){const n=nm.cloneNode(true);n.style.display='';bc.appendChild(n);}
      menu.appendChild(bc);
    }
    // action buttons
    [
      {id:'shareBtn'},
      {id:'logoutBtn'},
      {id:'mainBtn'},
    ].forEach(({id,muted})=>{
      const orig=document.getElementById(id);
      if(!orig||orig.style.display==='none') return;
      const b=document.createElement('button');
      b.className='nav-link';
      b.textContent=orig.textContent;
      b.disabled=orig.disabled;
      if(muted) b.style.color='var(--muted)';
      b.addEventListener('click',()=>{close();orig.click();});
      menu.appendChild(b);
    });
  }
  btn.addEventListener('click',()=>{
    const opening=!menu.classList.contains('open');
    if(opening) syncMenu();
    btn.classList.toggle('open');
    menu.classList.toggle('open');
  });
  document.addEventListener('click',e=>{
    if(!btn.contains(e.target)&&!menu.contains(e.target)) close();
  });
})();

/* ── INIT ── */
if (!CONFIG.refreshToken) {
  showReconnect();
  // Change status text for first-time users (not "session expired")
  const SCOPE    = 'read,activity:read_all,profile:read_all';
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

/* ── UTILS ── */

/* ── POLYLINE DECODE (Google encoded polyline) ── */
function decodePolyline(enc) {
  const pts=[]; let i=0,lat=0,lng=0;
  while(i<enc.length){
    let s=0,r=0,b; do{b=enc.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5;}while(b>=32);
    lat+=(r&1)?~(r>>1):(r>>1);
    s=r=0; do{b=enc.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5;}while(b>=32);
    lng+=(r&1)?~(r>>1):(r>>1);
    pts.push([lat/1e5,lng/1e5]);
  }
  return pts;
}
/* ── UNITS (km / mi toggle) ── */
let useImperial = localStorage.getItem('units') === 'mi';
const _MI = 1.60934, _FT = 3.28084;
const distUnit  = () => useImperial ? 'mi' : 'km';
const elevUnit  = () => useImperial ? 'ft' : 'm';
const speedUnit = () => useImperial ? 'mph' : 'km/h';
const kmVal   = m  => useImperial ? (m/1000)/_MI : (m/1000);   // metres → km/mi value
const kmDisp  = km => useImperial ? km/_MI : km;               // km value → km/mi value
const elevVal = m  => useImperial ? m*_FT : m;                 // elevation value in m/ft
const kmh     = ms => +(ms * (useImperial ? 2.23694 : 3.6)).toFixed(1); // speed value
const fmtSpeed= ms => kmh(ms) + ' ' + speedUnit();
// running pace: seconds per km/mi → "m:ss /km" (— when no speed)
const fmtPace = ms => {
  if (!ms || ms <= 0) return '—';
  const spu = (useImperial ? _MI*1000 : 1000) / ms; // seconds per unit
  const m = Math.floor(spu/60), s = Math.round(spu%60);
  const mm = s===60 ? m+1 : m, ss = s===60 ? 0 : s;
  return `${mm}:${String(ss).padStart(2,'0')} /${distUnit()}`;
};
const fmtKm   = m  => kmVal(m).toFixed(1);                     // distance value, 1 dp (unit implied)
const fmtD    = m  => {
  if (useImperial) { const mi=(m/1000)/_MI; return mi>=0.1 ? mi.toFixed(1)+' mi' : Math.round(m*_FT)+' ft'; }
  return m >= 1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m';
};
const fmtElev = m  => Math.round(elevVal(m)).toLocaleString() + ' ' + elevUnit();

function setUnits(imperial){
  useImperial = !!imperial;
  localStorage.setItem('units', useImperial ? 'mi' : 'km');
  document.querySelectorAll('[data-unit]').forEach(b=>b.classList.toggle('active',(b.dataset.unit==='mi')===useImperial));
  if (typeof acts==='undefined' || !acts.length) return;
  const cur = _ALL_SECTIONS.find(id=>{const e=document.getElementById(id);return e&&e.style.display!=='none';}) || 'statRow';
  renderAll();
  const navBtn = document.querySelector('#sidebarNav .nav-link[onclick*="'+cur+'"]') || document.querySelector('.nav-link[onclick*="'+cur+'"]');
  navScrollTo(cur, navBtn);
  try{ if(document.getElementById('storyModal')&&document.getElementById('storyModal').classList.contains('open')) drawStoryCanvas(); }catch{}
}

const fmtT  = s   => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const fmtDays = s => { const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600); return d>0?`${d}d ${h}h`:`${h}h`; }; // duration as days+hours
const fmtDt = d   => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const isRide= a   => ['Ride','VirtualRide','EBikeRide','GravelRide','MountainBikeRide'].includes(a.type);
// NOTE: isRun() is defined in render-sections.js (loaded after this file)

function setStatus(msg, cls='') {
  const el = document.getElementById('statusBar');
  el.className = cls;
  el.innerHTML = cls==='loading' ? `<div class="spin"></div> ${msg}` : msg;
}

function destroyChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }

function chartOpts(unit='', legend=false) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{ display:legend, labels:{color:'#666',font:{size:11},boxWidth:10} },
      tooltip:{ backgroundColor:'#1a1a1a', borderColor:'#2a2a2a', borderWidth:1,
        titleColor:'#fff', bodyColor:'#aaa',
        callbacks:{ label: ctx=>' '+ctx.parsed.y+' '+unit } }
    },
    scales:{
      x:{ grid:{color:'#1c1c1c'}, ticks:{color:'#555',font:{size:10},maxRotation:45} },
      y:{ grid:{color:'#1c1c1c'}, ticks:{color:'#555',font:{size:10}}, beginAtZero:false }
    }
  };
}

const _ALL_SECTIONS=['statRow','cyclingSection','runningSection','trendsSection','actSection','calSection',
  'eddySection','monthlySection','bestSection','gearSection','heatSection',
  'segmentsSection','milestonesSection','rewindSection','challengesSection','photosSection','settingsSection','helpSection'];

function navScrollTo(id, btn) {
  _ALL_SECTIONS.forEach(s=>{const el=document.getElementById(s);if(el)el.style.display='none';});
  const el=document.getElementById(id);
  if(el) el.style.display='';
  try{ localStorage.setItem('lastSection', id); }catch{}
  window.scrollTo({top:0,behavior:'smooth'});
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  // Lazy-init heatmap when first shown
  if(id==='heatSection'){
    if(!leafletMapInst) renderHeatmap();
    else setTimeout(()=>{try{leafletMapInst.invalidateSize();}catch{}},80);
  }
  // Lazy-load API-heavy sections on first open (rate-limit friendly). Each
  // render reuses cached data, so this only hits Strava once per refresh.
  const _empty = gid => { const e=document.getElementById(gid); return e && !e.innerHTML.trim(); };
  try {
    if(id==='gearSection' && _empty('gearGrid') && typeof renderGear==='function') renderGear();
    if(id==='challengesSection' && _empty('challengesGrid') && typeof renderChallenges==='function') renderChallenges();
    if(id==='segmentsSection'){
      if(_empty('segmentsGrid') && typeof renderSegments==='function') renderSegments();
      // Segment mini-maps build while hidden (0×0) — re-size and re-fit on show
      else if(typeof segMaps!=='undefined') setTimeout(()=>{segMaps.forEach(({m,line})=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[16,16]});}catch{}});},80);
    }
  } catch(e){ console.error('lazy render failed:', id, e); }
  // Resize charts after section becomes visible
  setTimeout(()=>{Object.values(charts).forEach(c=>{try{if(c&&c.resize)c.resize();}catch{}});},80);
  // AI insight for relevant sections (cached per data signature, lazy)
  try { if (typeof aiSectionInsight === 'function') aiSectionInsight(id); } catch {}
  if (window.applyI18n) window.applyI18n();
}

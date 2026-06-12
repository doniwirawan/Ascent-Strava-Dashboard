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
const kmh   = ms  => +(ms * 3.6).toFixed(1);
const fmtD  = m   => m >= 1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m';
const fmtKm = m   => (m/1000).toFixed(1);
const fmtT  = s   => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const fmtDt = d   => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const isRide= a   => ['Ride','VirtualRide','EBikeRide','GravelRide','MountainBikeRide'].includes(a.type);

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

const _ALL_SECTIONS=['statRow','cyclingSection','trendsSection','actSection','calSection',
  'eddySection','monthlySection','bestSection','gearSection','heatSection',
  'segmentsSection','milestonesSection','rewindSection','challengesSection','photosSection'];

function navScrollTo(id, btn) {
  _ALL_SECTIONS.forEach(s=>{const el=document.getElementById(s);if(el)el.style.display='none';});
  const el=document.getElementById(id);
  if(el) el.style.display='';
  window.scrollTo({top:0,behavior:'smooth'});
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  // Lazy-init heatmap when first shown
  if(id==='heatSection'){
    if(!leafletMapInst) renderHeatmap();
    else setTimeout(()=>{try{leafletMapInst.invalidateSize();}catch{}},80);
  }
  // Segment mini-maps build while hidden (0×0) — re-size and re-fit on show
  if(id==='segmentsSection' && typeof segMaps!=='undefined'){
    setTimeout(()=>{segMaps.forEach(({m,line})=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[16,16]});}catch{}});},80);
  }
  // Resize charts after section becomes visible
  setTimeout(()=>{Object.values(charts).forEach(c=>{try{if(c&&c.resize)c.resize();}catch{}});},80);
}

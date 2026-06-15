/* ── inline SVG icons (replaces emoji) ── */
function svgIcon(n){
  const p={
    bike:'<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 18 12 6h3"/><path d="m9 18 5-9 4 9"/>',
    run:'<circle cx="13" cy="5" r="2"/><path d="M4 17l4-1 2-4 3 2 1 5"/><path d="M9 12 7 9l4-2 3 2 2-1"/>',
    mountain:'<path d="M3 20h18L14 6l-3 6-2-2-6 10z"/>',
    bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    heart:'<path d="M20.8 5.1a5 5 0 0 0-7.1 0L12 6.8l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
    flame:'<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 2 2 2 0 0-2 0-3 0-4z"/>',
    gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p[n]||p.bolt}</svg>`;
}

/* ── trophy/achievement icons (custom SVG, replaces emoji) — use currentColor ── */
function trophySvg(n){
  const I={
    crown:'<path d="M3 7l3.6 2.6L12 4l5.4 5.6L21 7l-1.7 10.5H4.7L3 7z" fill="currentColor"/><rect x="4.6" y="19" width="14.8" height="2.2" rx="1" fill="currentColor"/>',
    trophy:'<path d="M6 4h12v2h3v2a4 4 0 0 1-4 4 6 6 0 0 1-3.2 3.4V18H16a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h2.2v-2.6A6 6 0 0 1 7 12 4 4 0 0 1 3 8V6h3V4zm0 4H5a2 2 0 0 0 1 1.7V8zm12 0v1.7A2 2 0 0 0 19 8h-1z" fill="currentColor"/>',
    bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/>',
    kudos:'<path d="M2 10h3.4v11H2zM6.9 21h9.2a2 2 0 0 0 2-1.6l1.3-6.6A2 2 0 0 0 17.4 10h-4V5.4A2.4 2.4 0 0 0 11 3L6.9 10.2z" fill="currentColor"/>',
    globe:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    world:'<circle cx="12" cy="12" r="9" fill="currentColor" opacity=".22"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    mountain:'<path d="M3 20h18L13.6 6.5 10.2 13 8 10.3z" fill="currentColor"/><path d="M11.6 11l2-4 1.9 3.6-1.5 1-1-1.4z" fill="#fff" opacity=".85"/>',
    runner:'<circle cx="15" cy="4.3" r="2.1" fill="currentColor"/><path d="M5 13.4l3.4-1.1 1.6-3 3 2.2.7 3 2.3-.5-.9-4.1-3.1-2.3 1.3-2.6-3.1.8z" fill="currentColor"/><path d="M9.2 13.8 7.7 17l-3 2.2 1.2 1.6 3.6-2.7 1.1-2.6z" fill="currentColor"/>',
    bike:'<circle cx="6" cy="17.5" r="3.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="17.5" r="3.3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 17.5 11 9h4m-6 0 4 8.5M9 9h4l4 8.5M14 7h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    flame:'<path d="M12 2c1.3 3.3 4.6 4.6 4.6 9A4.6 4.6 0 0 1 7.4 11c0-1.6.7-2.8 1.7-3.8.2 1.9 1.9 2.1 1.9.3 0-2 .3-4 1-5.5z" fill="currentColor"/>',
    target:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/>',
    medal:'<path d="M9 3l3 5.5L15 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m12 11.6 1.1 2.3 2.5.3-1.9 1.7.5 2.5-2.2-1.2-2.2 1.2.5-2.5-1.9-1.7 2.5-.3z" fill="currentColor"/>',
  };
  return `<svg viewBox="0 0 24 24" width="34" height="34">${I[n]||I.trophy}</svg>`;
}

/* ── MONTHLY STATS ── */
function renderMonthly(filterYear) {
  const years = [...new Set(acts.map(a=>new Date(a.start_date).getFullYear()))].sort((a,b)=>b-a);
  const yr = filterYear || years[0];

  // year buttons
  const yb = document.getElementById('yearBtns');
  yb.innerHTML = years.map(y=>`<button class="year-btn${y===yr?' active':''}" onclick="renderMonthly(${y})">${y}</button>`).join('');

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cntLbl = sportMode()==='run' ? 'Runs' : 'Rides';
  const rows = {};
  modeActs().filter(a=>new Date(a.start_date).getFullYear()===yr).forEach(a=>{
    const m = new Date(a.start_date).getMonth();
    if(!rows[m]) rows[m]={rides:0,dist:0,elev:0,time:0,speed:[],hr:[]};
    rows[m].rides++;
    rows[m].dist += a.distance||0;
    rows[m].elev += a.total_elevation_gain||0;
    rows[m].time += a.moving_time||0;
    if(a.average_speed) rows[m].speed.push(a.average_speed);
    if(a.average_heartrate) rows[m].hr.push(a.average_heartrate);
  });

  let html = `<table class="month-table">
    <thead><tr>
      <th>Month</th><th>${cntLbl}</th><th>Distance</th><th>Elevation</th><th>Moving Time</th><th>Avg Speed</th><th>Avg HR</th>
    </tr></thead><tbody>`;

  let totR=0,totD=0,totE=0,totT=0,allSpd=[],allHr=[];
  for(let m=0;m<12;m++){
    const r=rows[m];
    if(!r){html+=`<tr><td class="dim">${MONTHS[m]}</td><td colspan="6" class="dim">—</td></tr>`;continue;}
    totR+=r.rides;totD+=r.dist;totE+=r.elev;totT+=r.time;
    allSpd=[...allSpd,...r.speed];allHr=[...allHr,...r.hr];
    const avgSpd=r.speed.length?r.speed.reduce((a,b)=>a+b,0)/r.speed.length:0;
    const avgHr=r.hr.length?Math.round(r.hr.reduce((a,b)=>a+b,0)/r.hr.length):null;
    html+=`<tr>
      <td style="font-weight:700">${MONTHS[m]}</td>
      <td class="num">${r.rides}</td>
      <td class="num">${fmtKm(r.dist)} <span class="dim">${distUnit()}</span></td>
      <td class="num">${Math.round(elevVal(r.elev)).toLocaleString()} <span class="dim">${elevUnit()}</span></td>
      <td class="num">${fmtT(r.time)}</td>
      <td class="num">${avgSpd?kmh(avgSpd).toFixed(1)+' <span class="dim">'+speedUnit()+'</span>':'—'}</td>
      <td class="num">${avgHr?avgHr+' <span class="dim">bpm</span>':'—'}</td>
    </tr>`;
  }

  const totAvgSpd=allSpd.length?allSpd.reduce((a,b)=>a+b,0)/allSpd.length:0;
  const totAvgHr=allHr.length?Math.round(allHr.reduce((a,b)=>a+b,0)/allHr.length):null;
  html+=`<tr style="border-top:2px solid var(--orange);font-weight:700">
    <td>Total</td>
    <td class="num">${totR}</td>
    <td class="num">${fmtKm(totD)} <span class="dim">${distUnit()}</span></td>
    <td class="num">${Math.round(elevVal(totE)).toLocaleString()} <span class="dim">${elevUnit()}</span></td>
    <td class="num">${fmtT(totT)}</td>
    <td class="num">${totAvgSpd?kmh(totAvgSpd).toFixed(1)+' <span class="dim">'+speedUnit()+'</span>':'—'}</td>
    <td class="num">${totAvgHr?totAvgHr+' <span class="dim">bpm</span>':'—'}</td>
  </tr>`;
  html+=`</tbody></table>`;
  document.getElementById('monthlyTable').innerHTML=html;
  if (window.applyI18n) window.applyI18n();
}

/* ── BEST EFFORTS ── */
function renderBestEfforts(){
  const CATS=[
    {title:'Longest Rides',key:'distance',fmt:a=>fmtKm(a)+' '+distUnit(),sort:(a,b)=>(b.distance||0)-(a.distance||0)},
    {title:'Most Elevation',key:'total_elevation_gain',fmt:a=>fmtElev(a),sort:(a,b)=>(b.total_elevation_gain||0)-(a.total_elevation_gain||0)},
    {title:'Fastest Avg Speed',key:'average_speed',fmt:a=>kmh(a).toFixed(1)+' '+speedUnit(),sort:(a,b)=>(b.average_speed||0)-(a.average_speed||0)},
    {title:'Highest Max Speed',key:'max_speed',fmt:a=>kmh(a).toFixed(1)+' '+speedUnit(),sort:(a,b)=>(b.max_speed||0)-(a.max_speed||0)},
    {title:'Highest Heart Rate',key:'max_heartrate',fmt:a=>Math.round(a)+' bpm',sort:(a,b)=>(b.max_heartrate||0)-(a.max_heartrate||0)},
    {title:'Highest Suffer Score',key:'suffer_score',fmt:a=>Math.round(a),sort:(a,b)=>(b.suffer_score||0)-(a.suffer_score||0)},
  ];
  const MEDALS=['🥇','🥈','🥉'];
  const el=document.getElementById('bestGrid');
  const src=modeActs();
  el.innerHTML=CATS.map(cat=>{
    const sorted=src.filter(a=>a[cat.key]>0).sort(cat.sort).slice(0,5);
    if(!sorted.length) return '';
    const rows=sorted.map((a,i)=>`
      <div class="best-row">
        <div class="best-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${MEDALS[i]||i+1}</div>
        <div class="best-name">${a.name||'Activity'} <span style="color:var(--muted);font-size:10px;">${fmtDt(a.start_date)}</span></div>
        <div class="best-val">${cat.fmt(a[cat.key])}</div>
      </div>`).join('');
    return `<div class="best-card"><div class="best-card-title">${cat.title}</div>${rows}</div>`;
  }).join('');
  if (window.applyI18n) window.applyI18n();
}

/* ── GEAR ── */
function _renderBikeList(el, bikes) {
  const bikeStats={};
  acts.forEach(a=>{
    if(!a.gear_id) return;
    if(!bikeStats[a.gear_id]) bikeStats[a.gear_id]={rides:0,dist:0,elev:0};
    bikeStats[a.gear_id].rides++;
    bikeStats[a.gear_id].dist+=a.distance||0;
    bikeStats[a.gear_id].elev+=a.total_elevation_gain||0;
  });
  el.innerHTML=bikes.map(b=>{
    const st=bikeStats[b.id]||{rides:0,dist:0,elev:0};
    return `<div class="gear-card">
      <div class="gear-name">${b.nickname||b.name||'Bike'}${b.primary?'<span class="gear-primary">Primary</span>':''}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">${b.name||''}</div>
      <div class="gear-stats">
        <div><div class="gear-stat-val">${kmVal(b.distance||st.dist).toFixed(0)}</div><div class="gear-stat-lbl">Total ${distUnit()}</div></div>
        <div><div class="gear-stat-val">${st.rides}</div><div class="gear-stat-lbl">Rides logged</div></div>
        <div><div class="gear-stat-val">${st.elev?Math.round(elevVal(st.elev)/1000).toFixed(1)+'k':'—'}</div><div class="gear-stat-lbl">Elevation ${elevUnit()}</div></div>
      </div>
    </div>`;
  }).join('');
  if (window.applyI18n) window.applyI18n();
}

async function renderGear(){
  const el=document.getElementById('gearGrid');
  let bikes=(currentAthlete&&currentAthlete.bikes)||[];
  if(bikes.length){ _renderBikeList(el,bikes); renderGearTool(bikes); return; }

  // fallback: fetch each unique gear_id from activities
  const gearIds=[...new Set(acts.map(a=>a.gear_id).filter(Boolean))];
  if(!gearIds.length){
    el.innerHTML='<div class="card" style="color:var(--muted);font-size:13px;">No gear data — add bikes to your Strava profile and reconnect.</div>';
    return;
  }
  el.innerHTML='<p style="color:var(--muted);padding:8px">Loading gear…</p>';
  try{
    const results=await Promise.all(gearIds.map(id=>api(`/gear/${id}`).catch(()=>null)));
    bikes=results.filter(Boolean);
    if(!bikes.length){el.innerHTML='<div class="card" style="color:var(--muted);font-size:13px;">Could not load gear data.</div>';return;}
    _renderBikeList(el,bikes);
    renderGearTool(bikes);
  }catch(e){
    el.innerHTML=`<div class="card" style="color:var(--muted);font-size:13px;">Gear error: ${e.message}</div>`;
  }
}

/* ── GEAR REASSIGN (bulk edit) ── */
function _bikeName(bikes,id){ const b=bikes.find(x=>x.id===id); return b?(b.nickname||b.name||'Bike'):'—'; }
function renderGearTool(bikes){
  const el=document.getElementById('gearReassign');
  if(!el) return;
  if(!bikes||!bikes.length){ el.innerHTML=''; return; }
  const rides=acts.filter(isRide);
  if(!rides.length){ el.innerHTML=''; return; }
  const bikeOpts=bikes.map(b=>`<option value="${b.id}">${b.nickname||b.name||'Bike'}</option>`).join('');
  el.innerHTML=`
    <div class="gr-panel">
      <div class="gr-title">Reassign Gear <span class="gr-sub">change the bike on multiple activities at once</span></div>
      <div class="gr-controls">
        <label class="gr-selall"><input type="checkbox" id="grAll"> Select all visible</label>
        <input type="text" id="grSearch" class="gr-search" placeholder="Filter activities…">
        <div class="gr-apply">
          <span class="gr-to">Assign to</span>
          <select id="grBike" class="gr-select">${bikeOpts}</select>
          <button id="grSubmit" class="btn btn-primary">Apply (<span id="grCount">0</span>)</button>
        </div>
      </div>
      <div id="grStatus" class="gr-status"></div>
      <div class="gr-list" id="grList">
        ${rides.map(a=>`<label class="gr-row" data-name="${(a.name||'').toLowerCase()}">
          <input type="checkbox" class="gr-cb" value="${a.id}">
          <span class="gr-date">${fmtDt(a.start_date)}</span>
          <span class="gr-name">${a.name||'Activity'}</span>
          <span class="gr-cur" id="gr-cur-${a.id}">${a.gear_id?_bikeName(bikes,a.gear_id):'—'}</span>
          <span class="gr-dist">${fmtD(a.distance)}</span>
        </label>`).join('')}
      </div>
    </div>`;
  const list=el.querySelector('#grList');
  const cbs=()=>[...list.querySelectorAll('.gr-cb')];
  const updCount=()=>{ el.querySelector('#grCount').textContent=cbs().filter(c=>c.checked).length; };
  list.addEventListener('change',updCount);
  el.querySelector('#grAll').onchange=e=>{
    cbs().forEach(cb=>{ if(cb.closest('.gr-row').style.display!=='none') cb.checked=e.target.checked; });
    updCount();
  };
  el.querySelector('#grSearch').oninput=e=>{
    const q=e.target.value.toLowerCase();
    list.querySelectorAll('.gr-row').forEach(r=>{ r.style.display=r.dataset.name.includes(q)?'':'none'; });
  };
  el.querySelector('#grSubmit').onclick=()=>gearReassignSubmit(bikes);
  if (window.applyI18n) window.applyI18n();
}

async function gearReassignSubmit(bikes){
  const el=document.getElementById('gearReassign');
  const gearId=el.querySelector('#grBike').value;
  const bn=_bikeName(bikes,gearId);
  const ids=[...el.querySelectorAll('.gr-cb')].filter(c=>c.checked).map(c=>c.value);
  const status=el.querySelector('#grStatus');
  if(!ids.length){ status.className='gr-status warn'; status.textContent='Select at least one activity first.'; return; }
  if(!confirm(`Reassign ${ids.length} activit${ids.length>1?'ies':'y'} to “${bn}”?\nThis updates your activities on Strava.`)) return;
  const submit=el.querySelector('#grSubmit'); submit.disabled=true;
  let ok=0, fail=0;
  for(let i=0;i<ids.length;i++){
    status.className='gr-status'; status.textContent=`Updating ${i+1} / ${ids.length}…`;
    try{
      await apiPut(`/activities/${ids[i]}`,{gear_id:gearId});
      ok++;
      const a=acts.find(x=>String(x.id)===String(ids[i])); if(a) a.gear_id=gearId;
      const cur=document.getElementById('gr-cur-'+ids[i]); if(cur) cur.textContent=bn;
    }catch(e){
      fail++;
      if(/ 40[13] /.test(' '+e.message+' ')){
        status.className='gr-status err';
        status.textContent='Write access not granted. Click Disconnect, then reconnect with Strava to allow editing.';
        submit.disabled=false; return;
      }
      if(/ 429 /.test(' '+e.message+' ')){
        status.className='gr-status err';
        status.textContent=`Strava rate limit hit after ${ok} updates — wait ~15 min and retry the rest.`;
        submit.disabled=false; break;
      }
    }
  }
  if(submit.disabled){ status.className='gr-status '+(fail?'warn':'ok'); status.textContent=`Done — ${ok} updated${fail?`, ${fail} failed`:''}.`; submit.disabled=false; }
  try{ const aid=localStorage.getItem('strava_athlete_id'); if(aid&&typeof cacheSave==='function') cacheSave(acts,aid); }catch{}
  renderGear();
}

/* ── HEATMAP ── */
function renderHeatmap(){
  if(!window.L){setTimeout(renderHeatmap,300);return;}
  const el=document.getElementById('leafletMap');
  if(leafletMapInst){leafletMapInst.remove();leafletMapInst=null;}

  leafletMapInst=L.map(el,{zoomControl:true,scrollWheelZoom:true,center:[-8.34,115.09],zoom:12});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
    attribution:'&copy; <a href="https://carto.com">CARTO</a>',maxZoom:19,subdomains:'abcd'
  }).addTo(leafletMapInst);

  const bounds=[];
  modeActs().forEach(a=>{
    if(!a.map||!a.map.summary_polyline) return;
    try{
      const pts=decodePolyline(a.map.summary_polyline);
      if(!pts.length) return;
      const latlngs=pts.map(p=>[p[0],p[1]]);
      L.polyline(latlngs,{color:'#FC4C02',weight:1.5,opacity:0.65}).addTo(leafletMapInst);
      latlngs.forEach(ll=>bounds.push(ll));
    }catch{}
  });

  if(bounds.length){
    // Fit to the dense core of activities (5th–95th percentile) so a few
    // far-away rides don't force the map to zoom way out. Works for any user.
    const lats=bounds.map(b=>b[0]).sort((a,b)=>a-b);
    const lngs=bounds.map(b=>b[1]).sort((a,b)=>a-b);
    const q=(arr,p)=>arr[Math.min(arr.length-1,Math.max(0,Math.floor((arr.length-1)*p)))];
    const sw=[q(lats,0.05),q(lngs,0.05)], ne=[q(lats,0.95),q(lngs,0.95)];
    leafletMapInst.fitBounds([sw,ne],{padding:[24,24],maxZoom:15});
  }
  else leafletMapInst.setView([-8.34,115.09],12);
}

/* ── MILESTONES ── */
let milestoneMode=null; // 'ride' | 'run' — global sport mode (navbar toggle)
function isRun(a){ return a.type==='Run'||a.type==='VirtualRun'||a.type==='TrailRun'; }
function sportMode(){
  if(milestoneMode===null){
    const r=acts.filter(isRide).length, ru=acts.filter(isRun).length;
    milestoneMode = ru>r ? 'run' : 'ride';
  }
  return milestoneMode;
}
// activities for the current sport mode — used by the mode-aware pages
function modeActs(){ return sportMode()==='run' ? acts.filter(isRun) : acts.filter(isRide); }
function setMilestoneMode(m){ setSportMode(m); }
function setSportMode(m){
  milestoneMode=m;
  document.querySelectorAll('#modeToggle [data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  // re-render every mode-aware page
  ['renderStats','renderEddington','renderActivities','renderTrends','renderCalendar','renderMonthly','renderBestEfforts','renderRewind']
    .forEach(fn=>{ try{ if(typeof window[fn]==='function') window[fn](); }catch{} });
  try{ if(typeof leafletMapInst!=='undefined' && leafletMapInst) renderHeatmap(); }catch{}
  renderMilestones();
  if (window.applyI18n) window.applyI18n();
}
function _pace(speed){ if(!speed) return '—'; const sec=Math.round((useImperial?1609.34:1000)/speed); return `${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`; }
function renderMilestones(){
  const el=document.getElementById('milestonesGrid');
  if(!acts.length){el.innerHTML='<p style="color:var(--muted);padding:8px">No data.</p>';return;}
  const rides=acts.filter(isRide);
  const runs=acts.filter(a=>a.type==='Run'||a.type==='VirtualRun');
  let mode=sportMode();
  if(mode==='run' && !runs.length && rides.length){ milestoneMode='ride'; mode='ride'; }
  if(mode==='ride' && !rides.length && runs.length){ milestoneMode='run'; mode='run'; }
  const set = mode==='run' ? runs : rides;

  // longest activity streak (all activities)
  const days=new Set(acts.map(a=>a.start_date?a.start_date.slice(0,10):null).filter(Boolean));
  let best=0,cur=0,d=new Date();
  for(let i=0;i<730;i++){ const k=d.toISOString().slice(0,10); if(days.has(k)){cur++;best=Math.max(best,cur);}else cur=0; d.setDate(d.getDate()-1); }
  const streak=best;

  // totals for the selected mode
  const tDist=kmVal(set.reduce((s,a)=>s+(a.distance||0),0)).toFixed(0);
  const tElev=Math.round(elevVal(set.reduce((s,a)=>s+(a.total_elevation_gain||0),0)));
  const tTime=set.reduce((s,a)=>s+(a.moving_time||0),0);
  const totals=[
    {v:set.length.toLocaleString(), l:mode==='run'?'Runs':'Rides'},
    {v:Number(tDist).toLocaleString(), l:'Distance ('+distUnit()+')'},
    {v:tElev.toLocaleString(), l:'Elevation ('+elevUnit()+')'},
    {v:fmtT(tTime), l:'Moving Time', sub:'≈ '+fmtDays(tTime)},
  ];

  // records within the mode
  const longest=set.reduce((m,a)=>(a.distance||0)>(m.distance||0)?a:m,set[0]||{});
  const mostElev=set.reduce((m,a)=>(a.total_elevation_gain||0)>(m.total_elevation_gain||0)?a:m,set[0]||{});
  const fastest=set.filter(a=>a.average_speed>0).reduce((m,a)=>a.average_speed>(m.average_speed||0)?a:m,{});
  const topSpd=set.filter(a=>a.max_speed>0).reduce((m,a)=>a.max_speed>(m.max_speed||0)?a:m,{});
  const longDur=set.reduce((m,a)=>(a.moving_time||0)>(m.moving_time||0)?a:m,set[0]||{});
  const bestHR=set.filter(a=>a.average_heartrate>0).reduce((m,a)=>a.average_heartrate>(m.average_heartrate||0)?a:m,{});

  const records = mode==='run' ? [
    {icon:'run',c:'#fc4c02',label:'Longest Run',val:longest.distance?fmtKm(longest.distance):'—',unit:distUnit(),desc:longest.name},
    {icon:'bolt',c:'#4da8ff',label:'Best Pace',val:fastest.average_speed?_pace(fastest.average_speed):'—',unit:'/'+distUnit(),desc:fastest.name},
    {icon:'mountain',c:'#a78bfa',label:'Most Elevation',val:mostElev.total_elevation_gain?Math.round(elevVal(mostElev.total_elevation_gain)).toLocaleString():'—',unit:elevUnit(),desc:mostElev.name},
    {icon:'clock',c:'#00cc88',label:'Longest Duration',val:longDur.moving_time?fmtT(longDur.moving_time):'—',unit:'',desc:longDur.name},
    {icon:'heart',c:'#f87171',label:'Peak Heart Rate',val:bestHR.average_heartrate?Math.round(bestHR.average_heartrate):'—',unit:'bpm',desc:bestHR.name},
    {icon:'flame',c:'#fb923c',label:'Activity Streak',val:streak||'—',unit:'days',desc:'Longest consecutive days'},
  ] : [
    {icon:'bike',c:'#fc4c02',label:'Longest Ride',val:longest.distance?fmtKm(longest.distance):'—',unit:distUnit(),desc:longest.name},
    {icon:'mountain',c:'#a78bfa',label:'Most Elevation',val:mostElev.total_elevation_gain?Math.round(elevVal(mostElev.total_elevation_gain)).toLocaleString():'—',unit:elevUnit(),desc:mostElev.name},
    {icon:'gauge',c:'#4da8ff',label:'Fastest Avg',val:fastest.average_speed?kmh(fastest.average_speed).toFixed(1):'—',unit:speedUnit(),desc:fastest.name},
    {icon:'bolt',c:'#facc15',label:'Top Speed',val:topSpd.max_speed?kmh(topSpd.max_speed).toFixed(1):'—',unit:speedUnit(),desc:topSpd.name},
    {icon:'heart',c:'#f87171',label:'Peak Heart Rate',val:bestHR.average_heartrate?Math.round(bestHR.average_heartrate):'—',unit:'bpm',desc:bestHR.name},
    {icon:'flame',c:'#fb923c',label:'Activity Streak',val:streak||'—',unit:'days',desc:'Longest consecutive days'},
  ];

  el.innerHTML=`
    <div class="mst-banner">
      ${totals.map(t=>`<div class="mst-cell"><div class="mst-cv">${t.v}</div><div class="mst-cl">${t.l}</div>${t.sub?`<div class="mst-cs">${t.sub}</div>`:''}</div>`).join('')}
    </div>
    <div class="mst-grid">
      ${records.map(r=>`<div class="mst-card">
        <div class="mst-ic" style="--c:${r.c}">${svgIcon(r.icon)}</div>
        <div class="mst-info">
          <div class="mst-lbl">${r.label}</div>
          <div class="mst-val">${r.val}${r.unit?`<span>${r.unit}</span>`:''}</div>
          <div class="mst-sub">${r.desc||'&nbsp;'}</div>
        </div>
      </div>`).join('')}
    </div>`;
  if (window.applyI18n) window.applyI18n();
}

/* ── REWIND ── */
function renderRewind(filterYear){
  const el=document.getElementById('rewindContent');
  const years=[...new Set(acts.map(a=>new Date(a.start_date).getFullYear()))].sort((a,b)=>b-a);
  if(!years.length){el.innerHTML='<p style="color:var(--muted)">No data.</p>';return;}
  const yr=filterYear||years[0];
  const yb=document.getElementById('rewindYearBtns');
  yb.innerHTML=years.map(y=>`<button class="year-btn${y===yr?' active':''}" onclick="renderRewind(${y})">${y}</button>`).join('');
  const ya=modeActs().filter(a=>new Date(a.start_date).getFullYear()===yr);
  if(!ya.length){el.innerHTML='<p style="color:var(--muted)">No '+(sportMode()==='run'?'runs':'rides')+' in '+yr+'.</p>';return;}

  const types={};
  ya.forEach(a=>{types[a.type]=(types[a.type]||0)+1;});
  const topType=Object.entries(types).sort((a,b)=>b[1]-a[1])[0];
  const longestA=ya.reduce((m,a)=>(a.distance||0)>(m.distance||0)?a:m,ya[0]||{});
  const hrA=ya.filter(a=>a.average_heartrate>0);
  const avgHRy=hrA.length?Math.round(hrA.reduce((s,a)=>s+a.average_heartrate,0)/hrA.length):0;
  const totalDist=kmVal(ya.reduce((s,a)=>s+(a.distance||0),0)).toFixed(0);
  const totalElev=Math.round(elevVal(ya.reduce((s,a)=>s+(a.total_elevation_gain||0),0)));
  const totalTime=ya.reduce((s,a)=>s+(a.moving_time||0),0);
  const avgDist=ya.length?kmVal(ya.reduce((s,a)=>s+(a.distance||0),0)/ya.length).toFixed(1):0;

  // monthly breakdown for chart
  const monthly=Array(12).fill(null).map(()=>({dist:0,count:0}));
  ya.forEach(a=>{const m=new Date(a.start_date).getMonth();monthly[m].dist+=a.distance||0;monthly[m].count++;});
  const peakMonth=monthly.reduce((mi,m,i)=>m.dist>monthly[mi].dist?i:mi,0);
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // day-of-week distribution
  const dow=Array(7).fill(0);
  ya.forEach(a=>{dow[new Date(a.start_date).getDay()]++;});
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const busyDay=DAYS[dow.indexOf(Math.max(...dow))];

  // ── side-by-side comparison: selected year vs the year before ──
  const prevYr=yr-1;
  const _ms=modeActs();
  const ys=y=>{const a=_ms.filter(x=>new Date(x.start_date).getFullYear()===y);return{n:a.length,dist:a.reduce((s,x)=>s+(x.distance||0),0),elev:a.reduce((s,x)=>s+(x.total_elevation_gain||0),0),time:a.reduce((s,x)=>s+(x.moving_time||0),0)};};
  const A=ys(yr), B=ys(prevYr), hasB=B.n>0;
  const dlt=(da,db)=>{ if(!hasB||db===0) return '<span class="ryc-d">—</span>'; const pct=(da-db)/db*100, up=pct>=0; return `<span class="ryc-d ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct).toFixed(0)}%</span>`; };
  const cmpRows=[
    {l:'Activities', a:A.n.toLocaleString(), b:hasB?B.n.toLocaleString():'—', da:A.n, db:B.n},
    {l:'Distance', a:fmtKm(A.dist)+' '+distUnit(), b:hasB?fmtKm(B.dist)+' '+distUnit():'—', da:A.dist, db:B.dist},
    {l:'Elevation', a:Math.round(elevVal(A.elev)).toLocaleString()+' '+elevUnit(), b:hasB?Math.round(elevVal(B.elev)).toLocaleString()+' '+elevUnit():'—', da:A.elev, db:B.elev},
    {l:'Moving Time', a:fmtT(A.time), b:hasB?fmtT(B.time):'—', da:A.time, db:B.time},
  ];
  const cmpHtml=`
    <div class="ryc">
      <div class="ryc-row ryc-head"><span></span><span>${yr}</span><span>${prevYr}</span><span>YoY</span></div>
      ${cmpRows.map(r=>`<div class="ryc-row"><span class="ryc-l">${r.l}</span><span class="ryc-a">${r.a}</span><span class="ryc-b">${r.b}</span>${dlt(r.da,r.db)}</div>`).join('')}
    </div>`;

  el.innerHTML=cmpHtml+`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px">
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Activities</div><div style="font-size:32px;font-weight:800;color:var(--orange)">${ya.length}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Distance</div><div style="font-size:32px;font-weight:800;color:var(--text)">${Number(totalDist).toLocaleString()}<span style="font-size:14px;color:var(--muted)"> ${distUnit()}</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Elevation</div><div style="font-size:32px;font-weight:800;color:var(--text)">${totalElev.toLocaleString()}<span style="font-size:14px;color:var(--muted)"> ${elevUnit()}</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Moving Time</div><div style="font-size:24px;font-weight:800;color:var(--text)">${fmtT(totalTime)}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Avg Distance</div><div style="font-size:32px;font-weight:800;color:var(--text)">${avgDist}<span style="font-size:14px;color:var(--muted)"> ${distUnit()}</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Top Sport</div><div style="font-size:20px;font-weight:800;color:var(--orange)">${topType?topType[0]:'—'}</div><div style="font-size:12px;color:var(--muted)">${topType?topType[1]+' activities':''}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Longest</div><div style="font-size:26px;font-weight:800;color:var(--text)">${longestA.distance?fmtD(longestA.distance):'—'}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Avg HR</div><div style="font-size:32px;font-weight:800;color:var(--text)">${avgHRy||'—'}<span style="font-size:14px;color:var(--muted)"> bpm</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Busiest Day</div><div style="font-size:28px;font-weight:800;color:var(--text)">${busyDay}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Peak Month</div><div style="font-size:28px;font-weight:800;color:var(--orange)">${MONTHS[peakMonth]}</div></div>
    </div>
    <div class="chart-wrap" style="height:220px"><canvas id="rewindChart"></canvas></div>`;
  if (window.applyI18n) window.applyI18n();

  requestAnimationFrame(()=>{
    const ctx2=document.getElementById('rewindChart');
    if(!ctx2)return;
    if(ctx2._chart)ctx2._chart.destroy();
    ctx2._chart=new Chart(ctx2,{
      type:'bar',
      data:{labels:MONTHS,datasets:[
        {label:t('distanceWord')+' ('+distUnit()+')',data:monthly.map(m=>kmVal(m.dist).toFixed(1)),backgroundColor:'rgba(252,76,2,0.7)',borderRadius:4,order:1},
        {label:t('chActs'),data:monthly.map(m=>m.count),type:'line',borderColor:'rgba(255,255,255,0.5)',borderWidth:2,pointRadius:3,fill:false,yAxisID:'y2',order:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aaa',boxWidth:12}}},
        scales:{
          x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#888'}},
          y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#888'},title:{display:true,text:distUnit(),color:'#888'}},
          y2:{position:'right',grid:{display:false},ticks:{color:'#888'},title:{display:true,text:t('chActs'),color:'#888'}}
        }}
    });
  });
}

/* ── TROPHIES / KOMs ── */
async function renderChallenges(){
  const el=document.getElementById('challengesGrid');
  el.innerHTML='<p style="color:var(--muted);padding:8px">Loading trophies…</p>';

  const athleteId=currentAthlete?.id||(acts[0]?.athlete?.id)||0;

  // parallel: KOMs + lifetime stats
  let komList=[], st=null;
  try{
    [komList, st]=await Promise.all([
      (async()=>{
        let list=[],page=1;
        while(page<=4){
          const r=await api(`/athletes/${athleteId}/koms?page=${page}&per_page=50`);
          if(!r||!r.length) break;
          list=[...list,...r];
          if(r.length<50) break;
          page++;
        }
        return list;
      })(),
      api(`/athletes/${athleteId}/stats`).catch(()=>null),
    ]);
  }catch{}

  // from cached activities (last 200)
  const totalAch =acts.reduce((s,a)=>s+(a.achievement_count||0),0);
  const totalPR  =acts.reduce((s,a)=>s+(a.pr_count||0),0);
  const totalKudos=acts.reduce((s,a)=>s+(a.kudos_count||0),0);
  const rides    =acts.filter(isRide);
  const runs     =acts.filter(a=>a.type==='Run'||a.type==='VirtualRun');
  const longestRide=rides.reduce((m,a)=>a.distance>m?a.distance:m,0)/1000;
  const longestRun =runs.reduce((m,a)=>a.distance>m?a.distance:m,0)/1000;

  // prefer lifetime stats from API if available
  const art =st?.all_ride_totals;
  const yrt =st?.ytd_ride_totals;
  const rrt =st?.recent_ride_totals;
  const arun=st?.all_run_totals;
  const bigRide =(st?.biggest_ride_distance||0)/1000;
  const bigClimb=(st?.biggest_climb_elevation_gain||0);

  const lifetimeKm   =(art?.distance||0)/1000;
  const lifetimeElev =(art?.elevation_gain||0);
  const lifetimeRides=(art?.count||0);
  const lifetimeHours=Math.round((art?.moving_time||0)/3600);
  const ytdKm  =(yrt?.distance||0)/1000;
  const ytdElev=(yrt?.elevation_gain||0);
  const ytdRides=(yrt?.count||0);
  const recentKm=(rrt?.distance||0)/1000;

  function statCell(lbl,val,unit,color){
    return `<div style="text-align:center;padding:12px 16px">
      <div style="font-size:26px;font-weight:900;color:${color||'var(--text)'};letter-spacing:-.5px;line-height:1">${val}</div>
      <div style="font-size:10px;font-weight:600;color:var(--muted);margin-top:2px">${unit}</div>
      <div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-top:1px;opacity:.7">${lbl}</div>
    </div>`;
  }

  function divider(){ return `<div style="width:1px;background:var(--border);align-self:stretch;margin:10px 0"></div>`; }

  let html='';

  /* ── 1. ATHLETE HERO CARD ── */
  if(currentAthlete){
    const img =currentAthlete.profile_medium||currentAthlete.profile||'';
    const name=(currentAthlete.firstname||'')+' '+(currentAthlete.lastname||'');
    const city=[currentAthlete.city,currentAthlete.state,currentAthlete.country].filter(Boolean).join(', ');
    const since=currentAthlete.created_at?new Date(currentAthlete.created_at).getFullYear():null;
    const followers=currentAthlete.follower_count||null;
    const following=currentAthlete.friend_count||null;
    const ftp=currentAthlete.ftp||null;

    html+=`<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px;border-color:rgba(252,76,2,.25);background:linear-gradient(135deg,rgba(252,76,2,.07) 0%,transparent 55%)">
      <div style="display:flex;align-items:center;gap:20px;padding:22px 24px">
        ${img?`<img src="${img}" alt="" style="width:88px;height:88px;border-radius:50%;border:3px solid var(--orange);flex-shrink:0;object-fit:cover" onerror="this.style.display='none'">` : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:24px;font-weight:900;letter-spacing:-.6px;line-height:1.1">${name}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px;display:flex;gap:12px;flex-wrap:wrap">
            ${city?`<span>${city}</span>`:''}
            ${since?`<span>Since ${since}</span>`:''}
            ${ftp?`<span>FTP ${ftp}w</span>`:''}
          </div>
          <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap">
            <div><span style="font-size:20px;font-weight:800;color:var(--orange)">${komList.length}</span><span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-left:5px">KOMs</span></div>
            <div><span style="font-size:20px;font-weight:800;color:var(--text)">${totalAch.toLocaleString()}</span><span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-left:5px">Achievements</span></div>
            <div><span style="font-size:20px;font-weight:800;color:var(--text)">${totalPR.toLocaleString()}</span><span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-left:5px">PRs</span></div>
            <div><span style="font-size:20px;font-weight:800;color:var(--text)">${totalKudos.toLocaleString()}</span><span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-left:5px">Kudos</span></div>
            ${followers!=null?`<div><span style="font-size:20px;font-weight:800;color:var(--text)">${followers.toLocaleString()}</span><span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-left:5px">Followers</span></div>`:''}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ── 2. LIFETIME STATS ── */
  if(art){
    html+=`<div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">All-time</div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
      <div style="display:flex;flex-wrap:wrap">
        ${statCell('Rides',lifetimeRides.toLocaleString(),'activities','var(--orange)')}
        ${divider()}
        ${statCell('Distance',Math.round(kmDisp(lifetimeKm)).toLocaleString(),distUnit(),'var(--text)')}
        ${divider()}
        ${statCell('Moving Time',lifetimeHours.toLocaleString(),'hours','var(--text)')}
        ${divider()}
        ${statCell('Elevation',Math.round(elevVal(lifetimeElev)/1000).toLocaleString(),'k '+elevUnit(),'var(--text)')}
        ${bigRide>0?divider()+statCell('Biggest Ride',kmDisp(bigRide).toFixed(1),distUnit(),'#4da8ff'):''}
        ${bigClimb>0?divider()+statCell('Biggest Climb',Math.round(elevVal(bigClimb)),elevUnit(),'#4da8ff'):''}
        ${arun?.count?divider()+statCell('Total Runs',arun.count.toLocaleString(),'activities','#00cc88'):''}
      </div>
    </div>`;
  }

  /* ── 3. YTD + RECENT ── */
  if(yrt){
    const yr=new Date().getFullYear();
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">${yr} — Year to date</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div style="display:flex;flex-wrap:wrap">
            ${statCell('Rides',ytdRides,'activities','var(--orange)')}
            ${divider()}
            ${statCell('Distance',Math.round(kmDisp(ytdKm)).toLocaleString(),distUnit(),'var(--text)')}
            ${divider()}
            ${statCell('Elevation',Math.round(elevVal(ytdElev)/1000*10)/10,'k '+elevUnit(),'var(--text)')}
          </div>
        </div>
      </div>
      ${rrt?`<div>
        <div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Last 4 weeks</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div style="display:flex;flex-wrap:wrap">
            ${statCell('Rides',rrt.count,'activities','var(--orange)')}
            ${divider()}
            ${statCell('Distance',Math.round(kmDisp(recentKm)).toLocaleString(),distUnit(),'var(--text)')}
            ${divider()}
            ${statCell('Elevation',Math.round(elevVal(rrt.elevation_gain||0)/1000*10)/10,'k '+elevUnit(),'var(--text)')}
          </div>
        </div>
      </div>`:''}
    </div>`;
  }

  /* ── 4. ACHIEVEMENT BADGES ── */
  function trophyIcon(color,icon){
    return `<div class="ach-badge-icon" style="color:${color};background:radial-gradient(circle at 35% 35%,${color}55 0%,${color}18 60%,${color}08 100%);border:3px solid ${color};box-shadow:0 0 18px ${color}44,inset 0 1px 0 rgba(255,255,255,.18);">${trophySvg(icon)}</div>`;
  }

  // use lifetime data where available
  const ltDist=lifetimeKm||rides.reduce((s,a)=>s+(a.distance||0),0)/1000;
  const ltElev=lifetimeElev||acts.reduce((s,a)=>s+(a.total_elevation_gain||0),0);
  const biggestRide=bigRide>0?bigRide:longestRide;

  const badges=[
    {icon:'crown',   name:'KOM / QOM',       val:komList.length,        unit:'segments',  color:'#ffd700', unlocked:komList.length>0},
    {icon:'trophy',  name:'Achievements',     val:totalAch.toLocaleString(), unit:'on Strava', color:'#ffd700', unlocked:totalAch>0},
    {icon:'bolt',    name:'Personal Records', val:totalPR.toLocaleString(),  unit:'PRs',       color:'#fc4c02', unlocked:totalPR>0},
    {icon:'kudos',   name:'Kudos',            val:totalKudos.toLocaleString(),unit:'received', color:'#fc4c02', unlocked:totalKudos>0},
    {icon:'globe',   name:'Century Rider',    val:biggestRide.toFixed(1),unit:'km best',   color:'#4da8ff', unlocked:biggestRide>=100},
    {icon:'mountain',name:'Everest Climber', val:Math.round(ltElev/1000)+'k',unit:'m climbed',color:'#4da8ff',unlocked:ltElev>=8848},
    {icon:'runner',  name:'Half Marathoner', val:longestRun.toFixed(1), unit:'km best',   color:'#00cc88', unlocked:longestRun>=21.1},
    {icon:'bike',    name:'1,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#00cc88',unlocked:ltDist>=1000},
    {icon:'flame',   name:'5,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#fb923c',unlocked:ltDist>=5000},
    {icon:'world',   name:'10,000 km Club',  val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#a78bfa',unlocked:ltDist>=10000},
    {icon:'target',  name:'100 Rides',        val:(lifetimeRides||rides.length).toLocaleString(),unit:'rides',color:'#fb923c',unlocked:(lifetimeRides||rides.length)>=100},
    {icon:'medal',   name:'500 Rides',        val:(lifetimeRides||rides.length).toLocaleString(),unit:'rides',color:'#a78bfa',unlocked:(lifetimeRides||rides.length)>=500},
  ];

  html+=`<div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Badges</div>`;
  html+=`<div class="ach-grid" style="margin-bottom:20px">`;
  html+=badges.map(b=>`
    <div class="ach-badge${b.unlocked?' unlocked':''}" style="--ach-color:${b.color}">
      ${b.unlocked?'<div class="ach-badge-bar"></div>':''}
      ${trophyIcon(b.color,b.icon)}
      <div class="ach-badge-val" style="color:${b.unlocked?b.color:'var(--muted)'}">${b.val}</div>
      <div class="ach-badge-unit">${b.unit}</div>
      <div class="ach-badge-name" style="color:${b.unlocked?'var(--text)':'var(--muted)'}">${b.name}</div>
    </div>`).join('');
  html+='</div>';

  /* ── 5. KOM LIST ── */
  if(komList.length){
    html+=`<div style="margin-bottom:10px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">KOM / QOM / CR — ${komList.length} Segments</div>`;
    html+=`<div class="kom-list">`;
    html+=komList.slice(0,40).map(e=>{
      const seg=e.segment||e;
      const dist=seg.distance?kmVal(seg.distance).toFixed(2)+' '+distUnit():'—';
      const grade=seg.average_grade!=null?seg.average_grade.toFixed(1)+'%':'—';
      const t=fmtT(e.elapsed_time||0);
      const loc=[seg.city,seg.state].filter(Boolean).join(', ');
      return `<div class="kom-item">
        <div class="kom-crown">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffd700"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2 3h10v2H7v-2z"/></svg>
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${seg.name||'Segment'}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">${dist} · ${grade} · ⏱ ${t}${loc?' · '+loc:''}</div>
        </div>
      </div>`;
    }).join('');
    if(komList.length>40) html+=`<div style="color:var(--muted);font-size:12px;padding:10px">+${komList.length-40} more KOMs</div>`;
    html+='</div>';
  }

  el.innerHTML=html;
  if (window.applyI18n) window.applyI18n();
}

/* ── SEGMENTS ── */
let segMaps = []; // {m, line} — re-fitted when the section becomes visible (maps build hidden)
const segDetailCache = {}; // segment id → detailed segment (has map.polyline)
let _segsData = null; // cached starred segments — re-rendered (not refetched) on unit toggle
async function renderSegments(){
  const el=document.getElementById('segmentsGrid');
  el.innerHTML='<p style="color:var(--muted);padding:8px">Loading starred segments…</p>';
  try{
    const segs=_segsData||(_segsData=await api('/segments/starred?per_page=50'));
    if(!segs||!segs.length){el.innerHTML='<p style="color:var(--muted);padding:8px">No starred segments.</p>';return;}

    // compute segment records
    const withPR = segs.filter(s=>s.athlete_pr_effort&&s.distance&&s.athlete_pr_effort.elapsed_time);
    const fastestSeg = withPR.length ? withPR.reduce((best,s)=>{
      const spd=(s.distance/s.athlete_pr_effort.elapsed_time)*3.6;
      const bSpd=(best.distance/best.athlete_pr_effort.elapsed_time)*3.6;
      return spd>bSpd?s:best;
    }) : null;
    const steepestSeg = segs.filter(s=>s.average_grade!=null).sort((a,b)=>b.average_grade-a.average_grade)[0]||null;
    const mostRiddenSeg = [...segs].sort((a,b)=>(b.effort_count||0)-(a.effort_count||0))[0]||null;
    const longestSeg = [...segs].sort((a,b)=>(b.distance||0)-(a.distance||0))[0]||null;

    // records bar
    const recItems=[
      fastestSeg&&{icon:'⚡',lbl:'Fastest PR',val:kmh(fastestSeg.distance/fastestSeg.athlete_pr_effort.elapsed_time).toFixed(1),unit:speedUnit(),name:fastestSeg.name,color:'var(--orange)'},
      steepestSeg&&{icon:'⛰',lbl:'Steepest',val:parseFloat(steepestSeg.average_grade).toFixed(1),unit:'%',name:steepestSeg.name,color:'#f87171'},
      mostRiddenSeg&&{icon:'🔁',lbl:'Most Ridden',val:(mostRiddenSeg.effort_count||0).toLocaleString(),unit:'efforts',name:mostRiddenSeg.name,color:'#60a5fa'},
      longestSeg&&{icon:'📏',lbl:'Longest',val:fmtKm(longestSeg.distance),unit:distUnit(),name:longestSeg.name,color:'#a78bfa'},
    ].filter(Boolean);

    const recHtml=recItems.length?`<div class="seg-summary">
      ${recItems.map(r=>`<div class="seg-sum">
        <div class="seg-sum-top" style="color:${r.color}">${r.icon} ${r.lbl}</div>
        <div class="seg-sum-val">${r.val}<span>${r.unit}</span></div>
        <div class="seg-sum-name">${r.name}</div>
      </div>`).join('')}
    </div>`:'';

    const _cnt={
      all:segs.length,
      ride:segs.filter(s=>(s.activity_type||'').toLowerCase()==='ride').length,
      run:segs.filter(s=>(s.activity_type||'').toLowerCase()==='run').length,
      climb:segs.filter(s=>(s.climb_category||0)>0).length,
      kom:segs.filter(s=>s.athlete_segment_stats&&s.athlete_segment_stats.pr_rank===1).length,
      pr:segs.filter(s=>s.athlete_pr_effort).length,
    };
    const _chip=(f,lbl)=>`<button class="seg-chip-btn${f==='all'?' active':''}" data-filter="${f}">${lbl} <span class="seg-chip-n">${_cnt[f]}</span></button>`;
    const controlsHtml=`<div class="seg-controls">
      <div class="seg-chips">
        ${_chip('all','All')}${_chip('ride','Rides')}${_chip('run','Runs')}${_chip('climb','Climbs')}${_chip('kom','KOMs')}${_chip('pr','With PR')}
      </div>
      <div class="seg-tools">
        <select class="seg-sort" id="segSort">
          <option value="default">Sort: Default</option>
          <option value="fastest">Fastest PR</option>
          <option value="longest">Longest</option>
          <option value="steepest">Steepest</option>
          <option value="ridden">Most ridden</option>
          <option value="name">Name A–Z</option>
        </select>
        <button class="seg-scan" id="segScan" title="Find fastest segments from your recent activities (not just starred)">⚲ Scan rides</button>
      </div>
    </div>`;

    el.innerHTML=recHtml+controlsHtml+`<div class="seg-grid" id="segGrid">`+segs.map(s=>{
      const dist    =kmVal(s.distance).toFixed(2);
      const gradeNum=s.average_grade!=null?parseFloat(s.average_grade):null;
      const gradeStr=gradeNum!=null?gradeNum.toFixed(1)+'%':null;
      const climb   =s.total_elevation_gain!=null?Math.round(elevVal(s.total_elevation_gain)):null;
      const pr      =s.athlete_pr_effort;
      const prTime  =pr?fmtT(pr.elapsed_time):null;
      const prSpeedNum=pr&&s.distance&&pr.elapsed_time?(s.distance/pr.elapsed_time):0;
      const prSpeed =prSpeedNum?kmh(prSpeedNum).toFixed(1):null;
      // VAM = vertical metres climbed per hour (from your PR time)
      const vam = pr&&pr.elapsed_time&&s.total_elevation_gain>0 ? Math.round(elevVal(s.total_elevation_gain)/(pr.elapsed_time/3600)) : null;
      const kom     =s.xoms&&s.xoms.kom?s.xoms.kom:null;
      const efforts =s.effort_count?s.effort_count.toLocaleString():null;
      const location=[s.city,s.state,s.country].filter(Boolean).join(', ');
      const isKom   =s.athlete_segment_stats&&s.athlete_segment_stats.pr_rank===1;

      const gc=gradeNum==null?'#666'
        :gradeNum<2?'#4ade80'
        :gradeNum<5?'#facc15'
        :gradeNum<8?'#fb923c'
        :'#f87171';

      return `<article class="seg-card${isKom?' is-kom':''}"
        data-sport="${(s.activity_type||'').toLowerCase()}" data-climb="${(s.climb_category||0)>0?1:0}"
        data-kom="${isKom?1:0}" data-pr="${pr?1:0}" data-speed="${prSpeedNum||0}"
        data-dist="${s.distance||0}" data-grade="${gradeNum!=null?gradeNum:-99}"
        data-efforts="${s.effort_count||0}" data-segname="${(s.name||'').toLowerCase().replace(/"/g,'')}">
        <div class="seg-map-wrap">
          <div class="seg-map" id="segmap-${s.id}"></div>
          <div class="seg-badges">
            ${gradeStr?`<span class="seg-chip" style="background:${gc}">${gradeStr}</span>`:'<span></span>'}
            ${isKom?`<span class="seg-chip seg-kom">👑 KOM</span>`:''}
          </div>
          <div class="seg-overlay">
            <a class="seg-name" href="https://www.strava.com/segments/${s.id}" target="_blank" rel="noopener">${s.name}</a>
            ${location?`<div class="seg-loc">${location}</div>`:''}
          </div>
          <button class="seg-expand" onclick="openSegMap('${s.id}')" title="View larger map" aria-label="View larger map">⤢</button>
        </div>
        <div class="seg-body">
          ${prTime?`<div class="seg-pr">
            <span class="seg-pr-lbl">PR</span>
            <span class="seg-pr-time">${prTime}</span>
            ${prSpeed?`<span class="seg-pr-speed">${prSpeed} ${speedUnit()}</span>`:''}
          </div>`:`<div class="seg-pr-empty">No personal record yet</div>`}
          <div class="seg-metrics">
            <div class="seg-m"><span class="seg-m-lbl">Distance</span><span class="seg-m-val">${dist} ${distUnit()}</span></div>
            <div class="seg-m"><span class="seg-m-lbl">Elevation</span><span class="seg-m-val">${climb!=null?climb+' '+elevUnit():'—'}</span></div>
            <div class="seg-m"><span class="seg-m-lbl">VAM</span><span class="seg-m-val">${vam!=null?vam+' '+elevUnit()+'/h':'—'}</span></div>
            <div class="seg-m"><span class="seg-m-lbl">KOM</span><span class="seg-m-val kom">${kom||'—'}</span></div>
          </div>
        </div>
        <div class="seg-foot">
          <span>${efforts?efforts+' efforts':'—'}</span>
          <a class="seg-link" href="https://www.strava.com/segments/${s.id}" target="_blank" rel="noopener">View on Strava →</a>
        </div>
      </article>`;
    }).join('')+'</div><div id="segScanResults"></div>';
    if (window.applyI18n) window.applyI18n();

    // init mini maps
    if(!window.L) return;
    segMaps = [];
    segs.forEach(async s=>{
      const mapEl=document.getElementById(`segmap-${s.id}`);
      if(!mapEl) return;
      // starred segments are summaries without a route polyline — fetch the
      // detailed segment (cached) so we draw the real path, not a straight line
      let poly=s.map&&(s.map.polyline||s.map.summary_polyline);
      if(!poly){
        try{
          const det=segDetailCache[s.id]||(segDetailCache[s.id]=await api(`/segments/${s.id}`));
          poly=det&&det.map&&(det.map.polyline||det.map.summary_polyline);
        }catch{}
      }
      let coords=[];
      if(poly) try{coords=decodePolyline(poly);}catch{}
      if(!coords.length&&s.start_latlng&&s.end_latlng) coords=[s.start_latlng,s.end_latlng];
      if(!coords.length){ mapEl.style.display='none'; return; }
      try{
        const m=L.map(mapEl,{zoomControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,attributionControl:false});
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd'}).addTo(m);
        const line=L.polyline(coords,{color:'#FC4C02',weight:3,opacity:.95}).addTo(m);
        L.circleMarker(coords[0],{radius:5,color:'#4ade80',fillColor:'#4ade80',fillOpacity:1,weight:0}).addTo(m);
        L.circleMarker(coords[coords.length-1],{radius:5,color:'#FC4C02',fillColor:'#FC4C02',fillOpacity:1,weight:0}).addTo(m);
        m.fitBounds(line.getBounds(),{padding:[16,16]});
        segMaps.push({m,line});
        setTimeout(()=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[16,16]});}catch{}},300);
      }catch{}
    });

    // category filter + sort
    const grid=document.getElementById('segGrid');
    function applySeg(){
      if(!grid) return;
      const filter=grid._filter||'all';
      const sort=(document.getElementById('segSort')||{}).value||'default';
      const cards=[...grid.querySelectorAll('.seg-card')];
      cards.forEach(c=>{
        const d=c.dataset;
        let show=true;
        if(filter==='ride') show=d.sport==='ride';
        else if(filter==='run') show=d.sport==='run';
        else if(filter==='climb') show=d.climb==='1';
        else if(filter==='kom') show=d.kom==='1';
        else if(filter==='pr') show=d.pr==='1';
        c.style.display=show?'':'none';
      });
      if(sort!=='default'){
        const key={fastest:'speed',longest:'dist',steepest:'grade',ridden:'efforts'}[sort];
        const ordered=sort==='name'
          ? cards.sort((a,b)=>a.dataset.segname.localeCompare(b.dataset.segname))
          : cards.sort((a,b)=>parseFloat(b.dataset[key])-parseFloat(a.dataset[key]));
        ordered.forEach(c=>grid.appendChild(c));
        setTimeout(()=>segMaps.forEach(({m,line})=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[16,16]});}catch{}}),60);
      }
    }
    el.querySelectorAll('.seg-chip-btn').forEach(b=>b.onclick=()=>{
      el.querySelectorAll('.seg-chip-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); if(grid) grid._filter=b.dataset.filter; applySeg();
    });
    const sortSel=document.getElementById('segSort'); if(sortSel) sortSel.onchange=applySeg;
    const scanBtn=document.getElementById('segScan'); if(scanBtn) scanBtn.onclick=scanSegments;
  }catch(e){
    el.innerHTML=`<p style="color:var(--muted);padding:8px">Segments unavailable (${e.message}).</p>`;
  }
}

/* ── SEGMENT MAP MODAL — full details on a big, interactive map ── */
let _segBigMap = null;
async function openSegMap(id){
  const s=(_segsData||[]).find(x=>String(x.id)===String(id));
  if(!s) return;
  const modal=document.getElementById('segMapModal');
  document.getElementById('segMapTitle').textContent=s.name||'Segment';
  document.getElementById('segMapStrava').href='https://www.strava.com/segments/'+s.id;

  const pr=s.athlete_pr_effort;
  const rows=[
    ['Distance', kmVal(s.distance).toFixed(2)+' '+distUnit()],
    ['Avg Grade', s.average_grade!=null?parseFloat(s.average_grade).toFixed(1)+'%':'—'],
    s.maximum_grade!=null && ['Max Grade', parseFloat(s.maximum_grade).toFixed(1)+'%'],
    ['Elevation', s.total_elevation_gain!=null?Math.round(elevVal(s.total_elevation_gain))+' '+elevUnit():'—'],
    s.elevation_high!=null && ['Highest', Math.round(elevVal(s.elevation_high))+' '+elevUnit()],
    s.elevation_low!=null && ['Lowest', Math.round(elevVal(s.elevation_low))+' '+elevUnit()],
    s.climb_category>0 && ['Climb Cat.', 'Cat '+s.climb_category],
    ['PR Time', pr?fmtT(pr.elapsed_time):'—'],
    pr&&s.distance&&pr.elapsed_time && ['PR Speed', kmh(s.distance/pr.elapsed_time).toFixed(1)+' '+speedUnit()],
    ['VAM', pr&&pr.elapsed_time&&s.total_elevation_gain>0?Math.round(elevVal(s.total_elevation_gain)/(pr.elapsed_time/3600))+' '+elevUnit()+'/h':'—'],
    ['KOM/CR', s.xoms&&s.xoms.kom?s.xoms.kom:'—'],
    ['Efforts', s.effort_count?s.effort_count.toLocaleString():'—']
  ].filter(Boolean);
  const loc=[s.city,s.state,s.country].filter(Boolean).join(', ');
  document.getElementById('segMapDetails').innerHTML=
    (loc?`<div class="actd-loc">📍 ${loc}</div>`:'')+
    `<div class="actd-grid">`+rows.map(r=>`<div class="actd-stat"><div class="actd-stat-val">${r[1]}</div><div class="actd-stat-lbl">${r[0]}</div></div>`).join('')+`</div>`;
  if (window.applyI18n) window.applyI18n();

  modal.classList.add('open');

  // build the route polyline (starred summaries lack it — fetch detailed segment, cached)
  let poly=s.map&&(s.map.polyline||s.map.summary_polyline);
  if(!poly){
    try{
      const det=segDetailCache[s.id]||(segDetailCache[s.id]=await api(`/segments/${s.id}`));
      poly=det&&det.map&&(det.map.polyline||det.map.summary_polyline);
    }catch{}
  }
  let coords=[];
  if(poly) try{coords=decodePolyline(poly);}catch{}
  if(!coords.length&&s.start_latlng&&s.end_latlng) coords=[s.start_latlng,s.end_latlng];

  const mapEl=document.getElementById('segMapBig');
  if(_segBigMap){try{_segBigMap.remove();}catch{} _segBigMap=null;}
  mapEl.innerHTML='';
  if(!window.L||!coords.length){ mapEl.innerHTML='<div class="segmap-empty">No map available for this segment.</div>'; return; }
  try{
    const m=L.map(mapEl,{scrollWheelZoom:true});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd'}).addTo(m);
    const line=L.polyline(coords,{color:'#FC4C02',weight:4,opacity:.95}).addTo(m);
    L.circleMarker(coords[0],{radius:6,color:'#4ade80',fillColor:'#4ade80',fillOpacity:1,weight:0}).addTo(m).bindTooltip('Start');
    L.circleMarker(coords[coords.length-1],{radius:6,color:'#FC4C02',fillColor:'#FC4C02',fillOpacity:1,weight:0}).addTo(m).bindTooltip('Finish');
    _segBigMap=m;
    setTimeout(()=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[30,30]});}catch{}},250);
  }catch{}
}
function closeSegMap(){
  document.getElementById('segMapModal').classList.remove('open');
  if(_segBigMap){try{_segBigMap.remove();}catch{} _segBigMap=null;}
}
document.getElementById('segMapModal').addEventListener('click', e=>{ if(e.target.id==='segMapModal') closeSegMap(); });

/* Scan recent activities for segment efforts (not just starred) */
const _segScanCache={};
async function scanSegments(){
  const btn=document.getElementById('segScan'), out=document.getElementById('segScanResults');
  if(!out) return;
  const list=acts.slice(0,30);
  if(btn) btn.disabled=true;
  out.innerHTML='<p style="color:var(--muted);padding:8px">Scanning your recent activities for segments…</p>';
  const best={}; let done=0, stopped=false;
  for(const a of list){
    if(a.id){
      try{
        const det=_segScanCache[a.id]||(_segScanCache[a.id]=await api(`/activities/${a.id}`));
        (det&&det.segment_efforts||[]).forEach(e=>{
          const seg=e.segment||{}, id=seg.id, t=e.elapsed_time||e.moving_time;
          if(!id||!t) return;
          const gain=(seg.elevation_high!=null&&seg.elevation_low!=null)?Math.max(0,seg.elevation_high-seg.elevation_low):0;
          if(!best[id]||t<best[id].t) best[id]={t,name:seg.name||e.name,dist:seg.distance||e.distance||0,gain,pr:e.pr_rank===1,kom:e.kom_rank!=null,sid:id};
        });
      }catch(err){ if(/ 429 /.test(' '+err.message+' ')){ stopped=true; break; } }
    }
    done++; if(btn) btn.textContent=`Scanning ${done}/${list.length}…`;
  }
  if(btn){ btn.disabled=false; btn.textContent='⚲ Rescan'; }
  const arr=Object.values(best).map(b=>({...b,spd:b.dist&&b.t?b.dist/b.t:0})).sort((x,y)=>y.spd-x.spd).slice(0,30);
  if(!arr.length){ out.innerHTML='<p style="color:var(--muted);padding:8px">No segments found in your recent activities.</p>'; return; }
  out.innerHTML=`<div class="seg-scan-title">${stopped?'Partial — rate limit hit · ':''}Fastest segments from your last ${list.length} activities</div>
    <div class="ctop-list">
      ${arr.map((b,i)=>`<a class="ctop-row" href="https://www.strava.com/segments/${b.sid}" target="_blank" rel="noopener">
        <span class="ctop-rank">${i+1}</span>
        <span class="ctop-info"><span class="ctop-name">${b.name||'Segment'}${b.kom?' 👑':''}${b.pr?' ⭐':''}</span><span class="ctop-meta">${kmVal(b.dist).toFixed(2)} ${distUnit()} · ${fmtT(b.t)}${b.gain>0?' · '+Math.round(elevVal(b.gain)/(b.t/3600))+' '+elevUnit()+'/h VAM':''}</span></span>
        <span class="ctop-val">${kmh(b.spd).toFixed(1)}<i>${speedUnit()}</i></span>
      </a>`).join('')}
    </div>`;
  if (window.applyI18n) window.applyI18n();
}

/* ── PHOTOS ── */
let photoItems = [], photoIdx = 0; // backing data for the lightbox
let _photosLoaded = false; // photos don't depend on units — don't refetch on unit toggle
/* Persistent per-activity photo cache (survives reloads) so we hit Strava's
   API only once per activity, not on every visit/refresh. */
let _actPhotoCache = {};            // actId -> [{url,thumb,video}]
let _photoObserver = null, _photoRateLimited = false;
function _photoCacheKey(){ return 'strava_photos_' + (localStorage.getItem('strava_athlete_id') || 'x'); }
function _photoCacheLoad(){ try{ return JSON.parse(localStorage.getItem(_photoCacheKey()) || '{}'); }catch{ return {}; } }
function _photoCacheSave(){ try{ localStorage.setItem(_photoCacheKey(), JSON.stringify(_actPhotoCache)); }catch{ /* quota — non-fatal */ } }

async function renderPhotos(){
  const el=document.getElementById('photosGrid');
  if(_photosLoaded) return;
  _photosLoaded=true;
  _actPhotoCache=_photoCacheLoad();
  const withPhotos=acts.filter(a=>a.total_photo_count>0); // ALL activities with photos
  if(!withPhotos.length){el.innerHTML='<p style="color:var(--muted);padding:8px">No photos found in your activities.</p>';return;}

  // one tile per activity — render instantly from cache; uncached tiles show a
  // skeleton and lazy-fetch only when they scroll into view (rate-limit friendly)
  el.innerHTML=withPhotos.map(a=>{
    const cached=_actPhotoCache[a.id];
    const cover=cached&&cached.length?(cached.find(x=>x.thumb)||cached[0]):null;
    const badge=a.total_photo_count>1?`<span class="photo-count">▣ ${a.total_photo_count}</span>`:(cover&&cover.video?'<span class="photo-play">▶</span>':'');
    return `<div class="photo-tile${cover?'':' photo-pending'}" data-actid="${a.id}" title="${(a.name||'').replace(/"/g,'&quot;')}" onclick="openActPhotos('${a.id}')">
      ${cover?`<img src="${cover.thumb||cover.url}" alt="" loading="lazy" decoding="async">`:'<div class="photo-skel"></div>'}
      ${badge}
      <div class="photo-caption"><span>${a.name||''}</span><span style="opacity:.65;font-size:9px">${a.start_date?fmtDt(a.start_date):''}</span></div>
    </div>`;
  }).join('');

  if(_photoObserver) _photoObserver.disconnect();
  _photoObserver=new IntersectionObserver(ents=>{
    ents.forEach(en=>{ if(en.isIntersecting){ _photoObserver.unobserve(en.target); _loadTilePhotos(en.target); } });
  },{rootMargin:'300px'});
  el.querySelectorAll('.photo-tile.photo-pending').forEach(t=>_photoObserver.observe(t));
}

async function _loadTilePhotos(tile){
  const id=tile.dataset.actid;
  if(_actPhotoCache[id]){ _renderTileCover(tile,_actPhotoCache[id]); return; }
  if(_photoRateLimited) return;
  try{
    const photos=await api(`/activities/${id}/photos?size=1024&photo_sources=true`);
    const items=(photos||[]).map(p=>{
      const u=p.urls||{};
      const full=u['1024']||u['600']||u['2048']||Object.values(u)[0];
      const thumb=u['600']||u['256']||full;
      return {url:full||thumb,thumb:thumb||full,video:p.video_url||null};
    }).filter(x=>x.url||x.video);
    _actPhotoCache[id]=items;
    _photoCacheSave();
    _renderTileCover(tile,items);
  }catch(err){
    if(/ 429 /.test(' '+(err&&err.message||'')+' ')) _photoRateLimited=true;
    tile.classList.add('photo-failed');
  }
}

function _renderTileCover(tile,items){
  tile.classList.remove('photo-pending');
  if(!items||!items.length){ tile.style.display='none'; return; }
  const cover=items.find(x=>x.thumb)||items[0];
  const skel=tile.querySelector('.photo-skel'); if(skel) skel.remove();
  if(!tile.querySelector('img')){
    tile.insertAdjacentHTML('afterbegin',`<img src="${cover.thumb||cover.url}" alt="" loading="lazy" decoding="async">`);
    if(items.length===1 && cover.video && !tile.querySelector('.photo-count') && !tile.querySelector('.photo-play'))
      tile.insertAdjacentHTML('beforeend','<span class="photo-play">▶</span>');
  }
}

// open the lightbox with one activity's photos (loads them first if needed)
function openActPhotos(id){
  const a=acts.find(x=>String(x.id)===String(id));
  const show=items=>{ if(items&&items.length){ photoItems=items.map(x=>({...x,name:a?a.name:'',date:a?a.start_date:null})); openPhoto(0); } };
  if(_actPhotoCache[id]){ show(_actPhotoCache[id]); return; }
  const tile=document.querySelector(`.photo-tile[data-actid="${id}"]`);
  if(tile) _loadTilePhotos(tile).then(()=>show(_actPhotoCache[id]));
}

/* ── PHOTO LIGHTBOX ── */
function openPhoto(i){
  if(!photoItems.length) return;
  photoIdx=(i+photoItems.length)%photoItems.length;
  const it=photoItems[photoIdx];
  const lb=document.getElementById('photoLightbox');
  const img=document.getElementById('lbImg');
  const vid=document.getElementById('lbVideo');
  if(it.video){
    img.style.display='none';
    vid.src=it.video;
    if(it.thumb) vid.poster=it.thumb;
    vid.style.display='';
    vid.currentTime=0;
    vid.play().catch(()=>{});
  }else{
    if(vid){ vid.pause(); vid.removeAttribute('src'); vid.load(); vid.style.display='none'; }
    img.src=it.url;
    img.style.display='';
  }
  document.getElementById('lbName').textContent=it.name||'';
  document.getElementById('lbDate').textContent=it.date?fmtDt(it.date):'';
  lb.classList.add('open');
}
function movePhoto(d){ openPhoto(photoIdx+d); }
function closePhoto(){
  document.getElementById('photoLightbox').classList.remove('open');
  const vid=document.getElementById('lbVideo'); if(vid) vid.pause();
}
async function downloadPhoto(){
  const it=photoItems[photoIdx]; if(!it) return;
  const fname=((it.name||'photo').replace(/[^\w\-]+/g,'_').slice(0,60)||'photo')+'.jpg';
  const save=(href,revoke)=>{const a=document.createElement('a');a.href=href;a.download=fname;document.body.appendChild(a);a.click();a.remove();if(revoke)setTimeout(()=>URL.revokeObjectURL(href),1500);};
  // 1) direct blob (works if the CDN allows CORS)
  try{
    const r=await fetch(it.url,{mode:'cors'});
    if(r.ok){ save(URL.createObjectURL(await r.blob()),true); return; }
  }catch{}
  // 2) CORS-blocked → image proxy returns Content-Disposition: attachment so it
  //    downloads in-page instead of opening a new tab
  if(_fnImg){ save(_fnImg+'?url='+encodeURIComponent(it.url)+'&name='+encodeURIComponent(fname)); return; }
  window.open(it.url,'_blank'); // last resort
}
document.addEventListener('keydown',e=>{
  const lb=document.getElementById('photoLightbox');
  if(!lb||!lb.classList.contains('open')) return;
  if(e.key==='Escape') closePhoto();
  else if(e.key==='ArrowLeft') movePhoto(-1);
  else if(e.key==='ArrowRight') movePhoto(1);
});

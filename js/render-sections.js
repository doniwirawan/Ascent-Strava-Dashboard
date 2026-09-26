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
    gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/>',
    kudos:'<path d="M7 11v9H4v-9h3z"/><path d="M7 11l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.4l-1.2 5A2 2 0 0 1 16.8 20H7"/>',
    medal:'<path d="M9 3l3 5 3-5"/><circle cx="12" cy="14" r="5"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>'
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
    sun:'<circle cx="12" cy="12" r="4.6" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" fill="currentColor"/>',
    clock:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  return `<svg viewBox="0 0 24 24" width="34" height="34">${I[n]||I.trophy}</svg>`;
}

/* ── small inline icons (replace decorative emoji in text) — sized to 1em ── */
function ic(n){
  const p={
    bolt:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    mountain:'<path d="m3 20 6-12 4 7 3-5 5 10z"/>',
    repeat:'<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    ruler:'<line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/>',
    crown:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.7 11H4.7z"/>',
    expand:'<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
    search:'<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    star:'<polygon points="12 2 15 9 22 9.3 17 14 18.5 21.2 12 17.4 5.5 21.2 7 14 2 9.3 9 9 12 2"/>',
    play:'<polygon points="7 4 20 12 7 20 7 4"/>',
    stack:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    pin:'<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flag:'<path d="M4 21V4a6 6 0 0 1 8 0 6 6 0 0 0 8 0v9a6 6 0 0 1-8 0 6 6 0 0 0-8 0"/>',
  };
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p[n]||''}</svg>`;
}

/* ── MONTHLY STATS ── */
function renderMonthly(filterYear) {
  const years = [...new Set(acts.map(a=>actLocalDate(a).getUTCFullYear()))].sort((a,b)=>b-a);
  const yr = filterYear || years[0];

  // year buttons
  const yb = document.getElementById('yearBtns');
  yb.innerHTML = years.map(y=>`<button class="year-btn${y===yr?' active':''}" onclick="renderMonthly(${y})">${y}</button>`).join('');

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cntLbl = sportMode()==='all' ? 'Activities' : sportDef().title;
  const rows = {};
  modeActs().filter(a=>actLocalDate(a).getUTCFullYear()===yr).forEach(a=>{
    const m = actLocalDate(a).getUTCMonth();
    if(!rows[m]) rows[m]={rides:0,dist:0,elev:0,time:0,cal:0,speed:[],hr:[]};
    rows[m].rides++;
    rows[m].dist += a.distance||0;
    rows[m].elev += a.total_elevation_gain||0;
    rows[m].time += a.moving_time||0;
    rows[m].cal  += a.kilojoules||a.calories||0;
    if(a.average_speed) rows[m].speed.push(a.average_speed);
    if(a.average_heartrate) rows[m].hr.push(a.average_heartrate);
  });

  // month-over-month % change vs the previous month that had activity
  const mom=(cur,prev)=>{
    if(prev==null||prev===0) return '';
    const pct=(cur-prev)/prev*100, up=pct>=0;
    if(Math.abs(pct)<0.5) return `<span class="mom flat">±0%</span>`;
    return `<span class="mom ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
  };

  let html = `<table class="month-table">
    <thead><tr>
      <th>Month</th><th>${cntLbl}</th><th>Distance</th><th>Elevation</th><th>Moving Time</th><th>Avg Speed</th><th>Avg HR</th><th>Calories</th>
    </tr></thead><tbody>`;

  let totR=0,totD=0,totE=0,totT=0,totC=0,allSpd=[],allHr=[];
  let prev=null; // previous month with data (for MoM %)
  for(let m=0;m<12;m++){
    const r=rows[m];
    if(!r){html+=`<tr><td class="dim">${MONTHS[m]}</td><td colspan="7" class="dim">—</td></tr>`;continue;}
    totR+=r.rides;totD+=r.dist;totE+=r.elev;totT+=r.time;totC+=r.cal;
    allSpd=[...allSpd,...r.speed];allHr=[...allHr,...r.hr];
    const avgSpd=r.speed.length?r.speed.reduce((a,b)=>a+b,0)/r.speed.length:0;
    const avgHr=r.hr.length?Math.round(r.hr.reduce((a,b)=>a+b,0)/r.hr.length):null;
    html+=`<tr>
      <td style="font-weight:700">${MONTHS[m]}</td>
      <td class="num">${r.rides}${mom(r.rides,prev&&prev.rides)}</td>
      <td class="num">${fmtKm(r.dist)} <span class="dim">${distUnit()}</span>${mom(r.dist,prev&&prev.dist)}</td>
      <td class="num">${Math.round(elevVal(r.elev)).toLocaleString()} <span class="dim">${elevUnit()}</span>${mom(r.elev,prev&&prev.elev)}</td>
      <td class="num">${fmtT(r.time)}${mom(r.time,prev&&prev.time)}</td>
      <td class="num">${avgSpd?kmh(avgSpd).toFixed(1)+' <span class="dim">'+speedUnit()+'</span>':'—'}</td>
      <td class="num">${avgHr?avgHr+' <span class="dim">bpm</span>':'—'}</td>
      <td class="num">${r.cal?Math.round(r.cal).toLocaleString()+' <span class="dim">kcal</span>':'—'}${mom(r.cal,prev&&prev.cal)}</td>
    </tr>`;
    prev=r;
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
    <td class="num">${totC?Math.round(totC).toLocaleString()+' <span class="dim">kcal</span>':'—'}</td>
  </tr>`;
  html+=`</tbody></table>`;
  document.getElementById('monthlyTable').innerHTML=html;
  if (window.applyI18n) window.applyI18n();
}

/* ── BEST EFFORTS ── */
const BEST_TOP_N=10;      // maximum rows kept per ranking
const BEST_SHOWN=5;       // rows visible before "Show more"
// Toggle a card between showing the first BEST_SHOWN rows and all rows.
function _bestToggle(btn){
  const open=btn.closest('.best-card').classList.toggle('show-all');
  const id=(()=>{ try{ return localStorage.getItem('lang')==='id'; }catch{ return false; } })();
  btn.textContent = open ? (id?'Tampilkan lebih sedikit':'Show less') : (id?'Tampilkan selengkapnya':'Show more');
}
// Render one ranking card. `list` is already sorted+sliced; `fmtRow(a)` → value string.
// `spot` ('speed' | 'hr') adds a pin per row that opens where that peak happened.
// Clicking a row opens that activity's detail modal.
function _bestCard(title, sub, list, fmtRow, spot){
  const rows=list.map((a,i)=>`
      <div class="best-row${i>=BEST_SHOWN?' best-extra':''}"${a.id?` role="button" tabindex="0" onclick="openActivityModal('${a.id}')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openActivityModal('${a.id}');}"`:''}>
        <div class="best-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
        <div class="best-name">${a.name||'Activity'} <span style="color:var(--muted);font-size:10px;">${fmtDt(a.start_date)}</span>${placeTag(a)?`<span class="best-place">${placeTag(a)}</span>`:''}</div>
        <div class="best-val">${fmtRow(a)}</div>
        ${spot&&a.id?`<button class="best-where" onclick="event.stopPropagation();showSpeedSpot('${a.id}',this,'${spot}','bspot-${spot}-${a.id}')" title="${tr('Where did this happen?')}" aria-label="${tr('Where did this happen?')}">${ic('pin')}</button>`:''}
      </div>${spot&&a.id?`<div class="spot-panel" id="bspot-${spot}-${a.id}"></div>`:''}`).join('');
  const more=list.length>BEST_SHOWN?`<button class="best-more" onclick="_bestToggle(this)">Show more</button>`:'';
  const subHtml=sub?` <span style="color:var(--muted);font-weight:400;letter-spacing:0;text-transform:none;">· ${sub}</span>`:'';
  return `<div class="best-card"><div class="best-card-title">${title}${subHtml}</div>${rows}${more}</div>`;
}
function renderBestEfforts(){
  const CATS=[
    {title:'Longest Rides',key:'distance',fmt:a=>fmtKm(a)+' '+distUnit(),sort:(a,b)=>(b.distance||0)-(a.distance||0)},
    {title:'Most Elevation',key:'total_elevation_gain',fmt:a=>fmtElev(a),sort:(a,b)=>(b.total_elevation_gain||0)-(a.total_elevation_gain||0)},
    {title:'Fastest Avg Speed',key:'average_speed',fmt:a=>kmh(a).toFixed(1)+' '+speedUnit(),sort:(a,b)=>(b.average_speed||0)-(a.average_speed||0)},
    {title:'Highest Max Speed',key:'max_speed',spot:'speed',fmt:a=>kmh(a).toFixed(1)+' '+speedUnit(),sort:(a,b)=>(b.max_speed||0)-(a.max_speed||0),valid:a=>cleanMax(a)>0},
    {title:'Highest Heart Rate',key:'max_heartrate',spot:'hr',fmt:a=>Math.round(a)+' bpm',sort:(a,b)=>(b.max_heartrate||0)-(a.max_heartrate||0)},
    {title:'Highest Avg Heart Rate',key:'average_heartrate',fmt:a=>Math.round(a)+' bpm',sort:(a,b)=>(b.average_heartrate||0)-(a.average_heartrate||0)},
    {title:'Highest Suffer Score',key:'suffer_score',fmt:a=>Math.round(a),sort:(a,b)=>(b.suffer_score||0)-(a.suffer_score||0)},
  ];
  const el=document.getElementById('bestGrid');
  const src=modeActs();

  const simple=CATS.map(cat=>{
    const sorted=src.filter(a=>a[cat.key]>0&&(!cat.valid||cat.valid(a))).sort(cat.sort).slice(0,BEST_TOP_N);
    if(!sorted.length) return '';
    return _bestCard(cat.title,'',sorted,a=>cat.fmt(a[cat.key]),cat.spot);
  }).join('');

  // Composite rankings — combine two metrics via min-max normalisation across the
  // loaded rides, then sort by the summed 0–1 score. Each combo yields a "best" card
  // (top score) and its opposite (lowest score).
  const COMBOS=[
    {
      hi:'Fastest All-Round', lo:'Slowest All-Round', sub:'avg + top speed',
      valid:a=>a.average_speed>0 && cleanMax(a)>0,
      parts:[{get:a=>a.average_speed,dir:1},{get:a=>cleanMax(a),dir:1}],
      fmt:a=>`${kmh(a.average_speed).toFixed(1)} / ${kmh(cleanMax(a)).toFixed(1)} ${speedUnit()}`,
    },
    {
      // Efficiency = distance covered per heartbeat (avg m/s × 60 ÷ avg HR).
      // High speed at low HR → high value; slow-but-hard rides → low value.
      hi:'Most Efficient', lo:'Least Efficient', sub:'distance per heartbeat',
      valid:a=>a.average_speed>0 && a.average_heartrate>0,
      score:a=>a.average_speed*60/a.average_heartrate,
      fmt:a=>`${(a.average_speed*60/a.average_heartrate).toFixed(2)} m/beat`,
    },
  ];
  const composite=COMBOS.flatMap(c=>{
    const valid=src.filter(c.valid);
    if(valid.length<3) return [];
    let score=c.score;
    if(!score){
      const norms=c.parts.map(p=>{
        const vals=valid.map(p.get);
        const mn=Math.min(...vals), mx=Math.max(...vals), d=mx-mn;
        return a=>{ const n=d>0?(p.get(a)-mn)/d:0.5; return p.dir===-1?1-n:n; };
      });
      score=a=>norms.reduce((s,fn)=>s+fn(a),0);
    }
    const ranked=[...valid].sort((a,b)=>score(b)-score(a));
    const top=ranked.slice(0,BEST_TOP_N);
    const bottom=ranked.slice().reverse().slice(0,BEST_TOP_N);
    return [_bestCard(c.hi,c.sub,top,c.fmt), _bestCard(c.lo,c.sub,bottom,c.fmt)];
  }).join('');

  el.innerHTML=simple+composite;
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
      <div class="gear-name">${b.nickname||b.name||'Bike'}${typeof bikeTypeBadge==='function'?bikeTypeBadge(b):''}${b.primary?'<span class="gear-primary">Primary</span>':''}</div>
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
  if(_gearCache){ _renderBikeList(el,_gearCache); renderGearTool(_gearCache); renderGearMaint(_gearCache); return; }
  let bikes=(currentAthlete&&currentAthlete.bikes)||[];
  if(bikes.length){ _gearCache=bikes; _renderBikeList(el,bikes); renderGearTool(bikes); renderGearMaint(bikes); return; }

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
    _gearCache=bikes;
    _renderBikeList(el,bikes);
    renderGearTool(bikes);
    renderGearMaint(bikes);
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

/* ── HEATMAP ──
   Roads get hotter the more often they've been ridden. Counting works on a
   ~25 m grid: each activity is walked at grid resolution and the cells it
   touches are collected in a Set, so one slow ride can't inflate a cell —
   a cell's count is "how many separate activities passed through here".
   Points are then bucketed by that count and drawn as four multi-polylines
   (one per heat band) instead of thousands of tiny layers. */
const HEAT_CELL = 0.00025;             // ~28 m of latitude
const HEAT_BANDS = [                   // ascending; `min` = rides through the cell
  { min: 1, color: '#9c4116', weight: 1.3, opacity: 0.58 },
  { min: 2, color: '#FC4C02', weight: 1.8, opacity: 0.70 },
  { min: 4, color: '#FF9436', weight: 2.6, opacity: 0.85 },
  { min: 8, color: '#FFD98A', weight: 3.6, opacity: 0.95 },
];

// Two ways to read the map. 'freq' = the colour ramp above (hot roads = ridden
// more often). 'uniform' = one flat orange for every road, so the map reads
// purely as "everywhere I've been" — easier to take in at a glance. The choice
// is remembered across visits.
const HEAT_UNIFORM = { color: '#FC4C02', weight: 2.2, opacity: 0.8 };
// 'regency' = Bali's regencies shaded by how many rides end in each (the
// Activities page's regency map), with the routes drawn faintly on top.
let heatMode = 'freq';
try { const m = localStorage.getItem('heat_mode'); if (m === 'freq' || m === 'uniform' || m === 'regency') heatMode = m; } catch {}

// A dark casing drawn under every line lifts the routes off busy basemaps
// (satellite especially) without changing their colour. Round joins/caps keep
// the traces smooth where segments meet.
const HEAT_CASING = { color: '#0a0a0a', opacity: 0.35, lineJoin: 'round', lineCap: 'round', interactive: false };

// Cells are keyed by a packed integer rather than a "lat:lng" string — with
// ~300k samples across a full history, numeric Map keys avoid a lot of
// string allocation. Offsets keep both indices positive; the product stays
// well inside Number.MAX_SAFE_INTEGER.
const heatCell = (lat, lng) =>
  (Math.round(lat / HEAT_CELL) + 400000) * 1600001 + (Math.round(lng / HEAT_CELL) + 800000);

// How many activities pass through each grid cell.
function heatCounts(tracks) {
  const counts = new Map();
  tracks.forEach(pts => {
    const seen = new Set();
    for (let i = 0; i < pts.length; i++) {
      seen.add(heatCell(pts[i][0], pts[i][1]));
      if (i + 1 >= pts.length) break;
      // Walk the gap so two rides on the same road land in the same cells
      // even when Strava simplified their points to different positions.
      const [aLat, aLng] = pts[i], [bLat, bLng] = pts[i + 1];
      const steps = Math.min(400, Math.ceil(
        Math.max(Math.abs(bLat - aLat), Math.abs(bLng - aLng)) / HEAT_CELL));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        seen.add(heatCell(aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t));
      }
    }
    seen.forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
  });
  return counts;
}

const heatBand = n => {
  let b = 0;
  for (let i = 0; i < HEAT_BANDS.length; i++) if (n >= HEAT_BANDS[i].min) b = i;
  return b;
};

// Split every track into runs of same-band points, grouped per band, so each
// band renders as a single Leaflet layer holding many line segments.
function heatBandLines(tracks, counts) {
  const out = HEAT_BANDS.map(() => []);
  tracks.forEach(pts => {
    if (pts.length < 2) return;
    const bands = pts.map(p => heatBand(counts.get(heatCell(p[0], p[1])) || 1));
    let run = [pts[0]], cur = bands[0];
    for (let i = 1; i < pts.length; i++) {
      run.push(pts[i]);
      if (bands[i] !== cur) {                 // close this run, overlap one point
        out[cur].push(run);                   // so bands join without a gap
        run = [pts[i]]; cur = bands[i];
      }
    }
    if (run.length > 1) out[cur].push(run);
  });
  return out;
}

// Small key so the colour ramp reads as "how often", not "which activity".
// In uniform mode the ramp collapses to a single swatch.
function heatLegend(map){
  const T=(typeof tr==='function')?tr:(x=>x);
  const c=L.control({position:'bottomleft'});
  c.onAdd=()=>{
    const d=L.DomUtil.create('div','heat-legend');
    if(heatMode==='regency'){
      d.innerHTML='<span class="hl-i"><i style="background:#fc4c02;height:10px;width:14px;opacity:.6"></i>'+T('Rides ending in each regency')+'</span>';
    }else if(heatMode==='uniform'){
      d.innerHTML='<span class="hl-i"><i style="background:'+HEAT_UNIFORM.color+
        ';height:'+HEAT_UNIFORM.weight+'px;opacity:'+HEAT_UNIFORM.opacity+'"></i>'+T('Where you ride')+'</span>';
    }else{
      d.innerHTML='<span class="hl-t">'+T('Rides here')+'</span>'+
        HEAT_BANDS.map((b,i)=>{
          const next=HEAT_BANDS[i+1];
          const label=next ? (next.min-b.min===1 ? b.min : b.min+'–'+(next.min-1)) : b.min+'+';
          return '<span class="hl-i"><i style="background:'+b.color+
                 ';height:'+b.weight+'px;opacity:'+b.opacity+'"></i>'+label+'</span>';
        }).join('');
    }
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  c.addTo(map);
  return c;
}

// Segmented Frequency / Uniform switch, styled to match the basemap control.
function heatModeControl(map){
  const T=(typeof tr==='function')?tr:(x=>x);
  const c=L.control({position:'topleft'});
  c.onAdd=()=>{
    const d=L.DomUtil.create('div','heat-mode leaflet-bar');
    const mk=(id,label)=>'<button type="button" data-hm="'+id+'"'+
      (heatMode===id?' class="on"':'')+'>'+T(label)+'</button>';
    d.innerHTML=mk('freq','Frequency')+mk('uniform','Uniform')+(typeof regencyLayers==='function'?mk('regency','Regency'):'');
    L.DomEvent.disableClickPropagation(d);
    d.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      const m=b.getAttribute('data-hm');
      if(m===heatMode) return;
      heatMode=m;
      try{ localStorage.setItem('heat_mode',m); }catch{}
      renderHeatmap(true);                 // keep the current pan/zoom
    }));
    return d;
  };
  c.addTo(map);
  return c;
}

function renderHeatmap(preserveView){
  if(!window.L){setTimeout(renderHeatmap,300);return;}
  const el=document.getElementById('leafletMap');
  // Remember where the user was looking so a mode toggle doesn't reset the view.
  let keep=null;
  if(leafletMapInst){
    if(preserveView){ try{ keep={center:leafletMapInst.getCenter(),zoom:leafletMapInst.getZoom()}; }catch{} }
    leafletMapInst.remove();leafletMapInst=null;
  }

  leafletMapInst=L.map(el,{zoomControl:true,scrollWheelZoom:true,center:[-8.34,115.09],zoom:12});
  addBasemap(leafletMapInst,{switcher:true});

  const bounds=[];
  const tracks=[], withAct=[];
  modeActs().forEach(a=>{
    if(!a.map||!a.map.summary_polyline) return;
    try{
      const pts=decodePolyline(a.map.summary_polyline);
      if(pts.length<2) return;
      const latlngs=pts.map(p=>[p[0],p[1]]);
      tracks.push(latlngs); withAct.push({a,latlngs});
      latlngs.forEach(ll=>bounds.push(ll));
    }catch{}
  });

  // Dark casing under everything so the routes read clearly on any basemap.
  if(tracks.length){
    const cw=(heatMode==='freq'?HEAT_BANDS[HEAT_BANDS.length-1].weight:HEAT_UNIFORM.weight)+1.6;
    if(heatMode!=='regency') L.polyline(tracks,Object.assign({weight:cw},HEAT_CASING)).addTo(leafletMapInst);
  }

  if(heatMode==='regency'){
    // Regencies shaded by rides ending there; routes stay faintly on top.
    L.polyline(tracks,{color:'#ffffff',weight:1.2,opacity:0.35,lineJoin:'round',lineCap:'round',interactive:false}).addTo(leafletMapInst);
    const map=leafletMapInst, list=modeActs().filter(a=>a.map&&a.map.summary_polyline);
    regencyGeo().then(g=>{
      if(!g || leafletMapInst!==map) return;             // re-rendered while loading
      const {by}=_regStats(list);
      regencyLayers(map,by);
    });
  }else if(heatMode==='uniform'){
    // One flat colour: the map reads as "everywhere I've been", not "how often".
    L.polyline(tracks,{color:HEAT_UNIFORM.color,weight:HEAT_UNIFORM.weight,opacity:HEAT_UNIFORM.opacity,
      lineJoin:'round',lineCap:'round',interactive:false}).addTo(leafletMapInst);
  }else{
    // Heat bands (cold underneath, hot on top) — display only.
    const counts=heatCounts(tracks);
    heatBandLines(tracks,counts).forEach((segs,i)=>{
      if(!segs.length) return;
      const b=HEAT_BANDS[i];
      L.polyline(segs,{color:b.color,weight:b.weight,opacity:b.opacity,
        lineJoin:'round',lineCap:'round',interactive:false}).addTo(leafletMapInst);
    });
  }

  if(tracks.length){ heatLegend(leafletMapInst); heatModeControl(leafletMapInst); }

  // Invisible per-activity lines on top keep the tooltip / hover / click that
  // the merged bands can't carry.
  withAct.forEach(({a,latlngs})=>{
    const hit=L.polyline(latlngs,{color:'#FC4C02',weight:8,opacity:0,interactive:true})
      .addTo(leafletMapInst);
    hit.bindTooltip(a.name||'Activity',{sticky:true});
    hit.on('mouseover',()=>hit.setStyle({weight:4,opacity:1}));
    hit.on('mouseout',()=>hit.setStyle({weight:8,opacity:0}));
    hit.on('click',()=>{ try{ openActivityModal(String(a.id)); }catch{} });
  });

  if(keep){ leafletMapInst.setView(keep.center,keep.zoom); }
  else if(bounds.length){
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

/* ── SPORT MODE ──
   The navbar toggle: All · Ride · Run · Walk · Swim. Only sports the athlete
   actually has are shown. Ride/run behaviour is preserved exactly —
   sportUsesPace() returns the same as the old `mode==='run'` for ride/run, so
   every pace-vs-speed branch keeps working, and walk/swim read in pace, 'all'
   in speed. */
let milestoneMode=null; // 'all' | 'ride' | 'run' | 'walk' | 'swim'
function isRun(a){ return a.type==='Run'||a.type==='VirtualRun'||a.type==='TrailRun'; }
function isWalk(a){ return a.type==='Walk'||a.type==='Hike'; }
function isSwim(a){ return a.type==='Swim'||a.type==='OpenWaterSwim'; }
const SPORTS = {
  all:  { pred:()=>true, word:'activity', words:'activities', title:'All',   pace:false },
  ride: { pred:isRide,   word:'ride',     words:'rides',      title:'Rides', pace:false },
  run:  { pred:isRun,    word:'run',      words:'runs',       title:'Runs',  pace:true  },
  walk: { pred:isWalk,   word:'walk',     words:'walks',      title:'Walks', pace:true  },
  swim: { pred:isSwim,   word:'swim',     words:'swims',      title:'Swims', pace:true  },
};
const SPORT_ORDER=['all','ride','run','walk','swim'];
function sportDef(m){ return SPORTS[m||sportMode()] || SPORTS.ride; }
function sportHas(m){ return m==='all' ? !!(acts&&acts.length) : (acts||[]).some(SPORTS[m].pred); }
function sportMode(){
  if(milestoneMode===null){
    // default to whichever of ride/run the athlete does most (unchanged)
    const r=(acts||[]).filter(isRide).length, ru=(acts||[]).filter(isRun).length;
    milestoneMode = ru>r ? 'run' : 'ride';
  }
  return milestoneMode;
}
function sportWord(pl){ const d=sportDef(); return pl ? d.words : d.word; }
function sportUsesPace(){ return sportMode()==='all' ? false : sportDef().pace; }
// activities for the current sport mode — used by the mode-aware pages
function modeActs(){ return (acts||[]).filter(sportDef().pred); }

const SPORT_ICONS = {
  all:  '<svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  ride: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>',
  run:  '<svg viewBox="0 0 24 24"><circle cx="17" cy="5" r="1"/><path d="M7 21l3-4"/><path d="M16 21l-2-4-3-3 1-6"/><path d="M6 12l2-3 4-1 3 3 3 1"/></svg>',
  walk: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4" r="1.2"/><path d="M11 21l1-7"/><path d="M15 21l-2-5-1.5-2 .5-4.5"/><path d="M9 9l3.5-1 2 2.5 2.5 1"/></svg>',
  swim: '<svg viewBox="0 0 24 24"><circle cx="16" cy="7" r="1.3"/><path d="M4 16c1.3 1.2 2.7 1.2 4 0s2.7-1.2 4 0 2.7 1.2 4 0 2.7-1.2 4 0"/><path d="M6 13l4.5-2.5 3 1.5"/><path d="M10.5 10.5l2.5-3 2.5 1"/></svg>',
};
// Build the top-bar toggle from the sports the athlete actually has.
function renderSportToggle(){
  const mt=document.getElementById('modeToggle'); if(!mt) return;
  const avail=SPORT_ORDER.filter(sportHas);
  if(!avail.length) return;
  if(!avail.includes(sportMode())) milestoneMode = avail.find(m=>m!=='all') || avail[0];
  mt.innerHTML = avail.map(m=>
    `<button data-mode="${m}" title="${SPORTS[m].title}" onclick="setSportMode('${m}')"${m===sportMode()?' class="active"':''}>${SPORT_ICONS[m]}</button>`
  ).join('');
}
function setMilestoneMode(m){ setSportMode(m); }
function setSportMode(m){
  milestoneMode=m;
  document.querySelectorAll('#modeToggle [data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  // re-render every mode-aware page
  ['renderStats','renderOverviewInsights','renderEddington','renderActivities','renderTrends','renderCalendar','renderMonthly','renderBestEfforts','renderRewind']
    .forEach(fn=>{ try{ if(typeof window[fn]==='function') window[fn](); }catch{} });
  try{ if(typeof leafletMapInst!=='undefined' && leafletMapInst) renderHeatmap(); }catch{}
  renderMilestones();
  if (window.applyI18n) window.applyI18n();
}
function _pace(speed){ if(!speed) return '—'; const sec=Math.round((useImperial?1609.34:1000)/speed); return `${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`; }
// Swimming reads in time per 100 m, not km/h or min/km.
function _swimPace(speed){ if(!speed) return '—'; const sec=Math.round(100/speed); return `${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`; }
function renderMilestones(){
  const el=document.getElementById('milestonesGrid');
  if(!acts.length){el.innerHTML='<p style="color:var(--muted);padding:8px">No data.</p>';return;}
  let mode=sportMode();
  let set = modeActs();
  if(!set.length){ mode='all'; milestoneMode='all'; set=acts.slice(); }   // never show an empty page
  const pace = sportUsesPace();
  const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
  const W = cap(sportWord()), Wp = cap(sportWord(true));   // "Ride"/"Rides", "Run"/"Runs", …

  // longest activity streak (all activities)
  const days=new Set(acts.map(a=>a.start_date?(a.start_date_local||a.start_date).slice(0,10):null).filter(Boolean));
  let best=0,cur=0,d=new Date();
  for(let i=0;i<730;i++){ const k=localDayStr(d); if(days.has(k)){cur++;best=Math.max(best,cur);}else cur=0; d.setDate(d.getDate()-1); }
  const streak=best;

  // totals for the selected mode
  const tDist=kmVal(set.reduce((s,a)=>s+(a.distance||0),0)).toFixed(0);
  const tElev=Math.round(elevVal(set.reduce((s,a)=>s+(a.total_elevation_gain||0),0)));
  const tTime=set.reduce((s,a)=>s+(a.moving_time||0),0);
  const totals=[
    {v:set.length.toLocaleString(), l:mode==='all'?'Activities':Wp},
    {v:Number(tDist).toLocaleString(), l:'Distance ('+distUnit()+')'},
    {v:tElev.toLocaleString(), l:'Elevation ('+elevUnit()+')'},
    {v:fmtT(tTime), l:'Moving Time', sub:'≈ '+fmtDays(tTime)},
  ];

  // records within the mode
  const longest=set.reduce((m,a)=>(a.distance||0)>(m.distance||0)?a:m,set[0]||{});
  const mostElev=set.reduce((m,a)=>(a.total_elevation_gain||0)>(m.total_elevation_gain||0)?a:m,set[0]||{});
  const fastest=set.filter(a=>a.average_speed>0).reduce((m,a)=>a.average_speed>(m.average_speed||0)?a:m,{});
  const topSpd=set.filter(a=>cleanMax(a)>0).reduce((m,a)=>cleanMax(a)>cleanMax(m)?a:m,{});
  const longDur=set.reduce((m,a)=>(a.moving_time||0)>(m.moving_time||0)?a:m,set[0]||{});
  const bestHR=set.filter(a=>a.average_heartrate>0).reduce((m,a)=>a.average_heartrate>(m.average_heartrate||0)?a:m,{});
  const mostKudos=set.filter(a=>a.kudos_count>0).reduce((m,a)=>a.kudos_count>(m.kudos_count||0)?a:m,{});
  const mostPRs=set.filter(a=>a.pr_count>0).reduce((m,a)=>a.pr_count>(m.pr_count||0)?a:m,{});
  const first=set.reduce((m,a)=>(a.start_date&&(!m.start_date||a.start_date<m.start_date))?a:m,set[0]||{});
  // start_date_local is wall-clock with a fake 'Z' — take the date part as-is and
  // parse it at local noon so the day can't shift with the browser's timezone.
  const firstDay=(first.start_date_local||first.start_date||'').slice(0,10);
  const firstLbl=firstDay?new Date(firstDay+'T12:00:00').toLocaleDateString(window.LANG==='id'?'id-ID':'en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):null;
  // biggest calendar month by distance
  const byMonth={};
  set.forEach(a=>{const k=(a.start_date||'').slice(0,7); if(k)byMonth[k]=(byMonth[k]||0)+(a.distance||0);});
  const bestMonth=Object.entries(byMonth).sort((a,b)=>b[1]-a[1])[0];
  const bestMonthLbl=bestMonth?new Date(bestMonth[0]+'-01T00:00:00').toLocaleDateString('en-GB',{month:'short',year:'numeric'}):null;
  // signature long distances per sport: centuries (ride/all), half-mara (run),
  // 10 km walks, 3 km swims.
  const centuryM=distUnit()==='mi'?160934:100000;
  const sigThresh = mode==='run'?21097 : mode==='walk'?10000 : mode==='swim'?3000 : centuryM;
  const sigCount = set.filter(a=>(a.distance||0)>=sigThresh).length;
  const sigLabel = mode==='run'?'Half Mara or More'
    : mode==='walk'?(distUnit()==='mi'?'6 mi+ Walks':'10 km+ Walks')
    : mode==='swim'?(distUnit()==='mi'?'2 mi+ Swims':'3 km+ Swims')
    : 'Centuries';
  const sigDesc = mode==='run'?(distUnit()==='mi'?'Runs of 13.1+ mi':'Runs of 21.1+ km')
    : mode==='walk'?(distUnit()==='mi'?'Walks of 6+ mi':'Walks of 10+ km')
    : mode==='swim'?(distUnit()==='mi'?'Swims of 2+ mi':'Swims of 3+ km')
    : (distUnit()==='mi'?'Rides of 100+ mi':'Rides of 100+ km');
  const prsLabel = mode==='all' ? 'Most PRs' : 'Most PRs in a '+W;

  const records = pace ? [
    {icon:'run',c:'#fc4c02',label:'Longest '+W,val:longest.distance?fmtKm(longest.distance):'—',unit:distUnit(),desc:longest.name},
    {icon:'bolt',c:'#4da8ff',label:'Best Pace',val:fastest.average_speed?(mode==='swim'?_swimPace(fastest.average_speed):_pace(fastest.average_speed)):'—',unit:mode==='swim'?'/100m':'/'+distUnit(),desc:fastest.name},
    {icon:'mountain',c:'#a78bfa',label:'Most Elevation',val:mostElev.total_elevation_gain?Math.round(elevVal(mostElev.total_elevation_gain)).toLocaleString():'—',unit:elevUnit(),desc:mostElev.name},
    {icon:'clock',c:'#00cc88',label:'Longest Duration',val:longDur.moving_time?fmtT(longDur.moving_time):'—',unit:'',desc:longDur.name},
    {icon:'heart',c:'#f87171',label:'Peak Heart Rate',val:bestHR.average_heartrate?Math.round(bestHR.average_heartrate):'—',unit:'bpm',desc:bestHR.average_heartrate?[hrZoneLabel(bestHR.average_heartrate),bestHR.name].filter(Boolean).join(' · '):bestHR.name},
    {icon:'flame',c:'#fb923c',label:'Activity Streak',val:streak||'—',unit:'days',desc:'Longest consecutive days'},
    {icon:'run',c:'#38bdf8',label:sigLabel,val:sigCount||'—',unit:sportWord(true),desc:sigDesc},
    {icon:'calendar',c:'#e879f9',label:'Biggest Month',val:bestMonth?fmtKm(bestMonth[1]):'—',unit:distUnit(),desc:bestMonthLbl},
    {icon:'kudos',c:'#4ade80',label:'Most Kudos',val:mostKudos.kudos_count||'—',unit:'kudos',desc:mostKudos.name},
    {icon:'medal',c:'#22d3ee',label:prsLabel,val:mostPRs.pr_count||'—',unit:'PRs',desc:mostPRs.name},
    {icon:'calendar',c:'#94a3b8',label:'First '+W,val:firstLbl||'—',unit:'',desc:first.name},
  ] : [
    {icon:'bike',c:'#fc4c02',label:'Longest '+W,val:longest.distance?fmtKm(longest.distance):'—',unit:distUnit(),desc:longest.name},
    {icon:'mountain',c:'#a78bfa',label:'Most Elevation',val:mostElev.total_elevation_gain?Math.round(elevVal(mostElev.total_elevation_gain)).toLocaleString():'—',unit:elevUnit(),desc:mostElev.name},
    {icon:'gauge',c:'#4da8ff',label:'Fastest Avg',val:fastest.average_speed?kmh(fastest.average_speed).toFixed(1):'—',unit:speedUnit(),desc:fastest.name},
    {icon:'bolt',c:'#facc15',label:'Top Speed',val:topSpd.max_speed?kmh(topSpd.max_speed).toFixed(1):'—',unit:speedUnit(),desc:topSpd.name},
    {icon:'heart',c:'#f87171',label:'Peak Heart Rate',val:bestHR.average_heartrate?Math.round(bestHR.average_heartrate):'—',unit:'bpm',desc:bestHR.average_heartrate?[hrZoneLabel(bestHR.average_heartrate),bestHR.name].filter(Boolean).join(' · '):bestHR.name},
    {icon:'flame',c:'#fb923c',label:'Activity Streak',val:streak||'—',unit:'days',desc:'Longest consecutive days'},
    {icon:'bike',c:'#38bdf8',label:sigLabel,val:sigCount||'—',unit:sportWord(true),desc:sigDesc},
    {icon:'calendar',c:'#e879f9',label:'Biggest Month',val:bestMonth?fmtKm(bestMonth[1]):'—',unit:distUnit(),desc:bestMonthLbl},
    {icon:'kudos',c:'#4ade80',label:'Most Kudos',val:mostKudos.kudos_count||'—',unit:'kudos',desc:mostKudos.name},
    {icon:'medal',c:'#22d3ee',label:prsLabel,val:mostPRs.pr_count||'—',unit:'PRs',desc:mostPRs.name},
    {icon:'calendar',c:'#94a3b8',label:'First '+W,val:firstLbl||'—',unit:'',desc:first.name},
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
  const years=[...new Set(acts.map(a=>actLocalDate(a).getUTCFullYear()))].sort((a,b)=>b-a);
  if(!years.length){el.innerHTML='<p style="color:var(--muted)">No data.</p>';return;}
  const yr=filterYear||years[0];
  const yb=document.getElementById('rewindYearBtns');
  yb.innerHTML=years.map(y=>`<button class="year-btn${y===yr?' active':''}" onclick="renderRewind(${y})">${y}</button>`).join('');
  const ya=modeActs().filter(a=>actLocalDate(a).getUTCFullYear()===yr);
  if(!ya.length){el.innerHTML='<p style="color:var(--muted)">No '+sportWord(true)+' in '+yr+'.</p>';return;}

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
  const totalDistM=ya.reduce((s,a)=>s+(a.distance||0),0);
  const avgSpeed=totalTime?kmh(totalDistM/totalTime):0;
  const maxSpeed=kmh(ya.reduce((m,a)=>Math.max(m,a.max_speed||0),0));
  const maxHRy=ya.reduce((m,a)=>Math.max(m,a.max_heartrate||0),0);
  const wattsA=ya.filter(a=>a.average_watts>0);
  const avgWattsy=wattsA.length?Math.round(wattsA.reduce((s,a)=>s+a.average_watts,0)/wattsA.length):0;
  const totalCal=Math.round(ya.reduce((s,a)=>s+(a.kilojoules||a.calories||0),0));
  const totalKudos=ya.reduce((s,a)=>s+(a.kudos_count||0),0);
  const totalPRs=ya.reduce((s,a)=>s+(a.pr_count||0),0);
  const totalAchv=ya.reduce((s,a)=>s+(a.achievement_count||0),0);
  const activeDays=new Set(ya.map(a=>(a.start_date_local||a.start_date||"").slice(0,10))).size;

  // monthly breakdown for chart
  const monthly=Array(12).fill(null).map(()=>({dist:0,count:0}));
  ya.forEach(a=>{const m=actLocalDate(a).getUTCMonth();monthly[m].dist+=a.distance||0;monthly[m].count++;});
  const peakMonth=monthly.reduce((mi,m,i)=>m.dist>monthly[mi].dist?i:mi,0);
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // day-of-week distribution
  const dow=Array(7).fill(0);
  ya.forEach(a=>{dow[actLocalDate(a).getUTCDay()]++;});
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const busyDay=DAYS[dow.indexOf(Math.max(...dow))];

  // ── side-by-side comparison: selected year vs the year before ──
  const prevYr=yr-1;
  const _ms=modeActs();
  const ys=y=>{const a=_ms.filter(x=>actLocalDate(x).getUTCFullYear()===y);return{n:a.length,dist:a.reduce((s,x)=>s+(x.distance||0),0),elev:a.reduce((s,x)=>s+(x.total_elevation_gain||0),0),time:a.reduce((s,x)=>s+(x.moving_time||0),0)};};
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
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Max HR</div><div style="font-size:32px;font-weight:800;color:var(--text)">${maxHRy?Math.round(maxHRy):'—'}<span style="font-size:14px;color:var(--muted)"> bpm</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Avg Speed</div><div style="font-size:32px;font-weight:800;color:var(--text)">${avgSpeed||'—'}<span style="font-size:14px;color:var(--muted)"> ${speedUnit()}</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Max Speed</div><div style="font-size:32px;font-weight:800;color:var(--text)">${maxSpeed||'—'}<span style="font-size:14px;color:var(--muted)"> ${speedUnit()}</span></div></div>
      ${avgWattsy?`<div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Avg Power</div><div style="font-size:32px;font-weight:800;color:var(--text)">${avgWattsy}<span style="font-size:14px;color:var(--muted)"> W</span></div></div>`:''}
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Calories</div><div style="font-size:32px;font-weight:800;color:var(--text)">${totalCal?totalCal.toLocaleString():'—'}<span style="font-size:14px;color:var(--muted)"> kcal</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Active Days</div><div style="font-size:32px;font-weight:800;color:var(--orange)">${activeDays}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Kudos</div><div style="font-size:32px;font-weight:800;color:var(--text)">${totalKudos.toLocaleString()}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Achievements</div><div style="font-size:32px;font-weight:800;color:var(--text)">${totalAchv.toLocaleString()}</div><div style="font-size:12px;color:var(--muted)">${totalPRs} PRs</div></div>
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
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aaa',boxWidth:12}},
        zoom:(typeof chartZoomOpts==='function')?chartZoomOpts():undefined},
        scales:{
          x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#888'}},
          y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#888'},title:{display:true,text:distUnit(),color:'#888'}},
          y2:{position:'right',grid:{display:false},ticks:{color:'#888'},title:{display:true,text:t('chActs'),color:'#888'}}
        }}
    });
  });
}

/* ── TROPHIES / KOMs ── */
let _chalCache = null; // {koms, stats} — cached so re-renders don't refetch (rate-limit friendly)
let _gearCache = null; // fetched bikes — cached likewise
let _trophyBadges = [];  // badge defs from the last renderChallenges (for sharing)
let _trophyAthlete = ''; // athlete display name for the share card
async function renderChallenges(){
  const el=document.getElementById('challengesGrid');
  el.innerHTML='<p style="color:var(--muted);padding:8px">Loading trophies…</p>';

  const athleteId=currentAthlete?.id||(acts[0]?.athlete?.id)||0;

  // parallel: KOMs + lifetime stats (cached after first fetch)
  let komList=[], st=null;
  if(_chalCache){ komList=_chalCache.koms; st=_chalCache.stats; }
  else { try{
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
    _chalCache={koms:komList,stats:st};
  }catch{} }

  // from cached activities (last 200)
  const totalAch =acts.reduce((s,a)=>s+(a.achievement_count||0),0);
  const totalPR  =acts.reduce((s,a)=>s+(a.pr_count||0),0);
  const totalKudos=acts.reduce((s,a)=>s+(a.kudos_count||0),0);
  const rides    =acts.filter(isRide);
  const runs     =acts.filter(a=>typeof isRun==='function'?isRun(a):(a.type==='Run'||a.type==='VirtualRun'||a.type==='TrailRun'));
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
    const ftpEst=estimateFtp();

    html+=`<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px;border-color:rgba(252,76,2,.25);background:linear-gradient(135deg,rgba(252,76,2,.07) 0%,transparent 55%)">
      <div style="display:flex;align-items:center;gap:20px;padding:22px 24px">
        ${img?`<img src="${img}" alt="" style="width:88px;height:88px;border-radius:50%;border:3px solid var(--orange);flex-shrink:0;object-fit:cover" onerror="this.style.display='none'">` : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:24px;font-weight:900;letter-spacing:-.6px;line-height:1.1">${name}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px;display:flex;gap:12px;flex-wrap:wrap">
            ${city?`<span>${city}</span>`:''}
            ${since?`<span>Since ${since}</span>`:''}
            ${ftpEst?`<span title="${ftpEst.estimated?'Estimated from '+(ftpEst.basis==='power'?'your best sustained power':'body weight')+' — Strava has no FTP set':'From your Strava profile'}">FTP ${ftpEst.value}w${ftpEst.estimated?' (est.)':''}</span>`:''}
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

  // start_date_local is wall-clock time with a fake 'Z' — slice the hour as-is
  const hourOf=a=>parseInt((a.start_date_local||a.start_date||'').slice(11,13),10);
  const earlyCount=acts.filter(a=>{const h=hourOf(a);return h>=3&&h<6;}).length;
  const nightCount=acts.filter(a=>{const h=hourOf(a);return h>=21||h<3;}).length;
  // longest consecutive-day streak (same walk as the Milestones section)
  const dayset=new Set(acts.map(a=>a.start_date?(a.start_date_local||a.start_date).slice(0,10):null).filter(Boolean));
  let streak=0,srun=0; const sd=new Date();
  for(let i=0;i<730;i++){const k=localDayStr(sd); if(dayset.has(k)){srun++;streak=Math.max(streak,srun);}else srun=0; sd.setDate(sd.getDate()-1);}

  const badges=[
    {icon:'crown',   name:'KOM / QOM',       val:komList.length,        unit:'segments',  color:'#ffd700', unlocked:komList.length>0},
    {icon:'trophy',  name:'Achievements',     val:totalAch.toLocaleString(), unit:'on Strava', color:'#ffd700', unlocked:totalAch>0},
    {icon:'bolt',    name:'Personal Records', val:totalPR.toLocaleString(),  unit:'PRs',       color:'#fc4c02', unlocked:totalPR>0},
    {icon:'kudos',   name:'Kudos',            val:totalKudos.toLocaleString(),unit:'received', color:'#fc4c02', unlocked:totalKudos>0},
    {icon:'globe',   name:'Century Rider',    val:biggestRide.toFixed(1),unit:'km best',   color:'#4da8ff', unlocked:biggestRide>=100},
    {icon:'mountain',name:'Everest Climber', val:Math.round(ltElev/1000)+'k',unit:'m climbed',color:'#4da8ff',unlocked:ltElev>=8848},
    {icon:'runner',  name:'Half Marathoner', val:longestRun.toFixed(1), unit:'km best',   color:'#00cc88', unlocked:longestRun>=21.1},
    {icon:'bike',    name:'1,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#00cc88',unlocked:ltDist>=1000},
    {icon:'world',   name:'Bentang Jawa',    val:biggestRide.toFixed(1),unit:'km best',color:'#f43f5e',unlocked:biggestRide>=1500}, // Java end to end in ONE activity
    {icon:'flame',   name:'5,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#fb923c',unlocked:ltDist>=5000},
    {icon:'world',   name:'10,000 km Club',  val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#a78bfa',unlocked:ltDist>=10000},
    {icon:'target',  name:'100 Rides',        val:(lifetimeRides||rides.length).toLocaleString(),unit:'rides',color:'#fb923c',unlocked:(lifetimeRides||rides.length)>=100},
    {icon:'medal',   name:'500 Rides',        val:(lifetimeRides||rides.length).toLocaleString(),unit:'rides',color:'#a78bfa',unlocked:(lifetimeRides||rides.length)>=500},
    {icon:'world',   name:'Double Century',   val:biggestRide.toFixed(1),unit:'km best',color:'#facc15',unlocked:biggestRide>=200},
    {icon:'runner',  name:'Marathoner',       val:longestRun.toFixed(1),unit:'km best',color:'#38bdf8',unlocked:longestRun>=42.195},
    {icon:'mountain',name:'1,000 m Climb',    val:Math.round(bigClimb).toLocaleString(),unit:'m biggest climb',color:'#e879f9',unlocked:bigClimb>=1000},
    {icon:'clock',   name:'100 Hours',        val:lifetimeHours.toLocaleString(),unit:'hours moved',color:'#4da8ff',unlocked:lifetimeHours>=100},
    {icon:'flame',   name:'7-Day Streak',     val:streak,unit:'days best',color:'#ef4444',unlocked:streak>=7},
    {icon:'sun',     name:'Early Bird',       val:earlyCount,unit:'pre-6am starts',color:'#fbbf24',unlocked:earlyCount>=10},
    {icon:'moon',    name:'Night Owl',        val:nightCount,unit:'after-9pm starts',color:'#a78bfa',unlocked:nightCount>=10},
    {icon:'globe',   name:'25,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#22d3ee',unlocked:ltDist>=25000},
  ];

  _trophyBadges = badges;
  _trophyAthlete = currentAthlete ? ((currentAthlete.firstname||'')+' '+(currentAthlete.lastname||'')).trim() : '';

  html+=`<div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Badges</div>`;
  html+=`<div class="ach-grid" style="margin-bottom:20px">`;
  html+=badges.map((b,i)=>`
    <div class="ach-badge${b.unlocked?' unlocked':''}" style="--ach-color:${b.color}">
      ${b.unlocked?'<div class="ach-badge-bar"></div>':''}
      ${b.unlocked?`<button class="ach-share" title="Share as image" onclick="shareTrophy(${i})" aria-label="Share ${b.name}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg></button>`:''}
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
          <div style="font-size:10px;color:var(--muted);margin-top:2px">${dist} · ${grade} · ${ic('clock')} ${t}${loc?' · '+loc:''}</div>
        </div>
      </div>`;
    }).join('');
    if(komList.length>40) html+=`<div style="color:var(--muted);font-size:12px;padding:10px">+${komList.length-40} more KOMs</div>`;
    html+='</div>';
  }

  el.innerHTML=html;
  if (window.applyI18n) window.applyI18n();
}

/* ── SHARE A TROPHY AS A PNG ──
   Renders a polished 1080×1080 card for one badge and offers Download +
   (where supported) native Share. Modal + canvas are built lazily on first use. */
function _trophyModal(){
  let ov=document.getElementById('trophyShareModal');
  if(ov) return ov;
  ov=document.createElement('div');
  ov.id='trophyShareModal';
  ov.className='trophy-share-overlay';
  ov.innerHTML=`
    <div class="trophy-share-box">
      <button class="trophy-share-close" aria-label="Close">&times;</button>
      <canvas id="trophyShareCanvas" width="1080" height="1080"></canvas>
      <div class="trophy-share-actions">
        <button class="btn btn-primary" id="trophyDownloadBtn">Download PNG</button>
        <button class="btn btn-ghost" id="trophyShareBtn" style="display:none">Share</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>ov.classList.remove('open');
  ov.querySelector('.trophy-share-close').onclick=close;
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelector('#trophyDownloadBtn').onclick=()=>{
    const c=document.getElementById('trophyShareCanvas');
    const a=document.createElement('a');
    a.download=(ov._badgeName||'trophy').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.png';
    a.href=c.toDataURL('image/png'); a.click();
  };
  const sb=ov.querySelector('#trophyShareBtn');
  let canShare=false;
  try{ canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([new Blob()],'x.png',{type:'image/png'})]})); }catch{}
  if(canShare){
    sb.style.display='';
    sb.onclick=()=>{
      const c=document.getElementById('trophyShareCanvas');
      c.toBlob(async blob=>{ if(!blob)return;
        const f=new File([blob],'trophy.png',{type:'image/png'});
        try{ await navigator.share({files:[f],title:ov._badgeName||'My trophy',text:'My trophy on Strava Dashboard'}); }catch{}
      },'image/png');
    };
  }
  return ov;
}

function _drawTrophyCard(canvas,b){
  const ctx=canvas.getContext('2d'), W=1080, H=1080, cx=W/2;
  const col=b.color||'#fc4c02';
  const ry=430, rr=175;

  // transparent canvas (sticker-style PNG)
  ctx.clearRect(0,0,W,H);

  // soft colored halo behind the ring — fades to fully transparent at the edge,
  // so the exported PNG stays mostly see-through
  const glow=ctx.createRadialGradient(cx,ry,40,cx,ry,520);
  glow.addColorStop(0,col+'33'); glow.addColorStop(1,col+'00');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,ry,520,0,7); ctx.fill();

  ctx.textAlign='center';
  // text drawn with a soft dark shadow so it reads on light OR dark backgrounds
  const txt=(fill,font,str,y)=>{
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=14; ctx.shadowOffsetY=2;
    ctx.fillStyle=fill; ctx.font=font; ctx.fillText(str,cx,y);
    ctx.restore();
  };

  txt(col,'700 30px Inter,Arial,sans-serif','T R O P H Y   U N L O C K E D',150);

  // ring: glowing gradient fill + solid colored stroke
  ctx.save();
  ctx.shadowColor=col; ctx.shadowBlur=55;
  const ring=ctx.createRadialGradient(cx,ry,20,cx,ry,rr);
  ring.addColorStop(0,col+'55'); ring.addColorStop(0.7,col+'22'); ring.addColorStop(1,col+'12');
  ctx.fillStyle=ring; ctx.beginPath(); ctx.arc(cx,ry,rr,0,7); ctx.fill();
  ctx.restore();
  ctx.strokeStyle=col; ctx.lineWidth=10; ctx.beginPath(); ctx.arc(cx,ry,rr,0,7); ctx.stroke();

  txt(col,'900 108px Inter,Arial,sans-serif',String(b.val),730);
  txt('#c7cdd9','600 34px Inter,Arial,sans-serif',b.unit,782);
  txt('#ffffff','800 60px Inter,Arial,sans-serif',b.name,862);

  // footer: athlete + brand
  const foot=[_trophyAthlete, 'ascent-analytics.vercel.app'].filter(Boolean).join('  ·  ');
  txt('#aab2c2','600 28px Inter,Arial,sans-serif',foot,1005);

  // icon — bake the badge colour straight into the SVG (currentColor is
  // unreliable when an SVG is loaded through an <img>), then draw over the ring
  const inner=trophySvg(b.icon)
    .replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')
    .replace(/currentColor/g, col);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="200" height="200">${inner}</svg>`;
  const img=new Image();
  img.onload=()=>{ ctx.save(); ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=10; ctx.drawImage(img, cx-100, ry-100, 200, 200); ctx.restore(); };
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

function shareTrophy(i){
  const b=_trophyBadges[i];
  if(!b) return;
  const ov=_trophyModal();
  ov._badgeName=b.name;
  _drawTrophyCard(document.getElementById('trophyShareCanvas'), b);
  ov.classList.add('open');
}

/* ── SEGMENTS ── */
let segMaps = []; // {m, line} — re-fitted when the section becomes visible (maps build hidden)
// ── "Your Segments": starred + segments scanned from your rides, cached in
// localStorage per athlete so repeat visits make ZERO API calls. We only hit
// Strava on the very first open (no cache) or when the user taps Refresh.
let _segsData = null;       // starred segments (mirror of the cached store)
let _allSegs = null;        // merged starred + scanned (rebuilt on unit toggle)
let _segScanStore = null;   // {starred:[], ids:[scanned act ids], segs:{id:seg}, ts}
let _segScanCache = {};     // activity id → detail (in-memory, avoids refetch in a session)
let _segScanning = false, _segMapObs = null;
const _SEG_SCAN_BATCH = 50; // rides scanned per fetch (rate-limit friendly)

function _segStoreKey(){ return 'strava_segs_' + (localStorage.getItem('strava_athlete_id') || 'x'); }
function _segStoreLoad(){
  try{ const s=JSON.parse(localStorage.getItem(_segStoreKey())||'null');
       if(s&&Array.isArray(s.ids)&&s.segs) return { starred:s.starred||[], ids:s.ids, segs:s.segs, ts:s.ts||0 }; }catch{}
  return { starred:[], ids:[], segs:{}, ts:0 };
}
function _segStoreSave(){ try{ localStorage.setItem(_segStoreKey(), JSON.stringify(_segScanStore)); }catch{ /* quota — non-fatal */ } }

const _isKomSeg = s => !!((s.athlete_segment_stats && s.athlete_segment_stats.pr_rank===1) || s._hasKom);

// ── "Created by me" ─────────────────────────────────────────────────────
// Strava's API exposes no creator on a segment (and has no "segments I made"
// endpoint), so authorship comes from your own naming habit: the segments you
// draw are named "A -> B". The flag button on each card overrides that guess in
// either direction, and only those overrides are stored (per athlete, next to
// the segment cache) so a rename keeps working.
const _SEG_MINE_RE = /→|->|⇒|=>/;
let _segMine = null;   // {on:Set, off:Set} — manual overrides only
function _segMineKey(){ return 'strava_segmine_' + (localStorage.getItem('strava_athlete_id') || 'x'); }
function _segMineOv(){
  if(!_segMine){
    let on=[], off=[];
    try{ const raw=JSON.parse(localStorage.getItem(_segMineKey())||'null');
      if(Array.isArray(raw)) on=raw;                       // pre-heuristic format
      else if(raw){ on=raw.on||[]; off=raw.off||[]; } }catch{}
    _segMine={ on:new Set(on.map(String)), off:new Set(off.map(String)) };
  }
  return _segMine;
}
const _segMineAuto = s => _SEG_MINE_RE.test(s.name||'');
function _isMineSeg(s){
  const ov=_segMineOv(), id=String(s.id);
  if(ov.off.has(id)) return false;
  if(ov.on.has(id))  return true;
  return _segMineAuto(s);
}

// Flag / unflag a segment as one you created, straight from its card.
function toggleSegMine(id, btn){
  const ov=_segMineOv(), key=String(id);
  const card=btn?btn.closest('.seg-card'):null;
  const auto=card?card.dataset.mineauto==='1':false;
  const on=!(card?card.dataset.mine==='1':ov.on.has(key));
  ov.on.delete(key); ov.off.delete(key);
  if(on!==auto) (on?ov.on:ov.off).add(key);
  try{ localStorage.setItem(_segMineKey(), JSON.stringify({on:[...ov.on],off:[...ov.off]})); }catch{ /* quota — non-fatal */ }
  if(btn){
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on?'true':'false');
    if(card) card.dataset.mine=on?'1':'0';
  }
  const n=document.querySelector('.seg-chip-btn[data-filter="mine"] .seg-chip-n');
  if(n) n.textContent=document.querySelectorAll('.seg-card[data-mine="1"]').length;
  const grid=document.getElementById('segGrid');
  if(grid && typeof grid._applySeg==='function') grid._applySeg();
}

// Bulk-star every arrow-named segment. Goes by the name alone (not _isMineSeg)
// so the manual flag overrides don't pull in segments you didn't draw. Needs
// the profile:write scope — a 403 means the token predates it, so reconnect.
let _segStarring = false;
async function starAllArrowSegs(btn){
  if(_segStarring) return;
  const todo=(_allSegs||[]).filter(s=>s.id && _segMineAuto(s) && !s._starred);
  if(!todo.length) return;
  _segStarring=true;
  let done=0, failed=0, limited=false;
  for(const s of todo){
    if(btn) btn.innerHTML=`${ic('star')} Starring… ${done+1}/${todo.length}`;
    try{
      await apiPut(`/segments/${s.id}/starred?starred=true`, {starred:true});
      s._starred=true; done++;
    }catch(e){
      const m=' '+e.message+' ';
      if(/ 403 /.test(m)){ if(btn){ btn.innerHTML=`${ic('star')} Needs permission`; btn.disabled=true; }
        setStatus('Starring needs the <b>profile:write</b> permission — hit Disconnect, then reconnect with Strava to grant it.');
        _segStarring=false; return; }
      if(/ 429 /.test(m)){ limited=true; break; }   // rate limit — keep what we got
      failed++;
    }
  }
  // keep the starred cache in step so a re-render doesn't re-offer them
  if(!Array.isArray(_segScanStore.starred)) _segScanStore.starred=[];
  const known=new Set(_segScanStore.starred.map(x=>String(x.id)));
  todo.filter(s=>s._starred&&!known.has(String(s.id))).forEach(s=>_segScanStore.starred.push(s));
  _segStoreSave();
  _segStarring=false;
  if(limited) setStatus(`Starred ${done} — Strava's rate limit kicked in, try the rest in 15 minutes.`);
  if(btn){ btn.innerHTML=`${ic('star')} Starred ${done}${failed?` · ${failed} failed`:''}`; btn.disabled=true; }
}

// Normalise a segment effort (from an activity detail) into the card shape.
// _srcAct = the activity it was ridden in, so we can carve its route shape out
// of that ride's GPS track (no extra Strava call needed).
function _normEffortSeg(e, actId){
  const seg=e.segment||{};
  const gain=(seg.elevation_high!=null&&seg.elevation_low!=null)?Math.max(0,seg.elevation_high-seg.elevation_low):null;
  return { id:seg.id, name:seg.name||e.name, distance:seg.distance||e.distance||0,
    average_grade:seg.average_grade!=null?seg.average_grade:null, maximum_grade:seg.maximum_grade,
    total_elevation_gain:gain, elevation_high:seg.elevation_high, elevation_low:seg.elevation_low,
    climb_category:seg.climb_category||0, city:seg.city, state:seg.state, country:seg.country,
    activity_type:seg.activity_type||'Ride', start_latlng:seg.start_latlng, end_latlng:seg.end_latlng,
    athlete_pr_effort:{elapsed_time:e.elapsed_time||e.moving_time||0}, effort_count:1,
    _hasKom:e.kom_rank!=null, _hasPr:e.pr_rank===1, _srcAct:actId, _scanned:true };
}

// Scan up to _SEG_SCAN_BATCH not-yet-scanned recent activities for segment efforts
async function _scanForSegs(onProgress){
  const store=_segScanStore, scanned=new Set(store.ids);
  const todo=acts.filter(a=>a&&a.id&&!scanned.has(a.id)).slice(0,_SEG_SCAN_BATCH);
  let n=0;
  for(const a of todo){
    try{
      const det=_segScanCache[a.id]||(_segScanCache[a.id]=await api(`/activities/${a.id}`));
      (det&&det.segment_efforts||[]).forEach(e=>{
        const id=e.segment&&e.segment.id; if(!id) return;
        const ex=store.segs[id], t=e.elapsed_time||e.moving_time||0;
        if(!ex) store.segs[id]=_normEffortSeg(e,a.id);
        else{ ex.effort_count=(ex.effort_count||1)+1;
          if(t&&(!ex.athlete_pr_effort.elapsed_time||t<ex.athlete_pr_effort.elapsed_time)) ex.athlete_pr_effort.elapsed_time=t;
          if(!ex._srcAct) ex._srcAct=a.id;
          ex._hasKom=ex._hasKom||e.kom_rank!=null; ex._hasPr=ex._hasPr||e.pr_rank===1; }
      });
      store.ids.push(a.id);
    }catch(err){ if(/ 429 /.test(' '+err.message+' ')) break; } // rate limit — keep what we got
    n++; if(onProgress) onProgress(n,todo.length);
  }
  _segStoreSave();
}

// Merge starred (rich, authoritative) with scanned segments, deduped by id.
// Carry _srcAct onto starred entries you've also ridden, so they too get the
// route-from-ride treatment instead of a per-segment API call.
function _mergeSegs(){
  const byId={};
  (_segScanStore.starred||[]).forEach(s=>{ byId[s.id]={...s,_starred:true}; });
  Object.values(_segScanStore.segs).forEach(ss=>{
    if(byId[ss.id]){ if(!byId[ss.id]._srcAct && ss._srcAct) byId[ss.id]._srcAct=ss._srcAct; }
    else byId[ss.id]=ss;
  });
  _allSegs=Object.values(byId);
}

// ── Route geometry resolution (road-following, API-frugal) ──
let _segPolyCache = null; // {segId: encoded polyline} cached in localStorage
function _segPolyKey(){ return 'strava_segpoly_' + (localStorage.getItem('strava_athlete_id') || 'x'); }
function _segPolyLoad(){ try{ return JSON.parse(localStorage.getItem(_segPolyKey())||'{}')||{}; }catch{ return {}; } }
function _segPolySave(){ try{ localStorage.setItem(_segPolyKey(), JSON.stringify(_segPolyCache||{})); }catch{ /* quota */ } }

// Throttle /segments/{id} polyline fetches (max 2 in flight) so scrolling the
// list can't burst into a 429; results are cached in localStorage forever.
let _segFetchActive = 0; const _segFetchQ = [];
function _fetchSegPoly(id){
  return new Promise(resolve=>{ _segFetchQ.push({id,resolve}); _segFetchPump(); });
}
function _segFetchPump(){
  while(_segFetchActive<2 && _segFetchQ.length){
    const {id,resolve}=_segFetchQ.shift(); _segFetchActive++;
    (async()=>{
      let poly=null;
      try{ const det=await api(`/segments/${id}`); poly=(det&&det.map&&(det.map.polyline||det.map.summary_polyline))||null; }catch{}
      if(poly){ if(!_segPolyCache) _segPolyCache=_segPolyLoad(); _segPolyCache[id]=poly; _segPolySave(); }
      _segFetchActive--; resolve(poly); _segFetchPump();
    })();
  }
}

// Carve a segment's route out of the GPS track of the ride it was done on —
// the sub-path of the activity polyline between the segment's start and end.
function _sliceRouteFromActivity(actId, startLL, endLL){
  const a=(acts||[]).find(x=>x&&String(x.id)===String(actId));
  const poly=a&&a.map&&a.map.summary_polyline;
  if(!poly||!startLL||!endLL) return null;
  let pts; try{ pts=decodePolyline(poly); }catch{ return null; }
  if(pts.length<2) return null;
  const d2=(p,ll)=>{ const dy=p[0]-ll[0], dx=p[1]-ll[1]; return dy*dy+dx*dx; };
  const nearest=ll=>{ let bi=0,bd=Infinity; for(let i=0;i<pts.length;i++){ const d=d2(pts[i],ll); if(d<bd){bd=d;bi=i;} } return bi; };
  let i0=nearest(startLL), i1=nearest(endLL);
  if(i0>i1){ const t=i0; i0=i1; i1=t; }
  let seg=pts.slice(i0, i1+1);
  if(seg.length<2) return null;
  // orient so the path begins at the segment's start point
  if(d2(seg[0],startLL) > d2(seg[seg.length-1],startLL)) seg=seg.slice().reverse();
  return seg;
}

// Best available coordinates for a segment, cheapest source first:
// 1) polyline already on the object  2) sliced from the parent ride (no API)
// 3) cached/throttled Strava segment polyline  4) straight start→finish
async function _segCoords(s){
  let coords=[];
  const own=s.map&&(s.map.polyline||s.map.summary_polyline);
  if(own) try{coords=decodePolyline(own);}catch{}
  if(coords.length<2 && s._srcAct && s.start_latlng && s.end_latlng){
    const sl=_sliceRouteFromActivity(s._srcAct, s.start_latlng, s.end_latlng); if(sl) coords=sl;
  }
  if(coords.length<2){
    if(!_segPolyCache) _segPolyCache=_segPolyLoad();
    const p=_segPolyCache[s.id] || await _fetchSegPoly(s.id);
    if(p) try{coords=decodePolyline(p);}catch{}
  }
  if(coords.length<2 && s.start_latlng && s.end_latlng) coords=[s.start_latlng, s.end_latlng];
  return coords;
}

// Lazily build a card's mini-map when it scrolls into view (the list can be long)
// The bottom ~84px of a segment mini-map sits under .seg-overlay (name + place),
// so a symmetric fit hides the end of the route behind the title. Bias the fit
// upward by the overlay's height instead.
const SEG_FIT = { paddingTopLeft:[16,16], paddingBottomRight:[16,84] };

function _initSegMapEl(mapEl){
  const id=mapEl.id.replace('segmap-','');
  const s=(_allSegs||[]).find(x=>String(x.id)===String(id));
  if(!s){ mapEl.style.display='none'; return; }
  (async()=>{
    const coords=await _segCoords(s);
    if(coords.length<2){ mapEl.style.display='none'; return; }
    try{
      const m=L.map(mapEl,{zoomControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,attributionControl:false});
      addBasemap(m);
      const line=L.polyline(coords,{color:'#FC4C02',weight:3,opacity:.95}).addTo(m);
      L.circleMarker(coords[0],{radius:5,color:'#4ade80',fillColor:'#4ade80',fillOpacity:1,weight:0}).addTo(m);
      L.circleMarker(coords[coords.length-1],{radius:5,color:'#FC4C02',fillColor:'#FC4C02',fillOpacity:1,weight:0}).addTo(m);
      m.fitBounds(line.getBounds(),SEG_FIT);
      segMaps.push({m,line});
      setTimeout(()=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),SEG_FIT);}catch{}},300);
    }catch{}
  })();
}

async function renderSegments(refresh){
  const el=document.getElementById('segmentsGrid');
  const note=m=>{ el.innerHTML='<p style="color:var(--muted);padding:8px">'+m+'</p>'; };
  try{
    if(!_segScanStore) _segScanStore=_segStoreLoad();
    const cached = (_segScanStore.starred&&_segScanStore.starred.length) || Object.keys(_segScanStore.segs).length;

    // Fetch only on first-ever open (no cache) or explicit Refresh; otherwise
    // render straight from localStorage with no API calls.
    if(!_segScanning && (refresh===true || !cached)){
      _segScanning=true;
      try{
        note(cached?'Refreshing your segments…':'Loading your segments…');
        try{ const st=await api('/segments/starred?per_page=50'); if(Array.isArray(st)) _segScanStore.starred=st; }catch{}
        await _scanForSegs((n,t)=>note(`Scanning your rides for segments… ${n}/${t}`));
        _segScanStore.ts=Date.now(); _segStoreSave();
      } finally { _segScanning=false; }
    }

    _segsData=_segScanStore.starred||[];
    _mergeSegs();
    if(!_allSegs.length){ note('No segments yet — star some on Strava or ride a few segments, then tap Refresh.'); return; }
    _renderSegGrid(el, _allSegs);
  }catch(e){ note('Segments unavailable ('+e.message+').'); }
}

function _renderSegGrid(el, segs){

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
      fastestSeg&&{icon:ic('bolt'),lbl:'Fastest PR',val:kmh(fastestSeg.distance/fastestSeg.athlete_pr_effort.elapsed_time).toFixed(1),unit:speedUnit(),name:fastestSeg.name,color:'var(--orange)'},
      steepestSeg&&{icon:ic('mountain'),lbl:'Steepest',val:parseFloat(steepestSeg.average_grade).toFixed(1),unit:'%',name:steepestSeg.name,color:'#f87171'},
      mostRiddenSeg&&{icon:ic('repeat'),lbl:'Most Ridden',val:(mostRiddenSeg.effort_count||0).toLocaleString(),unit:'efforts',name:mostRiddenSeg.name,color:'#60a5fa'},
      longestSeg&&{icon:ic('ruler'),lbl:'Longest',val:fmtKm(longestSeg.distance),unit:distUnit(),name:longestSeg.name,color:'#a78bfa'},
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
      kom:segs.filter(_isKomSeg).length,
      pr:segs.filter(s=>s.athlete_pr_effort).length,
      mine:segs.filter(_isMineSeg).length,
    };
    const _chip=(f,lbl)=>`<button class="seg-chip-btn${f==='all'?' active':''}" data-filter="${f}">${lbl} <span class="seg-chip-n">${_cnt[f]}</span></button>`;
    const _unstarredArrow=segs.filter(s=>s.id&&_segMineAuto(s)&&!s._starred).length;
    const controlsHtml=`<div class="seg-controls">
      <div class="seg-chips">
        ${_chip('all','All')}${_chip('ride','Rides')}${_chip('run','Runs')}${_chip('climb','Climbs')}${_chip('kom','KOMs')}${_chip('pr','With PR')}${_chip('mine','Created by me')}
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
        <button class="seg-scan seg-refresh-btn" id="segRefresh" title="Refetch starred segments and scan more of your rides for new segments">${ic('repeat')} Refresh</button>
        ${_unstarredArrow?`<button class="seg-scan" id="segStarAll" title="Star every segment named &quot;A -&gt; B&quot; on Strava">${ic('star')} Star all mine (${_unstarredArrow})</button>`:''}
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
      const isKom   =_isKomSeg(s);
      const isMine  =_isMineSeg(s);

      const gc=gradeNum==null?'#666'
        :gradeNum<2?'#4ade80'
        :gradeNum<5?'#facc15'
        :gradeNum<8?'#fb923c'
        :'#f87171';

      return `<article class="seg-card${isKom?' is-kom':''}"
        data-sport="${(s.activity_type||'').toLowerCase()}" data-climb="${(s.climb_category||0)>0?1:0}"
        data-kom="${isKom?1:0}" data-pr="${pr?1:0}" data-mine="${isMine?1:0}"
        data-mineauto="${_segMineAuto(s)?1:0}" data-speed="${prSpeedNum||0}"
        data-dist="${s.distance||0}" data-grade="${gradeNum!=null?gradeNum:-99}"
        data-efforts="${s.effort_count||0}" data-segname="${(s.name||'').toLowerCase().replace(/"/g,'')}">
        <div class="seg-map-wrap">
          <div class="seg-map" id="segmap-${s.id}"></div>
          <div class="seg-badges">
            ${gradeStr?`<span class="seg-chip" style="background:${gc}">${gradeStr}</span>`:'<span></span>'}
            ${isKom?`<span class="seg-chip seg-kom">${ic('crown')} KOM</span>`:''}
          </div>
          <div class="seg-overlay">
            <a class="seg-name" href="https://www.strava.com/segments/${s.id}" target="_blank" rel="noopener">${s.name}</a>
            ${location?`<div class="seg-loc">${location}</div>`:''}
          </div>
          <button class="seg-expand" onclick="openSegMap('${s.id}')" title="View larger map" aria-label="View larger map">${ic('expand')}</button>
          <button class="seg-mine${isMine?' on':''}" onclick="toggleSegMine('${s.id}',this)" title="Mark as a segment you created" aria-label="Mark as a segment you created" aria-pressed="${isMine?'true':'false'}">${ic('flag')}</button>
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

    // mini-maps load lazily as cards scroll into view — with the full segment
    // list this avoids spinning up dozens of Leaflet maps (and /segments calls)
    // up front; each polyline is fetched once and cached.
    segMaps = [];
    if(window.L){
      if(_segMapObs) _segMapObs.disconnect();
      _segMapObs=new IntersectionObserver(ents=>ents.forEach(en=>{
        if(en.isIntersecting){ _segMapObs.unobserve(en.target); _initSegMapEl(en.target); }
      }),{rootMargin:'200px'});
      el.querySelectorAll('.seg-map').forEach(t=>_segMapObs.observe(t));
    }

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
        else if(filter==='mine') show=d.mine==='1';
        c.style.display=show?'':'none';
      });
      if(sort!=='default'){
        const key={fastest:'speed',longest:'dist',steepest:'grade',ridden:'efforts'}[sort];
        const ordered=sort==='name'
          ? cards.sort((a,b)=>a.dataset.segname.localeCompare(b.dataset.segname))
          : cards.sort((a,b)=>parseFloat(b.dataset[key])-parseFloat(a.dataset[key]));
        ordered.forEach(c=>grid.appendChild(c));
        setTimeout(()=>segMaps.forEach(({m,line})=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),SEG_FIT);}catch{}}),60);
      }
    }
    if(grid) grid._applySeg=applySeg;   // so the flag button can re-filter live
    el.querySelectorAll('.seg-chip-btn').forEach(b=>b.onclick=()=>{
      el.querySelectorAll('.seg-chip-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); if(grid) grid._filter=b.dataset.filter; applySeg();
    });
    const sortSel=document.getElementById('segSort'); if(sortSel) sortSel.onchange=applySeg;

    // Refresh: refetch starred + scan the next batch of rides (rate-limit safe).
    // Wired to both the top control and a button at the very bottom.
    const _doRefresh=()=>{ if(_segScanning) return; document.querySelectorAll('.seg-refresh-btn').forEach(b=>{b.disabled=true;b.textContent='Refreshing…';}); renderSegments(true); };

    // coverage status line + bottom Refresh button below the grid
    const remaining=acts.filter(a=>a&&a.id&&!_segScanStore.ids.includes(a.id)).length;
    const results=document.getElementById('segScanResults');
    if(results) results.innerHTML=`<div class="seg-scan-foot">
      <span class="seg-scan-title">${segs.length} segments · starred + ${_segScanStore.ids.length} rides scanned${remaining>0?` · ${remaining} more rides to scan`:' · all rides scanned'}</span>
      <button class="seg-scan seg-refresh-btn" id="segRefreshBottom">${ic('repeat')} Refresh</button>
    </div>`;

    document.querySelectorAll('.seg-refresh-btn').forEach(b=>b.onclick=_doRefresh);

    const starAllBtn=document.getElementById('segStarAll');
    if(starAllBtn) starAllBtn.onclick=()=>starAllArrowSegs(starAllBtn);
}

/* ── SEGMENT MAP MODAL — full details on a big, interactive map ── */
let _segBigMap = null;
async function openSegMap(id){
  const s=(_allSegs||_segsData||[]).find(x=>String(x.id)===String(id));
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

  // route geometry: own polyline → sliced from the parent ride → cached Strava
  // polyline → straight line (shared with the card mini-maps)
  const coords=await _segCoords(s);

  const mapEl=document.getElementById('segMapBig');
  if(_segBigMap){try{_segBigMap.remove();}catch{} _segBigMap=null;}
  mapEl.innerHTML='';
  if(!window.L||!coords.length){ mapEl.innerHTML='<div class="segmap-empty">No map available for this segment.</div>'; return; }
  try{
    const m=L.map(mapEl,{scrollWheelZoom:true});
    addBasemap(m);
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
    const badge=a.total_photo_count>1?`<span class="photo-count">${ic('stack')} ${a.total_photo_count}</span>`:(cover&&cover.video?`<span class="photo-play">${ic('play')}</span>`:'');
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
      tile.insertAdjacentHTML('beforeend',`<span class="photo-play">${ic('play')}</span>`);
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

/* ── MONTHLY STATS ── */
function renderMonthly(filterYear) {
  const years = [...new Set(acts.map(a=>new Date(a.start_date).getFullYear()))].sort((a,b)=>b-a);
  const yr = filterYear || years[0];

  // year buttons
  const yb = document.getElementById('yearBtns');
  yb.innerHTML = years.map(y=>`<button class="year-btn${y===yr?' active':''}" onclick="renderMonthly(${y})">${y}</button>`).join('');

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const rows = {};
  acts.filter(a=>new Date(a.start_date).getFullYear()===yr).forEach(a=>{
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
      <th>Month</th><th>Rides</th><th>Distance</th><th>Elevation</th><th>Moving Time</th><th>Avg Speed</th><th>Avg HR</th>
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
      <td class="num">${(r.dist/1000).toFixed(1)} <span class="dim">km</span></td>
      <td class="num">${Math.round(r.elev).toLocaleString()} <span class="dim">m</span></td>
      <td class="num">${fmtT(r.time)}</td>
      <td class="num">${avgSpd?(avgSpd*3.6).toFixed(1)+' <span class="dim">km/h</span>':'—'}</td>
      <td class="num">${avgHr?avgHr+' <span class="dim">bpm</span>':'—'}</td>
    </tr>`;
  }

  const totAvgSpd=allSpd.length?allSpd.reduce((a,b)=>a+b,0)/allSpd.length:0;
  const totAvgHr=allHr.length?Math.round(allHr.reduce((a,b)=>a+b,0)/allHr.length):null;
  html+=`<tr style="border-top:2px solid var(--orange);font-weight:700">
    <td>Total</td>
    <td class="num">${totR}</td>
    <td class="num">${(totD/1000).toFixed(1)} <span class="dim">km</span></td>
    <td class="num">${Math.round(totE).toLocaleString()} <span class="dim">m</span></td>
    <td class="num">${fmtT(totT)}</td>
    <td class="num">${totAvgSpd?(totAvgSpd*3.6).toFixed(1)+' <span class="dim">km/h</span>':'—'}</td>
    <td class="num">${totAvgHr?totAvgHr+' <span class="dim">bpm</span>':'—'}</td>
  </tr>`;
  html+=`</tbody></table>`;
  document.getElementById('monthlyTable').innerHTML=html;
}

/* ── BEST EFFORTS ── */
function renderBestEfforts(){
  const CATS=[
    {title:'Longest Rides',key:'distance',fmt:a=>(a/1000).toFixed(1)+' km',sort:(a,b)=>(b.distance||0)-(a.distance||0)},
    {title:'Most Elevation',key:'total_elevation_gain',fmt:a=>Math.round(a).toLocaleString()+' m',sort:(a,b)=>(b.total_elevation_gain||0)-(a.total_elevation_gain||0)},
    {title:'Fastest Avg Speed',key:'average_speed',fmt:a=>(a*3.6).toFixed(1)+' km/h',sort:(a,b)=>(b.average_speed||0)-(a.average_speed||0)},
    {title:'Highest Max Speed',key:'max_speed',fmt:a=>(a*3.6).toFixed(1)+' km/h',sort:(a,b)=>(b.max_speed||0)-(a.max_speed||0)},
    {title:'Highest Heart Rate',key:'max_heartrate',fmt:a=>Math.round(a)+' bpm',sort:(a,b)=>(b.max_heartrate||0)-(a.max_heartrate||0)},
    {title:'Highest Suffer Score',key:'suffer_score',fmt:a=>Math.round(a),sort:(a,b)=>(b.suffer_score||0)-(a.suffer_score||0)},
  ];
  const MEDALS=['🥇','🥈','🥉'];
  const el=document.getElementById('bestGrid');
  el.innerHTML=CATS.map(cat=>{
    const sorted=acts.filter(a=>a[cat.key]>0).sort(cat.sort).slice(0,5);
    if(!sorted.length) return '';
    const rows=sorted.map((a,i)=>`
      <div class="best-row">
        <div class="best-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${MEDALS[i]||i+1}</div>
        <div class="best-name">${a.name||'Activity'} <span style="color:var(--muted);font-size:10px;">${fmtDt(a.start_date)}</span></div>
        <div class="best-val">${cat.fmt(a[cat.key])}</div>
      </div>`).join('');
    return `<div class="best-card"><div class="best-card-title">${cat.title}</div>${rows}</div>`;
  }).join('');
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
        <div><div class="gear-stat-val">${((b.distance||st.dist)/1000).toFixed(0)}</div><div class="gear-stat-lbl">Total km</div></div>
        <div><div class="gear-stat-val">${st.rides}</div><div class="gear-stat-lbl">Rides logged</div></div>
        <div><div class="gear-stat-val">${st.elev?Math.round(st.elev/1000).toFixed(1)+'k':'—'}</div><div class="gear-stat-lbl">Elevation m</div></div>
      </div>
    </div>`;
  }).join('');
}

async function renderGear(){
  const el=document.getElementById('gearGrid');
  let bikes=(currentAthlete&&currentAthlete.bikes)||[];
  if(bikes.length){ _renderBikeList(el,bikes); return; }

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
  }catch(e){
    el.innerHTML=`<div class="card" style="color:var(--muted);font-size:13px;">Gear error: ${e.message}</div>`;
  }
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
  acts.forEach(a=>{
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
function renderMilestones(){
  const el=document.getElementById('milestonesGrid');
  if(!acts.length){el.innerHTML='<p style="color:var(--muted);padding:8px">No data.</p>';return;}
  const rides=acts.filter(isRide);
  const runs=acts.filter(a=>a.type==='Run'||a.type==='VirtualRun');
  const all=acts;

  const longestRide=rides.reduce((m,a)=>a.distance>m.distance?a:m,rides[0]||{distance:0});
  const mostElevRide=rides.reduce((m,a)=>(a.total_elevation_gain||0)>(m.total_elevation_gain||0)?a:m,rides[0]||{total_elevation_gain:0});
  const fastestRide=rides.filter(a=>a.average_speed>0).reduce((m,a)=>a.average_speed>m.average_speed?a:m,rides[0]||{average_speed:0});
  const longestRun=runs.reduce((m,a)=>a.distance>m.distance?a:m,runs[0]||{distance:0});
  const longestMove=all.reduce((m,a)=>a.moving_time>m.moving_time?a:m,all[0]||{moving_time:0});
  const bestHR=all.filter(a=>a.average_heartrate>0).reduce((m,a)=>a.average_heartrate>m.average_heartrate?a:m,{average_heartrate:0});

  // longest activity streak
  const days=new Set(all.map(a=>a.start_date?a.start_date.slice(0,10):null).filter(Boolean));
  let streak=0,best=0,cur=0,d=new Date();
  for(let i=0;i<730;i++){
    const k=d.toISOString().slice(0,10);
    if(days.has(k)){cur++;best=Math.max(best,cur);}else cur=0;
    d.setDate(d.getDate()-1);
  }
  streak=best;

  // total stats
  const totalDist=(all.reduce((s,a)=>s+(a.distance||0),0)/1000).toFixed(0);
  const totalElev=Math.round(all.reduce((s,a)=>s+(a.total_elevation_gain||0),0));
  const totalTime=all.reduce((s,a)=>s+(a.moving_time||0),0);
  const totalActs=all.length;

  const milestones=[
    {icon:'🏅',label:'Total Activities',val:totalActs,unit:'',desc:'All recorded activities',total:true},
    {icon:'🌍',label:'Total Distance',val:Number(totalDist).toLocaleString(),unit:'km',desc:'All activities combined',total:true},
    {icon:'⛰️',label:'Total Elevation',val:totalElev.toLocaleString(),unit:'m',desc:'All activities combined',total:true},
    {icon:'⏱️',label:'Total Moving Time',val:fmtT(totalTime),unit:'',desc:'All activities combined',total:true},
    {icon:'🚴',label:'Longest Ride',val:longestRide.distance?(longestRide.distance/1000).toFixed(1):'—',unit:'km',desc:longestRide.name||''},
    {icon:'🏔️',label:'Most Elevation',val:mostElevRide.total_elevation_gain?Math.round(mostElevRide.total_elevation_gain):'—',unit:'m',desc:mostElevRide.name||''},
    {icon:'⚡',label:'Fastest Ride',val:fastestRide.average_speed?(fastestRide.average_speed*3.6).toFixed(1):'—',unit:'km/h',desc:fastestRide.name||''},
    {icon:'🏃',label:'Longest Run',val:longestRun.distance?(longestRun.distance/1000).toFixed(1):'—',unit:'km',desc:longestRun.name||''},
    {icon:'💓',label:'Peak Heart Rate',val:bestHR.average_heartrate?Math.round(bestHR.average_heartrate):'—',unit:'bpm',desc:bestHR.name||''},
    {icon:'🔥',label:'Activity Streak',val:streak||'—',unit:'days',desc:'Longest consecutive days active'},
  ];
  el.innerHTML=milestones.map(m=>`
    <div class="ms-card${m.total?' is-total':''}">
      <div class="ms-top"><span class="ms-icon">${m.icon}</span><span class="ms-label">${m.label}</span></div>
      <div class="ms-val">${m.val}${m.unit?`<span class="ms-unit">${m.unit}</span>`:''}</div>
      <div class="ms-desc">${m.desc||'&nbsp;'}</div>
    </div>`).join('');
}

/* ── REWIND ── */
function renderRewind(filterYear){
  const el=document.getElementById('rewindContent');
  const years=[...new Set(acts.map(a=>new Date(a.start_date).getFullYear()))].sort((a,b)=>b-a);
  if(!years.length){el.innerHTML='<p style="color:var(--muted)">No data.</p>';return;}
  const yr=filterYear||years[0];
  const yb=document.getElementById('rewindYearBtns');
  yb.innerHTML=years.map(y=>`<button class="year-btn${y===yr?' active':''}" onclick="renderRewind(${y})">${y}</button>`).join('');
  const ya=acts.filter(a=>new Date(a.start_date).getFullYear()===yr);
  if(!ya.length){el.innerHTML='<p style="color:var(--muted)">No activities in '+yr+'.</p>';return;}

  const types={};
  ya.forEach(a=>{types[a.type]=(types[a.type]||0)+1;});
  const topType=Object.entries(types).sort((a,b)=>b[1]-a[1])[0];
  const rides=ya.filter(isRide),runs=ya.filter(a=>a.type==='Run'||a.type==='VirtualRun');
  const totalDist=(ya.reduce((s,a)=>s+(a.distance||0),0)/1000).toFixed(0);
  const totalElev=Math.round(ya.reduce((s,a)=>s+(a.total_elevation_gain||0),0));
  const totalTime=ya.reduce((s,a)=>s+(a.moving_time||0),0);
  const avgDist=ya.length?(ya.reduce((s,a)=>s+(a.distance||0),0)/ya.length/1000).toFixed(1):0;

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

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px">
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Activities</div><div style="font-size:32px;font-weight:800;color:var(--orange)">${ya.length}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Distance</div><div style="font-size:32px;font-weight:800;color:var(--text)">${Number(totalDist).toLocaleString()}<span style="font-size:14px;color:var(--muted)"> km</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Elevation</div><div style="font-size:32px;font-weight:800;color:var(--text)">${totalElev.toLocaleString()}<span style="font-size:14px;color:var(--muted)"> m</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Moving Time</div><div style="font-size:24px;font-weight:800;color:var(--text)">${fmtT(totalTime)}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Avg Distance</div><div style="font-size:32px;font-weight:800;color:var(--text)">${avgDist}<span style="font-size:14px;color:var(--muted)"> km</span></div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Top Sport</div><div style="font-size:20px;font-weight:800;color:var(--orange)">${topType?topType[0]:'—'}</div><div style="font-size:12px;color:var(--muted)">${topType?topType[1]+' activities':''}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Rides</div><div style="font-size:32px;font-weight:800;color:var(--text)">${rides.length}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Runs</div><div style="font-size:32px;font-weight:800;color:var(--text)">${runs.length}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Busiest Day</div><div style="font-size:28px;font-weight:800;color:var(--text)">${busyDay}</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Peak Month</div><div style="font-size:28px;font-weight:800;color:var(--orange)">${MONTHS[peakMonth]}</div></div>
    </div>
    <div class="chart-wrap" style="height:220px"><canvas id="rewindChart"></canvas></div>`;

  requestAnimationFrame(()=>{
    const ctx2=document.getElementById('rewindChart');
    if(!ctx2)return;
    if(ctx2._chart)ctx2._chart.destroy();
    ctx2._chart=new Chart(ctx2,{
      type:'bar',
      data:{labels:MONTHS,datasets:[
        {label:'Distance (km)',data:monthly.map(m=>(m.dist/1000).toFixed(1)),backgroundColor:'rgba(252,76,2,0.7)',borderRadius:4,order:1},
        {label:'Activities',data:monthly.map(m=>m.count),type:'line',borderColor:'rgba(255,255,255,0.5)',borderWidth:2,pointRadius:3,fill:false,yAxisID:'y2',order:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aaa',boxWidth:12}}},
        scales:{
          x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#888'}},
          y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#888'},title:{display:true,text:'km',color:'#888'}},
          y2:{position:'right',grid:{display:false},ticks:{color:'#888'},title:{display:true,text:'Activities',color:'#888'}}
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
        ${statCell('Distance',Math.round(lifetimeKm).toLocaleString(),'km','var(--text)')}
        ${divider()}
        ${statCell('Moving Time',lifetimeHours.toLocaleString(),'hours','var(--text)')}
        ${divider()}
        ${statCell('Elevation',Math.round(lifetimeElev/1000).toLocaleString(),'k meters','var(--text)')}
        ${bigRide>0?divider()+statCell('Biggest Ride',bigRide.toFixed(1),'km','#4da8ff'):''}
        ${bigClimb>0?divider()+statCell('Biggest Climb',Math.round(bigClimb),'m','#4da8ff'):''}
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
            ${statCell('Distance',Math.round(ytdKm).toLocaleString(),'km','var(--text)')}
            ${divider()}
            ${statCell('Elevation',Math.round(ytdElev/1000*10)/10,'k m','var(--text)')}
          </div>
        </div>
      </div>
      ${rrt?`<div>
        <div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Last 4 weeks</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div style="display:flex;flex-wrap:wrap">
            ${statCell('Rides',rrt.count,'activities','var(--orange)')}
            ${divider()}
            ${statCell('Distance',Math.round(recentKm).toLocaleString(),'km','var(--text)')}
            ${divider()}
            ${statCell('Elevation',Math.round((rrt.elevation_gain||0)/1000*10)/10,'k m','var(--text)')}
          </div>
        </div>
      </div>`:''}
    </div>`;
  }

  /* ── 4. ACHIEVEMENT BADGES ── */
  function trophyIcon(color,emoji){
    return `<div class="ach-badge-icon" style="background:radial-gradient(circle at 35% 35%,${color}55 0%,${color}18 60%,${color}08 100%);border:3px solid ${color};box-shadow:0 0 18px ${color}44,inset 0 1px 0 rgba(255,255,255,.18);">${emoji}</div>`;
  }

  // use lifetime data where available
  const ltDist=lifetimeKm||rides.reduce((s,a)=>s+(a.distance||0),0)/1000;
  const ltElev=lifetimeElev||acts.reduce((s,a)=>s+(a.total_elevation_gain||0),0);
  const biggestRide=bigRide>0?bigRide:longestRide;

  const badges=[
    {emoji:'👑',name:'KOM / QOM',       val:komList.length,        unit:'segments',  color:'#ffd700', unlocked:komList.length>0},
    {emoji:'🏆',name:'Achievements',     val:totalAch.toLocaleString(), unit:'on Strava', color:'#ffd700', unlocked:totalAch>0},
    {emoji:'⚡',name:'Personal Records', val:totalPR.toLocaleString(),  unit:'PRs',       color:'#fc4c02', unlocked:totalPR>0},
    {emoji:'👍',name:'Kudos',            val:totalKudos.toLocaleString(),unit:'received', color:'#fc4c02', unlocked:totalKudos>0},
    {emoji:'🌍',name:'Century Rider',    val:biggestRide.toFixed(1),unit:'km best',   color:'#4da8ff', unlocked:biggestRide>=100},
    {emoji:'🏔️',name:'Everest Climber', val:Math.round(ltElev/1000)+'k',unit:'m climbed',color:'#4da8ff',unlocked:ltElev>=8848},
    {emoji:'🏃',name:'Half Marathoner', val:longestRun.toFixed(1), unit:'km best',   color:'#00cc88', unlocked:longestRun>=21.1},
    {emoji:'🚴',name:'1,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#00cc88',unlocked:ltDist>=1000},
    {emoji:'🔥',name:'5,000 km Club',   val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#fb923c',unlocked:ltDist>=5000},
    {emoji:'🌐',name:'10,000 km Club',  val:Math.round(ltDist).toLocaleString(),unit:'km total',color:'#a78bfa',unlocked:ltDist>=10000},
    {emoji:'🎯',name:'100 Rides',        val:(lifetimeRides||rides.length).toLocaleString(),unit:'rides',color:'#fb923c',unlocked:(lifetimeRides||rides.length)>=100},
    {emoji:'💯',name:'500 Rides',        val:(lifetimeRides||rides.length).toLocaleString(),unit:'rides',color:'#a78bfa',unlocked:(lifetimeRides||rides.length)>=500},
  ];

  html+=`<div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Badges</div>`;
  html+=`<div class="ach-grid" style="margin-bottom:20px">`;
  html+=badges.map(b=>`
    <div class="ach-badge${b.unlocked?' unlocked':''}" style="--ach-color:${b.color}">
      ${b.unlocked?'<div class="ach-badge-bar"></div>':''}
      ${trophyIcon(b.color,b.emoji)}
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
      const dist=seg.distance?(seg.distance/1000).toFixed(2)+' km':'—';
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
}

/* ── SEGMENTS ── */
async function renderSegments(){
  const el=document.getElementById('segmentsGrid');
  el.innerHTML='<p style="color:var(--muted);padding:8px">Loading starred segments…</p>';
  try{
    const segs=await api('/segments/starred?per_page=50');
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
      fastestSeg&&{icon:'⚡',lbl:'Fastest PR',val:((fastestSeg.distance/fastestSeg.athlete_pr_effort.elapsed_time)*3.6).toFixed(1),unit:'km/h',name:fastestSeg.name,color:'var(--orange)'},
      steepestSeg&&{icon:'⛰',lbl:'Steepest',val:parseFloat(steepestSeg.average_grade).toFixed(1),unit:'%',name:steepestSeg.name,color:'#f87171'},
      mostRiddenSeg&&{icon:'🔁',lbl:'Most Ridden',val:(mostRiddenSeg.effort_count||0).toLocaleString(),unit:'efforts',name:mostRiddenSeg.name,color:'#60a5fa'},
      longestSeg&&{icon:'📏',lbl:'Longest',val:(longestSeg.distance/1000).toFixed(1),unit:'km',name:longestSeg.name,color:'#a78bfa'},
    ].filter(Boolean);

    const recHtml=recItems.length?`<div class="seg-summary">
      ${recItems.map(r=>`<div class="seg-sum">
        <div class="seg-sum-top" style="color:${r.color}">${r.icon} ${r.lbl}</div>
        <div class="seg-sum-val">${r.val}<span>${r.unit}</span></div>
        <div class="seg-sum-name">${r.name}</div>
      </div>`).join('')}
    </div>`:'';

    el.innerHTML=recHtml+`<div class="seg-grid">`+segs.map(s=>{
      const dist    =(s.distance/1000).toFixed(2);
      const gradeNum=s.average_grade!=null?parseFloat(s.average_grade):null;
      const gradeStr=gradeNum!=null?gradeNum.toFixed(1)+'%':null;
      const climb   =s.total_elevation_gain!=null?Math.round(s.total_elevation_gain):null;
      const pr      =s.athlete_pr_effort;
      const prTime  =pr?fmtT(pr.elapsed_time):null;
      const prSpeed =pr&&s.distance&&pr.elapsed_time?((s.distance/pr.elapsed_time)*3.6).toFixed(1):null;
      const kom     =s.xoms&&s.xoms.kom?s.xoms.kom:null;
      const efforts =s.effort_count?s.effort_count.toLocaleString():null;
      const location=[s.city,s.state,s.country].filter(Boolean).join(', ');
      const isKom   =s.athlete_segment_stats&&s.athlete_segment_stats.pr_rank===1;

      const gc=gradeNum==null?'#666'
        :gradeNum<2?'#4ade80'
        :gradeNum<5?'#facc15'
        :gradeNum<8?'#fb923c'
        :'#f87171';

      return `<article class="seg-card${isKom?' is-kom':''}">
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
        </div>
        <div class="seg-body">
          ${prTime?`<div class="seg-pr">
            <span class="seg-pr-lbl">PR</span>
            <span class="seg-pr-time">${prTime}</span>
            ${prSpeed?`<span class="seg-pr-speed">${prSpeed} km/h</span>`:''}
          </div>`:`<div class="seg-pr-empty">No personal record yet</div>`}
          <div class="seg-metrics">
            <div class="seg-m"><span class="seg-m-lbl">Distance</span><span class="seg-m-val">${dist} km</span></div>
            <div class="seg-m"><span class="seg-m-lbl">Elevation</span><span class="seg-m-val">${climb!=null?climb+' m':'—'}</span></div>
            <div class="seg-m"><span class="seg-m-lbl">KOM</span><span class="seg-m-val kom">${kom||'—'}</span></div>
          </div>
        </div>
        <div class="seg-foot">
          <span>${efforts?efforts+' efforts':'—'}</span>
          <a class="seg-link" href="https://www.strava.com/segments/${s.id}" target="_blank" rel="noopener">View on Strava →</a>
        </div>
      </article>`;
    }).join('')+'</div>';

    // init mini maps
    if(!window.L) return;
    segs.forEach(s=>{
      const mapEl=document.getElementById(`segmap-${s.id}`);
      if(!mapEl) return;
      const poly=s.map&&(s.map.polyline||s.map.summary_polyline);
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
        setTimeout(()=>{try{m.invalidateSize();}catch{}},300);
      }catch{}
    });
  }catch(e){
    el.innerHTML=`<p style="color:var(--muted);padding:8px">Segments unavailable (${e.message}).</p>`;
  }
}

/* ── PHOTOS ── */
async function renderPhotos(){
  const el=document.getElementById('photosGrid');
  el.innerHTML='<p style="color:var(--muted);padding:8px">Loading photos…</p>';
  const withPhotos=acts.filter(a=>a.total_photo_count>0).slice(0,24);
  if(!withPhotos.length){el.innerHTML='<p style="color:var(--muted);padding:8px">No photos found in recent activities.</p>';return;}
  const results=[];
  for(const a of withPhotos.slice(0,16)){
    try{
      const photos=await api(`/activities/${a.id}/photos?size=600&photo_sources=true`);
      if(photos&&photos.length) photos.forEach(p=>{
        const url=p.urls&&(p.urls['600']||p.urls['256']||Object.values(p.urls)[0]);
        if(url) results.push({url,name:a.name,date:a.start_date});
      });
    }catch{}
  }
  if(!results.length){el.innerHTML='<p style="color:var(--muted);padding:8px">Could not load photos.</p>';return;}
  el.innerHTML=results.map(p=>`
    <div class="photo-tile" title="${p.name}">
      <img src="${p.url}" alt="${p.name}" loading="lazy">
      <div class="photo-caption">
        <span>${p.name}</span>
        <span style="opacity:.65;font-size:9px">${p.date?fmtDt(p.date):''}</span>
      </div>
    </div>`).join('');
}

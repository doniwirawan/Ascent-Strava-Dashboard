/* ── CYCLING ── */
function renderCycling() {
  const rides = acts.filter(isRide);
  if (!rides.length) { document.getElementById('cyclingSection').style.display='none'; return; }

  const fastMaxRide = rides.reduce((a,r)=>(r.max_speed||0)>(a.max_speed||0)?r:a, rides[0]);
  const fastAvgRide = rides.reduce((a,r)=>(r.average_speed||0)>(a.average_speed||0)?r:a, rides[0]);
  const fastMax  = fastMaxRide.max_speed||0;
  const fastAvg  = fastAvgRide.average_speed||0;
  const totDist  = rides.reduce((s,r)=>s+(r.distance||0),0);
  const longest  = Math.max(...rides.map(r=>r.distance||0));
  const avgElev  = rides.reduce((s,r)=>s+(r.total_elevation_gain||0),0)/rides.length;

  document.getElementById('cyclingHero').innerHTML = `
    <div class="hero-box hi">
      <div class="hero-label">Fastest Speed (Max)</div>
      <div class="hero-value">${kmh(fastMax)} <span class="hero-unit">${speedUnit()}</span></div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(252,76,2,.2);font-size:11px;color:var(--orange);opacity:.8">
        <a href="https://www.strava.com/activities/${fastMaxRide.id}" target="_blank"
           style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(252,76,2,.3);">
          ${fastMaxRide.name}</a> &nbsp;·&nbsp; ${fmtDt(fastMaxRide.start_date)} &nbsp;·&nbsp; ${fmtD(fastMaxRide.distance)}
      </div>
    </div>
    <div class="hero-box hi">
      <div class="hero-label">Best Avg Speed</div>
      <div class="hero-value">${kmh(fastAvg)} <span class="hero-unit">${speedUnit()}</span></div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(252,76,2,.2);font-size:11px;color:var(--orange);opacity:.8">
        <a href="https://www.strava.com/activities/${fastAvgRide.id}" target="_blank"
           style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(252,76,2,.3);">
          ${fastAvgRide.name}</a> &nbsp;·&nbsp; ${fmtDt(fastAvgRide.start_date)} &nbsp;·&nbsp; ${fmtD(fastAvgRide.distance)}
      </div>
    </div>
    <div class="hero-box"><div class="hero-label">Longest Ride</div>
      <div class="hero-value">${fmtD(longest)}</div></div>
    <div class="hero-box"><div class="hero-label">Total Rides</div>
      <div class="hero-value">${rides.length}</div></div>
    <div class="hero-box"><div class="hero-label">Total Distance</div>
      <div class="hero-value">${fmtD(totDist)}</div></div>
    <div class="hero-box"><div class="hero-label">Avg Elevation</div>
      <div class="hero-value">${Math.round(avgElev)} <span class="hero-unit">m</span></div></div>
  `;

  // Top 5 fastest (max) speeds
  const top5 = [...rides].filter(r=>(r.max_speed||0)>0).sort((a,b)=>(b.max_speed||0)-(a.max_speed||0)).slice(0,5);
  const top5Max = top5.length ? top5[0].max_speed : 1;
  document.getElementById('cyclingTop5').innerHTML = top5.length ? `
    <div class="ctop-title">Top 5 Fastest Speeds</div>
    <div class="ctop-list">
      ${top5.map((r,i)=>`
        <a class="ctop-row" href="https://www.strava.com/activities/${r.id}" target="_blank" rel="noopener">
          <span class="ctop-rank">${i+1}</span>
          <span class="ctop-info">
            <span class="ctop-name">${r.name}</span>
            <span class="ctop-meta">${fmtDt(r.start_date)} · ${fmtD(r.distance)}</span>
          </span>
          <span class="ctop-bar"><span class="ctop-bar-fill" style="width:${((r.max_speed/top5Max)*100).toFixed(0)}%"></span></span>
          <span class="ctop-val">${kmh(r.max_speed)}<i>${speedUnit()}</i></span>
        </a>`).join('')}
    </div>` : '';

  // Speed trend
  const last20 = [...rides].slice(0,20).reverse();
  destroyChart('cSpeedChart');
  charts['cSpeedChart'] = new Chart(document.getElementById('cSpeedChart').getContext('2d'),{
    type:'line',
    data:{ labels:last20.map(r=>fmtDt(r.start_date)),
      datasets:[
        { label:'Max',  data:last20.map(r=>kmh(r.max_speed||0)),
          borderColor:'#FC4C02', backgroundColor:'rgba(252,76,2,.07)', tension:.35, fill:true, pointRadius:3, pointBackgroundColor:'#FC4C02' },
        { label:'Avg',  data:last20.map(r=>kmh(r.average_speed||0)),
          borderColor:'#555', backgroundColor:'rgba(85,85,85,.05)', tension:.35, fill:true, pointRadius:2 }
      ]
    },
    options: chartOpts(speedUnit())
  });

  // Distance distribution histogram
  const buckets = [0,20,40,60,80,100,150,200,999];
  const labels2 = ['<20','20-40','40-60','60-80','80-100','100-150','150-200','200+'];
  const counts  = new Array(labels2.length).fill(0);
  rides.forEach(r=>{
    const km = kmVal(r.distance||0);
    for (let i=0;i<buckets.length-1;i++) {
      if (km>=buckets[i] && km<buckets[i+1]) { counts[i]++; break; }
    }
  });
  destroyChart('cDistChart');
  charts['cDistChart'] = new Chart(document.getElementById('cDistChart').getContext('2d'),{
    type:'bar',
    data:{ labels:labels2,
      datasets:[{ data:counts, backgroundColor:'rgba(252,76,2,.7)', borderRadius:4,
                  hoverBackgroundColor:'#FC4C02' }]
    },
    options: chartOpts('rides',false)
  });
}

/* ── RUNNING ── */
function renderRunning() {
  const runs = acts.filter(a => ['Run','VirtualRun','TrailRun'].includes(a.type));
  const sec = document.getElementById('runningSection');
  if (!runs.length) { if (sec) sec.style.display = 'none'; return; }

  const withPace = runs.filter(r => r.average_speed > 0);
  const fastest = withPace.length ? withPace.reduce((a, r) => r.average_speed > a.average_speed ? r : a) : null;
  const longest = runs.reduce((a, r) => (r.distance||0) > (a.distance||0) ? r : a, runs[0]);
  const totDist = runs.reduce((s, r) => s + (r.distance||0), 0);
  const totTime = runs.reduce((s, r) => s + (r.moving_time||0), 0);
  const hrRuns = runs.filter(r => r.average_heartrate > 0);
  const avgHR = hrRuns.length ? Math.round(hrRuns.reduce((s, r) => s + r.average_heartrate, 0) / hrRuns.length) : 0;

  const subline = (r, extra) => r ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(252,76,2,.2);font-size:11px;color:var(--orange);opacity:.8">
      <a href="https://www.strava.com/activities/${r.id}" target="_blank" style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(252,76,2,.3);">${r.name}</a> &nbsp;·&nbsp; ${fmtDt(r.start_date)} &nbsp;·&nbsp; ${extra}</div>` : '';

  document.getElementById('runningHero').innerHTML = `
    <div class="hero-box hi">
      <div class="hero-label">Best Pace</div>
      <div class="hero-value">${fastest ? _pace(fastest.average_speed) : '—'} <span class="hero-unit">/${distUnit()}</span></div>
      ${subline(fastest, fastest ? fmtD(fastest.distance) : '')}
    </div>
    <div class="hero-box hi">
      <div class="hero-label">Longest Run</div>
      <div class="hero-value">${fmtD(longest.distance)}</div>
      ${subline(longest, fmtT(longest.moving_time||0))}
    </div>
    <div class="hero-box"><div class="hero-label">Total Runs</div><div class="hero-value">${runs.length}</div></div>
    <div class="hero-box"><div class="hero-label">Total Distance</div><div class="hero-value">${fmtD(totDist)}</div></div>
    <div class="hero-box"><div class="hero-label">Total Time</div><div class="hero-value">${Math.round(totTime/3600)} <span class="hero-unit">h</span></div></div>
    <div class="hero-box"><div class="hero-label">Avg Heart Rate</div><div class="hero-value">${avgHR||'—'} <span class="hero-unit">bpm</span></div></div>
  `;

  // Top 5 fastest pace
  const top5 = [...withPace].sort((a, b) => b.average_speed - a.average_speed).slice(0, 5);
  const top5max = top5.length ? top5[0].average_speed : 1;
  document.getElementById('runningTop5').innerHTML = top5.length ? `
    <div class="ctop-title">Top 5 Fastest Pace</div>
    <div class="ctop-list">
      ${top5.map((r, i) => `
        <a class="ctop-row" href="https://www.strava.com/activities/${r.id}" target="_blank" rel="noopener">
          <span class="ctop-rank">${i+1}</span>
          <span class="ctop-info"><span class="ctop-name">${r.name}</span><span class="ctop-meta">${fmtDt(r.start_date)} · ${fmtD(r.distance)}</span></span>
          <span class="ctop-bar"><span class="ctop-bar-fill" style="width:${(r.average_speed/top5max*100).toFixed(0)}%"></span></span>
          <span class="ctop-val">${_pace(r.average_speed)}<i>/${distUnit()}</i></span>
        </a>`).join('')}
    </div>` : '';

  // Pace trend (last 20 runs) — y is min/unit, faster at top
  const fmtP = v => { if (v == null) return ''; const m = Math.floor(v); const s = Math.round((v - m) * 60); return m + ':' + String(s).padStart(2, '0'); };
  const paceMin = r => r.average_speed ? +(((useImperial?1609.34:1000) / r.average_speed) / 60).toFixed(2) : null;
  const last20 = [...runs].slice(0, 20).reverse();
  destroyChart('rPaceChart');
  charts['rPaceChart'] = new Chart(document.getElementById('rPaceChart').getContext('2d'), {
    type: 'line',
    data: { labels: last20.map(r => fmtDt(r.start_date)),
      datasets: [{ data: last20.map(paceMin), borderColor: '#FC4C02', backgroundColor: 'rgba(252,76,2,.07)', tension: .35, fill: true, pointRadius: 3, pointBackgroundColor: '#FC4C02', spanGaps: true }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa', callbacks: { label: ctx => ' ' + fmtP(ctx.parsed.y) + ' /' + distUnit() } } },
      scales: { x: { grid: { color: '#1c1c1c' }, ticks: { color: '#555', font: { size: 10 }, maxRotation: 45 } },
        y: { reverse: true, grid: { color: '#1c1c1c' }, ticks: { color: '#555', font: { size: 10 }, callback: fmtP } } } }
  });

  // Distance distribution
  const buckets = [0, 5, 10, 15, 21, 30, 42, 999];
  const labels2 = ['<5', '5–10', '10–15', '15–21', '21–30', '30–42', '42+'];
  const counts = new Array(labels2.length).fill(0);
  runs.forEach(r => { const km = (r.distance||0) / 1000; for (let i = 0; i < buckets.length - 1; i++) { if (km >= buckets[i] && km < buckets[i+1]) { counts[i]++; break; } } });
  destroyChart('rDistChart');
  charts['rDistChart'] = new Chart(document.getElementById('rDistChart').getContext('2d'), {
    type: 'bar',
    data: { labels: labels2, datasets: [{ data: counts, backgroundColor: 'rgba(252,76,2,.7)', borderRadius: 4, hoverBackgroundColor: '#FC4C02' }] },
    options: chartOpts('runs', false)
  });
}

/* ── TRENDS ── */
function renderTrends() {
  // Weekly
  const weeks = {};
  acts.forEach(a=>{
    const d=new Date(a.start_date); d.setDate(d.getDate()-d.getDay());
    const k=d.toISOString().slice(0,10);
    weeks[k]=(weeks[k]||0)+kmVal(a.distance||0);
  });
  const wkeys=Object.keys(weeks).sort().slice(-20);
  destroyChart('weeklyChart');
  charts['weeklyChart']=new Chart(document.getElementById('weeklyChart').getContext('2d'),{
    type:'bar',
    data:{ labels:wkeys.map(k=>fmtDt(k)),
      datasets:[{ data:wkeys.map(k=>+weeks[k].toFixed(1)),
        backgroundColor:'rgba(252,76,2,.65)', borderRadius:4, hoverBackgroundColor:'#FC4C02' }]
    },
    options: chartOpts(distUnit(),false)
  });

  // YoY
  const monthly = {};
  acts.forEach(a=>{
    const d=new Date(a.start_date);
    const y=d.getFullYear(), m=d.getMonth();
    if (!monthly[y]) monthly[y]=new Array(12).fill(0);
    monthly[y][m]+=kmVal(a.distance||0);
  });
  const years=Object.keys(monthly).sort();
  const monthLabels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const palette=['#FC4C02','#ff8c5a','#ffb899','#555','#777','#999'];
  destroyChart('yoyChart');
  charts['yoyChart']=new Chart(document.getElementById('yoyChart').getContext('2d'),{
    type:'line',
    data:{ labels:monthLabels,
      datasets:years.slice(-4).map((y,i)=>({
        label:y, data:monthly[y].map(v=>+v.toFixed(1)),
        borderColor:palette[i], backgroundColor:'transparent',
        tension:.35, pointRadius:3, borderWidth:2
      }))
    },
    options: chartOpts(distUnit(),true)
  });

  // Avg speed by month
  const spd={};
  acts.forEach(a=>{
    if (!a.average_speed) return;
    const d=new Date(a.start_date);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!spd[k]) spd[k]={sum:0,n:0};
    spd[k].sum+=kmh(a.average_speed); spd[k].n++;
  });
  const skeys=Object.keys(spd).sort().slice(-10);
  destroyChart('speedChart');
  charts['speedChart']=new Chart(document.getElementById('speedChart').getContext('2d'),{
    type:'line',
    data:{ labels:skeys.map(k=>{ const[y,m]=k.split('-'); return new Date(+y,+m-1).toLocaleDateString('en-GB',{month:'short',year:'2-digit'}); }),
      datasets:[{ data:skeys.map(k=>+(spd[k].sum/spd[k].n).toFixed(1)),
        borderColor:'#FC4C02', backgroundColor:'rgba(252,76,2,.07)',
        tension:.4, fill:true, pointRadius:3, pointBackgroundColor:'#FC4C02' }]
    },
    options: chartOpts(speedUnit())
  });

  // Types doughnut
  const types={};
  acts.forEach(a=>{ types[a.type]=(types[a.type]||0)+1; });
  const tl=Object.keys(types);
  const pal2=['#FC4C02','#ff7a3d','#ff9e6d','#ffc09e','#555','#666','#777','#888','#999'];
  destroyChart('typeChart');
  charts['typeChart']=new Chart(document.getElementById('typeChart').getContext('2d'),{
    type:'doughnut',
    data:{ labels:tl,
      datasets:[{ data:tl.map(t=>types[t]), backgroundColor:pal2, borderWidth:0 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'right', labels:{color:'#666',font:{size:11},boxWidth:10} } }
    }
  });
}

/* ── ACTIVITIES + BUBBLES ── */
function renderActivities() {
  const list = acts.slice(0,15);
  document.getElementById('actList').innerHTML = list.map(a=>`
    <a class="act-row" href="https://www.strava.com/activities/${a.id}" target="_blank" style="text-decoration:none;color:inherit;">
      <div style="flex:1;min-width:0">
        <div class="act-name">${a.name}</div>
        <div class="act-meta">
          <span class="type-pill ${isRide(a)?'ride':''}">${a.type}</span>${fmtDt(a.start_date)}
        </div>
      </div>
      <div class="act-right">
        <div class="act-dist">${fmtD(a.distance)}</div>
        <div class="act-time">${fmtT(a.moving_time)}</div>
      </div>
    </a>
  `).join('');

  // Bubbles — sample 60 activities
  const sample = acts.slice(0,60);
  const maxDist = Math.max(...sample.map(a=>a.distance||0));
  const wrap = document.getElementById('bubbleWrap');
  wrap.innerHTML = sample.map(a=>{
    const km  = kmVal(a.distance||0);
    const pct = (a.distance||0)/(maxDist||1);
    const sz  = Math.max(28, Math.min(90, 28 + pct*62));
    return `<div class="bubble" style="width:${sz}px;height:${sz}px" title="${a.name} — ${km.toFixed(1)} ${distUnit()}">
      ${sz>40 ? `<span>${km.toFixed(0)}</span>` : ''}
    </div>`;
  }).join('');
}

/* ── CALENDAR — contribution graph (last 12 months) ── */
function renderCalendar() {
  const day={}; // 'YYYY-MM-DD' -> {n, dist}
  acts.forEach(a=>{ if(!a.start_date) return; const k=new Date(a.start_date).toISOString().slice(0,10); (day[k]||(day[k]={n:0,dist:0})); day[k].n++; day[k].dist+=a.distance||0; });

  const fmtKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const lvl=n=>n===0?'':n===1?'l1':n===2?'l2':n<=4?'l3':'l4';
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const today=new Date(); today.setHours(0,0,0,0);
  const start=new Date(today); start.setDate(start.getDate()-364); start.setDate(start.getDate()-start.getDay()); // back to Sunday

  // build weeks (columns of 7 days)
  const weeks=[]; const cur=new Date(start);
  let activeDays=0, totalActs=0, busiest=0;
  while(cur<=today){
    const week=[];
    for(let i=0;i<7;i++){
      if(cur>today){ week.push(null); }
      else{
        const k=fmtKey(cur), rec=day[k], n=rec?rec.n:0;
        if(n>0){ activeDays++; totalActs+=n; busiest=Math.max(busiest,n); }
        week.push({k,n,dist:rec?rec.dist:0,m:cur.getMonth()});
      }
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }

  // longest streak in range
  let streak=0,run=0; const dd=new Date(start);
  while(dd<=today){ const r=day[fmtKey(dd)]; if(r&&r.n>0){run++;streak=Math.max(streak,run);}else run=0; dd.setDate(dd.getDate()+1); }

  let prevM=-1;
  const months=weeks.map(w=>{ const f=w.find(c=>c); if(!f) return '<span class="cal2-m"></span>'; if(f.m!==prevM){prevM=f.m;return `<span class="cal2-m">${MONTHS[f.m]}</span>`;} return '<span class="cal2-m"></span>'; }).join('');
  const grid=weeks.map(w=>`<div class="cal2-week">${w.map(c=>{
    if(!c) return '<span class="cal2-cell empty"></span>';
    const t=`${c.k} · ${c.n} ${c.n===1?'activity':'activities'}${c.dist?' · '+fmtD(c.dist):''}`;
    return `<span class="cal-cell cal2-cell ${lvl(c.n)}" title="${t}"></span>`;
  }).join('')}</div>`).join('');

  document.getElementById('calGrid').innerHTML=`
    <div class="cal2-stats">
      <div><b>${totalActs.toLocaleString()}</b> activities</div>
      <div><b>${activeDays}</b> active days</div>
      <div><b>${streak}</b> day streak</div>
      <div><b>${busiest}</b> busiest day</div>
    </div>
    <div class="cal2-scroll">
      <div class="cal2-months">${months}</div>
      <div class="cal2-grid">${grid}</div>
    </div>
    <div class="cal2-legend">Less
      <span class="cal-cell cal2-cell"></span><span class="cal-cell cal2-cell l1"></span><span class="cal-cell cal2-cell l2"></span><span class="cal-cell cal2-cell l3"></span><span class="cal-cell cal2-cell l4"></span>
      More</div>`;
}

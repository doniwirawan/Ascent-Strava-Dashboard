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
      <div class="hero-value">${kmh(fastMax)} <span class="hero-unit">km/h</span></div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(252,76,2,.2);font-size:11px;color:var(--orange);opacity:.8">
        <a href="https://www.strava.com/activities/${fastMaxRide.id}" target="_blank"
           style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(252,76,2,.3);">
          ${fastMaxRide.name}</a> &nbsp;·&nbsp; ${fmtDt(fastMaxRide.start_date)} &nbsp;·&nbsp; ${fmtD(fastMaxRide.distance)}
      </div>
    </div>
    <div class="hero-box hi">
      <div class="hero-label">Best Avg Speed</div>
      <div class="hero-value">${kmh(fastAvg)} <span class="hero-unit">km/h</span></div>
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
          <span class="ctop-val">${kmh(r.max_speed)}<i>km/h</i></span>
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
    options: chartOpts('km/h')
  });

  // Distance distribution histogram
  const buckets = [0,20,40,60,80,100,150,200,999];
  const labels2 = ['<20','20-40','40-60','60-80','80-100','100-150','150-200','200+'];
  const counts  = new Array(labels2.length).fill(0);
  rides.forEach(r=>{
    const km = (r.distance||0)/1000;
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

/* ── TRENDS ── */
function renderTrends() {
  // Weekly
  const weeks = {};
  acts.forEach(a=>{
    const d=new Date(a.start_date); d.setDate(d.getDate()-d.getDay());
    const k=d.toISOString().slice(0,10);
    weeks[k]=(weeks[k]||0)+(a.distance||0)/1000;
  });
  const wkeys=Object.keys(weeks).sort().slice(-20);
  destroyChart('weeklyChart');
  charts['weeklyChart']=new Chart(document.getElementById('weeklyChart').getContext('2d'),{
    type:'bar',
    data:{ labels:wkeys.map(k=>fmtDt(k)),
      datasets:[{ data:wkeys.map(k=>+weeks[k].toFixed(1)),
        backgroundColor:'rgba(252,76,2,.65)', borderRadius:4, hoverBackgroundColor:'#FC4C02' }]
    },
    options: chartOpts('km',false)
  });

  // YoY
  const monthly = {};
  acts.forEach(a=>{
    const d=new Date(a.start_date);
    const y=d.getFullYear(), m=d.getMonth();
    if (!monthly[y]) monthly[y]=new Array(12).fill(0);
    monthly[y][m]+=(a.distance||0)/1000;
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
    options: chartOpts('km',true)
  });

  // Avg speed by month
  const spd={};
  acts.forEach(a=>{
    if (!a.average_speed) return;
    const d=new Date(a.start_date);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!spd[k]) spd[k]={sum:0,n:0};
    spd[k].sum+=a.average_speed*3.6; spd[k].n++;
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
    options: chartOpts('km/h')
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
    const km  = (a.distance||0)/1000;
    const pct = km/((maxDist||1)/1000);
    const sz  = Math.max(28, Math.min(90, 28 + pct*62));
    return `<div class="bubble" style="width:${sz}px;height:${sz}px" title="${a.name} — ${km.toFixed(1)} km">
      ${sz>40 ? `<span>${km.toFixed(0)}</span>` : ''}
    </div>`;
  }).join('');
}

/* ── CALENDAR ── */
function renderCalendar() {
  const counts={};
  acts.forEach(a=>{ const k=new Date(a.start_date).toISOString().slice(0,10); counts[k]=(counts[k]||0)+1; });

  const today=new Date();
  let html='';
  for (let mo=11;mo>=0;mo--) {
    const ref=new Date(today.getFullYear(),today.getMonth()-mo,1);
    const year=ref.getFullYear(), month=ref.getMonth();
    const dim=new Date(year,month+1,0).getDate();
    const dow=new Date(year,month,1).getDay();
    const mname=ref.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
    let cells='';
    for (let i=0;i<dow;i++) cells+=`<div class="cal-cell"></div>`;
    for (let d=1;d<=dim;d++) {
      const k=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const n=counts[k]||0;
      const lvl=n===0?'':n===1?'l1':n===2?'l2':n<=4?'l3':'l4';
      cells+=`<div class="cal-cell ${lvl}" title="${k}: ${n}"></div>`;
    }
    html+=`<div class="cal-month"><div class="cal-month-name">${mname}</div><div class="cal-days">${cells}</div></div>`;
  }
  document.getElementById('calGrid').innerHTML=html;
}

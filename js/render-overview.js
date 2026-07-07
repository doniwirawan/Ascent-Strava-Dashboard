/* ── RENDER ALL ── */
function renderAll() {
  // Re-apply persisted abnormal-speed corrections before any stats compute
  if(typeof applyMaxFixOverrides==='function') applyMaxFixOverrides();
  // Show all sections temporarily so charts can measure their containers
  _ALL_SECTIONS.forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='';});

  // Render each section in isolation so one failing section can never blank
  // out the others (or abort navScrollTo at the end).
  [renderStats, renderOverviewInsights, renderOverviewZones, renderCycling, renderRunning, renderTrends, renderActivities,
   renderCalendar, renderEddington, renderMonthly, renderBestEfforts,
   renderMilestones, renderRewind, renderPhotos].forEach(fn => {
    try { fn(); } catch (e) { console.error('render failed:', fn.name, e); }
  });
  // API-heavy sections (Gear, Segments, Trophies) are lazy-loaded on first
  // navigation to spare Strava's shared public rate limit — see navScrollTo.
  // Clear their containers so a unit/lang re-render rebuilds them from cache.
  ['gearGrid','segmentsGrid','challengesGrid'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML='';});
  // AI Coach summary is derived from `acts` — drop it so a reload rebuilds it
  if(typeof clearAISummary==='function') clearAISummary();
  // heatmap is also lazy-loaded when the user opens heatSection

  // Save Image + Share Story live in the floating FAB group, not the navbar
  document.getElementById('logoutBtn').style.display = '';
  const _fg=document.getElementById('fabGroup'); if(_fg) _fg.style.display='flex';
  const lt=document.getElementById('langToggleApp'); if(lt) lt.style.display='';
  const ut=document.getElementById('unitToggle');
  if(ut){ ut.style.display=''; ut.querySelectorAll('[data-unit]').forEach(b=>b.classList.toggle('active',(b.dataset.unit==='mi')===useImperial)); }
  const mt=document.getElementById('modeToggle');
  if(mt){ mt.style.display=''; mt.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===milestoneMode)); }
  const nl = document.getElementById('navLinks');
  nl.style.opacity = '1';
  nl.style.pointerEvents = '';
  const sn = document.getElementById('sidebarNav');
  if(sn) sn.classList.remove('locked');

  // Restore the last section the user had open before refresh (default: Overview)
  let last = 'statRow';
  try { const s = localStorage.getItem('lastSection'); if (s && _ALL_SECTIONS.includes(s)) last = s; } catch {}
  const navBtn = document.querySelector('#sidebarNav .nav-link[onclick*="'+last+'"]') || document.querySelector('#sidebarNav .nav-link');
  navScrollTo(last, navBtn);
  // Route Builder hidden for now — don't auto-reopen it on load.
  if (window.applyI18n) window.applyI18n();
}

/* ── STATS ── */
function renderStats() {
  const rides = acts.filter(isRide);
  const runs  = acts.filter(a=>a.type==='Run'||a.type==='VirtualRun');

  // ── everything below follows the navbar Cyclist/Runner mode ──
  const mode = sportMode();
  const set  = modeActs();
  const dist  = set.reduce((s,a)=>s+(a.distance||0),0);
  const time  = set.reduce((s,a)=>s+(a.moving_time||0),0);
  const elev  = set.reduce((s,a)=>s+(a.total_elevation_gain||0),0);
  const kudos = set.reduce((s,a)=>s+(a.kudos_count||0),0);
  const prs   = set.reduce((s,a)=>s+(a.pr_count||0),0);
  const achs  = set.reduce((s,a)=>s+(a.achievement_count||0),0);
  const E     = eddington(set);
  const longest = set.reduce((m,a)=>(a.distance||0)>m?(a.distance||0):m,0);
  let longLbl, avgLbl, avgVal, avgSub, maxLbl, maxVal, maxSub;
  if (mode==='run') {
    longLbl=t('longRun');
    const totD=set.reduce((s,a)=>s+(a.distance||0),0), totT=set.reduce((s,a)=>s+(a.moving_time||0),0);
    avgLbl=t('avgPace'); avgVal=totT&&totD?_pace(totD/totT):'—'; avgSub='/'+distUnit();
    const paced=set.filter(a=>a.average_speed>0);
    const best=paced.length?paced.reduce((m,a)=>a.average_speed>m.average_speed?a:m):null;
    maxLbl=t('bestPace'); maxVal=best?_pace(best.average_speed):'—'; maxSub='/'+distUnit();
  } else {
    longLbl=t('longRide');
    const riding=set.filter(a=>a.average_speed>0);
    const avg=riding.length?kmh(riding.reduce((s,a)=>s+a.average_speed,0)/riding.length):0;
    avgLbl=t('avgSpeed'); avgVal=avg?avg.toFixed(1):'—'; avgSub=speedUnit()+' '+t('riding');
    const mx=kmh(set.reduce((m,a)=>cleanMax(a)>m?cleanMax(a):m,0));
    maxLbl=t('maxSpeed'); maxVal=mx?mx.toFixed(1):'—'; maxSub=speedUnit();
  }

  // avg heart rate across activities that have it
  const hrActs = set.filter(a=>a.average_heartrate>0);
  const avgHR  = hrActs.length ? Math.round(hrActs.reduce((s,a)=>s+a.average_heartrate,0)/hrActs.length) : 0;

  // best consecutive day streak
  const daySet = new Set(set.map(a=>a.start_date.slice(0,10)));
  const days   = [...daySet].sort();
  let bestStreak=days.length?1:0, curStreak=days.length?1:0;
  for(let i=1;i<days.length;i++){
    const diff=(new Date(days[i])-new Date(days[i-1]))/(864e5);
    if(diff===1){curStreak++;bestStreak=Math.max(bestStreak,curStreak);}
    else curStreak=1;
  }

  // calories: sum of kilojoules (≈ kcal for cycling) or calories field
  const totalCal = Math.round(set.reduce((s,a)=>s+(a.kilojoules||a.calories||0),0));

  // consistency: how EVEN your weekly volume is over the active span (≤26 weeks).
  // Score = 100·(1 − coefficient of variation of weekly activity counts), so
  // uneven weeks and gaps pull it down (being active most weeks ≠ 100%).
  const now = new Date();
  const dates = set.map(a=>new Date(a.start_date)).filter(d=>!isNaN(d));
  let consistency = 0;
  if (dates.length > 1) {
    const firstD = new Date(Math.min(...dates));
    const span = Math.min(26, Math.max(2, Math.ceil((now - firstD) / (7*864e5))));
    const wk = new Array(span).fill(0);
    dates.forEach(t => { const w = Math.floor((now - t) / (7*864e5)); if (w >= 0 && w < span) wk[w]++; });
    const mean = wk.reduce((a,b)=>a+b,0) / span;
    if (mean > 0) {
      const sd = Math.sqrt(wk.reduce((a,b)=>a+(b-mean)**2,0) / span);
      consistency = Math.max(0, Math.min(100, Math.round((1 - sd/mean) * 100)));
    }
  }

  document.getElementById('sv-acts').textContent    = set.length;
  document.getElementById('sv-dist').textContent    = fmtD(dist);
  document.getElementById('sv-dist-sub').textContent= t('avg')+' '+fmtD(dist/(set.length||1));
  document.getElementById('sv-time').textContent    = Math.round(time/3600)+'h';
  document.getElementById('sv-time-sub').textContent= time>=86400 ? '≈ '+fmtDays(time) : t('hours');
  const elevDisp = elevVal(elev);
  document.getElementById('sv-elev').textContent    = elevDisp < 1000 ? Math.round(elevDisp)+' '+elevUnit() : Math.round(elevDisp/1000)+'k '+elevUnit();
  document.getElementById('sv-eddy').textContent    = E;
  document.getElementById('sv-eddy-sub').textContent= (mode==='run'?t('running'):t('cycling'))+' '+distUnit();
  document.getElementById('sv-rides').textContent   = rides.length;
  document.getElementById('sv-runs').textContent    = runs.length;
  document.getElementById('sv-kudos').textContent   = kudos.toLocaleString();
  document.getElementById('sv-prs').textContent     = prs.toLocaleString();
  document.getElementById('sv-ach').textContent     = achs.toLocaleString();
  document.getElementById('sv-longest').textContent = longest?fmtKm(longest):'—';
  document.getElementById('sv-avgspd').textContent  = avgVal;
  document.getElementById('sv-maxspd').textContent  = maxVal;
  document.getElementById('sv-avghr').textContent   = avgHR||'—';
  const avgHrZone = avgHR ? hrZoneLabel(avgHR) : '';
  document.getElementById('sv-avghr-sub').innerHTML = avgHrZone ? 'bpm · '+avgHrZone : 'bpm';
  document.getElementById('sv-streak').textContent  = bestStreak||'—';
  document.getElementById('sv-cal').textContent     = totalCal?Math.round(totalCal/1000)+'k':'—';
  const csEl=document.getElementById('sv-consistency'); if(csEl) csEl.textContent = consistency+'%';
  // mode/unit-dependent labels & subs
  const setTxt=(id,txt)=>{const e=document.getElementById(id); if(e) e.textContent=txt;};
  setTxt('sv-longest-lbl', longLbl); setTxt('sv-longest-sub', distUnit());
  setTxt('sv-avgspd-lbl', avgLbl);   setTxt('sv-avgspd-sub', avgSub);
  setTxt('sv-maxspd-lbl', maxLbl);   setTxt('sv-maxspd-sub', maxSub);
}

/* ── FUN INSIGHTS (Overview) ── */
function renderOverviewInsights(){
  const el=document.getElementById('ovInsights');
  if(!el) return;
  const set=modeActs();
  if(!set.length){ el.innerHTML=''; return; }

  const dist=set.reduce((s,a)=>s+(a.distance||0),0);            // m
  const elev=set.reduce((s,a)=>s+(a.total_elevation_gain||0),0);// m
  const cal =set.reduce((s,a)=>s+(a.kilojoules||a.calories||0),0);

  // Everests climbed (Everest = 8848 m)
  const everests=elev/8848;
  // % around the world (equator = 40,075 km)
  const aroundPct=dist/40075000*100;
  // pizza slices (~285 kcal each)
  const pizzas=Math.round(cal/285);

  // favourite time of day
  const buckets={Morning:0,Afternoon:0,Evening:0,Night:0};
  set.forEach(a=>{const h=new Date(a.start_date).getHours();
    if(h>=5&&h<12)buckets.Morning++;else if(h<17)buckets.Afternoon++;else if(h<21)buckets.Evening++;else buckets.Night++;});
  const favTime=Object.entries(buckets).sort((a,b)=>b[1]-a[1])[0];
  const favTimePct=Math.round(favTime[1]/set.length*100);

  // busiest weekday
  const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], dow=Array(7).fill(0);
  set.forEach(a=>dow[new Date(a.start_date).getDay()]++);
  const busyIdx=dow.indexOf(Math.max(...dow));

  // biggest single week (rolling 7-day distance window)
  const sorted=[...set].sort((a,b)=>new Date(a.start_date)-new Date(b.start_date));
  let bestWeek=0;
  for(let i=0;i<sorted.length;i++){
    let sum=0;const t0=new Date(sorted[i].start_date).getTime();
    for(let j=i;j<sorted.length;j++){
      if(new Date(sorted[j].start_date).getTime()-t0>7*864e5)break;
      sum+=sorted[j].distance||0;
    }
    if(sum>bestWeek)bestWeek=sum;
  }

  // active-days ratio over the span
  const dates=set.map(a=>new Date(a.start_date)).sort((a,b)=>a-b);
  const spanDays=Math.max(1,Math.round((dates[dates.length-1]-dates[0])/864e5)+1);
  const activeDays=new Set(set.map(a=>a.start_date.slice(0,10))).size;
  const perWeek=(set.length/spanDays*7).toFixed(1);

  const cards=[
    {ic:'mountain',color:'#4da8ff',val:everests.toFixed(1)+'×',lbl:'Everests climbed',sub:Math.round(elevVal(elev)).toLocaleString()+' '+elevUnit()+' total'},
    {ic:'globe',color:'#22c55e',val:aroundPct>=100?(dist/40075000).toFixed(2)+'×':aroundPct.toFixed(1)+'%',lbl:aroundPct>=100?'around the world':'around the equator',sub:Math.round(kmVal(dist)).toLocaleString()+' '+distUnit()},
    {ic:'flame',color:'#fb923c',val:pizzas.toLocaleString(),lbl:'pizza slices burned',sub:Math.round(cal).toLocaleString()+' kcal'},
    {ic:'clock',color:'#a78bfa',val:favTime[0],lbl:'is your prime time',sub:favTimePct+'% of activities'},
    {ic:'calendar',color:'#fc4c02',val:DOW[busyIdx],lbl:'is your busiest day',sub:dow[busyIdx]+' activities'},
    {ic:'peak',color:'#ffd700',val:fmtKm(bestWeek)+' '+distUnit(),lbl:'biggest week',sub:'best 7-day distance'},
    {ic:'repeat',color:'#4da8ff',val:perWeek,lbl:'activities / week',sub:'over '+spanDays+' days'},
    {ic:'check',color:'#22c55e',val:activeDays,lbl:'active days',sub:Math.round(activeDays/spanDays*100)+'% of the span'},
  ];

  const svg=n=>({
    mountain:'<path d="M3 20h18L13.6 6.5 10.2 13 8 10.3z"/>',
    globe:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    flame:'<path d="M12 2c1.3 3.3 4.6 4.6 4.6 9A4.6 4.6 0 0 1 7.4 11c0-1.6.7-2.8 1.7-3.8.2 1.9 1.9 2.1 1.9.3 0-2 .3-4 1-5.5z"/>',
    clock:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 2v4M16 2v4" fill="none" stroke="currentColor" stroke-width="2"/>',
    peak:'<path d="M3 20h18L13.6 6.5 10.2 13 8 10.3z"/><path d="M12 2l1.6 3.2L17 5.8 14.5 8 15 11.5 12 9.8 9 11.5 9.5 8 7 5.8l3.4-.6z" opacity=".7"/>',
    repeat:'<path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    check:'<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  }[n]||'');

  el.innerHTML=`
    <div class="section-title" style="margin-top:8px">Fun Insights</div>
    <div class="insight-grid">
      ${cards.map(c=>`
        <div class="insight-card">
          <div class="insight-ic" style="color:${c.color}"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">${svg(c.ic)}</svg></div>
          <div class="insight-val">${c.val}</div>
          <div class="insight-lbl">${c.lbl}</div>
          <div class="insight-sub">${c.sub}</div>
        </div>`).join('')}
    </div>`;
}

/* ── EDDINGTON ── */
function eddington(rides) {
  const kms = rides.map(r=>kmVal(r.distance||0)).sort((a,b)=>b-a);
  let E=0;
  for (let i=0;i<kms.length;i++) { if (kms[i]>=i+1) E=i+1; else break; }
  return E;
}

function renderEddington() {
  const mode = sportMode();
  const rides = mode==='run' ? acts.filter(a=>a.type==='Run'||a.type==='VirtualRun') : acts.filter(isRide);
  const word = mode==='run' ? 'run' : 'ride';
  const E = eddington(rides);
  document.getElementById('eddyNum').textContent = E;

  // ladder: how many more activities needed for the next few Eddington numbers
  const next = E+1;
  const id = window.LANG==='id';
  const rows = [];
  for (let t=next; t<=E+3; t++) {
    const have = rides.filter(r=>kmVal(r.distance||0)>=t).length;
    const need = Math.max(0, t - have);
    const w = id ? (mode==='run'?'lari':'gowes') : `${word}${need!==1?'s':''}`;
    rows.push(id
      ? `<div class="eddy-step"><strong>E=${t}</strong> — butuh <strong>${need} ${w} lagi</strong> sejauh ≥${t} ${distUnit()} <span class="eddy-have">(punya ${have}/${t})</span></div>`
      : `<div class="eddy-step"><strong>E=${t}</strong> — need <strong>${need} more ${w}</strong> of ≥${t} ${distUnit()} <span class="eddy-have">(have ${have}/${t})</span></div>`);
  }
  document.getElementById('eddyNext').innerHTML = rows.join('');

  // bar chart: last 15 E-values cumulative
  const kms = rides.map(r=>kmVal(r.distance||0)).sort((a,b)=>b-a).slice(0,next+5);
  const labels = kms.map((_,i)=>i+1+'');
  destroyChart('eddyChart');
  charts['eddyChart'] = new Chart(document.getElementById('eddyChart').getContext('2d'),{
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'Ride '+distUnit(), data:kms.map(k=>+k.toFixed(1)),
          backgroundColor: kms.map((k,i)=>k>=i+1?'rgba(252,76,2,.7)':'rgba(252,76,2,.15)'),
          borderRadius:3 },
        { label:'Required', data:labels.map((_,i)=>i+1),
          type:'line', borderColor:'#555', borderWidth:1.5, pointRadius:0, fill:false }
      ]
    },
    options: { ...chartOpts(distUnit(),false), scales:{
      x:{display:false},
      y:{grid:{color:'#1a1a1a'},ticks:{color:'#555',font:{size:10}},beginAtZero:true}
    }}
  });
}

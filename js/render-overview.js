/* ── RENDER ALL ── */
function renderAll() {
  // Show all sections temporarily so charts can measure their containers
  _ALL_SECTIONS.forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='';});

  // Render each section in isolation so one failing section can never blank
  // out the others (or abort navScrollTo at the end).
  [renderStats, renderCycling, renderRunning, renderTrends, renderActivities,
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
    const mx=kmh(set.reduce((m,a)=>a.max_speed>m?a.max_speed:m,0));
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

  // how many activities ≥ E+1 (unit) already?
  const next = E+1;
  const have = rides.filter(r=>kmVal(r.distance||0)>=next).length;
  const need = next - have;
  document.getElementById('eddyNext').innerHTML = (window.LANG==='id')
    ? `Untuk mencapai <strong>E=${next}</strong> Anda butuh <strong>${need} ${mode==='run'?'lari':'gowes'} lagi sejauh ≥${next} ${distUnit()}</strong> (punya ${have}/${next}).`
    : `To reach <strong>E=${next}</strong> you need <strong>${need} more ${word}${need!==1?'s':''} of ≥${next} ${distUnit()}</strong> (have ${have}/${next}).`;

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

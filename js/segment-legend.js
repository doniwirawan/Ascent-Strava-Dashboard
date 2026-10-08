/* ── LOCAL LEGENDS ────────────────────────────────────────────────────────────
   Strava's /segments/{id} carries an (undocumented, like `xoms`) local_legend
   block: whoever has the most efforts on the segment in the last 90 days, and
   their count. For every segment you've ridden in that window we read it; where
   the legend isn't you, your own 90-day count comes from
   /segments/{id}/all_efforts, and the gap is what it takes to pass them.
   Where it is you, the same call dates your efforts: each one ages out of the
   window 90 days after it was ridden, so the crowns whose count is about to
   shrink are the ones closest to being taken. (Strava doesn't expose the
   runner-up's count, so this is the closest honest read of "at risk".)
   Up to two calls per segment on the app-shared rate limit, so — like Segment
   Intelligence — it's owner-only, on demand, capped per run and cached. */

const LL_KEY  = 'seg_legend_v1';
const LL_MAX  = 20;            // segments checked per run
const LL_TTL  = 12 * 3600e3;   // don't re-check a segment within this
const LL_DAYS = 90;            // Strava's Local Legend window

let _llData = null;   // {segId: {ts, name, mine, holder, holder_id, theirs, yours, none, dates}}
let _llRunning = false;
function _llGet(){
  if(!_llData){ try{ _llData=JSON.parse(localStorage.getItem(LL_KEY)||'null')||{}; }catch{ _llData={}; } }
  return _llData;
}
function _llSave(){ try{ localStorage.setItem(LL_KEY, JSON.stringify(_llData)); }catch{ /* quota — non-fatal */ } }
const _isLegendSeg = s => { const r=_llGet()[s.id]; return !!(r&&r.mine); };
// due for a (re)check: never checked, older than the TTL, or a crown checked
// before effort dates (or the legend's athlete id) were kept
const _llDue = r => !r || Date.now()-r.ts>=LL_TTL || (r.mine && !r.dates) || (!r.mine && !r.none && !r.holder_id);
const _llOwner = () => typeof _isHrzOwner==='function' && _isHrzOwner();

// Most recent ride on a segment that the segment cache knows about.
function _llLastRide(s){
  const a=s._srcAct&&(acts||[]).find(x=>String(x.id)===String(s._srcAct));
  const pr=s.athlete_pr_effort;
  return Math.max(Date.parse(s._last)||0, Date.parse(a&&a.start_date)||0, Date.parse(pr&&pr.start_date)||0);
}
function _llCandidates(){
  const cutoff=Date.now()-LL_DAYS*864e5;
  return (_allSegs||[]).filter(s=>s.id&&_llLastRide(s)>=cutoff).sort((a,b)=>_llLastRide(b)-_llLastRide(a));
}

// effort_count may be a number or a string ("1,234"); effort_description is
// "34 efforts" style — take the first number either way.
function _llCount(ll){
  const m=String(ll.effort_count!=null?ll.effort_count:(ll.effort_description||'')).match(/\d[\d,]*/);
  return m?parseInt(m[0].replace(/,/g,''),10):null;
}

// Your efforts on a segment inside the Local Legend window (null on failure).
async function _llEfforts(id){
  const iso=t=>new Date(t).toISOString().slice(0,19)+'Z';
  const efs=await api(`/segments/${id}/all_efforts?start_date_local=${encodeURIComponent(iso(Date.now()-LL_DAYS*864e5))}&end_date_local=${encodeURIComponent(iso(Date.now()))}&per_page=200`);
  // all_efforts is the deprecated endpoint and may not honour the dates — keep the window here too
  const from=Date.now()-LL_DAYS*864e5;
  return Array.isArray(efs)?efs.filter(e=>Date.parse(e.start_date)>=from):null;
}

async function _llCheck(s, me){
  const det=await api(`/segments/${s.id}`);
  // the detail carries the full polyline too — keep it so the mini-map is free
  const poly=det&&det.map&&(det.map.polyline||det.map.summary_polyline);
  if(poly){ if(!_segPolyCache) _segPolyCache=_segPolyLoad(); if(!_segPolyCache[s.id]){ _segPolyCache[s.id]=poly; _segPolySave(); } }
  const ll=det&&det.local_legend, rec={ ts:Date.now(), name:s.name };
  if(!ll){ rec.none=true; return rec; }
  rec.theirs=_llCount(ll);
  if(String(ll.athlete_id)===String(me)){
    rec.mine=true; rec.yours=rec.theirs;
    const efs=await _llEfforts(s.id);
    if(efs) rec.dates=efs.map(e=>e.start_date).filter(Boolean).sort();
    return rec;
  }
  rec.holder=ll.title||'Someone';
  if(ll.athlete_id) rec.holder_id=String(ll.athlete_id);
  const efs=await _llEfforts(s.id);
  rec.yours=efs?efs.length:0;
  return rec;
}

/* How a crown holds up if you stop riding it: efforts that age out in the
   next 14 / 30 days, the count left after 30, and days since your last one. */
function _llRisk(r){
  const now=Date.now(), day=864e5;
  const out=r.dates.map(d=>Date.parse(d)+LL_DAYS*day).filter(t=>t>now);
  const drop=n=>out.filter(t=>t<now+n*day).length;
  const last=Math.max(...r.dates.map(d=>Date.parse(d)));
  const have=r.theirs!=null?r.theirs:out.length;
  return { have, drop14:drop(14), drop30:drop(30), left30:Math.max(0,have-drop(30)), idle:Math.floor((now-last)/day) };
}

function _segLegendBodyHTML(){
  const data=_llGet(), cand=_llCandidates();
  const recs=cand.map(s=>data[s.id]&&{id:s.id,...data[s.id],name:s.name}).filter(Boolean);
  const due=cand.filter(s=>_llDue(data[s.id])).length;
  const owner=_llOwner();
  let html='';
  if(!recs.length){
    html+=`<div class="tr-basis-note">${owner
      ? `See which segments you're the Local Legend on, and how many more efforts you need on the rest. Checks the ${cand.length} segments you've ridden in the last ${LL_DAYS} days.`
      : `Local Legends are checked on the owner's device (per-segment calls, and Strava's rate limit is shared).`}</div>`;
  }else{
    const mine=recs.filter(r=>r.mine).sort((a,b)=>(b.theirs||0)-(a.theirs||0));
    const chase=recs.filter(r=>!r.mine&&!r.none&&r.theirs!=null).map(r=>({...r,gap:r.theirs-r.yours+1}));
    // more efforts than the legend yet not the legend: Strava isn't counting yours
    // (private / hidden-from-leaderboard activities, flagged efforts) — "+1" would mislead
    const uncounted=chase.filter(r=>r.gap<=0).sort((a,b)=>(b.yours-b.theirs)-(a.yours-a.theirs));
    const close=chase.filter(r=>r.gap>0).sort((a,b)=>a.gap-b.gap).slice(0,10);
    const link=r=>`<a class="si-name" href="https://www.strava.com/segments/${r.id}" target="_blank" rel="noopener">${r.name}</a>`;
    // the legend's Strava profile (records checked before the id was kept show the name only)
    const who=r=>r.holder_id?`<a class="ll-who" href="https://www.strava.com/athletes/${r.holder_id}" target="_blank" rel="noopener">${r.holder}</a>`:r.holder;
    // one row per crown: your count, and — once the effort dates are known — what's
    // left of it in 30 days if you don't ride it again. Fewest left first.
    const crowns=mine.map(r=>r.dates&&r.dates.length?{...r,..._llRisk(r)}:r)
      .sort((a,b)=>(a.left30??Infinity)-(b.left30??Infinity)||(b.theirs||0)-(a.theirs||0));
    html+=`<div class="si-group"><div class="si-title">You're the Local Legend · ${mine.length}</div>${mine.length
      ? crowns.map(r=>r.left30!=null
        ? `<div class="si-row" title="${r.drop30} of your ${r.have} efforts age out in the next 30 days (${r.drop14} in 14). Ride it ${r.drop30}× in that time to hold ${r.have}.">${link(r)}<span class="si-meta">${r.have} → <b>${r.left30}</b> in 30d · last ${r.idle}d ago</span></div>`
        : `<div class="si-row">${link(r)}<span class="si-meta"><b>${r.theirs??'?'}</b> efforts / ${LL_DAYS}d</span></div>`).join('')
      : `<div class="tr-basis-note">Not on any of the segments checked so far.</div>`}</div>`;
    if(mine.length && !mine.some(r=>r.dates)) html+=`<div class="tr-basis-note">Check again to see which of your crowns are closest to being taken.</div>`;
    if(close.length) html+=`<div class="si-group"><div class="si-title">Closest to taking</div>${close.map(r=>
      `<div class="si-row">${link(r)}<span class="si-meta">${who(r)} ${r.theirs} vs you ${r.yours} · <b>+${r.gap}</b> effort${r.gap===1?'':'s'}</span></div>`).join('')}</div>`;
    if(uncounted.length) html+=`<div class="si-group"><div class="si-title">Ahead, but not counted · ${uncounted.length}</div>${uncounted.slice(0,10).map(r=>
      `<div class="si-row">${link(r)}<span class="si-meta">${who(r)} ${r.theirs} vs you ${r.yours}</span></div>`).join('')}
      <div class="tr-basis-note">You have more efforts here than the Local Legend, so Strava isn't counting some of yours — usually activities set to "Only you" or hidden from leaderboards, or flagged efforts. Making those activities visible is what would win these, not another ride.</div></div>`;
    html+=`<div class="tr-basis-note">${recs.length} of ${cand.length} segments ridden in the last ${LL_DAYS} days checked. "+N" = efforts in the next ${LL_DAYS} days to pass the current legend, if their count holds. "A → B in 30d" = your count once efforts older than ${LL_DAYS} days drop off, if you don't ride it again — Strava doesn't share the runner-up's count, so the lowest B is the easiest crown to lose.</div>`;
  }
  if(owner && due) html+=`<button class="seg-scan" id="segLegendBtn" style="margin-top:10px">${ic('crown')} ${recs.length?`Check ${Math.min(due,LL_MAX)} more`:'Check Local Legends'}</button>`;
  return html;
}

function segLegendPanelHTML(){
  if(!_llOwner() && !Object.keys(_llGet()).length) return '';
  return `<div class="card seg-ll">
    <div class="tr-chart-title">${ic('crown')} Local Legends <span class="gm-hint">most efforts in the last ${LL_DAYS} days</span></div>
    <div id="segLegendBody">${_segLegendBodyHTML()}</div>
  </div>`;
}
function wireSegLegend(){
  const b=document.getElementById('segLegendBtn'); if(b) b.onclick=()=>checkLocalLegends(b);
}

async function checkLocalLegends(btn){
  if(_llRunning || !_llOwner()) return;
  _llRunning=true;
  const data=_llGet(), me=localStorage.getItem('strava_athlete_id');
  // crowns missing effort dates first, so the at-risk list fills in quickly
  const pool=_llCandidates().filter(s=>_llDue(data[s.id]))
    .sort((a,b)=>!!(data[b.id]&&data[b.id].mine)-!!(data[a.id]&&data[a.id].mine)).slice(0,LL_MAX);
  let n=0, limited=false;
  for(const s of pool){
    if(btn){ btn.disabled=true; btn.textContent=`Checking… ${n+1}/${pool.length}`; }
    try{ data[s.id]=await _llCheck(s, me); }
    catch(e){ if(/ 429 /.test(' '+e.message+' ')){ limited=true; break; } }  // rate limit — keep what we got
    n++;
  }
  _llSave();
  _llRunning=false;
  if(limited) setStatus(`Checked ${n} segments — Strava's rate limit kicked in, try the rest in 15 minutes.`);
  // re-render from cache (no API) so the badges and filter chip pick it up
  if(typeof renderSegments==='function') renderSegments();
}

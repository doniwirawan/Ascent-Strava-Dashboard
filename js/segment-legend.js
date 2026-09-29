/* ── LOCAL LEGENDS ────────────────────────────────────────────────────────────
   Strava's /segments/{id} carries an (undocumented, like `xoms`) local_legend
   block: whoever has the most efforts on the segment in the last 90 days, and
   their count. For every segment you've ridden in that window we read it; where
   the legend isn't you, your own 90-day count comes from
   /segments/{id}/all_efforts, and the gap is what it takes to pass them.
   Up to two calls per segment on the app-shared rate limit, so — like Segment
   Intelligence — it's owner-only, on demand, capped per run and cached. */

const LL_KEY  = 'seg_legend_v1';
const LL_MAX  = 20;            // segments checked per run
const LL_TTL  = 12 * 3600e3;   // don't re-check a segment within this
const LL_DAYS = 90;            // Strava's Local Legend window

let _llData = null;   // {segId: {ts, name, mine, holder, theirs, yours, none}}
let _llRunning = false;
function _llGet(){
  if(!_llData){ try{ _llData=JSON.parse(localStorage.getItem(LL_KEY)||'null')||{}; }catch{ _llData={}; } }
  return _llData;
}
function _llSave(){ try{ localStorage.setItem(LL_KEY, JSON.stringify(_llData)); }catch{ /* quota — non-fatal */ } }
const _isLegendSeg = s => { const r=_llGet()[s.id]; return !!(r&&r.mine); };
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

async function _llCheck(s, me){
  const det=await api(`/segments/${s.id}`);
  // the detail carries the full polyline too — keep it so the mini-map is free
  const poly=det&&det.map&&(det.map.polyline||det.map.summary_polyline);
  if(poly){ if(!_segPolyCache) _segPolyCache=_segPolyLoad(); if(!_segPolyCache[s.id]){ _segPolyCache[s.id]=poly; _segPolySave(); } }
  const ll=det&&det.local_legend, rec={ ts:Date.now(), name:s.name };
  if(!ll){ rec.none=true; return rec; }
  rec.theirs=_llCount(ll);
  if(String(ll.athlete_id)===String(me)){ rec.mine=true; rec.yours=rec.theirs; return rec; }
  rec.holder=ll.title||'Someone';
  const iso=t=>new Date(t).toISOString().slice(0,19)+'Z';
  const efs=await api(`/segments/${s.id}/all_efforts?start_date_local=${encodeURIComponent(iso(Date.now()-LL_DAYS*864e5))}&end_date_local=${encodeURIComponent(iso(Date.now()))}&per_page=200`);
  rec.yours=Array.isArray(efs)?efs.length:0;
  return rec;
}

function _segLegendBodyHTML(){
  const data=_llGet(), cand=_llCandidates();
  const recs=cand.map(s=>data[s.id]&&{id:s.id,...data[s.id],name:s.name}).filter(Boolean);
  const due=cand.filter(s=>!(data[s.id]&&Date.now()-data[s.id].ts<LL_TTL)).length;
  const owner=_llOwner();
  let html='';
  if(!recs.length){
    html+=`<div class="tr-basis-note">${owner
      ? `See which segments you're the Local Legend on, and how many more efforts you need on the rest. Checks the ${cand.length} segments you've ridden in the last ${LL_DAYS} days.`
      : `Local Legends are checked on the owner's device (per-segment calls, and Strava's rate limit is shared).`}</div>`;
  }else{
    const mine=recs.filter(r=>r.mine).sort((a,b)=>(b.theirs||0)-(a.theirs||0));
    const chase=recs.filter(r=>!r.mine&&!r.none&&r.theirs!=null)
      .map(r=>({...r,gap:Math.max(1,r.theirs-r.yours+1)})).sort((a,b)=>a.gap-b.gap).slice(0,10);
    const link=r=>`<a class="si-name" href="https://www.strava.com/segments/${r.id}" target="_blank" rel="noopener">${r.name}</a>`;
    html+=`<div class="si-group"><div class="si-title">You're the Local Legend · ${mine.length}</div>${mine.length
      ? mine.map(r=>`<div class="si-row">${link(r)}<span class="si-meta"><b>${r.theirs??'?'}</b> efforts / ${LL_DAYS}d</span></div>`).join('')
      : `<div class="tr-basis-note">Not on any of the segments checked so far.</div>`}</div>`;
    if(chase.length) html+=`<div class="si-group"><div class="si-title">Closest to taking</div>${chase.map(r=>
      `<div class="si-row">${link(r)}<span class="si-meta">${r.holder} ${r.theirs} vs you ${r.yours} · <b>+${r.gap}</b> effort${r.gap===1?'':'s'}</span></div>`).join('')}</div>`;
    html+=`<div class="tr-basis-note">${recs.length} of ${cand.length} segments ridden in the last ${LL_DAYS} days checked. "+N" = efforts in the next ${LL_DAYS} days to pass the current legend, if their count holds.</div>`;
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
  const pool=_llCandidates().filter(s=>!(data[s.id]&&Date.now()-data[s.id].ts<LL_TTL)).slice(0,LL_MAX);
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

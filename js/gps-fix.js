/* ── GPS FIX & SPEED NORMALIZATION ──
   Shared track-smoothing + speed-spike interpolation (used by the heatmap,
   the activity detail map, and the speed stream chart), a standalone GPX
   upload/fix/download tool, and a list of activities with abnormal speeds.
   The speed ceiling reuses MAX_SPEED_CEILING (65 km/h, m/s) from utils.js. */

// median of a numeric array (NaN/null ignored)
function _gfMedian(arr){
  const v=arr.filter(x=>x!=null&&!isNaN(x)).sort((a,b)=>a-b);
  if(!v.length) return 0;
  const m=v.length>>1;
  return v.length%2 ? v[m] : (v[m-1]+v[m])/2;
}

// great-circle distance between two lat/lng points, in metres
function _gfHaversine(aLat,aLon,bLat,bLon){
  const R=6371000, toR=Math.PI/180;
  const dLat=(bLat-aLat)*toR, dLon=(bLon-aLon)*toR;
  const s=Math.sin(dLat/2)**2 + Math.cos(aLat*toR)*Math.cos(bLat*toR)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

// Centered moving-average smoothing of [lat,lng] points. Endpoints stay put
// thanks to the shrinking window; the small default window keeps route shape.
function smoothTrack(points, win){
  win = win==null ? 2 : win;
  if(!points || points.length<3) return (points||[]).slice();
  const out=[];
  for(let i=0;i<points.length;i++){
    let sa=0,sb=0,n=0;
    for(let j=Math.max(0,i-win); j<=Math.min(points.length-1,i+win); j++){
      sa+=points[j][0]; sb+=points[j][1]; n++;
    }
    out.push([sa/n, sb/n]);
  }
  return out;
}

// Replace abnormal speed samples (m/s) with a value interpolated from the
// nearest good neighbours. A sample is "bad" if non-positive/NaN, above
// `ceiling`, or a statistical outlier (median + k·MAD). Returns {data,fixed}.
function fixSpeedSpikes(speeds, opts){
  opts = opts || {};
  const ceiling = opts.ceiling;                 // m/s hard cap (optional)
  const k = opts.k==null ? 5 : opts.k;
  const out = (speeds||[]).slice();
  const good = out.filter(v=>v>0 && isFinite(v));
  if(good.length<2) return {data:out, fixed:0};
  const med = _gfMedian(good);
  const mad = _gfMedian(good.map(v=>Math.abs(v-med)));
  const thr = med + k*(mad || med*0.5 || 1);
  const bad = v => !(v>0) || !isFinite(v) || (ceiling && v>ceiling) || v>thr;
  let fixed=0;
  for(let i=0;i<out.length;i++){
    if(!bad(speeds[i])) continue;
    let l=i-1; while(l>=0 && bad(speeds[l])) l--;
    let r=i+1; while(r<speeds.length && bad(speeds[r])) r++;
    const lv = l>=0 ? out[l] : null;            // left already fixed
    const rv = r<speeds.length ? speeds[r] : null;
    out[i] = (lv!=null && rv!=null) ? (lv+rv)/2 : (lv!=null ? lv : (rv!=null ? rv : med));
    fixed++;
  }
  return {data:out, fixed};
}

/* ── GPX FILE TOOL ── */

// parse GPX text → {doc, nodes:[trkpt elements], pts:[{lat,lon,time}]}
function _gfParseGpx(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('Invalid GPX / XML file.');
  const nodes=[], pts=[];
  doc.querySelectorAll('trkpt').forEach(tp=>{
    const lat=parseFloat(tp.getAttribute('lat'));
    const lon=parseFloat(tp.getAttribute('lon'));
    if(isNaN(lat)||isNaN(lon)) return;
    const timeEl=tp.querySelector('time');
    nodes.push(tp);
    pts.push({lat, lon, time: timeEl ? new Date(timeEl.textContent) : null});
  });
  return {doc, nodes, pts};
}

// In-place fix of a parsed pts array. Returns {smoothed, speedFixed}.
function _gfFixTrack(pts, opts){
  opts=opts||{};
  const ceiling = opts.ceiling==null ? MAX_SPEED_CEILING : opts.ceiling; // m/s
  let speedFixed=0;
  // 1) speed-glitch fix — reposition points whose implied speed exceeds ceiling
  if(opts.fixSpeed!==false){
    for(let i=1;i<pts.length-1;i++){
      const p0=pts[i-1], p1=pts[i], p2=pts[i+1];
      let sp;
      if(p0.time && p1.time && !isNaN(p0.time) && !isNaN(p1.time)){
        const dt=(p1.time-p0.time)/1000;
        sp = dt>0 ? _gfHaversine(p0.lat,p0.lon,p1.lat,p1.lon)/dt : Infinity;
      } else {
        // no timestamps — flag a point that detours far off the p0→p2 line
        const d1=_gfHaversine(p0.lat,p0.lon,p1.lat,p1.lon);
        const d2=_gfHaversine(p1.lat,p1.lon,p2.lat,p2.lon);
        const dd=_gfHaversine(p0.lat,p0.lon,p2.lat,p2.lon);
        sp = (d1+d2) > dd*4+10 ? Infinity : 0;
      }
      if(sp>ceiling){
        let f=0.5;
        if(p0.time && p2.time){ const span=p2.time-p0.time; if(span>0) f=(p1.time-p0.time)/span; }
        p1.lat = p0.lat + (p2.lat-p0.lat)*f;
        p1.lon = p0.lon + (p2.lon-p0.lon)*f;
        speedFixed++;
      }
    }
  }
  // 2) GPS smoothing
  let smoothed=0;
  if(opts.smooth!==false){
    const sm=smoothTrack(pts.map(p=>[p.lat,p.lon]), opts.win);
    for(let i=0;i<pts.length;i++){
      if(pts[i].lat!==sm[i][0]||pts[i].lon!==sm[i][1]) smoothed++;
      pts[i].lat=sm[i][0]; pts[i].lon=sm[i][1];
    }
  }
  return {smoothed, speedFixed};
}

// write fixed coords back into the trkpt elements and serialize the whole doc
function _gfSerialize(doc, nodes, pts){
  for(let i=0;i<nodes.length;i++){
    nodes[i].setAttribute('lat', pts[i].lat.toFixed(7));
    nodes[i].setAttribute('lon', pts[i].lon.toFixed(7));
  }
  return new XMLSerializer().serializeToString(doc);
}

function _gfDownload(text, name){
  const blob=new Blob([text],{type:'application/gpx+xml'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function runGpxFix(){
  const res=document.getElementById('gpxResult');
  const f=document.getElementById('gpxFile').files[0];
  if(!f){ res.innerHTML='<div class="gpx-err">Choose a .gpx file first.</div>'; return; }
  let parsed;
  try{ parsed=_gfParseGpx(await f.text()); }
  catch(e){ res.innerHTML='<div class="gpx-err">'+e.message+'</div>'; return; }
  if(!parsed.pts.length){ res.innerHTML='<div class="gpx-err">No track points found in this GPX.</div>'; return; }

  const before = parsed.pts.map(p=>[p.lat,p.lon]);
  const ceiling = (parseFloat(document.getElementById('gpxCeiling').value)||65)/3.6;
  const r=_gfFixTrack(parsed.pts, {
    smooth:   document.getElementById('gpxSmooth').checked,
    fixSpeed: document.getElementById('gpxFixSpeed').checked,
    ceiling
  });
  const out=_gfSerialize(parsed.doc, parsed.nodes, parsed.pts);
  const name=f.name.replace(/\.gpx$/i,'')+'-fixed.gpx';
  _gfDownload(out, name);
  res.innerHTML=`<div class="gpx-ok">Normalized <b>${r.speedFixed}</b> speed spike(s) and smoothed <b>${r.smoothed}</b> point(s). Downloaded <b>${name}</b>.</div>`;
  _gfPreview(before, parsed.pts.map(p=>[p.lat,p.lon]));
}

let _gfMapBefore=null, _gfMapAfter=null;
function _gfPreview(before, after){
  const wrap=document.getElementById('gpxPreview');
  if(!wrap || !window.L) return;
  wrap.innerHTML=`<div class="gpx-maps">
    <div><div class="gpx-map-lbl">Before</div><div id="gpxMapBefore" class="gpx-map"></div></div>
    <div><div class="gpx-map-lbl">After (fixed)</div><div id="gpxMapAfter" class="gpx-map"></div></div>
  </div>`;
  if(_gfMapBefore){try{_gfMapBefore.remove()}catch{} _gfMapBefore=null;}
  if(_gfMapAfter){try{_gfMapAfter.remove()}catch{} _gfMapAfter=null;}
  const mk=(id,pts,color)=>{
    if(pts.length<2) return null;
    const m=L.map(id,{zoomControl:false,attributionControl:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd'}).addTo(m);
    const line=L.polyline(pts,{color,weight:2.5,opacity:.95}).addTo(m);
    m.fitBounds(line.getBounds(),{padding:[12,12]});
    setTimeout(()=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[12,12]});}catch{}},200);
    return m;
  };
  _gfMapBefore=mk('gpxMapBefore',before,'#f87171');
  _gfMapAfter =mk('gpxMapAfter', after, '#4ade80');
}

/* ── ABNORMAL-SPEED ACTIVITY LIST ── */
// Persisted corrected max speeds (m/s), keyed by activity id. A normalized
// activity replaces its glitchy summary max_speed with the value derived from
// its spike-interpolated speed stream, so every view stays consistent.
const _MAXFIX_KEY='strava_maxfix';
function _loadMaxFix(){ try{ return JSON.parse(localStorage.getItem(_MAXFIX_KEY))||{}; }catch{ return {}; } }
function _saveMaxFix(m){ try{ localStorage.setItem(_MAXFIX_KEY, JSON.stringify(m)); }catch{} }
// re-apply saved corrections onto the in-memory acts (run on every data render)
function applyMaxFixOverrides(){
  const m=_loadMaxFix(); if(!m || !Object.keys(m).length) return;
  (acts||[]).forEach(a=>{ if(m[a.id]!=null) a.max_speed=m[a.id]; });
}

let _anomMsg='';
let _fixedGpx=[];   // staged corrected files: {id, name, dateStr, filename, text, status}
function renderSpeedAnomalies(){
  const el=document.getElementById('speedAnomalyList');
  if(!el) return;
  applyMaxFixOverrides();
  const bad=(acts||[]).filter(a=>a.max_speed>MAX_SPEED_CEILING).sort((a,b)=>b.max_speed-a.max_speed);
  const banner = _anomMsg ? `<div class="gpx-ok">${_anomMsg}</div>` : '';
  _anomMsg='';
  if(!bad.length){ el.innerHTML=banner+'<div class="gpx-empty">No activities with abnormal speed 🎉</div>'; return; }
  el.innerHTML= banner + _stagingHtml() +
    `<div class="gpx-anom-bar">
       <label class="gpx-opt"><input type="checkbox" id="anomAll" onchange="_anomToggleAll(this.checked)"> Select all</label>
       <label class="gpx-opt"><input type="checkbox" id="anomStrava" checked> Note the fix on Strava</label>
       <button class="btn btn-primary gpx-anom-btn" type="button" onclick="normalizeSelected()">Normalize selected</button>
       <button class="btn gpx-anom-btn2" type="button" onclick="prepareFixedGpx()">Prepare fixed files (selected)</button>
     </div>
     <div class="gpx-anom-note">${bad.length} activit${bad.length===1?'y':'ies'} with a max speed above 65 km/h — tick and normalize, or tap a row to inspect.</div>
     <details class="gpx-swap"><summary>Replace on Strava (delete + re-upload the fixed file)</summary>
       <ol class="gpx-swap-steps">
         <li><b>Prepare fixed files (selected)</b> — I fetch each track, smooth it, normalize the speed, keep the original timestamps (same date), and stage the fixed files on this page.</li>
         <li>Use the <b>↗</b> link on each row to open it on Strava, then delete it there (the API can't delete for you).</li>
         <li>Back here, hit <b>Upload all to Strava</b> to re-upload every staged file at once.</li>
       </ol>
       <div class="gpx-swap-warn">⚠ Re-uploading creates new activities — kudos, comments and achievements on the originals are lost. Delete the originals first or you'll get duplicates.</div>
     </details>`
    + bad.map(a=>`<div class="gpx-anom">
        <input type="checkbox" class="anom-cb" value="${a.id}">
        <div class="gpx-anom-body" role="button" tabindex="0"
          onclick="openActivityModal('${a.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openActivityModal('${a.id}')}">
          <div class="gpx-anom-main">
            <span class="gpx-anom-name">${a.name||'Activity'}</span>
            <span class="gpx-anom-date">${fmtDt(a.start_date)}</span>
          </div>
          <span class="gpx-anom-spd">${kmh(a.max_speed).toFixed(1)} ${speedUnit()}</span>
        </div>
        <a class="gpx-anom-strava" href="https://www.strava.com/activities/${a.id}" target="_blank" rel="noopener" title="Open on Strava to delete" onclick="event.stopPropagation()">↗</a>
      </div>`).join('');
}

function _anomToggleAll(on){
  document.querySelectorAll('#speedAnomalyList .anom-cb').forEach(cb=>{cb.checked=on;});
}

// Strava's API can't edit max_speed, so we append a note to the activity's
// description instead. Idempotent: any prior note line is stripped first.
const _SPEED_NOTE_TAG='⚠️ GPS glitch:';
async function _pushSpeedNoteToStrava(id, rawMs, correctedMs){
  let detail;
  try{ detail=await api('/activities/'+id); }catch{ return false; }
  const note=`${_SPEED_NOTE_TAG} recorded max ${kmh(rawMs).toFixed(1)} ${speedUnit()} → real max ≈ ${kmh(correctedMs).toFixed(1)} ${speedUnit()} (normalized in dashboard)`;
  let desc=(detail && detail.description) || '';
  desc=desc.split('\n').filter(l=>l.indexOf(_SPEED_NOTE_TAG)===-1).join('\n').replace(/\s+$/,'');
  const newDesc=desc ? desc+'\n\n'+note : note;
  try{ await apiPut('/activities/'+id, {description:newDesc}); return true; }
  catch{ return false; }
}

async function normalizeSelected(){
  const ids=[...document.querySelectorAll('#speedAnomalyList .anom-cb:checked')].map(cb=>cb.value);
  if(!ids.length){ _anomMsg='Tick at least one activity to normalize.'; renderSpeedAnomalies(); return; }
  const toStrava = !!(document.getElementById('anomStrava') && document.getElementById('anomStrava').checked);
  if(toStrava && !confirm(`Add a GPS-glitch note to the Strava description of ${ids.length} activit${ids.length===1?'y':'ies'}?\nThis only edits the description text — the activity, its date, kudos and comments stay untouched.`)) return;
  const btn=document.querySelector('.gpx-anom-btn');
  if(btn){ btn.disabled=true; btn.textContent=`Normalizing 0/${ids.length}…`; }
  const map=_loadMaxFix();
  let done=0, failed=0, noted=0, noteFail=0;
  for(let i=0;i<ids.length;i++){
    const id=ids[i];
    try{
      const a=(acts||[]).find(x=>String(x.id)===String(id));
      const rawMs=a?a.max_speed:0;                     // glitch value, before override
      const s=await _getActivityStreams(id);           // speed stream is already spike-interpolated
      const corrected=s && s.series && s.series.speed && s.series.speed.max;
      if(corrected>0){
        map[id]=corrected;
        if(a) a.max_speed=corrected;
        done++;
        if(toStrava){ if(await _pushSpeedNoteToStrava(id, rawMs, corrected)) noted++; else noteFail++; }
      } else failed++;
    }catch{ failed++; }
    if(btn) btn.textContent=`Normalizing ${i+1}/${ids.length}…`;
  }
  _saveMaxFix(map);
  // refresh dependent, max-speed-driven views
  ['renderStats','renderCycling','renderBestEfforts','renderMilestones'].forEach(fn=>{try{ if(typeof window[fn]==='function') window[fn](); }catch{}});
  _anomMsg=`Normalized ${done} activit${done===1?'y':'ies'}.`
    + (toStrava?` Annotated ${noted} on Strava${noteFail?` (${noteFail} failed — may need reconnect for write access)`:''}.`:'')
    + (failed?` ${failed} had no usable speed stream.`:'');
  renderSpeedAnomalies();
}

/* ── FIXED-GPX EXPORT (for delete + re-upload on Strava) ── */
const _gfSleep = ms => new Promise(r=>setTimeout(r,ms));
function _gfXmlEsc(s){ return String(s).replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c])); }

// build a corrected GPX string for one activity (null if it has no GPS track)
async function _buildFixedGpx(a){
  const raw = await api(`/activities/${a.id}/streams?keys=latlng,time,altitude,heartrate,cadence,temp&key_by_type=true`);
  const ll = raw.latlng && raw.latlng.data;
  if(!ll || ll.length<2) return null;
  const tm = raw.time && raw.time.data;                    // seconds from start
  const alt= raw.altitude && raw.altitude.data;
  const hr = raw.heartrate && raw.heartrate.data;
  const cad= raw.cadence && raw.cadence.data;
  const temp=raw.temp && raw.temp.data;
  const start = new Date(a.start_date).getTime();
  const pts = ll.map((p,i)=>({lat:p[0], lon:p[1], time: tm ? new Date(start + tm[i]*1000) : null}));
  _gfFixTrack(pts, {smooth:true, fixSpeed:true, ceiling:MAX_SPEED_CEILING});

  const trkpts = pts.map((p,i)=>{
    const ele = alt && alt[i]!=null ? `<ele>${(+alt[i]).toFixed(1)}</ele>` : '';
    const tt  = p.time ? `<time>${p.time.toISOString()}</time>` : '';
    let ext='';
    const hrv = hr  && hr[i]!=null  ? `<gpxtpx:hr>${Math.round(hr[i])}</gpxtpx:hr>` : '';
    const cav = cad && cad[i]!=null ? `<gpxtpx:cad>${Math.round(cad[i])}</gpxtpx:cad>` : '';
    const tpv = temp&& temp[i]!=null? `<gpxtpx:atemp>${Math.round(temp[i])}</gpxtpx:atemp>` : '';
    if(hrv||cav||tpv) ext=`<extensions><gpxtpx:TrackPointExtension>${hrv}${cav}${tpv}</gpxtpx:TrackPointExtension></extensions>`;
    return `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}${tt}${ext}</trkpt>`;
  }).join('');

  const text = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ascent Dashboard" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>${new Date(start).toISOString()}</time></metadata>
 <trk><name>${_gfXmlEsc(a.name||'Activity')}</name><trkseg>${trkpts}</trkseg></trk>
</gpx>`;
  const stamp = new Date(a.start_date).toISOString().slice(0,10);
  const safe = (a.name||'activity').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'activity';
  return { text, name:`${safe}-${stamp}-fixed.gpx` };
}

// staged-files panel, shown at the top of the section once files are prepared
function _stagingHtml(){
  if(!_fixedGpx.length) return '';
  const rows=_fixedGpx.map((f,i)=>`<div class="gpx-staged-row">
      <span class="gpx-staged-name" title="${_gfXmlEsc(f.name)}">${_gfXmlEsc(f.name)}</span>
      <span class="gpx-staged-date">${f.dateStr}</span>
      <span class="gpx-staged-status ${f.status==='uploaded ✓'?'ok':(String(f.status).indexOf('fail')>-1||String(f.status).indexOf('error')>-1?'err':'')}" id="gpxup-${i}">${f.status}</span>
      <a class="gpx-anom-strava" href="https://www.strava.com/activities/${f.id}" target="_blank" rel="noopener" title="Open original on Strava to delete">↗</a>
      <button class="gpx-staged-x" type="button" onclick="removeFixed(${i})" title="Remove from list">✕</button>
    </div>`).join('');
  return `<div class="gpx-staged">
    <div class="gpx-staged-head">
      <span><b>${_fixedGpx.length}</b> fixed file${_fixedGpx.length===1?'':'s'} staged</span>
      <span class="gpx-staged-actions">
        <button class="btn btn-primary gpx-upload-btn" type="button" onclick="uploadFixedAll()">Upload all to Strava</button>
        <button class="btn" type="button" onclick="clearFixed()">Clear</button>
      </span>
    </div>
    ${rows}
    <div class="gpx-swap-warn">Delete each original on Strava (↗) before uploading, or you'll have duplicates.</div>
  </div>`;
}

// process selected activities into staged corrected GPX (kept in-page, not downloaded)
async function prepareFixedGpx(){
  const ids=[...document.querySelectorAll('#speedAnomalyList .anom-cb:checked')].map(cb=>cb.value);
  if(!ids.length){ _anomMsg='Tick at least one activity to prepare.'; renderSpeedAnomalies(); return; }
  const btn=document.querySelector('.gpx-anom-btn2');
  const label=btn?btn.textContent:''; if(btn) btn.disabled=true;
  let ok=0, fail=0, skip=0;
  for(let i=0;i<ids.length;i++){
    const id=ids[i];
    if(_fixedGpx.some(f=>String(f.id)===String(id))){ skip++; continue; }
    if(btn) btn.textContent=`Preparing ${i+1}/${ids.length}…`;
    const a=(acts||[]).find(x=>String(x.id)===String(id));
    if(!a){ fail++; continue; }
    try{
      const gpx=await _buildFixedGpx(a);
      if(gpx){ _fixedGpx.push({id, name:a.name||'Activity', dateStr:fmtDt(a.start_date), filename:gpx.name, text:gpx.text, status:'ready'}); ok++; }
      else fail++;
    }catch{ fail++; }
  }
  if(btn){ btn.disabled=false; btn.textContent=label; }
  _anomMsg=`Staged ${ok} fixed file${ok===1?'':'s'}.`+(skip?` ${skip} already staged.`:'')+(fail?` ${fail} had no GPS track.`:'')+' Delete the originals on Strava, then Upload all.';
  renderSpeedAnomalies();
}

function removeFixed(i){ _fixedGpx.splice(i,1); renderSpeedAnomalies(); }
function clearFixed(){ _fixedGpx=[]; renderSpeedAnomalies(); }

// multipart upload of a GPX to Strava's uploads endpoint (needs activity:write)
async function _gfStravaUpload(text, filename, name){
  const post=()=>{
    const form=new FormData();
    form.append('file', new Blob([text],{type:'application/gpx+xml'}), filename);
    form.append('data_type','gpx');
    if(name) form.append('name', name);
    return fetch('https://www.strava.com/api/v3/uploads',{method:'POST',headers:{Authorization:'Bearer '+CONFIG.accessToken},body:form});
  };
  let r=await post();
  if(r.status===401 && typeof doRefresh==='function'){ await doRefresh(); r=await post(); }
  if(!r.ok) throw new Error('upload '+r.status);
  return r.json();                         // {id, status, error, activity_id}
}
// poll an upload until Strava turns it into an activity (or errors)
async function _gfPollUpload(uploadId){
  for(let i=0;i<12;i++){
    await _gfSleep(2000);
    let u; try{ u=await api('/uploads/'+uploadId); }catch{ continue; }
    if(u.error) throw new Error(u.error);
    if(u.activity_id) return u.activity_id;
  }
  return null;                              // still processing on Strava's side
}
function _setUpStatus(i,txt){
  _fixedGpx[i].status=txt;
  const el=document.getElementById('gpxup-'+i);
  if(el){ el.textContent=txt; el.className='gpx-staged-status '+(txt.indexOf('✓')>-1?'ok':(txt.indexOf('fail')>-1||txt.indexOf('error')>-1?'err':'')); }
}

async function uploadFixedAll(){
  const pending=_fixedGpx.filter(f=>f.status!=='uploaded ✓');
  if(!pending.length){ _anomMsg='Nothing to upload.'; renderSpeedAnomalies(); return; }
  if(!confirm(`Upload ${pending.length} fixed file${pending.length===1?'':'s'} to Strava as new activities?\nMake sure you've already deleted the originals, or you'll get duplicates.`)) return;
  const btn=document.querySelector('.gpx-upload-btn'); if(btn) btn.disabled=true;
  let ok=0, fail=0;
  for(let i=0;i<_fixedGpx.length;i++){
    const f=_fixedGpx[i];
    if(f.status==='uploaded ✓') continue;
    _setUpStatus(i,'uploading…');
    try{
      const up=await _gfStravaUpload(f.text, f.filename, f.name);
      let actId=null;
      try{ actId=await _gfPollUpload(up.id); }
      catch(e){ _setUpStatus(i,'error: '+(e.message||e)); fail++; continue; }
      _setUpStatus(i, actId?'uploaded ✓':'processing…'); ok++;
    }catch(e){ _setUpStatus(i, (e && /40[13]/.test(e.message))?'failed — reconnect Strava':'failed'); fail++; }
    await _gfSleep(400);
  }
  if(btn) btn.disabled=false;
  _anomMsg=`Uploaded ${ok} file${ok===1?'':'s'} to Strava.`+(fail?` ${fail} failed.`:'')+' New activities may take a moment to appear.';
  renderSpeedAnomalies();
}

// render the Fix section on first open (called from navScrollTo)
function renderFixSection(){
  renderSpeedAnomalies();
}

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
function renderSpeedAnomalies(){
  const el=document.getElementById('speedAnomalyList');
  if(!el) return;
  const bad=(acts||[]).filter(a=>a.max_speed>MAX_SPEED_CEILING).sort((a,b)=>b.max_speed-a.max_speed);
  if(!bad.length){ el.innerHTML='<div class="gpx-empty">No activities with abnormal speed 🎉</div>'; return; }
  el.innerHTML='<div class="gpx-anom-note">'+bad.length+' activit'+(bad.length===1?'y':'ies')+' with a max speed above 65 km/h — tap one to inspect.</div>'
    + bad.map(a=>`<div class="gpx-anom" role="button" tabindex="0"
        onclick="openActivityModal('${a.id}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openActivityModal('${a.id}')}">
        <div class="gpx-anom-main">
          <span class="gpx-anom-name">${a.name||'Activity'}</span>
          <span class="gpx-anom-date">${fmtDt(a.start_date)}</span>
        </div>
        <span class="gpx-anom-spd">${kmh(a.max_speed).toFixed(1)} ${speedUnit()}</span>
      </div>`).join('');
}

// render the Fix section on first open (called from navScrollTo)
function renderFixSection(){
  renderSpeedAnomalies();
}

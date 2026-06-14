function drawStoryCanvas(){
  const canvas=document.getElementById('storyCanvas');
  const idx=parseInt(document.getElementById('activityPicker').value)||0;
  const act=acts[idx]||{};
  const selected=STAT_DEFS.filter(s=>checkedStats.has(s.key)&&statApplies(s,act));
  drawLayout(canvas,act,selected,getScheme(),activeLayout);
  // also redraw all layout thumbnails
  document.querySelectorAll('.layout-thumb').forEach(c=>{
    const sc=getScheme(),miniAct={...act};
    const miniSel=selected.slice(0,4);
    drawLayout(c,miniAct,miniSel,sc,c.dataset.layout);
  });
  // custom layout: show the drag hint and make the canvas feel draggable
  const hint=document.getElementById('storyHint');
  const isCustom=activeLayout==='custom';
  if(hint) hint.style.display=isCustom?'':'none';
  canvas.style.cursor=isCustom?'grab':'';
}

// ── custom-layout editing helpers ──
function _customElPos(id){
  if(id==='title') return customPos.title;
  if(id==='date')  return customPos.date;
  if(id==='logo')  return customPos.logo;
  if(id==='route') return customPos.route;
  if(id.startsWith('stat:')) return customPos.stats[id.slice(5)];
  return null;
}
const _customClamp=(v,min,max)=>Math.min(max,Math.max(min,v));
// shrink an uploaded image so it fits in localStorage (max dim px, JPEG)
function _downscaleDataURL(img,maxDim){
  const scale=Math.min(1, maxDim/Math.max(img.naturalWidth||img.width, img.naturalHeight||img.height));
  const w=Math.round((img.naturalWidth||img.width)*scale), h=Math.round((img.naturalHeight||img.height)*scale);
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  c.getContext('2d').drawImage(img,0,0,w,h);
  return c.toDataURL('image/jpeg',0.85);
}
function _customScale(id,factor){
  if(id==='route'){ const r=customPos.route; r.w=_customClamp(r.w*factor,0.05,1.8); r.h=_customClamp(r.h*factor,0.04,1.8); }
  else { const p=_customElPos(id); if(p) p.s=_customClamp((p.s||1)*factor,0.15,5); }
}
function _customFlip(id,axis){ const p=_customElPos(id); if(!p) return; if(axis==='x') p.fx=!p.fx; else p.fy=!p.fy; }

// Figma-style snapping: align dragged element's edges/centre to the canvas and
// to other elements, plus equal-spacing between two neighbours (with distance
// guides). Mutates positions and sets window._customGuides.
function _customSnap(drag,canvas){
  const W=canvas.width,H=canvas.height,clamp=v=>Math.min(1,Math.max(0,v));
  const items=drag.items;
  if(!items||!items.length){ window._customGuides=null; return; }
  // group bounding box (canvas px) from each item's centre + half-extents — so a
  // multi-element selection snaps as a single unit on both axes
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  items.forEach(it=>{ const ex=(it.bw||0)/2, ey=(it.bh||0)/2, ix=it.pos.x*W, iy=it.pos.y*H; minX=Math.min(minX,ix-ex); maxX=Math.max(maxX,ix+ex); minY=Math.min(minY,iy-ey); maxY=Math.max(maxY,iy+ey); });
  const bw=maxX-minX, bh=maxY-minY;
  let cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const others=(window._customHits||[]).filter(h=>!customSel.has(h.id));
  const TH=22; // snap distance in canvas px

  // alignment lines (canvas + every other element's edges/centre)
  const xLines=[0,W/2,W], yLines=[0,H/2,H];
  others.forEach(h=>{ xLines.push(h.x,h.x+h.w/2,h.x+h.w); yLines.push(h.y,h.y+h.h/2,h.y+h.h); });
  // equal-spacing pairs the dragged element can sit between
  const vov=others.filter(h=> !(h.y>cy+bh/2 || h.y+h.h<cy-bh/2)), spX=[];
  for(const L of vov) for(const R of vov){ if(L===R) continue; const Lr=L.x+L.w, Rl=R.x; if(Lr<Rl) spX.push({c:(Lr+Rl)/2,L,R}); }
  const hov=others.filter(h=> !(h.x>cx+bw/2 || h.x+h.w<cx-bw/2)), spY=[];
  for(const T of hov) for(const B of hov){ if(T===B) continue; const Tb=T.y+T.h, Bt=B.y; if(Tb<Bt) spY.push({c:(Tb+Bt)/2,T,B}); }

  const xa=[cx-bw/2,cx,cx+bw/2], ya=[cy-bh/2,cy,cy+bh/2];
  let bx=null; xa.forEach(a=>xLines.forEach(l=>{const d=Math.abs(a-l); if(d<(bx?bx.d:TH)) bx={d,line:l,center:cx+(l-a),sp:null};}));
  spX.forEach(s=>{ const d=Math.abs(cx-s.c); if(d<(bx?bx.d:TH)) bx={d,center:s.c,sp:s}; });
  let by=null; ya.forEach(a=>yLines.forEach(l=>{const d=Math.abs(a-l); if(d<(by?by.d:TH)) by={d,line:l,center:cy+(l-a),sp:null};}));
  spY.forEach(s=>{ const d=Math.abs(cy-s.c); if(d<(by?by.d:TH)) by={d,center:s.c,sp:s}; });

  if(bx){ const off=(bx.center-cx)/W; drag.items.forEach(it=>it.pos.x=clamp(it.pos.x+off)); cx=bx.center; }
  if(by){ const off=(by.center-cy)/H; drag.items.forEach(it=>it.pos.y=clamp(it.pos.y+off)); cy=by.center; }

  const guides=[];
  if(bx){ if(bx.sp){ const {L,R}=bx.sp, y=cy; guides.push({seg:[L.x+L.w,y,cx-bw/2,y]},{seg:[cx+bw/2,y,R.x,y]}); } else guides.push({v:bx.line}); }
  if(by){ if(by.sp){ const {T,B}=by.sp, x=cx; guides.push({seg:[x,T.y+T.h,x,cy-bh/2]},{seg:[x,cy+bh/2,x,B.y]}); } else guides.push({h:by.line}); }
  window._customGuides=guides.length?guides:null;
}
function _customSyncHideChecks(){
  [['chk-hideTitle',hideTitle],['chk-hideDate',hideDate],['chk-hideRoute',hideRoute],['chk-hideLogo',hideLogo]].forEach(([id,v])=>{
    const cb=document.getElementById(id); if(cb) cb.checked=v;
    const lbl=document.getElementById(id.replace('chk-','lbl-')); if(lbl) lbl.style.borderColor=v?'var(--orange)':'var(--border)';
  });
}
function _customHide(id){
  if(id==='title') hideTitle=true;
  else if(id==='date') hideDate=true;
  else if(id==='route') hideRoute=true;
  else if(id==='logo') hideLogo=true;
  else if(id.startsWith('stat:')){ const k=id.slice(5); checkedStats.delete(k); const lbl=document.getElementById('lbl-'+k); if(lbl){ lbl.style.borderColor='var(--border)'; const cb=lbl.querySelector('input'); if(cb) cb.checked=false; } }
  _customSyncHideChecks(); customSel.delete(id); saveStorySettings();
}
function _customResetOne(id){
  const def=_defaultCustomPos();
  if(id==='title') customPos.title={...def.title};
  else if(id==='date') customPos.date={...def.date};
  else if(id==='route') customPos.route={...def.route};
  else if(id==='logo') customPos.logo={...def.logo};
  else if(id.startsWith('stat:')) delete customPos.stats[id.slice(5)];
  saveCustomPos();
}
let _customMenuEl=null, _customSizeBuf=null;
function _customContextMenu(clientX,clientY,id){
  if(!_customMenuEl){ _customMenuEl=document.createElement('div'); _customMenuEl.className='ctx-menu'; document.body.appendChild(_customMenuEl);
    document.addEventListener('pointerdown',ev=>{ if(_customMenuEl&&!_customMenuEl.contains(ev.target)) _customMenuEl.style.display='none'; }); }
  const group=()=> (customSel.has(id)&&customSel.size>1)?[...customSel]:[id];
  const items=[
    {label:'Hide', fn:()=>{ group().forEach(_customHide); drawStoryCanvas(); }},
    {label:'Bigger', fn:()=>{ group().forEach(x=>_customScale(x,1.12)); saveCustomPos(); drawStoryCanvas(); }},
    {label:'Smaller', fn:()=>{ group().forEach(x=>_customScale(x,1/1.12)); saveCustomPos(); drawStoryCanvas(); }},
    // flip is only meaningful for the route map (mirroring text reads backwards)
    ...(id==='route' ? [
      {label:'Flip horizontal', fn:()=>{ _customFlip('route','x'); saveCustomPos(); drawStoryCanvas(); }},
      {label:'Flip vertical', fn:()=>{ _customFlip('route','y'); saveCustomPos(); drawStoryCanvas(); }},
    ] : []),
    {label:'Copy size', fn:()=>{ const p=_customElPos(id); _customSizeBuf = id==='route'?{w:p.w,h:p.h}:(p.s||1); }},
    {label:'Paste size', fn:()=>{ if(_customSizeBuf==null) return; group().forEach(x=>{ const p=_customElPos(x); if(!p) return; if(x==='route'&&typeof _customSizeBuf==='object'){ p.w=_customSizeBuf.w; p.h=_customSizeBuf.h; } else if(x!=='route'&&typeof _customSizeBuf==='number'){ p.s=_customSizeBuf; } }); saveCustomPos(); drawStoryCanvas(); }},
    {label:'Reset position', fn:()=>{ group().forEach(_customResetOne); drawStoryCanvas(); }},
  ];
  _customMenuEl.innerHTML=items.map((it,i)=>`<button data-i="${i}">${it.label}</button>`).join('');
  _customMenuEl.querySelectorAll('button').forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); items[+b.dataset.i].fn(); _customMenuEl.style.display='none'; });
  _customMenuEl.style.display='block';
  _customMenuEl.style.left=Math.min(clientX,innerWidth-160)+'px';
  _customMenuEl.style.top=Math.min(clientY,innerHeight-180)+'px';
}

// Free-placement editing on the main canvas (custom layout only): drag, group
// marquee-select, group move, wheel-resize, right-click menu
function _wireCustomDrag(){
  const canvas=document.getElementById('storyCanvas');
  if(canvas._customWired) return; canvas._customWired=true;
  let drag=null;
  const toCanvas=e=>{ const r=canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*(canvas.width/r.width), y:(e.clientY-r.top)*(canvas.height/r.height) }; };
  const hitAt=p=>{ const hits=window._customHits||[], pad=12; for(let i=hits.length-1;i>=0;i--){ const h=hits[i]; if(p.x>=h.x-pad&&p.x<=h.x+h.w+pad&&p.y>=h.y-pad&&p.y<=h.y+h.h+pad) return h; } return null; };

  canvas.addEventListener('pointerdown',e=>{
    if(activeLayout!=='custom'||e.button===2) return;
    const p=toCanvas(e);
    // resize handle takes priority
    const handle=(window._customHandles||[]).find(H=>Math.abs(p.x-H.x)<=H.r&&Math.abs(p.y-H.y)<=H.r);
    if(handle){
      if(handle.group){
        // group resize: scale every selected element's size + its offset from the group centre
        const items=[...customSel].map(id=>{ const pos=_customElPos(id); return pos?{id,pos,x0:pos.x,y0:pos.y,startS:(pos.s||1),startW:pos.w,startH:pos.h}:null; }).filter(Boolean);
        const sel=(window._customHits||[]).filter(hb=>customSel.has(hb.id));
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        sel.forEach(h=>{ minX=Math.min(minX,h.x); minY=Math.min(minY,h.y); maxX=Math.max(maxX,h.x+h.w); maxY=Math.max(maxY,h.y+h.h); });
        const gcx=(minX+maxX)/2, gcy=(minY+maxY)/2;
        drag={ groupResize:true, items, gcx, gcy, gxn:gcx/canvas.width, gyn:gcy/canvas.height, startDist:Math.hypot(p.x-gcx,p.y-gcy)||1 };
        canvas.setPointerCapture(e.pointerId); canvas.style.cursor='nwse-resize'; e.preventDefault();
        return;
      }
      const pos=_customElPos(handle.id);
      if(pos){
        const cx=pos.x*canvas.width, cy=pos.y*canvas.height;
        drag={ resize:true, id:handle.id, cx, cy, startDist:Math.hypot(p.x-cx,p.y-cy)||1, startS:(pos.s||1), startW:pos.w, startH:pos.h, pos };
        canvas.setPointerCapture(e.pointerId); canvas.style.cursor='nwse-resize'; e.preventDefault();
        return;
      }
    }
    const h=hitAt(p);
    if(h){
      if(e.shiftKey){ customSel.has(h.id)?customSel.delete(h.id):customSel.add(h.id); drawStoryCanvas(); return; }
      if(!customSel.has(h.id)) customSel=new Set([h.id]);
      const hitMap={}; (window._customHits||[]).forEach(hb=>hitMap[hb.id]=hb);
      const items=[...customSel].map(id=>{ const pos=_customElPos(id); if(!pos) return null; const hb=hitMap[id]; return {id,pos,x0:pos.x,y0:pos.y,bw:hb?hb.w:0,bh:hb?hb.h:0}; }).filter(Boolean);
      drag={ items, sx:p.x, sy:p.y };
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor='grabbing';
    } else {
      if(!e.shiftKey) customSel.clear();
      drag={ marquee:true, sx:p.x, sy:p.y, base:new Set(customSel) };
      window._customMarquee={x:p.x,y:p.y,w:0,h:0};
      canvas.setPointerCapture(e.pointerId);
    }
    e.preventDefault(); drawStoryCanvas();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=toCanvas(e);
    if(!drag){
      if(activeLayout!=='custom'){ canvas.style.cursor=''; return; }
      // hover feedback: resize over a handle, move over an element, crosshair on empty
      const H=(window._customHandles||[]).find(h=>Math.abs(p.x-h.x)<=h.r&&Math.abs(p.y-h.y)<=h.r);
      if(H&&H.group){ canvas.style.cursor='nwse-resize'; }
      else if(H){ const pos=_customElPos(H.id); const cx=pos.x*canvas.width, cy=pos.y*canvas.height; canvas.style.cursor=((H.x<cx)===(H.y<cy))?'nwse-resize':'nesw-resize'; }
      else canvas.style.cursor=hitAt(p)?'grab':'crosshair';
      return;
    }
    if(drag.groupResize){
      const f=Math.max(0.05, Math.hypot(p.x-drag.gcx,p.y-drag.gcy)/drag.startDist);
      const clamp=v=>Math.min(1,Math.max(0,v));
      drag.items.forEach(it=>{
        if(it.id==='route'){ it.pos.w=_customClamp(it.startW*f,0.05,1.8); it.pos.h=_customClamp(it.startH*f,0.04,1.8); }
        else it.pos.s=_customClamp(it.startS*f,0.15,5);
        it.pos.x=clamp(drag.gxn+(it.x0-drag.gxn)*f);
        it.pos.y=clamp(drag.gyn+(it.y0-drag.gyn)*f);
      });
      drawStoryCanvas();
      return;
    }
    if(drag.resize){
      const f=Math.max(0.05, Math.hypot(p.x-drag.cx,p.y-drag.cy)/drag.startDist);
      if(drag.id==='route'){ drag.pos.w=_customClamp(drag.startW*f,0.05,1.8); drag.pos.h=_customClamp(drag.startH*f,0.04,1.8); }
      else drag.pos.s=_customClamp(drag.startS*f,0.15,5);
      drawStoryCanvas();
      return;
    }
    if(drag.marquee){
      const m=window._customMarquee; m.w=p.x-drag.sx; m.h=p.y-drag.sy;
      const mx=Math.min(m.x,m.x+m.w),my=Math.min(m.y,m.y+m.h),mw=Math.abs(m.w),mh=Math.abs(m.h);
      const sel=new Set(drag.base);
      (window._customHits||[]).forEach(h=>{ if(!(h.x>mx+mw||h.x+h.w<mx||h.y>my+mh||h.y+h.h<my)) sel.add(h.id); });
      customSel=sel; drawStoryCanvas();
    } else {
      const clamp=v=>Math.min(1,Math.max(0,v));
      const dx=(p.x-drag.sx)/canvas.width, dy=(p.y-drag.sy)/canvas.height;
      drag.items.forEach(it=>{ it.pos.x=clamp(it.x0+dx); it.pos.y=clamp(it.y0+dy); });
      if(!e.altKey) _customSnap(drag,canvas); else window._customGuides=null;
      drawStoryCanvas();
    }
  });
  const end=()=>{ if(!drag) return; if(drag.marquee){ window._customMarquee=null; drawStoryCanvas(); } else { window._customGuides=null; saveCustomPos(); drawStoryCanvas(); } drag=null; canvas.style.cursor='grab'; };
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',end);

  canvas.addEventListener('wheel',e=>{
    if(activeLayout!=='custom') return;
    const p=toCanvas(e), h=hitAt(p);
    const ids = (h && !customSel.has(h.id)) ? [h.id] : (customSel.size?[...customSel]:(h?[h.id]:[]));
    if(!ids.length) return;
    e.preventDefault();
    const f=e.deltaY<0?1.08:1/1.08;
    ids.forEach(id=>_customScale(id,f));
    saveCustomPos(); drawStoryCanvas();
  },{passive:false});

  canvas.addEventListener('contextmenu',e=>{
    if(activeLayout!=='custom') return;
    const p=toCanvas(e), h=hitAt(p);
    if(!h) return;
    e.preventDefault();
    if(!customSel.has(h.id)) customSel=new Set([h.id]);
    drawStoryCanvas();
    _customContextMenu(e.clientX,e.clientY,h.id);
  });
}

// Real elevation grid (DEM) for the route's area — powers the Topo layout's
// genuine contour lines. Sampled from Open-Meteo's free elevation API (Copernicus
// DEM); JSON only, so the canvas stays exportable. Cached per activity.
const topoCache = {};
async function ensureTopoGrid(act){
  const id = act && act.id; if(!id || topoCache[id]) return;
  const enc = act.map && act.map.summary_polyline;
  let poly = null; try{ poly = enc ? decodePolyline(enc) : null; }catch{}
  if(!poly || poly.length<2){ topoCache[id]='error'; return; }
  topoCache[id]='loading';
  try{
    let minLa=90,maxLa=-90,minLn=180,maxLn=-180;
    for(const [la,ln] of poly){ if(la<minLa)minLa=la; if(la>maxLa)maxLa=la; if(ln<minLn)minLn=ln; if(ln>maxLn)maxLn=ln; }
    const mLa=(maxLa-minLa)*0.15||0.01, mLn=(maxLn-minLn)*0.15||0.01;
    minLa-=mLa; maxLa+=mLa; minLn-=mLn; maxLn+=mLn;
    const N=16, lats=[], lngs=[];
    for(let r=0;r<N;r++) for(let c=0;c<N;c++){ lats.push(maxLa-(maxLa-minLa)*r/(N-1)); lngs.push(minLn+(maxLn-minLn)*c/(N-1)); }
    const elev=new Array(N*N);
    for(let i=0;i<lats.length;i+=100){
      const la=lats.slice(i,i+100).map(v=>v.toFixed(5)).join(',');
      const ln=lngs.slice(i,i+100).map(v=>v.toFixed(5)).join(',');
      const res=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${la}&longitude=${ln}`);
      const j=await res.json(); const arr=j.elevation||[];
      for(let k=0;k<arr.length;k++) elev[i+k]=arr[k];
    }
    const grid=[]; let mn=Infinity,mx=-Infinity;
    for(let r=0;r<N;r++){ grid[r]=[]; for(let c=0;c<N;c++){ let v=elev[r*N+c]; if(v==null||isNaN(v)) v=0; grid[r][c]=v; if(v<mn)mn=v; if(v>mx)mx=v; } }
    if(mx-mn<1) mx=mn+1;
    topoCache[id]={grid,N,minLa,maxLa,minLn,maxLn,mn,mx};
  }catch(e){ topoCache[id]='error'; }
  try{ if(activeLayout==='topo') drawStoryCanvas(); }catch{}
}

async function fetchStreams(actId){
  if(!actId) return;
  if(streamsCache[actId]){currentStreams=streamsCache[actId];return;}
  try{
    const data=await api(`/activities/${actId}/streams?keys=altitude,distance,velocity_smooth,heartrate,cadence&key_by_type=true`);
    streamsCache[actId]=data;
    currentStreams=data;
  }catch(e){
    currentStreams=null;
  }
}

// Summary activities often omit kilojoules/calories/power — fetch the detailed
// activity and merge it in so every stat (Energy, Calories, etc.) can render.
const actDetailCache={};
async function fetchActDetail(idx){
  const act=acts[idx];
  if(!act||!act.id||act._detailed) return;
  try{
    const det=actDetailCache[act.id]||(actDetailCache[act.id]=await api(`/activities/${act.id}`));
    if(det&&det.id){ Object.assign(act,det); act._detailed=true; }
  }catch{}
}

// build the stat toggle list for the given activity — only stats relevant to
// that sport are shown (e.g. Pace appears for runs, not rides)
function _buildStatToggles(act){
  const tw=document.getElementById('statToggles'); if(!tw) return;
  tw.innerHTML=STAT_DEFS.filter(s=>statApplies(s,act)).map(s=>`
    <label id="lbl-${s.key}" style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:5px 8px;background:var(--surface2);border-radius:5px;border:1px solid ${checkedStats.has(s.key)?'var(--orange)':'var(--border)'};">
      <input type="checkbox" ${checkedStats.has(s.key)?'checked':''} data-key="${s.key}" style="accent-color:var(--orange);">${s.label}
    </label>`).join('');
  tw.querySelectorAll('input').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const k=cb.dataset.key;cb.checked?checkedStats.add(k):checkedStats.delete(k);
      document.getElementById('lbl-'+k).style.borderColor=cb.checked?'var(--orange)':'var(--border)';
      saveStorySettings();
      drawStoryCanvas();
    });
  });
}

function openStoryModal(){
  const picker=document.getElementById('activityPicker');
  picker.innerHTML=acts.slice(0,50).map((a,i)=>`<option value="${i}">${fmtDt(a.start_date)} — ${a.name} (${fmtD(a.distance)})</option>`).join('');
  // adapt the default stat selection to the first activity's sport
  adaptStatsToActivity(acts[parseInt(picker.value)||0]);

  // layout thumbnails
  const lp=document.getElementById('layoutPicker');
  lp.innerHTML=LAYOUTS.map(l=>`
    <button class="layout-btn${l.id===activeLayout?' active':''}" data-layout="${l.id}">
      <canvas class="layout-thumb" data-layout="${l.id}" width="216" height="384"></canvas>
      <span>${l.name}</span>
    </button>
  `).join('');
  lp.querySelectorAll('.layout-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      activeLayout=btn.dataset.layout;
      lp.querySelectorAll('.layout-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      saveStorySettings();
      drawStoryCanvas();
    });
  });

  // stat toggles (activity-aware: hides run-only stats like Pace on rides)
  _buildStatToggles(acts[parseInt(picker.value)||0]);

  picker.onchange=async()=>{
    const idx=parseInt(picker.value)||0;
    const act=acts[idx]||{};
    if(adaptStatsToActivity(act)) saveStorySettings();
    _buildStatToggles(act); // rebuild so Pace shows/hides with the sport
    if(act.id){ await Promise.all([fetchStreams(act.id), fetchActDetail(idx)]); }
    drawStoryCanvas();
  };
  // pre-fetch streams + detail for initial activity
  (async()=>{
    const idx=parseInt(picker.value)||0;
    const act=acts[idx]||{};
    if(act.id){ await Promise.all([fetchStreams(act.id), fetchActDetail(idx)]); drawStoryCanvas(); }
  })();

  // scheme picker
  const schemeSwatches={
    transp:'linear-gradient(135deg,#111 50%,#eee 50%)',
    dark:'#0e0e10',
    graphite:'#18181b',
    black:'#000',
    white:'#f4f4f5',
    night:'#0c0e18',
    slate:'#10141c',
    forest:'#0c120e',
    plum:'#140a18',
    orange:'#FC4C02',
  };
  const sp=document.getElementById('schemePicker');
  sp.innerHTML=Object.keys(schemeSwatches).map(k=>`
    <button data-scheme="${k}" title="${k}" style="width:28px;height:28px;border-radius:50%;background:${schemeSwatches[k]};border:2px solid ${k===activeScheme?'var(--orange)':'transparent'};cursor:pointer;outline:none;flex-shrink:0;transition:border-color .15s;"></button>
  `).join('');
  sp.querySelectorAll('button').forEach(btn=>{
    btn.onclick=()=>{
      activeScheme=btn.dataset.scheme;
      sp.querySelectorAll('button').forEach(b=>b.style.borderColor='transparent');
      btn.style.borderColor='var(--orange)';
      saveStorySettings();
      drawStoryCanvas();
    };
  });

  // accent color picker
  const accentPicker=document.getElementById('accentColorPicker');
  const accentReset=document.getElementById('accentReset');
  if(accentPicker){
    if(customAccent) accentPicker.value=customAccent;
    accentPicker.oninput=()=>{customAccent=accentPicker.value;saveStorySettings();drawStoryCanvas();};
    if(accentReset) accentReset.onclick=()=>{customAccent=null;accentPicker.value='#FC4C02';saveStorySettings();drawStoryCanvas();};
  }

  // hide toggles — use onchange (not addEventListener) to prevent stacking on re-open
  const chkTitle=document.getElementById('chk-hideTitle');
  const chkDate=document.getElementById('chk-hideDate');
  const chkRoute=document.getElementById('chk-hideRoute');
  const chkLogo=document.getElementById('chk-hideLogo');
  chkTitle.checked=hideTitle;chkDate.checked=hideDate;
  if(chkRoute) chkRoute.checked=hideRoute;
  if(chkLogo) chkLogo.checked=hideLogo;
  chkTitle.onchange=()=>{hideTitle=chkTitle.checked;document.getElementById('lbl-hideTitle').style.borderColor=hideTitle?'var(--orange)':'var(--border)';saveStorySettings();drawStoryCanvas();};
  chkDate.onchange=()=>{hideDate=chkDate.checked;document.getElementById('lbl-hideDate').style.borderColor=hideDate?'var(--orange)':'var(--border)';saveStorySettings();drawStoryCanvas();};
  if(chkRoute) chkRoute.onchange=()=>{hideRoute=chkRoute.checked;document.getElementById('lbl-hideRoute').style.borderColor=hideRoute?'var(--orange)':'var(--border)';saveStorySettings();drawStoryCanvas();};
  if(chkLogo) chkLogo.onchange=()=>{hideLogo=chkLogo.checked;document.getElementById('lbl-hideLogo').style.borderColor=hideLogo?'var(--orange)':'var(--border)';saveStorySettings();drawStoryCanvas();};

  const bgInput=document.getElementById('bgImageInput');
  const clearBg=document.getElementById('clearBgBtn');
  const bgName=document.getElementById('bgImageName');
  // the Upload Photo control is a <label for="bgImageInput">, so tapping it opens
  // the picker natively (reliable on mobile) — no programmatic .click() needed
  if(bgInput) bgInput.onchange=e=>{
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        storyBgImage=img; if(clearBg) clearBg.style.display=''; if(bgName) bgName.textContent=file.name;
        try{ localStorage.setItem('story_bg', _downscaleDataURL(img,1280)); localStorage.setItem('story_bg_name', file.name); }catch{}
        drawStoryCanvas();
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  if(clearBg){
    clearBg.style.display=storyBgImage?'':'none';
    clearBg.onclick=()=>{ storyBgImage=null; clearBg.style.display='none'; if(bgName) bgName.textContent=''; if(bgInput) bgInput.value=''; localStorage.removeItem('story_bg'); localStorage.removeItem('story_bg_name'); drawStoryCanvas(); };
  }
  // restore a previously-used background photo
  if(!storyBgImage){
    const saved=localStorage.getItem('story_bg');
    if(saved){ const img=new Image(); img.onload=()=>{ storyBgImage=img; if(clearBg) clearBg.style.display=''; if(bgName) bgName.textContent=localStorage.getItem('story_bg_name')||'photo'; drawStoryCanvas(); }; img.src=saved; }
  }

  // custom free-placement: enable canvas dragging + reset button
  _wireCustomDrag();
  const customReset=document.getElementById('customReset');
  if(customReset) customReset.onclick=()=>{ customSel.clear(); resetCustomPos(); drawStoryCanvas(); };
  const toolbar=document.getElementById('customToolbar');
  if(toolbar) toolbar.querySelectorAll('button[data-act]').forEach(b=>b.onclick=()=>{
    const sel=customSel.size?[...customSel]:[]; const act=b.dataset.act;
    if(!sel.length) return; // nothing selected — tap an element first
    if(act==='bigger') sel.forEach(x=>_customScale(x,1.12));
    else if(act==='smaller') sel.forEach(x=>_customScale(x,1/1.12));
    else if(act==='fliph') sel.filter(x=>x==='route').forEach(x=>_customFlip(x,'x'));
    else if(act==='flipv') sel.filter(x=>x==='route').forEach(x=>_customFlip(x,'y'));
    else if(act==='hide') sel.forEach(_customHide);
    else if(act==='resetone') sel.forEach(_customResetOne);
    saveCustomPos(); drawStoryCanvas();
  });

  document.getElementById('storyModal').classList.add('open');
  localStorage.setItem('story_open','1'); // remember to reopen after a refresh
  setTimeout(drawStoryCanvas,50);
}

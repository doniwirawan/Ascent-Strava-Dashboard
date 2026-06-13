function drawStoryCanvas(){
  const canvas=document.getElementById('storyCanvas');
  const idx=parseInt(document.getElementById('activityPicker').value)||0;
  const act=acts[idx]||{};
  const selected=STAT_DEFS.filter(s=>checkedStats.has(s.key));
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
function _customScale(id,factor){
  if(id==='route'){ const r=customPos.route; r.w=_customClamp(r.w*factor,0.05,1.8); r.h=_customClamp(r.h*factor,0.04,1.8); }
  else { const p=_customElPos(id); if(p) p.s=_customClamp((p.s||1)*factor,0.15,5); }
}
function _customFlip(id,axis){ const p=_customElPos(id); if(!p) return; if(axis==='x') p.fx=!p.fx; else p.fy=!p.fy; }

// Canva-style snapping: align dragged element's edges/centre to the canvas and
// to other elements, plus equal-spacing between two neighbours. Draws guides.
function _customSnap(drag,canvas){
  const W=canvas.width,H=canvas.height,clamp=v=>Math.min(1,Math.max(0,v));
  const prim=drag.primary;
  if(!prim){ window._customGuides=null; return; }
  const bw=prim.bw||0, bh=prim.bh||0, cx=prim.pos.x*W, cy=prim.pos.y*H;
  const others=(window._customHits||[]).filter(h=>!customSel.has(h.id));
  const TH=22; // snap distance in canvas px
  const xLines=[0,W/2,W], yLines=[0,H/2,H];
  others.forEach(h=>{ xLines.push(h.x,h.x+h.w/2,h.x+h.w); yLines.push(h.y,h.y+h.h/2,h.y+h.h); });
  // equal spacing — midpoint between two elements the dragged one sits between
  const vov=others.filter(h=> !(h.y>cy+bh/2 || h.y+h.h<cy-bh/2));
  vov.forEach(L=>vov.forEach(R=>{ const Lr=L.x+L.w, Rl=R.x; if(Lr+TH<Rl) xLines.push((Lr+Rl)/2); }));
  const hov=others.filter(h=> !(h.x>cx+bw/2 || h.x+h.w<cx-bw/2));
  hov.forEach(T=>hov.forEach(B=>{ const Tb=T.y+T.h, Bt=B.y; if(Tb+TH<Bt) yLines.push((Tb+Bt)/2); }));

  const xa=[cx-bw/2,cx,cx+bw/2], ya=[cy-bh/2,cy,cy+bh/2];
  let bx=null; xa.forEach(a=>xLines.forEach(l=>{const d=Math.abs(a-l); if(d<(bx?bx.d:TH)) bx={d,line:l,center:cx+(l-a)};}));
  let by=null; ya.forEach(a=>yLines.forEach(l=>{const d=Math.abs(a-l); if(d<(by?by.d:TH)) by={d,line:l,center:cy+(l-a)};}));
  const guides=[];
  if(bx){ const off=(bx.center-cx)/W; drag.items.forEach(it=>it.pos.x=clamp(it.pos.x+off)); guides.push({v:bx.line}); }
  if(by){ const off=(by.center-cy)/H; drag.items.forEach(it=>it.pos.y=clamp(it.pos.y+off)); guides.push({h:by.line}); }
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
  _customSyncHideChecks(); customSel.delete(id);
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
      const items=[...customSel].map(id=>{ const pos=_customElPos(id); return pos?{id,pos,x0:pos.x,y0:pos.y}:null; }).filter(Boolean);
      drag={ items, primary:items.find(it=>it.id===h.id)||items[0], sx:p.x, sy:p.y };
      if(drag.primary){ drag.primary.bw=h.w; drag.primary.bh=h.h; }
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
      if(H){ const pos=_customElPos(H.id); const cx=pos.x*canvas.width, cy=pos.y*canvas.height; canvas.style.cursor=((H.x<cx)===(H.y<cy))?'nwse-resize':'nesw-resize'; }
      else canvas.style.cursor=hitAt(p)?'grab':'crosshair';
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

function openStoryModal(){
  const picker=document.getElementById('activityPicker');
  picker.innerHTML=acts.slice(0,50).map((a,i)=>`<option value="${i}">${fmtDt(a.start_date)} — ${a.name} (${fmtD(a.distance)})</option>`).join('');

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
      drawStoryCanvas();
    });
  });

  // stat toggles
  const tw=document.getElementById('statToggles');
  tw.innerHTML=STAT_DEFS.map(s=>`
    <label id="lbl-${s.key}" style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:5px 8px;background:var(--surface2);border-radius:5px;border:1px solid ${checkedStats.has(s.key)?'var(--orange)':'var(--border)'};">
      <input type="checkbox" ${checkedStats.has(s.key)?'checked':''} data-key="${s.key}" style="accent-color:var(--orange);">${s.label}
    </label>`).join('');
  tw.querySelectorAll('input').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const k=cb.dataset.key;cb.checked?checkedStats.add(k):checkedStats.delete(k);
      document.getElementById('lbl-'+k).style.borderColor=cb.checked?'var(--orange)':'var(--border)';
      drawStoryCanvas();
    });
  });

  picker.onchange=async()=>{
    const idx=parseInt(picker.value)||0;
    const act=acts[idx]||{};
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
      drawStoryCanvas();
    };
  });

  // accent color picker
  const accentPicker=document.getElementById('accentColorPicker');
  const accentReset=document.getElementById('accentReset');
  if(accentPicker){
    if(customAccent) accentPicker.value=customAccent;
    accentPicker.oninput=()=>{customAccent=accentPicker.value;drawStoryCanvas();};
    if(accentReset) accentReset.onclick=()=>{customAccent=null;accentPicker.value='#FC4C02';drawStoryCanvas();};
  }

  // hide toggles — use onchange (not addEventListener) to prevent stacking on re-open
  const chkTitle=document.getElementById('chk-hideTitle');
  const chkDate=document.getElementById('chk-hideDate');
  const chkRoute=document.getElementById('chk-hideRoute');
  const chkLogo=document.getElementById('chk-hideLogo');
  chkTitle.checked=hideTitle;chkDate.checked=hideDate;
  if(chkRoute) chkRoute.checked=hideRoute;
  if(chkLogo) chkLogo.checked=hideLogo;
  chkTitle.onchange=()=>{hideTitle=chkTitle.checked;document.getElementById('lbl-hideTitle').style.borderColor=hideTitle?'var(--orange)':'var(--border)';drawStoryCanvas();};
  chkDate.onchange=()=>{hideDate=chkDate.checked;document.getElementById('lbl-hideDate').style.borderColor=hideDate?'var(--orange)':'var(--border)';drawStoryCanvas();};
  if(chkRoute) chkRoute.onchange=()=>{hideRoute=chkRoute.checked;document.getElementById('lbl-hideRoute').style.borderColor=hideRoute?'var(--orange)':'var(--border)';drawStoryCanvas();};
  if(chkLogo) chkLogo.onchange=()=>{hideLogo=chkLogo.checked;document.getElementById('lbl-hideLogo').style.borderColor=hideLogo?'var(--orange)':'var(--border)';drawStoryCanvas();};

  const bgInput=document.getElementById('bgImageInput');
  const bgUploadBtn=document.getElementById('bgUploadBtn');
  const clearBg=document.getElementById('clearBgBtn');
  const bgName=document.getElementById('bgImageName');
  if(bgUploadBtn&&bgInput) bgUploadBtn.addEventListener('click',()=>bgInput.click());
  if(bgInput){
    bgInput.addEventListener('change',e=>{
      const file=e.target.files[0];
      if(!file) return;
      const reader=new FileReader();
      reader.onload=ev=>{
        const img=new Image();
        img.onload=()=>{storyBgImage=img;clearBg.style.display='';bgName.textContent=file.name;drawStoryCanvas();};
        img.src=ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  if(clearBg){
    clearBg.style.display=storyBgImage?'':'none';
    clearBg.addEventListener('click',()=>{storyBgImage=null;clearBg.style.display='none';bgName.textContent='';if(bgInput)bgInput.value='';drawStoryCanvas();});
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
  setTimeout(drawStoryCanvas,50);
}

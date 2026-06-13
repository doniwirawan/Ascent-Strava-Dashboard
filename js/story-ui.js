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

// Free-placement dragging on the main canvas (custom layout only)
function _wireCustomDrag(){
  const canvas=document.getElementById('storyCanvas');
  if(canvas._customWired) return; canvas._customWired=true;
  let drag=null;
  const toCanvas=e=>{ const r=canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*(canvas.width/r.width), y:(e.clientY-r.top)*(canvas.height/r.height) }; };
  const elPos=id=> id==='title'?customPos.title : id==='date'?customPos.date : id==='logo'?customPos.logo : id==='route'?customPos.route : id.startsWith('stat:')?customPos.stats[id.slice(5)] : null;
  canvas.addEventListener('pointerdown',e=>{
    if(activeLayout!=='custom') return;
    const p=toCanvas(e), hits=window._customHits||[];
    for(let i=hits.length-1;i>=0;i--){ const h=hits[i]; if(p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h){ drag={sx:p.x,sy:p.y,pos:elPos(h.id)}; break; } }
    if(drag&&drag.pos){ canvas.setPointerCapture(e.pointerId); canvas.style.cursor='grabbing'; e.preventDefault(); } else drag=null;
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag) return;
    const p=toCanvas(e);
    drag.pos.x=Math.min(1,Math.max(0,drag.pos.x+(p.x-drag.sx)/canvas.width));
    drag.pos.y=Math.min(1,Math.max(0,drag.pos.y+(p.y-drag.sy)/canvas.height));
    drag.sx=p.x; drag.sy=p.y;
    drawStoryCanvas();
  });
  const end=()=>{ if(drag){ drag=null; saveCustomPos(); canvas.style.cursor='grab'; } };
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',end);
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
  if(customReset) customReset.onclick=()=>{ resetCustomPos(); drawStoryCanvas(); };

  document.getElementById('storyModal').classList.add('open');
  setTimeout(drawStoryCanvas,50);
}

/* ── canvas drawing helpers ── */
/* ═══════════════════════════════════════════
   STORY CARD — 25 layouts, custom colors, map
   ═══════════════════════════════════════════ */


function drawRoute(ctx, pts, x, y, w, h, color, lw) {
  if(hideRoute) return;
  if(!pts||pts.length<2) return;
  const lats=pts.map(p=>p[0]),lngs=pts.map(p=>p[1]);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const latSpan=maxLat-minLat||0.001, lngSpan=maxLng-minLng||0.001;
  const pad=0.08;
  // preserve aspect ratio — use same scale for lat and lng
  const scale=Math.min((w*(1-pad*2))/lngSpan,(h*(1-pad*2))/latSpan);
  const drawW=lngSpan*scale,drawH=latSpan*scale;
  const ox=x+(w-drawW)/2, oy=y+(h-drawH)/2;
  const toX=lng=>ox+(lng-minLng)*scale;
  const toY=lat=>oy+(maxLat-lat)*scale;
  ctx.beginPath();
  pts.forEach((p,i)=>i===0?ctx.moveTo(toX(p[1]),toY(p[0])):ctx.lineTo(toX(p[1]),toY(p[0])));
  ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.stroke();
  const s=pts[0], e=pts[pts.length-1];
  ctx.fillStyle=color;
  ctx.beginPath(); ctx.arc(toX(s[1]),toY(s[0]),lw*2.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(toX(e[1]),toY(e[0]),lw*2.5,0,Math.PI*2); ctx.fill();
}


function drawIcon(ctx,type,cx,cy,s,col){
  ctx.save(); ctx.strokeStyle=col; ctx.fillStyle=col;
  ctx.lineWidth=s*.08; ctx.lineCap='round'; ctx.lineJoin='round';
  switch(type){
    case 'distance':
      ctx.beginPath();ctx.arc(cx-s*.18,cy-s*.2,s*.18,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(cx-s*.18,cy-s*.2,s*.07,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(cx+s*.18,cy+s*.2,s*.1,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(cx-s*.18,cy-.02*s);ctx.bezierCurveTo(cx-s*.18,cy+s*.15,cx+s*.18,cy+s*.05,cx+s*.18,cy+s*.2);ctx.stroke();break;
    case 'speed':
      ctx.beginPath();ctx.arc(cx,cy+s*.05,s*.36,Math.PI,0);ctx.stroke();
      [0,45,90,135,180].forEach(a=>{const r=a*Math.PI/180;ctx.beginPath();ctx.moveTo(cx-s*.36*Math.cos(r),cy+s*.05-s*.36*Math.sin(r));ctx.lineTo(cx-s*.27*Math.cos(r),cy+s*.05-s*.27*Math.sin(r));ctx.stroke();});
      ctx.beginPath();ctx.moveTo(cx,cy+s*.05);ctx.lineTo(cx+s*.28*Math.cos(-0.9),cy+s*.05+s*.28*Math.sin(-0.9));ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy+s*.05,s*.06,0,Math.PI*2);ctx.fill();break;
    case 'elev':
      ctx.beginPath();ctx.moveTo(cx-s*.42,cy+s*.28);ctx.lineTo(cx-s*.1,cy-s*.28);ctx.lineTo(cx+s*.2,cy+s*.28);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx,cy+s*.28);ctx.lineTo(cx+s*.28,cy-s*.1);ctx.lineTo(cx+s*.44,cy+s*.28);ctx.stroke();break;
    case 'time':
      ctx.beginPath();ctx.arc(cx,cy,s*.36,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy-s*.22);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+s*.16,cy+s*.1);ctx.stroke();break;
    case 'hr':
      ctx.beginPath();ctx.moveTo(cx,cy+s*.28);ctx.bezierCurveTo(cx-s*.5,cy,cx-s*.5,cy-s*.36,cx,cy-s*.16);ctx.bezierCurveTo(cx+s*.5,cy-s*.36,cx+s*.5,cy,cx,cy+s*.28);ctx.stroke();break;
    case 'cadence':
      ctx.beginPath();ctx.arc(cx,cy,s*.3,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,s*.09,0,Math.PI*2);ctx.fill();
      for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(cx+s*.3*Math.cos(a),cy+s*.3*Math.sin(a));ctx.lineTo(cx+s*.42*Math.cos(a),cy+s*.42*Math.sin(a));ctx.stroke();}break;
    case 'power':
      ctx.beginPath();ctx.moveTo(cx+s*.06,cy-s*.38);ctx.lineTo(cx-s*.1,cy+s*.04);ctx.lineTo(cx+s*.06,cy+s*.04);ctx.lineTo(cx-s*.06,cy+s*.38);ctx.lineTo(cx+s*.2,cy-s*.04);ctx.lineTo(cx+s*.06,cy-s*.04);ctx.closePath();ctx.stroke();break;
    case 'star':
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2,b=a+Math.PI/5;ctx.beginPath();ctx.moveTo(cx+s*.36*Math.cos(a),cy+s*.36*Math.sin(a));ctx.lineTo(cx+s*.16*Math.cos(b),cy+s*.16*Math.sin(b));ctx.stroke();}break;
    case 'fire':
      ctx.beginPath();
      ctx.moveTo(cx,cy+s*.38);
      ctx.bezierCurveTo(cx-s*.36,cy+s*.1,cx-s*.22,cy-s*.18,cx,cy-s*.1);
      ctx.bezierCurveTo(cx+s*.06,cy-s*.32,cx-s*.06,cy-s*.38,cx,cy-s*.38);
      ctx.bezierCurveTo(cx+s*.2,cy-s*.2,cx+s*.38,cy,cx+s*.28,cy+s*.2);
      ctx.bezierCurveTo(cx+s*.44,cy+s*.04,cx+s*.38,cy-s*.14,cx+s*.28,cy-s*.2);
      ctx.bezierCurveTo(cx+s*.46,cy+s*.0,cx+s*.42,cy+s*.28,cx,cy+s*.38);
      ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy+s*.18,s*.1,0,Math.PI*2);ctx.fill();break;
    default:
      ctx.beginPath();ctx.arc(cx,cy,s*.3,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function drawAreaChart(ctx, data, x, y, w, h, accentColor, lw){
  if(!data||data.length<2) return;
  const n=data.length;
  const dmin=Math.min(...data), dmax=Math.max(...data);
  const drange=dmax-dmin||1;
  const g=ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0,accentColor+'77'); g.addColorStop(1,accentColor+'05');
  ctx.beginPath();
  ctx.moveTo(x,y+h);
  for(let i=0;i<n;i++){
    const px=x+w*(i/(n-1)), py=y+h-(h*0.88)*((data[i]-dmin)/drange);
    ctx.lineTo(px,py);
  }
  ctx.lineTo(x+w,y+h); ctx.closePath();
  ctx.fillStyle=g; ctx.fill();
  ctx.beginPath();
  for(let i=0;i<n;i++){
    const px=x+w*(i/(n-1)), py=y+h-(h*0.88)*((data[i]-dmin)/drange);
    i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
  }
  ctx.strokeStyle=accentColor; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.stroke();
}

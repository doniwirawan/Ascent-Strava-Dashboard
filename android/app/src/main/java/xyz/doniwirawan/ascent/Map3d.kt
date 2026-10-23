package xyz.doniwirawan.ascent

/**
 * The 3D view the map WebViews share (RideMap, RoutesActivity) — the website's
 * js/map3d.js approach: MapLibre GL with Esri satellite draped over the free
 * AWS / Mapzen terrain tiles, routes drawn on the ground. MapLibre is only
 * downloaded the first time 3D is opened. Two-finger drag tilts, twist rotates.
 *
 * JS API (a global `M3D`):
 *   M3D.open(box, lines, onReady)  lines = [{p: [[lat, lng], …], c: '#hex', w: px, o: opacity}]
 *   M3D.set(lines)                 redraw the lines (e.g. Speed / Power colouring)
 *   M3D.fly(points, onEnd)         camera along [[lat, lng], …]; true if it started
 *   M3D.stop()                     stops a fly-through; true if one was running
 *   M3D.close()
 */
object Map3d {
    val JS = """
var M3D=(function(){
 var V='4.7.1', map=null, box=null, lib=null, flying=null;
 var E='https://server.arcgisonline.com/ArcGIS/rest/services/';
 function load(){ if(window.maplibregl) return Promise.resolve(); if(lib) return lib;
  lib=new Promise(function(ok,no){ var c=document.createElement('link'); c.rel='stylesheet'; c.href='https://unpkg.com/maplibre-gl@'+V+'/dist/maplibre-gl.css'; document.head.appendChild(c);
   var s=document.createElement('script'); s.src='https://unpkg.com/maplibre-gl@'+V+'/dist/maplibre-gl.js'; s.onload=ok; s.onerror=function(){lib=null;no();}; document.head.appendChild(s); });
  return lib; }
 function fc(lines){ return {type:'FeatureCollection',features:lines.filter(function(l){return l.p.length>1}).map(function(l){
  return {type:'Feature',properties:{c:l.c||'#fc4c02',w:l.w||4,o:l.o==null?1:l.o},geometry:{type:'LineString',coordinates:l.p.map(function(q){return [q[1],q[0]]})}}; })}; }
 function bounds(lines){ var b=null; lines.forEach(function(l){ l.p.forEach(function(q){ if(!b) b=[[q[1],q[0]],[q[1],q[0]]];
  b[0][0]=Math.min(b[0][0],q[1]); b[0][1]=Math.min(b[0][1],q[0]); b[1][0]=Math.max(b[1][0],q[1]); b[1][1]=Math.max(b[1][1],q[0]); }); }); return b; }
 function open(el, lines, ready){
  box=el; box.style.display='block'; box.innerHTML='<div style="color:#8a8a96;padding:90px 14px 0">Loading 3D…</div>';
  load().then(function(){
   box.innerHTML='';
   var dem={type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium'};
   var bb=bounds(lines);
   var opt={container:box,attributionControl:false,maxPitch:85,
    style:{version:8,sources:{sat:{type:'raster',tiles:[E+'World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19},dem:dem},
     layers:[{id:'sat',type:'raster',source:'sat'}],terrain:{source:'dem',exaggeration:1.5},
     sky:{'sky-color':'#0c0c0c','horizon-color':'#2a2a33','fog-color':'#0c0c0c','sky-horizon-blend':.6,'horizon-fog-blend':.7,'fog-ground-blend':.6}}};
   // never pass undefined camera options: they replace MapLibre's defaults and break its matrix
   if(bb){ opt.bounds=bb; opt.fitBoundsOptions={padding:40}; } else { opt.center=[115.2,-8.4]; opt.zoom=10; }
   map=new maplibregl.Map(opt);
   map.setPitch(60);      // open flat on the bounds, then tilt
   // draw as soon as the style is in — 'load' waits for every terrain tile
   map.once('style.load',function(){
    map.addSource('r',{type:'geojson',data:fc(lines)});
    map.addLayer({id:'rc',type:'line',source:'r',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#000','line-width':['+',['get','w'],3],'line-opacity':['*',['get','o'],.5]}});
    map.addLayer({id:'rl',type:'line',source:'r',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','c'],'line-width':['get','w'],'line-opacity':['get','o']}});
    if(ready) ready();
   });
  }).catch(function(e){ box.innerHTML='<div style="color:#ef4444;padding:90px 14px 0">Couldn\'t open 3D: '+((e&&e.message)||'check the connection')+'</div>'; });
 }
 function set(lines){ if(map&&map.getSource('r')) map.getSource('r').setData(fc(lines)); }
 function stop(){ if(flying){ cancelAnimationFrame(flying); flying=null; return true; } return false; }
 // follow the route: ~40 s whatever its length, looking a little ahead
 function fly(pts, done){ if(!map||stop()||pts.length<2) return false;
  var n=pts.length, t0=null, dur=40000, ahead=Math.max(1,Math.round(n/60));
  function brg(a,b){ var y=Math.sin((b[1]-a[1])*Math.PI/180)*Math.cos(b[0]*Math.PI/180), x=Math.cos(a[0]*Math.PI/180)*Math.sin(b[0]*Math.PI/180)-Math.sin(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.cos((b[1]-a[1])*Math.PI/180); return Math.atan2(y,x)*180/Math.PI; }
  var bear=map.getBearing();
  function step(ts){ if(t0==null) t0=ts; var f=Math.min(1,(ts-t0)/dur), i=Math.min(n-1,Math.floor(f*(n-1))), j=Math.min(n-1,i+ahead);
   var want=brg(pts[i],pts[j]), d=((want-bear+540)%360)-180; bear+=d*0.04;
   map.jumpTo({center:[pts[i][1],pts[i][0]],bearing:bear,pitch:65,zoom:14.5});
   if(f<1) flying=requestAnimationFrame(step); else { flying=null; if(done) done(); } }
  flying=requestAnimationFrame(step); return true; }
 function close(){ stop(); if(map){ map.remove(); map=null; } if(box){ box.style.display='none'; box.innerHTML=''; } }
 return {open:open,set:set,fly:fly,stop:stop,close:close};
})();
"""
}

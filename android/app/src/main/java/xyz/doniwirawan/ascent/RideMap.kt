package xyz.doniwirawan.ascent

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.MotionEvent
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray

/**
 * The ride's map, drawn by Leaflet in a WebView like the website's activity map
 * (free tiles, no key): Esri satellite, OpenStreetMap or a dark basemap, the
 * route with start / end dots, and — once the ride's streams are loaded —
 * Speed and Power colouring with the strongest minute and the peaks pinned.
 */
@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility", "ViewConstructor")
class RideMap(ctx: Context, polyline: String) : WebView(ctx) {

    private var ready = false
    private var pending: String? = null

    init {
        setBackgroundColor(Color.parseColor("#0C0C0C"))
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        // let the map take drags and pinches instead of the page scrolling
        setOnTouchListener { v, e ->
            v.parent?.requestDisallowInterceptTouchEvent(e.actionMasked != MotionEvent.ACTION_UP && e.actionMasked != MotionEvent.ACTION_CANCEL)
            false
        }
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                ready = true
                pending?.let { evaluateJavascript(it, null) }
                pending = null
            }
        }
        val pts = JSONArray().apply { Ui.decodePolyline(polyline).forEach { put(JSONArray().put(it[0]).put(it[1])) } }
        loadDataWithBaseURL(BuildConfig.DASHBOARD_URL, HTML.replace("__ROUTE__", pts.toString()), "text/html", "utf-8", null)
    }

    /** points: [[lat, lng, speed m/s, watts (10 s avg) or null], …] */
    fun setStreams(points: JSONArray, hasPower: Boolean) {
        val js = "setStreams(${points}, ${hasPower});"
        if (ready) evaluateJavascript(js, null) else pending = js
    }

    companion object {
        private val HTML = """
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
 html,body,#m{margin:0;height:100%;background:#0c0c0c;font:600 12px system-ui,sans-serif}
 .bar{position:absolute;z-index:1000;display:flex;gap:6px}
 .bar button{display:flex;align-items:center;border:1px solid #2a2a33;background:rgba(22,22,28,.92);color:#cfcfd6;border-radius:8px;padding:6px 10px;font:inherit}
 .bar button.on{background:#fc4c02;border-color:#fc4c02;color:#fff}
 #base{top:10px;right:10px} #mode{bottom:10px;left:10px;display:none} #peaks{bottom:10px;right:10px;display:none}
 #leg{position:absolute;z-index:1000;top:10px;left:10px;display:none;background:rgba(22,22,28,.92);border:1px solid #2a2a33;border-radius:8px;padding:5px 9px;color:#cfcfd6;align-items:center;gap:6px}
 #leg i{width:70px;height:6px;border-radius:3px;background:linear-gradient(90deg,hsl(120,90%,50%),hsl(60,90%,50%),hsl(0,90%,50%))}
 #leg em{width:14px;height:5px;border-radius:3px;background:#a855f7;box-shadow:0 0 0 1.5px #fff;margin-left:6px}
 .leaflet-tooltip{background:#16161c;color:#fff;border:1px solid #fc4c02;font-weight:700}
 .pin{width:26px;height:26px;border-radius:50%;background:#fc4c02;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.6)}
</style></head><body><div id="m"></div>
<div class="bar" id="base"><button data-b="sat" class="on"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>Satellite</button><button data-b="osm"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>Map</button><button data-b="dark"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/></svg>Dark</button></div>
<div class="bar" id="mode"><button data-m="route" class="on"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18c7 0 2-12 10-12"/></svg>Route</button><button data-m="speed"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><path d="M3 15a9 9 0 0 1 18 0M12 15l4.5-5"/></svg>Speed</button><button data-m="power" id="pw"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><path d="M13 2.5 4.5 13.5h7l-1 8 9-11h-7z"/></svg>Power</button></div>
<div class="bar" id="peaks"><button data-p="speed">⚡ Top speed</button><button data-p="power" id="pp">💪 Max power</button></div>
<div id="leg"></div>
<script>
var route=__ROUTE__, m=L.map('m',{zoomControl:false,attributionControl:false});
var E='https://server.arcgisonline.com/ArcGIS/rest/services/';
var bases={sat:L.tileLayer(E+'World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
 osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
 dark:L.tileLayer(E+'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16})};
var cur=bases.sat.addTo(m);
document.querySelectorAll('#base button').forEach(function(b){b.onclick=function(){m.removeLayer(cur);cur=bases[b.dataset.b].addTo(m);
 document.querySelectorAll('#base button').forEach(function(x){x.classList.toggle('on',x===b)});}});
var casing=L.polyline(route,{color:'#fff',weight:7,opacity:.85}).addTo(m), line=L.polyline(route,{color:'#fc4c02',weight:4}).addTo(m);
if(route.length){L.circleMarker(route[0],{radius:6,color:'#fff',weight:2,fillColor:'#22c55e',fillOpacity:1}).addTo(m);
 L.circleMarker(route[route.length-1],{radius:6,color:'#fff',weight:2,fillColor:'#ef4444',fillOpacity:1}).addTo(m);
 m.fitBounds(line.getBounds(),{padding:[24,24]});} else m.setView([-8.4,115.2],10);
var pts=null, layer=null, pin=null, power=false;
function col(t){t=Math.max(0,Math.min(1,t));return 'hsl('+Math.round(120*(1-t))+',90%,50%)';}
function q(a,f){return a[Math.min(a.length-1,Math.floor(f*a.length))];}
function paint(k){
 if(layer){m.removeLayer(layer);layer=null;} var leg=document.getElementById('leg');
 if(k==='route'){line.setStyle({opacity:1});casing.setStyle({opacity:.85});leg.style.display='none';return;}
 var i=k==='speed'?2:3, v=pts.map(function(p){return p[i]||0}).filter(function(x){return x>0}).sort(function(a,b){return a-b});
 var lo=q(v,.05), hi=q(v,.95); if(hi-lo<1e-6) hi=lo+1;
 layer=L.layerGroup(); var N=12, bin=function(x){return Math.round(Math.max(0,Math.min(1,((x||0)-lo)/(hi-lo)))*(N-1));};
 var run=[[pts[0][0],pts[0][1]]], c=bin(pts[0][i]);
 for(var j=1;j<pts.length;j++){var b=bin(pts[j][i]);run.push([pts[j][0],pts[j][1]]);
  if(b!==c){L.polyline(run,{color:col(c/(N-1)),weight:5}).addTo(layer);run=[[pts[j][0],pts[j][1]]];c=b;}}
 if(run.length>1) L.polyline(run,{color:col(c/(N-1)),weight:5}).addTo(layer);
 var best='';
 if(k==='power'){var s=0,bi=-1,bv=0;for(j=0;j<pts.length;j++){s+=pts[j][3]||0;if(j>=60)s-=pts[j-60][3]||0;if(j>=59&&s>bv){bv=s;bi=j;}}
  if(bi>=0){var seg=pts.slice(bi-59,bi+1).map(function(p){return [p[0],p[1]]});
   L.polyline(seg,{color:'#fff',weight:10}).addTo(layer);L.polyline(seg,{color:'#a855f7',weight:6}).addTo(layer);best=Math.round(bv/60);}}
 layer.addTo(m); line.setStyle({opacity:0}); casing.setStyle({opacity:0});
 var u=k==='speed'?function(x){return (x*3.6).toFixed(1)}:function(x){return Math.round(x)};
 leg.innerHTML='<span>'+u(lo)+'</span><i></i><span>'+u(hi)+(k==='speed'?' km/h':' W')+'</span>'+(best?'<em></em><span>best min '+best+' W</span>':'');
 leg.style.display='flex';
}
function peak(k){
 var i=k==='speed'?2:3, b=0; pts.forEach(function(p,j){if((p[i]||0)>(pts[b][i]||0))b=j;});
 var p=pts[b], txt=k==='speed'?(p[2]*3.6).toFixed(1)+' km/h'+(p[3]!=null&&power?' · '+Math.round(p[3])+' W':'')
  :Math.round(p[3])+' W · '+(p[2]*3.6).toFixed(1)+' km/h';
 if(pin) m.removeLayer(pin);
 pin=L.marker([p[0],p[1]],{icon:L.divIcon({className:'',html:'<div class="pin">'+(k==='speed'?'⚡':'💪')+'</div>',iconSize:[26,26],iconAnchor:[13,13]})})
  .bindTooltip(txt,{permanent:true,direction:'top',offset:[0,-14]}).addTo(m);
 m.flyTo([p[0],p[1]],Math.max(m.getZoom(),15),{duration:.6});
}
function setStreams(p,hasPower){pts=p;power=hasPower;if(!pts.length)return;
 document.getElementById('mode').style.display='flex';document.getElementById('peaks').style.display='flex';
 if(!hasPower){document.getElementById('pw').style.display='none';document.getElementById('pp').style.display='none';}
 document.querySelectorAll('#mode button').forEach(function(b){b.onclick=function(){paint(b.dataset.m);
  document.querySelectorAll('#mode button').forEach(function(x){x.classList.toggle('on',x===b)});}});
 document.querySelectorAll('#peaks button').forEach(function(b){b.onclick=function(){peak(b.dataset.p)}});
}
</script></body></html>
"""
    }
}

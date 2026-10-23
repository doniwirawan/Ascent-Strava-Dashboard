package xyz.doniwirawan.ascent

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import org.json.JSONArray

/**
 * Every route on one map — the website's heatmap. The encoded polylines come
 * from the saved activities response (no extra request); Leaflet draws them
 * as faint orange lines, so roads ridden often glow brighter. 3D drapes them
 * over real terrain (Map3d.kt).
 */
class RoutesActivity : Activity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        actionBar?.hide()
        window.statusBarColor = Ui.BG
        val acts = Api.cached(this, "activities?limit=300")?.optJSONArray("activities") ?: JSONArray()
        val routes = JSONArray()
        for (i in 0 until acts.length()) {
            val a = acts.getJSONObject(i)
            val poly = a.optJSONObject("map")?.optString("summary_polyline").orEmpty()
            if (poly.isNotEmpty()) routes.put(JSONArray().put(poly).put(a.optString("sport_type").ifEmpty { a.optString("type") }))
        }
        val web = WebView(this).apply {
            setBackgroundColor(Ui.BG)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
        }
        setContentView(web)
        web.loadDataWithBaseURL(BuildConfig.DASHBOARD_URL, HTML.replace("__M3D__", Map3d.JS).replace("__ROUTES__", routes.toString()), "text/html", "utf-8", null)
    }

    companion object {
        private val HTML = """
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
 html,body,#m{margin:0;height:100%;background:#0c0c0c;font:600 12px system-ui,sans-serif}
 #d3{position:absolute;inset:0;z-index:500;display:none;background:#0c0c0c}
 /* rows that wrap instead of overlapping on narrow phones */
 .row{position:absolute;z-index:1000;left:12px;right:12px;display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;align-items:flex-start;pointer-events:none}
 #top{top:12px} #bot{bottom:16px}
 .bar{display:flex;gap:6px;flex-wrap:wrap;pointer-events:auto;flex:0 0 auto;max-width:100%}
 .bar button{border:1px solid #2a2a33;background:rgba(22,22,28,.92);color:#cfcfd6;border-radius:8px;padding:7px 11px;font:inherit;white-space:nowrap}
 .bar button.on{background:#fc4c02;border-color:#fc4c02;color:#fff}
 #count{pointer-events:auto;background:rgba(22,22,28,.92);border:1px solid #2a2a33;border-radius:8px;padding:7px 11px;color:#cfcfd6}
</style></head><body><div id="m"></div><div id="d3"></div>
<div class="row" id="top"><div id="count"></div>
<div class="bar" id="base"><button data-b="dark" class="on">Dark</button><button data-b="sat">Satellite</button><button data-b="osm">Map</button><button data-b="3d">3D</button></div></div>
<div class="row" id="bot"><div class="bar" id="type"><button data-t="all" class="on">All</button><button data-t="ride">Rides</button><button data-t="run">Runs</button><button data-t="walk">Walks & hikes</button></div></div>
<script>
__M3D__
var routes=__ROUTES__, m=L.map('m',{zoomControl:false,attributionControl:false,preferCanvas:true});
var E='https://server.arcgisonline.com/ArcGIS/rest/services/';
var bases={dark:L.tileLayer(E+'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16}),
 sat:L.tileLayer(E+'World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
 osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19})};
var cur=bases.dark.addTo(m), is3d=false, lines=[];
document.querySelectorAll('#base button').forEach(function(b){b.onclick=function(){
 if(b.dataset.b==='3d'){ is3d=!is3d; b.classList.toggle('on',is3d); if(is3d) M3D.open(document.getElementById('d3'),lines); else M3D.close(); return; }
 if(is3d) document.querySelector('#base [data-b="3d"]').onclick();
 m.removeLayer(cur);cur=bases[b.dataset.b].addTo(m);
 document.querySelectorAll('#base button').forEach(function(x){if(x.dataset.b!=='3d')x.classList.toggle('on',x===b)});}});
function dec(s){var o=[],i=0,la=0,ln=0;while(i<s.length){for(var k=0;k<2;k++){var sh=0,r=0,b;do{b=s.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32&&i<s.length);var dd=r&1?~(r>>1):r>>1;if(k===0)la+=dd;else ln+=dd;}o.push([la/1e5,ln/1e5]);}return o;}
var all=routes.map(function(r){return {pts:dec(r[0]),t:r[1]}});
function kind(t){return /Ride/.test(t)?'ride':/Run/.test(t)?'run':/Walk|Hike/.test(t)?'walk':'other';}
var layer=null;
function draw(f){if(layer)m.removeLayer(layer);layer=L.layerGroup();var b=L.latLngBounds([]),n=0;lines=[];
 var shown=all.filter(function(r){return r.pts.length&&(f==='all'||kind(r.t)===f)});
 // zoom to where most routes start (median), so one trip far away doesn't zoom out to a whole country
 var la=shown.map(function(r){return r.pts[0][0]}).sort(function(x,y){return x-y}), lo=shown.map(function(r){return r.pts[0][1]}).sort(function(x,y){return x-y});
 var c=la.length?[la[la.length>>1],lo[lo.length>>1]]:null;
 shown.forEach(function(r){n++;L.polyline(r.pts,{color:'#fc4c02',weight:2.5,opacity:.35}).addTo(layer);lines.push({p:r.pts,c:'#fc4c02',w:2.5,o:.5});
  if(c&&Math.abs(r.pts[0][0]-c[0])<0.6&&Math.abs(r.pts[0][1]-c[1])<0.6)r.pts.forEach(function(p){b.extend(p)});});
 layer.addTo(m);M3D.set(lines);document.getElementById('count').textContent=n+' routes';if(b.isValid())m.fitBounds(b,{padding:[20,20]});else m.setView([-8.4,115.2],11);}
document.querySelectorAll('#type button').forEach(function(b){b.onclick=function(){draw(b.dataset.t);
 document.querySelectorAll('#type button').forEach(function(x){x.classList.toggle('on',x===b)});}});
draw('all');
</script></body></html>
"""
    }
}

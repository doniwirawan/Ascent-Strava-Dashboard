/* ── UTILS ── */

/* ── POLYLINE DECODE (Google encoded polyline) ── */
function decodePolyline(enc) {
  const pts=[]; let i=0,lat=0,lng=0;
  while(i<enc.length){
    let s=0,r=0,b; do{b=enc.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5;}while(b>=32);
    lat+=(r&1)?~(r>>1):(r>>1);
    s=r=0; do{b=enc.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5;}while(b>=32);
    lng+=(r&1)?~(r>>1):(r>>1);
    pts.push([lat/1e5,lng/1e5]);
  }
  return pts;
}
/* ── UNITS (km / mi toggle) ── */
let useImperial = localStorage.getItem('units') === 'mi';
const _MI = 1.60934, _FT = 3.28084;
const distUnit  = () => useImperial ? 'mi' : 'km';
const elevUnit  = () => useImperial ? 'ft' : 'm';
const speedUnit = () => useImperial ? 'mph' : 'km/h';
const kmVal   = m  => useImperial ? (m/1000)/_MI : (m/1000);   // metres → km/mi value
const kmDisp  = km => useImperial ? km/_MI : km;               // km value → km/mi value
const elevVal = m  => useImperial ? m*_FT : m;                 // elevation value in m/ft
const kmh     = ms => +(ms * (useImperial ? 2.23694 : 3.6)).toFixed(1); // speed value
const fmtSpeed= ms => kmh(ms) + ' ' + speedUnit();
// Body weight for W/kg. Strava only exposes weight with the profile:read_all
// scope AND when the athlete has shared it; older tokens return nothing. Fall
// back to the owner's known weight so W/kg always renders.
const FALLBACK_WEIGHT_KG = 78;
const athWeightKg = () => (typeof currentAthlete !== 'undefined' && currentAthlete && currentAthlete.weight) || FALLBACK_WEIGHT_KG;
// Strava derives max_speed from a single GPS sample, so one satellite glitch
// can report an impossible peak (90+ km/h on a road bike). Rather than hide
// those, we now show the real max_speed everywhere — glitches can be corrected
// per-activity via GPS Fix → Normalize, which persists a realistic value that
// applyMaxFixOverrides() writes back onto max_speed. MAX_SPEED_CEILING (m/s,
// unit-independent) is still the "abnormal" threshold used by that tool.
const MAX_SPEED_CEILING = 65 / 3.6;                                       // 65 km/h
const cleanMax = a => {
  const v = a && a.max_speed;
  return v > 0 ? v : 0;
};
// running pace: seconds per km/mi → "m:ss /km" (— when no speed)
const fmtPace = ms => {
  if (!ms || ms <= 0) return '—';
  const spu = (useImperial ? _MI*1000 : 1000) / ms; // seconds per unit
  const m = Math.floor(spu/60), s = Math.round(spu%60);
  const mm = s===60 ? m+1 : m, ss = s===60 ? 0 : s;
  return `${mm}:${String(ss).padStart(2,'0')} /${distUnit()}`;
};
const fmtKm   = m  => kmVal(m).toFixed(1);                     // distance value, 1 dp (unit implied)
const fmtD    = m  => {
  if (useImperial) { const mi=(m/1000)/_MI; return mi>=0.1 ? mi.toFixed(1)+' mi' : Math.round(m*_FT)+' ft'; }
  return m >= 1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m';
};
const fmtElev = m  => Math.round(elevVal(m)).toLocaleString() + ' ' + elevUnit();

function setUnits(imperial){
  useImperial = !!imperial;
  localStorage.setItem('units', useImperial ? 'mi' : 'km');
  document.querySelectorAll('[data-unit]').forEach(b=>b.classList.toggle('active',(b.dataset.unit==='mi')===useImperial));
  if (typeof acts==='undefined' || !acts.length) return;
  const cur = _ALL_SECTIONS.find(id=>{const e=document.getElementById(id);return e&&e.style.display!=='none';}) || 'statRow';
  renderAll();
  const navBtn = document.querySelector('#sidebarNav .nav-link[onclick*="'+cur+'"]') || document.querySelector('.nav-link[onclick*="'+cur+'"]');
  navScrollTo(cur, navBtn);
  try{ if(document.getElementById('storyModal')&&document.getElementById('storyModal').classList.contains('open')) drawStoryCanvas(); }catch{}
}

const fmtT  = s   => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const fmtDays = s => { const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600); return d>0?`${d}d ${h}h`:`${h}h`; }; // duration as days+hours
// Display date WITH the weekday, localised to the app language ("Sat, 20 Sep" /
// "Sab, 20 Sep"). This is the default everywhere a date identifies a day.
const fmtDt = d   => new Date(d).toLocaleDateString(
  (typeof window!=='undefined' && window.LANG==='id') ? 'id-ID' : 'en-GB',
  {weekday:'short', day:'numeric', month:'short'});
// Compact, weekday-less form ("20 Sep") for dense chart axes and the story card,
// where a weekday on every label would clutter or overflow.
const fmtDtShort = d => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
/* Where an activity went, for list rows: "📍 Guwang → Kintamani, Bangli" (start
   desa → destination desa, kecamatan). Full names in the tooltip. `sep` is put
   in front when there is a label. '' until the places backfill has reached it. */
function placeTag(a, sep){
  const rp=a&&a.route_places; if(!rp||!rp.start_place) return '';
  const dest=rp.furthest_landmark ? rp.furthest_landmark+' ('+rp.furthest_place+')' : rp.furthest_place;
  const full=rp.furthest_place ? rp.start_place+' → '+dest+' ('+fmtD(rp.furthest_km_from_start*1000)+' out)' : rp.start_place;
  // the start is home: wrapped in .no-ai so AI page insights never read it
  const txt=rp.furthest_place ? '<span class="no-ai">'+rp.start_place.split(',')[0]+' → </span>'+destName(rp) : '<span class="no-ai">'+rp.start_place+'</span>';
  return (sep||'')+'<span class="act-place'+(rp.furthest_place?'':' loop')+'" title="'+full.replace(/"/g,'&quot;')+'">📍 '+txt+'</span>';
}
// Local calendar-date key "YYYY-MM-DD" for a Date, matching the wall-clock date
// in start_date_local (never UTC, so early-morning activities key to the right
// day). Used for streak/active-day maths so day-sets and back-counting agree.
const localDayStr = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
// An activity's LOCAL calendar date as a Date at UTC-midnight, so getUTC* reads
// the wall-clock year/month/weekday regardless of the viewer's timezone.
const actLocalDate = a => new Date((((a&&(a.start_date_local||a.start_date))||'').slice(0,10)||'1970-01-01')+'T00:00:00Z');
const isRide= a   => ['Ride','VirtualRide','EBikeRide','GravelRide','MountainBikeRide'].includes(a.type);
// NOTE: isRun() is defined in render-sections.js (loaded after this file)

function setStatus(msg, cls='') {
  const el = document.getElementById('statusBar');
  el.className = cls;
  el.innerHTML = cls==='loading' ? `<div class="spin"></div> ${msg}` : msg;
}

function destroyChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }

/* Pan/zoom for every chart in the app.
   The wheel is deliberately gated behind Ctrl: these pages are long stacks of
   charts, and un-gated wheel zoom would swallow the page scroll every time the
   cursor crossed one. Pinch works bare on touch, and drag pans. */
function chartZoomOpts() {
  if (typeof Chart === 'undefined' || !Chart.registry || !Chart.registry.plugins.get('zoom')) return undefined;
  return {
    pan:  { enabled:true, mode:'x', modifierKey:null, threshold:8 },
    zoom: { wheel:{ enabled:true, modifierKey:'ctrl', speed:0.08 },
            pinch:{ enabled:true },
            drag:{ enabled:false },
            mode:'x' },
    limits: { x:{ minRange: 2 } }
  };
}

function chartOpts(unit='', legend=false) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{ display:legend, labels:{color:'#666',font:{size:11},boxWidth:10} },
      zoom: chartZoomOpts(),
      tooltip:{ backgroundColor:'#1a1a1a', borderColor:'#2a2a2a', borderWidth:1,
        titleColor:'#fff', bodyColor:'#aaa',
        callbacks:{ label: ctx=>' '+ctx.parsed.y+' '+unit } }
    },
    scales:{
      x:{ grid:{color:'#1c1c1c'}, ticks:{color:'#555',font:{size:10},maxRotation:45} },
      y:{ grid:{color:'#1c1c1c'}, ticks:{color:'#555',font:{size:10}}, beginAtZero:false }
    }
  };
}

const _ALL_SECTIONS=['statRow','cyclingSection','runningSection','trendsSection','actSection','calSection',
  'eddySection','trainingSection','sleepSection','monthlySection','bestSection','gearSection','heatSection',
  'segmentsSection','gapsSection','milestonesSection','rewindSection','challengesSection','photosSection','fixSection','settingsSection','helpSection'];

// True while the Overview (statRow) is the section on screen. Overview-only
// cards that fill asynchronously must check this before unhiding themselves —
// otherwise a slow load pops the card onto whatever page the user is on.
function isOverviewVisible(){
  const el=document.getElementById('statRow');
  return !!el && getComputedStyle(el).display!=='none';
}

function navScrollTo(id, btn) {
  _ALL_SECTIONS.forEach(s=>{const el=document.getElementById(s);if(el)el.style.display='none';});
  const el=document.getElementById(id);
  if(el) el.style.display='';
  // Fun-insights panel, HR-zones card + install banner live with the Overview (statRow) view only
  const ovi=document.getElementById('ovInsights'); if(ovi) ovi.style.display = id==='statRow' ? '' : 'none';
  const ovHrz=document.getElementById('ovHrz'); if(ovHrz) ovHrz.style.display = id==='statRow' ? '' : 'none';
  const ovSpdz=document.getElementById('ovSpdz'); if(ovSpdz) ovSpdz.style.display = id==='statRow' ? '' : 'none';
  // By-sport breakdown + Readiness card also belong to the Overview only — show
  // them there when they have content, hide everywhere else (not on every page).
  const ovSport=document.getElementById('sportBreakdown'); if(ovSport) ovSport.style.display = (id==='statRow' && ovSport.innerHTML.trim()) ? '' : 'none';
  const ovRdy=document.getElementById('readinessCard'); if(ovRdy) ovRdy.style.display = (id==='statRow' && ovRdy.innerHTML.trim()) ? '' : 'none';
  const ovAi=document.getElementById('ovAiInsight'); if(ovAi) ovAi.style.display = (id==='statRow' && ovAi.innerHTML.trim()) ? '' : 'none';
  const ovInst=document.getElementById('ovInstall');
  if(ovInst) ovInst.style.display = (id==='statRow' && window._pwaInstallReady) ? '' : 'none';
  try{ localStorage.setItem('lastSection', id); }catch{}
  window.scrollTo({top:0,behavior:'smooth'});
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  // Lazy-init heatmap when first shown
  if(id==='heatSection'){
    if(!leafletMapInst) renderHeatmap();
    else setTimeout(()=>{try{leafletMapInst.invalidateSize();}catch{}},80);
  }
  // Lazy-load API-heavy sections on first open (rate-limit friendly). Each
  // render reuses cached data, so this only hits Strava once per refresh.
  const _empty = gid => { const e=document.getElementById(gid); return e && !e.innerHTML.trim(); };
  try {
    if(id==='gearSection' && _empty('gearGrid') && typeof renderGear==='function') renderGear();
    if(id==='challengesSection' && _empty('challengesGrid') && typeof renderChallenges==='function') renderChallenges();
    if(id==='fixSection' && typeof renderFixSection==='function') renderFixSection();
    if(id==='gapsSection'){
      if(_empty('gapsGrid') && typeof renderGaps==='function') renderGaps();
      else if(typeof _gapMaps!=='undefined') setTimeout(()=>{_gapMaps.forEach(({m,line})=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),{padding:[16,16]});}catch{}});},80);
    }
    if(id==='segmentsSection'){
      if(_empty('segmentsGrid') && typeof renderSegments==='function') renderSegments();
      // Segment mini-maps build while hidden (0×0) — re-size and re-fit on show
      else if(typeof segMaps!=='undefined') setTimeout(()=>{segMaps.forEach(({m,line})=>{try{m.invalidateSize();m.fitBounds(line.getBounds(),SEG_FIT);}catch{}});},80);
    }
  } catch(e){ console.error('lazy render failed:', id, e); }
  // Resize charts after section becomes visible
  setTimeout(()=>{Object.values(charts).forEach(c=>{try{if(c&&c.resize)c.resize();}catch{}});},80);
  // Re-attach pan/zoom controls: lazy sections (Gear, Segments, Trophies) and
  // Rewind's requestAnimationFrame build their charts after renderAll has run.
  // addChartZoomControls replaces its own controls, so repeat calls are safe.
  setTimeout(()=>{try{ addChartZoomControls(document.getElementById(id)); }catch{}},120);
  setTimeout(()=>{try{ addChartZoomControls(document.getElementById(id)); }catch{}},900);
  // AI insight for relevant sections (cached per data signature, lazy)
  try { if (typeof aiSectionInsight === 'function') aiSectionInsight(id); } catch {}
  // Build the bulk caption tool lists when the Activities page opens
  try { if (id === 'actSection' && typeof bulkBuildList === 'function') { bulkBuildList('aiBulk'); bulkBuildList('stBulk'); } } catch {}
  // the regency map is built while hidden (0×0) — re-render/fit once visible
  if (id === 'actSection' && typeof renderRegencyMap === 'function') setTimeout(renderRegencyMap, 80);
  if (window.applyI18n) window.applyI18n();
}


/* ── CHART ZOOM CONTROLS ──────────────────────────────────────────────────────
   Buttons rather than gestures alone: Ctrl+wheel is not discoverable, and on a
   phone there is no wheel at all. Attaches one control cluster per canvas that
   has a registered Chart, and is safe to call repeatedly (it replaces its own
   controls rather than stacking them up). */
function addChartZoomControls(root) {
  if (typeof Chart === 'undefined' || !Chart.registry || !Chart.registry.plugins.get('zoom')) return;
  const scope = root || document;
  scope.querySelectorAll('canvas').forEach(cv => {
    // Chart.getChart() resolves by canvas, so this works regardless of what key
    // the chart was stored under (charts['trPmc'] for canvas #trPmcChart) or
    // whether it was put in the `charts` map at all (Rewind keeps its own ref).
    const ch = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(cv)
             : ((typeof charts !== 'undefined' && charts) ? charts[cv.id] : null);
    if (!ch) return;
    const wrap = cv.parentElement;
    if (!wrap) return;
    const old = wrap.querySelector(':scope > .chart-zoom');
    if (old) old.remove();
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

    const bar = document.createElement('div');
    bar.className = 'chart-zoom';
    const mk = (txt, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = txt; b.title = title; b.setAttribute('aria-label', title);
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); fn(); };
      bar.appendChild(b);
    };
    const T = (typeof tr === 'function') ? tr : (x => x);
    // Slide the window along the x axis — a quarter of the visible span per tap,
    // for anyone not dragging the chart itself (and for touch, where a drag
    // scrolls the page). ch.pan takes pixels: +x reveals earlier data.
    const step = () => ((ch.chartArea && ch.chartArea.width) || 200) * 0.25;
    mk('‹', T('Pan left'),  () => { try { ch.pan({ x:  step() }, undefined, 'default'); } catch {} });
    mk('›', T('Pan right'), () => { try { ch.pan({ x: -step() }, undefined, 'default'); } catch {} });
    mk('+', T('Zoom in'),  () => { try { ch.zoom(1.25); } catch {} });
    mk('−', T('Zoom out'), () => { try { ch.zoom(0.8); } catch {} });
    mk('⟲', T('Reset zoom'), () => { try { ch.resetZoom(); } catch {} });
    wrap.appendChild(bar);
  });
}

/* ── BASEMAP ──
   CARTO stopped serving anonymous basemap tiles — requests without an API key
   now come back stamped "API KEY REQUIRED". Set CONFIG.cartoKey (free account
   at carto.com) to go back to CARTO's dark_all; with no key we use OSM tiles
   turned dark by a CSS filter. The filter is scoped to .leaflet-dark-tiles on
   the map container so it hits the tile pane only — route overlays keep their
   real colours. */
const BASEMAP = (typeof CONFIG !== 'undefined' && CONFIG.cartoKey)
  ? { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=' + CONFIG.cartoKey,
      opts: { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; <a href="https://carto.com">CARTO</a>' },
      invert: false, filter: '' }
  : { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
      invert: true,
      // keep in sync with .leaflet-dark-tiles in css/components.css
      filter: 'invert(1) hue-rotate(180deg) saturate(0.28) brightness(0.72) contrast(1.12)' };

/* Alternate views offered by the map switcher. Esri's tiles are key-free and
   global; `invert` marks the one view that needs the dark CSS filter. */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const BASEMAP_VIEWS = [
  Object.assign({ id: 'dark', name: 'Dark' }, BASEMAP),
  { id: 'sat',    name: 'Satellite', invert: false, url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opts: { maxZoom: 19, attribution: 'Imagery &copy; Esri' } },
  { id: 'topo',   name: 'Terrain',   invert: false, url: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    opts: { maxZoom: 19, attribution: '&copy; Esri' } },
  { id: 'relief', name: 'Relief',    invert: false, url: ESRI + 'Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    opts: { maxZoom: 19, attribution: 'Hillshade &copy; Esri' } },
];

/* Add the basemap to a Leaflet map. Pass {switcher:true} to also attach the
   Dark/Satellite/Terrain/Relief layer control; the pick is remembered across
   visits. Any other option is merged into the tileLayer. */
function addBasemap(map, extra) {
  extra = extra || {};
  const switcher = extra.switcher;
  delete extra.switcher;

  const mk = v => L.tileLayer(v.url, Object.assign({}, v.opts, extra));
  const applyInvert = v => {
    try { map.getContainer().classList.toggle('leaflet-dark-tiles', !!v.invert); } catch {}
  };

  if (!switcher) { const l = mk(BASEMAP).addTo(map); applyInvert(BASEMAP); map._bmView = BASEMAP; return l; }

  const T = (typeof tr === 'function') ? tr : (x => x);
  const saved = localStorage.getItem('map_view');
  const start = BASEMAP_VIEWS.find(v => v.id === saved) || BASEMAP_VIEWS[0];
  const layers = {}, byLayer = new Map();
  BASEMAP_VIEWS.forEach(v => { const l = mk(v); layers[T(v.name)] = l; byLayer.set(l, v); });

  const active = layers[T(start.name)];
  active.addTo(map);
  applyInvert(start);
  map._bmView = start;                    // PNG export renders the view on screen
  L.control.layers(layers, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', e => {
    const v = byLayer.get(e.layer);
    if (!v) return;
    applyInvert(v);
    map._bmView = v;
    try { localStorage.setItem('map_view', v.id); } catch {}
  });
  return active;
}

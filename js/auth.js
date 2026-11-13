/* ── AUTH ── */

function isTokenExpired() {
  const exp = parseInt(localStorage.getItem('strava_expires_at') || '0', 10);
  return Date.now() / 1000 >= exp - 60; // treat as expired 60s early
}

function showReconnect() {
  const SCOPE    = 'read,activity:read_all,profile:read_all,activity:write,profile:write';
  const REDIRECT = encodeURIComponent(window.location.origin + '/callback');
  const authUrl  = `https://www.strava.com/oauth/authorize?client_id=${CONFIG.clientId}&response_type=code&redirect_uri=${REDIRECT}&approval_prompt=force&scope=${SCOPE}`;
  setStatus(tr('Session expired') + '<a href="' + authUrl + '" style="color:var(--orange);font-weight:700">' + tr('Reconnect with Strava →') + '</a>');
  const btn = document.getElementById('mainBtn');
  btn.textContent = tr('Reconnect');
  btn.disabled = false;
  btn.onclick = () => { window.location.href = authUrl; };
}

async function doRefresh() {
  // token refresh runs server-side so the client secret never reaches the browser
  const r = await fetch('/api/strava-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: CONFIG.refreshToken })
  });
  if (r.status === 400 || r.status === 401) {
    // Token is invalid/revoked — clear storage and prompt re-auth
    localStorage.removeItem('strava_access_token');
    localStorage.removeItem('strava_refresh_token');
    localStorage.removeItem('strava_expires_at');
    CONFIG.accessToken = '';
    CONFIG.refreshToken = '';
    const err = new Error('SESSION_EXPIRED');
    err.sessionExpired = true;
    throw err;
  }
  if (!r.ok) throw new Error('Token refresh failed (' + r.status + ')');
  const d = await r.json();
  CONFIG.accessToken  = d.access_token;
  CONFIG.refreshToken = d.refresh_token;
  localStorage.setItem('strava_access_token',  d.access_token);
  localStorage.setItem('strava_refresh_token', d.refresh_token);
  localStorage.setItem('strava_expires_at',    d.expires_at);
}

async function api(ep, retry = false) {
  const r = await fetch('https://www.strava.com/api/v3' + ep, {
    headers: { Authorization: 'Bearer ' + CONFIG.accessToken }
  });
  if (r.status === 401 && !retry) { await doRefresh(); return api(ep, true); }
  if (!r.ok) throw new Error('API ' + r.status + '' + ep);
  return r.json();
}

// write helper (needs activity:write scope)
async function apiPut(ep, body, retry = false) {
  const r = await fetch('https://www.strava.com/api/v3' + ep, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + CONFIG.accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status === 401 && !retry) { await doRefresh(); return apiPut(ep, body, true); }
  if (!r.ok) throw new Error('API ' + r.status + '' + ep);
  return r.json();
}

/* ── LOAD ── */
async function loadData(forceRefresh = false) {
  const btn = document.getElementById('mainBtn');
  btn.disabled = true; btn.textContent = tr('Loading…');
  if (forceRefresh) { _segsData = null; _photosLoaded = false; _chalCache = null; _gearCache = null; if (typeof clearStreamCache==='function') clearStreamCache(); } // refetch lazy sections on explicit refresh
  try {
    const cachedAthleteId = localStorage.getItem('strava_athlete_id');

    // 1) Instant local render from this browser's copy (no token/network)
    if (!forceRefresh && cachedAthleteId) {
      const local = cacheLoadLocal(cachedAthleteId);
      if (local && local.length) {
        acts = local;
        renderAll();
        setStatus('✓ ' + trf('{0} activities (cached)', acts.length) + '<a href="#" onclick="loadData(true);return false;" style="color:var(--orange);font-weight:700">' + tr('Refresh from Strava') + '</a>', 'success');
        btn.textContent = tr('Refresh'); btn.disabled = false;
        // Silently refresh athlete profile; ignore token errors against cached data
        try {
          if (isTokenExpired()) await doRefresh();
          const ftpBefore = (typeof estimateFtp === 'function') && (estimateFtp() || {}).value;
          renderAthlete(await api('/athlete'));
          // cards above were drawn before the athlete's Strava FTP/weight arrived — redraw if FTP changed
          if (typeof estimateFtp === 'function' && (estimateFtp() || {}).value !== ftpBefore) {
            [renderTraining, typeof renderPlan === 'function' && renderPlan, typeof renderPower === 'function' && renderPower].forEach(fn => { try { fn && fn(); } catch (e) { console.error(e); } });
          }
          // list was drawn before the athlete (and its bikes) loaded — redraw for bike labels
          _renderActList((document.getElementById('actSearch') || {}).value || '');
          await loadHrZones();
          _gearCache = null; // replace the list drawn before the athlete arrived
          renderGear();
        } catch {}
        return;
      }
    }

    setStatus(tr('Refreshing token…'), 'loading');
    if (isTokenExpired()) await doRefresh();
    setStatus(tr('Loading profile…'), 'loading');
    const athlete = await api('/athlete');
    renderAthlete(athlete);
    await loadHrZones();

    // 2) Remote cache (e.g. first visit on a new device), now that the token
    //    is valid so the Edge Function can identify this athlete.
    if (!forceRefresh) {
      setStatus(tr('Checking cache…'), 'loading');
      const remote = await cacheLoadRemote(athlete.id);
      if (remote && remote.length) {
        acts = remote;
        renderAll();
        renderGear();
        setStatus('✓ ' + trf('{0} activities (cached)', acts.length) + '<a href="#" onclick="loadData(true);return false;" style="color:var(--orange);font-weight:700">' + tr('Refresh from Strava') + '</a>', 'success');
        btn.textContent = tr('Refresh'); btn.disabled = false;
        return;
      }
    }

    setStatus(tr('Fetching activities…'), 'loading');
    // Page through the athlete's full history (newest first) until the last
    // partial page. MAX_PAGES is only a runaway safety bound (~40k activities).
    const PER = 200, MAX_PAGES = 200;
    acts = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await api(`/athlete/activities?per_page=${PER}&page=${page}`);
      if (!batch || !batch.length) break;
      acts = acts.concat(batch);
      setStatus(trf('Fetching activities… ({0})', acts.length), 'loading');
      if (batch.length < PER) break; // last page reached
    }
    renderAll();
    cacheSave(acts, athlete.id);
    setStatus('✓ ' + trf('{0} activities loaded', acts.length), 'success');
    btn.textContent = tr('Refresh'); btn.disabled = false;
  } catch (e) {
    if (e.sessionExpired) { showReconnect(); return; }
    setStatus(tr('Error:') + ' ' + e.message, 'error');
    btn.textContent = tr('Retry'); btn.disabled = false;
  }
}

/* ── RENDER ATHLETE ── */
function renderAthlete(a) {
  currentAthlete = a;
  if (a.id) localStorage.setItem('strava_athlete_id', a.id);
  if (a.bikes) { try { localStorage.setItem('strava_bikes_v1', JSON.stringify(a.bikes)); } catch {} }
  const avUrl = a.profile_medium||a.profile;   // an empty src would re-request the page itself
  if (avUrl) document.getElementById('av').src = avUrl;
  document.getElementById('aname').textContent = a.firstname+' '+a.lastname;
  document.getElementById('badge').style.display = 'flex';
  // Update sidebar user profile
  const su=document.getElementById('sidebarUser');
  if(su){
    if (avUrl) document.getElementById('sidebarAv').src=avUrl;
    document.getElementById('sidebarName').textContent=a.firstname+' '+a.lastname;
    su.style.display='flex';
  }
}

/* ── DEMO ── */
function _demoEncode(points){
  let last=[0,0],out='';
  const e=v=>{v=v<0?~(v<<1):(v<<1);let s='';while(v>=0x20){s+=String.fromCharCode((0x20|(v&0x1f))+63);v>>=5;}s+=String.fromCharCode(v+63);return s;};
  for(const p of points){const a=Math.round(p[0]*1e5),b=Math.round(p[1]*1e5);out+=e(a-last[0])+e(b-last[1]);last=[a,b];}
  return out;
}
function _demoRoute(clat,clng,size,seed){
  const pts=[],n=64;
  for(let i=0;i<=n;i++){const t=i/n*Math.PI*2;const rr=size*(0.62+0.38*Math.sin(t*3+seed)+0.18*Math.cos(t*5+seed*1.7));pts.push([clat+rr*Math.sin(t)*0.85,clng+rr*Math.cos(t)*1.25]);}
  return _demoEncode(pts);
}
/* Demo data: ~13 months of a plausible multi-sport week, newest first, so every
   page has something to show (trends, year-on-year, gear, power, swims, GPS
   fixes, virtual rides). Seeded, so the demo looks the same on every load. */
function loadDemo() {
  let seed=20261113; const r=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const pick=a=>a[Math.floor(r()*a.length)];
  const N={
    Ride:['Morning Ride','Coffee Ride','Coastal Spin','Sanur Sprint','Recovery Spin','Tempo Loop','Sweet-spot Intervals'],
    Long:['Long Endurance Ride','Bedugul Climb','Kintamani Loop','Ubud Hills','Bukit Climb'],
    GravelRide:['Rice Terrace Gravel','Jatiluwih Dirt Roads','Back-road Explorer'],
    MountainBikeRide:['Trail Session','Jungle Singletrack','Ridge Descents'],
    VirtualRide:['Zwift: Watopia Flat','Zwift: Alpe du Zwift','MyWhoosh: Endurance Block'],
    Run:['Morning Run','Tempo Run','Easy Recovery Run','Track Intervals','Beach Run','Hill Repeats'],
    LongRun:['Sunday Long Run','Progression Run'],
    Walk:['Evening Walk','Beach Walk'], Hike:['Sunrise Hike','Volcano Hike','Ridge Trek'],
    Swim:['Pool Swim','Open-water Swim'], WeightTraining:['Strength','Core & Mobility'],
  };
  const centers=[[-8.67,115.15],[-8.51,115.26],[-8.34,115.16],[-8.79,115.17],[-8.41,115.20]];
  const bikes=[
    {id:'bdemo1',name:'Endurance road bike',primary:true,distance:0},
    {id:'bdemo2',name:'Gravel bike',primary:false,distance:0},
    {id:'bdemo3',name:'Trail MTB',primary:false,distance:0},
  ];
  // the week: [weekday, type, chance]; Sat long ride, Sun long run or gravel/MTB
  const WEEK={0:[['LongRun',.4],['GravelRide',.2],['MountainBikeRide',.12]],1:[['Swim',.3]],2:[['Ride',.6],['Run',.2]],
    3:[['Ride',.5]],4:[['Run',.5],['VirtualRide',.2]],5:[['WeightTraining',.35],['Walk',.1]],6:[['Long',.85],['Hike',.08]]};
  const now=new Date(), list=[]; let id=900000;
  for(let d=0; d<480 && list.length<200; d++){
    const day=new Date(now.getTime()-d*864e5), dow=day.getUTCDay(), month=day.getUTCMonth();
    const wet=month===11||month<=1;                       // monsoon: fewer outdoor sessions
    const build=1-d/520;                                  // fitness builds toward today
    for(const [kind,p] of WEEK[dow]||[]){
      if(r()>.82*p*(wet&&kind!=='VirtualRide'&&kind!=='Swim'&&kind!=='WeightTraining'?.65:1)) continue;
      const type=kind==='Long'?'Ride':kind==='LongRun'?'Run':kind;
      const ride=/Ride$/.test(type), virt=type==='VirtualRide', indoor=virt||type==='Swim'||type==='WeightTraining';
      let dist,avgS,elev;
      if(kind==='Long'){dist=(75e3+r()*70e3)*build;avgS=7.4+r()*1.4;elev=900+r()*1600;}
      else if(type==='Ride'){dist=(28e3+r()*30e3)*build;avgS=7.8+r()*1.8;elev=150+r()*500;}
      else if(type==='GravelRide'){dist=40e3+r()*35e3;avgS=6.2+r()*1.2;elev=500+r()*900;}
      else if(type==='MountainBikeRide'){dist=18e3+r()*16e3;avgS=4.3+r()*1.2;elev=600+r()*800;}
      else if(virt){dist=25e3+r()*25e3;avgS=8.5+r()*1.5;elev=100+r()*900;}
      else if(kind==='LongRun'){dist=14e3+r()*9e3;avgS=2.9+r()*.4;elev=80+r()*200;}
      else if(type==='Run'){dist=5e3+r()*7e3;avgS=3.0+r()*.7;elev=20+r()*120;}
      else if(type==='Swim'){dist=1200+r()*1600;avgS=.62+r()*.2;elev=0;}
      else if(type==='WeightTraining'){dist=0;avgS=0;elev=0;}
      else if(type==='Hike'){dist=6e3+r()*8e3;avgS=1.1+r()*.4;elev=400+r()*900;}
      else {dist=3e3+r()*4e3;avgS=1.3+r()*.3;elev=10+r()*40;}
      const mt=dist?dist/avgS:(35+r()*30)*60;
      const hour=kind==='Long'||kind==='LongRun'?5+Math.floor(r()*2):(r()<.6?6:17);
      const local=new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),hour,Math.floor(r()*60)));
      const meter=ride&&d<185;                              // power meter fitted ~6 months ago
      const watts=ride?Math.round((kind==='Long'?175:200)+r()*45):undefined;
      const hr=type==='WeightTraining'?108+r()*12:type==='Swim'?128+r()*14:ride?(128+r()*30):(140+r()*28);
      const c=centers[id%centers.length];
      const nm=pick(N[kind]||N[type]);
      let maxS=avgS*(type==='Swim'?1.3:1.35+r()*.4);
      const a={
        id:id++, name:nm, type, sport_type:type,
        distance:dist, moving_time:mt, elapsed_time:mt*(1.04+r()*.18),
        average_speed:avgS, max_speed:maxS,
        total_elevation_gain:elev, elev_high:elev?60+elev*.7:0,
        average_heartrate:Math.round(hr), max_heartrate:Math.round(hr+14+r()*18),
        average_cadence:ride?Math.round(80+r()*12):(type==='Run'?Math.round(84+r()*6):undefined),
        average_watts:watts, weighted_average_watts:watts&&Math.round(watts*(1.04+r()*.08)),
        max_watts:ride?Math.round(500+r()*450):undefined, device_watts:meter||virt,
        kilojoules:ride?Math.round(mt*watts/1000):undefined,
        calories:Math.round(ride?mt*watts/1000*1.05:(dist?dist/1000*62:mt/60*7)),
        suffer_score:Math.round(mt/60*(kind==='Long'?1.3:1)*(.6+r()*.6)),
        kudos_count:Math.round(3+r()*(kind==='Long'?45:20)),
        pr_count:r()>.75?Math.round(1+r()*3):0, achievement_count:r()>.55?Math.round(1+r()*6):0,
        total_photo_count:!indoor&&r()>.7?Math.round(1+r()*3):0,
        trainer:virt, gear_id:ride&&!virt?(type==='GravelRide'?'bdemo2':type==='MountainBikeRide'?'bdemo3':'bdemo1'):undefined,
        start_date:new Date(local.getTime()-8*36e5).toISOString(), start_date_local:local.toISOString(),
        location_city:['Denpasar','Ubud','Bedugul','Uluwatu','Canggu'][id%5], location_state:'Bali', location_country:'Indonesia',
      };
      if(!indoor || virt){ a.start_latlng=[c[0],c[1]]; a.map={summary_polyline:_demoRoute(c[0],c[1],Math.min(.09,.012+dist/2.4e6),id*1.3)}; }
      else a.map={summary_polyline:''};
      if(a.gear_id) bikes.find(b=>b.id===a.gear_id).distance+=dist;
      list.push(a);
    }
  }
  // two GPS spikes (86-100 km/h) so the GPS Fix page has something to fix
  list.filter(a=>a.type==='Ride').filter((_,i)=>i===6||i===40).forEach(a=>{a.max_speed=24+r()*4;});
  acts=list;
  renderAthlete({firstname:'Alex',lastname:'Rivera',weight:72,ftp:245,
    profile_medium:'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=160&h=160&fit=crop&crop=faces',
    profile:'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=320&h=320&fit=crop&crop=faces'});
  currentAthlete.bikes=bikes;   // set after renderAthlete so the demo never writes bikes to localStorage
  renderAll();
  setStatus(trf('Demo mode, {0} sample activities', acts.length),'success');
  const btn=document.getElementById('mainBtn');
  btn.textContent=tr('Refresh'); btn.disabled=false;
}

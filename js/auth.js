/* ── AUTH ── */

function isTokenExpired() {
  const exp = parseInt(localStorage.getItem('strava_expires_at') || '0', 10);
  return Date.now() / 1000 >= exp - 60; // treat as expired 60s early
}

function showReconnect() {
  const SCOPE    = 'read,activity:read_all,profile:read_all,activity:write';
  const REDIRECT = encodeURIComponent(window.location.origin + '/callback');
  const authUrl  = `https://www.strava.com/oauth/authorize?client_id=${CONFIG.clientId}&response_type=code&redirect_uri=${REDIRECT}&approval_prompt=force&scope=${SCOPE}`;
  setStatus('Session expired — <a href="' + authUrl + '" style="color:var(--orange);font-weight:700">Reconnect with Strava →</a>');
  const btn = document.getElementById('mainBtn');
  btn.textContent = 'Reconnect';
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
  if (!r.ok) throw new Error('API ' + r.status + ' — ' + ep);
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
  if (!r.ok) throw new Error('API ' + r.status + ' — ' + ep);
  return r.json();
}

/* ── LOAD ── */
async function loadData(forceRefresh = false) {
  const btn = document.getElementById('mainBtn');
  btn.disabled = true; btn.textContent = 'Loading…';
  if (forceRefresh) { _segsData = null; _photosLoaded = false; _chalCache = null; _gearCache = null; } // refetch lazy sections on explicit refresh
  try {
    const cachedAthleteId = localStorage.getItem('strava_athlete_id');

    // 1) Instant local render from this browser's copy (no token/network)
    if (!forceRefresh && cachedAthleteId) {
      const local = cacheLoadLocal(cachedAthleteId);
      if (local && local.length) {
        acts = local;
        renderAll();
        setStatus(`✓ ${acts.length} activities (cached) — <a href="#" onclick="loadData(true);return false;" style="color:var(--orange);font-weight:700">Refresh from Strava</a>`, 'success');
        btn.textContent = 'Refresh'; btn.disabled = false;
        // Silently refresh athlete profile; ignore token errors against cached data
        try {
          if (isTokenExpired()) await doRefresh();
          renderAthlete(await api('/athlete'));
          renderGear();
        } catch {}
        return;
      }
    }

    setStatus('Refreshing token…', 'loading');
    if (isTokenExpired()) await doRefresh();
    setStatus('Loading profile…', 'loading');
    const athlete = await api('/athlete');
    renderAthlete(athlete);

    // 2) Remote cache (e.g. first visit on a new device), now that the token
    //    is valid so the Edge Function can identify this athlete.
    if (!forceRefresh) {
      setStatus('Checking cache…', 'loading');
      const remote = await cacheLoadRemote(athlete.id);
      if (remote && remote.length) {
        acts = remote;
        renderAll();
        renderGear();
        setStatus(`✓ ${acts.length} activities (cached) — <a href="#" onclick="loadData(true);return false;" style="color:var(--orange);font-weight:700">Refresh from Strava</a>`, 'success');
        btn.textContent = 'Refresh'; btn.disabled = false;
        return;
      }
    }

    setStatus('Fetching activities…', 'loading');
    // Page through the athlete's full history (newest first) until the last
    // partial page. MAX_PAGES is only a runaway safety bound (~40k activities).
    const PER = 200, MAX_PAGES = 200;
    acts = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await api(`/athlete/activities?per_page=${PER}&page=${page}`);
      if (!batch || !batch.length) break;
      acts = acts.concat(batch);
      setStatus(`Fetching activities… (${acts.length})`, 'loading');
      if (batch.length < PER) break; // last page reached
    }
    renderAll();
    cacheSave(acts, athlete.id);
    setStatus(`✓ ${acts.length} activities loaded`, 'success');
    btn.textContent = 'Refresh'; btn.disabled = false;
  } catch (e) {
    if (e.sessionExpired) { showReconnect(); return; }
    setStatus('Error: ' + e.message, 'error');
    btn.textContent = 'Retry'; btn.disabled = false;
  }
}

/* ── RENDER ATHLETE ── */
function renderAthlete(a) {
  currentAthlete = a;
  if (a.id) localStorage.setItem('strava_athlete_id', a.id);
  document.getElementById('av').src    = a.profile_medium||a.profile||'';
  document.getElementById('aname').textContent = a.firstname+' '+a.lastname;
  document.getElementById('badge').style.display = 'flex';
  // Update sidebar user profile
  const su=document.getElementById('sidebarUser');
  if(su){
    document.getElementById('sidebarAv').src=a.profile_medium||a.profile||'';
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
function loadDemo() {
  const types=['Ride','Ride','Ride','Run','Ride','Run','GravelRide','Run','Ride','Hike','VirtualRide','Run'];
  const rideNames=['Morning Ride','Sunset Loop','Bukit Climb','Coffee Ride','Ubud Hills','Coastal Spin','Sanur Sprint','Long Endurance Ride','Bedugul Climb','Recovery Spin'];
  const runNames=['Morning Run','Tempo Run','Easy Recovery Run','Long Run','Track Intervals','Beach Run','Hill Repeats','Sunday Long Run','Progression Run','Shakeout Run'];
  const hikeNames=['Sunrise Hike','Ridge Trek','Volcano Hike','Jungle Trail'];
  const centers=[[-8.67,115.15],[-8.51,115.26],[-8.34,115.16],[-8.79,115.17],[-8.41,115.20]];
  const now=Date.now();
  acts=Array.from({length:140},(_,i)=>{
    const type=types[i%types.length];
    const r=()=>Math.random();
    const ride=type.includes('Ride');
    let dist,avgS,maxS;
    if(ride){dist=14000+r()*86000;avgS=6.5+r()*4;maxS=avgS*(1.3+r()*.35);}
    else if(type==='Run'){dist=4000+r()*18000;avgS=2.7+r()*1.4;maxS=avgS*1.25;}
    else{dist=3000+r()*9000;avgS=1.3+r()*0.7;maxS=avgS*1.15;}
    const elev=ride?(120+r()*1400):(40+r()*500);
    const c=centers[i%centers.length];
    const nm=ride?rideNames[i%rideNames.length]:(type==='Run'?runNames[i%runNames.length]:hikeNames[i%hikeNames.length]);
    const mt=dist/avgS;
    const hr=ride?(122+r()*42):(140+r()*38);
    const dateStr=new Date(now-i*86400000*(0.5+r()*.9)).toISOString().replace('Z','Z');
    return {
      id:900000+i, name:nm, type, sport_type:type,
      distance:dist, moving_time:mt, elapsed_time:mt*(1.05+r()*0.25),
      average_speed:avgS, max_speed:maxS,
      total_elevation_gain:elev, elev_high:80+elev*0.6,
      average_heartrate:hr, max_heartrate:hr+12+r()*20,
      average_cadence:ride?(78+r()*16):(82+r()*8),
      average_watts:ride?Math.round(110+r()*120):undefined,
      max_watts:ride?Math.round(400+r()*500):undefined,
      kilojoules:ride?Math.round(mt*(110+r()*120)/1000):undefined,
      calories:Math.round(dist/1000*(ride?22:62)),
      suffer_score:Math.round(20+r()*120),
      kudos_count:Math.round(2+r()*40),
      pr_count:r()>0.7?Math.round(1+r()*3):0,
      achievement_count:r()>0.5?Math.round(1+r()*6):0,
      total_photo_count:r()>0.6?Math.round(1+r()*4):0,
      start_date:dateStr, start_date_local:dateStr,
      start_latlng:[c[0],c[1]],
      location_city:['Denpasar','Ubud','Bedugul','Uluwatu','Canggu'][i%5], location_state:'Bali', location_country:'Indonesia',
      map:{summary_polyline:_demoRoute(c[0],c[1],0.02+r()*0.05,i*1.3)}
    };
  });
  renderAthlete({firstname:'Alex',lastname:'Rivera',
    profile_medium:'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=160&h=160&fit=crop&crop=faces',
    profile:'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=320&h=320&fit=crop&crop=faces'});
  renderAll();
  setStatus(`Demo mode — ${acts.length} sample activities`,'success');
  const btn=document.getElementById('mainBtn');
  btn.textContent='Refresh'; btn.disabled=false;
}

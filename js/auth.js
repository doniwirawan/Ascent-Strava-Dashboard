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
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      refresh_token: CONFIG.refreshToken,
      grant_type:    'refresh_token'
    })
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
  if (forceRefresh) { _segsData = null; _photosLoaded = false; } // refetch segments/photos on explicit refresh
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
function loadDemo() {
  const types=['Ride','Ride','Ride','Run','Hike','VirtualRide','Run'];
  const now=Date.now();
  acts=Array.from({length:120},(_,i)=>{
    const type=types[i%types.length];
    const r=()=>Math.random();
    let dist,avgS,maxS;
    if(type.includes('Ride')){dist=8000+r()*85000;avgS=5+r()*5;maxS=avgS*(1.25+r()*.3);}
    else if(type==='Run'){dist=3000+r()*18000;avgS=2.5+r()*1.5;maxS=avgS*1.2;}
    else{dist=2000+r()*12000;avgS=1.5+r();maxS=avgS*1.1;}
    return {
      name:type+' '+String(i+1).padStart(3,'0'),
      type, distance:dist, moving_time:dist/avgS,
      average_speed:avgS, max_speed:maxS,
      total_elevation_gain:30+r()*700,
      start_date:new Date(now-i*86400000*(0.6+r()*.9)).toISOString()
    };
  });
  renderAthlete({firstname:'Demo',lastname:'Athlete',profile_medium:''});
  renderAll();
  setStatus(`Demo mode — ${acts.length} sample activities`,'success');
  const btn=document.getElementById('mainBtn');
  btn.textContent='Refresh'; btn.disabled=false;
}

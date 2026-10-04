/* ── ONLY ON HUAWEI (Activities page, owner only) ──
   Workouts from the Huawei Health export (Supabase huawei_workouts, via the
   owner-gated /api/huawei) that never reached Strava — Huawei's sync skips
   some modes, e.g. Mountain climbing and Badminton. Each one can be sent to
   Strava from here:
   - with GPS: a GPX is built in the browser from the stored track (time,
     position, altitude, HR every ~2 s) and posted to /uploads, then the sport
     is set, since a GPX doesn't carry Strava's sport type;
   - without GPS: created as a manual activity (time, duration, distance).
   Needs the activity:write scope the dashboard already asks for. */

let _hwList = null, _hwBusy = {};

// Huawei sportType → Strava sport_type (+ trainer for the indoor ones)
const HW_SPORT = {
  2: ['Hike'], 260: ['Hike'], 282: ['Hike'], 257: ['Walk'], 281: ['Walk', true],
  258: ['Run'], 264: ['Run', true], 259: ['Ride'], 262: ['Swim'], 266: ['Swim'], 129: ['Badminton'],
};
const _hwSport = w => HW_SPORT[w.sport_type] || ['Workout'];

async function _hwApi(body, retry) {
  const r = await fetch('/api/huawei', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: CONFIG.accessToken, ...body }) });
  if (r.status === 401 && !retry) { await doRefresh(); return _hwApi(body, true); }
  if (!r.ok) throw new Error('huawei ' + r.status);
  return r.json();
}

// "2026-05-29T05:08:05" in the workout's own time zone (tz like "+0800")
function _hwLocal(iso, tz) {
  const m = /^([+-])(\d\d):?(\d\d)$/.exec(tz || '+0000');
  const off = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
  return new Date(Date.parse(iso) + off * 60000).toISOString().slice(0, 19);
}

function _hwDefaultName(w) {
  const h = +_hwLocal(w.start_time, w.tz).slice(11, 13);
  const part = h < 11 ? 'Morning' : h < 15 ? 'Lunch' : h < 18 ? 'Afternoon' : h < 22 ? 'Evening' : 'Night';
  const sport = { Hike: 'Hike', Walk: 'Walk', Run: 'Run', Ride: 'Ride', Swim: 'Swim', Badminton: 'Badminton' }[_hwSport(w)[0]] || 'Workout';
  return part + ' ' + sport;
}

function _hwGpx(w, name, track) {
  const c = track.cols, I = k => c.indexOf(k);
  const esc = s => String(s).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  const pts = track.rows.map(r => {
    const alt = r[I('alt')], hr = r[I('hr')];
    return '<trkpt lat="' + r[I('lat')] + '" lon="' + r[I('lng')] + '">'
      + (alt != null ? '<ele>' + alt + '</ele>' : '')
      // seconds; older Huawei records were stored in ms — Strava rejects those as "corrupted time data"
      + '<time>' + new Date(r[I('t')] > 1e11 ? r[I('t')] : r[I('t')] * 1000).toISOString() + '</time>'
      + (hr ? '<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>' + Math.round(hr) + '</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>' : '')
      + '</trkpt>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<gpx version="1.1" creator="Ascent (Huawei import)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n'
    + '<trk><name>' + esc(name) + '</name><trkseg>\n' + pts + '\n</trkseg></trk></gpx>\n';
}

async function _hwStrava(path, init, retry) {
  const r = await fetch('https://www.strava.com/api/v3' + path, { ...init, headers: { Authorization: 'Bearer ' + CONFIG.accessToken, ...(init.headers || {}) } });
  if (r.status === 401 && !retry) { await doRefresh(); return _hwStrava(path, init, true); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = JSON.stringify(j);
    throw new Error(/activity:write/.test(msg) ? 'NO_WRITE' : (j.message || 'Strava ' + r.status));
  }
  return j;
}

/* Upload one workout; returns the Strava activity id. */
async function _hwUpload(w, name, step) {
  const [sport, trainer] = _hwSport(w);
  if (w.polyline) {
    step(tr('Building GPX…'));
    const { track } = await _hwApi({ action: 'track', id: w.record_id });
    if (!track || !track.rows || track.rows.length < 2) throw new Error('no track');
    const fd = new FormData();
    fd.append('file', new Blob([_hwGpx(w, name, track)], { type: 'application/gpx+xml' }), 'huawei-' + w.record_id.replace(/\W/g, '') + '.gpx');
    fd.append('data_type', 'gpx');
    fd.append('name', name);
    fd.append('external_id', 'huawei-' + w.record_id.replace(/\W/g, ''));
    step(tr('Uploading…'));
    let up = await _hwStrava('/uploads', { method: 'POST', body: fd });
    // Strava processes uploads asynchronously — poll until it has an activity
    for (let i = 0; i < 40 && !up.activity_id && !up.error; i++) {
      step(tr('Strava is processing…'));
      await new Promise(r => setTimeout(r, 2000));
      up = await _hwStrava('/uploads/' + up.id_str, { method: 'GET' });
    }
    if (up.error) {
      const dup = /duplicate of .*?activities\/(\d+)/.exec(up.error);
      if (dup) return dup[1]; // already on Strava — just link it
      throw new Error(up.error.replace(/<[^>]+>/g, '').trim()); // Strava's error carries an HTML link
    }
    if (!up.activity_id) throw new Error(tr('Strava is still processing — check again in a minute.'));
    step(tr('Setting the sport…'));
    await apiPut('/activities/' + up.activity_id, { sport_type: sport, trainer: !!trainer });
    return String(up.activity_id);
  }
  step(tr('Creating activity…'));
  const a = await _hwStrava('/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sport_type: sport, trainer: trainer ? 1 : 0,
      start_date_local: _hwLocal(w.start_time, w.tz), elapsed_time: w.duration_s || Math.round((Date.parse(w.end_time) - Date.parse(w.start_time)) / 1000),
      distance: w.distance_m || 0 }) });
  return String(a.id);
}

async function renderHuaweiCard(force) {
  const card = document.getElementById('huaweiCard');
  if (!card) return;
  if (typeof _slpIsOwner !== 'function' || !_slpIsOwner()) { card.style.display = 'none'; return; }
  if (!_hwList || force) {
    try { _hwList = (await _hwApi({ action: 'list' })).workouts || []; }
    catch { card.style.display = 'none'; return; }
  }
  const T = typeof tr === 'function' ? tr : (x => x), TF = typeof trf === 'function' ? trf : ((s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const missing = _hwList.filter(w => !w.strava_id);
  card.style.display = missing.length ? '' : 'none';
  if (!missing.length) return;
  document.getElementById('huaweiList').innerHTML = missing.map(w => {
    const loc = _hwLocal(w.start_time, w.tz);
    const facts = [fmtDt(loc), T(w.sport), fmtT(w.duration_s || 0), w.distance_m ? fmtD(w.distance_m) : '',
      w.climb_m ? '↑ ' + Math.round(elevVal(w.climb_m)) + ' ' + elevUnit() : '', w.max_alt_m ? TF('top {0}', Math.round(elevVal(w.max_alt_m)) + ' ' + elevUnit()) : '',
      w.polyline ? T('GPS') : T('no GPS')].filter(Boolean).join(' · ');
    const busy = _hwBusy[w.record_id];
    return '<div class="hw-row" data-id="' + esc(w.record_id) + '">'
      + '<div class="hw-info"><input class="hw-name" type="text" value="' + esc(_hwDefaultName(w)) + '" aria-label="' + T('Activity name') + '">'
      + '<div class="act-meta">' + esc(facts) + '</div><div class="hw-status">' + (busy ? esc(busy) : '') + '</div></div>'
      + '<button type="button" class="seg-scan hw-up"' + (busy ? ' disabled' : '') + '>' + T('Upload to Strava') + '</button></div>';
  }).join('');
  document.querySelectorAll('#huaweiList .hw-row').forEach(row => {
    const w = missing.find(x => x.record_id === row.dataset.id);
    const btn = row.querySelector('.hw-up'), status = row.querySelector('.hw-status');
    btn.onclick = async () => {
      const name = row.querySelector('.hw-name').value.trim() || _hwDefaultName(w);
      const step = s => { _hwBusy[w.record_id] = s; status.textContent = s; };
      btn.disabled = true;
      try {
        const sid = await _hwUpload(w, name, step);
        await _hwApi({ action: 'link', id: w.record_id, strava_id: sid });
        w.strava_id = sid;
        delete _hwBusy[w.record_id];
        status.innerHTML = '✓ <a href="https://www.strava.com/activities/' + sid + '" target="_blank" rel="noopener">' + T('On Strava →') + '</a> '
          + T('Refresh to see it in the dashboard.');
        btn.remove();
      } catch (e) {
        delete _hwBusy[w.record_id];
        status.textContent = e.message === 'NO_WRITE'
          ? T('Strava refused: upload permission missing. Disconnect, reconnect and tick "Upload your activities".')
          : TF('Failed: {0}', e.message);
        btn.disabled = false;
      }
    };
  });
}

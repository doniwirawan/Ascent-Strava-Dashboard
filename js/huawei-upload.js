/* ── ONLY ON HUAWEI (Activities page, owner only) ──
   Workouts from the Huawei Health export (Supabase huawei_workouts, via the
   owner-gated /api/huawei) that never reached Strava — Huawei's sync skips
   some modes, e.g. Mountain climbing and Badminton. Each one can be sent to
   Strava from here:
   - with GPS: a GPX is built in the browser from the stored track (time,
     position, altitude, HR every ~2 s) and posted to /uploads, then the sport
     is set, since a GPX doesn't carry Strava's sport type;
   - without GPS but with HR (badminton, treadmill): a TCX of time + HR, so
     Strava shows the heart-rate graph, average/max HR and calories;
   - with neither: created as a manual activity (time, duration, distance).
   Earlier no-GPS uploads went in as manual activities, which can't hold HR;
   those get a "Replace with HR version" button. The API can't delete, so the
   old manual one is linked for the user to delete on Strava.
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

/* The watch's own numbers as a description line — Strava has no field for
   steps, and a badminton session otherwise shows little beyond the HR graph.
   Kept on its own line so a re-run can find and replace it. */
const HW_STATS_MARK = '⌚ Huawei:';
function _hwStatsLine(w) {
  const h = Math.floor((w.duration_s || 0) / 3600), m = Math.round((w.duration_s || 0) % 3600 / 60);
  const parts = [(h ? h + 'h ' : '') + m + 'm'];
  if (w.avg_hr) parts.push('❤️ avg ' + w.avg_hr + (w.max_hr ? ' / max ' + w.max_hr : '') + ' bpm');
  if (w.calories) parts.push('🔥 ' + Math.round(w.calories) + ' kcal');
  if (w.steps) parts.push('👟 ' + w.steps.toLocaleString('en-US') + ' steps'
    + (w.duration_s ? ' (' + Math.round(w.steps / (w.duration_s / 60)) + ' spm)' : ''));
  if (w.distance_m && w.polyline == null && w.distance_m > 0) parts.push('📏 ' + (w.distance_m / 1000).toFixed(2) + ' km');
  return HW_STATS_MARK + ' ' + parts.join(' · ');
}
// existing description (if any) + the stats line, replacing an older stats line
function _hwDesc(w, prev) {
  const keep = (prev || '').split('\n').filter(l => !l.startsWith(HW_STATS_MARK)).join('\n').trim();
  return (keep ? keep + '\n\n' : '') + _hwStatsLine(w);
}

// TCX for a workout without GPS: time + HR (+ distance spread evenly, so a
// treadmill run keeps its km). Strava reads HR, calories and the lap totals.
function _hwTcx(w, track) {
  const c = track.cols, I = k => c.indexOf(k), rows = track.rows;
  const sec = t => t > 1e11 ? t / 1000 : t;
  const iso = t => new Date(sec(t) * 1000).toISOString();
  const t0 = sec(rows[0][I('t')]), span = Math.max(1, sec(rows[rows.length - 1][I('t')]) - t0);
  const dist = w.distance_m || 0, start = new Date(w.start_time).toISOString();
  const sport = { Run: 'Running', Ride: 'Biking' }[_hwSport(w)[0]] || 'Other';
  const pts = rows.map(r => '<Trackpoint><Time>' + iso(r[I('t')]) + '</Time>'
    + (dist ? '<DistanceMeters>' + (dist * (sec(r[I('t')]) - t0) / span).toFixed(1) + '</DistanceMeters>' : '')
    + (r[I('hr')] ? '<HeartRateBpm><Value>' + Math.round(r[I('hr')]) + '</Value></HeartRateBpm>' : '') + '</Trackpoint>').join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities>'
    + '<Activity Sport="' + sport + '"><Id>' + start + '</Id><Lap StartTime="' + start + '">'
    + '<TotalTimeSeconds>' + (w.duration_s || span) + '</TotalTimeSeconds><DistanceMeters>' + dist + '</DistanceMeters>'
    + '<Calories>' + Math.round(w.calories || 0) + '</Calories>'
    + (w.avg_hr ? '<AverageHeartRateBpm><Value>' + w.avg_hr + '</Value></AverageHeartRateBpm>' : '')
    + (w.max_hr ? '<MaximumHeartRateBpm><Value>' + w.max_hr + '</Value></MaximumHeartRateBpm>' : '')
    + '<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>\n' + pts + '\n</Track></Lap></Activity>'
    + '</Activities></TrainingCenterDatabase>\n';
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

/* Upload one workout; returns { id, kind } — kind 'file' (GPX/TCX) or 'manual'.
   `replacing` = the manual activity this upload supersedes (it may not be
   reported back to us as a duplicate of itself). */
async function _hwUpload(w, name, step, replacing, desc) {
  const [sport, trainer] = _hwSport(w);
  if (w.polyline || w.hr_samples > 0) {
    const gps = !!w.polyline, ext = gps ? 'gpx' : 'tcx';
    step(tr(gps ? 'Building GPX…' : 'Building TCX…'));
    const { track } = await _hwApi({ action: 'track', id: w.record_id });
    if (!track || !track.rows || track.rows.length < 2) throw new Error('no track');
    const fd = new FormData();
    fd.append('file', new Blob([gps ? _hwGpx(w, name, track) : _hwTcx(w, track)], { type: 'application/xml' }), 'huawei-' + w.record_id.replace(/\W/g, '') + '.' + ext);
    fd.append('data_type', ext);
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
      if (dup && dup[1] === String(replacing)) throw new Error(tr('Strava sees it as the same activity — delete the old manual one on Strava first, then try again.'));
      if (dup) return { id: dup[1], kind: 'file' }; // already on Strava — just link it
      throw new Error(up.error.replace(/<[^>]+>/g, '').trim()); // Strava's error carries an HTML link
    }
    if (!up.activity_id) throw new Error(tr('Strava is still processing — check again in a minute.'));
    step(tr('Setting the sport…'));
    await apiPut('/activities/' + up.activity_id, { sport_type: sport, trainer: !!trainer, description: _hwDesc(w, desc) });
    return { id: String(up.activity_id), kind: 'file' };
  }
  step(tr('Creating activity…'));
  const a = await _hwStrava('/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sport_type: sport, trainer: trainer ? 1 : 0,
      start_date_local: _hwLocal(w.start_time, w.tz), elapsed_time: w.duration_s || Math.round((Date.parse(w.end_time) - Date.parse(w.start_time)) / 1000),
      distance: w.distance_m || 0, description: _hwDesc(w, desc) }) });
  return { id: String(a.id), kind: 'manual' };
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
  const link = (id, label) => '<a href="https://www.strava.com/activities/' + id + '" target="_blank" rel="noopener">' + label + '</a>';
  // not on Strava yet, then manual uploads that could carry HR
  const todo = _hwList.filter(w => !w.strava_id).concat(_hwList.filter(w => w.strava_kind === 'manual' && w.hr_samples > 0));
  card.style.display = todo.length ? '' : 'none';
  if (!todo.length) return;
  document.getElementById('huaweiList').innerHTML = todo.map(w => {
    const loc = _hwLocal(w.start_time, w.tz), up = !!w.strava_id;
    const facts = [fmtDt(loc), T(w.sport), fmtT(w.duration_s || 0), w.distance_m ? fmtD(w.distance_m) : '',
      w.climb_m ? '↑ ' + Math.round(elevVal(w.climb_m)) + ' ' + elevUnit() : '', w.max_alt_m ? TF('top {0}', Math.round(elevVal(w.max_alt_m)) + ' ' + elevUnit()) : '',
      w.avg_hr ? '♥ ' + w.avg_hr + (w.max_hr ? '/' + w.max_hr : '') : '', w.polyline ? T('GPS') : T('no GPS')].filter(Boolean).join(' · ');
    const busy = _hwBusy[w.record_id];
    return '<div class="hw-row" data-id="' + esc(w.record_id) + '">'
      + '<div class="hw-info"><input class="hw-name" type="text" value="' + (up ? '' : esc(_hwDefaultName(w))) + '"'
      + (up ? ' placeholder="' + esc(T('Same name as on Strava')) + '"' : '') + ' aria-label="' + T('Activity name') + '">'
      + '<div class="act-meta">' + esc(facts) + '</div>'
      + '<div class="hw-status">' + (busy ? esc(busy) : up ? link(w.strava_id, T('On Strava')) + ' ' + T('as a manual activity — no heart rate.') : '') + '</div></div>'
      + '<button type="button" class="seg-scan hw-up"' + (busy ? ' disabled' : '') + '>' + T(up ? 'Replace with HR version' : 'Upload to Strava') + '</button></div>';
  }).join('');
  document.querySelectorAll('#huaweiList .hw-row').forEach(row => {
    const w = todo.find(x => x.record_id === row.dataset.id);
    const btn = row.querySelector('.hw-up'), status = row.querySelector('.hw-status');
    btn.onclick = async () => {
      const step = s => { _hwBusy[w.record_id] = s; status.textContent = s; };
      const old = w.strava_kind === 'manual' ? w.strava_id : null;
      btn.disabled = true;
      try {
        // carry the manual activity's name and description over (unless renamed here)
        let prev = null;
        if (old) { step(T('Reading the old activity…')); try { prev = await api('/activities/' + old); } catch {} }
        const name = row.querySelector('.hw-name').value.trim() || (prev && prev.name) || _hwDefaultName(w);
        const res = await _hwUpload(w, name, step, old, prev ? prev.description || '' : null);
        await _hwApi({ action: 'link', id: w.record_id, strava_id: res.id, kind: res.kind });
        w.strava_id = res.id; w.strava_kind = res.kind;
        delete _hwBusy[w.record_id];
        status.innerHTML = '✓ ' + link(res.id, T('On Strava →')) + ' '
          + (old && prev ? T('Now delete the old manual one:') + ' ' + link(old, T('open it on Strava')) + '.' : T('Refresh to see it in the dashboard.'));
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

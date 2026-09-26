/* ── FITNESS: heart-rate zones + FTP estimation ──────────────────────────────
   HR zones come from Strava's /athlete/zones when available (the athlete's own
   configured zones); otherwise a standard 5-zone model is derived from the
   highest max HR seen across loaded activities. FTP falls back to an estimate
   from power data — or body weight — when Strava has no FTP set. */

// Strava-configured HR zones: [{min,max}, ...] (max -1 / 0 = open-ended). null until loaded.
let athleteHrZones = null;

// Zone identity: 5-zone model names + colours (cool → hot).
const HR_ZONES = [
  { name: 'Recovery',  color: '#3b82f6' },
  { name: 'Endurance', color: '#22c55e' },
  { name: 'Tempo',     color: '#eab308' },
  { name: 'Threshold', color: '#f97316' },
  { name: 'Anaerobic', color: '#ef4444' },
];

// Highest max HR observed across all loaded activities (fallback zone basis).
// Floored at your configured Strava top-zone HR: if you've set Z5 to start at,
// say, 190, your true max is at least there even if no single ride recorded it —
// so training load / VO2 don't underestimate off a low observed peak.
function observedMaxHr() {
  if (typeof acts === 'undefined' || !acts.length) return 0;
  let m = acts.reduce((mx, a) => Math.max(mx, a.max_heartrate || 0), 0);
  if (typeof athleteHrZones !== 'undefined' && Array.isArray(athleteHrZones) && athleteHrZones.length) {
    const top = athleteHrZones[athleteHrZones.length - 1];
    const floor = (top && top.max > 0) ? top.max : (top && top.min) || 0;
    if (floor > m) m = floor;
  }
  return m;
}

// Fetch the athlete's configured HR zones once (needs profile:read_all, already granted).
async function loadHrZones() {
  try {
    const z = await api('/athlete/zones');
    const zones = z && z.heart_rate && z.heart_rate.zones;
    athleteHrZones = (Array.isArray(zones) && zones.length) ? zones : null;
  } catch { athleteHrZones = null; }
}

// Map a bpm reading to a zone object {n, name, color}, or null if undeterminable.
function hrZoneFor(bpm) {
  if (!bpm || bpm <= 0) return null;
  const meta = i => HR_ZONES[Math.min(i, HR_ZONES.length - 1)];
  const obj  = i => ({ n: i + 1, name: meta(i).name, color: meta(i).color });
  // 1) Strava-configured zones
  if (athleteHrZones) {
    for (let i = 0; i < athleteHrZones.length; i++) {
      const z = athleteHrZones[i];
      const max = (z.max == null || z.max <= 0) ? Infinity : z.max;
      if (bpm >= (z.min || 0) && bpm < max) return obj(i);
    }
    return obj(athleteHrZones.length - 1); // above the top zone
  }
  // 2) Computed from observed max HR (standard % boundaries)
  const mhr = observedMaxHr();
  if (!mhr) return null;
  const pct = bpm / mhr;
  const upper = [0.60, 0.70, 0.80, 0.90]; // upper bound of Z1..Z4
  const i = upper.findIndex(b => pct < b);
  return obj(i === -1 ? 4 : i);
}

// "Z2 · Endurance" (short=false) or "Z2" (short=true). '' when undeterminable.
function hrZoneLabel(bpm, short) {
  const z = hrZoneFor(bpm);
  if (!z) return '';
  return short ? ('Z' + z.n) : ('Z' + z.n + ' · ' + z.name);
}

// Small coloured pill for inline display next to a HR figure. '' when undeterminable.
function hrZonePill(bpm) {
  const z = hrZoneFor(bpm);
  if (!z) return '';
  return `<span class="hrz-pill" style="--zc:${z.color}">Z${z.n} · ${z.name}</span>`;
}

/* ── HR ZONE TIME DISTRIBUTION ───────────────────────────────────────────────
   "Activity-ring" breakdown of time spent in each HR zone.
   • Overview shows an APPROXIMATION: each activity's whole moving-time is
     bucketed into the zone of its average HR (no extra API calls).
   • A single activity fetches Strava's EXACT per-zone time via
     /activities/{id}/zones, falling back to the approximation if unavailable. */

// bpm range label for zone i: from the athlete's configured zones when set,
// else derived from the standard % boundaries of the observed max HR. e.g. "120–140".
function hrZoneRange(i) {
  if (athleteHrZones && athleteHrZones[i]) {
    const z = athleteHrZones[i];
    const lo = z.min || 0;
    const hi = (z.max == null || z.max <= 0) ? null : z.max;
    return hi ? `${lo}–${hi}` : `${lo}+`;
  }
  const mhr = observedMaxHr();
  if (!mhr) return '';
  const frac = [0, 0.60, 0.70, 0.80, 0.90];        // upper bounds match hrZoneFor()
  if (i === 0) return `≤${Math.round(frac[1] * mhr)}`;
  if (i === 4) return `${Math.round(frac[4] * mhr)}+`;
  return `${Math.round(frac[i] * mhr)}–${Math.round(frac[i + 1] * mhr)}`;
}

// Approximate seconds per zone over a set of activities (avg-HR bucketing).
// → { totals:[s×5], tracked, untracked }
function approxZoneTotals(set) {
  const totals = [0, 0, 0, 0, 0];
  let tracked = 0, untracked = 0;
  for (const a of (set || [])) {
    const t = a.moving_time || 0;
    if (!t) continue;
    const z = a.average_heartrate > 0 ? hrZoneFor(a.average_heartrate) : null;
    if (!z) { untracked++; continue; }
    totals[Math.min(z.n - 1, 4)] += t;
    tracked++;
  }
  return { totals, tracked, untracked };
}

// Exact per-zone seconds for one activity from Strava. → [s×5] or null.
async function fetchActivityHrZones(id) {
  const data = await api('/activities/' + id + '/zones');
  const hr = Array.isArray(data) ? data.find(z => z.type === 'heartrate') : null;
  const buckets = hr && hr.distribution_buckets;
  if (!Array.isArray(buckets) || !buckets.length) return null;
  const totals = [0, 0, 0, 0, 0];
  buckets.forEach((b, i) => { totals[Math.min(i, 4)] += b.time || 0; });
  return totals;
}

/* ── PERSISTENT PER-ACTIVITY ZONE CACHE ──
   A finished activity's time-in-zone never changes, so cache it forever in this
   browser. Map id → [s×5] (has data) or null (fetched, no HR-zone data). */
const HRZ_CACHE_KEY = 'hrz_zones_v1';
let _hrzCache = null;
function _hrzLoad() {
  if (_hrzCache) return _hrzCache;
  try { _hrzCache = JSON.parse(localStorage.getItem(HRZ_CACHE_KEY)) || {}; } catch { _hrzCache = {}; }
  return _hrzCache;
}
function _hrzSave() { try { localStorage.setItem(HRZ_CACHE_KEY, JSON.stringify(_hrzLoad())); } catch {} }
// undefined = never fetched · null = fetched, no data · [s×5] = real zone times
function hrzCacheGet(id) { return _hrzLoad()[id]; }
function hrzCacheSet(id, totals) { _hrzLoad()[id] = totals || null; _hrzSave(); }

// Real time-in-zone for one activity, via cache → network. Throws on network
// error (so callers can stop/retry); returns null when Strava has no zone data.
async function getActivityZones(a) {
  const cached = hrzCacheGet(a.id);
  if (cached !== undefined) return cached;
  const totals = await fetchActivityHrZones(a.id);   // may throw (e.g. 429)
  hrzCacheSet(a.id, totals);
  return totals;
}

// Is the logged-in athlete the dashboard owner? Real bulk fetching is owner-only
// so other visitors never spend the shared Strava rate limit on the overview.
function _isHrzOwner() {
  try { return localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID && !!CONFIG.accessToken; }
  catch { return false; }
}

// Replace the Overview estimate with REAL aggregated time-in-zone (owner only).
// Progressive: draws cached data immediately, fetches the rest with limited
// concurrency, then redraws. Token guards against mode/unit switches mid-flight.
let _hrzRealToken = 0;
async function upgradeOverviewZonesReal(set) {
  const token = ++_hrzRealToken;
  const hrActs = set.filter(a => a.average_heartrate > 0 && a.id);
  if (!hrActs.length) return;
  const note = document.getElementById('hrzNote');
  const totals = [0, 0, 0, 0, 0];
  let withData = 0, pending = [];
  for (const a of hrActs) {
    const c = hrzCacheGet(a.id);
    if (c === undefined) pending.push(a);
    else if (c) { c.forEach((v, i) => totals[i] += v); withData++; }
  }
  const redraw = (msg) => {
    if (token !== _hrzRealToken) return;
    const sum = totals.reduce((s, v) => s + v, 0);
    if (sum <= 0) return;                              // keep the estimate if nothing real yet
    drawZoneRing(document.getElementById('hrzRing'), totals, { big: fmtTc(sum), small: tr('tracked') });
    document.getElementById('hrzLegend').innerHTML = zoneLegendHTML(totals);
    if (note) note.textContent = msg;
  };
  redraw(trf('Real time in each zone, from Strava · {0} of {1} activities recorded HR', hrActs.length, set.length));

  let stoppedRate = false, done = withData;
  if (pending.length) {
    if (note) note.textContent = trf('Loading real time-in-zone from Strava… ({0}/{1})', done, hrActs.length);
    let idx = 0;
    const worker = async () => {
      while (idx < pending.length) {
        if (token !== _hrzRealToken) return;          // superseded
        const a = pending[idx++];
        try {
          const z = await getActivityZones(a);
          if (z) { z.forEach((v, i) => totals[i] += v); withData++; }
          done++;
        } catch (e) {
          if (/ 429 /.test(' ' + e.message + ' ')) { stoppedRate = true; return; }
          done++;                                      // other error: skip this one
        }
        if (done % 5 === 0 && note && token === _hrzRealToken)
          note.textContent = trf('Loading real time-in-zone from Strava… ({0}/{1})', done, hrActs.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  }
  if (token !== _hrzRealToken) return;
  if (totals.reduce((s, v) => s + v, 0) > 0) {        // draw real data when we got some
    drawZoneRing(document.getElementById('hrzRing'), totals, { big: fmtTc(totals.reduce((s, v) => s + v, 0)), small: tr('tracked') });
    document.getElementById('hrzLegend').innerHTML = zoneLegendHTML(totals);
  }
  // Land on a clear final status. Denominator is the FULL mode set so it's
  // obvious why the count is what it is (most activities have no HR recorded).
  const base = trf('Real time in each zone, from Strava · {0} of {1} activities recorded HR', hrActs.length, set.length);
  if (note) note.textContent = stoppedRate
    ? base + ' · ' + tr('rate-limited, refresh later for the rest')
    : (withData < hrActs.length ? base + trf(' ({0} with zone data)', withData) : base);
}

// Compact duration for the ring centre: "1h23m" / "47h" / "12m".
const fmtTc = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`;
};

// Draw a segmented "activity ring" of zone times onto a canvas.
// totals: seconds per zone. centre: {big, small}. size: logical px (DPR-scaled).
// `colors` lets non-HR rings (e.g. speed zones) reuse this; defaults to HR_ZONES.
function drawZoneRing(canvas, totals, centre, size = 220, colors) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const lw = Math.max(12, size * 0.13);
  const r = (size - lw) / 2 - 2;
  const sum = totals.reduce((s, v) => s + v, 0);
  ctx.lineWidth = lw; ctx.lineCap = 'round';
  // track
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  // segments (clockwise from 12 o'clock)
  if (sum > 0) {
    let start = -Math.PI / 2;
    const gap = 0.05;
    totals.forEach((v, i) => {
      if (v <= 0) return;
      const sweep = (v / sum) * Math.PI * 2;
      const a0 = start + gap / 2, a1 = start + sweep - gap / 2;
      if (a1 > a0) {
        ctx.strokeStyle = colors ? colors[Math.min(i, colors.length - 1)]
                                 : HR_ZONES[Math.min(i, 4)].color;
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      }
      start += sweep;
    });
  }
  // centre text
  if (centre) {
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const innerW = (r - lw / 2) * 2 * 0.9;
    let fs = size * 0.2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    while (ctx.measureText(centre.big).width > innerW && fs > 8) { fs -= 1; ctx.font = `800 ${fs}px system-ui, sans-serif`; }
    ctx.fillStyle = css('--text') || '#fff';
    ctx.fillText(centre.big, cx, cy - size * 0.04);
    ctx.fillStyle = css('--muted') || '#888';
    ctx.font = `600 ${Math.round(size * 0.072)}px system-ui, sans-serif`;
    ctx.fillText(centre.small, cx, cy + size * 0.13);
  }
}

// Legend rows shared by the Overview card and the activity modal.
// `ranges` (optional) overrides the bpm label per zone, e.g. for age-based zones.
function zoneLegendHTML(totals, ranges) {
  const sum = totals.reduce((s, v) => s + v, 0) || 1;
  const peak = Math.max(...totals) || 1;
  return totals.map((v, i) => {
    const z = HR_ZONES[Math.min(i, 4)];
    const range = ranges ? ranges[i] : hrZoneRange(i);
    return `<div class="hrz-row">
      <span class="hrz-dot" style="background:${z.color}"></span>
      <span class="hrz-name">Z${i + 1} · ${z.name}${range ? ` <span class="hrz-range">${range} bpm</span>` : ''}</span>
      <span class="hrz-bar"><span style="width:${Math.round(v / peak * 100)}%;background:${z.color}"></span></span>
      <span class="hrz-time">${v ? fmtT(v) : '—'}</span>
      <span class="hrz-pct">${v ? Math.round(v / sum * 100) + '%' : ''}</span>
    </div>`;
  }).join('');
}

// Overview "Time in HR Zones" card — approximation across the active sport set.
function renderOverviewZones() {
  const card = document.getElementById('hrzCard');
  if (!card) return;
  const set = (typeof modeActs === 'function') ? modeActs() : (typeof acts !== 'undefined' ? acts : []);
  const { totals, tracked, untracked } = approxZoneTotals(set);
  const sum = totals.reduce((s, v) => s + v, 0);
  if (sum <= 0) { card.style.display = 'none'; _hrzRealToken++; return; }
  card.style.display = '';
  drawZoneRing(document.getElementById('hrzRing'), totals, { big: fmtTc(sum), small: tr('tracked') });
  document.getElementById('hrzLegend').innerHTML = zoneLegendHTML(totals);
  const basis = athleteHrZones ? tr('your Strava zones') : tr('estimated max HR');
  document.getElementById('hrzNote').textContent =
    trf('Estimated from each activity’s average HR · {0} · {1} of {2} activities have HR', basis, tracked, tracked + untracked);
  // Owner: upgrade the estimate to real per-activity time-in-zone from Strava.
  if (_isHrzOwner()) upgradeOverviewZonesReal(set); else _hrzRealToken++;
}

/* Two zone bases for the activity modal:
   • Strava — your Strava zones, exact time-in-zone from /activities/{id}/zones.
   • Age    — 220 − age max HR, zones at 60/70/80/90 %. Strava's API doesn't
     expose birth date, so it's asked for once and kept in this browser only
     (the repo is public). Time-in-zone comes from the HR stream, counting only
     moving samples; the per-bpm histogram is cached so a new age needs no refetch. */
let _hrzMode = localStorage.getItem('hrzMode') === 'age' ? 'age' : 'strava';

function _hrzAge() {
  const dob = localStorage.getItem('hrzBirthDate');
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00'), n = new Date();
  if (isNaN(b)) return null;
  let age = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) age--;
  return age > 5 && age < 110 ? age : null;
}

// Zone lower bounds in bpm for Z2..Z5 (Z1 is everything under Z2).
const _ageZoneBounds = max => [0.6, 0.7, 0.8, 0.9].map(f => Math.round(f * max));

// Seconds spent at each whole bpm while moving → {bpm: s}. Cached per activity.
async function _hrHistogram(id) {
  const key = 'hrhist_' + id;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c) return c; } catch {}
  const raw = await api(`/activities/${id}/streams?keys=heartrate,time,moving&key_by_type=true`);
  const hr = raw.heartrate && raw.heartrate.data, t = raw.time && raw.time.data;
  const mv = raw.moving && raw.moving.data;
  if (!hr || !t) return null;
  const h = {};
  for (let i = 1; i < hr.length; i++) {
    if (mv && !mv[i]) continue;
    const dt = t[i] - t[i - 1];
    if (!(dt > 0) || dt > 30 || !hr[i]) continue; // a long gap is a pause, not zone time
    const k = Math.round(hr[i]); h[k] = (h[k] || 0) + dt;
  }
  try { localStorage.setItem(key, JSON.stringify(h)); } catch {}
  return h;
}

function setHrzMode(m, id) {
  _hrzMode = m; try { localStorage.setItem('hrzMode', m); } catch {}
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
  if (a) renderActivityHrZones(a);
}
let _hrzOwnerDobTried = false; // one /api/owner-profile lookup per page load
function setHrzBirthDate(v, id) {
  if (!v) return;
  try { localStorage.setItem('hrzBirthDate', v); } catch {}
  setHrzMode('age', id);
}
function clearHrzBirthDate(id) {
  try { localStorage.removeItem('hrzBirthDate'); } catch {}
  setHrzMode('age', id);
}

// Single-activity "Heart Rate Zones" ring — Strava zones or age-based, see above.
async function renderActivityHrZones(a) {
  const box = document.getElementById('actHrz');
  if (!box || !a || !a.average_heartrate) { if (box) box.style.display = 'none'; return; }
  const age = _hrzAge();
  const btn = (m, label) => `<button type="button" class="${_hrzMode === m ? 'on' : ''}" onclick="setHrzMode('${m}','${a.id}')">${label}</button>`;
  box.style.display = '';
  box.innerHTML =
    `<div class="hrz-title">${tr('Heart Rate Zones')}
       ${a.id ? `<span class="actd-stream-modes">${btn('strava', 'Strava')}${btn('age', tr('Age') + (age ? ' ' + age : ''))}</span>` : ''}</div>
     <div class="hrz-body"><canvas class="hrz-ring" id="actHrzRing"></canvas><div class="hrz-legend" id="actHrzLegend"></div></div>
     <div class="hrz-note" id="actHrzNote">${tr('Loading zones…')}</div>`;

  if (_hrzMode === 'age' && a.id) {
    const note = document.getElementById('actHrzNote');
    if (!age) {
      // the owner's birth date is kept server-side (public repo) — fetch it once
      if (_isHrzOwner() && !_hrzOwnerDobTried) {
        _hrzOwnerDobTried = true;
        try {
          const r = await fetch('/api/owner-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken }) });
          const d = r.ok ? await r.json() : null;
          if (d && d.birthdate) { setHrzBirthDate(d.birthdate, a.id); return; }
        } catch {}
      }
      document.getElementById('actHrzRing').style.display = 'none';
      note.innerHTML = `${tr('Your birth date (Strava doesn’t share it) — saved in this browser only:')}
        <input type="date" class="hrz-dob" onchange="setHrzBirthDate(this.value,'${a.id}')">`;
      return;
    }
    let h = null;
    try { h = await _hrHistogram(a.id); } catch {}
    const ring = document.getElementById('actHrzRing');
    if (!ring) return;
    if (!h || !Object.keys(h).length) { note.textContent = tr('No heart-rate stream for this activity.'); return; }
    const max = 220 - age, lb = _ageZoneBounds(max);
    const totals = [0, 0, 0, 0, 0];
    for (const k in h) { let z = 0; while (z < 4 && +k >= lb[z]) z++; totals[z] += h[k]; }
    const ranges = [`<${lb[0]}`, `${lb[0]}–${lb[1]}`, `${lb[1]}–${lb[2]}`, `${lb[2]}–${lb[3]}`, `${lb[3]}+`];
    const sum = totals.reduce((s, v) => s + v, 0);
    drawZoneRing(ring, totals, { big: fmtTc(sum), small: tr('moving') }, 168);
    document.getElementById('actHrzLegend').innerHTML = zoneLegendHTML(totals, ranges);
    note.innerHTML = trf('Max HR {0} bpm (220 − age {1}) · zones at 60/70/80/90 % · from the HR stream', max, age)
      + ` · <a href="#" onclick="clearHrzBirthDate('${a.id}');return false">${tr('change birth date')}</a>`;
    return;
  }

  let totals = null, exact = false;
  if (a.id) { try { totals = await getActivityZones(a); exact = !!totals; } catch { totals = null; } }
  if (!totals) {                                                    // fallback: avg-HR bucket
    const z = hrZoneFor(a.average_heartrate);
    if (z) { totals = [0, 0, 0, 0, 0]; totals[Math.min(z.n - 1, 4)] = a.moving_time || 0; }
  }
  if (!totals || totals.reduce((s, v) => s + v, 0) <= 0) { box.style.display = 'none'; return; }
  // The modal may have been closed/reopened while awaiting — bail if our nodes are gone.
  const ring = document.getElementById('actHrzRing');
  if (!ring) return;
  const sum = totals.reduce((s, v) => s + v, 0);
  drawZoneRing(ring, totals, { big: fmtTc(sum), small: tr('moving') }, 168);
  document.getElementById('actHrzLegend').innerHTML = zoneLegendHTML(totals);
  document.getElementById('actHrzNote').textContent =
    exact ? tr('Exact time in each zone, from Strava') : tr('Estimated from average HR (no zone data for this activity)');
}

/* ── FTP ESTIMATION ──
   1) Strava's set FTP if present.
   2) Best sustained ride effort: 0.95 × the highest weighted-average (or average)
      watts over rides ≥ 20 min — a rough 20-min-test → FTP proxy.
   3) Body weight: ~2.5 W/kg, a recreational-cyclist baseline.
   Returns {value, estimated, basis} or null. */
function estimateFtp() {
  const ath = (typeof currentAthlete !== 'undefined' && currentAthlete) || {};
  if (ath.ftp) return { value: Math.round(ath.ftp), estimated: false, basis: 'strava' };

  // Without a power meter: climbing physics + heart rate (js/climb-ftp.js)
  const climb = (typeof climbFtp === 'function') && climbFtp();
  if (climb) return { value: climb, estimated: true, basis: 'climb' };

  if (typeof acts !== 'undefined' && acts.length) {
    let best = 0;
    for (const a of acts) {
      if (!isRide(a) || (a.moving_time || 0) < 1200) continue; // ≥ 20 min rides
      const w = a.weighted_average_watts || a.average_watts || 0;
      if (w > best) best = w;
    }
    if (best > 0) return { value: Math.round(best * 0.95), estimated: true, basis: 'power' };
  }

  if (ath.weight) return { value: Math.round(ath.weight * 2.5), estimated: true, basis: 'weight' };
  return null;
}

/* Cycling VO2max estimate — Garmin/Firstbeat-style: map power → VO2 with the
   ACSM leg-cycling equation and extrapolate your power↔HR relationship out to
   max HR. Garmin's exact model is proprietary; this follows the same principle.
   ACSM: VO2 (ml/kg/min) = 10.8 * watts / kg + 7.
   Returns {value, method} (ml/kg/min) or null. */
function estimateVo2max() {
  const weight = (typeof athWeightKg === 'function') ? athWeightKg() : 0;
  if (!weight || typeof acts === 'undefined' || !acts.length) return null;
  const vo2FromPower = watts => 10.8 * (watts / weight) + 7;

  // Without a meter, the climb line read at max HR (js/climb-ftp.js).
  const pMax = (typeof climbPmax === 'function') && climbPmax();
  if (pMax) {
    const v = vo2FromPower(pMax);
    if (v >= 25 && v <= 90) return { value: Math.round(v), method: 'climb' };
  }

  // Steady rides (≥20 min) with both power and heart rate. Real meters only —
  // Strava's estimated watts barely move with HR, so the fit reads nonsense.
  const pts = acts
    .filter(a => isRide(a) && a.device_watts === true && (a.moving_time || 0) >= 1200
      && (a.weighted_average_watts || a.average_watts) > 0 && a.average_heartrate > 0)
    .map(a => ({ hr: a.average_heartrate, w: a.weighted_average_watts || a.average_watts }));

  const hrMax = observedMaxHr();
  if (hrMax > 0 && pts.length >= 8) {
    // Least-squares fit power = a + b·HR, then read power at max HR.
    const n = pts.length;
    const meanHr = pts.reduce((s, p) => s + p.hr, 0) / n;
    const meanW = pts.reduce((s, p) => s + p.w, 0) / n;
    const hrSpread = Math.max(...pts.map(p => p.hr)) - Math.min(...pts.map(p => p.hr));
    let num = 0, den = 0;
    for (const p of pts) { num += (p.hr - meanHr) * (p.w - meanW); den += (p.hr - meanHr) ** 2; }
    const b = den > 0 ? num / den : 0;
    if (b > 0 && hrSpread >= 12) {
      const pAtMax = (meanW - b * meanHr) + b * hrMax;
      const v = vo2FromPower(pAtMax);
      if (v >= 25 && v <= 90) return { value: Math.round(v), method: 'power-hr' };
    }
  }

  // Fallback: from FTP (FTP ≈ 75% of power at VO2max).
  const ftp = (typeof estimateFtp === 'function') && estimateFtp();
  if (ftp && ftp.value > 0) {
    const v = vo2FromPower(ftp.value / 0.75);
    if (v >= 25 && v <= 90) return { value: Math.round(v), method: 'ftp' };
  }
  return null;
}

/* ── TIME IN SPEED ZONES ──────────────────────────────────────────────────────
   The companion to Time in HR Zones: how many hours were spent riding (or
   running) at each speed.

   Strava's activity list carries only an average speed per activity, so an
   activity's whole moving time lands in the band its average falls into. That
   is an approximation — a rolling ride averaging 22 km/h spends real time above
   and below that — and the card says so. Getting it exact would need a
   velocity_smooth stream per activity, i.e. one API call each. */

const SPEED_ZONES = [
  { name: 'Easy',    color: '#3b82f6' },
  { name: 'Steady',  color: '#22c55e' },
  { name: 'Brisk',   color: '#eab308' },
  { name: 'Fast',    color: '#f97316' },
  { name: 'Flying',  color: '#ef4444' },
];

// Fallback lower edges (m/s) when there isn't enough history to personalise.
const SPEED_BAND_EDGES = {
  ride: [0, 15 / 3.6, 20 / 3.6, 25 / 3.6, 30 / 3.6],
  run:  [0,  8 / 3.6, 10 / 3.6, 12 / 3.6, 14 / 3.6],
};

// Fixed band edges per sport. These used to be the 20/40/60/80th percentiles of
// your own average speeds, which is self-defeating: bucketing the same numbers
// the percentiles came from always yields five ~20% slices, so the chart read
// the same however you rode. Absolute edges make the split mean something and
// make a target ("30+") an actual goal you can watch grow.
function _spdEdges() {
  const usePace = (typeof sportUsesPace === 'function') && sportUsesPace();
  return SPEED_BAND_EDGES[usePace ? 'run' : 'ride'];
}

function speedZoneFor(ms) {
  const edges = _spdEdges();
  let i = 0;
  for (let k = 0; k < edges.length; k++) if (ms >= edges[k]) i = k;
  return i;
}

// "20–25 km/h" / "30+ km/h", in whichever unit is active.
function speedZoneRange(i) {
  const edges = _spdEdges();
  const lo = kmh(edges[i]);
  if (i === edges.length - 1) return `${lo}+`;
  return `${lo}–${kmh(edges[i + 1])}`;
}

/* ── real time-in-zone, from each ride's speed stream ──
   Counting a whole activity at its average speed hides every surge inside it:
   a ride averaging 22 never registers the minutes actually spent above 30. So
   each ride's velocity_smooth stream is bucketed into the bands once and the
   per-zone seconds are cached; the streams themselves come from the shared
   _getActivityStreams cache, so a ride already opened costs no extra call. */
const _SPDZ_V = 1;
const _spdzKey = () => 'strava_spdz_' + (localStorage.getItem('strava_athlete_id') || 'x');
let _spdzStore = null;

function _spdzLoad() {
  if (_spdzStore) return _spdzStore;
  try {
    const o = JSON.parse(localStorage.getItem(_spdzKey()) || 'null');
    if (o && o.v === _SPDZ_V && o.acts) _spdzStore = o;
  } catch {}
  if (!_spdzStore) _spdzStore = { v: _SPDZ_V, acts: {} };
  return _spdzStore;
}
function _spdzSave() { try { localStorage.setItem(_spdzKey(), JSON.stringify(_spdzLoad())); } catch {} }

/* One ride's stream → seconds per zone. The cached stream is downsampled to a
   fixed number of evenly spaced points, so each surviving sample stands for the
   same slice of time; stopped samples are dropped and the rest are scaled to
   the ride's moving time, matching what the card has always counted. */
function _spdzHist(streams, movingTime) {
  const s = streams && streams.series && streams.series.speed && streams.series.speed.data;
  if (!s || !s.length || !movingTime) return null;
  const moving = s.filter(v => v != null && !isNaN(v) && v >= 0.5); // 1.8 km/h — rolling, not stopped
  if (!moving.length) return null;
  const per = movingTime / moving.length;
  const h = [0, 0, 0, 0, 0];
  for (const v of moving) h[speedZoneFor(v)] += per;
  return h.map(v => Math.round(v));
}

// Sum the cached histograms over the active set, and say what's still missing.
function speedZoneTotalsStreams(set) {
  const store = _spdzLoad();
  const totals = [0, 0, 0, 0, 0];
  const missing = [];
  let have = 0;
  set.forEach(a => {
    const h = store.acts[a.id];
    if (h) { for (let i = 0; i < 5; i++) totals[i] += h[i] || 0; have++; }
    else if (a.moving_time > 0) missing.push(a);
  });
  return { totals, have, missing };
}

/* Fill in the rides that have no histogram yet. One API call each the first
   time (cached forever after), so it runs in explicit batches with progress
   rather than silently on load, and stops clean on a rate limit. */
let _spdzFetching = false;
async function fetchSpeedZoneStreams(list, onProgress) {
  if (_spdzFetching) return { done: 0, limited: false };
  _spdzFetching = true;
  const store = _spdzLoad();
  let done = 0, limited = false;
  try {
    for (const a of list) {
      if (onProgress) onProgress(done, list.length);
      let st;
      try { st = await _getActivityStreams(a.id); }
      catch (e) { if (/ 429 /.test(' ' + ((e && e.message) || '') + ' ')) { limited = true; break; } continue; }
      const h = st && _spdzHist(st, a.moving_time);
      if (h) { store.acts[a.id] = h; done++; }
      if (done % 10 === 0) _spdzSave();
    }
  } finally { _spdzSave(); _spdzFetching = false; }
  return { done, limited };
}

// Moving time per band across the active sport set.
function speedZoneTotals(set) {
  const totals = [0, 0, 0, 0, 0];
  let tracked = 0, untracked = 0;
  set.forEach(a => {
    const ms = a.average_speed || 0;
    const t = a.moving_time || 0;
    if (ms <= 0 || t <= 0) { untracked++; return; }
    totals[speedZoneFor(ms)] += t;
    tracked++;
  });
  return { totals, tracked, untracked };
}

function speedLegendHTML(totals) {
  const sum = totals.reduce((s, v) => s + v, 0) || 1;
  const peak = Math.max(...totals) || 1;
  return totals.map((v, i) => {
    const z = SPEED_ZONES[Math.min(i, 4)];
    return `<div class="hrz-row">
      <span class="hrz-dot" style="background:${z.color}"></span>
      <span class="hrz-name">Z${i + 1} · ${z.name} <span class="hrz-range">${speedZoneRange(i)} ${speedUnit()}</span></span>
      <span class="hrz-bar"><span style="width:${Math.round(v / peak * 100)}%;background:${z.color}"></span></span>
      <span class="hrz-time">${v ? fmtT(v) : '—'}</span>
      <span class="hrz-pct">${v ? Math.round(v / sum * 100) + '%' : ''}</span>
    </div>`;
  }).join('');
}

function renderOverviewSpeedZones() {
  const card = document.getElementById('spdzCard');
  if (!card) return;
  const set = (typeof modeActs === 'function') ? modeActs() : (typeof acts !== 'undefined' ? acts : []);

  // Prefer real time-in-zone; fall back to the average-speed estimate until at
  // least some rides have been analysed, so the card is never blank.
  const st = speedZoneTotalsStreams(set);
  const streamed = st.have > 0;
  const totals = streamed ? st.totals : speedZoneTotals(set).totals;

  const sum = totals.reduce((s, v) => s + v, 0);
  if (sum <= 0) { card.style.display = 'none'; return; }
  card.style.display = '';
  drawZoneRing(
    document.getElementById('spdzRing'), totals,
    { big: fmtTc(sum), small: tr('moving') }, 220,
    SPEED_ZONES.map(z => z.color)
  );
  document.getElementById('spdzLegend').innerHTML = speedLegendHTML(totals);

  const note = document.getElementById('spdzNote');
  const left = st.missing.length;
  const basis = streamed
    ? trf('Real time at speed, second by second · {0} of {1} activities analysed', st.have, st.have + left)
    : tr('Estimated — each activity’s moving time counted at its average speed, so surges inside a ride don’t show');
  note.innerHTML = basis + (left
    ? ` <button class="seg-scan spdz-btn" id="spdzFetch">${streamed ? trf('Analyse {0} more', left) : trf('Analyse {0} activities', left)}</button>`
    : '');

  const btn = document.getElementById('spdzFetch');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    const batch = st.missing.slice(0, 100);   // one rate-limit window's worth
    const r = await fetchSpeedZoneStreams(batch, (n, t) => { btn.textContent = trf('Analysing… {0}/{1}', n, t); });
    if (r.limited) setStatus(tr('Strava rate limit reached — analyse the rest in 15 minutes.'));
    renderOverviewSpeedZones();
  };
}

/* ── WHERE A PEAK HAPPENED ───────────────────────────────────────────────────
   A top-speed or highest-HR row only says how much. This finds the moment: the
   point on the ride where that peak occurred, how far in it was, the clock
   time, which of your segments (if any) it falls on, and the other metric at
   that same moment (heart rate at the top speed, speed at the HR peak).

   Only the resolved point is cached, not the streams it came from — one small
   record per activity instead of a second copy of the whole track. */
const _spotKey = (id, kind) => 'strava_spot_' + (kind === 'hr' ? 'hr_' : '') + id;

async function _peakSpot(a, kind) {
  try { const c = JSON.parse(localStorage.getItem(_spotKey(a.id, kind)) || 'null'); if (c && c.v === 3) return c; } catch {}
  let raw;
  try { raw = await api(`/activities/${a.id}/streams?keys=velocity_smooth,heartrate,latlng,distance,time&key_by_type=true`); }
  catch { return null; }
  const spd = raw.velocity_smooth && raw.velocity_smooth.data;
  const hr = raw.heartrate && raw.heartrate.data;
  const v = kind === 'hr' ? hr : spd, other = kind === 'hr' ? spd : hr;
  const ll = raw.latlng && raw.latlng.data;
  if (!v || !ll || !v.length) return null;
  // Locate the RAW peak, so the panel agrees with the figure on the row. For
  // speed the spike-fixed series is only consulted to judge whether that peak
  // is real — a glitch still has a location, and saying so beats quietly
  // moving the pin.
  let bi = -1, bv = -1;
  for (let i = 0; i < v.length; i++) if (v[i] != null && v[i] > bv && ll[i]) { bv = v[i]; bi = i; }
  if (bi < 0) return null;
  let suspect = false;
  if (kind !== 'hr' && typeof fixSpeedSpikes === 'function') {
    const isOwner = localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID;
    const clean = fixSpeedSpikes(v, isOwner ? { ceiling: MAX_SPEED_CEILING } : { k: 6 }).data;
    suspect = clean[bi] != null && clean[bi] < bv * 0.9;
  }
  const dist = raw.distance && raw.distance.data;
  const time = raw.time && raw.time.data;
  // Speed ~10 s before the peak: velocity_smooth ramps into a spike over a few
  // samples, so the sample right before it is already inflated.
  let before = null;
  if (kind !== 'hr') {
    let pi = Math.max(0, bi - 10);
    if (time && time[bi] != null) { pi = bi; while (pi > 0 && time[bi] - time[pi] < 10) pi--; }
    while (pi > 0 && v[pi] == null) pi--;
    before = v[pi] != null && pi < bi ? v[pi] : null;
  }
  const spot = {
    v: 3, val: bv, before, other: other && other[bi] != null ? other[bi] : null,
    lat: ll[bi][0], lng: ll[bi][1], suspect,
    at: dist && dist[bi] != null ? dist[bi] : null,
    t: time && time[bi] != null ? time[bi] : null,
  };
  try { localStorage.setItem(_spotKey(a.id, kind), JSON.stringify(spot)); } catch {}
  return spot;
}

// Nearest segment of yours to a point, if it passes close enough to count.
function _spotSegment(lat, lng) {
  if (typeof _allSegs === 'undefined' || !_allSegs || !_allSegs.length) return null;
  if (typeof _gapSegCoords !== 'function' || typeof _gapHav !== 'function') return null;
  let best = null, bd = 60; // m — close enough to say you were on it
  for (const s of _allSegs) {
    const c = _gapSegCoords(s);
    for (let i = 0; i < c.length; i++) {
      const d = _gapHav(c[i], [lat, lng]);
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best ? { name: best.name, id: best.id, dist: Math.round(bd) } : null;
}

let _spotMaps = {};
// kind: 'speed' (default) or 'hr'. panelId lets the same activity have a panel
// in more than one list (Cycling top 5 and the Best Efforts cards).
async function showSpeedSpot(actId, btn, kind, panelId) {
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(actId));
  const pid = panelId || ('spot-' + actId);
  const panel = document.getElementById(pid);
  if (!a || !panel) return;
  if (panel.classList.contains('open')) { panel.classList.remove('open'); panel.innerHTML = ''; return; }

  panel.classList.add('open');
  panel.innerHTML = '<div class="spot-loading">' + tr('Finding the spot…') + '</div>';
  const spot = await _peakSpot(a, kind);
  if (!spot) { panel.innerHTML = '<div class="spot-loading">' + tr('No GPS data for this ride.') + '</div>'; return; }

  const seg = _spotSegment(spot.lat, spot.lng);
  const clock = spot.t != null && a.start_date_local
    ? new Date(new Date(a.start_date_local).getTime() + spot.t * 1000).toISOString().slice(11, 16)
    : null;
  const gm = `https://www.google.com/maps?q=${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`;

  panel.innerHTML = `
    <div class="spot-map" id="map-${pid}"></div>
    <div class="spot-facts">
      <div class="spot-big">${kind === 'hr' ? Math.round(spot.val) + '<i>bpm</i>' : kmh(spot.val) + `<i>${speedUnit()}</i>`}</div>
      ${spot.suspect ? `<div class="spot-warn">${tr('Looks like a GPS spike — the pin is where Strava recorded it')}</div>` : ''}
      <div class="spot-rows">
        ${spot.before != null ? `<div><span>${tr('10 s before')}</span><b>${kmh(spot.before)} ${speedUnit()}</b></div>` : ''}
        ${spot.other != null ? (kind === 'hr'
            ? `<div><span>${tr('Speed then')}</span><b>${kmh(spot.other)} ${speedUnit()}</b></div>`
            : `<div><span>${tr('Heart rate then')}</span><b>${Math.round(spot.other)} bpm</b></div>`) : ''}
        ${spot.at != null ? `<div><span>${tr('Into the ride')}</span><b>${fmtD(spot.at)}</b></div>` : ''}
        ${clock ? `<div><span>${tr('Clock time')}</span><b>${clock}</b></div>` : ''}
        <div><span>${tr('Segment')}</span><b>${seg
          ? `<a href="https://www.strava.com/segments/${seg.id}" target="_blank" rel="noopener">${seg.name}</a>`
          : (typeof _allSegs !== 'undefined' && _allSegs && _allSegs.length ? tr('not on one of yours') : tr('open Segments first'))}</b></div>
        <div><span>${tr('Coordinates')}</span><b><code>${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}</code></b></div>
      </div>
      <a class="seg-link" href="${gm}" target="_blank" rel="noopener">${tr('Google Maps')} →</a>
    </div>`;

  if (!window.L) return;
  try {
    const m = L.map('map-' + pid, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
    addBasemap(m);
    m.setView([spot.lat, spot.lng], 16);
    if (a.map && a.map.summary_polyline) {
      try { L.polyline(decodePolyline(a.map.summary_polyline), { color: '#666', weight: 3, opacity: .8 }).addTo(m); } catch {}
    }
    L.circleMarker([spot.lat, spot.lng], { radius: 8, color: '#FC4C02', fillColor: '#FC4C02', fillOpacity: 1, weight: 2 }).addTo(m);
    _spotMaps[pid] = m;
    setTimeout(() => { try { m.invalidateSize(); m.setView([spot.lat, spot.lng], 16); } catch {} }, 250);
  } catch {}
}

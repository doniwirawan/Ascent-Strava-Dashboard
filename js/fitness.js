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
function observedMaxHr() {
  if (typeof acts === 'undefined' || !acts.length) return 0;
  return acts.reduce((m, a) => Math.max(m, a.max_heartrate || 0), 0);
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

// Compact duration for the ring centre: "1h23m" / "47h" / "12m".
const fmtTc = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`;
};

// Draw a segmented "activity ring" of zone times onto a canvas.
// totals: seconds per zone. centre: {big, small}. size: logical px (DPR-scaled).
function drawZoneRing(canvas, totals, centre, size = 220) {
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
        ctx.strokeStyle = HR_ZONES[Math.min(i, 4)].color;
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
function zoneLegendHTML(totals) {
  const sum = totals.reduce((s, v) => s + v, 0) || 1;
  const peak = Math.max(...totals) || 1;
  return totals.map((v, i) => {
    const z = HR_ZONES[Math.min(i, 4)];
    const range = hrZoneRange(i);
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
  if (sum <= 0) { card.style.display = 'none'; return; }
  card.style.display = '';
  drawZoneRing(document.getElementById('hrzRing'), totals, { big: fmtTc(sum), small: 'tracked' });
  document.getElementById('hrzLegend').innerHTML = zoneLegendHTML(totals);
  const basis = athleteHrZones ? 'your Strava zones' : 'estimated max HR';
  document.getElementById('hrzNote').textContent =
    `Estimated from each activity's average HR · ${basis} · ${tracked} of ${tracked + untracked} activities have HR`;
}

// Single-activity "Heart Rate Zones" ring — exact from Strava, else approximated.
async function renderActivityHrZones(a) {
  const box = document.getElementById('actHrz');
  if (!box || !a || !a.average_heartrate) { if (box) box.style.display = 'none'; return; }
  box.innerHTML =
    `<div class="hrz-title">Heart Rate Zones</div>
     <div class="hrz-body"><canvas class="hrz-ring" id="actHrzRing"></canvas><div class="hrz-legend" id="actHrzLegend"></div></div>
     <div class="hrz-note" id="actHrzNote">Loading zones…</div>`;
  let totals = null, exact = false;
  if ('_hrz' in a) { totals = a._hrz; exact = a._hrzExact; }       // cached from a prior open
  else {
    try { if (a.id) totals = await fetchActivityHrZones(a.id); } catch { totals = null; }
    exact = !!totals;
    if (!totals) {                                                  // fallback: avg-HR bucket
      const z = hrZoneFor(a.average_heartrate);
      if (z) { totals = [0, 0, 0, 0, 0]; totals[Math.min(z.n - 1, 4)] = a.moving_time || 0; }
    }
    a._hrz = totals; a._hrzExact = exact;
  }
  if (!totals || totals.reduce((s, v) => s + v, 0) <= 0) { box.style.display = 'none'; return; }
  // The modal may have been closed/reopened while awaiting — bail if our nodes are gone.
  const ring = document.getElementById('actHrzRing');
  if (!ring) return;
  const sum = totals.reduce((s, v) => s + v, 0);
  drawZoneRing(ring, totals, { big: fmtTc(sum), small: 'moving' }, 168);
  document.getElementById('actHrzLegend').innerHTML = zoneLegendHTML(totals);
  document.getElementById('actHrzNote').textContent =
    exact ? 'Exact time in each zone, from Strava' : 'Estimated from average HR (no zone data for this activity)';
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

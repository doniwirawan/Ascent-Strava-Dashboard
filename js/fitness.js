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

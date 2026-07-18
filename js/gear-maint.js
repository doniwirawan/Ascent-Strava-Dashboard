/* ── BIKE USAGE + MAINTENANCE ─────────────────────────────────────────────────
   Extends the Gear section: a per-bike usage table (distance / elevation / hours
   / avg speed) plus maintenance reminders.

   Strava exposes NO component or service data, so reminders work off a baseline
   the user logs once per component ("serviced now" = current odometer). We then
   track distance since against an editable threshold. No baseline → no warning.
   All distances are stored in METRES (project convention); thresholds convert to
   the active unit for display/input. State lives in localStorage on this device. */

const GM_COMPONENTS = [
  { key: 'chain', name: 'Chain',      thr: 4000000 }, // ~4,000 km
  { key: 'tire',  name: 'Tires',      thr: 5000000 }, // ~5,000 km
  { key: 'brake', name: 'Brake pads', thr: 2500000 }, // ~2,500 km
  { key: 'wax',   name: 'Wax / Lube', thr: 250000  }, // ~250 km
];
const GM_KEY = 'gear_maint_v1';

function gmLoad() { try { return JSON.parse(localStorage.getItem(GM_KEY)) || {}; } catch { return {}; } }
function gmSave(s) { try { localStorage.setItem(GM_KEY, JSON.stringify(s)); } catch {} }

// Odometer (metres) for a bike: Strava's all-time distance, else summed from acts.
function gmOdo(bikeId, bikes) {
  const b = (bikes || []).find(x => String(x.id) === String(bikeId));
  if (b && b.distance) return b.distance;
  let d = 0;
  acts.forEach(a => { if (String(a.gear_id) === String(bikeId)) d += a.distance || 0; });
  return d;
}

// Status for a component from distance-since-service vs threshold (both metres).
function gmStatus(since, thr) {
  if (since == null) return { label: 'Not tracked', cls: 'idle', pct: 0 };
  const pct = thr > 0 ? since / thr : 0;
  if (pct >= 1)   return { label: 'Overdue',  cls: 'over', pct };
  if (pct >= 0.8) return { label: 'Due soon', cls: 'soon', pct };
  return { label: 'OK', cls: 'ok', pct };
}

// Worst status across a bike's tracked components (for the table summary pill).
function gmWorst(bikeId, dm, state) {
  const rank = { ok: 0, soon: 1, over: 2 };
  let worst = null;
  GM_COMPONENTS.forEach(c => {
    const cs = state[bikeId] && state[bikeId][c.key];
    if (!cs || cs.base == null) return;
    const thr = cs.thr != null ? cs.thr : c.thr;
    const st = gmStatus(Math.max(0, dm - cs.base), thr);
    if (!worst || rank[st.cls] > rank[worst.cls]) worst = st;
  });
  return worst || { label: 'Set up', cls: 'idle' };
}

// km/mi value → metres, for interpreting a threshold typed in the active unit.
function gmToMetres(val) { return (+val || 0) * (useImperial ? _MI * 1000 : 1000); }

function renderGearMaint(bikes) {
  const el = document.getElementById('gearMaint');
  if (!el) return;
  if (!bikes || !bikes.length) { el.innerHTML = ''; return; }

  // Per-bike stats from loaded activities (hours / elevation / avg speed).
  const stats = {};
  acts.forEach(a => {
    if (!a.gear_id) return;
    const s = stats[a.gear_id] || (stats[a.gear_id] = { dist: 0, elev: 0, time: 0 });
    s.dist += a.distance || 0; s.elev += a.total_elevation_gain || 0; s.time += a.moving_time || 0;
  });
  const state = gmLoad();

  const rows = bikes.map(b => {
    const s = stats[b.id] || { dist: 0, elev: 0, time: 0 };
    const dm = gmOdo(b.id, bikes);
    const avg = s.time > 0 ? s.dist / s.time : 0;
    const w = gmWorst(b.id, dm, state);
    return `<tr>
      <td class="gm-td-name">${b.nickname || b.name || 'Bike'}${b.primary ? ' <span class="gear-primary">Primary</span>' : ''}</td>
      <td>${kmVal(dm).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${distUnit()}</td>
      <td>${s.elev ? Math.round(elevVal(s.elev)).toLocaleString() + ' ' + elevUnit() : '—'}</td>
      <td>${s.time ? Math.round(s.time / 3600).toLocaleString() + ' h' : '—'}</td>
      <td>${avg ? kmh(avg).toFixed(1) + ' ' + speedUnit() : '—'}</td>
      <td><span class="gm-pill gm-${w.cls}">${w.label}</span></td>
    </tr>`;
  }).join('');

  const table = `<div class="gm-table-wrap"><table class="gm-table">
    <thead><tr><th>Bike</th><th>Distance</th><th>Elevation</th><th>Hours</th><th>Avg speed</th><th>Maintenance</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  const cards = bikes.map(b => {
    const dm = gmOdo(b.id, bikes);
    const comps = GM_COMPONENTS.map(c => {
      const cs = (state[b.id] && state[b.id][c.key]) || {};
      const thr = cs.thr != null ? cs.thr : c.thr;
      const tracked = cs.base != null;
      const since = tracked ? Math.max(0, dm - cs.base) : null;
      const st = gmStatus(since, thr);
      const thrDisp = kmVal(thr).toFixed(0);
      const sinceDisp = since != null ? kmVal(since).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
      return `<div class="gm-comp gm-${st.cls}">
        <div class="gm-comp-top"><span class="gm-comp-name">${c.name}</span><span class="gm-comp-status">${st.label}</span></div>
        <div class="gm-bar"><span style="width:${Math.min(100, Math.round(st.pct * 100))}%"></span></div>
        <div class="gm-comp-bot">
          <span class="gm-since">${tracked ? `${sinceDisp} / ${thrDisp} ${distUnit()}` : 'not tracked'}</span>
          <span class="gm-actions">
            <label class="gm-thr-l">every <input class="gm-thr" type="number" min="1" value="${thrDisp}" data-bike="${b.id}" data-comp="${c.key}"> ${distUnit()}</label>
            <button class="gm-log" data-bike="${b.id}" data-comp="${c.key}">${tracked ? 'Log again' : 'Log service'}</button>
            ${tracked ? `<button class="gm-clear" data-bike="${b.id}" data-comp="${c.key}" title="Stop tracking">✕</button>` : ''}
          </span>
        </div>
      </div>`;
    }).join('');
    return `<div class="gm-bike">
      <div class="gm-bike-head">${b.nickname || b.name || 'Bike'} <span class="gm-bike-km">${kmVal(dm).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${distUnit()} total</span></div>
      <div class="gm-comps">${comps}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="gm-section-title">Bike Usage</div>
    ${table}
    <div class="gm-section-title">Maintenance <span class="gm-hint">Strava has no service data — log a service to start tracking. Saved on this device.</span></div>
    ${cards}`;

  el.querySelectorAll('.gm-log').forEach(btn => btn.onclick = () => gmLog(btn.dataset.bike, btn.dataset.comp, bikes));
  el.querySelectorAll('.gm-clear').forEach(btn => btn.onclick = () => gmClear(btn.dataset.bike, btn.dataset.comp, bikes));
  el.querySelectorAll('.gm-thr').forEach(inp => inp.onchange = () => gmSetThr(inp.dataset.bike, inp.dataset.comp, inp.value, bikes));
}

function gmLog(bikeId, comp, bikes) {
  const s = gmLoad();
  s[bikeId] = s[bikeId] || {};
  s[bikeId][comp] = s[bikeId][comp] || {};
  s[bikeId][comp].base = gmOdo(bikeId, bikes); // serviced now → counter resets to 0
  gmSave(s);
  renderGearMaint(bikes);
}

function gmClear(bikeId, comp, bikes) {
  const s = gmLoad();
  if (s[bikeId] && s[bikeId][comp]) { delete s[bikeId][comp].base; }
  gmSave(s);
  renderGearMaint(bikes);
}

function gmSetThr(bikeId, comp, val, bikes) {
  const m = gmToMetres(val);
  if (m <= 0) return;
  const s = gmLoad();
  s[bikeId] = s[bikeId] || {};
  s[bikeId][comp] = s[bikeId][comp] || {};
  s[bikeId][comp].thr = m;
  gmSave(s);
  renderGearMaint(bikes);
}

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
      <td class="gm-td-name">${b.nickname || b.name || tr('Bike')}${b.primary ? ' <span class="gear-primary">' + tr('Primary') + '</span>' : ''}</td>
      <td>${kmVal(dm).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${distUnit()}</td>
      <td>${s.elev ? Math.round(elevVal(s.elev)).toLocaleString() + ' ' + elevUnit() : '—'}</td>
      <td>${s.time ? Math.round(s.time / 3600).toLocaleString() + ' h' : '—'}</td>
      <td>${avg ? kmh(avg).toFixed(1) + ' ' + speedUnit() : '—'}</td>
      <td><span class="gm-pill gm-${w.cls}">${tr(w.label)}</span></td>
    </tr>`;
  }).join('');

  const table = `<div class="gm-table-wrap"><table class="gm-table">
    <thead><tr><th>${tr('Bike')}</th><th>${tr('Distance')}</th><th>${tr('Elevation')}</th><th>${tr('Hours')}</th><th>${tr('Avg speed')}</th><th>${tr('Maintenance')}</th></tr></thead>
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
        <div class="gm-comp-top"><span class="gm-comp-name">${tr(c.name)}</span><span class="gm-comp-status">${tr(st.label)}</span></div>
        <div class="gm-bar"><span style="width:${Math.min(100, Math.round(st.pct * 100))}%"></span></div>
        <div class="gm-comp-bot">
          <span class="gm-since">${tracked ? `${sinceDisp} / ${thrDisp} ${distUnit()}` : tr('not tracked')}</span>
          <span class="gm-actions">
            <label class="gm-thr-l">${tr('every')} <input class="gm-thr" type="number" min="1" value="${thrDisp}" data-bike="${b.id}" data-comp="${c.key}"> ${distUnit()}</label>
            <button class="gm-log" data-bike="${b.id}" data-comp="${c.key}">${tracked ? tr('Log again') : tr('Log service')}</button>
            ${tracked ? `<button class="gm-clear" data-bike="${b.id}" data-comp="${c.key}" title="${tr('Stop tracking')}">✕</button>` : ''}
          </span>
        </div>
      </div>`;
    }).join('');
    return `<div class="gm-bike">
      <div class="gm-bike-head">${b.nickname || b.name || tr('Bike')} <span class="gm-bike-km">${kmVal(dm).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${distUnit()} ${tr('total')}</span></div>
      <div class="gm-comps">${comps}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="gm-section-title">${tr('Bike Usage')}</div>
    ${table}
    ${renderGearCost(bikes, stats)}
    <div class="gm-section-title">${tr('Maintenance')} <span class="gm-hint">${tr('Strava has no service data — log a service to start tracking. Saved on this device.')}</span></div>
    ${cards}`;

  el.querySelectorAll('.gm-log').forEach(btn => btn.onclick = () => gmLog(btn.dataset.bike, btn.dataset.comp, bikes));
  el.querySelectorAll('.gm-clear').forEach(btn => btn.onclick = () => gmClear(btn.dataset.bike, btn.dataset.comp, bikes));
  el.querySelectorAll('.gm-thr').forEach(inp => inp.onchange = () => gmSetThr(inp.dataset.bike, inp.dataset.comp, inp.value, bikes));
  gcWire(el, bikes);
  // first visit on a device: pull the owner's bike prices, then redraw once
  gcOwnerDefaults(bikes).then(changed => { if (changed) renderGearMaint(bikes); });
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

/* ── COST PER KM (owner only) ──
   What each bike cost vs how far it has been ridden. Prices come from the
   owner-gated /api/owner-profile (OWNER_GEAR_COSTS env — the repo is public)
   and can be edited here (saved on this device). Shared tools/workshop gear is
   split across the bikes in proportion to the distance each has done. */
const GC_KEY = 'gear_cost_v1';
let _gcTried = false;
function gcLoad() { try { return JSON.parse(localStorage.getItem(GC_KEY)) || { bikes: {}, tools: null }; } catch { return { bikes: {}, tools: null }; } }
function gcSave(s) { try { localStorage.setItem(GC_KEY, JSON.stringify(s)); } catch {} }
function gcIsOwner() { try { return localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID && !!CONFIG.accessToken; } catch { return false; } }
const gcRp = v => 'Rp' + Math.round(v).toLocaleString('id-ID');

/* First visit on a device: fill in the owner's prices from the server. */
async function gcOwnerDefaults(bikes) {
  if (_gcTried || !gcIsOwner()) return false;
  _gcTried = true;
  const s = gcLoad();
  const missing = bikes.some(b => s.bikes[b.id] == null) || s.tools == null;
  if (!missing) return false;
  try {
    const r = await fetch('/api/owner-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken }) });
    const d = r.ok ? await r.json() : null;
    const gc = d && d.gear_costs;
    if (!gc) return false;
    bikes.forEach(b => {
      if (s.bikes[b.id] != null) return;
      const name = ((b.nickname || '') + ' ' + (b.name || '')).toLowerCase();
      const k = Object.keys(gc.bikes || {}).find(k => name.includes(k.toLowerCase()));
      if (k) s.bikes[b.id] = gc.bikes[k];
    });
    if (s.tools == null && gc.tools != null) s.tools = gc.tools;
    gcSave(s);
    return true;
  } catch { return false; }
}

function renderGearCost(bikes, stats) {
  if (!gcIsOwner()) return '';
  const s = gcLoad();
  const odo = b => gmOdo(b.id, bikes);
  const priced = bikes.filter(b => s.bikes[b.id] > 0);
  const kmAll = priced.reduce((t, b) => t + odo(b), 0);
  const tools = s.tools > 0 ? s.tools : 0;
  const U = distUnit(), per = m => kmVal(m) || 0;
  const rides = id => acts.filter(a => String(a.gear_id) === String(id)).length;
  // days in use: from the bike's first recorded ride to today; riding days = distinct dates ridden
  const DAY = 86400000;
  const onBike = ids => acts.filter(a => ids.includes(String(a.gear_id)) && a.start_date);
  const daysOwned = ids => { const t = onBike(ids).map(a => new Date(a.start_date).getTime()); return t.length ? Math.max(1, Math.ceil((Date.now() - Math.min(...t)) / DAY)) : 0; };
  const rideDays = ids => new Set(onBike(ids).map(a => (a.start_date_local || a.start_date).slice(0, 10))).size;
  const timeStats = (cost, ids) => { const d = daysOwned(ids), rd = rideDays(ids); return (d ? stat('Per day', gcRp(cost / d), trf('{0} days in use', d)) : '')
    + (d >= 30 ? stat('Per month', gcRp(cost / (d / 30.44)), trf('{0} months', (d / 30.44).toFixed(1))) : '')
    + (rd ? stat('Per riding day', gcRp(cost / rd), trf('{0} days ridden', rd)) : ''); };
  const input = (key, val, lbl) => `<label class="gc-in"><span>${tr(lbl)}</span><span class="gc-rp">Rp<input type="text" inputmode="numeric" data-gc="${key}" value="${val ? Math.round(val).toLocaleString('id-ID') : ''}" placeholder="0"></span></label>`;
  const stat = (lbl, val, sub) => `<div class="gc-stat"><div class="gc-v">${val}</div><div class="gc-l">${tr(lbl)}${sub ? '<br><i>' + sub + '</i>' : ''}</div></div>`;

  const cards = bikes.map(b => {
    const price = s.bikes[b.id] || 0, dm = odo(b), st = stats[b.id] || { time: 0 };
    const share = price && kmAll ? dm / kmAll : 0, toolPart = tools * share, all = price + toolPart;
    const km = per(dm), n = rides(b.id), h = st.time / 3600;
    let body = `<div class="gc-empty">${tr('Enter what this bike cost to see its cost per km.')}</div>`;
    if (price && km) {
      const next = [1000, 2500, 5000, 10000, 20000, 30000, 50000].map(x => x * (U === 'mi' ? 1609.344 : 1000)).filter(m => m > dm * 1.15).slice(0, 3);
      body = `<div class="gc-hero"><div class="gc-big">${gcRp(all / km)}<small>/${U}</small></div>
          <div class="gc-hero-sub">${trf('{0} incl. {1} of shared tools', gcRp(all), gcRp(toolPart))} · ${trf('{0} ridden', km.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + U)}</div></div>
        <div class="gc-stats">
          ${stat('Bike only', gcRp(price / km) + '/' + U)}
          ${stat('Per 100 ' + U, gcRp(all / km * 100))}
          ${n ? stat('Per ride', gcRp(all / n), trf('{0} rides', n)) : ''}
          ${h >= 1 ? stat('Per hour', gcRp(all / h), Math.round(h) + ' h') : ''}
          ${timeStats(all, [String(b.id)])}
          ${tools ? stat('Tools share', Math.round(share * 100) + '%', gcRp(toolPart)) : ''}
        </div>
        ${next.length ? `<div class="gc-proj"><span>${tr('Keep riding:')}</span>${next.map(m => `<b>${per(m).toLocaleString()} ${U} → ${gcRp(all / per(m))}/${U}</b>`).join('')}</div>` : ''}`;
    }
    return `<div class="gc-bike"><div class="gc-head"><span class="gc-name">${b.nickname || b.name || tr('Bike')}</span>${input('bike:' + b.id, price, 'Bike + components')}</div>${body}</div>`;
  }).join('');

  const bikesOnly = priced.reduce((t, b) => t + s.bikes[b.id], 0), invested = bikesOnly + tools;
  const allRides = priced.reduce((t, b) => t + rides(b.id), 0);
  const allH = priced.reduce((t, b) => t + ((stats[b.id] || {}).time || 0), 0) / 3600;
  const km0 = per(kmAll).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + U;
  // two headline numbers: everything (bikes + shared tools) and the bikes alone
  const total = invested && kmAll ? `<div class="gc-total">
      <div class="gc-l">${tr('All bikes + gear')} · ${trf('{0} ridden', km0)}</div>
      <div class="gc-pair">
        <div><div class="gc-big">${gcRp(invested / per(kmAll))}<small>/${U}</small></div><div class="gc-hero-sub">${trf('With tools · {0}', gcRp(invested))}</div></div>
        ${tools ? `<div><div class="gc-big gc-big2">${gcRp(bikesOnly / per(kmAll))}<small>/${U}</small></div><div class="gc-hero-sub">${trf('Bikes only · {0}', gcRp(bikesOnly))}</div></div>` : ''}
      </div>
      <div class="gc-stats">${allRides ? stat('Per ride', gcRp(invested / allRides), trf('{0} rides', allRides)) : ''}${allH >= 1 ? stat('Per hour', gcRp(invested / allH), Math.round(allH) + ' h') : ''}${timeStats(invested, priced.map(b => String(b.id)))}${tools ? stat('Tools', gcRp(tools), trf('{0} of the total', Math.round(tools / invested * 100) + '%')) : ''}</div>
    </div>` : '';

  return `<div class="gm-section-title">${tr('Cost per km')} <span class="gm-hint">${tr('Only you can see this. Shared tools are split by how far each bike has been ridden.')}</span></div>
    <div class="gc-wrap">${total}<div class="gc-tools">${input('tools', tools, 'Tools / workshop (shared)')}</div><div class="gc-grid">${cards}</div></div>`;
}

function gcWire(el, bikes) {
  el.querySelectorAll('[data-gc]').forEach(inp => inp.onchange = () => {
    const v = +String(inp.value).replace(/[^\d]/g, '') || 0;
    const s = gcLoad(), k = inp.dataset.gc;
    if (k === 'tools') s.tools = v; else s.bikes[k.slice(5)] = v;
    gcSave(s); renderGearMaint(bikes);
  });
}

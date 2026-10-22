/* ── POWER PAGE ──
   Everything about watts in one place: FTP & W/kg, power-meter totals, every
   ride's NP / IF / VI / TSS, the power curve and power zones, and — without a
   meter — the climbing and physics estimates. The cards themselves are built
   by their own modules (training.js, power-curve.js, climb-ftp.js, sauce.js,
   fitness.js); this file lays them out and adds the summary and ride list.
   Only power-meter rides count here (ridePower in utils.js). */
const PW_ROWS = 30;

function _pwSummaryHTML(rides, ftpEst) {
  const tile = (val, unit, lbl, sub) => `
    <div class="tr-tile card">
      <div class="tr-tile-val">${val}<span class="tr-tile-unit">${unit || ''}</span></div>
      <div class="tr-tile-lbl">${lbl}</div>
      ${sub ? `<div class="tr-tile-sub">${sub}</div>` : ''}
    </div>`;
  const kg = athWeightKg();
  const top = (f) => rides.reduce((b, a) => { const v = f(ridePower(a)); return v > (b ? b.v : 0) ? { v, a } : b; }, null);
  const max = top(p => p.max || 0), np = top(p => p.np || 0);
  const since = Date.now() - 28 * 864e5;
  const kj = rides.filter(a => new Date(a.start_date).getTime() >= since).reduce((s, a) => s + (a.kilojoules || 0), 0);
  const day = a => fmtDtShort(a.start_date_local || a.start_date);
  return `<div class="tr-tiles pw-tiles">
    ${tile(ftpEst ? ftpEst.value : '—', ' W', 'FTP', ftpEst && ftpEst.estimated ? tr('estimated') : '')}
    ${tile(ftpEst ? (ftpEst.value / kg).toFixed(2) : '—', ' W/kg', tr('FTP per kg'), trf('at {0} kg', kg))}
    ${tile(max ? Math.round(max.v) : '—', ' W', tr('Max power'), max ? day(max.a) : '')}
    ${tile(np ? Math.round(np.v) : '—', ' W', tr('Best NP ride'), np ? day(np.a) : '')}
    ${tile(rides.length, '', tr('Power-meter rides'), '')}
    ${tile(Math.round(kj).toLocaleString(), ' kJ', tr('Work, last 28 days'), '')}
  </div>`;
}

function _pwRidesHTML(rides) {
  if (!rides.length) return `<div class="card tr-pc"><div class="tr-chart-title">${tr('Rides with power')}</div>
    <div class="tr-basis-note">${tr('No rides with a power meter yet. Once you ride with one, every ride shows its normalized power, intensity, variability and TSS here.')}</div></div>`;
  const n = (v, d) => v == null ? '—' : (+v).toFixed(d || 0);
  const rows = rides.slice(0, PW_ROWS).map(a => {
    const p = ridePower(a);
    return `<tr class="dt-act" data-id="${a.id}">
      <td style="text-align:left">${fmtDtShort(a.start_date_local || a.start_date)}</td>
      <td style="text-align:left">${(a.name || '').replace(/</g, '&lt;')}</td>
      <td>${n(p.avg)}</td><td>${n(p.np)}</td><td>${n(p.max)}</td><td>${n(p.wkg, 2)}</td>
      <td>${n(p.if, 2)}</td><td>${n(p.vi, 2)}</td><td>${n(p.tss)}</td><td>${n(p.kj)}</td>
    </tr>`;
  }).join('');
  const th = ['Date', 'Ride', 'Avg W', 'NP', 'Max W', 'W/kg', 'IF', 'VI', 'TSS', 'kJ'].map((h, i) => `<th${i < 2 ? ' style="text-align:left"' : ''}>${tr(h)}</th>`).join('');
  return `<div class="card tr-pc">
    <div class="tr-chart-title">${tr('Rides with power')} <span class="gm-hint">${trf('latest {0}', Math.min(PW_ROWS, rides.length))}</span></div>
    <div class="dt-wrap" style="max-height:none"><table class="dt"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="tr-basis-note">${tr('NP = normalized power, IF = NP ÷ FTP, VI = NP ÷ average (1.00 = perfectly steady), TSS = training stress (100 ≈ an hour at FTP). Click a ride to open it.')}</div>
  </div>`;
}

/* ── Insights & breakdowns (from ride summaries only — no extra Strava calls) ── */
const _pwDay = a => new Date(a.start_date_local || a.start_date);
const _pwIn = (rides, from, to) => rides.filter(a => { const t = _pwDay(a).getTime(); return t >= from && t < to; });
// time-weighted average of f over rides (long rides count for more)
function _pwAvg(rides, f) {
  let s = 0, t = 0;
  rides.forEach(a => { const v = f(a), w = a.moving_time || 0; if (v > 0 && w > 0) { s += v * w; t += w; } });
  return t ? s / t : null;
}
const _pwNp = a => { const p = ridePower(a); return p && (p.np || p.avg); };
const _pwEf = a => a.average_heartrate > 0 ? _pwNp(a) / a.average_heartrate : null;   // watts per heartbeat
const _pwPct = (a, b) => Math.round((a - b) / b * 100);
const _pwBands = [[0.55, 'Recovery', '#94a3b8'], [0.75, 'Endurance', '#3b82f6'], [0.9, 'Tempo', '#22c55e'], [1.05, 'Threshold', '#f59e0b'], [Infinity, 'Above threshold', '#ef4444']];
const _pwEsc = s => String(s || '').replace(/</g, '&lt;');

function _pwInsightsHTML(rides) {
  const now = Date.now(), D = 864e5, L = [];
  const cur = _pwIn(rides, now - 28 * D, now + D), prev = _pwIn(rides, now - 56 * D, now - 28 * D);
  if (cur.length >= 2 && prev.length >= 2) {
    const a = _pwAvg(cur, _pwNp), b = _pwAvg(prev, _pwNp), d = _pwPct(a, b);
    L.push(Math.abs(d) < 3 ? trf('Normalized power is steady: {0} W over the last 4 weeks, {1} W the 4 before.', Math.round(a), Math.round(b))
      : trf(d > 0 ? 'Normalized power is up {0}% on the 4 weeks before ({1} → {2} W).' : 'Normalized power is down {0}% on the 4 weeks before ({1} → {2} W).', Math.abs(d), Math.round(b), Math.round(a)));
    const ea = _pwAvg(cur, _pwEf), eb = _pwAvg(prev, _pwEf);
    if (ea && eb) {
      const e = _pwPct(ea, eb);
      L.push(Math.abs(e) < 3 ? tr('Watts per heartbeat are holding steady, so your aerobic fitness is stable.')
        : trf(e > 0 ? 'You make {0}% more watts per heartbeat than the 4 weeks before: your aerobic fitness is improving.' : 'You make {0}% fewer watts per heartbeat than the 4 weeks before: fatigue, heat or lost fitness.', Math.abs(e)));
    }
  }
  const vis = rides.map(a => ridePower(a).vi).filter(Boolean).sort((x, y) => x - y);
  if (vis.length >= 3) {
    const m = vis[Math.floor(vis.length / 2)];
    L.push(m <= 1.05 ? trf('Your pacing is very steady (typical VI {0}).', m.toFixed(2))
      : m > 1.12 ? trf('Your rides are surgy (typical VI {0}): lots of hard accelerations. Smoother pacing saves energy on long rides.', m.toFixed(2))
      : trf('Your pacing is fairly steady (typical VI {0}); the surges are mostly from climbs and junctions.', m.toFixed(2)));
  }
  const ifs = rides.slice(0, 20).map(a => ridePower(a).if).filter(Boolean);
  if (ifs.length >= 5) {
    const grey = ifs.filter(x => x >= 0.75 && x < 0.9).length / ifs.length, easy = ifs.filter(x => x < 0.75).length / ifs.length;
    if (grey >= 0.5) L.push(trf('{0}% of your recent rides are tempo (IF 0.75–0.90): too hard to recover from, too easy to raise FTP. Make easy rides easier and hard ones harder.', Math.round(grey * 100)));
    else if (easy >= 0.6) L.push(trf('{0}% of your recent rides are easy (IF under 0.75), a good aerobic base. One or two harder sessions a week will lift FTP.', Math.round(easy * 100)));
  }
  const wk = _pwIn(rides, now - 7 * D, now + D).reduce((s, a) => s + (ridePower(a).tss || 0), 0);
  const avg4 = _pwIn(rides, now - 35 * D, now - 7 * D).reduce((s, a) => s + (ridePower(a).tss || 0), 0) / 4;
  if (avg4 > 0 && wk > 0) L.push(wk > avg4 * 1.3 ? trf('This week is heavy: {0} TSS against your usual {1}. Plan an easy day.', Math.round(wk), Math.round(avg4))
    : trf('{0} TSS in the last 7 days; your usual week is {1}.', Math.round(wk), Math.round(avg4)));
  const long = rides.filter(a => (a.moving_time || 0) >= 1200);
  const best = long.reduce((b, a) => !b || ridePower(a).wkg > ridePower(b).wkg ? a : b, null);
  if (best) L.push(trf('Highest average W/kg: {0} on {1} ({2}).', ridePower(best).wkg.toFixed(2), _pwEsc(best.name), fmtDtShort(_pwDay(best))));
  if (!L.length) return '';
  return `<div class="card tr-pc"><div class="tr-chart-title">${tr('Power insights')}</div>
    <ul class="pw-ins">${L.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
}

function _pwWeeks(rides, n) {
  const mon = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x.getTime(); };
  const W = 7 * 864e5, start = mon(Date.now()) - (n - 1) * W, weeks = [];
  for (let i = 0; i < n; i++) weeks.push({ t: start + i * W, rides: [] });
  rides.forEach(a => { const i = Math.round((mon(_pwDay(a)) - start) / W); if (i >= 0 && i < n) weeks[i].rides.push(a); });
  return weeks.map(w => ({ label: fmtDtShort(w.t), tss: Math.round(w.rides.reduce((s, a) => s + (ridePower(a).tss || 0), 0)),
    np: w.rides.length ? Math.round(_pwAvg(w.rides, _pwNp)) : null }));
}

function _pwChartsHTML(rides) {
  if (rides.length < 2) return '';
  const hasHr = rides.filter(a => a.average_heartrate > 0).length >= 3;
  return `<div class="card tr-pc"><div class="tr-chart-title">${tr('Weekly power')} <span class="gm-hint">${tr('training stress and normalized power, last 16 weeks')}</span></div>
      <div style="height:260px"><canvas id="pwWeekChart"></canvas></div></div>
    ${hasHr ? `<div class="card tr-pc"><div class="tr-chart-title">${tr('Aerobic efficiency')} <span class="gm-hint">${tr('watts per heartbeat, rising means fitter')}</span></div>
      <div style="height:220px"><canvas id="pwEfChart"></canvas></div>
      <div class="tr-basis-note">${tr('Efficiency factor = normalized power ÷ average heart rate. Compare similar rides: heat, hills and fatigue all move it.')}</div></div>` : ''}`;
}

function _pwDrawCharts(rides) {
  if (typeof Chart === 'undefined' || rides.length < 2) return;
  const orange = getComputedStyle(document.documentElement).getPropertyValue('--orange').trim() || '#fc4c02';
  const scales = (y, y1) => ({
    x: { grid: { color: '#1c1c1c' }, ticks: { color: '#555', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 } },
    y: { position: 'left', grid: { color: '#1c1c1c' }, ticks: { color: '#666', font: { size: 10 } }, title: { display: true, text: y, color: '#666', font: { size: 10 } } },
    ...(y1 ? { y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#a78bfa', font: { size: 10 } }, title: { display: true, text: y1, color: '#a78bfa', font: { size: 10 } } } } : {}),
  });
  const plugins = { legend: { display: true, labels: { color: '#888', font: { size: 11 }, boxWidth: 12, usePointStyle: true } },
    tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa' } };
  const w = _pwWeeks(rides, 16);
  destroyChart('pwWeek');
  const c1 = document.getElementById('pwWeekChart');
  if (c1) charts['pwWeek'] = new Chart(c1, { data: { labels: w.map(x => x.label), datasets: [
    { type: 'bar', label: 'TSS', data: w.map(x => x.tss), backgroundColor: orange, borderRadius: 3, yAxisID: 'y' },
    { type: 'line', label: tr('Normalized power') + ' (W)', data: w.map(x => x.np), borderColor: '#a78bfa', backgroundColor: '#a78bfa', pointRadius: 3, spanGaps: true, tension: 0.3, yAxisID: 'y1' },
  ] }, options: { responsive: true, maintainAspectRatio: false, plugins, scales: scales('TSS', 'W') } });
  const pts = rides.filter(a => _pwEf(a)).slice(0, 60).reverse();
  destroyChart('pwEf');
  const c2 = document.getElementById('pwEfChart');
  if (c2 && pts.length >= 3) {
    const ef = pts.map(a => +_pwEf(a).toFixed(2));
    const roll = ef.map((_, i) => { const s = ef.slice(Math.max(0, i - 4), i + 1); return +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2); });
    charts['pwEf'] = new Chart(c2, { type: 'line', data: { labels: pts.map(a => fmtDtShort(_pwDay(a))), datasets: [
      { label: tr('Each ride'), data: ef, borderColor: 'transparent', backgroundColor: '#22c55e', pointRadius: 3, showLine: false },
      { label: tr('5-ride average'), data: roll, borderColor: '#22c55e', backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, borderWidth: 2 },
    ] }, options: { responsive: true, maintainAspectRatio: false, plugins, scales: scales(tr('W per bpm')) } });
  }
}

function _pwBreakdownHTML(rides) {
  if (!rides.length) return '';
  const row = (lbl, val, sub) => `<div class="pw-row"><span>${lbl}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  // intensity mix (IF bands) over every power ride
  const ifs = rides.map(a => ridePower(a).if).filter(Boolean);
  let mix = '';
  if (ifs.length) {
    const n = _pwBands.map((b, i) => ifs.filter(x => x < b[0] && (i === 0 || x >= _pwBands[i - 1][0])).length);
    mix = `<div class="card tr-pc"><div class="tr-chart-title">${tr('Ride intensity mix')} <span class="gm-hint">${tr('by intensity factor')}</span></div>
      ${_pwBands.map((b, i) => `<div class="pw-bar"><span>${tr(b[1])}</span><i><em style="width:${Math.round(n[i] / ifs.length * 100)}%;background:${b[2]}"></em></i><b>${n[i]}</b></div>`).join('')}</div>`;
  }
  // best NP for long rides
  const long = [3600, 7200, 10800].map(s => {
    const b = rides.filter(a => (a.moving_time || 0) >= s && ridePower(a).np).reduce((m, a) => !m || ridePower(a).np > ridePower(m).np ? a : m, null);
    return b ? row(trf('Best NP, {0}h+ ride', s / 3600), Math.round(ridePower(b).np) + ' W', fmtDtShort(_pwDay(b))) : '';
  }).join('');
  // hilly vs flat
  const mpk = a => (a.total_elevation_gain || 0) / Math.max(1, (a.distance || 0) / 1000);
  const hilly = rides.filter(a => mpk(a) >= 10), flat = rides.filter(a => mpk(a) < 5);
  const terrain = (hilly.length && flat.length) ? row(tr('Hilly rides (10+ m/km)'), Math.round(_pwAvg(hilly, _pwNp)) + ' W', trf('{0} rides', hilly.length))
    + row(tr('Flat rides (under 5 m/km)'), Math.round(_pwAvg(flat, _pwNp)) + ' W', trf('{0} rides', flat.length)) : '';
  // per bike
  const bikes = (typeof _gearCache !== 'undefined' && _gearCache) || (typeof currentAthlete !== 'undefined' && currentAthlete && currentAthlete.bikes) || [];
  const byGear = {};
  rides.forEach(a => { if (a.gear_id) (byGear[a.gear_id] = byGear[a.gear_id] || []).push(a); });
  const gear = Object.keys(byGear).length > 1 ? Object.entries(byGear).map(([id, rs]) => {
    const b = bikes.find(x => String(x.id) === String(id));
    return row(_pwEsc(b && b.name ? b.name : tr('Bike')), Math.round(_pwAvg(rs, _pwNp)) + ' W', trf('{0} rides · {1}', rs.length, fmtSpeed(_pwAvg(rs, a => a.average_speed))));
  }).join('') : '';
  const side = long || terrain || gear ? `<div class="card tr-pc"><div class="tr-chart-title">${tr('Power records & breakdown')}</div>
    ${long}${terrain ? `<div class="pw-sub">${tr('Normalized power by terrain')}</div>${terrain}` : ''}${gear ? `<div class="pw-sub">${tr('Normalized power by bike')}</div>${gear}` : ''}</div>` : '';
  return mix || side ? `<div class="pw-grid">${mix}${side}</div>` : '';
}

function renderPower() {
  const body = document.getElementById('powerBody');
  if (!body) return;
  if (typeof acts === 'undefined' || !acts.length) { body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">' + tr('Load your activities to see your power.') + '</div>'; return; }
  const ftpEst = (typeof estimateFtp === 'function' && estimateFtp()) || null;
  const rides = acts.filter(a => ridePower(a)).sort((x, y) => String(y.start_date).localeCompare(String(x.start_date)));
  body.innerHTML = `
    ${_pwSummaryHTML(rides, ftpEst)}
    ${_pwInsightsHTML(rides)}
    ${_pwChartsHTML(rides)}
    ${_pwBreakdownHTML(rides)}
    ${_trFtpCardHTML(ftpEst)}
    ${_trFtpTrendHTML()}
    ${_trNote('FTP & W/kg')}
    ${_trZonesHTML(ftpEst)}
    ${typeof _trPowerCurveHTML === 'function' ? _trPowerCurveHTML() : ''}
    ${typeof _trClimbPowerHTML === 'function' ? _trClimbPowerHTML() : ''}
    ${typeof _trSauceHTML === 'function' ? _trSauceHTML() : ''}
    ${_pwRidesHTML(rides)}`;
  _pwDrawCharts(rides);
  body.querySelectorAll('tr.dt-act').forEach(r => r.onclick = () => openActivityModal(r.dataset.id));
  if (typeof renderOverviewPowerZones === 'function') renderOverviewPowerZones();
  // keep FTP-from-climbs current: rescans only when new hilly rides arrive
  if (typeof autoClimbPower === 'function') autoClimbPower();
}

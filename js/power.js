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

function renderPower() {
  const body = document.getElementById('powerBody');
  if (!body) return;
  if (typeof acts === 'undefined' || !acts.length) { body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">' + tr('Load your activities to see your power.') + '</div>'; return; }
  const ftpEst = (typeof estimateFtp === 'function' && estimateFtp()) || null;
  const rides = acts.filter(a => ridePower(a)).sort((x, y) => String(y.start_date).localeCompare(String(x.start_date)));
  body.innerHTML = `
    ${_pwSummaryHTML(rides, ftpEst)}
    ${_trFtpCardHTML(ftpEst)}
    ${_trFtpTrendHTML()}
    ${_trNote('FTP & W/kg')}
    ${_trZonesHTML(ftpEst)}
    ${typeof _trPowerCurveHTML === 'function' ? _trPowerCurveHTML() : ''}
    ${typeof _trClimbPowerHTML === 'function' ? _trClimbPowerHTML() : ''}
    ${typeof _trSauceHTML === 'function' ? _trSauceHTML() : ''}
    ${_pwRidesHTML(rides)}`;
  body.querySelectorAll('tr.dt-act').forEach(r => r.onclick = () => openActivityModal(r.dataset.id));
  if (typeof renderOverviewPowerZones === 'function') renderOverviewPowerZones();
  // keep FTP-from-climbs current: rescans only when new hilly rides arrive
  if (typeof autoClimbPower === 'function') autoClimbPower();
}

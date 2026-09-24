/* ── DATA TABLE (Data page) ──
   Every activity and every sleep night in one sortable table. One row per
   activity, carrying the sleep of the night before it (a night is dated by
   the morning you woke up, so sleep dated D is the sleep before riding on D).
   Nights with no activity get their own row with empty ride columns.
   Sleep columns are owner-only (the data comes from the gated /api/sleep).
   Click a header to sort (again to reverse; blanks always last). */
let _dtSort = { key: 'date', dir: -1 }, _dtFilter = 'all', _dtRows = [], _dtCols = [];

const _dtHM = m => m == null || isNaN(m) ? '' : Math.floor(m / 60) + ':' + String(Math.round(m % 60)).padStart(2, '0');
// bed / up are hours from midnight (bed -1.87 = 22:08 the evening before)
const _dtClock = h => h == null || isNaN(h) ? '' : (() => { const m = Math.round(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); })();
const _dtNum = (v, d) => v == null || v === '' || isNaN(v) ? '' : (+v).toLocaleString(undefined, { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });

function _dtColumns(withSleep) {
  const ride = isRide, U = distUnit(), S = speedUnit();
  const cols = [
    { key: 'date', lbl: 'Date', val: r => r.date, fmt: r => r.date ? new Date(r.date + 'T00:00:00Z').toLocaleDateString(window.LANG === 'id' ? 'id-ID' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '', sticky: true }, // spans years, so always show the year
    { key: 'name', lbl: 'Activity', val: r => r.a ? r.a.name : null, fmt: r => r.a ? (r.a.name || '').replace(/</g, '&lt;') : '<span class="dt-rest">' + tr('Rest day') + '</span>', txt: true },
    { key: 'type', lbl: 'Type', val: r => r.a ? (r.a.sport_type || r.a.type) : null, txt: true },
    { key: 'dest', lbl: 'Destination', val: r => r.a && r.a.route_places && r.a.route_places.furthest_place ? destName(r.a.route_places) : null, txt: true },
    { key: 'reg', lbl: 'Regency', val: r => r.a && typeof _regOf !== 'undefined' ? (_regOf[r.a.id] || null) : null, txt: true },
    { key: 'dist', better: 1, lbl: 'Distance', unit: U, val: r => r.a ? kmVal(r.a.distance || 0) : null, fmt: r => r.a ? _dtNum(kmVal(r.a.distance || 0), 1) : '' },
    { key: 'time', better: 1, lbl: 'Moving time', val: r => r.a ? r.a.moving_time : null, fmt: r => r.a ? fmtT(r.a.moving_time) : '' },
    { key: 'elev', better: 1, lbl: 'Elevation', unit: elevUnit(), val: r => r.a ? elevVal(r.a.total_elevation_gain || 0) : null, fmt: r => r.a ? _dtNum(elevVal(r.a.total_elevation_gain || 0)) : '' },
    { key: 'avg', better: 1, lbl: 'Avg speed', unit: S, val: r => r.a && r.a.average_speed ? +kmh(r.a.average_speed) : null, fmt: r => r.a && r.a.average_speed ? (ride(r.a) ? kmh(r.a.average_speed) : fmtPace(r.a.average_speed)) : '' },
    { key: 'max', better: 1, lbl: 'Max speed', unit: S, val: r => r.a && typeof cleanMax === 'function' && cleanMax(r.a) ? +kmh(cleanMax(r.a)) : null },
    { key: 'hr', better: -1, lbl: 'Avg HR', val: r => r.a && r.a.average_heartrate ? Math.round(r.a.average_heartrate) : null },
    { key: 'hrmax', better: -1, lbl: 'Max HR', val: r => r.a && r.a.max_heartrate ? Math.round(r.a.max_heartrate) : null },
    { key: 'w', better: 1, lbl: 'Avg power', unit: 'W', val: r => r.a && r.a.average_watts ? Math.round(r.a.average_watts) : null },
    { key: 'kj', better: 1, lbl: 'Energy', unit: 'kJ', val: r => r.a && r.a.kilojoules ? Math.round(r.a.kilojoules) : null },
    { key: 'effort', better: 0, lbl: 'Relative effort', val: r => r.a && r.a.suffer_score ? r.a.suffer_score : null },
    { key: 'kudos', better: 1, lbl: 'Kudos', val: r => r.a ? (r.a.kudos_count || 0) : null },
    { key: 'prs', better: 1, lbl: 'PRs', val: r => r.a ? (r.a.pr_count || 0) : null },
  ];
  if (withSleep) cols.push(
    { key: 's_asleep', better: 1, lbl: 'Sleep', val: r => r.s && r.s.asleep ? r.s.asleep : null, fmt: r => r.s && r.s.asleep ? _dtHM(r.s.asleep) : '', sleep: true, first: true },
    { key: 's_deep', better: 1, lbl: 'Deep', val: r => r.s && r.s.asleep ? r.s.deep : null, fmt: r => r.s && r.s.asleep ? _dtHM(r.s.deep) : '', sleep: true },
    { key: 's_light', better: 0, lbl: 'Light', val: r => r.s && r.s.asleep ? r.s.light : null, fmt: r => r.s && r.s.asleep ? _dtHM(r.s.light) : '', sleep: true },
    { key: 's_rem', better: 1, lbl: 'REM', val: r => r.s && r.s.asleep ? r.s.rem : null, fmt: r => r.s && r.s.asleep ? _dtHM(r.s.rem) : '', sleep: true },
    { key: 's_wake', better: -1, lbl: 'Awake (min)', val: r => r.s && r.s.asleep ? r.s.wake : null, sleep: true },
    { key: 's_wakeups', better: -1, lbl: 'Wake-ups', val: r => r.s ? r.s.wakeups : null, sleep: true },
    { key: 's_bed', better: 0, lbl: 'Bedtime', val: r => r.s && r.s.bed != null ? r.s.bed : null, fmt: r => r.s ? _dtClock(r.s.bed) : '', sleep: true },
    { key: 's_up', better: 0, lbl: 'Woke up', val: r => r.s && r.s.up != null ? r.s.up : null, fmt: r => r.s ? _dtClock(r.s.up) : '', sleep: true },
    { key: 's_eff', better: 1, lbl: 'Efficiency (%)', val: r => r.s ? r.s.eff : null, fmt: r => r.s ? _dtNum(r.s.eff, 1) : '', sleep: true },
    { key: 's_rhr', better: -1, lbl: 'Resting HR', val: r => r.s ? r.s.rhr : null, sleep: true },
    { key: 's_hrv', better: 1, lbl: 'HRV (ms)', val: r => r.s ? r.s.hrv : null, sleep: true },
    { key: 's_stress', better: -1, lbl: 'Stress', val: r => r.s ? r.s.stress : null, sleep: true },
    { key: 's_steps', better: 1, lbl: 'Steps', val: r => r.s ? r.s.steps : null, sleep: true },
    { key: 's_spo2', better: 1, lbl: 'SpO₂ (%)', val: r => r.s ? r.s.spo2 : null, fmt: r => r.s ? _dtNum(r.s.spo2, 1) : '', sleep: true },
  );
  return cols;
}

async function renderDataTable() {
  const wrap = document.getElementById('dataTableWrap');
  if (!wrap || typeof acts === 'undefined') return;
  let nights = null;
  if (typeof _slpIsOwner === 'function' && _slpIsOwner()) { try { nights = await _slpLoad(); } catch {} }
  const byDate = {};
  (nights || []).forEach(n => { if (n.date) byDate[n.date] = n; });

  const rows = [], used = new Set();
  (typeof modeActs === 'function' ? modeActs() : acts).forEach(a => {
    const date = (a.start_date_local || a.start_date || '').slice(0, 10);
    const s = byDate[date] || null; if (s) used.add(date);
    rows.push({ date, a, s });
  });
  if (nights) nights.forEach(n => { if (n.date && !used.has(n.date) && n.asleep) rows.push({ date: n.date, a: null, s: n }); });
  _dtRows = rows; _dtCols = _dtColumns(!!nights);
  _dtRender();
}

function _dtRender() {
  const wrap = document.getElementById('dataTableWrap');
  if (!wrap) return;
  const T = typeof tr === 'function' ? tr : (x => x), TF = typeof trf === 'function' ? trf : ((s, ...a) => s.replace(/\{(\d+)\}/g, (_, i) => a[i]));
  const col = _dtCols.find(c => c.key === _dtSort.key) || _dtCols[0];
  const list = _dtRows.filter(r => _dtFilter === 'all' || (_dtFilter === 'ride' ? r.a : !r.a));
  const blank = v => v == null || v === '' || (typeof v === 'number' && isNaN(v));
  list.sort((x, y) => {
    const a = col.val(x), b = col.val(y);
    if (blank(a) && blank(b)) return 0; if (blank(a)) return 1; if (blank(b)) return -1; // blanks last either way
    const c = col.txt ? String(a).localeCompare(String(b)) : (a < b ? -1 : a > b ? 1 : 0);
    return c * _dtSort.dir || (x.date < y.date ? 1 : -1);
  });
  const hasSleep = _dtCols.some(c => c.sleep);
  const counts = { all: _dtRows.length, ride: _dtRows.filter(r => r.a).length, rest: _dtRows.filter(r => !r.a).length };
  document.getElementById('dataTableBar').innerHTML =
    ['all', 'ride'].concat(hasSleep ? ['rest'] : []).map(k => '<button type="button" class="act-reg-tag' + (k === _dtFilter ? ' on' : '') + '" data-f="' + k + '">'
      + T({ all: 'All', ride: 'Activities', rest: 'Rest days' }[k]) + ' <b>' + counts[k] + '</b></button>').join('')
    + (hasSleep ? '' : '<span class="dt-note">' + T('Sleep columns appear for the dashboard owner.') + '</span>')
    + '<span class="dt-legend"><i class="dt-best">' + T('BEST') + '</i><i class="dt-worst">' + T('WORST') + '</i><i class="dt-max">' + T('MAX') + '</i><i class="dt-min">' + T('MIN') + '</i></span>';
  document.querySelectorAll('#dataTableBar [data-f]').forEach(b => b.onclick = () => { _dtFilter = b.dataset.f; _dtRender(); });

  const cell = (c, r) => c.fmt ? c.fmt(r) : (blank(c.val(r)) ? '' : _dtNum(c.val(r)));
  // best / worst (or max / min for neutral columns) within the rows shown;
  // a value shared by more than 2 rows isn't tagged (e.g. many rides with 0 PRs)
  const marks = {};
  _dtCols.filter(c => c.better != null).forEach(c => {
    const vs = list.map(c.val).filter(v => !blank(v));
    if (vs.length < 3) return;
    const hi = Math.max(...vs), lo = Math.min(...vs);
    if (hi === lo) return;
    const few = v => vs.filter(x => x === v).length <= 2;
    marks[c.key] = { hi: few(hi) ? hi : null, lo: few(lo) ? lo : null };
  });
  const tag = (c, r) => {
    const m = marks[c.key]; if (!m) return ['', ''];
    const v = c.val(r); if (blank(v)) return ['', ''];
    const isHi = v === m.hi, isLo = v === m.lo; if (!isHi && !isLo) return ['', ''];
    if (c.better === 0) return [isHi ? 'dt-max' : 'dt-min', isHi ? T('MAX') : T('MIN')];
    const good = (isHi && c.better > 0) || (isLo && c.better < 0);
    return [good ? 'dt-best' : 'dt-worst', good ? T('BEST') : T('WORST')];
  };
  const th = c => '<th class="' + [c.sticky ? 'dt-sticky' : '', c.txt ? 'dt-txt' : '', c.sleep ? 'dt-sleep' : '', c.first ? 'dt-first' : '', c.key === _dtSort.key ? 'dt-on' : ''].join(' ') + '" data-k="' + c.key + '">'
    + T(c.lbl) + (c.unit ? ' (' + c.unit + ')' : '') + (c.key === _dtSort.key ? (_dtSort.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
  wrap.innerHTML = '<table class="dt"><thead><tr>' + _dtCols.map(th).join('') + '</tr></thead><tbody>'
    + list.map(r => '<tr' + (r.a ? ' class="dt-act" data-id="' + r.a.id + '"' : '') + '>' + _dtCols.map(c => { const [cls, lbl] = tag(c, r);
        return '<td class="' + [c.sticky ? 'dt-sticky' : '', c.txt ? 'dt-txt' : '', c.sleep ? 'dt-sleep' : '', c.first ? 'dt-first' : '', cls].join(' ') + '">'
          + (lbl ? '<span class="dt-tag">' + lbl + '</span>' : '') + cell(c, r) + '</td>'; }).join('') + '</tr>').join('')
    + '</tbody></table>';
  document.getElementById('dataTableCount').textContent = TF('{0} rows', list.length);
  wrap.querySelectorAll('th').forEach(h => h.onclick = () => {
    const k = h.dataset.k;
    _dtSort = _dtSort.key === k ? { key: k, dir: -_dtSort.dir } : { key: k, dir: (_dtCols.find(c => c.key === k) || {}).txt ? 1 : -1 };
    _dtRender();
  });
  wrap.querySelectorAll('tr.dt-act').forEach(tr => tr.onclick = () => openActivityModal(tr.dataset.id));
}

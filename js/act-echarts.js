/* ── ACTIVITY TRACK ANALYSIS (ECharts) ───────────────────────────────────────
   Head-unit-style stacked charts on the activity detail: one ECharts instance,
   one panel per metric, x axes linked so the cursor and zoom move together.
   Full-resolution streams (in memory only, never localStorage), Time/Distance
   axis, Separate/Overlay (all metrics on one panel, each on its own hidden
   y-axis — shares the classic view's 'streamMode'), metric checkboxes, stops drawn dashed, and the cursor moves a dot on
   the activity map. Settings → Charts picks this or the classic Chart.js view
   (localStorage 'chart_engine': 'echarts' | 'chartjs'). ECharts is loaded on
   first use, so other pages don't pay for it. ── */
const ECH_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.6.0/echarts.min.js';
const ECH_PAUSE = 10;                         // s: a longer gap between samples = stopped
const _echFull = {};                          // id → parsed streams
let _echChart = null, _echLoad = null, _echDot = null;
let _echX = localStorage.getItem('streamX') === 'dist' ? 'dist' : 'time';
let _echMode = localStorage.getItem('streamMode') === 'overlay' ? 'overlay' : 'sep';
let _echHide = new Set(); try { _echHide = new Set(JSON.parse(localStorage.getItem('streamHide') || '[]')); } catch {}

function chartEngine() { try { return localStorage.getItem('chart_engine') === 'chartjs' ? 'chartjs' : 'echarts'; } catch { return 'echarts'; } }
function setChartEngine(v) { try { localStorage.setItem('chart_engine', v); } catch {} }

function _echLib() {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (!_echLoad) _echLoad = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = ECH_SRC; s.onload = () => ok(window.echarts); s.onerror = () => { _echLoad = null; no(new Error('echarts')); };
    document.head.appendChild(s);
  });
  return _echLoad;
}

async function _echStreams(id) {
  if (_echFull[id]) return _echFull[id];
  let raw;
  try { raw = await api(`/activities/${id}/streams?keys=time,distance,latlng,velocity_smooth,heartrate,cadence,watts,altitude,temp&key_by_type=true`); }
  catch { return null; }
  const g = k => raw && raw[k] && raw[k].data;
  const t = g('time');
  if (!t || t.length < 2) return null;
  let v = g('velocity_smooth');
  if (v && typeof fixSpeedSpikes === 'function') {
    const own = localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID;
    v = fixSpeedSpikes(v, own ? { ceiling: MAX_SPEED_CEILING } : { k: 6 }).data;
  }
  return (_echFull[id] = { t, d: g('distance'), ll: g('latlng'),
    series: { speed: v, hr: g('heartrate'), cadence: g('cadence'), watts: g('watts'), altitude: g('altitude'), temp: g('temp') } });
}

function _echDispose() {
  if (_echChart) { try { _echChart.dispose(); } catch {} _echChart = null; }
  if (_echDot) { try { _echDot.remove(); } catch {} _echDot = null; }
}

async function renderActivityEcharts(a) {
  const wrap = document.getElementById('actStreams');
  if (!wrap) return;
  _echDispose();
  wrap.innerHTML = '<div class="actd-stream-note">' + tr('Loading stream data…') + '</div>';
  let S, lib;
  try { [S, lib] = await Promise.all([_echStreams(a.id), _echLib()]); } catch { S = null; }
  if (document.getElementById('actStreams') !== wrap) return;          // modal changed while loading
  if (!S || !lib) {                                                    // offline / CDN blocked → classic charts
    if (!S) { wrap.innerHTML = ''; return; }
    return _renderActivityStreamsChartjs(a);
  }
  _echDraw(wrap, a, S);
}

function _echDraw(wrap, a, S) {
  _echDispose();
  const ride = isRide(a);
  const all = _STREAM_CFG(ride).filter(c => S.series[c.key] && S.series[c.key].some(x => x != null));
  if (!all.length) { wrap.innerHTML = ''; return; }
  const cfg = all.filter(c => !_echHide.has(c.key));
  const byTime = _echX === 'time' || !S.d;
  const T = S.t, n = T.length;

  // Rows: one per sample, plus one between two samples a stop apart. Panels draw
  // a gap there; a dashed "stopped" line bridges it.
  const xs = [], src = [], gapRow = [];
  for (let i = 0; i < n; i++) {
    const x = byTime ? T[i] : kmVal(S.d[i]);
    if (i && T[i] - T[i - 1] > ECH_PAUSE) { xs.push((xs[xs.length - 1] + x) / 2); src.push(null); gapRow.push(i); }
    xs.push(x); src.push(i);
  }
  const fmtHMS = s => { s = Math.round(s); return Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const xFmt = byTime ? fmtHMS : (v => (+v).toFixed(1) + ' ' + distUnit());

  // Moving-time-weighted average and max, like the head unit (cadence/HR skip zeros).
  const stat = c => {
    const s = S.series[c.key]; let num = 0, den = 0, mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = s[i]; if (v == null) continue;
      const w = i + 1 < n ? Math.min(T[i + 1] - T[i], ECH_PAUSE) : 0;
      if (!((c.key === 'cadence' || c.key === 'hr') && !v)) { num += v * w; den += w; }
      if (v > mx) mx = v;
    }
    return { avg: den ? c.conv(num / den) : null, max: mx > -Infinity ? c.conv(mx) : null };
  };

  const css = getComputedStyle(document.documentElement);
  const cv = (k, d) => (css.getPropertyValue(k) || '').trim() || d;
  const TXT = cv('--text', '#eee'), TXT2 = cv('--text-2', '#999'), MUTED = cv('--text-3', '#555'), GRID = cv('--border', '#252525');

  const H = 92, HEAD = 34, GAP = 14, TOP = 6, SLIDER = 44, OVH = 320;
  const ov = _echMode === 'overlay';
  const grids = [], xAxis = [], yAxis = [], series = [], titles = [], ovStats = [];
  cfg.forEach((c, k) => {
    const top = ov ? TOP + 8 : TOP + k * (H + HEAD + GAP) + HEAD;
    const gi = ov ? 0 : k;
    const s = S.series[c.key], st = stat(c);
    const main = src.map(i => i == null || s[i] == null ? null : +c.conv(s[i]).toFixed(c.dp + 1));
    const dash = new Array(xs.length).fill(null);
    gapRow.forEach(i => {
      const r = src.indexOf(i), a0 = s[i - 1], b0 = s[i];
      if (a0 == null || b0 == null) return;
      dash[r - 2] = main[r - 2]; dash[r] = main[r];
      dash[r - 1] = +((c.conv(a0) + c.conv(b0)) / 2).toFixed(c.dp + 1);
    });
    if (!ov || !k) grids.push(ov ? { left: 14, right: 14, top, height: OVH } : { left: 46, right: 14, top, height: H });
    if (!ov || !k) xAxis.push({ gridIndex: gi, type: 'value', min: xs[0], max: xs[xs.length - 1], axisLine: { lineStyle: { color: GRID } },
      axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: MUTED, fontSize: 10, hideOverlap: true, showMaxLabel: false, formatter: v => byTime ? fmtHMS(v) : (+v).toFixed(0) },
      axisPointer: { label: { show: false } } });
    yAxis.push(ov ? { gridIndex: 0, type: 'value', scale: true, show: false } : { gridIndex: k, type: 'value', scale: c.key === 'altitude' || c.key === 'temp' || c.key === 'hr', splitNumber: 3,
      axisLabel: { color: MUTED, fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: GRID } } });
    const area = new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: c.color + '66' }, { offset: 1, color: c.color + '05' }]);
    series.push({ name: c.label, type: 'line', xAxisIndex: gi, yAxisIndex: k, data: xs.map((x, r) => [x, main[r]]),
      symbol: 'none', connectNulls: false, lineStyle: { width: 1.2, color: c.color }, itemStyle: { color: c.color },
      areaStyle: ov ? undefined : { color: area, origin: 'start' }, emphasis: { disabled: true }, _c: c });
    if (gapRow.length) series.push({ name: c.label + ' ·', type: 'line', xAxisIndex: gi, yAxisIndex: k, data: xs.map((x, r) => [x, dash[r]]),
      symbol: 'none', connectNulls: false, lineStyle: { width: 1, color: c.color, type: 'dashed', opacity: .7 }, areaStyle: ov ? undefined : { color: c.color + '14', origin: 'start' }, emphasis: { disabled: true }, silent: true, tooltip: { show: false } });
    const f = v => v == null ? '–' : v.toFixed(c.dp);
    if (ov) { ovStats.push(`<span><b style="color:${c.color}">${tr(c.label)}</b> <b>${f(st.avg)}</b> / ${f(st.max)} ${c.unit}</span>`); return; }
    titles.push({ left: 6, top: top - HEAD + 8, text: '{n|' + tr(c.label) + '} {u|(' + c.unit + ')}   {l|' + tr('Average') + '} {v|' + f(st.avg) + '}   {l|' + tr('Max') + '} {v|' + f(st.max) + '}',
      textStyle: { rich: { n: { color: c.color, fontSize: 13, fontWeight: 700 }, u: { color: MUTED, fontSize: 11 }, l: { color: TXT2, fontSize: 11 }, v: { color: TXT, fontSize: 12, fontWeight: 700 } } } });
  });
  const height = ov ? TOP + 8 + OVH + 24 + SLIDER : TOP + cfg.length * (H + HEAD + GAP) + SLIDER;

  const seg = (on, a, b) => `<button type="button" class="${on ? 'on' : ''}" onclick="${a}">${b}</button>`;
  const head = `<div class="actd-stream-title">${tr('Track analysis')}`
    + `<div class="actd-stream-modes">${seg(!ov, "echSetMode('sep')", tr('Separate'))}${seg(ov, "echSetMode('overlay')", tr('Overlay'))}</div>`
    + (S.d ? `<div class="actd-stream-modes" style="margin-left:0">${seg(byTime, "echSetX('time')", tr('Time'))}${seg(!byTime, "echSetX('dist')", tr('Distance'))}</div>` : '') + '</div>'
    + `<div class="actd-stream-checks">${all.map(c => `<label><input type="checkbox" ${_echHide.has(c.key) ? '' : 'checked'} onchange="echToggle('${c.key}',this.checked)" style="accent-color:${c.color}">${tr(c.label)}</label>`).join('')}</div>`;
  wrap.innerHTML = head + (ov && cfg.length ? `<div class="actd-stream-checks">${tr('Average')} / ${tr('Max')}: ${ovStats.join('')}</div>` : '') + (cfg.length ? `<div class="ech-box" style="height:${height}px"></div>` : '');
  wrap._echA = a; wrap._echS = S;
  if (!cfg.length) return;

  const chart = echarts.init(wrap.querySelector('.ech-box'), null, { renderer: 'canvas' });
  _echChart = chart;
  const idx = ov ? [0] : cfg.map((_, k) => k);
  chart.setOption({
    animation: false, title: titles, grid: grids, xAxis, yAxis, series,
    axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { type: 'dashed', color: TXT2, width: 1 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line', animation: false }, backgroundColor: '#1a1a1a', borderColor: '#2a2a2a',
      textStyle: { color: TXT, fontSize: 12 }, confine: true,
      formatter: ps => {
        const p = ps.find(q => q.seriesIndex != null && series[q.seriesIndex]._c);
        if (!p) return '';
        const i = src[p.dataIndex];
        if (i == null) return xFmt(p.value[0]) + '<br>' + tr('Stopped');
        let h = '<b>' + xFmt(p.value[0]) + '</b>';
        cfg.forEach(c => { const v = S.series[c.key][i]; if (v != null) h += `<br><span style="color:${c.color}">●</span> ${tr(c.label)}: <b>${c.conv(v).toFixed(c.dp)}</b> ${c.unit}`; });
        return h;
      } },
    dataZoom: [{ type: 'inside', xAxisIndex: idx, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
      { type: 'slider', xAxisIndex: idx, bottom: 8, height: 22, borderColor: GRID, fillerColor: 'rgba(252,76,2,.15)',
        handleStyle: { color: '#fc4c02' }, textStyle: { color: MUTED }, labelFormatter: v => xFmt(v), dataBackground: { lineStyle: { color: MUTED }, areaStyle: { color: GRID } } }],
  });

  // Cursor → dot on the activity map.
  chart.on('updateAxisPointer', ev => {
    const m = typeof _actBigMap !== 'undefined' ? _actBigMap : null;
    const ax = ev.axesInfo && ev.axesInfo[0];
    if (!m || !S.ll || !ax) { if (_echDot) { _echDot.remove(); _echDot = null; } return; }
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; xs[mid] < ax.value ? lo = mid + 1 : hi = mid; }
    const i = src[lo] != null ? src[lo] : src[lo + 1];
    const ll = i != null && S.ll[i];
    if (!ll) return;
    if (!_echDot) _echDot = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#fc4c02', fillOpacity: 1 }).addTo(m);
    else _echDot.setLatLng(ll);
  });
  chart.getZr().on('globalout', () => { if (_echDot) { _echDot.remove(); _echDot = null; } });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (_echChart === chart) chart.resize(); }).observe(wrap);
}

function _echRedraw() {
  const wrap = document.getElementById('actStreams');
  if (wrap && wrap._echS) _echDraw(wrap, wrap._echA, wrap._echS);
}
function echSetMode(m) { _echMode = m; try { localStorage.setItem('streamMode', m); } catch {} _echRedraw(); }
function echSetX(m) { _echX = m; try { localStorage.setItem('streamX', m); } catch {} _echRedraw(); }
function echToggle(k, on) {
  on ? _echHide.delete(k) : _echHide.add(k);
  try { localStorage.setItem('streamHide', JSON.stringify([..._echHide])); } catch {}
  _echRedraw();
}

// Settings → Charts
(function () {
  const sel = document.getElementById('chartEngine');
  if (!sel) return;
  sel.value = chartEngine();
  sel.onchange = () => setChartEngine(sel.value);
})();

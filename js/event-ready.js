/* ── EVENT READINESS ──────────────────────────────────────────────────────────
   "Could I ride 200 km? An audax BRM 300? Bentang Jawa?" — pick a target event
   and get a readiness score from your own ride history, list data only:
     · longest ride in the last 12 weeks vs what the distance needs
     · average weekly volume over the last 8 weeks
     · fitness (CTL from the Training Load model)
     · best 3-day block (multi-day events only)
   plus a finish-time estimate vs the cutoff (your long-ride pace, slowed for
   distance, plus your usual stop ratio and sleep for multi-day events), and how
   many weeks of building the gaps need. Rules of thumb, not lab science. */

const _EVT_PRESETS = [
  { id: 'r100',  name: '100 km',        km: 100,  elev: 1000,  limit: 0 },
  { id: 'r200',  name: '200 km',        km: 200,  elev: 2000,  limit: 0 },
  { id: 'brm200', name: 'BRM 200',      km: 200,  elev: 2000,  limit: 13.5, audax: 1 },
  { id: 'brm300', name: 'BRM 300',      km: 300,  elev: 3000,  limit: 20,   audax: 1 },
  { id: 'brm400', name: 'BRM 400',      km: 400,  elev: 4000,  limit: 27,   audax: 1 },
  { id: 'brm600', name: 'BRM 600',      km: 600,  elev: 6000,  limit: 40,   audax: 1 },
  { id: 'bjawa', name: 'Bentang Jawa',  km: 1500, elev: 16000, limit: 156,  ultra: 1 },
  { id: 'custom', name: 'Custom',       km: 150,  elev: 1500,  limit: 0 },
];

const _evtL = (en, id) => window.LANG === 'id' ? id : en;

function _evtLoad() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('evt_target') || 'null'); } catch {}
  const p = _EVT_PRESETS.find(x => x.id === (s && s.id)) || _EVT_PRESETS[2];
  return Object.assign({ id: p.id, km: p.km, elev: p.elev, limit: p.limit, date: '' }, s || {});
}
function _evtSave(s) { try { localStorage.setItem('evt_target', JSON.stringify(s)); } catch {} }

// Piecewise-linear lookup on [[x, y], …] (sorted by x), clamped at the ends.
function _evtInterp(tbl, x) {
  if (x <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) {
    const [x1, y1] = tbl[i], [x0, y0] = tbl[i - 1];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return tbl[tbl.length - 1][1];
}

// What the event asks for, by distance (km).
function _evtNeeds(km) {
  return {
    longest: km <= 300 ? 0.7 * km : Math.min(400, 0.75 * km),
    weekly: Math.min(400, 40 + 0.55 * km),
    ctl: _evtInterp([[100, 35], [200, 50], [300, 60], [400, 65], [600, 75], [1500, 85]], km),
    block3: km >= 600 ? Math.min(500, 0.5 * km) : 0,
  };
}

// What your history shows. Real outdoor rides only (no e-bike).
function _evtHistory() {
  const today = _trToday();
  const from84 = _trAddDays(today, -84), from56 = _trAddDays(today, -56), from182 = _trAddDays(today, -182);
  const rides = acts.filter(a => isRide(a) && a.type !== 'EBikeRide' && a.distance > 0 && a.moving_time > 0);
  let longest = null, km56 = 0;
  const byDay = new Map();
  for (const a of rides) {
    const k = _trDayKey(a);
    if (k >= from84) {
      if (!longest || a.distance > longest.distance) longest = a;
      byDay.set(k, (byDay.get(k) || 0) + a.distance / 1000);
    }
    if (k >= from56) km56 += a.distance / 1000;
  }
  let block3 = 0;
  for (let k = from84; k <= today; k = _trAddDays(k, 1)) {
    const s = (byDay.get(k) || 0) + (byDay.get(_trAddDays(k, 1)) || 0) + (byDay.get(_trAddDays(k, 2)) || 0);
    if (s > block3) block3 = s;
  }
  // pace reference: the 5 longest rides of the last 6 months (≥ 40 km)
  let ref = rides.filter(a => _trDayKey(a) >= from182 && a.distance >= 40000);
  if (ref.length < 3) ref = rides.filter(a => a.distance >= 30000);
  ref = ref.sort((a, b) => b.distance - a.distance).slice(0, 5);
  const med = arr => { const s = [...arr].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
  // flat-equivalent speed: every 100 m of climbing costs about 2 km of flat
  const vEq = med(ref.map(a => (a.distance / 1000 + 0.02 * (a.total_elevation_gain || 0)) / (a.moving_time / 3600)));
  const dRef = med(ref.map(a => a.distance / 1000));
  const stop = med(ref.map(a => (a.elapsed_time || a.moving_time) / a.moving_time));
  return { longest, longestKm: longest ? longest.distance / 1000 : 0, weekly: km56 / 8, block3, vEq, dRef, stop, nRef: ref.length };
}

// Finish-time estimate in hours: { moving, sleep, total } or null.
function _evtFinish(s, h) {
  if (!h.vEq) return null;
  const fatigue = Math.max(0.75, Math.pow(h.dRef / s.km, 0.07));   // longer = slower
  const v = h.vEq * Math.min(1, fatigue);
  const moving = (s.km + 0.02 * s.elev) / v;
  // stops grow with distance: at least 12%, brevets ~20–25%, self-supported ultras ~35%
  const stopR = Math.min(1.5, Math.max(h.stop || 1, s.km >= 1000 ? 1.35 : s.km >= 600 ? 1.25 : s.km >= 300 ? 1.2 : 1.12));
  const awake = moving * stopR;
  const nights = Math.max(0, Math.ceil(awake / 20) - 1);
  const sleep = nights * (s.km >= 1000 ? 5 : 2.5);
  return { moving, total: awake + sleep, sleep, nights, v, stopR };
}

function _evtHrs(h) {
  if (h >= 48) { const d = Math.floor(h / 24); return `${d}${_evtL('d', 'h')} ${Math.round(h - d * 24)}${_evtL('h', 'j')}`; }
  const H = Math.floor(h), M = Math.round((h - H) * 60);
  return M === 60 ? `${H + 1}${_evtL('h', 'j')}` : `${H}${_evtL('h', 'j')} ${String(M).padStart(2, '0')}m`;
}

function _trEventReadyHTML(d) {
  if (typeof acts === 'undefined' || !acts.some(isRide)) return '';
  const s = _evtLoad();
  const preset = _EVT_PRESETS.find(p => p.id === s.id) || _EVT_PRESETS[0];
  const need = _evtNeeds(s.km);
  const h = _evtHistory();
  const ctl = d ? d.ctl : 0;

  const factors = [
    { lbl: _evtL('Longest ride · 12 wk', 'Gowes terjauh · 12 mgg'), have: h.longestKm, need: need.longest, unit: 'km', w: 35 },
    { lbl: _evtL('Weekly volume · 8 wk avg', 'Volume mingguan · rata² 8 mgg'), have: h.weekly, need: need.weekly, unit: 'km/' + _evtL('wk', 'mgg'), w: 25 },
    { lbl: _evtL('Fitness (CTL)', 'Kebugaran (CTL)'), have: ctl, need: need.ctl, unit: '', w: 25 },
  ];
  if (need.block3) factors.push({ lbl: _evtL('Best 3-day block · 12 wk', 'Blok 3 hari terbaik · 12 mgg'), have: h.block3, need: need.block3, unit: 'km', w: 15 });
  const wSum = factors.reduce((t, f) => t + f.w, 0);
  let score = factors.reduce((t, f) => t + f.w * Math.min(1, f.need ? f.have / f.need : 1), 0) / wSum * 100;

  const fin = _evtFinish(s, h);
  const overCut = s.limit > 0 && fin && fin.total > s.limit;
  if (overCut) score = Math.min(score, 60);
  score = Math.round(score);

  const verdict = score >= 90 ? [_evtL('Ready', 'Siap'), '#22c55e']
    : score >= 70 ? [_evtL('Almost there', 'Hampir siap'), '#eab308']
    : score >= 45 ? [_evtL('Needs building', 'Perlu dibangun'), '#fb923c']
    : [_evtL('Not yet', 'Belum siap'), '#ef4444'];

  // weeks to close each gap: long ride +12%/wk, volume +10%/wk, CTL +5/wk
  const grow = (have, needV, r) => have >= needV ? 0 : Math.ceil(Math.log(needV / Math.max(have, needV * 0.25)) / Math.log(1 + r));
  const weeks = Math.max(
    grow(h.longestKm, need.longest, 0.12),
    grow(h.weekly, need.weekly, 0.10),
    ctl >= need.ctl ? 0 : Math.ceil((need.ctl - ctl) / 5),
    need.block3 ? grow(h.block3, need.block3, 0.12) : 0);

  let weeksLeft = null;
  if (s.date) weeksLeft = Math.floor((new Date(s.date + 'T00:00:00Z') - new Date(_trToday() + 'T00:00:00Z')) / (7 * 864e5));

  const bar = f => {
    const pct = Math.min(100, f.need ? f.have / f.need * 100 : 100);
    const c = pct >= 100 ? '#22c55e' : pct >= 70 ? '#eab308' : '#fb923c';
    return `<div class="evt-f">
      <div class="evt-f-top"><span>${f.lbl}</span><span><b style="color:${c}">${Math.round(f.have)}</b> / ${Math.round(f.need)} ${f.unit}</span></div>
      <div class="pc-track"><span style="width:${pct}%;background:${c}"></span></div>
    </div>`;
  };

  // finish-time block
  let finHTML = '';
  if (fin) {
    const lim = s.limit > 0 ? s.limit : 0;
    const margin = lim ? lim - fin.total : 0;
    const needV = lim ? (s.km + 0.02 * s.elev) / Math.max(0.1, (lim - fin.sleep) / fin.stopR) : 0;
    const cell = (v, l, c) => `<div class="evt-t"><b style="color:${c || 'var(--text)'}">${v}</b><small>${l}</small></div>`;
    finHTML = `<div class="evt-times">
      ${cell(_evtHrs(fin.moving), _evtL('moving time', 'waktu bergerak'))}
      ${cell(_evtHrs(fin.total), fin.nights ? _evtL(`total incl. stops + ${fin.nights} sleep${fin.nights > 1 ? 's' : ''}`, `total + berhenti + ${fin.nights}× tidur`) : _evtL('total incl. stops', 'total + berhenti'), overCut ? '#ef4444' : 'var(--orange)')}
      ${lim ? cell(_evtHrs(lim), _evtL('cutoff', 'batas waktu')) : ''}
      ${lim ? cell((margin >= 0 ? '+' : '−') + _evtHrs(Math.abs(margin)), _evtL('margin', 'sisa waktu'), margin >= 0 ? '#22c55e' : '#ef4444') : ''}
    </div>
    <div class="tr-basis-note">${_evtL(
      `Estimated from your ${h.nRef} longest recent rides (~${fin.v.toFixed(1)} km/h flat-equivalent at this distance, stops ×${fin.stopR.toFixed(2)}).${lim ? ` To make the cutoff you need ~${needV.toFixed(1)} km/h flat-equivalent moving.` : ''}`,
      `Diestimasi dari ${h.nRef} gowes terjauh Anda baru-baru ini (~${fin.v.toFixed(1)} km/j setara-datar di jarak ini, berhenti ×${fin.stopR.toFixed(2)}).${lim ? ` Agar masuk batas waktu, perlu ~${needV.toFixed(1)} km/j setara-datar saat bergerak.` : ''}`)}</div>`;
  }

  // plan
  const tips = [];
  const r10 = x => Math.round(x / 10) * 10;
  if (h.longestKm < need.longest) {
    const next = Math.min(r10(need.longest), Math.max(r10(h.longestKm * 1.12), r10(h.longestKm) + 10));
    tips.push(_evtL(`Next long ride: <b>${next} km</b>, then add ~10–15% every 1–2 weeks up to ${r10(need.longest)} km.`,
      `Gowes jauh berikutnya: <b>${next} km</b>, lalu tambah ~10–15% tiap 1–2 minggu sampai ${r10(need.longest)} km.`));
  } else tips.push(_evtL(`Your long ride (${Math.round(h.longestKm)} km) already covers it — keep one long ride every 1–2 weeks.`,
    `Gowes terjauh Anda (${Math.round(h.longestKm)} km) sudah cukup — pertahankan satu gowes jauh tiap 1–2 minggu.`));
  if (h.weekly < need.weekly) tips.push(_evtL(`Build weekly volume from ${Math.round(h.weekly)} toward <b>${r10(need.weekly)} km/wk</b> (≤10% more per week, an easy week every 4th).`,
    `Naikkan volume mingguan dari ${Math.round(h.weekly)} ke <b>${r10(need.weekly)} km/mgg</b> (maks +10% per minggu, minggu ringan tiap minggu ke-4).`));
  if (ctl < need.ctl) tips.push(_evtL(`Raise fitness (CTL) from ${Math.round(ctl)} toward <b>${Math.round(need.ctl)}</b> — about +5 per week, mostly from more steady endurance hours rather than harder rides.`,
    `Naikkan kebugaran (CTL) dari ${Math.round(ctl)} ke <b>${Math.round(need.ctl)}</b> — sekitar +5 per minggu, terutama dari menambah jam gowes santai (endurance), bukan gowes lebih keras.`));
  if (need.block3 && h.block3 < need.block3) tips.push(_evtL(`Practise back-to-back days: a 3-day block of <b>${r10(need.block3)} km</b> teaches your body (and butt) to ride on tired legs.`,
    `Latih hari berturut-turut: blok 3 hari total <b>${r10(need.block3)} km</b> melatih tubuh (dan pantat) gowes dengan kaki lelah.`));
  if (preset.audax || s.km >= 300) tips.push(_evtL('Ride at least one long training ride into the night — lights, reflective vest, and staying awake are part of the event.',
    'Lakukan minimal satu latihan jauh sampai malam — lampu, rompi reflektif, dan menahan kantuk adalah bagian dari event.'));
  if (preset.ultra || s.km >= 1000) tips.push(_evtL('Self-supported ultra: test your full bikepacking setup, plan sleep stops (~4–5 h/night), resupply points and route navigation before race day.',
    'Ultra self-supported: uji setup bikepacking lengkap, rencanakan titik tidur (~4–5 jam/malam), titik resupply, dan navigasi rute sebelum hari H.'));
  tips.push(_evtL('Fuel 60–90 g carbs and ~500–750 ml fluid per hour on anything over 4 hours, and practise it in training.',
    'Makan 60–90 g karbo dan minum ~500–750 ml per jam untuk gowes di atas 4 jam, dan latih ini saat latihan.'));

  let timeline;
  if (weeks === 0) timeline = _evtL('Your numbers already meet the target.', 'Angka Anda sudah memenuhi target.');
  else timeline = _evtL(`About <b>${weeks} week${weeks > 1 ? 's' : ''}</b> of steady building to close the gaps.`, `Sekitar <b>${weeks} minggu</b> latihan bertahap untuk menutup kekurangan.`);
  if (weeksLeft !== null) {
    if (weeksLeft < 0) timeline += ' ' + _evtL('(The event date has passed.)', '(Tanggal event sudah lewat.)');
    else {
      const ok = weeks + 1 <= weeksLeft;   // +1 week taper
      timeline += ' ' + _evtL(`You have <b style="color:${ok ? '#22c55e' : '#ef4444'}">${weeksLeft} week${weeksLeft !== 1 ? 's' : ''}</b> until the event${ok ? ' — enough, with a taper week before.' : ' — tight; consider a shorter target first.'}`,
        `Sisa <b style="color:${ok ? '#22c55e' : '#ef4444'}">${weeksLeft} minggu</b> menuju event${ok ? ' — cukup, termasuk seminggu tapering.' : ' — mepet; pertimbangkan target lebih pendek dulu.'}`);
    }
  }

  const chips = _EVT_PRESETS.map(p => `<button class="evt-chip${p.id === s.id ? ' on' : ''}" onclick="evtPick('${p.id}')">${p.id === 'custom' ? _evtL('Custom', 'Kustom') : p.name}</button>`).join('');
  const inp = (k, v, lbl, step) => `<label class="evt-in"><span>${lbl}</span><input type="number" min="0" step="${step}" value="${v || ''}" placeholder="—" onchange="evtSet('${k}',this.value)"></label>`;

  return `<div class="card tr-pc" id="evtCard">
    <div class="tr-chart-title">${_evtL('Event Readiness', 'Kesiapan Event')} <span class="gm-hint">${_evtL('how ready are you for a target ride?', 'seberapa siap untuk target gowes?')}</span></div>
    <div class="evt-chips">${chips}</div>
    <div class="evt-ins">
      ${inp('km', s.km, _evtL('Distance (km)', 'Jarak (km)'), 10)}
      ${inp('elev', s.elev, _evtL('Elevation (m)', 'Elevasi (m)'), 100)}
      ${inp('limit', s.limit, _evtL('Cutoff (h)', 'Batas waktu (jam)'), 0.5)}
      <label class="evt-in"><span>${_evtL('Event date', 'Tanggal event')}</span><input type="date" value="${s.date || ''}" onchange="evtSet('date',this.value)"></label>
    </div>
    <div class="evt-head">
      <div class="evt-score" style="--c:${verdict[1]}"><b>${score}</b><small>%</small></div>
      <div><div class="evt-verdict" style="color:${verdict[1]}">${verdict[0]}</div><div class="evt-tl">${timeline}</div></div>
    </div>
    ${factors.map(bar).join('')}
    ${overCut ? `<div class="evt-warn">${_evtL('⚠ At your current long-ride pace the estimate is over the cutoff — speed on long rides is the limiter, not just distance.', '⚠ Dengan pace gowes jauh Anda sekarang, estimasi melewati batas waktu — kecepatan di gowes jauh jadi pembatas, bukan hanya jarak.')}</div>` : ''}
    ${finHTML}
    <div class="tr-chart-title" style="margin-top:14px">${_evtL('Plan', 'Rencana')}</div>
    <ul class="evt-tips">${tips.map(t => `<li>${t}</li>`).join('')}</ul>
    <div class="tr-basis-note">${_evtL('Rules of thumb from audax/ultra training practice applied to your Strava history — a guide, not a guarantee. Elevation defaults assume hilly (Bali-like) routes; edit them for the real course.',
      'Patokan umum latihan audax/ultra yang diterapkan ke riwayat Strava Anda — panduan, bukan jaminan. Elevasi default mengasumsikan rute berbukit (seperti Bali); sesuaikan dengan rute aslinya.')}</div>
  </div>`;
}

function _evtRerender() {
  const el = document.getElementById('evtCard');
  if (!el) return;
  el.outerHTML = _trEventReadyHTML(typeof _trBuildSeries === 'function' ? _trBuildSeries() : null);
}

function evtPick(id) {
  const p = _EVT_PRESETS.find(x => x.id === id);
  if (!p) return;
  const cur = _evtLoad();
  _evtSave(id === 'custom' ? Object.assign(cur, { id }) : { id, km: p.km, elev: p.elev, limit: p.limit, date: cur.date || '' });
  _evtRerender();
}

function evtSet(k, v) {
  const s = _evtLoad();
  s[k] = k === 'date' ? v : Math.max(0, parseFloat(v) || 0);
  if (k === 'km' && !(s.km > 0)) s.km = 1;
  if (k !== 'date') s.id = 'custom';
  _evtSave(s);
  _evtRerender();
}

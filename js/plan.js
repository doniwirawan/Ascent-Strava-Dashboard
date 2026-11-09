/* ── PLAN ──────────────────────────────────────────────────────────────────────
   The planning half of TrainingPeaks, on top of the Training load model
   (training.js: _trBuildSeries, CTL 42 d / ATL 7 d):
     · Season plan (ATP) — pick an event; the weeks to race day are split into
       Base / Build / Peak / Taper / Race with a weekly TSS target that raises
       CTL by the chosen ramp (every 4th week is a recovery week). The plan is
       saved when made, so past weeks keep their target to compare against.
     · Calendar — planned workouts on any day; once a day is done, planned vs
       done TSS gives a TrainingPeaks-style green / yellow / orange / red mark.
     · Workout builder — one step per line ("10m 50-75%", "3x(4m 115%, 4m 50%)")
       with a live profile, TSS / IF / NP, and export to .fit (head units),
       .zwo (Zwift and most trainer apps) and .mrc (ERG, % of FTP).
     · Forecast — the PMC carried forward through the planned workouts (or the
       season target for weeks with nothing planned) to race day.
   Kept in localStorage; the owner's copy also syncs to Supabase through
   /api/ai-chats (plan-get / plan-save) so it follows across devices. */

const PL_KEY = 'plan_v1';
let _pl = null;
function plLoad() {
  if (_pl) return _pl;
  try { _pl = JSON.parse(localStorage.getItem(PL_KEY) || 'null'); } catch {}
  if (!_pl || typeof _pl !== 'object') _pl = {};
  if (!Array.isArray(_pl.workouts)) _pl.workouts = [];
  _pl.ts = +_pl.ts || 0;
  return _pl;
}
function plSave() {
  const p = plLoad();
  p.ts = Date.now();
  try { localStorage.setItem(PL_KEY, JSON.stringify(p)); } catch {}
  _plPush();
}
const _plEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Workout text format ─────────────────────────────────────────────────────── */
// "1h30m" / "90m" / "45s" / "4m30s" / "1:30" (m:ss) → seconds (0 = not a duration)
function plDur(s) {
  s = String(s || '').trim().toLowerCase();
  let m = s.match(/^(\d+):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?:in)?)?(?:(\d+)s(?:ec)?)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return Math.round((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0));
}
// one step: "20m 90%" or "10m 50-75%" (a ramp) → {d, p, p2} as fractions of FTP
function _plStep(t) {
  const m = String(t).trim().match(/^(\S+)\s*@?\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*%?$/);
  if (!m) return null;
  const d = plDur(m[1]);
  const p = +m[2] / 100, p2 = m[3] != null ? +m[3] / 100 : p;
  if (!d || !(p > 0 && p <= 3 && p2 > 0 && p2 <= 3)) return null;
  return { d, p, p2 };
}
// workout text → { blocks: [{n, steps:[{d,p,p2}]}], errors: [line numbers] }
function plParse(text) {
  const blocks = [], errors = [];
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const m = line.match(/^(\d+)\s*[x×]\s*\((.+)\)$/i);
    if (m) {
      const steps = m[2].split(',').map(_plStep);
      if (+m[1] >= 1 && +m[1] <= 50 && steps.every(Boolean)) blocks.push({ n: +m[1], steps });
      else errors.push(i + 1);
      return;
    }
    const steps = line.split(',').map(_plStep);
    if (steps.every(Boolean)) steps.forEach(s => blocks.push({ n: 1, steps: [s] }));
    else errors.push(i + 1);
  });
  return { blocks, errors };
}
function plFlat(blocks) {
  const out = [];
  (blocks || []).forEach(b => { for (let r = 0; r < b.n; r++) b.steps.forEach(s => out.push(s)); });
  return out;
}
// duration, normalized intensity (IF), average intensity and TSS of a workout
function plMetrics(blocks) {
  const flat = plFlat(blocks);
  const secs = flat.reduce((s, x) => s + x.d, 0);
  if (!secs) return { secs: 0, if: 0, avg: 0, tss: 0 };
  const P = new Float64Array(secs);
  let t = 0;
  for (const s of flat) for (let i = 0; i < s.d; i++) P[t++] = s.p + (s.p2 - s.p) * (s.d > 1 ? i / (s.d - 1) : 0);
  // NP: 30 s rolling mean → 4th-power mean → 4th root
  let roll = 0, acc4 = 0, n = 0, tot = 0;
  for (let i = 0; i < secs; i++) {
    tot += P[i]; roll += P[i];
    if (i >= 30) roll -= P[i - 30];
    if (i >= 29) { acc4 += (roll / 30) ** 4; n++; }
  }
  const IF = n ? Math.pow(acc4 / n, 0.25) : tot / secs;
  return { secs, if: IF, avg: tot / secs, tss: secs / 3600 * IF * IF * 100 };
}
// a planned workout's numbers: from its steps, else the manual duration / TSS
function plWkMetrics(w) {
  const { blocks } = plParse(w && w.text);
  if (blocks.length) return { ...plMetrics(blocks), blocks };
  const secs = Math.max(0, +w.secs || 0), tss = Math.max(0, +w.tss || 0);
  return { secs, tss, if: secs && tss ? Math.sqrt(tss / (secs / 36)) : 0, avg: 0, blocks: [] };
}

function plZoneColor(p) {
  if (typeof POWER_ZONES !== 'undefined') { for (const z of POWER_ZONES) if (p < z.hi) return z.color; }
  return '#94a3b8';
}
function plProfileSVG(blocks, h) {
  h = h || 64;
  const flat = plFlat(blocks), secs = flat.reduce((s, x) => s + x.d, 0);
  if (!secs) return '';
  const W = 1000, top = Math.max(1.2, ...flat.map(s => Math.max(s.p, s.p2))) * 1.05;
  let x = 0;
  const polys = flat.map(s => {
    const w = s.d / secs * W, y1 = h - s.p / top * h, y2 = h - s.p2 / top * h;
    const pts = `${x.toFixed(1)},${h} ${x.toFixed(1)},${y1.toFixed(1)} ${(x + w).toFixed(1)},${y2.toFixed(1)} ${(x + w).toFixed(1)},${h}`;
    x += w;
    return `<polygon points="${pts}" fill="${plZoneColor((s.p + s.p2) / 2)}"/>`;
  }).join('');
  const fy = (h - 1 / top * h).toFixed(1);
  return `<svg class="pl-prof" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true">${polys}<line x1="0" x2="${W}" y1="${fy}" y2="${fy}" stroke="currentColor" stroke-opacity=".4" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/></svg>`;
}

const PL_LIB = [
  { id: 'rec',   name: 'Recovery spin',     text: '45m 50%' },
  { id: 'end',   name: 'Endurance',         text: '10m 50-65%\n70m 68%\n10m 60-50%' },
  { id: 'long',  name: 'Long endurance',    text: '15m 50-65%\n150m 68%\n15m 55%' },
  { id: 'tempo', name: 'Tempo 2×20',        text: '15m 50-75%\n2x(20m 82%, 5m 55%)\n10m 50%' },
  { id: 'ss',    name: 'Sweet spot 3×15',   text: '15m 50-75%\n3x(15m 90%, 5m 55%)\n10m 50%' },
  { id: 'thr',   name: 'Threshold 2×20',    text: '15m 50-75%\n2x(20m 98%, 5m 55%)\n10m 50%' },
  { id: 'ou',    name: 'Over-unders 3×9',   text: '15m 50-75%\n3x(2m 95%, 1m 105%, 2m 95%, 1m 105%, 2m 95%, 1m 105%, 5m 55%)\n10m 50%' },
  { id: 'vo2',   name: 'VO₂max 5×4',        text: '15m 50-75%\n5x(4m 115%, 4m 50%)\n10m 50%' },
  { id: 'ana',   name: 'Anaerobic 8×30s',   text: '15m 50-75%\n8x(30s 150%, 4m30s 50%)\n10m 50%' },
  { id: 'open',  name: 'Race openers',      text: '15m 50-70%\n3x(1m 110%, 3m 55%)\n10m 50%' },
  { id: 'ftp',   name: 'FTP test (20 min)', text: '20m 50-75%\n3x(1m 110%, 1m 50%)\n10m 55%\n20m 100%\n15m 50%' },
];
const _plLib = id => PL_LIB.find(x => x.id === id);

/* ── Exports ─────────────────────────────────────────────────────────────────── */
function plZwo(title, blocks) {
  const x = s => _plEsc(s);
  const out = [], last = blocks.length - 1;
  blocks.forEach((b, bi) => {
    const steady = b.steps.every(s => s.p === s.p2);
    if (b.n > 1 && b.steps.length === 2 && steady) {
      out.push(`    <IntervalsT Repeat="${b.n}" OnDuration="${b.steps[0].d}" OffDuration="${b.steps[1].d}" OnPower="${b.steps[0].p}" OffPower="${b.steps[1].p}"/>`);
      return;
    }
    for (let r = 0; r < b.n; r++) b.steps.forEach(s => {
      if (s.p === s.p2) out.push(`    <SteadyState Duration="${s.d}" Power="${s.p}"/>`);
      else {
        const tag = bi === 0 && s.p2 > s.p ? 'Warmup' : bi === last && s.p2 < s.p ? 'Cooldown' : 'Ramp';
        out.push(`    <${tag} Duration="${s.d}" PowerLow="${s.p}" PowerHigh="${s.p2}"/>`);
      }
    });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>Ascent</author>\n  <name>${x(title)}</name>\n  <description>${x(title)}</description>\n  <sportType>bike</sportType>\n  <tags/>\n  <workout>\n${out.join('\n')}\n  </workout>\n</workout_file>\n`;
}
function plMrc(title, blocks) {
  const rows = [];
  let t = 0;
  plFlat(blocks).forEach(s => {
    rows.push(`${(t / 60).toFixed(2)}\t${Math.round(s.p * 100)}`);
    t += s.d;
    rows.push(`${(t / 60).toFixed(2)}\t${Math.round(s.p2 * 100)}`);
  });
  return `[COURSE HEADER]\nVERSION = 2\nUNITS = ENGLISH\nDESCRIPTION = ${title}\nFILE NAME = ${title}\nMINUTES PERCENT\n[END COURSE HEADER]\n[COURSE DATA]\n${rows.join('\n')}\n[END COURSE DATA]\n`;
}
// FIT CRC-16 (the SDK's nibble-table version)
function _plCrc(crc, byte) {
  const T = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
  let tmp = T[crc & 0xF];
  crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ T[byte & 0xF];
  tmp = T[crc & 0xF];
  crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ T[(byte >> 4) & 0xF];
  return crc;
}
/* FIT workout file (file_id + workout + workout_step), targets in % of FTP so
   the head unit applies its own FTP. Repeats use repeat steps, ramps become a
   low–high power range. */
function plFit(title, blocks, nowMs) {
  const b = [];
  const u8 = v => b.push(v & 255), u16 = v => { u8(v); u8(v >> 8); }, u32 = v => { u16(v & 0xFFFF); u16((v >>> 16) & 0xFFFF); };
  const NAME = 32;
  const str = s => { const e = new TextEncoder().encode(String(s)).slice(0, NAME - 1); for (let i = 0; i < NAME; i++) u8(i < e.length ? e[i] : 0); };
  const def = (local, global, fields) => { u8(0x40 | local); u8(0); u8(0); u16(global); u8(fields.length); fields.forEach(f => { u8(f[0]); u8(f[1]); u8(f[2]); }); };
  const steps = [];
  blocks.forEach((bl, bi) => {
    const first = steps.length;
    bl.steps.forEach(s => {
      const intensity = bi === 0 && blocks.length > 1 ? 2 : bi === blocks.length - 1 && blocks.length > 1 ? 3 : bl.n > 1 && s.p < 0.6 ? 1 : 0;
      steps.push({ s, intensity });
    });
    if (bl.n > 1) steps.push({ rep: first, n: bl.n });
  });
  // file_id: type, manufacturer, product, time_created
  def(0, 0, [[0, 1, 0], [1, 2, 0x84], [2, 2, 0x84], [4, 4, 0x86]]);
  u8(0); u8(5); u16(255); u16(0); u32(Math.round((nowMs || Date.now()) / 1000) - 631065600);
  // workout: sport (cycling), num_valid_steps, wkt_name
  def(1, 26, [[4, 1, 0], [6, 2, 0x84], [8, NAME, 7]]);
  u8(1); u8(2); u16(steps.length); str(title || 'Workout');
  // workout_step: message_index, duration_type, duration_value, target_type, target_value, low, high, intensity
  def(2, 27, [[254, 2, 0x84], [1, 1, 0], [2, 4, 0x86], [3, 1, 0], [4, 4, 0x86], [5, 4, 0x86], [6, 4, 0x86], [7, 1, 0]]);
  steps.forEach((st, i) => {
    u8(2); u16(i);
    if (st.rep != null) { u8(6); u32(st.rep); u8(0xFF); u32(st.n); u32(0xFFFFFFFF); u32(0xFFFFFFFF); u8(0xFF); return; }
    const s = st.s, lo = Math.min(s.p, s.p2) * 100, hi = Math.max(s.p, s.p2) * 100, pad = s.p === s.p2 ? 2 : 0;
    u8(0); u32(s.d * 1000); u8(4); u32(0); u32(Math.max(1, Math.round(lo - pad))); u32(Math.round(hi + pad)); u8(st.intensity);
  });
  const hdr = [14, 0x10, 2132 & 255, 2132 >> 8, b.length & 255, (b.length >> 8) & 255, (b.length >> 16) & 255, (b.length >>> 24) & 255, 46, 70, 73, 84];
  let c = 0; hdr.forEach(v => { c = _plCrc(c, v); });
  hdr.push(c & 255, c >> 8);
  const all = hdr.concat(b);
  c = 0; all.forEach(v => { c = _plCrc(c, v); });
  all.push(c & 255, c >> 8);
  return new Uint8Array(all);
}

/* ── Season plan (ATP) ───────────────────────────────────────────────────────── */
const _PL_WD = Math.exp(-7 / 42);   // CTL left after a week of zero load
const PL_PHASE_COLOR = { base: '#3b82f6', build: '#f97316', peak: '#ef4444', taper: '#a78bfa', race: '#22c55e', rec: '#64748b' };
const _plPhaseName = p => tr({ base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper', race: 'Race', rec: 'Recovery' }[p] || p);
// CTL after a week at `weekTss` spread evenly
const plCtlAfterWeek = (ctl, weekTss) => { const L = weekTss / 7; return L + (ctl - L) * _PL_WD; };
// weekly TSS that takes CTL from `ctl` to `target` in one week
const plWeekTssFor = (ctl, target) => 7 * (target - ctl * _PL_WD) / (1 - _PL_WD);

/* Weeks from `fromMon` to the event's week. Phases counted back from the race:
   Race week, Taper (1), Peak (1–2), then Build ≈ 45 % and Base the rest. */
function plSeasonWeeks(ev, ctl0, fromMon) {
  const raceMon = _trMondayOf(ev.date);
  const N = Math.round((Date.parse(raceMon) - Date.parse(fromMon)) / (7 * 864e5)) + 1;
  if (!(N >= 1 && N <= 104)) return [];
  const ramp = Math.min(10, Math.max(1, +ev.ramp || 4)), cap = +ev.target > 0 ? +ev.target : Infinity;
  const taper = N >= 3 ? 1 : 0, peak = N >= 8 ? 2 : N >= 5 ? 1 : 0;
  const rest = N - 1 - taper - peak, build = Math.round(rest * 0.45), base = rest - build;
  let ctl = ctl0, lastLoad = Math.max(7 * ctl0, 100);
  const weeks = [];
  for (let i = 0; i < N; i++) {
    const phase = i < base ? 'base' : i < base + build ? 'build' : i < base + build + peak ? 'peak' : i < N - 1 ? 'taper' : 'race';
    const rec = (phase === 'base' || phase === 'build') && (i + 1) % 4 === 0 && i < rest - 1;
    let tss;
    if (rec || phase === 'taper') tss = lastLoad * 0.6;
    else if (phase === 'race') tss = lastLoad * 0.45;
    else {
      const r = phase === 'base' ? ramp * 0.8 : phase === 'peak' ? ramp * 0.5 : ramp;
      tss = plWeekTssFor(ctl, Math.max(ctl, Math.min(ctl + r, cap)));
      lastLoad = tss;
    }
    ctl = plCtlAfterWeek(ctl, tss);
    weeks.push({ mon: _trAddDays(fromMon, 7 * i), phase, rec, tss: Math.round(tss), ctl: Math.round(ctl) });
  }
  return weeks;
}
// (Re)build the stored plan from this week on; past weeks keep their targets.
function plRebuildSeason() {
  const p = plLoad(), ev = p.event, d = _trBuildSeries();
  if (!ev || !ev.date || !d) return;
  const thisMon = _trMondayOf(_trToday());
  if (ev.date < _trToday()) { ev.weeks = (ev.weeks || []).filter(w => w.mon < thisMon); return; }
  const kept = (ev.weeks || []).filter(w => w.mon < thisMon && w.mon <= ev.date);
  ev.weeks = kept.concat(plSeasonWeeks(ev, d.ctl, thisMon));
}
function _plSeasonWeekMap() {
  const ev = plLoad().event;
  return new Map(((ev && ev.weeks) || []).map(w => [w.mon, w]));
}

/* ── Planned load + forecast ─────────────────────────────────────────────────── */
function plPlannedByDay() {
  const m = new Map();
  plLoad().workouts.forEach(w => { if (w.date) m.set(w.date, (m.get(w.date) || 0) + plWkMetrics(w).tss); });
  return m;
}
/* PMC carried forward from today: planned TSS where there is any that week,
   else the season week's target spread evenly. Today adds the planned TSS not
   done yet (the EWMA is linear, so that is just + rem·k). */
function plForecast(d, until, planned, seasonWeeks) {
  const today = _trToday(), kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  const planWeeks = new Set([...planned.keys()].filter(k => k > today).map(_trMondayOf));
  const last = d.series[d.series.length - 1];
  const rem = Math.max(0, (planned.get(today) || 0) - (d.byDay.get(today) || 0));
  let ctl = last.ctl + rem * kC, atl = last.atl + rem * kA;
  const out = [{ date: today, ctl, atl, tsb: ctl - atl, load: last.load + rem }];
  for (let k = _trAddDays(today, 1); k <= until && out.length < 800; k = _trAddDays(k, 1)) {
    const mon = _trMondayOf(k), sw = seasonWeeks.get(mon);
    let L = planned.get(k) || 0;
    if (!L && !planWeeks.has(mon) && sw) L = sw.tss / 7;
    ctl += (L - ctl) * kC; atl += (L - atl) * kA;
    out.push({ date: k, ctl, atl, tsb: ctl - atl, load: L });
  }
  return out;
}

/* Compliance of a day, TrainingPeaks colours: planned vs done TSS. */
function plCompliance(planned, done, key, today) {
  if (!planned) return done ? 'extra' : '';
  if (key > today || (key === today && !done)) return 'future';
  const r = done / planned;
  if (r >= 0.8 && r <= 1.2) return 'green';
  if (r >= 0.5 && r <= 1.5) return 'yellow';
  return r > 0 ? 'orange' : 'red';
}

/* ── Fill a week from the season target ─────────────────────────────────────── */
const PL_WEEK = {
  base:  [[1, 'end'], [2, 'tempo'], [3, 'end'], [5, 'long'], [6, 'end']],
  build: [[1, 'thr'], [2, 'end'], [3, 'ss'], [5, 'long'], [6, 'end']],
  peak:  [[1, 'vo2'], [2, 'end'], [3, 'thr'], [5, 'long'], [6, 'rec']],
  rec:   [[1, 'end'], [3, 'end'], [5, 'end']],
  taper: [[1, 'vo2'], [3, 'open'], [5, 'end']],
  race:  [[1, 'open'], [3, 'open']],
};
const _plEndText = (id, M) => id === 'long' ? `15m 50-65%\n${M}m 68%\n15m 55%` : id === 'rec' ? `${M}m 50%` : `10m 50-65%\n${M}m 68%\n10m 60-50%`;
/* Workouts for one week: intervals as in the library, endurance rides
   stretched so the week lands near `target` TSS. Days before `fromKey` and
   days that already have a workout are skipped. */
function plWeekWorkouts(mon, phaseKey, target, fromKey, busy) {
  const tpl = (PL_WEEK[phaseKey] || PL_WEEK.base).filter(([i]) => { const k = _trAddDays(mon, i); return k >= fromKey && !busy.has(k); });
  const isEnd = id => id === 'end' || id === 'long' || id === 'rec';
  const fixed = tpl.filter(([, id]) => !isEnd(id)).reduce((s, [, id]) => s + plMetrics(plParse(_plLib(id).text).blocks).tss, 0);
  const wt = { long: 2, end: 1, rec: 0.5 };
  const wsum = tpl.filter(([, id]) => isEnd(id)).reduce((s, [, id]) => s + wt[id], 0);
  const left = Math.max(0, target - fixed);
  return tpl.map(([i, id]) => {
    let text = _plLib(id).text;
    if (isEnd(id) && wsum) {
      // TSS is close to linear in the main block's minutes: solve from two points
      const at = M => plMetrics(plParse(_plEndText(id, M)).blocks).tss;
      const t20 = at(20), slope = (at(60) - t20) / 40;
      const M = Math.min(300, Math.max(20, Math.round((20 + (left * wt[id] / wsum - t20) / slope) / 5) * 5));
      text = _plEndText(id, M);
    }
    return { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: _trAddDays(mon, i), title: tr(_plLib(id).name), text, notes: '' };
  });
}
function plFillWeek(mon) {
  const d = _trBuildSeries(); if (!d) return;
  const sw = _plSeasonWeekMap().get(mon);
  const phaseKey = sw ? (sw.rec ? 'rec' : sw.phase) : 'base';
  const target = sw ? sw.tss : Math.round(7 * d.ctl);
  const p = plLoad();
  const busy = new Set(p.workouts.map(w => w.date));
  const add = plWeekWorkouts(mon, phaseKey, target, _trToday(), busy);
  if (!add.length) return;
  p.workouts.push(...add);
  plSave(); renderPlan();
}

/* ── Cloud sync (owner only) ─────────────────────────────────────────────────── */
const _plCloudOn = () => typeof _slpIsOwner === 'function' && _slpIsOwner();
async function _plCloud(body, retry) {
  const r = await fetch('/api/ai-chats', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: CONFIG.accessToken, ...body }) });
  if (r.status === 401 && !retry && typeof doRefresh === 'function') { await doRefresh(); return _plCloud(body, true); }
  if (!r.ok) throw new Error('plan ' + r.status);
  return r.json();
}
let _plPushT = null, _plPulled = false;
function _plPush() {
  if (!_plCloudOn()) return;
  clearTimeout(_plPushT);
  _plPushT = setTimeout(() => { _plCloud({ action: 'plan-save', plan: plLoad() }).catch(() => {}); }, 1200);
}
async function plCloudPull() {
  if (!_plCloudOn() || _plPulled) return;
  _plPulled = true;
  try {
    const r = await _plCloud({ action: 'plan-get' });
    const remote = r && r.plan, local = plLoad();
    if (remote && +remote.ts > local.ts) {
      _pl = null;
      try { localStorage.setItem(PL_KEY, JSON.stringify(remote)); } catch {}
      plLoad();
      renderPlan();
    } else if (local.ts > (remote ? +remote.ts || 0 : 0)) _plPush();
  } catch { _plPulled = false; }
}

/* ── UI ──────────────────────────────────────────────────────────────────────── */
let _plWeek = 0;      // first calendar row, in weeks from this week
let _plEdit = null;   // workout being edited (a copy) or null
const _plHm = s => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}m`; };
const _plFmtDay = (k, opts) => new Date(k + 'T00:00:00Z').toLocaleDateString(window.LANG === 'id' ? 'id-ID' : 'en-GB', { timeZone: 'UTC', ...opts });

function _plSeasonHTML(p, d, fc, today) {
  const ev = p.event || {};
  const sw = _plSeasonWeekMap(), thisWk = sw.get(_trMondayOf(today));
  const rampSel = [2, 3, 4, 5, 6, 8].map(v => `<option value="${v}"${(+ev.ramp || 4) === v ? ' selected' : ''}>+${v}</option>`).join('');
  let tiles = '', advice = '';
  if (ev.date && ev.date >= today && fc) {
    const eve = fc.find(x => x.date === _trAddDays(ev.date, -1)) || fc[0];
    const tsb = eve.tsb, band = _trFormBand(tsb, 0);
    const days = Math.round((Date.parse(ev.date) - Date.parse(today)) / 864e5);
    const tile = (val, lbl, color, sub) => `<div class="tr-tile card"><div class="tr-tile-val" style="color:${color || 'var(--text)'}">${val}</div><div class="tr-tile-lbl">${lbl}</div>${sub ? `<div class="tr-tile-sub">${sub}</div>` : ''}</div>`;
    tiles = `<div class="tr-tiles">
      ${tile(days, tr('Days to go'), 'var(--text)', _plFmtDay(ev.date, { day: 'numeric', month: 'short', year: 'numeric' }))}
      ${tile(`${Math.round(d.ctl)}→${Math.round(eve.ctl)}`, tr('Fitness · CTL'), 'var(--orange)', tr('now → race day'))}
      ${tile((tsb >= 0 ? '+' : '') + Math.round(tsb), tr('Race-day form'), band.color, `<span style="color:${band.color};font-weight:700">${band.label}</span>`)}
      ${tile(thisWk ? thisWk.tss : '—', tr('This week · TSS'), thisWk ? PL_PHASE_COLOR[thisWk.rec ? 'rec' : thisWk.phase] : 'var(--text)', thisWk ? `${_plPhaseName(thisWk.rec ? 'rec' : thisWk.phase)} · ≈${Math.round(thisWk.tss / 52)}h` : '')}
    </div>`;
    advice = tsb < 5 ? tr('You would start the event tired. Plan less load in the last 10 days (an easier taper) to reach a form of +5 to +25.')
      : tsb > 25 ? tr('You would start very fresh, and fitness fades while you rest. Keep a few short hard efforts in the taper.')
      : tr('On track: with this plan you start the event fresh (form +5 to +25).');
    advice = `<div class="tr-note" style="margin:0 0 4px">${advice} ${tr('Forecast uses your planned workouts, and the season target for weeks with nothing planned.')}</div>`;
  } else if (ev.date && ev.date < today) {
    advice = `<div class="tr-note" style="margin:0">${tr('That event has passed. Pick the next one to plan toward it.')}</div>`;
  } else {
    advice = `<div class="tr-note" style="margin:0">${tr('Pick an event date. You get a periodized plan (Base → Build → Peak → Taper) with a weekly TSS target, a forecast of your race-day fitness and form, and “Fill week” buttons that put matching workouts on the calendar.')}</div>`;
  }
  return `<div class="card pl-card">
    <div class="tr-chart-title">${tr('Season plan')}</div>
    <div class="pl-ev-form">
      <label>${tr('Event')}<input type="text" maxlength="60" value="${_plEsc(ev.name || '')}" placeholder="${tr('e.g. BRM 300')}" onchange="plEvSet('name',this.value)"></label>
      <label>${tr('Date')}<input type="date" value="${_plEsc(ev.date || '')}" onchange="plEvSet('date',this.value)"></label>
      <label>${tr('Target CTL')}<input type="number" min="10" max="200" value="${+ev.target || ''}" placeholder="${tr('auto')}" onchange="plEvSet('target',this.value)"></label>
      <label>${tr('Ramp / week')}<select onchange="plEvSet('ramp',this.value)">${rampSel}</select></label>
      ${ev.date ? `<button class="pl-btn" onclick="plEvRebuild()">${tr('Rebuild from today')}</button><button class="pl-btn pl-btn-ghost" onclick="plEvClear()">${tr('Clear')}</button>` : ''}
    </div>
    ${tiles}${advice}
  </div>`;
}

function _plCalendarHTML(p, d, today) {
  const start = _trAddDays(_trMondayOf(today), 7 * _plWeek);
  const byDate = new Map();
  p.workouts.forEach(w => { if (!byDate.has(w.date)) byDate.set(w.date, []); byDate.get(w.date).push(w); });
  const actsBy = new Map();
  (acts || []).forEach(a => { const k = _trDayKey(a); if (!actsBy.has(k)) actsBy.set(k, []); actsBy.get(k).push(a); });
  const sw = _plSeasonWeekMap(), thisMon = _trMondayOf(today);
  const wdNames = Array.from({ length: 7 }, (_, i) => _plFmtDay(_trAddDays('2024-01-01', i), { weekday: 'short' }));
  let rows = '';
  for (let w = 0; w < 4; w++) {
    const mon = _trAddDays(start, 7 * w);
    let planWk = 0, doneWk = 0, cells = '';
    for (let i = 0; i < 7; i++) {
      const k = _trAddDays(mon, i), wk = byDate.get(k) || [], da = actsBy.get(k) || [];
      const ms = wk.map(plWkMetrics), planned = ms.reduce((s, m) => s + m.tss, 0), done = d.byDay.get(k) || 0;
      planWk += planned; doneWk += done;
      const comp = plCompliance(planned, done, k, today);
      const items = wk.map((x, j) => `<button class="pl-item pl-c-${comp}" onclick="event.stopPropagation();plEditOpen('${x.id}')"><b>${_plEsc(x.title || tr('Workout'))}</b><span>${ms[j].secs ? _plHm(ms[j].secs) + ' · ' : ''}${Math.round(ms[j].tss)} TSS</span></button>`).join('');
      const doneItems = da.map(a => { const r = d.loadOf(a); return `<button class="pl-done" onclick="event.stopPropagation();openActivityModal('${a.id}')">✓ ${_plEsc(a.name)}<span>${r ? Math.round(r.load) + ' TSS' : ''}</span></button>`; }).join('');
      cells += `<div class="pl-day${k === today ? ' today' : ''}${k < today ? ' past' : ''}" onclick="plNew('${k}')" title="${tr('Add a workout')}">
        <div class="pl-dnum"><span class="pl-wdn">${wdNames[i]}</span> ${+k.slice(8)}${k.slice(8) === '01' || (w === 0 && i === 0) ? ' ' + _plFmtDay(k, { month: 'short' }) : ''}</div>${items}${doneItems}</div>`;
    }
    const s = sw.get(mon), ph = s ? (s.rec ? 'rec' : s.phase) : '';
    const canFill = mon >= thisMon;
    rows += `<div class="pl-week">${cells}<div class="pl-wsum">
      ${ph ? `<div class="pl-phase" style="color:${PL_PHASE_COLOR[ph]}">${_plPhaseName(ph)}</div>` : ''}
      <div>${tr('Plan')} <b>${Math.round(planWk)}</b>${s ? ` <small>/ ${s.tss}</small>` : ''}</div>
      <div>${tr('Done')} <b>${Math.round(doneWk)}</b></div>
      ${canFill ? `<button class="pl-btn pl-btn-sm" onclick="plFillWeek('${mon}')" title="${tr('Adds workouts to the empty days, sized to the week’s target')}">${tr('Fill week')}</button>` : ''}
    </div></div>`;
  }
  const head = wdNames.map(n => `<div>${n}</div>`).join('') + `<div>${tr('Week')}</div>`;
  return `<div class="card pl-card">
    <div class="pl-cal-head">
      <div class="tr-chart-title" style="margin:0">${tr('Calendar')}</div>
      <div class="pl-nav">
        <button class="pl-btn pl-btn-sm" onclick="plWeekNav(-4)" aria-label="${tr('Earlier')}">‹</button>
        <button class="pl-btn pl-btn-sm" onclick="plWeekNav(0)">${tr('This week')}</button>
        <button class="pl-btn pl-btn-sm" onclick="plWeekNav(4)" aria-label="${tr('Later')}">›</button>
      </div>
    </div>
    <div class="pl-cal"><div class="pl-week pl-week-h">${head}</div>${rows}</div>
    <div class="pl-legend"><span class="pl-c-green">${tr('on plan')}</span><span class="pl-c-yellow">${tr('a bit off')}</span><span class="pl-c-orange">${tr('well off')}</span><span class="pl-c-red">${tr('missed')}</span> · ${tr('Tap a day to plan a workout.')}</div>
    <div id="plEditor"></div>
  </div>`;
}

function _plChartsHTML(hasSeason) {
  return `<div class="card pl-card">
      <div class="tr-chart-title">${tr('Fitness forecast')}</div>
      <div style="height:280px"><canvas id="plFcChart"></canvas></div>
      <div class="tr-basis-note">${tr('Solid = done, dashed = forecast from the plan.')}</div>
    </div>
    ${hasSeason ? `<div class="card pl-card">
      <div class="tr-chart-title">${tr('Weekly TSS · target vs done')}</div>
      <div style="height:240px"><canvas id="plWkChart"></canvas></div>
      <div class="pl-legend">${['base', 'build', 'rec', 'peak', 'taper', 'race'].map(k => `<span style="--c:${PL_PHASE_COLOR[k]}" class="pl-ph">${_plPhaseName(k)}</span>`).join('')}</div>
    </div>` : ''}`;
}

function renderPlan() {
  const body = document.getElementById('planBody');
  if (!body) return;
  const d = typeof _trBuildSeries === 'function' ? _trBuildSeries() : null;
  if (!d) { body.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--muted)">${tr('Load your activities to plan your training.')}</div>`; return; }
  const p = plLoad(), today = _trToday();
  const sw = _plSeasonWeekMap(), planned = plPlannedByDay();
  const ev = p.event || {};
  const lastPlanned = [...planned.keys()].sort().pop() || today;
  let until = _trAddDays(today, 28);
  if (ev.date && ev.date > until) until = _trAddDays(ev.date, 3);
  if (lastPlanned > until) until = lastPlanned;
  const fc = plForecast(d, until, planned, sw);
  body.innerHTML = _plSeasonHTML(p, d, fc, today) + _plCalendarHTML(p, d, today) + _plChartsHTML(sw.size > 0);
  _plDrawForecast(d, fc, ev.date);
  if (sw.size) _plDrawWeeks(d, [...sw.values()], planned);
  if (_plEdit) _plRenderEditor();
  plCloudPull();
}

function _plChartOpts(extra) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, labels: { color: '#888', font: { size: 11 }, boxWidth: 12, usePointStyle: true } },
      tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa' },
    },
  }, extra);
}
function _plDrawForecast(d, fc, evDate) {
  if (typeof Chart === 'undefined') return;
  destroyChart('plFc');
  const ctx = document.getElementById('plFcChart'); if (!ctx) return;
  const past = d.series.slice(-61, -1), pts = past.concat(fc), split = past.length;
  const evIdx = evDate ? pts.findIndex(x => x.date === evDate) : -1;
  const dash = c => (c.p0DataIndex >= split ? [5, 4] : undefined);
  const ds = (label, key, color, axis, extra) => Object.assign({ label, data: pts.map(x => +x[key].toFixed(1)), borderColor: color, backgroundColor: 'transparent', borderWidth: 2, tension: 0.25, yAxisID: axis,
    pointRadius: pts.map((_, i) => i === evIdx ? 5 : 0), pointBackgroundColor: color, segment: { borderDash: dash } }, extra || {});
  charts['plFc'] = new Chart(ctx, {
    type: 'line',
    data: { labels: pts.map(x => x.date), datasets: [
      ds(tr('Fitness (CTL)'), 'ctl', '#fc4c02', 'y', { backgroundColor: 'rgba(252,76,2,.10)', fill: true }),
      ds(tr('Fatigue (ATL)'), 'atl', '#a78bfa', 'y', { borderWidth: 1.5 }),
      ds(tr('Form (TSB)'), 'tsb', '#22c55e', 'y1', { borderWidth: 1.5 }),
    ] },
    options: _plChartOpts({ scales: {
      x: { grid: { color: '#1c1c1c' }, ticks: { color: '#555', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 } },
      y: { position: 'left', grid: { color: '#1c1c1c' }, ticks: { color: '#666', font: { size: 10 } } },
      y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#22c55e', font: { size: 10 } } },
    } }),
  });
}
function _plDrawWeeks(d, weeks, planned) {
  if (typeof Chart === 'undefined') return;
  destroyChart('plWk');
  const ctx = document.getElementById('plWkChart'); if (!ctx) return;
  const sumWeek = (mon, get) => { let s = 0; for (let i = 0; i < 7; i++) s += get(_trAddDays(mon, i)) || 0; return Math.round(s); };
  const thisMon = _trMondayOf(_trToday());
  charts['plWk'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: weeks.map(w => _plFmtDay(w.mon, { day: 'numeric', month: 'short' })), datasets: [
      { label: tr('Target'), data: weeks.map(w => w.tss), backgroundColor: weeks.map(w => PL_PHASE_COLOR[w.rec ? 'rec' : w.phase] + '55'), borderColor: weeks.map(w => PL_PHASE_COLOR[w.rec ? 'rec' : w.phase]), borderWidth: 1, borderRadius: 3 },
      { label: tr('Planned'), data: weeks.map(w => sumWeek(w.mon, k => planned.get(k))), backgroundColor: '#55555588', borderRadius: 3 },
      { label: tr('Done'), data: weeks.map(w => w.mon <= thisMon ? sumWeek(w.mon, k => d.byDay.get(k)) : null), backgroundColor: '#fc4c02', borderRadius: 3 },
    ] },
    options: _plChartOpts({ scales: {
      x: { grid: { display: false }, ticks: { color: '#555', font: { size: 9 }, maxRotation: 0, autoSkip: true } },
      y: { grid: { color: '#1c1c1c' }, ticks: { color: '#666', font: { size: 10 } } },
    } }),
  });
}

/* season form */
function plEvSet(k, v) {
  const p = plLoad();
  p.event = p.event || { ramp: 4 };
  if (k === 'name') p.event.name = String(v || '').slice(0, 60);
  else if (k === 'date') p.event.date = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  else if (k === 'target') p.event.target = +v > 0 ? Math.min(200, +v) : 0;
  else if (k === 'ramp') p.event.ramp = Math.min(10, Math.max(1, +v || 4));
  if (k !== 'name') plRebuildSeason();
  if (!p.event.date) p.event.weeks = [];
  plSave(); renderPlan();
}
function plEvRebuild() { plRebuildSeason(); plSave(); renderPlan(); }
function plEvClear() { const p = plLoad(); delete p.event; plSave(); renderPlan(); }
function plWeekNav(n) { _plWeek = n ? Math.max(-52, Math.min(52, _plWeek + n)) : 0; renderPlan(); }

/* editor */
function plNew(date) {
  _plEdit = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, title: '', text: '', notes: '', isNew: true };
  _plRenderEditor(true);
}
function plEditOpen(id) {
  const w = plLoad().workouts.find(x => x.id === id);
  if (!w) return;
  _plEdit = { ...w };
  _plRenderEditor(true);
}
function plEdSet(k, v) {
  if (!_plEdit) return;
  _plEdit[k] = v;
  if (k === 'text' || k === 'secs' || k === 'tss') _plRenderPreview();
}
function plUsePreset(id) {
  const x = _plLib(id); if (!x || !_plEdit) return;
  _plEdit.text = x.text;
  if (!_plEdit.title || PL_LIB.some(l => tr(l.name) === _plEdit.title)) _plEdit.title = tr(x.name);
  _plRenderEditor();
}
function _plRenderPreview() {
  const el = document.getElementById('plPrev'); if (!el || !_plEdit) return;
  const { blocks, errors } = plParse(_plEdit.text);
  const m = plWkMetrics(_plEdit);
  const ftp = (typeof estimateFtp === 'function' && estimateFtp()) || null, F = ftp ? ftp.value : 0;
  const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  el.innerHTML = `${blocks.length ? plProfileSVG(blocks, 70) : ''}
    <div class="pl-stats">
      ${stat(m.secs ? _plHm(m.secs) : '—', tr('Duration'))}
      ${stat(Math.round(m.tss) || '—', 'TSS')}
      ${stat(m.if ? m.if.toFixed(2) : '—', 'IF')}
      ${F && m.if ? stat(Math.round(m.if * F) + ' W', 'NP') : ''}
      ${F && m.avg ? stat(Math.round(m.avg * m.secs * F / 1000), 'kJ') : ''}
    </div>
    ${errors.length ? `<div class="pl-err">${trf('Line {0} not understood — write it like 20m 90% or 3x(4m 115%, 4m 50%).', errors.join(', '))}</div>` : ''}`;
  const man = document.getElementById('plManual');
  if (man) man.style.display = blocks.length ? 'none' : '';
  document.querySelectorAll('.pl-exp').forEach(b => { b.disabled = !blocks.length; });
}
function _plRenderEditor(scroll) {
  const host = document.getElementById('plEditor'); if (!host) return;
  if (!_plEdit) { host.innerHTML = ''; return; }
  const e = _plEdit;
  host.innerHTML = `<div class="pl-ed">
    <div class="pl-ed-row">
      <input type="text" class="pl-ed-title" maxlength="60" placeholder="${tr('Workout name')}" value="${_plEsc(e.title)}" oninput="plEdSet('title',this.value)">
      <input type="date" value="${_plEsc(e.date)}" onchange="plEdSet('date',this.value)">
    </div>
    <div class="pl-chips">${PL_LIB.map(x => `<button class="pl-chip" onclick="plUsePreset('${x.id}')">${tr(x.name)}</button>`).join('')}</div>
    <textarea class="pl-ed-text" rows="5" spellcheck="false" placeholder="10m 50-75%&#10;3x(15m 90%, 5m 55%)&#10;10m 50%" oninput="plEdSet('text',this.value)">${_plEsc(e.text)}</textarea>
    <div class="tr-basis-note" style="margin-top:4px">${tr('One step per line, power as % of FTP: 20m 90% · ramp 10m 50-75% · repeats 5x(4m 115%, 4m 50%) · durations 30s, 4m30s, 1h30m.')}</div>
    <div id="plManual" class="pl-ed-row" style="display:none">
      <label>${tr('Or just a duration (min)')}<input type="number" min="0" max="1440" value="${e.secs ? Math.round(e.secs / 60) : ''}" oninput="plEdSet('secs',this.value*60)"></label>
      <label>TSS<input type="number" min="0" max="1000" value="${e.tss || ''}" oninput="plEdSet('tss',this.value)"></label>
    </div>
    <div id="plPrev" class="pl-prev"></div>
    <textarea class="pl-ed-notes" rows="2" maxlength="1000" placeholder="${tr('Notes (optional)')}" oninput="plEdSet('notes',this.value)">${_plEsc(e.notes)}</textarea>
    <div class="pl-ed-row pl-ed-actions">
      <button class="pl-btn pl-btn-primary" onclick="plEdSave()">${tr('Save')}</button>
      ${e.isNew ? '' : `<button class="pl-btn" onclick="plEdDelete()">${tr('Delete')}</button>`}
      <span class="pl-sp"></span>
      <button class="pl-btn pl-exp" onclick="plExport('fit')" title="${tr('Garmin, Wahoo, iGPSport, Hammerhead…')}">.fit</button>
      <button class="pl-btn pl-exp" onclick="plExport('zwo')" title="Zwift, MyWhoosh, TrainerDay…">.zwo</button>
      <button class="pl-btn pl-exp" onclick="plExport('mrc')" title="${tr('ERG mode, % of FTP')}">.mrc</button>
      <button class="pl-btn pl-btn-ghost" onclick="plEdClose()">${tr('Close')}</button>
    </div>
  </div>`;
  _plRenderPreview();
  if (scroll) setTimeout(() => { try { host.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {} }, 30);
}
function plEdSave() {
  const e = _plEdit; if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return;
  const p = plLoad();
  const w = { id: e.id, date: e.date, title: String(e.title || '').slice(0, 60) || tr('Workout'), text: String(e.text || '').slice(0, 2000), notes: String(e.notes || '').slice(0, 1000) };
  if (!plParse(w.text).blocks.length) { w.secs = Math.max(0, +e.secs || 0); w.tss = Math.max(0, +e.tss || 0); }
  const i = p.workouts.findIndex(x => x.id === w.id);
  if (i >= 0) p.workouts[i] = w; else p.workouts.push(w);
  _plEdit = null;
  plSave(); renderPlan();
}
function plEdDelete() {
  if (!_plEdit) return;
  const p = plLoad();
  p.workouts = p.workouts.filter(x => x.id !== _plEdit.id);
  _plEdit = null;
  plSave(); renderPlan();
}
function plEdClose() { _plEdit = null; _plRenderEditor(); }
function plExport(kind) {
  const e = _plEdit; if (!e) return;
  const { blocks } = plParse(e.text);
  if (!blocks.length) return;
  const title = e.title || tr('Workout');
  const file = (title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'workout') + '.' + kind;
  const blob = kind === 'fit' ? new Blob([plFit(title, blocks)], { type: 'application/octet-stream' })
    : new Blob([kind === 'zwo' ? plZwo(title, blocks) : plMrc(title, blocks)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  track('plan_export', { kind });
}

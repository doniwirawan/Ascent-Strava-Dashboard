/* ── TRAINING LOAD & FATIGUE ─────────────────────────────────────────────────
   A TrainingPeaks-style Performance Management Chart, computed from `acts`.

   Per-activity daily LOAD (a unified TSS-equivalent), best signal first:
     1) power + FTP → TSS = (t·NP·IF)/(FTP·3600)·100
     2) Strava suffer_score (Relative Effort — already an HR-TRIMP)
     3) HR-TRIMP (Banister) from avg HR + observed max HR
     4) duration × moderate-intensity fallback
   CTL (fitness) = 42-day EWMA of load · ATL (fatigue) = 7-day EWMA ·
   TSB (form/freshness) = CTL − ATL · Ramp = ΔCTL over the last 7 days. */

// Calendar arithmetic on 'YYYY-MM-DD' keys (UTC-anchored so it's DST-proof).
function _trAddDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Local calendar day for an activity (start_date_local carries a fake 'Z').
function _trDayKey(a) { return (a.start_date_local || a.start_date || '').slice(0, 10); }
// Today's LOCAL calendar day.
function _trToday() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Load for one activity + which method produced it. Returns {load, basis} or null.
function _trActivityLoad(a, ftp, hrMax, hrRest) {
  const dur = a.moving_time || a.elapsed_time || 0;
  if (dur <= 0) return null;
  // 1) power-based TSS (rides with a power meter, when we have an FTP)
  const np = a.weighted_average_watts || a.average_watts || 0;
  if (np > 0 && ftp > 0) {
    const IF = np / ftp;
    return { load: (dur * np * IF) / (ftp * 3600) * 100, basis: 'power' };
  }
  // 2) Strava Relative Effort (suffer_score) — already an HR-TRIMP, ~TSS scale
  if (a.suffer_score > 0) return { load: a.suffer_score, basis: 'effort' };
  // 3) HR-TRIMP (Banister), scaled toward the TSS range
  if (a.average_heartrate > 0 && hrMax > hrRest) {
    const hrr = Math.min(1, Math.max(0, (a.average_heartrate - hrRest) / (hrMax - hrRest)));
    const trimp = (dur / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
    return { load: trimp * 0.6, basis: 'hr' };
  }
  // 4) duration fallback — assume a moderate ~50 load/hour
  return { load: (dur / 3600) * 50, basis: 'time' };
}

// Build the full PMC series + current metrics from `acts`.
function _trBuildSeries() {
  if (typeof acts === 'undefined' || !acts.length) return null;
  const ftpEst = (typeof estimateFtp === 'function' && estimateFtp()) || null;
  const ftp = ftpEst ? ftpEst.value : 0;
  const hrMax = (typeof observedMaxHr === 'function' && observedMaxHr()) || 0;
  const hrRest = 60; // no resting-HR in the API; a common recreational default

  // Sum load per calendar day + tally which basis was used (for transparency).
  const byDay = new Map();
  const basis = { power: 0, effort: 0, hr: 0, time: 0 };
  let earliest = null;
  for (const a of acts) {
    const key = _trDayKey(a);
    if (!key) continue;
    const r = _trActivityLoad(a, ftp, hrMax, hrRest);
    if (!r) continue;
    byDay.set(key, (byDay.get(key) || 0) + r.load);
    basis[r.basis]++;
    if (!earliest || key < earliest) earliest = key;
  }
  if (!earliest) return null;

  // Walk every day from the first activity to today, decaying CTL/ATL.
  const today = _trToday();
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  let ctl = 0, atl = 0;
  const series = [];
  for (let key = earliest; key <= today; key = _trAddDays(key, 1)) {
    const L = byDay.get(key) || 0;
    ctl += (L - ctl) * kC;
    atl += (L - atl) * kA;
    series.push({ date: key, load: L, ctl, atl, tsb: ctl - atl });
    if (series.length > 4000) break; // runaway guard (~11 years)
  }
  const last = series[series.length - 1];
  const ago7 = series[series.length - 8]; // ~7 days back
  const ramp = ago7 ? last.ctl - ago7.ctl : 0;
  return {
    series, basis, ftpEst,
    ctl: last.ctl, atl: last.atl, tsb: last.tsb, ramp,
  };
}

// Form (TSB) band → label, colour, and a one-line recovery recommendation.
function _trFormBand(tsb, ramp) {
  let band;
  if (tsb < -30)      band = { label: tr('High fatigue'), color: '#ef4444', advice: tr('Prioritise recovery — easy spins or a rest day. Your fatigue is well above your fitness right now.') };
  else if (tsb < -10) band = { label: tr('Productive'), color: '#fb923c', advice: tr('Productive training load. Keep hard days hard and easy days easy, and bank a recovery day this week.') };
  else if (tsb < 5)   band = { label: tr('Neutral'), color: '#eab308', advice: tr('Balanced form. A good window for a quality session or a longer endurance ride.') };
  else if (tsb < 25)  band = { label: tr('Fresh'), color: '#22c55e', advice: tr('Fresh and race-ready. Strong day for a hard effort, an event, or a PR attempt.') };
  else                band = { label: tr('Very fresh'), color: '#4da8ff', advice: tr('Very fresh — fitness may start to fade. Time to add some training stimulus.') };
  if (ramp > 8)       band.advice += trf(' ⚠ Fitness is ramping fast (+{0}/wk) — watch for overreaching.', Math.round(ramp));
  else if (ramp < -6) band.advice += trf(' Fitness is drifting down ({0}/wk).', Math.round(ramp));
  return band;
}

function _trBasisNote(basis) {
  const parts = [];
  if (basis.power)  parts.push(trf('{0} from power', basis.power));
  if (basis.effort) parts.push(trf('{0} from Relative Effort', basis.effort));
  if (basis.hr)     parts.push(trf('{0} from heart rate', basis.hr));
  if (basis.time)   parts.push(trf('{0} from duration', basis.time));
  return parts.join(' · ');
}

/* ── TRAINING GUIDE ───────────────────────────────────────────────────────────
   A collapsible glossary explaining every metric on the Training page in plain
   language, EN/ID. Each entry: [term, English def, Indonesian def]. */
const _TR_GUIDE = [
  ['Beban / Load (TSS)',
    'A single score for how hard a session was, first from power, else Strava Relative Effort, else heart rate, else duration. ~100 ≈ an hour at threshold.',
    'Satu skor seberapa berat sebuah sesi — dari power, atau Relative Effort, atau detak jantung, atau durasi. ~100 ≈ satu jam di ambang.'],
  ['Fitness · CTL',
    'Chronic Training Load: a 42-day average of your daily load. A proxy for long-term fitness — it rises slowly as you train consistently.',
    'Chronic Training Load: rata-rata beban harian selama 42 hari. Proksi kebugaran jangka panjang — naik perlahan saat Anda latihan konsisten.'],
  ['Fatigue · ATL',
    'Acute Training Load: a 7-day average of your load. Short-term tiredness — it spikes fast after hard days and fades within about a week.',
    'Acute Training Load: rata-rata beban 7 hari. Kelelahan jangka pendek — melonjak cepat setelah hari berat dan mereda dalam sekitar seminggu.'],
  ['Form · TSB',
    'Training Stress Balance = CTL − ATL. Your freshness. Positive = fresh and race-ready; deeply negative = fatigued and needing recovery.',
    'Training Stress Balance = CTL − ATL. Kesegaran Anda. Positif = segar & siap balapan; sangat negatif = lelah dan butuh pemulihan.'],
  ['Ramp rate',
    'How fast CTL is changing per week. Building fitness is good, but ramping too fast (roughly >8/wk) raises the risk of overreaching.',
    'Seberapa cepat CTL berubah per minggu. Menambah kebugaran itu bagus, tapi naik terlalu cepat (kira-kira >8/mgg) menaikkan risiko overreaching.'],
  ['Performance Management Chart',
    'The CTL / ATL / TSB lines over time — see fitness build, fatigue spike after hard blocks, and form dip and recover.',
    'Garis CTL / ATL / TSB dari waktu ke waktu — lihat kebugaran naik, kelelahan melonjak setelah blok berat, dan bentuk turun lalu pulih.'],
  ['FTP & W/kg',
    'Functional Threshold Power: the power you could roughly hold for an hour. W/kg divides it by body weight — the key climbing number. Estimated from your best sustained effort or your weight when you have no power meter. VO₂max is estimated Garmin/Firstbeat-style: your power is converted to an oxygen cost (ACSM) and your power-to-heart-rate line is extrapolated to your max HR — an estimate, not Garmin’s exact number.',
    'Functional Threshold Power: power yang kira-kira bisa Anda tahan selama satu jam. W/kg membaginya dengan berat badan — angka kunci untuk menanjak. Diperkirakan dari upaya terbaik atau berat badan bila tak ada power meter. VO₂max diperkirakan ala Garmin/Firstbeat: power Anda dikonversi ke kebutuhan oksigen (ACSM) dan garis power–detak jantung diekstrapolasi ke HR maksimum Anda — sebuah perkiraan, bukan angka persis Garmin.'],
  ['Recovery & Next Ride',
    'An estimate of when you have recovered enough for a hard effort, based on the load of your last session (and short-circuited when your form is already fresh).',
    'Perkiraan kapan Anda sudah cukup pulih untuk upaya berat, berdasar beban sesi terakhir (dan langsung siap bila bentuk Anda sudah segar).'],
  ['Consistency',
    'How regularly you ride versus a 3-rides-per-week target over the recent weeks — regularity matters more than the odd big week.',
    'Seberapa teratur Anda gowes dibanding target 3 gowes/minggu selama beberapa minggu terakhir — keteraturan lebih penting dari sesekali minggu besar.'],
  ['HR Decoupling',
    'Aerobic drift. Splits a long ride in half and compares efficiency (output ÷ heart rate) between the halves. Under 5% is well-coupled; over 10% means HR climbed for the same effort — a sign aerobic endurance, fuelling or heat limited the back half.',
    'Aerobic drift. Membagi gowes panjang jadi dua dan membandingkan efisiensi (output ÷ detak jantung) antar paruh. Di bawah 5% tergandeng baik; di atas 10% berarti HR naik untuk upaya yang sama — tanda ketahanan aerobik, nutrisi, atau panas membatasi paruh akhir.'],
  ['VAM',
    'Velocità Ascensionale Media — your average vertical climbing speed in metres per hour. Higher = stronger on climbs; elite climbs hit ~1,600+ m/h.',
    'Velocità Ascensionale Media — kecepatan mendaki vertikal rata-rata dalam meter per jam. Makin tinggi = makin kuat menanjak; tanjakan elite ~1.600+ m/jam.'],
  ['Fitness Trend (Zone 2)',
    'Your speed/power on easy aerobic (Zone-2) rides over time. Going faster at the same easy heart rate is a real sign of improving aerobic fitness.',
    'Kecepatan/power Anda pada gowes aerobik ringan (Zona 2) dari waktu ke waktu. Makin cepat pada detak jantung ringan yang sama = tanda nyata kebugaran aerobik membaik.'],
  ['Ride Quality Score',
    'Scores your latest ride 0–100 by percentile against your own history across endurance, climbing, efficiency and effort.',
    'Menilai gowes terbaru Anda 0–100 berdasar persentil terhadap riwayat Anda sendiri: ketahanan, menanjak, efisiensi, dan upaya.'],
  ['Time Lost Analysis',
    'Where your moving time actually went — climbing, descending, flat pedalling, coasting and stopped — so a "slow" average makes sense.',
    'Ke mana waktu bergerak Anda benar-benar pergi — menanjak, menurun, kayuh datar, meluncur, dan berhenti — agar rata-rata yang "lambat" jadi masuk akal.'],
  ['Wind Analysis',
    'How much of a ride fought a headwind, tailwind or crosswind, plus the net wind along your direction of travel — a slow ride into wind was often a strong one.',
    'Seberapa banyak gowes melawan angin depan, belakang, atau samping, plus angin neto sepanjang arah perjalanan — gowes lambat melawan angin sering justru kuat.'],
  ['Power Curve',
    'Your best average power at each duration (5s to 60min), aggregated across rides — the shape of your sprint-to-endurance strengths. Needs power data.',
    'Power rata-rata terbaik Anda di tiap durasi (5 detik sampai 60 menit), digabung dari semua gowes — bentuk kekuatan dari sprint hingga ketahanan. Butuh data power.'],
  ['Segment Intelligence',
    'Analyses your starred segments’ effort history — which you’re closest to a PR on, which are improving fastest, and which have stalled.',
    'Menganalisis riwayat upaya segmen berbintang Anda — mana yang paling dekat ke PR, mana yang membaik tercepat, dan mana yang mandek.'],
  ['Relative Effort / Suffer Score',
    'Strava’s measure of how hard a session was, from the time you spent in each heart-rate zone. It feeds the load model when you have no power.',
    'Ukuran Strava tentang seberapa berat sesi, dari waktu di tiap zona detak jantung. Ini memberi masukan ke model beban saat Anda tak punya power.'],
];

// Inline plain-language note shown directly under its card (replaces the old
// collapsed glossary — every metric explains itself where it appears).
function _trNote(term) {
  const id = window.LANG === 'id';
  const e = _TR_GUIDE.find(x => x[0] === term);
  return e ? `<div class="tr-note">${id ? e[2] : e[1]}</div>` : '';
}

/* ── TRAINING INTRO / MEASUREMENT LEGEND ──────────────────────────────────────
   Sets expectations for the whole page: states how THIS athlete's load is
   measured (power, Relative Effort, or heart rate) so a no-power user knows the
   numbers are HR/effort estimates — not missing — and explains the CTL/ATL/TSB
   tiles that follow. */
function _trIntroHTML(d) {
  const id = window.LANG === 'id';
  const b = d.basis, hasPower = b.power > 0, hasHr = b.effort > 0 || b.hr > 0;
  let basis;
  if (hasPower && (b.effort || b.hr || b.time)) {
    basis = id ? 'Beban latihan diukur dari <b>power</b> bila tersedia, plus <b>Relative Effort & detak jantung</b>.'
               : 'Training load is measured from <b>power</b> where available, plus <b>Relative Effort &amp; heart rate</b>.';
  } else if (hasPower) {
    basis = id ? 'Beban latihan diukur dari <b>data power</b> Anda.' : 'Training load is measured from your <b>power data</b>.';
  } else if (hasHr) {
    basis = id ? 'Beban latihan diperkirakan dari <b>Relative Effort & detak jantung</b> — tak perlu power meter.'
               : 'Training load is estimated from <b>Relative Effort &amp; heart rate</b> — no power meter needed.';
  } else {
    basis = id ? 'Beban latihan diperkirakan dari <b>durasi</b> — pakai monitor detak jantung untuk angka yang lebih tajam.'
               : 'Training load is estimated from <b>duration</b> — wear a heart-rate monitor for sharper load.';
  }
  const chip = (color, k, sub) => `<span class="tr-lg-chip"><span class="tr-lg-dot" style="background:${color}"></span><b>${k}</b> ${sub}</span>`;
  const legend = [
    chip('var(--orange)', id ? 'Kebugaran' : 'Fitness', 'CTL'),
    chip('#a78bfa', id ? 'Kelelahan' : 'Fatigue', 'ATL'),
    chip('#22c55e', id ? 'Bentuk' : 'Form', 'TSB'),
  ].join('');
  return `<div class="card tr-intro">
    <div class="tr-intro-basis">${basis}</div>
    <div class="tr-lg">${legend}</div>
  </div>`;
}

/* ── RECOVERY & NEXT RIDE ─────────────────────────────────────────────────────
   Your most recent session, an estimate of when you're recovered enough for a
   hard effort, and a suggested next workout for your current form. Recovery time
   scales with the last session's load; being fresh (positive TSB) short-circuits
   it. No power meter needed — load falls back to Relative Effort / HR / time. */
function _trLastSession() {
  if (typeof acts === 'undefined' || !acts.length) return null;
  const ftpEst = (typeof estimateFtp === 'function' && estimateFtp()) || null;
  const ftp = ftpEst ? ftpEst.value : 0;
  const hrMax = (typeof observedMaxHr === 'function' && observedMaxHr()) || 0;
  const dated = acts.filter(a => _trDayKey(a));
  if (!dated.length) return null;
  const last = dated.slice().sort((a, b) => (b.start_date || b.start_date_local || '').localeCompare(a.start_date || a.start_date_local || ''))[0];
  const r = _trActivityLoad(last, ftp, hrMax, 60);
  const load = r ? r.load : 0;
  const startMs = new Date(last.start_date || last.start_date_local).getTime();
  const endMs = startMs + (last.elapsed_time || last.moving_time || 0) * 1000;
  const hours = Math.round(Math.max(12, Math.min(96, 12 + load * 0.4)));   // 12–96h from load
  return { last, load, basis: r && r.basis, hours, recoveredAt: endMs + hours * 3600000 };
}

// Suggested next workout from current form (TSB) and whether you've recovered.
function _trNextWorkout(tsb, recovered, id) {
  if (!recovered) return id ? 'Istirahat atau gowes Zona-2 ringan (≤1 jam) sampai Anda pulih.' : 'Rest or an easy Zone-2 spin (≤1h) until you are recovered.';
  if (tsb >= 5)   return id ? 'Hari yang bagus untuk interval, gowes grup keras, atau percobaan PR.' : 'Good day for intervals, a hard group ride, or a PR attempt.';
  if (tsb >= -10) return id ? 'Gowes ketahanan atau sesi tempo yang mantap.' : 'A solid endurance ride or a tempo session.';
  return id ? 'Tetap ringan — gowes pemulihan atau istirahat penuh.' : 'Keep it easy — a recovery ride or a full rest day.';
}

function _trRecoveryCardHTML(d) {
  const s = _trLastSession();
  if (!s) return '';
  const a = s.last, now = Date.now(), id = window.LANG === 'id';
  const meta = [
    a.distance ? fmtD(a.distance) : null,
    (a.moving_time || a.elapsed_time) ? fmtT(a.moving_time || a.elapsed_time) : null,
    (id ? 'Beban ' : 'Load ') + Math.round(s.load),
  ].filter(Boolean).join(' · ');

  const recovered = s.recoveredAt <= now || d.tsb >= 5;
  let recLine, recColor;
  if (recovered) {
    recColor = '#22c55e';
    recLine = id ? 'Sudah pulih — siap gowes keras sekarang. 💪' : "Recovered — you're good for a hard ride now. 💪";
  } else {
    recColor = '#fb923c';
    const when = new Date(s.recoveredAt).toLocaleString(id ? 'id-ID' : 'en-US',
      { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const remH = (s.recoveredAt - now) / 3600000;
    const inStr = remH < 36 ? `~${Math.round(remH)}${id ? ' jam' : 'h'}` : `~${Math.round(remH / 24)}${id ? ' hari' : 'd'}`;
    recLine = id ? `Siap sesi berat pada <strong>${when}</strong> (${inStr} lagi)` : `Ready for a hard session at <strong>${when}</strong> (in ${inStr})`;
  }

  const lbl = t => `<div class="tr-rv-lbl">${t}</div>`;
  return `
    <div class="card tr-rv">
      <div class="tr-chart-title">${id ? 'Pemulihan & Gowes Berikutnya' : 'Recovery & Next Ride'}</div>
      <div class="tr-rv-grid">
        <div class="tr-rv-block">
          ${lbl(id ? 'Latihan terakhir' : 'Last workout')}
          <div class="tr-rv-name">${a.name || (id ? 'Aktivitas' : 'Activity')}</div>
          <div class="tr-rv-meta">${fmtDt(a.start_date_local || a.start_date)} · ${meta}</div>
        </div>
        <div class="tr-rv-block">
          ${lbl(id ? 'Bisa gowes keras lagi' : 'Hard ride again')}
          <div class="tr-rv-rec" style="color:${recColor}">${recLine}</div>
          <div class="tr-rv-note">${id ? 'Gowes pemulihan ringan: kapan saja.' : 'Easy recovery spin: anytime.'}</div>
        </div>
        <div class="tr-rv-block">
          ${lbl(id ? 'Saran latihan berikutnya' : 'Suggested next workout')}
          <div class="tr-rv-next">${_trNextWorkout(d.tsb, recovered, id)}</div>
        </div>
      </div>
    </div>`;
}

/* ── CONSISTENCY SCORE ───────────────────────────────────────────────────────
   Regularity over raw mileage. Window = last 12 weeks (capped to how long the
   athlete has been riding). Consistency % rewards hitting a weekly ride target. */
function _trMondayOf(key) {
  const d = new Date(key + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;           // 0 = Monday
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

function _trConsistency() {
  if (typeof acts === 'undefined' || !acts.length) return null;
  const rides = acts.filter(a => isRide(a) && _trDayKey(a));
  if (!rides.length) return null;

  const today = _trToday();
  const curMon = _trMondayOf(today);
  const weekAgo = key => Math.round(
    (new Date(curMon + 'T00:00:00Z') - new Date(_trMondayOf(key) + 'T00:00:00Z')) / (7 * 86400000)
  );

  const perWeek = {};
  const daySet = new Set();
  let firstKey = null;
  for (const a of rides) {
    const k = _trDayKey(a);
    daySet.add(k);
    if (!firstKey || k < firstKey) firstKey = k;
    const w = weekAgo(k);
    if (w >= 0) perWeek[w] = (perWeek[w] || 0) + 1;
  }

  const target = 3;
  const WIN = Math.min(12, weekAgo(firstKey) + 1);   // don't punish a short history
  let sum = 0, weeksWith = 0, missed = 0;
  const weeks = [];                                   // oldest → newest, for the strip
  for (let w = WIN - 1; w >= 0; w--) {
    const n = perWeek[w] || 0;
    sum += Math.min(n / target, 1);
    if (n >= target) weeksWith++;
    if (n === 0) missed++;
    weeks.push(n);
  }
  const consistency = Math.round(sum / WIN * 100);

  // Days ridden in the current calendar month.
  const monthPrefix = today.slice(0, 7);
  const daysThisMonth = [...daySet].filter(k => k.slice(0, 7) === monthPrefix).length;
  const dayOfMonth = parseInt(today.slice(8, 10), 10);

  // Longest consecutive-day riding streak across loaded history.
  const sorted = [...daySet].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of sorted) {
    run = (prev && _trAddDays(prev, 1) === k) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = k;
  }

  return { consistency, weeksWith, missed, WIN, daysThisMonth, dayOfMonth, longest, target, weeks };
}

function _trConsColor(pct) {
  return pct >= 80 ? '#22c55e' : pct >= 60 ? '#fb923c' : '#ef4444';
}

function _trConsistencyHTML() {
  const c = _trConsistency();
  if (!c) return '';
  const col = _trConsColor(c.consistency);
  const stat = (val, lbl, sub) => `
    <div class="tr-cons-stat">
      <div class="tr-cons-stat-val">${val}</div>
      <div class="tr-cons-stat-lbl">${lbl}</div>
      ${sub ? `<div class="tr-cons-stat-sub">${sub}</div>` : ''}
    </div>`;
  const bars = c.weeks.map(n => {
    const color = n >= c.target ? '#22c55e' : n > 0 ? '#fb923c' : 'var(--surface3, #2a2a2a)';
    const h = Math.max(8, Math.min(n, 5) / 5 * 100);
    return `<span class="tr-week-bar" title="${trf('{0} {1}', n, tr(n === 1 ? 'ride' : 'rides'))}"><span style="height:${h}%;background:${color}"></span></span>`;
  }).join('');

  return `
    <div class="card tr-cons">
      <div class="tr-chart-title">${trf('Consistency — last {0} {1}', c.WIN, tr(c.WIN === 1 ? 'week' : 'weeks'))}</div>
      <div class="tr-cons-grid">
        <div class="tr-cons-score">
          <div class="tr-cons-pct" style="color:${col}">${c.consistency}<span>%</span></div>
          <div class="tr-cons-cap">${tr('consistency')}</div>
          <div class="tr-week-strip">${bars}</div>
        </div>
        <div class="tr-cons-stats">
          ${stat(c.daysThisMonth, tr('Days ridden'), trf('this month · {0} elapsed', c.dayOfMonth))}
          ${stat(c.longest, tr('Longest streak'), tr('consecutive days'))}
          ${stat(c.weeksWith + '<span class="tr-cons-of">/' + c.WIN + '</span>', tr('Weeks ≥3 rides'), tr('hit the target'))}
          ${stat(c.missed, tr('Missed weeks'), tr('zero rides'))}
        </div>
      </div>
    </div>`;
}

/* ── FTP / THRESHOLD CARD ────────────────────────────────────────────────────
   Promotes estimateFtp() into a proper card: watts, W/kg, an approximate
   ability band, and the basis (Strava-set / power estimate / weight estimate). */
function _trWkgLabel(wkg) {
  if (wkg >= 5.0) return tr('Elite');
  if (wkg >= 4.0) return tr('Excellent');
  if (wkg >= 3.3) return tr('Very good');
  if (wkg >= 2.7) return tr('Good');
  if (wkg >= 2.0) return tr('Moderate');
  return tr('Building');
}

// FTP trend: best ≥20-min normalized power per quarter × 0.95 (same basis as
// estimateFtp), so you can see the estimate move over time. Power rides only.
function _trFtpTrend() {
  const rides = acts.filter(a => isRide(a) && (a.moving_time || 0) >= 1200 && (a.weighted_average_watts > 0 || a.average_watts > 0));
  if (rides.length < 4) return null;
  const q = {};
  rides.forEach(a => {
    const ds = (a.start_date_local || a.start_date || ''); if (!ds) return;
    const key = ds.slice(0, 4) + '-Q' + (Math.floor((+ds.slice(5, 7) - 1) / 3) + 1);
    const np = a.weighted_average_watts || a.average_watts;
    if (!q[key] || np > q[key]) q[key] = np;
  });
  const keys = Object.keys(q).sort();
  if (keys.length < 2) return null;
  const rows = keys.slice(-8).map(k => ({ q: k, ftp: Math.round(q[k] * 0.95) }));
  return { rows, delta: rows[rows.length - 1].ftp - rows[0].ftp };
}

function _trFtpTrendHTML() {
  const t = _trFtpTrend();
  if (!t) return '';
  const maxF = Math.max(...t.rows.map(r => r.ftp), 1);
  const bars = t.rows.map(r => `<div class="ftpt-col">
    <span class="ftpt-v">${r.ftp}</span>
    <span class="ftpt-bar" style="height:${Math.max(8, Math.round(r.ftp / maxF * 100))}%"></span>
    <span class="ftpt-q">${r.q.replace('-', ' ')}</span>
  </div>`).join('');
  const trend = t.delta > 0 ? `<span style="color:#22c55e">▲ +${t.delta} W</span>` : t.delta < 0 ? `<span style="color:#ef4444">▼ ${t.delta} W</span>` : tr('flat');
  return `<div class="card tr-ftpt">
    <div class="tr-chart-title">${tr('Estimated FTP Trend')}</div>
    <div class="tr-trend-sub">${trf('{0} over {1} quarters, from your best ≥20-min normalized power × 0.95.', trend, t.rows.length)}</div>
    <div class="ftpt-strip">${bars}</div>
  </div>`;
}

function _trFtpCardHTML(ftpEst) {
  if (!ftpEst) return '';
  const ath = (typeof currentAthlete !== 'undefined' && currentAthlete) || {};
  const weight = athWeightKg();                       // kg (Strava profile, else fallback)
  const wkg = weight > 0 ? ftpEst.value / weight : 0;
  const basisText = ftpEst.basis === 'strava'
    ? tr('From your Strava profile FTP.')
    : ftpEst.basis === 'power'
      ? tr('Estimated from your best sustained power (≈20-min effort × 0.95).')
      : tr('Estimated from body weight (~2.5 W/kg baseline) — add power data for a sharper number.');
  const name = [ath.firstname, ath.lastname].filter(Boolean).join(' ');
  const vo2 = (typeof estimateVo2max === 'function') ? estimateVo2max() : null;

  return `
    <div class="card tr-ftp">
      <div class="tr-ftp-main">
        <div class="tr-ftp-num">${ftpEst.value}<span class="tr-ftp-unit">W</span></div>
        <div class="tr-ftp-meta">
          <div class="tr-ftp-title">Functional Threshold Power${ftpEst.estimated ? ' <span class="tr-ftp-est">est.</span>' : ''}</div>
          <div class="tr-ftp-basis">${name ? name + ' · ' : ''}${basisText}</div>
        </div>
      </div>
      <div class="tr-ftp-wkg">
        <div class="tr-ftp-wkg-val">${wkg.toFixed(1)}<span>W/kg</span></div>
        <div class="tr-ftp-wkg-band">${_trWkgLabel(wkg)}</div>
      </div>
      ${vo2 ? `
      <div class="tr-ftp-wkg tr-ftp-vo2">
        <div class="tr-ftp-wkg-val">${vo2.value}<span>VO₂max</span></div>
        <div class="tr-ftp-wkg-band">ml/kg/min · ${tr('est.')}</div>
      </div>` : ''}
    </div>`;
}

/* ── FITNESS TREND (ZONE-2) / SEASONAL / SIMILAR RIDE ─────────────────────────
   Three list-data insight cards, no extra API calls. */

const _TR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _trMonthLabel(ym) { const [y, m] = ym.split('-'); return `${_TR_MON[(+m) - 1]} ${y}`; }
function _trOrdinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// Fitness Trend: avg power & speed on Zone-2 (aerobic) rides over time.
function _trZone2Trend() {
  if (typeof hrZoneFor !== 'function') return null;
  const rides = acts.filter(a => isRide(a) && a.average_heartrate > 0 && a.average_speed > 0);
  const z2 = rides.filter(a => { const z = hrZoneFor(a.average_heartrate); return z && z.n === 2; });
  if (z2.length < 3) return null;
  z2.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const recent = z2.slice(-15);
  const months = {};
  recent.forEach(a => {
    const m = (a.start_date_local || a.start_date || '').slice(0, 7);
    const g = months[m] || (months[m] = { n: 0, spd: 0, w: 0, wn: 0 });
    g.n++; g.spd += a.average_speed;
    if (a.average_watts > 0) { g.w += a.average_watts; g.wn++; }
  });
  const rows = Object.keys(months).sort().map(m => {
    const g = months[m];
    return { month: m, kmh: kmh(g.spd / g.n), w: g.wn ? Math.round(g.w / g.wn) : null, n: g.n };
  });
  if (rows.length < 2) return null;
  const first = rows[0], last = rows[rows.length - 1];
  const spdDelta = +(last.kmh - first.kmh).toFixed(1);
  return { rows, count: recent.length, spdDelta };
}

// Seasonal Insights: best year/month, YTD vs last year, this-month strength.
function _trSeasonal() {
  const rides = acts.filter(isRide);
  if (rides.length < 8) return null;
  const today = _trToday();
  const yr = +today.slice(0, 4), md = today.slice(5); // MM-DD cutoff
  const byYear = {}, byMonth = {};
  rides.forEach(a => {
    const ds = (a.start_date_local || a.start_date || ''); if (!ds) return;
    const y = ds.slice(0, 4), m = ds.slice(0, 7);
    (byYear[y] = byYear[y] || { dist: 0 }).dist += a.distance || 0;
    const g = (byMonth[m] = byMonth[m] || { dist: 0, spd: 0, n: 0 });
    g.dist += a.distance || 0; if (a.average_speed > 0) { g.spd += a.average_speed; g.n++; }
  });
  // best year / best month by distance
  const bestYear = Object.keys(byYear).sort((a, b) => byYear[b].dist - byYear[a].dist)[0];
  const bestMonth = Object.keys(byMonth).sort((a, b) => byMonth[b].dist - byMonth[a].dist)[0];
  // YTD (Jan 1 → today's MM-DD) this year vs last year
  const ytd = y => rides.reduce((s, a) => { const ds = (a.start_date_local || a.start_date || ''); return (ds.slice(0, 4) == y && ds.slice(5, 10) <= md) ? s + (a.distance || 0) : s; }, 0);
  const ytdNow = ytd(yr), ytdPrev = ytd(yr - 1);
  const ytdPct = ytdPrev > 0 ? Math.round((ytdNow - ytdPrev) / ytdPrev * 100) : null;
  // this calendar month avg speed vs same month last year
  const curM = today.slice(0, 7), prevM = (yr - 1) + today.slice(4, 7);
  const avgKmh = m => (byMonth[m] && byMonth[m].n) ? kmh(byMonth[m].spd / byMonth[m].n) : null;
  const spdNow = avgKmh(curM), spdPrev = avgKmh(prevM);
  const spdDelta = (spdNow != null && spdPrev != null) ? +(spdNow - spdPrev).toFixed(1) : null;
  return {
    bestYear, bestYearKm: byYear[bestYear].dist,
    bestMonth, bestMonthKm: byMonth[bestMonth].dist,
    ytdNow, ytdPct, curMonthName: _TR_MON[+today.slice(5, 7) - 1], spdDelta,
  };
}

// Similar Ride: rank the latest ride among past rides of similar distance/elevation.
function _trSimilar() {
  const rides = acts.filter(a => isRide(a) && a.distance > 0)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  if (rides.length < 4) return null;
  const cur = rides[0], curElev = cur.total_elevation_gain || 0;
  const similar = rides.slice(1).filter(a => {
    if (Math.abs((a.distance - cur.distance) / cur.distance) > 0.15) return false;
    if (curElev > 50) { const er = Math.abs(((a.total_elevation_gain || 0) - curElev) / curElev); if (er > 0.4) return false; }
    return true;
  }).slice(0, 12);
  if (similar.length < 2) return null;
  const pool = [cur, ...similar];
  const rank = (val, key, desc) => {
    const arr = pool.map(x => x[key] || 0).sort((a, b) => desc ? b - a : a - b);
    return arr.indexOf(val) + 1;
  };
  return {
    cur, n: similar.length, total: pool.length,
    spdRank: rank(cur.average_speed || 0, 'average_speed', true),
    hrRank: cur.average_heartrate ? rank(cur.average_heartrate, 'average_heartrate', false) : null,
    climbRank: rank(curElev, 'total_elevation_gain', true),
  };
}

// Climbing Ability: ride-level climbing rate, gradient, best VAM.
function _trClimbing() {
  const rides = acts.filter(a => isRide(a) && a.moving_time > 0 && a.distance > 0);
  if (rides.length < 3) return null;
  let totElev = 0, totTime = 0, totDist = 0, bestVam = null;
  rides.forEach(a => {
    const elev = a.total_elevation_gain || 0, hrs = a.moving_time / 3600;
    totElev += elev; totTime += a.moving_time; totDist += a.distance;
    const grad = elev / a.distance;
    if (hrs >= 0.5 && grad >= 0.015) { const vam = elev / hrs; if (!bestVam || vam > bestVam.vam) bestVam = { vam, a }; }
  });
  return {
    mPerHour: totTime > 0 ? totElev / (totTime / 3600) : 0,
    avgGrad: totDist > 0 ? totElev / totDist * 100 : 0,
    elevPerKm: totDist > 0 ? totElev / (totDist / 1000) : 0,
    bestVam,
  };
}

// Personal Records Explorer: fun bests from list data (weather-based ones need
// the 🌦 upgrade). Each record → {label, value, ride, date} or null when absent.
function _trPRRecords() {
  const rides = acts.filter(isRide);
  if (rides.length < 3) return null;
  const maxBy = (f, filter) => { let best = null, bv = -Infinity; rides.forEach(a => { if (filter && !filter(a)) return; const v = f(a); if (v > bv) { bv = v; best = a; } }); return best; };
  const minBy = (f, filter) => { let best = null, bv = Infinity; rides.forEach(a => { if (filter && !filter(a)) return; const v = f(a); if (v < bv) { bv = v; best = a; } }); return best; };
  const z2 = a => { const z = (typeof hrZoneFor === 'function') && a.average_heartrate > 0 && hrZoneFor(a.average_heartrate); return z && z.n === 2; };
  const rec = (label, a, val) => a ? { label, value: val, name: a.name || 'Ride', date: a.start_date } : null;

  const list = [
    rec(tr('Longest ride'), maxBy(a => a.distance || 0), a => fmtD(a.distance)),
    rec(tr('Biggest climbing day'), maxBy(a => a.total_elevation_gain || 0), a => fmtElev(a.total_elevation_gain || 0)),
    rec(tr('Fastest century'), maxBy(a => a.average_speed || 0, a => a.distance >= 100000), a => fmtSpeed(a.average_speed)),
    rec(tr('Longest Zone-2 ride'), maxBy(a => a.moving_time || 0, z2), a => fmtT(a.moving_time)),
    rec(tr('Highest avg cadence'), maxBy(a => a.average_cadence || 0, a => a.average_cadence > 0), a => Math.round(a.average_cadence) + ' rpm'),
    rec(tr('Highest avg power'), maxBy(a => a.average_watts || 0, a => a.average_watts > 0), a => Math.round(a.average_watts) + ' W'),
    rec(tr('Hottest ride'), maxBy(a => a.average_temp != null ? a.average_temp : -999, a => a.average_temp != null), a => Math.round(a.average_temp) + '°C'),
    rec(tr('Coldest ride'), minBy(a => a.average_temp != null ? a.average_temp : 999, a => a.average_temp != null), a => Math.round(a.average_temp) + '°C'),
  ].filter(Boolean);
  // resolve value fns
  return list.map(r => ({ label: r.label, name: r.name, date: r.date, value: r.value(rides.find(a => (a.name || 'Ride') === r.name && a.start_date === r.date) || {}) }));
}

// Ride Quality Score: latest ride scored 0–100 by percentile vs the athlete's
// own ride history (endurance / climbing / efficiency / effort).
function _trRideQuality() {
  const rides = acts.filter(a => isRide(a) && a.moving_time > 0);
  if (rides.length < 8) return null;
  const cur = rides.slice().sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0];
  const pct = (val, arr) => { const s = arr.filter(v => v > 0).sort((a, b) => a - b); if (!s.length) return null; let c = 0; s.forEach(v => { if (v <= val) c++; }); return c / s.length; };
  const endurance = pct(cur.moving_time || 0, rides.map(a => a.moving_time || 0));
  const climbing = pct(cur.total_elevation_gain || 0, rides.map(a => a.total_elevation_gain || 0));
  const efficiency = pct(cur.average_speed || 0, rides.map(a => a.average_speed || 0));
  const effVal = cur.suffer_score || cur.average_heartrate || 0;
  const effort = effVal ? pct(effVal, rides.map(a => a.suffer_score || a.average_heartrate || 0)) : null;
  const parts = [endurance, climbing, efficiency, effort].filter(v => v != null);
  const overall = Math.round(parts.reduce((s, v) => s + v, 0) / parts.length * 100);
  const s10 = v => v == null ? null : +(v * 10).toFixed(1);
  return { cur, overall, endurance: s10(endurance), climbing: s10(climbing), efficiency: s10(efficiency), effort: s10(effort) };
}

function _trTrendsHTML() {
  let html = '';

  // Climbing Ability
  const cl = _trClimbing();
  if (cl) {
    const tile = (val, unit, lbl, sub) => `<div class="tr-seas-tile"><div class="tr-seas-val">${val}<span style="font-size:13px;font-weight:700;color:var(--muted);margin-left:2px">${unit}</span></div><div class="tr-seas-lbl">${lbl}</div>${sub ? `<div class="tr-tile-sub">${sub}</div>` : ''}</div>`;
    html += `<div class="card tr-seas">
      <div class="tr-chart-title">${tr('Climbing Ability')}</div>
      <div class="tr-seas-grid">
        ${tile(Math.round(cl.mPerHour), 'm/h', tr('Climb rate'), tr('elevation per moving hour'))}
        ${tile(cl.avgGrad.toFixed(1), '%', tr('Avg gradient'), tr('net climb over distance'))}
        ${tile(Math.round(cl.elevPerKm), 'm/' + distUnit(), tr('Elevation density'), trf('climb per {0}', distUnit()))}
        ${cl.bestVam ? tile(Math.round(cl.bestVam.vam), 'VAM', tr('Best ride'), (cl.bestVam.a.name || 'Ride')) : tile('—', '', tr('Best VAM'), tr('no sustained climbs'))}
      </div>
      <div class="tr-basis-note">${tr('Ride-level estimate — per-climb VAM from GPS streams is a future upgrade.')}</div>
    </div>`;
  }

  // Fitness Trend

  // Fitness Trend
  const ft = _trZone2Trend();
  if (ft) {
    const rows = ft.rows.map(r => `<tr>
      <td>${_trMonthLabel(r.month)}</td><td>${r.n}</td>
      <td>${r.w != null ? r.w + ' W' : '—'}</td><td>${r.kmh.toFixed(1)} ${speedUnit()}</td>
    </tr>`).join('');
    const trend = ft.spdDelta > 0 ? `<span style="color:#22c55e">▲ +${ft.spdDelta} ${speedUnit()}</span> ${tr('at the same aerobic effort')}`
      : ft.spdDelta < 0 ? `<span style="color:#ef4444">▼ ${ft.spdDelta} ${speedUnit()}</span> ${tr('at the same aerobic effort')}`
      : tr('holding steady at the same aerobic effort');
    html += `<div class="card tr-trend">
      <div class="tr-chart-title">${trf('Fitness Trend — last {0} Zone-2 rides', ft.count)}</div>
      <div class="tr-trend-sub">${trf('Speed on easy aerobic rides {0}. Rising numbers at Zone 2 signal real fitness gains.', trend)}</div>
      <div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>${tr('Month')}</th><th>${tr('Rides')}</th><th>${tr('Avg power')}</th><th>${tr('Avg speed')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
    html += _trNote('Fitness Trend (Zone 2)');
  }

  // Seasonal Insights
  const se = _trSeasonal();
  if (se) {
    const tile = (val, lbl, color) => `<div class="tr-seas-tile"><div class="tr-seas-val" style="color:${color || 'var(--text)'}">${val}</div><div class="tr-seas-lbl">${lbl}</div></div>`;
    const ytdCol = se.ytdPct == null ? 'var(--text)' : se.ytdPct >= 0 ? '#22c55e' : '#ef4444';
    const ytdVal = se.ytdPct == null ? '—' : (se.ytdPct >= 0 ? '+' : '') + se.ytdPct + '%';
    const spdCol = se.spdDelta == null ? 'var(--text)' : se.spdDelta >= 0 ? '#22c55e' : '#ef4444';
    const spdVal = se.spdDelta == null ? '—' : (se.spdDelta >= 0 ? '+' : '') + se.spdDelta + ' ' + speedUnit();
    html += `<div class="card tr-seas">
      <div class="tr-chart-title">${tr('Seasonal Insights')}</div>
      <div class="tr-seas-grid">
        ${tile(Math.round(kmVal(se.bestYearKm)).toLocaleString() + ' ' + distUnit(), trf('Biggest year · {0}', se.bestYear), 'var(--orange)')}
        ${tile(Math.round(kmVal(se.bestMonthKm)).toLocaleString() + ' ' + distUnit(), trf('Biggest month · {0}', _trMonthLabel(se.bestMonth)))}
        ${tile(ytdVal, tr('Distance vs same point last year'), ytdCol)}
        ${tile(spdVal, trf('{0} avg speed vs last year', se.curMonthName), spdCol)}
      </div>
    </div>`;
  }

  // Personal Records Explorer
  const pr = _trPRRecords();
  if (pr && pr.length) {
    const tiles = pr.map(r => `<div class="tr-pr-tile">
      <div class="tr-pr-val">${r.value}</div>
      <div class="tr-pr-lbl">${r.label}</div>
      <div class="tr-pr-ride">${r.name} · ${fmtDt(r.date)}</div>
    </div>`).join('');
    html += `<div class="card tr-seas">
      <div class="tr-chart-title">${tr('Personal Records Explorer')}</div>
      <div class="tr-pr-grid">${tiles}</div>
    </div>`;
  }

  // Ride Quality Score
  const rq = _trRideQuality();
  if (rq) {
    const col = rq.overall >= 80 ? '#22c55e' : rq.overall >= 60 ? '#fb923c' : '#ef4444';
    const bar = (lbl, v) => v == null ? '' : `<div class="tr-rq-row">
      <span class="tr-rq-lbl">${lbl}</span>
      <span class="tr-rq-track"><span style="width:${v * 10}%;background:${col}"></span></span>
      <span class="tr-rq-num">${v.toFixed(1)}</span>
    </div>`;
    html += `<div class="card tr-rq">
      <div class="tr-chart-title">${tr('Ride Quality Score — latest ride')}</div>
      <div class="tr-rq-grid">
        <div class="tr-rq-overall">
          <div class="tr-rq-big" style="color:${col}">${rq.overall}<span>/100</span></div>
          <div class="tr-rq-name">${rq.cur.name || 'Ride'}</div>
        </div>
        <div class="tr-rq-bars">
          ${bar(tr('Endurance'), rq.endurance)}
          ${bar(tr('Climbing'), rq.climbing)}
          ${bar(tr('Efficiency'), rq.efficiency)}
          ${bar(tr('Effort'), rq.effort)}
        </div>
      </div>
      <div class="tr-basis-note">${tr("Each dimension is this ride's percentile against your own ride history.")}</div>
    </div>`;
  }

  // Similar Ride
  const si = _trSimilar();
  if (si) {
    const ord = rank => window.LANG === 'id' ? 'ke-' + rank : _trOrdinal(rank);
    const chip = (rank, total, best, word) => `<span class="tr-sim-chip${rank === 1 ? ' tr-sim-best' : ''}">${rank === 1 ? best : ord(rank) + ' ' + word} <span class="tr-sim-of">${trf('of {0}', total)}</span></span>`;
    const chips = [
      chip(si.spdRank, si.total, tr('Fastest'), tr('fastest')),
      si.hrRank ? chip(si.hrRank, si.total, tr('Lowest HR'), tr('lowest HR')) : '',
      chip(si.climbRank, si.total, tr('Most climbing'), tr('most climbing')),
    ].filter(Boolean).join('');
    const simName = `<b>${si.cur.name || 'Ride'}</b>`;
    html += `<div class="card tr-sim">
      <div class="tr-chart-title">${tr('Similar Ride Comparison')}</div>
      <div class="tr-sim-head">${trf('Your latest ride — {0} · {1}, {2} — vs {3} similar past {4}:', simName, fmtD(si.cur.distance), fmtElev(si.cur.total_elevation_gain || 0), si.n, tr(si.n === 1 ? 'ride' : 'rides'))}</div>
      <div class="tr-sim-chips">${chips}</div>
    </div>`;
  }
  return html;
}

function renderTraining() {
  const sec = document.getElementById('trainingSection');
  if (!sec) return;
  const body = document.getElementById('trainingBody');
  if (!body) return;

  const d = _trBuildSeries();
  if (!d) { body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">' + tr('Load your activities to see training load & fatigue.') + '</div>'; return; }

  const band = _trFormBand(d.tsb, d.ramp);
  const tsbStr = (d.tsb >= 0 ? '+' : '') + Math.round(d.tsb);
  const rampStr = (d.ramp >= 0 ? '+' : '') + Math.round(d.ramp);

  const tile = (val, unit, lbl, color, sub) => `
    <div class="tr-tile card">
      <div class="tr-tile-val" style="color:${color || 'var(--text)'}">${val}<span class="tr-tile-unit">${unit || ''}</span></div>
      <div class="tr-tile-lbl">${lbl}</div>
      ${sub ? `<div class="tr-tile-sub">${sub}</div>` : ''}
    </div>`;

  body.innerHTML = `
    ${whoopRowHTML(false)}
    ${_trIntroHTML(d)}
    ${_trFtpCardHTML(d.ftpEst)}
    ${_trFtpTrendHTML()}
    ${_trNote('FTP & W/kg')}
    <div class="tr-tiles">
      ${tile(Math.round(d.ctl), '', tr('Fitness · CTL'), 'var(--orange)', tr('42-day load'))}
      ${tile(Math.round(d.atl), '', tr('Fatigue · ATL'), '#a78bfa', tr('7-day load'))}
      ${tile(tsbStr, '', tr('Form · TSB'), band.color, `<span style="color:${band.color};font-weight:700">${band.label}</span>`)}
      ${tile(rampStr, '/wk', tr('Ramp rate'), d.ramp > 8 ? '#ef4444' : 'var(--text)', tr('CTL change, 7d'))}
    </div>
    <div class="tr-note">${window.LANG === 'id'
      ? '<b>Fitness (CTL)</b> = bentuk jangka panjang Anda. <b>Fatigue (ATL)</b> = kelelahan jangka pendek. <b>Form (TSB)</b> = Fitness − Fatigue, yaitu kesegaran Anda (positif = segar). <b>Ramp</b> = seberapa cepat fitness berubah tiap minggu.'
      : '<b>Fitness (CTL)</b> is your long-term form. <b>Fatigue (ATL)</b> is short-term tiredness. <b>Form (TSB)</b> = Fitness − Fatigue, your freshness (positive = fresh). <b>Ramp</b> is how fast fitness is changing per week.'}</div>

    <div class="tr-rec card">
      <div class="tr-rec-head">
        <span class="tr-rec-dot" style="background:${band.color}"></span>
        <span>${tr('Recovery recommendation')}</span>
        <button id="trAiBtn" class="tr-ai-btn" onclick="trainingAiRec()">${(typeof AI_ICON !== 'undefined' ? AI_ICON : '')}${tr('Get AI plan')}</button>
      </div>
      <div class="tr-rec-body">${band.advice}</div>
      <div id="trAiOut" class="tr-ai-out" style="display:none"></div>
    </div>

    ${_trRecoveryCardHTML(d)}
    ${_trNote('Recovery & Next Ride')}

    <div class="card" style="padding:16px">
      <div class="tr-chart-title">${tr('Performance Management Chart')}</div>
      <div style="height:300px"><canvas id="trPmcChart"></canvas></div>
      <div class="tr-basis-note">${tr('Daily load basis: ')}${_trBasisNote(d.basis)}${d.ftpEst ? ` · FTP ${d.ftpEst.value}w${d.ftpEst.estimated ? tr(' (est.)') : ''}` : ''}</div>
    </div>
    ${_trNote('Performance Management Chart')}

    ${_trConsistencyHTML()}
    ${_trNote('Consistency')}
    ${_trTrendsHTML()}
    ${typeof _trPowerCurveHTML === 'function' ? _trPowerCurveHTML() : ''}
    ${typeof _trHrDecouplingHTML === 'function' ? _trHrDecouplingHTML() : ''}
    ${typeof _trTimeLostHTML === 'function' ? _trTimeLostHTML() : ''}
    ${typeof _trWindHTML === 'function' ? _trWindHTML() : ''}
    ${typeof _trSegIntelHTML === 'function' ? _trSegIntelHTML() : ''}`;

  _trDrawChart(d.series);
  // Always surface an AI plan: show the saved one, else auto-generate it once
  // (which then caches to localStorage so it isn't re-run every visit).
  if (!_trRestoreAiPlan() && !_trAiAutoTried && typeof trainingAiRec === 'function') {
    _trAiAutoTried = true;
    trainingAiRec();
  }

  // Auto-run the cheap latest-ride analyses so there's no "Analyse" button to
  // press. Power Curve & Segment Intel stay manual — they fetch streams for
  // every ride/effort and would blow Strava's rate limit on each page view.
  if (typeof analyzeWind === 'function') analyzeWind();
  if (typeof analyzeTimeLost === 'function') analyzeTimeLost();
  if (typeof analyzeHrDecoupling === 'function') analyzeHrDecoupling();
}

// Draw the CTL / ATL / TSB chart (last ~180 days) with Chart.js.
function _trDrawChart(series) {
  if (typeof Chart === 'undefined') return;
  destroyChart('trPmc');
  const view = series.slice(-180);
  const labels = view.map(p => p.date);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const orange = css('--orange') || '#fc4c02';
  const ctx = document.getElementById('trPmcChart');
  if (!ctx) return;
  charts['trPmc'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: tr('Fitness (CTL)'), data: view.map(p => +p.ctl.toFixed(1)), borderColor: orange, backgroundColor: 'rgba(252,76,2,.12)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.25, yAxisID: 'y' },
        { label: tr('Fatigue (ATL)'), data: view.map(p => +p.atl.toFixed(1)), borderColor: '#a78bfa', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, pointRadius: 0, tension: 0.25, yAxisID: 'y' },
        { label: tr('Form (TSB)'), data: view.map(p => +p.tsb.toFixed(1)), borderColor: '#22c55e', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.25, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: '#888', font: { size: 11 }, boxWidth: 12, usePointStyle: true } },
        tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa' },
      },
      scales: {
        x: { grid: { color: '#1c1c1c' }, ticks: { color: '#555', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 } },
        y: { position: 'left', grid: { color: '#1c1c1c' }, ticks: { color: '#666', font: { size: 10 } }, title: { display: true, text: tr('Load'), color: '#666', font: { size: 10 } } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#22c55e', font: { size: 10 } }, title: { display: true, text: tr('Form'), color: '#22c55e', font: { size: 10 } } },
      },
    },
  });
}

/* Restore a previously generated AI plan so it survives re-renders / reloads
   instead of regenerating (and re-spending tokens) every visit. Returns true
   when a cached plan was shown. */
function _trRestoreAiPlan() {
  const out = document.getElementById('trAiOut');
  if (!out) return false;
  let saved; try { saved = JSON.parse(localStorage.getItem('tr_ai_plan') || 'null'); } catch {}
  if (saved && saved.html) { out.innerHTML = saved.html; out.style.display = ''; return true; }
  return false;
}
let _trAiAutoTried = false;  // generate the AI plan at most once per session

/* ── AI recovery plan (owner-gated /api/ai, rule-based text is the fallback) ── */
async function trainingAiRec() {
  const out = document.getElementById('trAiOut');
  const btn = document.getElementById('trAiBtn');
  if (!out) return;
  const d = _trBuildSeries();
  if (!d) return;
  const token = localStorage.getItem('strava_access_token');
  if (!token) { out.style.display = ''; out.innerHTML = tr('Connect Strava to use the AI coach.'); return; }

  if (btn) btn.disabled = true;
  out.style.display = '';
  out.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';

  const recent = d.series.slice(-14).map(p => Math.round(p.load));
  const payload = {
    fitness_ctl: Math.round(d.ctl), fatigue_atl: Math.round(d.atl),
    form_tsb: Math.round(d.tsb), ramp_rate_per_week: Math.round(d.ramp),
    daily_load_last_14: recent,
  };
  const { provider, model, key } = (typeof aiProviderModel === 'function') ? aiProviderModel() : { provider: 'deepseek' };
  const replyLang = window.LANG === 'id' ? 'Reply in Indonesian (Bahasa Indonesia)' : 'Reply in English';
  const messages = [
    { role: 'system', content:
      'You are a concise endurance-cycling coach. Using ONLY the training-load numbers provided (TrainingPeaks model: CTL=fitness, ATL=fatigue, TSB=form/freshness, ramp=weekly CTL change), give a short, specific recovery-and-training recommendation for the next 3–5 days. Note overreaching risk if ramp is high or TSB very negative. Never invent data. ' + replyLang + ', short markdown, under 120 words.' },
    { role: 'user', content: 'My current training load:\n' + JSON.stringify(payload, null, 2) },
  ];
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model, key }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.text) {
      out.innerHTML = (typeof aiMd === 'function' ? aiMd(data.text) : data.text);
      try { localStorage.setItem('tr_ai_plan', JSON.stringify({ html: out.innerHTML, ts: Date.now() })); } catch {}
    } else {
      // Surface the real reason (no key, out of credit, not authorized, …) plus
      // a note that the rule-based advice above still stands.
      const why = (typeof aiErrorMessage === 'function') ? aiErrorMessage(data, r.status) : tr("Couldn't reach the AI coach right now.");
      out.innerHTML = why + '<br><span style="color:var(--muted)">' + tr('The guidance above is rule-based from your numbers.') + '</span>';
    }
  } catch {
    out.innerHTML = tr("Couldn't reach the AI coach right now. The guidance above is rule-based from your numbers.");
  }
  if (btn) btn.disabled = false;
}

/* ── RECOVERY & STRAIN (WHOOP-style) ─────────────────────────────────────────
   WHOOP derives recovery from HRV, resting HR and sleep. Strava exposes none of
   those, so these are honest proxies built from the PMC model above:

     Recovery %  — a logistic curve over TSB (form). TSB is fitness minus
                   fatigue, so it already answers "how rested am I relative to
                   what I'm used to". Centred so TSB 0 → 50%, and the band edges
                   line up with _trFormBand: −30 → ~8%, −10 → ~30%, +25 → ~89%.
     Strain      — today's training load on WHOOP's 0–21 logarithmic scale, so
                   the first hour of a ride moves it far more than the fourth.

   Both are labelled as estimates in the UI; nothing here pretends to be a
   measured physiological signal. */

function _trRecovery(d) {
  if (!d) return null;

  const recovery = Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-d.tsb / 12)))));

  // Today's load, falling back to the most recent day that had any.
  const last = d.series[d.series.length - 1] || { load: 0 };
  const todayLoad = last.load || 0;
  const strain = Math.max(0, Math.min(21, 6.5 * Math.log(1 + todayLoad / 12)));

  // Last 7 days of load, for the week's accumulated strain.
  const week = d.series.slice(-7).reduce((s, x) => s + (x.load || 0), 0);
  const weekStrain = Math.max(0, Math.min(21, 6.5 * Math.log(1 + week / 60)));

  const band =
    recovery >= 67 ? { key: 'green',  color: '#16ec8b', label: tr('Recovered') } :
    recovery >= 34 ? { key: 'yellow', color: '#ffde00', label: tr('Adequate')  } :
                     { key: 'red',    color: '#ff0026', label: tr('Rest')      };

  return { recovery, strain, weekStrain, todayLoad, band };
}

/* One WHOOP-style ring. `pct` fills the track; the arc starts at 12 o'clock. */
function _trRingSVG(pct, color, size, stroke) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, pct)) * c;
  // A round cap on a zero-length arc draws a stray dot, so omit the arc entirely.
  const arc = fill <= 0.5 ? '' :
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
             stroke-linecap="round" stroke-dasharray="${fill.toFixed(1)} ${(c - fill).toFixed(1)}"
             transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
  return `<svg class="wh-ring-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--wh-track)" stroke-width="${stroke}"/>
      ${arc}
    </svg>`;
}

/* The Recovery + Strain pair. `compact` is the Overview variant. */
function whoopRowHTML(compact) {
  const d = _trBuildSeries();
  const r = _trRecovery(d);
  if (!r) return '';

  const band = _trFormBand(d.tsb, d.ramp);
  const size = compact ? 132 : 168;
  const stroke = compact ? 12 : 15;

  return `<div class="wh-row${compact ? ' wh-compact' : ''}">
    <div class="wh-card" style="--wh-accent:${r.band.color}">
      <div class="wh-ring">
        ${_trRingSVG(r.recovery / 100, r.band.color, size, stroke)}
        <div class="wh-ring-mid">
          <div class="wh-ring-val">${r.recovery}<span>%</span></div>
          <div class="wh-ring-cap">${r.band.label}</div>
        </div>
      </div>
      <div class="wh-meta">
        <div class="wh-title">${tr('Recovery')}</div>
        <div class="wh-sub">${band.advice}</div>
      </div>
    </div>

    <div class="wh-card" style="--wh-accent:#0093e7">
      <div class="wh-ring">
        ${_trRingSVG(r.strain / 21, '#0093e7', size, stroke)}
        <div class="wh-ring-mid">
          <div class="wh-ring-val">${r.strain.toFixed(1)}</div>
          <div class="wh-ring-cap">${tr('of 21')}</div>
        </div>
      </div>
      <div class="wh-meta">
        <div class="wh-title">${tr('Day Strain')}</div>
        <div class="wh-sub">${r.todayLoad > 0
          ? trf("Today's load is {0}. This week totals {1} strain.", Math.round(r.todayLoad), r.weekStrain.toFixed(1))
          : trf('No activity logged today. This week totals {0} strain.', r.weekStrain.toFixed(1))}</div>
      </div>
    </div>
  </div>`;
}

/* Overview placement: a full-width band pinned above the stat cards. */
function renderWhoopOverview() {
  const grid = document.getElementById('statRow');
  if (!grid) return;
  grid.querySelectorAll('.wh-slot').forEach(n => n.remove());
  const html = whoopRowHTML(true);
  if (!html) return;
  const slot = document.createElement('div');
  slot.className = 'wh-slot';
  slot.innerHTML = html;
  grid.prepend(slot);
}

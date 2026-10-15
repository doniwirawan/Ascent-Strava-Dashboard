/* ── SOCIAL POST (activity modal) ──
   Turns one activity into a ready-to-share carousel for Instagram / WhatsApp /
   Facebook: you pick how many pages, the AI plans them (cover, numbers,
   progression, a moment from the day, photo pages, the route + stats card) and
   writes every page's text plus the caption, in English or Bahasa Indonesia.
   Your photos become the page backgrounds. Numbers on the pages are filled in
   here from the activity — the AI only picks WHICH stats go on a page, so it
   can't misquote them. Page text and caption stay editable; Share opens the
   phone share sheet with the pages and copies the caption (Instagram drops
   shared text, so you paste it).
   Like every AI caption here: the start (home) never reaches the AI or the text. */

let _spPhotos = [];   // ImageBitmap[] of the photos picked, in order
let _spPagePhoto = {}; // page index → its own photo (replaced on that page), or null = no photo
let _sp = null;       // { a, slides, wx } of the open post
const SP_W = 1080, SP_H = 1350, SP_MAX_PAGES = 10;

/* ── Progression: how this activity compares to the same sport before it ── */
function _spKind(a) {
  if (isRide(a)) return 'ride';
  if (typeof isRun === 'function' && isRun(a)) return 'run';
  if (typeof isSwim === 'function' && isSwim(a)) return 'swim';
  return a.sport_type || a.type;
}
const _spDate = a => new Date(a.start_date_local || a.start_date).getTime();
const _spDay = t => new Date(t).toISOString().slice(0, 10);

function socialProgress(a) {
  const kind = _spKind(a), t0 = _spDate(a), DAY = 86400000;
  const same = (acts || []).filter(x => _spKind(x) === kind && !x.manual);
  const before = same.filter(x => _spDate(x) < t0).sort((x, y) => _spDate(y) - _spDate(x)); // newest first
  if (!before.length) return { first_of_kind: true };
  const p = {};

  // "longest / biggest climb / fastest since <date>" — the last time it was beaten
  const since = better => {
    const prev = before.find(better);
    return prev ? { since: _spDay(_spDate(prev)), days: Math.round((t0 - _spDate(prev)) / DAY) } : { best_in_history: true };
  };
  const longest = since(x => x.distance >= a.distance);
  if (longest.best_in_history || longest.days >= 30) p.longest = longest;
  if (a.total_elevation_gain > 50) {
    const climb = since(x => (x.total_elevation_gain || 0) >= a.total_elevation_gain);
    if (climb.best_in_history || climb.days >= 30) p.most_elevation = climb;
  }
  if (a.average_speed && a.distance > 5000) {
    // only against efforts at least ~as long, so a short sprint doesn't count
    const fast = since(x => x.distance >= a.distance * 0.8 && (x.average_speed || 0) >= a.average_speed);
    if (fast.best_in_history || fast.days >= 30) p.fastest_at_this_distance = fast;
  }

  // vs similar-distance efforts in the last 120 days
  const sim = before.filter(x => t0 - _spDate(x) < 120 * DAY && x.distance > a.distance * 0.75 && x.distance < a.distance * 1.25 && x.average_speed);
  if (sim.length >= 3) {
    const avg = f => sim.reduce((s, x) => s + f(x), 0) / sim.length;
    p.vs_similar = { count: sim.length, days: 120, avg_speed_change_pct: Math.round((a.average_speed / avg(x => x.average_speed) - 1) * 1000) / 10 };
    const hr = sim.filter(x => x.average_heartrate);
    if (a.average_heartrate && hr.length >= 3) p.vs_similar.avg_hr_change_bpm = Math.round(a.average_heartrate - hr.reduce((s, x) => s + x.average_heartrate, 0) / hr.length);
  }

  // training volume: 4 weeks up to this activity vs the 4 weeks before
  const inWin = (from, to) => same.filter(x => { const t = _spDate(x); return t > t0 - from * DAY && t <= t0 - to * DAY; });
  const km = l => Math.round(l.reduce((s, x) => s + (x.distance || 0), 0) / 1000);
  const cur = inWin(28, 0), prev = inWin(56, 28);
  p.last_4_weeks = { km: km(cur), sessions: cur.length, prev_4_weeks_km: km(prev) };
  if (km(prev) > 0) p.last_4_weeks.change_pct = Math.round((km(cur) / km(prev) - 1) * 100);

  // year to date (this sport), up to and including this activity
  const y = new Date(t0).getUTCFullYear();
  const ytd = same.filter(x => _spDate(x) <= t0 && new Date(_spDate(x)).getUTCFullYear() === y);
  p.year_to_date = { year: y, km: km(ytd), sessions: ytd.length };
  return p;
}

/* Plain-language progression lines (no AI) — also what the template uses. */
function _spProgressLines(p, id) {
  const L = [], ago = d => id ? d + ' hari' : d + ' days';
  if (p.first_of_kind) return [id ? 'Yang pertama!' : 'The first one!'];
  if (p.longest) L.push(p.longest.best_in_history ? (id ? 'Terjauh sejauh ini' : 'Longest one yet') : (id ? 'Terjauh dalam ' + ago(p.longest.days) : 'Longest in ' + ago(p.longest.days)));
  if (p.most_elevation) L.push(p.most_elevation.best_in_history ? (id ? 'Tanjakan terbanyak sejauh ini' : 'Most climbing yet') : (id ? 'Elevasi terbanyak dalam ' + ago(p.most_elevation.days) : 'Most climbing in ' + ago(p.most_elevation.days)));
  if (p.fastest_at_this_distance) L.push(p.fastest_at_this_distance.best_in_history ? (id ? 'Tercepat di jarak ini' : 'Fastest at this distance yet') : (id ? 'Tercepat di jarak ini dalam ' + ago(p.fastest_at_this_distance.days) : 'Fastest at this distance in ' + ago(p.fastest_at_this_distance.days)));
  const v = p.vs_similar;
  if (v && Math.abs(v.avg_speed_change_pct) >= 1) L.push((v.avg_speed_change_pct > 0 ? '+' : '') + v.avg_speed_change_pct + '% ' + (id ? 'kecepatan vs ' + v.count + ' sesi serupa' : 'speed vs my last ' + v.count + ' similar ones'));
  if (v && v.avg_hr_change_bpm && v.avg_hr_change_bpm < 0 && v.avg_speed_change_pct >= 0) L.push((id ? 'Detak jantung ' : 'Heart rate ') + Math.abs(v.avg_hr_change_bpm) + ' bpm' + (id ? ' lebih rendah' : ' lower'));
  const w = p.last_4_weeks;
  if (w && w.change_pct != null && w.change_pct >= 5) L.push((id ? '4 minggu terakhir: ' : 'Last 4 weeks: ') + w.km + ' km (' + (w.change_pct > 0 ? '+' : '') + w.change_pct + '%)');
  const ytd = p.year_to_date;
  if (ytd && ytd.km) L.push(ytd.year + ': ' + ytd.km.toLocaleString() + ' km · ' + ytd.sessions + (id ? ' sesi' : ' sessions'));
  return L;
}

/* Key numbers as an emoji stat block (same in both languages, units unchanged). */
function _spStatLines(a) {
  const ride = isRide(a), L = ['📏 ' + fmtD(a.distance)];
  if (a.moving_time) L.push('⏱️ ' + fmtT(a.moving_time));
  if (a.total_elevation_gain > 10) L.push('⛰️ ' + fmtElev(a.total_elevation_gain));
  if (a.average_speed) L.push('⚡ ' + (ride ? fmtSpeed(a.average_speed) : fmtPace(a.average_speed)));
  if (a.average_heartrate) L.push('❤️ ' + Math.round(a.average_heartrate) + ' bpm');
  if (a.device_watts === true && a.average_watts) L.push('🔋 ' + Math.round(a.average_watts) + ' W' + (a.weighted_average_watts ? ' (NP ' + Math.round(a.weighted_average_watts) + ' W)' : ''));
  return L;
}

/* The numbers a page can show, formatted here (key → {label, value}). The AI
   gets the same list and refers to them by key. */
function _spNumbers(a, prog, id) {
  const ride = isRide(a), N = {};
  const put = (k, en, ind, v) => { if (v) N[k] = { label: id ? ind : en, value: String(v) }; };
  put('distance', 'Distance', 'Jarak', a.distance && fmtD(a.distance));
  put('moving_time', 'Moving time', 'Waktu bergerak', a.moving_time && fmtT(a.moving_time));
  put('elevation', 'Elevation', 'Elevasi', a.total_elevation_gain > 10 && fmtElev(a.total_elevation_gain));
  if (ride) put('avg_speed', 'Avg speed', 'Kecepatan rata-rata', a.average_speed && fmtSpeed(a.average_speed));
  else put('avg_pace', 'Avg pace', 'Pace rata-rata', a.average_speed && fmtPace(a.average_speed));
  if (ride) put('top_speed', 'Top speed', 'Kecepatan maks', cleanMax(a) && fmtSpeed(a.max_speed));
  put('avg_hr', 'Avg heart rate', 'Detak rata-rata', a.average_heartrate && Math.round(a.average_heartrate) + ' bpm');
  put('max_hr', 'Max heart rate', 'Detak maks', a.max_heartrate && Math.round(a.max_heartrate) + ' bpm');
  if (a.device_watts === true) { // measured only — Strava's estimate isn't worth a page
    put('avg_power', 'Avg power', 'Power rata-rata', a.average_watts && Math.round(a.average_watts) + ' W');
    put('norm_power', 'Normalized power', 'Power ternormalisasi', a.weighted_average_watts && Math.round(a.weighted_average_watts) + ' W');
  }
  put('energy', 'Energy', 'Energi', a.kilojoules && Math.round(a.kilojoules).toLocaleString() + ' kJ');
  put('cadence', 'Cadence', 'Kadens', a.average_cadence && (ride ? Math.round(a.average_cadence) + ' rpm' : Math.round(a.average_cadence * 2) + ' spm'));
  put('calories', 'Calories', 'Kalori', a.calories && Math.round(a.calories).toLocaleString() + ' kcal');
  if (prog && prog.last_4_weeks) put('last_4_weeks', 'Last 4 weeks', '4 minggu terakhir', prog.last_4_weeks.km && prog.last_4_weeks.km.toLocaleString() + ' km');
  if (prog && prog.year_to_date) put('year_to_date', prog.year_to_date.year + ' so far', 'Total ' + prog.year_to_date.year, prog.year_to_date.km && prog.year_to_date.km.toLocaleString() + ' km');
  return N;
}

function _spSport(a, id) {
  return isRide(a) ? (id ? 'Gowes' : 'Ride') : (typeof isRun === 'function' && isRun(a)) ? (id ? 'Lari' : 'Run') : String(a.sport_type || a.type || '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/* No-AI pages + caption — also fills any pages the AI left out. */
function _spTemplate(a, lang, o) {
  const id = lang === 'id', rp = a.route_places, prog = socialProgress(a);
  const dest = rp && rp.furthest_place ? destName(rp) : '';
  const sport = _spSport(a, id);
  const hook = (dest ? (id ? sport + ' ke ' + dest : sport + ' out to ' + dest) : (id ? sport + ' hari ini' : "Today's " + sport.toLowerCase())) + (o.notes ? ' — ' + o.notes : '');
  const nums = Object.keys(_spNumbers(a, prog, id));
  const pl = _spProgressLines(prog, id);
  const pool = [{ type: 'cover', title: hook.slice(0, 60), text: '' }];
  if (o.stats) pool.push({ type: 'stats', title: id ? 'Angkanya' : 'The numbers', stats: nums.slice(0, 4) });
  if (o.progress && pl.length) pool.push({ type: 'progress', title: id ? 'Progres' : 'Progress', text: pl.slice(0, 3).join('\n') });
  if (o.stats && nums.length > 4) pool.push({ type: 'stats', title: id ? 'Detailnya' : 'The details', stats: nums.slice(4, 8) });
  pool.push({ type: 'summary', title: '', text: '' });
  const caption = [hook];
  if (o.stats) caption.push('', ..._spStatLines(a));
  if (o.progress && pl.length) caption.push('', ...pl.slice(0, 3).map(l => '📈 ' + l));
  if (o.tags) caption.push('', isRide(a) ? (id ? '#gowes #sepedaan #bali #strava' : '#cycling #bali #strava') : (id ? '#lari #bali #strava' : '#running #bali #strava'));
  // extra pages beyond the plan are photo pages; keep the summary card last
  const summary = pool.pop(), slides = pool.slice(0, o.pages);
  while (slides.length < o.pages - 1) slides.push({ type: 'photo', title: '', text: '' });
  if (slides.length < o.pages) slides.push(summary);
  return { caption: caption.join('\n'), slides };
}

const SP_TYPES = ['cover', 'stats', 'progress', 'story', 'photo', 'summary'];

async function _spGenerate(a, lang, o) {
  const token = localStorage.getItem('strava_access_token');
  const id = lang === 'id', prog = socialProgress(a);
  const data = typeof aiWithWeather === 'function' ? await aiWithWeather(a) : {}; // destination only, never the start
  if (o.progress) data.progression = prog;
  if (o.notes) data.my_notes = o.notes;
  data.photo_count = _spPhotos.length;
  const nums = _spNumbers(a, prog, id);
  const NUMBERS = {}; Object.keys(nums).forEach(k => { NUMBERS[k] = nums[k].label + ': ' + nums[k].value; });
  const n = o.pages;
  const langLine = id
    ? 'Write ALL text entirely in casual, natural Bahasa Indonesia the way Indonesian cyclists post on Instagram (use "aku", light slang is fine, not formal); keep numbers, units and place names unchanged. '
    : 'Write ALL text in natural, casual English. ';
  const sys = 'You create an Instagram carousel post about ONE of my workouts, in first person. '
    + langLine + aiToneLine(o.tone)
    + 'Use ONLY the facts in the JSON — never invent. Stopped time is not a café or food stop; never say why I stopped. '
    + 'If "my_notes" is present it is what I told you about the day — build the story around it. '
    + 'If "furthest_place"/"furthest_landmark" is present it is where I rode/ran to — name it. NEVER mention, guess or hint at where I started or where I live. '
    + 'If "bike" is present it is the kind of bike (never a brand). Watts are only real if watts_source is "power meter"; otherwise never mention watts. Weather is a rough estimate — mention it lightly or not at all. '
    + '\n\nReturn ONLY a JSON object (no code fences, no comments): {"caption": string, "slides": [exactly ' + n + ' objects]}. '
    + 'Each slide: {"type": one of "cover"|"stats"|"progress"|"story"|"photo"|"summary", "title": string, "text": string, "stats": [keys]}. '
    + 'Slide 1 is "cover": a punchy headline title (max 40 chars) and a one-line text (max 80 chars). '
    + (o.stats ? '"stats": a short title and 1–4 keys from NUMBERS in "stats" — use the keys only, never write the numbers yourself; group them meaningfully (e.g. effort, speed, heart). ' : 'Do NOT use "stats" slides. ')
    + (o.progress ? '"progress": a short title and text of 1–3 short lines separated by \\n, built from "progression" (best_in_history = best I have recorded; days = since I last beat it). Only claim what the numbers show; skip anything unimpressive rather than spin it. ' : 'Do NOT use "progress" slides. ')
    + '"story": a short title and text (max 160 chars) about a moment of the day. '
    + '"photo": a page that is mostly my photo — a title of max 30 chars and empty text; use these when photo_count is bigger than the other pages need. '
    + '"summary": the route map + full stats card, at most once, best as the last page; title and text empty. '
    + 'Plan the ' + n + ' pages as a story arc (hook → numbers → progression/story → finish) and do not repeat the same point on two pages. Titles max 40 chars, texts max 160 chars, no hashtags on pages. '
    + '\n\n"caption" is the post caption: a hook line (an emoji is fine), then 1–3 short sentences. '
    + (o.stats ? 'Then a blank line and a compact stat block, one stat per line, each starting with an emoji. ' : '')
    + (o.progress ? 'Then a blank line and 1–3 progression lines. ' : '')
    + (o.tags ? 'End with a blank line and 4–7 relevant hashtags' + (id ? ' (mix English and Indonesian ones like #gowes #sepedaan)' : '') + '. ' : 'No hashtags. ')
    + 'No markdown anywhere.';
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: 'Workout data (JSON):\n' + JSON.stringify(data) + '\n\nNUMBERS (key: label: value):\n' + JSON.stringify(NUMBERS) + '\n\nCreate my ' + n + '-page post.' }];
  const { provider, model, key } = aiProviderModel();
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, messages, provider, model, key, max_tokens: 500 + n * 110 }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.text) throw Object.assign(new Error('ai'), { data: d, status: r.status });
  const t = d.text, j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  const clean = s => String(s || '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
  let slides = (Array.isArray(j.slides) ? j.slides : []).filter(s => s && SP_TYPES.includes(s.type)).map(s => ({
    type: s.type, title: clean(s.title), text: clean(s.text),
    stats: s.type === 'stats' ? (Array.isArray(s.stats) ? s.stats : []).filter(k => nums[k]).slice(0, 4) : undefined,
  })).filter(s => s.type !== 'stats' || s.stats.length);
  let seen = false; slides = slides.filter(s => s.type !== 'summary' || (!seen && (seen = true)));
  slides = slides.slice(0, n);
  const tpl = _spTemplate(a, lang, o);
  while (slides.length < n) {
    const t = tpl.slides[slides.length];
    slides.push(t && !(t.type === 'summary' && seen) ? t : { type: 'photo', title: '', text: '' });
  }
  return { caption: clean(j.caption) || tpl.caption, slides };
}

/* ── Drawing one page (1080×1350, Instagram's 4:5) ── */
function _spRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}

function _spRouteDecor(ctx, a, alpha) {
  const pl = a.map && a.map.summary_polyline; if (!pl) return;
  const pts = decodePolyline(pl); if (pts.length < 2) return;
  const lats = pts.map(p => p[0]), lngs = pts.map(p => p[1]);
  const k = Math.cos((Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180);
  const w = (Math.max(...lngs) - Math.min(...lngs)) * k || 1e-6, h = (Math.max(...lats) - Math.min(...lats)) || 1e-6;
  const box = 760, s = box / Math.max(w, h), ox = (SP_W - w * s) / 2, oy = 260 + (box - h * s) / 2;
  ctx.save(); ctx.strokeStyle = 'rgba(252,76,2,' + alpha + ')'; ctx.lineWidth = 10; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => { const x = ox + (p[1] - Math.min(...lngs)) * k * s, y = oy + (Math.max(...lats) - p[0]) * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.restore();
}

/* Bottom-anchored text block: draws wrapped lines upward from `bottom`. */
function _spTextBlock(ctx, items, x, bottom, w) {
  const laid = items.filter(it => it.text).map(it => {
    ctx.font = it.font; return Object.assign({ lines: _siWrap(ctx, it.text, w, it.max || 3) }, it);
  });
  let y = bottom - laid.reduce((s, it) => s + it.lines.length * it.lh + (it.gap || 0), 0);
  laid.forEach(it => {
    ctx.font = it.font; ctx.fillStyle = it.color;
    it.lines.forEach(l => { y += it.lh; ctx.fillText(l, x, y - it.lh * 0.22); });
    y += it.gap || 0;
  });
  return bottom - laid.reduce((s, it) => s + it.lines.length * it.lh + (it.gap || 0), 0);
}

async function _spDrawSlide(cv, a, s, i, n, photo, wx, lang) {
  cv.width = SP_W; cv.height = SP_H;
  const ctx = cv.getContext('2d'), P = 80, id = lang === 'id';
  if (s.type === 'summary') {
    let style = 'sat'; try { style = _siStyle(localStorage.getItem('si_style')).id; } catch {}
    await drawStatsImage(cv, a, wx, style);
    if (n > 1) { // page number in a pill over the top-right corner
      ctx.font = '700 28px ' + SI_FONT; const t = (i + 1) + '/' + n, w = ctx.measureText(t).width + 36;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; _spRoundRect(ctx, SP_W - 72 - w, 22, w, 46, 23);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, SP_W - 72 - w / 2, 46);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    return;
  }
  // background: the photo (cover-fit) or the dark card with the route faintly behind
  if (photo) {
    const sc = Math.max(SP_W / photo.width, SP_H / photo.height);
    ctx.drawImage(photo, (SP_W - photo.width * sc) / 2, (SP_H - photo.height * sc) / 2, photo.width * sc, photo.height * sc);
    const top = ctx.createLinearGradient(0, 0, 0, 300);
    top.addColorStop(0, 'rgba(0,0,0,.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, SP_W, 300);
    const bot = ctx.createLinearGradient(0, SP_H * (s.type === 'photo' ? 0.65 : 0.35), 0, SP_H);
    bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,.85)');
    ctx.fillStyle = bot; ctx.fillRect(0, 0, SP_W, SP_H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, SP_H);
    bg.addColorStop(0, '#1a1a1c'); bg.addColorStop(1, '#0c0c0d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, SP_W, SP_H);
    _spRouteDecor(ctx, a, s.type === 'cover' || s.type === 'photo' ? 0.55 : 0.12);
  }
  ctx.fillStyle = SI_ORANGE; ctx.fillRect(0, 0, SP_W, 10);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  if (photo) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14; }

  // header: sport · date, page number
  const when = a.start_date_local || a.start_date;
  const date = when ? new Date(when).toLocaleDateString(id ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  ctx.font = '700 30px ' + SI_FONT; ctx.fillStyle = SI_ORANGE;
  const sport = _spSport(a, id).toUpperCase();
  ctx.fillText(sport, P, 100);
  ctx.font = '500 30px ' + SI_FONT; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText('  ·  ' + date, P + ctx.measureText(sport).width + 4, 100);
  if (n > 1) { ctx.textAlign = 'right'; ctx.fillText((i + 1) + '/' + n, SP_W - P, 100); ctx.textAlign = 'left'; }

  const W = SP_W - P * 2, bottom = SP_H - 110;
  const title = (fs, max) => ({ text: s.title, font: '800 ' + fs + 'px ' + SI_FONT, color: '#fff', lh: fs * 1.12, max: max || 3, gap: 18 });
  const body = fs => ({ text: s.text, font: '500 ' + fs + 'px ' + SI_FONT, color: 'rgba(255,255,255,.88)', lh: fs * 1.35, max: 4 });
  const rp = a.route_places;

  if (s.type === 'cover') {
    const place = rp && rp.furthest_place ? '📍 ' + destName(rp) + '  ·  ' + kmOut(rp.furthest_km_from_start) : '';
    _spTextBlock(ctx, [title(88), Object.assign(body(38), { gap: place ? 18 : 0 }), { text: place, font: '600 32px ' + SI_FONT, color: '#ffb28a', lh: 46, max: 1 }], P, bottom, W);
  } else if (s.type === 'stats') {
    const nums = _spNumbers(a, socialProgress(a), id), keys = (s.stats || []).filter(k => nums[k]);
    const cols = keys.length === 1 ? 1 : 2, rows = Math.ceil(keys.length / cols);
    const cw = (W - (cols - 1) * 24) / cols, ch = keys.length === 1 ? 300 : 210, gridTop = bottom - rows * ch - (rows - 1) * 24;
    _spTextBlock(ctx, [title(64, 2)], P, gridTop - 30, W);
    keys.forEach((k, j) => {
      const x = P + (j % cols) * (cw + 24), y = gridTop + Math.floor(j / cols) * (ch + 24);
      ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = photo ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.06)'; _spRoundRect(ctx, x, y, cw, ch, 22); ctx.restore();
      ctx.font = '600 28px ' + SI_FONT; ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.fillText(_siWrap(ctx, nums[k].label.toUpperCase(), cw - 56, 1)[0], x + 28, y + 56);
      let fs = keys.length === 1 ? 150 : 86;
      do { ctx.font = '800 ' + fs + 'px ' + SI_FONT; } while (ctx.measureText(nums[k].value).width > cw - 56 && (fs -= 4) > 30);
      ctx.fillStyle = '#fff'; ctx.fillText(nums[k].value, x + 28, y + ch - 40);
    });
  } else if (s.type === 'progress') {
    const lines = String(s.text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4);
    ctx.font = '700 46px ' + SI_FONT;
    const laid = lines.map(l => _siWrap(ctx, l, W - 70, 2));
    let y = bottom - laid.reduce((t, l) => t + l.length * 58 + 30, 0);
    _spTextBlock(ctx, [title(68, 2)], P, y - 20, W);
    laid.forEach(ls => {
      ctx.font = '800 46px ' + SI_FONT; ctx.fillStyle = SI_ORANGE; ctx.fillText('↗', P, y + 46);
      ctx.font = '700 46px ' + SI_FONT; ctx.fillStyle = '#fff';
      ls.forEach(l => { y += 58; ctx.fillText(l, P + 70, y - 12); });
      y += 30;
    });
  } else if (s.type === 'story') {
    _spTextBlock(ctx, [title(76), body(42)], P, bottom, W);
  } else { // photo
    _spTextBlock(ctx, [title(60, 2), body(36)], P, bottom, W);
  }
  ctx.shadowBlur = 0;
  ctx.font = '600 24px ' + SI_FONT; ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillText('ASCENT ANALYTICS', P, SP_H - 50);
}

/* ── UI ── */
const _spStateKey = id => 'sp_state_' + id;
function _spPrefs() {
  let p = {}; try { p = JSON.parse(localStorage.getItem('sp_prefs') || '{}') || {}; } catch {}
  return Object.assign({ lang: window.LANG === 'id' ? 'id' : 'en', tone: 'light', stats: true, progress: true, tags: true, pages: 5 }, p);
}
function _spOpts() {
  const v = id => document.getElementById(id) || {};
  const o = {
    lang: ((document.querySelector('.sp-lang .si-style.active') || {}).dataset || {}).lang || 'en',
    tone: v('spTone').value || 'off', stats: !!v('spStats').checked, progress: !!v('spProgress').checked, tags: !!v('spTags').checked,
    pages: Math.max(1, Math.min(SP_MAX_PAGES, parseInt(v('spPages').value, 10) || 5)),
    notes: (v('spNotes').value || '').trim(),
  };
  try { localStorage.setItem('sp_prefs', JSON.stringify({ lang: o.lang, tone: o.tone, stats: o.stats, progress: o.progress, tags: o.tags, pages: o.pages })); } catch {}
  return o;
}
function _spSaveState() {
  if (!_sp) return;
  try { localStorage.setItem(_spStateKey(_sp.a.id), JSON.stringify({ slides: _sp.slides, lang: _sp.lang, caption: (document.getElementById('spText') || {}).value || '' })); } catch {}
}
function _spStatus(cls, msg) { const s = document.getElementById('spStatus'); if (s) { s.className = 'ai-cap-status' + (cls ? ' ' + cls : ''); s.innerHTML = msg; } }

function openSocialPost(id) {
  const a = (typeof acts !== 'undefined' ? acts : []).find(x => String(x.id) === String(id));
  const panel = document.getElementById('actAiPanel');
  if (!a || !panel) return;
  _spPhotos = []; _spPagePhoto = {};
  const p = _spPrefs();
  let saved = null; try { saved = JSON.parse(localStorage.getItem(_spStateKey(id)) || 'null'); } catch {}
  _sp = { a, slides: saved && saved.slides || [], lang: saved && saved.lang || p.lang, wx: null };
  const chk = (id, on, label) => '<label class="sp-chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + tr(label) + '</label>';
  const lang = _sp.lang;
  panel.innerHTML =
    '<div class="sp-head">' + tr('Social post') + '<span class="sp-sub">' + tr('Swipe the pages · tap one to change its photo') + '</span></div>'
    + '<div class="sp-photo-row"><label class="sp-add-tile"><input type="file" id="spFile" accept="image/*" multiple hidden><span aria-hidden="true">+</span>' + tr('Photos') + '</label>'
    + '<div class="sp-photos" id="spPhotos"></div></div>'
    + '<div class="sp-lang sp-seg" role="group" aria-label="' + tr('Language') + '">'
    + '<button type="button" class="si-style' + (lang === 'en' ? ' active' : '') + '" data-lang="en">English</button>'
    + '<button type="button" class="si-style' + (lang === 'id' ? ' active' : '') + '" data-lang="id">Bahasa Indonesia</button></div>'
    + '<div class="sp-row2"><div class="sp-stepper" role="group" aria-label="' + tr('Pages') + '">'
    + '<button type="button" id="spMinus" aria-label="' + tr('Fewer pages') + '">−</button>'
    + '<input type="number" id="spPages" min="1" max="' + SP_MAX_PAGES + '" value="' + p.pages + '" inputmode="numeric" aria-label="' + tr('Pages') + '">'
    + '<span class="sp-step-lbl">' + tr('pages') + '</span>'
    + '<button type="button" id="spPlus" aria-label="' + tr('More pages') + '">+</button></div>'
    + '<button class="btn btn-primary sp-gen" type="button" id="spGen">' + (typeof AI_ICON !== 'undefined' ? AI_ICON : '') + ' ' + tr('Write with AI') + '</button></div>'
    + '<details class="sp-more"><summary>' + tr('More options') + '</summary>'
    + '<label class="ai-cap-roast">' + aiRoastSelect('spTone', p.tone) + '</label>'
    + '<div class="sp-opts">' + chk('spStats', p.stats, 'Performance numbers') + chk('spProgress', p.progress, 'My progression') + chk('spTags', p.tags, 'Hashtags') + '</div>'
    + '<textarea id="spNotes" class="ai-cap-input" rows="2" placeholder="' + tr('Anything to mention? e.g. with friends, flat tyre, first time up this climb (optional)') + '"></textarea>'
    + '<button class="btn sp-tpl" type="button" id="spTpl">' + tr('Without AI') + '</button></details>'
    + '<div class="ai-cap-status" id="spStatus"></div>'
    + '<div class="sp-slides" id="spSlides"></div>'
    + '<label class="sp-label" for="spText">' + tr('Caption') + '</label>'
    + '<textarea id="spText" class="ai-cap-input sp-text" rows="9"></textarea>'
    + '<div class="sp-bar"><button class="btn btn-primary sp-share" type="button" id="spShare">' + tr('Share') + '</button>'
    + '<button class="btn" type="button" id="spDl">' + tr('Download all') + '</button>'
    + '<button class="btn" type="button" id="spCopy">' + tr('Copy caption') + '</button>'
    + '<button class="btn sp-close" type="button" aria-label="' + tr('Close') + '" title="' + tr('Close') + '" onclick="document.getElementById(\'actAiPanel\').innerHTML=\'\'">✕</button></div>';
  const $ = s => document.getElementById(s);
  $('spText').value = (saved && saved.caption) || '';
  $('spText').oninput = _spSaveState;
  $('spFile').onchange = async e => {
    const files = [...e.target.files].filter(f => f.type.startsWith('image/')); e.target.value = '';
    for (const f of files) { try { _spPhotos.push(await createImageBitmap(f)); } catch {} }
    _spRenderPhotos(); _spRenderSlides();
  };
  // another language = the AI writes it again in that language
  panel.querySelectorAll('.sp-lang .si-style').forEach(b => b.onclick = () => {
    if (b.classList.contains('active')) return;
    panel.querySelectorAll('.sp-lang .si-style').forEach(x => x.classList.toggle('active', x === b));
    _spRun(true);
  });
  // − / + pages (or typing a number): the AI rewrites once you stop
  let stepT = null;
  const step = d => {
    const inp = $('spPages'), v = Math.max(1, Math.min(SP_MAX_PAGES, (parseInt(inp.value, 10) || 5) + d));
    inp.value = v; clearTimeout(stepT); stepT = setTimeout(() => _spRun(true), 900);
  };
  $('spMinus').onclick = () => step(-1); $('spPlus').onclick = () => step(1);
  $('spPages').onchange = () => step(0);
  $('spGen').onclick = () => _spRun(true);
  $('spTpl').onclick = () => _spRun(false);
  $('spCopy').onclick = async () => { try { await navigator.clipboard.writeText($('spText').value); _spStatus('ok', '✓ ' + tr('Copied.')); } catch { _spStatus('err', tr('Couldn’t copy — select the text and copy it by hand.')); } };
  $('spShare').onclick = () => _spShare(false);
  $('spDl').onclick = () => _spShare(true);
  _spRenderPhotos();
  try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  // first open: let the AI write it straight away
  if (_sp.slides.length) _spRenderSlides(); else _spRun(true);
}

async function _spRun(useAI) {
  if (!_sp) return;
  const a = _sp.a, o = _spOpts(), my = _sp;
  try { if (typeof aiRoutePlaces === 'function') await aiRoutePlaces(a); } catch {}
  let res;
  if (useAI) {
    _spStatus('', '<span class="ai-dots"><span></span><span></span><span></span></span> ' + trf('Writing your {0}-page post…', o.pages));
    try { res = await _spGenerate(a, o.lang, o); _spStatus('', ''); if (typeof track === 'function') track('social_post', { lang: o.lang, pages: o.pages }); }
    catch (e) {
      res = _spTemplate(a, o.lang, o);
      _spStatus('err', tr('AI unavailable — wrote it from your stats instead.') + (e && e.data ? ' ' + aiErrorMessage(e.data, e.status) : ''));
    }
  } else { res = _spTemplate(a, o.lang, o); _spStatus('', ''); }
  if (_sp !== my) return; // the panel moved on
  _sp.slides = res.slides; _sp.lang = o.lang;
  const t = document.getElementById('spText'); if (t) t.value = res.caption;
  _spSaveState();
  _spRenderSlides();
}

function _spRenderPhotos() {
  const box = document.getElementById('spPhotos'); if (!box) return;
  box.innerHTML = '';
  _spPhotos.forEach((bm, i) => {
    const d = document.createElement('div'); d.className = 'sp-thumb';
    const c = document.createElement('canvas'); c.width = 152; c.height = 152;
    const sc = Math.max(152 / bm.width, 152 / bm.height);
    c.getContext('2d').drawImage(bm, (152 - bm.width * sc) / 2, (152 - bm.height * sc) / 2, bm.width * sc, bm.height * sc);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '✕'; b.setAttribute('aria-label', tr('Remove'));
    b.onclick = () => { _spPhotos.splice(i, 1); _spRenderPhotos(); _spRenderSlides(); };
    d.append(c, b); box.appendChild(d);
  });
}

/* Photos go to the pages in order (the summary card keeps its map); a page
   whose photo was replaced or removed keeps its own and is skipped. */
const _spAuto = j => _sp.slides[j].type !== 'summary' && !(j in _spPagePhoto);
function _spPhotoFor(i) {
  if (_sp.slides[i].type === 'summary') return null;
  if (i in _spPagePhoto) return _spPagePhoto[i];
  let k = 0;
  for (let j = 0; j < i; j++) if (_spAuto(j)) k++;
  return _spPhotos[k] || null;
}

async function _spRenderSlides() {
  const box = document.getElementById('spSlides'); if (!box || !_sp) return;
  const { a, slides } = _sp;
  if (_sp.wx === null) { try { _sp.wx = (typeof aiWeather === 'function' && await aiWeather(a)) || false; } catch { _sp.wx = false; } }
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const btn = (cls, icon, label) => '<button type="button" class="sp-slide-dl ' + cls + '" aria-label="' + label + '" title="' + label + '">' + icon + '</button>';
  box.innerHTML = slides.map((s, i) => '<div class="sp-slide" data-i="' + i + '"><div class="sp-slide-bar"><span>' + trf('Page {0}', i + 1) + '</span><span class="sp-slide-btns">'
    + (s.type === 'summary' ? '' : '<input type="file" accept="image/*" hidden class="sp-slide-file">'
      + btn('sp-ph-set', '🖼', tr('Replace photo on this page'))
      + (_spPhotoFor(i) ? btn('sp-ph-none', '✕', tr('No photo on this page')) : '')
      + (i in _spPagePhoto ? btn('sp-ph-auto', '↺', tr('Back to the photo order')) : ''))
    + btn('sp-dl', '⬇', trf('Download page {0}', i + 1)) + '</span></div><canvas' + (s.type === 'summary' ? '' : ' class="sp-pickable" title="' + tr('Replace photo on this page') + '"') + '></canvas>'
    + (s.type === 'summary' ? '<div class="sp-slide-note">' + tr('Route & stats card') + '</div>'
      : '<input class="ai-cap-input" data-f="title" value="' + esc(s.title) + '" placeholder="' + tr('Title') + '">'
        + (s.type === 'stats' ? '' : '<textarea class="ai-cap-input" data-f="text" rows="3" placeholder="' + tr('Text') + '">' + esc(s.text) + '</textarea>'))
    + '</div>').join('');
  const used = slides.filter((s, j) => _spAuto(j)).length;
  if (_spPhotos.length > used) _spStatus('', trf('{0} photo(s) won’t fit — add more pages and write again.', _spPhotos.length - used));
  box.querySelectorAll('.sp-slide').forEach(el => {
    const i = +el.dataset.i, cv = el.querySelector('canvas');
    const draw = () => _spDrawSlide(cv, a, _sp.slides[i], i, _sp.slides.length, _spPhotoFor(i), _sp.wx || null, _sp.lang);
    draw();
    el.querySelector('.sp-dl').onclick = async () => { const f = await _spFile(cv, i); if (f) _spDownload([f]); };
    const fi = el.querySelector('.sp-slide-file');
    if (fi) {
      const pick = () => fi.click();
      el.querySelector('.sp-ph-set').onclick = pick; cv.onclick = pick;
      fi.onchange = async () => {
        const f = fi.files[0]; fi.value = '';
        if (!f || !f.type.startsWith('image/')) return;
        try { _spPagePhoto[i] = await createImageBitmap(f); } catch { return; }
        _spRenderSlides();
      };
      const none = el.querySelector('.sp-ph-none'), auto = el.querySelector('.sp-ph-auto');
      if (none) none.onclick = () => { _spPagePhoto[i] = null; _spRenderSlides(); };
      if (auto) auto.onclick = () => { delete _spPagePhoto[i]; _spRenderSlides(); };
    }
    let tm = null;
    el.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => {
      _sp.slides[i][inp.dataset.f] = inp.value; _spSaveState();
      clearTimeout(tm); tm = setTimeout(draw, 250);
    });
  });
}

/* Numbered so the pages stay in order: activity-123-01-of-05.jpg */
async function _spFile(cv, i) {
  const n = _sp.slides.length, pad = k => String(k).padStart(2, '0');
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
  return blob ? new File([blob], 'activity-' + _sp.a.id + '-' + pad(i + 1) + '-of-' + pad(n) + '.jpg', { type: 'image/jpeg' }) : null;
}
async function _spFiles() {
  const out = [], cs = document.querySelectorAll('#spSlides .sp-slide canvas');
  for (let i = 0; i < cs.length; i++) { const f = await _spFile(cs[i], i); if (f) out.push(f); }
  return out;
}
/* One file per page, a moment apart (browsers drop rapid-fire downloads). */
function _spDownload(files) {
  files.forEach((f, i) => setTimeout(() => {
    const l = document.createElement('a'); l.href = URL.createObjectURL(f); l.download = f.name;
    document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 4000);
  }, i * 400));
}

async function _spShare(download) {
  if (!_sp) return;
  const text = (document.getElementById('spText') || {}).value || '';
  const files = await _spFiles();
  // Instagram & co. ignore shared text — put it on the clipboard so it can be pasted
  let copied = false; if (text) { try { await navigator.clipboard.writeText(text); copied = true; } catch {} }
  if (!download && navigator.share && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, text }); _spStatus('ok', copied ? '✓ ' + tr('Caption copied — paste it if the app didn’t keep it.') : ''); } catch {}
    return;
  }
  _spDownload(files);
  _spStatus('', trf(download ? 'Downloading {0} pages' : 'Sharing isn\'t supported in this browser — downloading {0} pages', files.length)
    + (copied ? ', ' + tr('caption copied.') : '.') + (files.length > 1 ? ' ' + tr('If only one arrives, allow multiple downloads for this site.') : ''));
}

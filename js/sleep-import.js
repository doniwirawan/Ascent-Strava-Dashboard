/* ── SLEEP IMPORT ────────────────────────────────────────────────────────────
   Owner-only. Drop the encrypted Huawei Health export zip straight into the
   dashboard and it does everything the old offline pipeline did: decrypt the
   AES zip, read the type-9 TruSleep segments and the SportsHealth-Data.xls
   daily metrics, build the same {cols,rows} table api/sleep.js serves, push it
   to Supabase (so the phone + public deploy see it too), and refresh the
   section in place.

   The parse algorithm here is a straight port of the verified offline script —
   it reproduces the bundled snapshot exactly on the overlapping nights.

   Heavy libs (zip.js for AES unzip, SheetJS for the legacy .xls) are pulled
   from a CDN only when this panel is first opened, so they never weigh on a
   normal page load.
   ────────────────────────────────────────────────────────────────────────── */

const _IMP_ZIP_URL  = 'https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.7.45/dist/zip.min.js';
const _IMP_XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

/* PROFESSIONAL_SLEEP_* → our stage keys. NOON is a daytime nap: tracked, but
   excluded from `asleep`, and dated to the day it happened (not the wake date). */
const _IMP_STAGE = {
  PROFESSIONAL_SLEEP_DEEP:    'deep',
  PROFESSIONAL_SLEEP_SHALLOW: 'light',
  PROFESSIONAL_SLEEP_DREAM:   'rem',
  PROFESSIONAL_SLEEP_WAKE:    'wake',
  PROFESSIONAL_SLEEP_NOON:    'nap',
};

/* Column order must match the bundled snapshot / api/sleep.js consumer. */
const _IMP_COLS = ['date','asleep','deep','light','rem','wake','nap','wakeups','bed','up','tib','eff',
  'rhr','hrv','stress','cal','steps','dist','active','floors','smin','smax','scnt',
  'hrmax','hrmin','spo2','spo2min','hrvmin','hrvmax','mhappy','mpeace','mbad','mall'];

const _IMP_NOTE = 'One row per night. A night is labelled with the date you WOKE UP. '
  + 'Minutes are integers; bed/up are local hours (bed is negative before midnight). '
  + 'Naps are counted separately and excluded from asleep.';

let _impLibsLoading = null;

function _impLoadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => window[globalName] ? resolve() : reject(new Error(globalName + ' missing after load'));
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

function _impLoadLibs() {
  if (_impLibsLoading) return _impLibsLoading;
  _impLibsLoading = Promise.all([
    _impLoadScript(_IMP_ZIP_URL, 'zip'),
    _impLoadScript(_IMP_XLSX_URL, 'XLSX'),
  ]).then(() => { try { zip.configure({ useWebWorkers: false }); } catch {} });
  return _impLibsLoading;
}

/* ── date / time helpers (UTC maths on purpose — see js/sleep.js note) ── */
function _impTzOff(tz) {                          // "+0800" → ms offset
  if (!tz) return 8 * 3600000;
  const m = /([+-])(\d{2})(\d{2})/.exec(tz);
  if (!m) return 8 * 3600000;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60000;
}
const _impISO = ms => new Date(ms).toISOString().slice(0, 10);
/* wake-date label: the local calendar date of (segment start + 6h) */
const _impNight = (st, off) => _impISO(st + off + 6 * 3600000);
/* nap / local-day label: the local calendar date of the moment */
const _impDay   = (st, off) => _impISO(st + off);
function _impLocalHour(ms, off) {                 // 22:02 → -1.97, 08:01 → 8.02
  let h = ((ms + off) / 3600000) % 24;
  if (h < 0) h += 24;
  if (h >= 12) h -= 24;                           // evening bedtimes read negative
  return Math.round(h * 100) / 100;
}
/* number of separate awakenings = maximal contiguous runs of 1-min WAKE cells */
function _impWakeRuns(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  let c = 0, prev = null;
  for (const [s, e] of iv) {
    if (prev === null || s > prev) c++;
    prev = prev === null ? e : Math.max(prev, e);
  }
  return c;
}

/* ── parse one detail JSON's text into deduped type-9 segments ── */
function _impCollectSleep(text, segMap) {
  if (text.indexOf('PROFESSIONAL_SLEEP') === -1) return;   // skip non-sleep files fast
  let arr;
  try { arr = JSON.parse(text); } catch { return; }
  if (!Array.isArray(arr)) return;
  for (const rec of arr) {
    if (!rec || rec.type !== 9) continue;
    const off = _impTzOff(rec.timeZone);
    const pts = rec.samplePoints;
    if (!Array.isArray(pts)) continue;
    for (const p of pts) {
      const stg = _IMP_STAGE[p.key];
      if (!stg) continue;
      const st = +p.startTime, en = +p.endTime;
      if (!(en > st)) continue;
      segMap.set(st + '_' + en + '_' + p.key, { st, en, stg, off });   // dedupe identical cells
    }
  }
}

/* ── fold segments into per-night stage totals ── */
function _impBuildNights(segMap) {
  const nights = new Map();
  const get = d => {
    let n = nights.get(d);
    if (!n) { n = { deep: 0, light: 0, rem: 0, wake: 0, nap: 0, wsegs: [], first: null, last: null, off: 8 * 3600000 }; nights.set(d, n); }
    return n;
  };
  segMap.forEach(({ st, en, stg, off }) => {
    const d = stg === 'nap' ? _impDay(st, off) : _impNight(st, off);
    const n = get(d);
    n.off = off;
    n[stg] += (en - st) / 60000;
    if (stg === 'wake') n.wsegs.push([st, en]);
    if (stg !== 'nap') {
      if (n.first === null || st < n.first) n.first = st;
      if (n.last === null || en > n.last)   n.last = en;
    }
  });
  const out = new Map();
  nights.forEach((n, d) => {
    const asleep = Math.round(n.deep + n.light + n.rem);
    const o = {
      asleep, deep: Math.round(n.deep), light: Math.round(n.light), rem: Math.round(n.rem),
      wake: Math.round(n.wake), nap: Math.round(n.nap),
      wakeups: asleep > 0 ? _impWakeRuns(n.wsegs) : null,
      bed: null, up: null, tib: null, eff: null,
    };
    if (n.first !== null && asleep > 0) {
      const tib = Math.round((n.last - n.first) / 60000);
      o.bed = _impLocalHour(n.first, n.off);
      o.up  = _impLocalHour(n.last, n.off);
      o.tib = tib;
      o.eff = tib > 0 ? Math.round(asleep / tib * 1000) / 10 : null;
    }
    out.set(d, o);
  });
  return out;
}

/* ── parse the SportsHealth-Data.xls daily metrics (sheets 9 & 10) ── */
function _impBuildDaily(u8) {
  const wb = XLSX.read(u8, { type: 'array' });
  const daily = new Map();
  const get = d => { let o = daily.get(d); if (!o) { o = {}; daily.set(d, o); } return o; };
  const d8 = v => { const s = String(v).trim(); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); };

  // Sheet 9 — health daily statistics, keyed by a type code. A re-synced day
  // appears more than once; keep the row with the largest sample count.
  const n9 = wb.SheetNames.find(n => /^9-/.test(n));
  if (n9) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n9], { header: 1, raw: true });
    const best = new Map();                       // "date|type" → {score, j}
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const date = d8(r[0]), type = String(r[2 + 1]).trim();   // cols: generateTime, totalInfo, timeZone, type
      let j; try { j = JSON.parse(r[1]); } catch { continue; }
      const score = (j.measureCount != null ? j.measureCount : (j.allCount != null ? j.allCount : 0)) || 0;
      const k = date + '|' + type, cur = best.get(k);
      if (!cur || score >= cur.score) best.set(k, { score, j, date, type });
    }
    best.forEach(({ j, date, type }) => {
      const o = get(date);
      if (type === '500024') o.rhr = j.lastRestBpm;
      else if (type === '500044') { o.hrv = j.lastHrv; o.hrvmin = j.minHrv; o.hrvmax = j.maxHrv; }
      else if (type === '500026') { o.stress = j.meanScore; o.smin = j.minScore; o.smax = j.maxScore; o.scnt = j.measureCount; }
      else if (type === '400021') { o.spo2 = j.avgSpO2 != null ? Math.round(j.avgSpO2 * 10) / 10 : null; o.spo2min = j.minSpO2; }
      else if (type === '500023') { o.hrmax = j.maxBpm; o.hrmin = j.minBpm; }
      else if (type === '500031') { o.mhappy = j.happyCount; o.mpeace = j.peaceCount; o.mbad = j.unHappyCount; o.mall = j.allCount; }
    });
  }

  // Sheet 10 — sport daily statistics, one row per recordDay (last wins).
  const n10 = wb.SheetNames.find(n => /^10-/.test(n));
  if (n10) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n10], { header: 1, raw: true });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const date = d8(r[0]);
      let j; try { j = JSON.parse(r[2]); } catch { continue; }
      const o = get(date);
      o.cal = j.calorie != null ? Math.round(j.calorie / 1000) : null;   // thousandths of a kcal
      o.steps = j.steps; o.dist = j.distance; o.active = j.duration; o.floors = j.floor;
    }
  }
  return daily;
}

/* ── merge nights + daily into the {cols,rows} table ── */
function _impAssemble(nights, daily) {
  const dates = Array.from(new Set([...nights.keys(), ...daily.keys()])).sort();
  const STAGE0 = { asleep: 0, deep: 0, light: 0, rem: 0, wake: 0, nap: 0 };
  const rows = dates.map(date => {
    const s = nights.get(date) || {}, dd = daily.get(date) || {};
    const o = {}; _IMP_COLS.forEach(c => { o[c] = null; });
    o.date = date;
    Object.keys(STAGE0).forEach(k => { o[k] = s[k] != null ? s[k] : 0; });
    ['wakeups', 'bed', 'up', 'tib', 'eff'].forEach(k => { if (s[k] != null) o[k] = s[k]; });
    Object.keys(dd).forEach(k => { if (k in o && dd[k] != null) o[k] = dd[k]; });
    return _IMP_COLS.map(c => o[c]);
  });
  return {
    source: 'Huawei Health export (TruSleep), imported ' + new Date().toISOString().slice(0, 10),
    tz: '+08:00', note: _IMP_NOTE, cols: _IMP_COLS, rows,
  };
}

/* ── top-level: File → dataset ── */
async function slpImportParse(file, password, onProgress) {
  await _impLoadLibs();
  const reader = new zip.ZipReader(new zip.BlobReader(file), { password });
  let entries;
  try { entries = await reader.getEntries(); }
  catch (e) { throw new Error('Could not open the zip — is it the right file?'); }

  const detail = entries.filter(e => !e.directory && /Health detail data.*\.json$/i.test(e.filename));
  const xls    = entries.find(e => !e.directory && /SportsHealth-Data\.xls$/i.test(e.filename));
  if (!detail.length) { await reader.close(); throw new Error('No Huawei "Health detail data" files in this zip.'); }

  const segMap = new Map();
  let done = 0;
  for (const e of detail) {
    let text;
    try { text = await e.getData(new zip.TextWriter()); }
    catch (err) {
      await reader.close();
      throw new Error(/password/i.test(String(err && err.message)) || /invalid|Crypt/i.test(String(err && err.message))
        ? 'Wrong password for this export.' : 'Failed to read a file in the zip.');
    }
    _impCollectSleep(text, segMap);
    text = null;
    done++;
    if (onProgress) onProgress('Reading sleep data… ' + done + '/' + detail.length, done / (detail.length + 2));
  }

  let daily = new Map();
  if (xls) {
    if (onProgress) onProgress('Reading daily metrics…', (detail.length + 1) / (detail.length + 2));
    const u8 = await xls.getData(new zip.Uint8ArrayWriter());
    daily = _impBuildDaily(u8);
  }
  await reader.close();

  if (onProgress) onProgress('Building table…', 1);
  const nights = _impBuildNights(segMap);
  if (!nights.size) throw new Error('No TruSleep records found in this export.');
  const data = _impAssemble(nights, daily);
  return {
    data,
    stats: { nights: nights.size, days: data.rows.length, segments: segMap.size,
             first: data.rows[0][0], last: data.rows[data.rows.length - 1][0] },
  };
}

/* ── persist to Supabase via the owner-gated endpoint ── */
async function slpImportUpload(data) {
  const res = await fetch('/api/sleep-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: CONFIG.accessToken, data }),
  });
  let j = null; try { j = await res.json(); } catch {}
  if (!res.ok) { const err = new Error((j && j.error) || ('upload failed (' + res.status + ')')); err.info = j; throw err; }
  return j;
}

function _impDownload(data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sleep.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── UI panel ── */
function slpImportPanelHTML() {
  const T = (typeof tr === 'function') ? tr : (x => x);
  return ''
    + '<details class="card slp-import" id="slpImport" style="padding:16px 18px;margin-bottom:16px">'
    +   '<summary style="cursor:pointer;font-weight:600;list-style:none;display:flex;align-items:center;gap:8px">'
    +     '<span>🌙 ' + T('Update sleep data') + '</span>'
    +     '<span style="color:var(--muted);font-weight:400;font-size:13px">' + T('Drop a new Huawei Health export') + '</span>'
    +   '</summary>'
    +   '<div class="slp-import-body" style="margin-top:14px">'
    +     '<div id="slpDrop" class="slp-drop">'
    +       '<div class="slp-drop-ico">📦</div>'
    +       '<div><b id="slpDropName">' + T('Drop the export .zip here') + '</b><div style="color:var(--muted);font-size:13px">' + T('or click to choose the HUAWEI_HEALTH_*.zip file') + '</div></div>'
    +       '<input type="file" id="slpFile" accept=".zip" style="display:none">'
    +     '</div>'
    +     '<label class="slp-pw"><span>' + T('Export password') + '</span>'
    +       '<input type="password" id="slpPw" autocomplete="off" placeholder="' + T('the password you set in Huawei Health') + '"></label>'
    +     '<div class="slp-import-actions">'
    +       '<button class="btn btn-primary" id="slpRun" disabled>' + T('Import & update') + '</button>'
    +       '<button class="btn" id="slpDl" style="display:none">' + T('Download sleep.json') + '</button>'
    +     '</div>'
    +     '<div id="slpProg" class="slp-prog" style="display:none"><div id="slpProgBar" class="slp-prog-bar"></div></div>'
    +     '<div id="slpMsg" class="slp-msg"></div>'
    +   '</div>'
    + '</details>';
}

function wireSleepImport() {
  const root = document.getElementById('slpImport');
  if (!root || root._wired) return;
  root._wired = true;
  const T = (typeof tr === 'function') ? tr : (x => x);
  const drop = document.getElementById('slpDrop');
  const fileIn = document.getElementById('slpFile');
  const pw = document.getElementById('slpPw');
  const runBtn = document.getElementById('slpRun');
  const dlBtn = document.getElementById('slpDl');
  const nameEl = document.getElementById('slpDropName');
  const prog = document.getElementById('slpProg');
  const bar = document.getElementById('slpProgBar');
  const msg = document.getElementById('slpMsg');
  let file = null, parsed = null;

  const setMsg = (t, cls) => { msg.textContent = t || ''; msg.className = 'slp-msg' + (cls ? ' ' + cls : ''); };
  const refreshRun = () => { runBtn.disabled = !(file && pw.value.trim()); };

  const pick = f => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) { setMsg(T('That is not a .zip file.'), 'err'); return; }
    file = f; parsed = null; dlBtn.style.display = 'none';
    nameEl.textContent = f.name + '  (' + (f.size / 1048576).toFixed(0) + ' MB)';
    setMsg(''); refreshRun();
  };

  drop.onclick = () => fileIn.click();
  fileIn.onchange = () => pick(fileIn.files[0]);
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
  pw.oninput = refreshRun;
  // Enter inside the password field triggers the import.
  pw.onkeydown = e => { if (e.key === 'Enter' && !runBtn.disabled) runBtn.click(); };

  dlBtn.onclick = () => { if (parsed) _impDownload(parsed); };

  runBtn.onclick = async () => {
    runBtn.disabled = true; pw.disabled = true; drop.style.pointerEvents = 'none';
    prog.style.display = ''; bar.style.width = '5%'; dlBtn.style.display = 'none';
    setMsg(T('Loading the reader…'));
    try {
      const { data, stats } = await slpImportParse(file, pw.value.trim(), (label, frac) => {
        setMsg(label); bar.style.width = Math.max(5, Math.round(frac * 100)) + '%';
      });
      parsed = data;
      dlBtn.style.display = '';
      setMsg(T('Parsed') + ' ' + stats.days + ' ' + T('days') + ' (' + stats.first + ' → ' + stats.last + '). ' + T('Saving…'));
      try {
        await slpImportUpload(data);
        setMsg('✅ ' + T('Updated everywhere.') + ' ' + stats.days + ' ' + T('days saved') + ' (' + stats.first + ' → ' + stats.last + ').', 'ok');
      } catch (e) {
        // Parsing worked; only the server write failed (e.g. Supabase offline).
        // The section still updates locally and the download button is offered.
        const off = e && (e.message === 'not_configured' || (e.info && e.info.error === 'upstream_error'));
        setMsg('⚠️ ' + T('Parsed and updated on this device, but the server copy could not be saved') + (off ? ' ' + T('(sleep database is offline — use Download and deploy, or try again once it is back).') : '.') + ' — ' + (e.message || ''), 'warn');
      }
      // Refresh the section from the freshly parsed data, no reload.
      try {
        _slpData = data;
        _slpNights = data.rows.map(r => { const o = {}; data.cols.forEach((k, i) => { o[k] = r[i]; }); return o; });
        if (typeof clearAISummary === 'function') clearAISummary();
        const body = document.getElementById('sleepBody');
        if (body && typeof _slpDraw === 'function') { _slpDraw(_slpNights, body); wireSleepImport(); }
      } catch (e) { console.error('sleep refresh after import failed', e); }
    } catch (e) {
      console.error('sleep import failed', e);
      setMsg('❌ ' + (e.message || T('Import failed.')), 'err');
    } finally {
      pw.disabled = false; drop.style.pointerEvents = ''; refreshRun();
      setTimeout(() => { prog.style.display = 'none'; }, 1200);
    }
  };
}

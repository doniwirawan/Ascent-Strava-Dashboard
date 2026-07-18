/* ── SEGMENT INTELLIGENCE ─────────────────────────────────────────────────────
   For each starred segment, fetches the athlete's effort history
   (/segments/{id}/all_efforts) and finds which segments you're closest to
   PR-ing, which are improving fastest, and which have stagnated — with a rough
   next-PR probability. On-demand + owner-gated: per-segment effort fetches spend
   the app-shared Strava rate limit, same policy as Power Curve. Results cached. */

const SI_KEY = 'seg_intel_v1';
const SI_MAX = 15;   // cap segments fetched per run

function _segFmtGap(g) {
  g = Math.round(g);
  return g < 60 ? g + 's' : Math.floor(g / 60) + 'm' + String(g % 60).padStart(2, '0') + 's';
}

// Pure: effort list [{t,date}] → PR/recent/gap/improve/next-PR%. null if thin.
function _segMetrics(efforts) {
  if (!efforts || efforts.length < 3) return null;
  const sorted = efforts.filter(e => e.t > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (sorted.length < 3) return null;
  const times = sorted.map(e => e.t);
  const pr = Math.min(...times);
  const n = sorted.length;
  const k = Math.max(1, Math.floor(n / 3));
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const recent = sorted.slice(-k).map(e => e.t);
  const older = sorted.slice(0, k).map(e => e.t);
  const recentMean = mean(recent), olderMean = mean(older);
  const recentBest = Math.min(...recent);
  const gap = Math.max(0, recentBest - pr);
  const improvePct = olderMean > 0 ? (olderMean - recentMean) / olderMean * 100 : 0;
  let prob;
  if (gap <= 0) prob = 0.9;
  else { const gf = gap / pr; prob = Math.max(0.05, Math.min(0.9, (1 - gf * 30) * 0.7 + (improvePct > 0 ? 0.15 : 0))); }
  return { pr, recentBest, gap, improvePct: +improvePct.toFixed(1), prob: Math.round(prob * 100), count: n };
}

function _segIntelSig(starred) { return (starred || []).length + ':' + ((starred && starred[0] && starred[0].id) || ''); }

function _segIntelMarkup(data, stopped) {
  const segs = data.segs || [];
  if (!segs.length) return '<div class="tr-basis-note">No starred segments with enough effort history yet.</div>';
  const closest = segs.slice().sort((a, b) => a.gap - b.gap).slice(0, 5);
  const improving = segs.filter(s => s.improvePct > 2).sort((a, b) => b.improvePct - a.improvePct).slice(0, 5);
  const stagnating = segs.filter(s => Math.abs(s.improvePct) <= 2 && s.count >= 5).slice(0, 5);
  const group = (title, items, fmt) => items.length ? `<div class="si-group"><div class="si-title">${title}</div>${items.map(fmt).join('')}</div>` : '';
  let html = '';
  html += group('Closest to a PR', closest, s => `<div class="si-row"><span class="si-name">${s.name}</span><span class="si-meta">${s.gap <= 0 ? 'at your PR' : '+' + _segFmtGap(s.gap) + ' behind'} · <b>${s.prob}%</b> chance</span></div>`);
  html += group('Improving fastest', improving, s => `<div class="si-row"><span class="si-name">${s.name}</span><span class="si-meta" style="color:#22c55e">▲ ${s.improvePct}% faster</span></div>`);
  html += group('Stagnating', stagnating, s => `<div class="si-row"><span class="si-name">${s.name}</span><span class="si-meta">${s.count} efforts · flat</span></div>`);
  if (stopped) html += '<div class="tr-basis-note">Rate-limited — some segments skipped; reopen later to finish.</div>';
  html += '<div class="tr-basis-note">Next-PR chance is a rough estimate from your recent efforts vs your PR.</div>';
  html += '<button class="tr-ai-btn" style="margin-top:10px" onclick="computeSegmentIntel()">Recompute</button>';
  return html;
}

function segIntelRender(data, body, stopped) { if (body) body.innerHTML = _segIntelMarkup(data, stopped); }

function _trSegIntelHTML() {
  const owner = (typeof _isHrzOwner === 'function') && _isHrzOwner();
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(SI_KEY) || 'null'); } catch {}
  let inner;
  if (cached && cached.segs && cached.segs.length) inner = _segIntelMarkup(cached, false);
  else if (owner) inner = `<div class="tr-basis-note">Analyse your starred segments' effort history — which you're closest to PR-ing, which are improving, and which have stalled.</div>
    <button class="tr-ai-btn" style="margin-top:10px" onclick="computeSegmentIntel()">Analyse my segments</button>`;
  else inner = `<div class="tr-basis-note">Segment intelligence is computed on the owner's device (it fetches per-segment effort history, and Strava's rate limit is shared).</div>`;
  return `<div class="card tr-si">
    <div class="tr-chart-title">Segment Intelligence <span class="gm-hint">closest to PR · improving · stagnating</span></div>
    <div id="segIntelBody">${inner}</div>
  </div>`;
}

let _segIntelRunning = false;
async function computeSegmentIntel() {
  const body = document.getElementById('segIntelBody');
  if (!body || _segIntelRunning) return;
  if (!(typeof _isHrzOwner === 'function' && _isHrzOwner())) {
    body.innerHTML = '<div class="tr-basis-note">Owner-only (fetches per-segment effort history; shared Strava rate limit).</div>';
    return;
  }
  _segIntelRunning = true;
  body.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';

  let starred = [];
  try { const st = await api('/segments/starred?per_page=50'); if (Array.isArray(st)) starred = st; }
  catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) { body.innerHTML = '<div class="tr-basis-note">Rate-limited — try again later.</div>'; _segIntelRunning = false; return; } }
  if (!starred.length) { body.innerHTML = '<div class="tr-basis-note">Star some segments on Strava first, then their effort history can be analysed.</div>'; _segIntelRunning = false; return; }

  const pool = starred.slice(0, SI_MAX);
  const results = [];
  let idx = 0, stopped = false;
  body.innerHTML = `<div class="tr-basis-note si-prog">Analysing… 0/${pool.length}</div>`;
  const worker = async () => {
    while (idx < pool.length) {
      const seg = pool[idx++];
      try {
        const efs = await api('/segments/' + seg.id + '/all_efforts?per_page=200');
        const m = _segMetrics((efs || []).map(e => ({ t: e.elapsed_time, date: e.start_date_local || e.start_date })));
        if (m) results.push({ id: seg.id, name: seg.name, ...m });
      } catch (e) { if (/ 429 /.test(' ' + e.message + ' ')) { stopped = true; return; } }
      const p = body.querySelector('.si-prog'); if (p) p.textContent = `Analysing… ${idx}/${pool.length}`;
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));

  const data = { sig: _segIntelSig(starred), ts: Date.now(), segs: results };
  try { localStorage.setItem(SI_KEY, JSON.stringify(data)); } catch {}
  segIntelRender(data, body, stopped);
  _segIntelRunning = false;
}

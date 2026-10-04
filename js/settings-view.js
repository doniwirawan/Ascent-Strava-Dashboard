/* ── SETTINGS · WHAT TO SHOW ──
   Turn sidebar pages and optional cards off, per browser (localStorage
   'view_off': "page:<sectionId>" or a card key). Everything off gets one
   display:none rule in a <style>, so it works whatever the render code does;
   AI page insights are also skipped (no API call) while they're off. */
const VIEW_CARDS = [
  ['ai',       'AI insight on each page',            '.ai-insight, #ovAiInsight'],
  ['readiness','Readiness (Overview)',               '#readinessCard'],
  ['fun',      'Fun stats & places (Overview)',      '.stat-card.ov-insight'],
  ['sports',   'By-sport breakdown (Overview)',      '#sportBreakdown'],
  ['hrz',      'Heart-rate zones (Overview)',        '#ovHrz'],
  ['spdz',     'Speed zones (Overview)',             '#ovSpdz'],
  ['regency',  'Destinations map (Activities)',      '#regencyCard'],
  ['huawei',   'Only on Huawei (Activities)',        '#huaweiCard'],
  ['bulk',     'Bulk caption tools (Activities)',    '.bulk-tools'],
  ['actSleep', 'Sleep around an activity (activity detail)', '#actSleep'],
];
// pages that can't be turned off: you'd lose the way back here
const VIEW_LOCKED = ['statRow', 'settingsSection'];

function viewOff() { try { return new Set(JSON.parse(localStorage.getItem('view_off') || '[]')); } catch { return new Set(); } }
function isViewOff(key) { return viewOff().has(key); }

function applyView() {
  const sel = [];
  viewOff().forEach(k => {
    if (k.startsWith('page:')) sel.push('.nav-link[onclick*="\'' + k.slice(5) + '\'"]');
    else { const c = VIEW_CARDS.find(x => x[0] === k); if (c) sel.push(c[2]); }
  });
  let st = document.getElementById('viewOffStyle');
  if (!st) { st = document.createElement('style'); st.id = 'viewOffStyle'; document.head.appendChild(st); }
  st.textContent = sel.length ? sel.join(',\n') + ' { display: none !important; }' : '';
}

function _viewSet(key, on) {
  const off = viewOff();
  if (on) off.delete(key); else off.add(key);
  try { localStorage.setItem('view_off', JSON.stringify([...off])); } catch {}
  applyView();
  if (key === 'ai' && on && typeof aiSectionInsight === 'function') aiSectionInsight('statRow');
}

function renderViewSettings() {
  const box = document.getElementById('viewSettings');
  if (!box) return;
  const T = typeof tr === 'function' ? tr : (x => x);
  const off = viewOff(), seen = new Set();
  // the sidebar is the list of pages, in its own order and language
  // pages that don't apply here (a sport with no activities, owner-only pages) carry an inline display:none — leave them out
  const pages = [...document.querySelectorAll('#sidebar .nav-link[onclick*="navScrollTo"]')].filter(b => b.style.display !== 'none').map(b => {
    const id = (/navScrollTo\('([^']+)'/.exec(b.getAttribute('onclick')) || [])[1];
    return id && !seen.has(id) && !VIEW_LOCKED.includes(id) && seen.add(id) ? [id, b.textContent.trim()] : null;
  }).filter(Boolean);
  const row = (key, label) => '<label class="view-row"><input type="checkbox" data-k="' + key + '"' + (off.has(key) ? '' : ' checked') + '><span>' + label + '</span></label>';
  box.innerHTML = '<div class="view-group"><div class="view-h">' + T('Pages') + '</div>' + pages.map(([id, l]) => row('page:' + id, l)).join('') + '</div>'
    + '<div class="view-group"><div class="view-h">' + T('Cards') + '</div>' + VIEW_CARDS.map(([k, l]) => row(k, T(l))).join('') + '</div>';
  box.querySelectorAll('input[data-k]').forEach(cb => cb.onchange = () => _viewSet(cb.dataset.k, cb.checked));
}

applyView();

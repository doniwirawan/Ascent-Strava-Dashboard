/* ── CYCLING PURCHASES (owner only) ──
   Every cycling item bought on Tokopedia / Shopee, from the purchase tracker
   (purchase.doniwirawan.xyz) via the owner-gated /api/purchases. Also feeds the
   Gear "cost per km" as a "parts & gear" line (bikes themselves excluded). */
let _cbItems = null, _cbPromise = null;
let _cbState = { sub: '', small: false, q: '', sort: 'date', dir: -1 };
const CB_SMALL = 100000; // "small stuff" = under Rp100.000

function cbIsOwner() { try { return localStorage.getItem('strava_athlete_id') === OWNER_ATHLETE_ID && !!CONFIG.accessToken; } catch { return false; } }
// the bikes themselves (e.g. a whole road bike order) — priced separately in Gear
const cbIsBike = x => x.sub === 'Frame & bike' && (x.paid || 0) >= 5000000;
const cbRp = v => 'Rp' + Math.round(v || 0).toLocaleString('id-ID');

function loadCyclingBuys() {
  if (_cbItems) return Promise.resolve(_cbItems);
  if (!cbIsOwner()) return Promise.resolve(null);
  return _cbPromise || (_cbPromise = fetch('/api/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CONFIG.accessToken }) })
    .then(r => r.ok ? r.json() : null).then(d => { _cbItems = d ? d.items.filter(x => !x.cancelled) : null; return _cbItems; })
    .catch(() => null).finally(() => { _cbPromise = null; }));
}

/* Parts & gear total for the Gear cost-per-km (null until loaded / not owner). */
function cyclingPartsCost() {
  if (!_cbItems) return null;
  const parts = _cbItems.filter(x => !cbIsBike(x)), bikes = _cbItems.filter(cbIsBike);
  return { total: parts.reduce((s, x) => s + (x.paid || 0), 0), count: parts.length, bikes: bikes.map(x => x.item) };
}

async function renderCyclingBuys() {
  const el = document.getElementById('cyclingBuysBody');
  if (!el) return;
  if (!cbIsOwner()) { el.innerHTML = ''; return; }
  if (!_cbItems) el.innerHTML = '<div class="chart-note">' + tr('Loading your purchases…') + '</div>';
  const items = await loadCyclingBuys();
  if (!items) { el.innerHTML = '<div class="chart-note">' + tr('Purchase data unavailable right now.') + '</div>'; return; }
  const T = tr, TF = trf, sum = a => a.reduce((s, x) => s + (x.paid || 0), 0);
  const orders = a => new Set(a.map(x => x.site + x.order_id)).size;
  const parts = items.filter(x => !cbIsBike(x)), small = items.filter(x => x.paid < CB_SMALL);
  const tools = items.filter(x => x.sub === 'Tools & maintenance');
  const big = items.slice().sort((a, b) => b.paid - a.paid)[0];
  const subs = {}; items.forEach(x => { (subs[x.sub] = subs[x.sub] || []).push(x); });
  const subList = Object.entries(subs).map(([k, v]) => ({ k, v, s: sum(v) })).sort((a, b) => b.s - a.s);
  const maxS = Math.max(1, ...subList.map(s => s.s));
  const years = {}; items.forEach(x => { const y = x.date ? x.date.slice(0, 4) : T('unknown'); years[y] = (years[y] || 0) + (x.paid || 0); });

  const kpi = (l, v, s) => `<div class="cb-kpi"><div class="cb-l">${T(l)}</div><div class="cb-v">${v}</div><div class="cb-s">${s || ''}</div></div>`;
  el.innerHTML = `
    <div class="cb-kpis">
      ${kpi('Total cycling spend', cbRp(sum(items)), TF('{0} items · {1} orders', items.length, orders(items)))}
      ${kpi('Parts & gear (excl. bikes)', cbRp(sum(parts)), TF('{0} items', parts.length))}
      ${kpi('Tools & maintenance', cbRp(sum(tools)), TF('{0} items', tools.length))}
      ${kpi('Small stuff (< Rp100rb)', cbRp(sum(small)), TF('{0} items', small.length))}
      ${big ? kpi('Biggest buy', cbRp(big.paid), big.item.replace(/</g, '&lt;')) : ''}
    </div>
    <div class="cb-years">${Object.entries(years).sort().map(([y, v]) => `<span><b>${y}</b> ${cbRp(v)}</span>`).join('')}</div>
    <div class="cb-subs">${subList.map(s => `<button type="button" class="cb-sub${_cbState.sub === s.k ? ' on' : ''}" data-sub="${s.k}">
        <span class="cb-sub-top"><span>${T(s.k)}</span><b>${cbRp(s.s)}</b></span>
        <span class="cb-bar"><span style="width:${(s.s / maxS * 100).toFixed(1)}%"></span></span>
        <span class="cb-sub-n">${TF('{0} items', s.v.length)}</span></button>`).join('')}</div>
    <div class="cb-filters">
      <input type="search" id="cbSearch" placeholder="${T('Search cycling purchases…')}" value="${_cbState.q.replace(/"/g, '&quot;')}">
      <label class="chk"><input type="checkbox" id="cbSmall"${_cbState.small ? ' checked' : ''}> ${T('Small stuff only')}</label>
      ${_cbState.sub ? `<button type="button" class="act-reg-tag on" id="cbClear">${T(_cbState.sub)} ✕</button>` : ''}
      <span class="dt-count" id="cbCount"></span>
    </div>
    <div class="dt-wrap"><table class="dt" id="cbTable"></table></div>`;
  el.querySelectorAll('.cb-sub').forEach(b => b.onclick = () => { _cbState.sub = _cbState.sub === b.dataset.sub ? '' : b.dataset.sub; renderCyclingBuys(); });
  const clr = document.getElementById('cbClear'); if (clr) clr.onclick = () => { _cbState.sub = ''; renderCyclingBuys(); };
  document.getElementById('cbSearch').oninput = e => { _cbState.q = e.target.value; cbTable(items); };
  document.getElementById('cbSmall').onchange = e => { _cbState.small = e.target.checked; cbTable(items); };
  cbTable(items);
}

function cbTable(items) {
  const q = _cbState.q.trim().toLowerCase();
  const list = items.filter(x => (!_cbState.sub || x.sub === _cbState.sub) && (!_cbState.small || x.paid < CB_SMALL)
    && (!q || (x.item + ' ' + x.shop + ' ' + x.variant + ' ' + x.sub).toLowerCase().includes(q)));
  const k = _cbState.sort;
  list.sort((a, b) => { const x = a[k], y = b[k]; if (x == null || x === '') return 1; if (y == null || y === '') return -1;
    return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * _cbState.dir; });
  const cols = [['date', 'Date'], ['item', 'Item'], ['sub', 'Part'], ['shop', 'Shop'], ['site', 'Site'], ['qty', 'Qty', 1], ['paid', 'Paid', 1]];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = document.getElementById('cbTable');
  t.innerHTML = '<thead><tr>' + cols.map(([c, l, n]) => `<th class="${n ? '' : 'dt-txt'}${k === c ? ' dt-on' : ''}" data-k="${c}">${tr(l)}${k === c ? (_cbState.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>'
    + list.map(x => `<tr><td class="dt-txt">${x.date || '?'}${x.date_approx && x.date ? '~' : ''}</td>
      <td class="dt-txt cb-item" title="${esc(x.item)}">${esc(x.item)}${x.variant ? `<small>${esc(x.variant)}</small>` : ''}${cbIsBike(x) ? ' <span class="cb-bike">' + tr('bike') + '</span>' : ''}</td>
      <td class="dt-txt">${esc(tr(x.sub))}</td><td class="dt-txt">${esc(x.shop)}</td><td class="dt-txt">${x.site}</td>
      <td>${x.qty}</td><td><b>${cbRp(x.paid)}</b></td></tr>`).join('') + '</tbody>';
  t.querySelectorAll('th').forEach(th => th.onclick = () => { const c = th.dataset.k; _cbState.dir = _cbState.sort === c ? -_cbState.dir : (['item', 'sub', 'shop', 'site'].includes(c) ? 1 : -1); _cbState.sort = c; cbTable(items); });
  document.getElementById('cbCount').textContent = trf('{0} items · {1}', list.length, cbRp(list.reduce((s, x) => s + (x.paid || 0), 0)));
}

/* ── LOCATION FOR ACTIVITIES WITHOUT GPS ──
   A pool swim or a badminton session has no route, so nothing knows where it
   happened. The activity detail lets you type the place ("Nordcom Two,
   Singapore"); it's looked up on Nominatim and kept as the activity's
   route_places (manual: true) — the same field GPS activities get — so the
   activity list, the villages/places list and the destinations map pick it
   up. Saved with the other places (localStorage + the synced activity cache).
   Strava itself isn't changed: its API has no location field. */
function renderManualPlace(a) {
  const el = document.getElementById('actManualPlace');
  if (!el) return;
  const T = typeof tr === 'function' ? tr : (x => x);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const show = msg => {
    const rp = a.route_places;
    el.innerHTML = (rp && rp.start_place
      ? '📍 ' + esc(rp.start_place) + (rp.start_kab && rp.start_kab !== rp.start_place ? ' <span class="mp-sub">' + esc([rp.start_kab, rp.country].filter(Boolean).join(', ')) + '</span>' : '') + ' '
      : '<span class="mp-sub">' + T('No GPS — where was this?') + '</span> ')
      + '<button type="button" class="mp-btn">' + T(rp && rp.start_place ? 'Change' : 'Set location') + '</button>'
      + (msg ? ' <span class="mp-sub">' + esc(msg) + '</span>' : '');
    el.querySelector('.mp-btn').onclick = edit;
  };
  const edit = () => {
    const rp = a.route_places;
    el.innerHTML = '<input class="hw-name mp-in" type="text" placeholder="' + esc(T('e.g. Nordcom Two, Singapore')) + '" value="' + esc(rp && rp.manual ? rp.start_place : '') + '">'
      + '<button type="button" class="seg-scan mp-save">' + T('Save') + '</button>'
      + (rp && rp.manual ? '<button type="button" class="mp-btn mp-clear">' + T('Remove') + '</button>' : '')
      + '<button type="button" class="mp-btn mp-cancel">' + T('Cancel') + '</button>';
    const inp = el.querySelector('.mp-in'), save = el.querySelector('.mp-save');
    inp.focus();
    const go = async () => {
      if (!inp.value.trim()) return;
      save.disabled = true; save.textContent = T('Looking it up…');
      const found = await setManualPlace(a, inp.value);
      show(found ? '' : T('Saved, but not found on the map — try adding the city or country.'));
    };
    save.onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') show(); };
    el.querySelector('.mp-cancel').onclick = () => show();
    const clr = el.querySelector('.mp-clear');
    if (clr) clr.onclick = () => { clearManualPlace(a); show(); };
  };
  show();
}

async function setManualPlace(a, text) {
  const q = text.trim();
  const hits = typeof _geoThrottled === 'function'
    ? await _geoThrottled(() => fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
        .then(r => r.ok ? r.json() : []).catch(() => []))
    : [];
  const hit = hits && hits[0];
  // kecamatan / kabupaten (or district / region abroad) the same way GPS places get them
  const pv = hit && typeof placeVillage === 'function' ? await placeVillage(+hit.lat, +hit.lon) : null;
  const rp = { v: PLACES_V, manual: true, start_place: q,
    start_kec: (pv && pv.kec) || '', start_kab: (pv && pv.kab) || '', cc: (pv && pv.cc) || '', country: (pv && pv.country) || '',
    lat: hit ? +hit.lat : null, lng: hit ? +hit.lon : null };
  _manualPlaceStore(a, rp);
  return !!hit;
}

function clearManualPlace(a) { _manualPlaceStore(a, null); }

function _manualPlaceStore(a, rp) {
  if (rp) a.route_places = rp; else delete a.route_places;
  const m = _placesMap(); if (rp) m[a.id] = rp; else delete m[a.id]; _placesSave(m);
  // the destinations map memoises each activity's point and area
  if (typeof _regOf !== 'undefined') { delete _regOf[a.id]; delete _regPoint[a.id]; delete _regPiece[a.id]; }
  if (typeof aiSyncCache === 'function') aiSyncCache();
  if (typeof _placesRefreshUI === 'function') _placesRefreshUI(true);
}

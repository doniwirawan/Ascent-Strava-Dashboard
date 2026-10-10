/* ── CHASE ROUTES (owner only) ────────────────────────────────────────────────
   The page is the AI route generator card (js/chase-ai.js): describe a ride, or
   tap a regency for a live loop through its never-ridden roads. Everything is
   worked out in the browser from the current rides, so it is never out of date
   (the old offline per-regency loops went stale as soon as a road was ridden).
   Rendered once and kept, so the request, options and result survive revisits. */
function renderChase() {
  const body = document.getElementById('chaseBody');
  if (!body) return;
  if (!_slpIsOwner()) { body.innerHTML = ''; return; }
  if (body.querySelector('.cai-card') || typeof chaseAiCard !== 'function') return;
  body.innerHTML = chaseAiCard();
  if (_caiSaved().length) chaseAiShow(0);   // the last route, ready to look at again
}

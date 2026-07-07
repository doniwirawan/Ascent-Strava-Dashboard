/* ── PWA INSTALL PROMPT ──
   Shows a hideable "Install app" pill on mobile when the browser offers the
   beforeinstallprompt event. Dismissal is remembered so it stays hidden. */
(function () {
  const pill    = document.getElementById('installPill');
  const btn     = document.getElementById('installBtn');
  const dismiss = document.getElementById('installDismiss');
  if (!pill || !btn) return;

  let deferred = null;
  const DISMISS_KEY = 'pwa_install_dismissed';
  const ovBtn = document.getElementById('installBtnOv'); // Overview install button

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function show() {
    if (isStandalone) return;
    try { if (localStorage.getItem(DISMISS_KEY) === '1') return; } catch {}
    pill.style.display = 'flex';
  }
  function hide() { pill.style.display = 'none'; }

  // The Overview banner is unaffected by the pill's dismissal — it's an
  // explicit action, so we surface it whenever an install prompt is available.
  function showOverview() {
    if (isStandalone) { window._pwaInstallReady = false; return; }
    window._pwaInstallReady = true;
    const wrap = document.getElementById('ovInstall');
    // only reveal if the user is actually on the Overview section
    if (wrap && document.getElementById('statRow') &&
        getComputedStyle(document.getElementById('statRow')).display !== 'none') {
      wrap.style.display = '';
    }
  }
  function hideOverview() {
    window._pwaInstallReady = false;
    const wrap = document.getElementById('ovInstall');
    if (wrap) wrap.style.display = 'none';
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    show();
    showOverview();
  });

  async function doPrompt() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    hide();
    hideOverview();
  }

  btn.addEventListener('click', doPrompt);
  if (ovBtn) ovBtn.addEventListener('click', doPrompt);

  dismiss.addEventListener('click', () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    hide();
  });

  window.addEventListener('appinstalled', () => { hide(); hideOverview(); });
})();

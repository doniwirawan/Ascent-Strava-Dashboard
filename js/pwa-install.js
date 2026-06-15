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

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function show() {
    if (isStandalone) return;
    try { if (localStorage.getItem(DISMISS_KEY) === '1') return; } catch {}
    pill.style.display = 'flex';
  }
  function hide() { pill.style.display = 'none'; }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    show();
  });

  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    hide();
  });

  dismiss.addEventListener('click', () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    hide();
  });

  window.addEventListener('appinstalled', hide);
})();

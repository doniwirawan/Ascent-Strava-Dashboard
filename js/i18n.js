/* ── DUAL LANGUAGE (EN / ID) ──
   English is the source text in the HTML. Indonesian translations live in I18N.id
   keyed by data-i18n. Language auto-detects (Indonesia → ID, otherwise EN) and is
   remembered in localStorage; a toggle in the landing nav switches it. */

const I18N = {
  id: {
    'nav.connect': 'Hubungkan',
    'hero.h1': 'Data Strava Anda,<br><span class="accent">disajikan dengan indah.</span>',
    'hero.sub': 'Ascent mengubah aktivitas bersepeda dan lari Anda menjadi dasbor analitik yang cepat dan privat — statistik, tren, peta panas, segmen, milestone — plus studio untuk berbagi kartu aktivitas 9:16 yang memukau.',
    'cta.connect': 'Hubungkan dengan Strava',
    'hero.note': 'Gratis · Privat · Tanpa akun baru — masuk dengan Strava Anda',
    'step1.h': 'Hubungkan dengan Strava',
    'step1.p': 'Otorisasi dengan aman melalui login resmi Strava. Kami tidak pernah melihat kata sandi Anda.',
    'step2.h': 'Kami olah — di browser Anda',
    'step2.p': 'Seluruh riwayat Anda dimuat sekali dan di-cache, jadi dihitung secara lokal dan terbuka instan di kunjungan berikutnya.',
    'step3.h': 'Jelajahi & bagikan',
    'step3.p': 'Selami statistik dan peta Anda, lalu ekspor kartu cerita siap-bagikan dari aktivitas apa pun.',
    'feat.h2': 'Dibangun di sekitar Studio Cerita',
    'feat.sub': 'Dasbor analitik lengkap — dengan studio kartu-bagikan sebagai bintang utamanya.',
    'feat1.h': 'Studio Kartu Cerita <span class="flag">unggulan</span>',
    'feat1.p': 'Ubah aktivitas bersepeda atau lari apa pun menjadi kartu bagikan 9:16 yang menakjubkan — 28 template, tema warna, foto latar Anda sendiri, peta topografi asli, dan editor seret-dan-lepas. Inilah inti dari Ascent.',
    'feat2.h': 'Ikhtisar & Tren',
    'feat2.p': 'Total, rata-rata, jarak mingguan/bulanan, dan tren kecepatan/pace bergulir untuk bersepeda dan lari.',
    'feat3.h': 'Peta Panas',
    'feat3.p': 'Setiap jejak GPS ditumpuk di peta interaktif — jalan yang paling sering Anda lalui bersinar paling terang.',
    'feat4.h': 'Segmen & KOM',
    'feat4.p': 'Segmen berbintang Anda dengan PR, status KOM/QOM dan VAM, masing-masing dengan peta yang dapat diperbesar.',
    'feat5.h': 'Eddington & Milestone',
    'feat5.p': 'Angka Eddington Anda, rentetan hari, serta milestone jarak/elevasi bernama beserta progresnya.',
    'feat6.h': '100% sisi-klien',
    'feat6.p': 'Data Anda tidak pernah meninggalkan browser — tidak ada yang disimpan di server kami. Tanpa iklan, tanpa jual data, putuskan koneksi sekali klik.',
    'action.h2': 'Lihat langsung',
    'action.sub': 'Geser melihat tampilan nyata — dimulai dari studio kartu-bagikan (data contoh).',
    'faq.h2': 'FAQ Data & Privasi',
    'faq.sub': 'Pertanyaan yang semua orang ajukan sebelum menghubungkan akun.',
    'faq1.q': 'Apa itu Ascent?',
    'faq1.a': 'Ascent adalah <b>aplikasi web gratis dan independen yang mengubah riwayat aktivitas Strava Anda menjadi dasbor analitik pribadi dan studio kartu-bagikan</b>. Aplikasi ini memvisualisasikan aktivitas bersepeda dan lari Anda — total, tren, peta panas, segmen, kalender, angka Eddington, dan milestone — serta memungkinkan Anda membuat gambar cerita 9:16 yang dapat dibagikan dari aktivitas apa pun. Semuanya berjalan di browser Anda, tidak ada yang disimpan di server, dan tidak berafiliasi dengan Strava.',
    'faq2.q': 'Apakah Anda mengumpulkan data saya?',
    'faq2.a': 'Hanya data Strava Anda sendiri, dan hanya setelah Anda mengotorisasi aplikasi melalui login aman Strava (OAuth). Kami menggunakannya untuk menampilkan statistik kepada <i>Anda</i> — tidak lebih. Kami tidak pernah melihat kata sandi Strava Anda, dan kami tidak mengumpulkan info pembayaran.',
    'faq3.q': 'Bagaimana data saya diproses?',
    'faq3.a': 'Hampir semuanya (statistik, grafik, peta, gambar cerita) dihitung <b>di browser Anda</b>. Aktivitas terbaru Anda di-cache agar aplikasi memuat instan saat kunjungan berikutnya. Satu-satunya data yang pernah <i>ditulis</i> kembali ke Strava adalah penetapan ulang perlengkapan — dan hanya jika Anda memilihnya.',
    'faq4.q': 'Di mana data saya disimpan?',
    'faq4.a': 'Hanya di <b>perangkat Anda</b> — penyimpanan browser Anda menyimpan token login, preferensi, dan salinan aktivitas terbaru. <b>Tidak ada yang disimpan di server kami</b> — tidak ada basis data aktivitas, dan token Anda tidak pernah disimpan di sisi server. 100% sisi-klien. Kata sandi Anda tidak pernah disimpan.',
    'faq5.q': 'Apakah Ascent aman? Bagaimana keamanannya?',
    'faq5.a': 'Beberapa cara: <b>(1)</b> data dan token Anda hanya ada di browser Anda — tidak ada basis data sisi server yang bisa dibobol. <b>(2)</b> Kami tidak pernah melihat kata sandi Strava Anda; Anda masuk melalui OAuth milik Strava sendiri. <b>(3)</b> <i>Client secret</i> rahasia Strava aplikasi disimpan di server dan tidak pernah dikirim ke browser, sehingga tidak bisa diambil dari halaman. <b>(4)</b> Satu-satunya langkah server adalah fungsi kecil yang menyelesaikan pertukaran token Strava — meneruskan kode/token Anda ke Strava dan tidak menyimpan apa pun. <b>(5)</b> Lalu lintas menggunakan HTTPS, izin minimal, dan Anda bisa menghapus semuanya kapan saja dengan <b>Putuskan Koneksi</b>.',
    'faq6.q': 'Mengapa token saya tidak disimpan di server?',
    'faq6.a': 'Tidak perlu — dan menjaganya tetap di luar server kami lebih aman. Token akses/refresh Anda disimpan di <b>browser Anda</b> dan dikirim langsung dari browser Anda ke Strava. Satu-satunya yang kami simpan di sisi server adalah <i>client secret</i> aplikasi (agar tetap tersembunyi); pertukaran token yang menggunakannya terjadi sesaat dan tidak menyimpan apa pun.',
    'faq7.q': 'Apakah Anda menjual atau membagikan data saya?',
    'faq7.a': '<b>Tidak.</b> Kami tidak pernah menjual, menyewakan, menukar, atau membagikan data pribadi Anda untuk iklan atau pemasaran, dan kami tidak membangun profil untuk pihak ketiga.',
    'faq8.q': 'Izin apa yang diminta?',
    'faq8.a': '<code>read</code>, <code>activity:read_all</code>, dan <code>profile:read_all</code> untuk membaca aktivitas & profil Anda, plus <code>activity:write</code> — digunakan <i>hanya</i> saat Anda menetapkan ulang perlengkapan sendiri.',
    'faq9.q': 'Bisakah saya menghapus data atau memutus koneksi?',
    'faq9.a': 'Ya, kapan saja. Gunakan <b>Putuskan Koneksi</b> di aplikasi untuk menghapus token dan data cache perangkat ini, dan cabut akses sepenuhnya di <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener">Strava → My Apps</a>. Karena tidak ada yang disimpan di server kami, itu sudah cukup.',
    'faq10.q': 'Apakah ini aplikasi Strava resmi?',
    'faq10.a': 'Bukan. Ascent adalah dasbor independen, gratis, untuk penggunaan pribadi atas data Strava Anda sendiri. Aplikasi ini <b>tidak berafiliasi dengan, didukung oleh, atau disponsori oleh Strava, Inc.</b>',
    'cta.h2': 'Siap melihat tahun Anda bergerak?',
    'foot.privacy': 'Kebijakan Privasi',
    'foot.terms': 'Ketentuan Layanan',
    'foot.disclaim': 'Ascent bersifat independen dan tidak berafiliasi dengan, didukung oleh, atau disponsori oleh Strava, Inc.',
  },
};

/* ── In-app chrome: translated by matching the English source text in the DOM
   (nav links, section titles, static stat-card labels & subs). The English
   text stays in the HTML; this map provides the Indonesian. ── */
const APP_ID = {
  // sidebar nav + groups + actions
  'Overview': 'Ikhtisar', 'Cycling': 'Bersepeda', 'Running': 'Lari', 'Trends': 'Tren',
  'Best Efforts': 'Upaya Terbaik', 'Eddington': 'Eddington', 'Activities': 'Aktivitas',
  'Calendar': 'Kalender', 'Monthly': 'Bulanan', 'Photos': 'Foto', 'Heatmap': 'Peta Panas',
  'Segments': 'Segmen', 'Gear': 'Perlengkapan', 'Milestones': 'Milestone', 'Rewind': 'Kilas Balik',
  'Trophies': 'Trofi', 'Help & Data': 'Bantuan & Data',
  'Performance': 'Performa', 'Explore': 'Jelajahi', 'History': 'Riwayat', 'About': 'Tentang',
  'Share Story': 'Bagikan Cerita', 'Refresh': 'Segarkan', 'Disconnect': 'Putuskan',
  'Save Image': 'Simpan Gambar', 'Athlete': 'Atlet',
  // section titles
  'Cycling Performance': 'Performa Bersepeda', 'Running Performance': 'Performa Lari',
  'Activity Calendar — Last 12 Months': 'Kalender Aktivitas — 12 Bulan Terakhir',
  'Eddington Number': 'Angka Eddington', 'Monthly Stats': 'Statistik Bulanan',
  'Activity Heatmap': 'Peta Panas Aktivitas', 'Starred Segments': 'Segmen Berbintang',
  'Year in Review': 'Kilas Balik Tahun', 'Trophies & KOMs': 'Trofi & KOM',
  // stat-card labels (static)
  'Distance': 'Jarak', 'Moving Time': 'Waktu Bergerak', 'Elevation': 'Elevasi',
  'Rides': 'Gowes', 'Runs': 'Lari', 'Kudos': 'Kudos', 'PRs': 'PR', 'Achievements': 'Pencapaian',
  'Avg Heart Rate': 'Detak Jantung Rata-rata', 'Best Streak': 'Rentetan Terbaik',
  'Consistency': 'Konsistensi', 'Calories': 'Kalori',
  // stat-card subs (static)
  'all time': 'sepanjang waktu', 'total gain': 'total tanjakan', 'cycling': 'bersepeda',
  'running': 'lari', 'received': 'diterima', 'personal records': 'rekor pribadi',
  'total': 'total', 'days in a row': 'hari berturut-turut', 'weekly regularity': 'keteraturan mingguan',
  'total kcal': 'total kkal',
};

/* ── Strings built in JS (Overview stat labels/subs), via window.t(key) ── */
const I18N_JS = {
  en: { longRide: 'Longest Ride', longRun: 'Longest Run', avgSpeed: 'Avg Speed', avgPace: 'Avg Pace',
        maxSpeed: 'Max Speed', bestPace: 'Best Pace', riding: 'riding', hours: 'hours',
        cycling: 'cycling', running: 'running', avg: 'avg' },
  id: { longRide: 'Gowes Terjauh', longRun: 'Lari Terjauh', avgSpeed: 'Kecepatan Rata-rata', avgPace: 'Pace Rata-rata',
        maxSpeed: 'Kecepatan Maks', bestPace: 'Pace Terbaik', riding: 'gowes', hours: 'jam',
        cycling: 'bersepeda', running: 'lari', avg: 'rata-rata' },
};

let _lang = 'en';
window.t = function (key) {
  const d = I18N_JS[_lang] || {};
  if (d[key] != null) return d[key];
  return (I18N_JS.en && I18N_JS.en[key] != null) ? I18N_JS.en[key] : key;
};

(function () {
  const i18nNodes = document.querySelectorAll('[data-i18n]');
  const enHTML = new Map();
  i18nNodes.forEach(el => enHTML.set(el, el.innerHTML));

  // capture English source text nodes for the in-app chrome (skip dynamic
  // stat labels/subs — those carry an id and are rewritten by render code)
  const appNodes = [];
  const grab = el => el.childNodes.forEach(n => {
    if (n.nodeType === 3 && n.nodeValue.trim()) appNodes.push({ n, en: n.nodeValue });
  });
  document.querySelectorAll('.section-title, .sidebar-group-label, .sidebar-act, .sidebar-user-sub, .nav-link, #saveImgBtn, #shareBtn, #logoutBtn').forEach(grab);
  document.querySelectorAll('.s-label, .s-sub').forEach(el => { if (!el.id) grab(el); });

  function detect() {
    try { const saved = localStorage.getItem('lang'); if (saved) return saved; } catch {}
    const langs = (navigator.languages || [navigator.language || '']).join(',').toLowerCase();
    if (langs.includes('id') || langs.includes('in-id')) return 'id';
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (/^Asia\/(Jakarta|Pontianak|Makassar|Jayapura)/.test(tz)) return 'id';
    } catch {}
    return 'en';
  }

  function apply(lang) {
    _lang = lang;
    const dict = I18N[lang];
    i18nNodes.forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.innerHTML = (dict && dict[key] != null) ? dict[key] : enHTML.get(el);
    });
    appNodes.forEach(({ n, en }) => {
      const key = en.trim();
      const tr = APP_ID[key];
      n.nodeValue = (lang === 'id' && tr != null) ? en.replace(key, tr) : en;
    });
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang-toggle button').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === lang));
  }

  _lang = detect();
  apply(_lang);

  document.querySelectorAll('.lang-toggle').forEach(tg => tg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    apply(b.dataset.lang);
    try { localStorage.setItem('lang', b.dataset.lang); } catch {}
    // re-render so JS-built labels (Overview stats) pick up the new language
    if (typeof renderAll === 'function' && typeof acts !== 'undefined' && acts.length) {
      try { renderAll(); } catch {}
    }
  }));
})();

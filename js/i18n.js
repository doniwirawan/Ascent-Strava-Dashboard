/* ── DUAL LANGUAGE (EN / ID) ──
   English is the source text in the HTML. Indonesian translations live in I18N.id
   keyed by data-i18n. Language auto-detects (Indonesia → ID, otherwise EN) and is
   remembered in localStorage; a toggle in the landing nav switches it. */

const I18N = {
  id: {
    'nav.connect': 'Hubungkan',
    'nav.star': 'Bintang',
    'hero.h1': 'Data Strava Anda,<br><span class="accent">disajikan dengan indah.</span>',
    'hero.sub': 'Ascent mengubah aktivitas bersepeda dan lari Anda menjadi dasbor analitik yang cepat dan privat — statistik, tren, heatmap, segmen, milestone — plus studio untuk berbagi kartu aktivitas 9:16 yang memukau.',
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
    'feat1.h': 'Story-card Studio <span class="flag">flagship</span>',
    'feat1.p': 'Ubah aktivitas bersepeda atau lari apa pun menjadi kartu bagikan 9:16 yang menakjubkan — 28 template, tema warna, foto latar Anda sendiri, peta topografi asli, dan editor seret-dan-lepas. Inilah inti dari Ascent.',
    'featAI.h': 'AI Coach',
    'featAI.p': 'Mengobrol dengan pelatih AI yang membaca riwayat latihan Anda — temukan tren, dapatkan saran, dan tulis otomatis judul & caption aktivitas. Pakai penyedia AI Anda sendiri; kuncinya tetap di perangkat Anda.',
    'feat2.h': 'Ikhtisar & Tren',
    'feat2.p': 'Total, rata-rata, jarak mingguan/bulanan, dan tren kecepatan/pace bergulir untuk bersepeda dan lari.',
    'feat3.h': 'Heatmap',
    'feat3.p': 'Setiap jejak GPS ditumpuk di peta interaktif — jalan yang paling sering Anda lalui bersinar paling terang.',
    'feat4.h': 'Segmen & KOM',
    'feat4.p': 'Segmen berbintang Anda dengan PR, status KOM/QOM dan VAM, masing-masing dengan peta yang dapat diperbesar.',
    'feat5.h': 'Eddington & Milestone',
    'feat5.p': 'Angka Eddington Anda, rentetan hari, serta milestone jarak/elevasi bernama beserta progresnya.',
    'feat6.h': '100% client-side',
    'feat6.p': 'Data Anda tidak pernah meninggalkan browser — tidak ada yang disimpan di server kami. Tanpa iklan, tanpa jual data, putuskan koneksi sekali klik.',
    'action.h2': 'Lihat langsung',
    'action.sub': 'Geser melihat tampilan nyata — dimulai dari studio kartu-bagikan (data contoh).',
    'faq.h2': 'FAQ Data & Privasi',
    'faq.sub': 'Pertanyaan yang semua orang ajukan sebelum menghubungkan akun.',
    'faq1.q': 'Apa itu Ascent?',
    'faq1.a': 'Ascent adalah <b>aplikasi web gratis dan independen yang mengubah riwayat aktivitas Strava Anda menjadi dasbor analitik pribadi dan studio kartu-bagikan</b>. Aplikasi ini memvisualisasikan aktivitas bersepeda dan lari Anda — total, tren, heatmap, segmen, kalender, angka Eddington, dan milestone — serta memungkinkan Anda membuat gambar cerita 9:16 yang dapat dibagikan dari aktivitas apa pun. Semuanya berjalan di browser Anda, tidak ada yang disimpan di server, dan tidak berafiliasi dengan Strava.',
    'faq2.q': 'Apakah Anda mengumpulkan data saya?',
    'faq2.a': 'Hanya data Strava Anda sendiri, dan hanya setelah Anda mengotorisasi aplikasi melalui login aman Strava (OAuth) — kami menggunakannya untuk menampilkan statistik kepada <i>Anda</i>. Kami juga memakai analitik yang ramah privasi (Google Analytics) untuk memahami penggunaan yang <i>agregat dan anonim</i> — misalnya fitur mana yang populer — agar dapat menyempurnakan aplikasi; ini tidak pernah mencakup data Strava pribadi Anda. Kami tidak pernah melihat kata sandi Strava Anda, tidak mengumpulkan info pembayaran, dan tidak pernah menjual data Anda.',
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
    'foot.guide': 'Hosting Sendiri',
    'opensource.h2': 'Open source — jalankan salinan Anda sendiri',
    'opensource.sub': 'Ascent gratis dan open source. Fork repo-nya dan deploy salinan pribadi Anda dalam ~10 menit — tanpa biaya.',
    'opensource.guide': 'Panduan pemasangan',
    'opensource.repo': 'Lihat di GitHub',
    // ── "More from the same maker" ──
    'more.h2': 'Aplikasi lain dari pembuat yang sama',
    'more.sub': 'Alat gratis lain yang saya buat untuk pesepeda — atur posisi bersepeda Anda dari video ponsel.',
    'more.desc': 'Unggah video mengayuh dari samping dan dapatkan analisis sudut sendi otomatis (lutut, pinggul, punggung) untuk membantu menyetel tinggi sadel dan jangkauan Anda — langsung di browser, tanpa perlu memasang aplikasi.',
    'more.open': 'Buka Bike Fit Analyzer',
    'more.repo': 'Lihat repo di GitHub',
    'promo.also': 'Juga oleh saya',
    'promo.sub': 'Analisis posisi bersepeda Anda dari video ponsel.',
    'foot.creator': 'Dibuat oleh',
    'foot.disclaim': '“Powered by Strava” berarti Ascent dibuat menggunakan API Strava. Ascent adalah aplikasi independen — tidak berafiliasi dengan, didukung oleh, atau disponsori oleh Strava, Inc.',
    // ── Help & Data section ──
    'h.load.t': 'Bagaimana data Anda dimuat',
    'h.load.1': '<b>Sumber.</b> Semuanya berasal dari <b>Strava API</b> resmi menggunakan login Anda sendiri — dasbor ini tidak punya server dan tidak pernah melihat kata sandi Anda.',
    'h.load.2': '<b>Aktivitas.</b> <b>Seluruh riwayat aktivitas</b> Anda diambil (<code>/athlete/activities</code>, per halaman) dan di-cache agar kunjungan berikutnya instan. Angka agregat "sepanjang waktu / YTD / 4 minggu terakhir" di Trofi berasal dari endpoint totals Strava (<code>/athletes/&#123;id&#125;/stats</code>).',
    'h.load.3': '<b>Caching.</b> Hasil di-cache <b>hanya di browser Anda</b> (localStorage) agar kunjungan berikutnya instan — tidak ada yang disimpan di server. Cache disegarkan kira-kira sekali sejam, atau langsung saat Anda menekan <b>Refresh</b>.',
    'h.load.4': '<b>Detail sesuai permintaan.</b> Saat Anda membuka <b>Share Story</b> atau <b>Segmen</b>, data tambahan diambil per item — aktivitas detail (untuk Energi/Kalori/daya), aliran GPS (untuk grafik gelombang), dan rute segmen.',
    'h.load.5': '<b>Satuan.</b> Sakelar <b>km / mi</b> di bilah atas mengonversi setiap jarak, kecepatan, dan elevasi di seluruh aplikasi. Milestone metrik bernama (mis. "1.000 km Club", Everest) sengaja tetap metrik.',
    'h.met.t': 'Arti tiap metrik',
    'h.met.1t': 'Angka Eddington (E)',
    'h.met.1d': '<i>E</i> terbesar di mana Anda telah gowes minimal <i>E</i> km pada <i>E</i> hari berbeda. E=70 berarti 70 gowes ≥70 km. Ukuran kumulatif yang berat untuk hari-hari besar yang konsisten. (Dihitung ulang dalam mil bila mi dipilih.)',
    'h.met.2t': 'Konsistensi',
    'h.met.2d': 'Seberapa <i>merata</i> latihan Anda dari minggu ke minggu, sepanjang rentang aktif Anda (hingga 26 minggu). Nilainya 100·(1 − variasi jumlah aktivitas mingguan Anda), jadi minggu yang sangat tidak merata dan jeda menurunkannya — sekadar aktif hampir tiap minggu saja tidak memberi 100%.',
    'h.met.3t': 'Rentetan Aktivitas / Hari',
    'h.met.3d': 'Rangkaian terpanjang hari kalender berturut-turut dengan setidaknya satu aktivitas.',
    'h.met.4t': 'Waktu Bergerak vs Berlalu',
    'h.met.4d': '<b>Waktu bergerak</b> tidak menghitung jeda/berhenti; <b>waktu berlalu</b> adalah durasi penuh sesuai jam dinding. Statistik di sini memakai waktu bergerak.',
    'h.met.5t': 'Kecepatan Rata-rata / Maks',
    'h.met.5d': 'Kecepatan rata-rata dan puncak yang direkam Strava untuk aktivitas, ditampilkan dalam km/h atau mph.',
    'h.met.6t': 'Pace Terbaik',
    'h.met.6d': 'Metrik pelari — menit per km/mi untuk lari tercepat Anda.',
    'h.met.7t': 'Kadens',
    'h.met.7d': 'Laju kayuhan atau langkah — <b>rpm</b> (putaran per menit) untuk gowes, <b>spm</b> (langkah per menit) untuk lari.',
    'h.met.8t': 'Perolehan Elevasi & Titik Tertinggi',
    'h.met.8d': 'Total meter (atau kaki) yang didaki — jumlah semua bagian menanjak — dan ketinggian tertinggi yang dicapai pada rute.',
    'h.met.9t': 'Daya Rata-rata / Maks / Normal',
    'h.met.9d': 'Untuk gowes dengan power meter: watt rata-rata dan puncak Anda, plus <b>Normalized Power</b> — rata-rata berbobot yang mencerminkan biaya metabolik dari upaya yang berubah-ubah lebih baik daripada rata-rata biasa.',
    'h.met.10t': 'Energi (kJ) & Kalori',
    'h.met.10d': 'Kerja yang dilakukan / energi yang terbakar, dari aktivitas detail Strava (berbasis daya untuk gowes). Beberapa aktivitas tidak punya nilai jika Strava tidak menghitungnya.',
    'h.met.11t': 'Suhu',
    'h.met.11d': 'Suhu lingkungan rata-rata yang direkam perangkat Anda selama aktivitas, bila tersedia.',
    'h.met.12t': 'Suffer Score / Relative Effort',
    'h.met.12d': 'Ukuran Strava tentang seberapa berat sesi, berdasarkan waktu yang dihabiskan di zona detak jantung.',
    'h.met.13t': 'VAM',
    'h.met.13d': 'Velocità Ascensionale Media — kecepatan mendaki vertikal rata-rata Anda dalam meter (atau kaki) per jam, dari waktu PR Anda di sebuah tanjakan. Makin tinggi = tanjakan makin kuat; tanjakan elite ~1.600+ m/jam.',
    'h.met.14t': 'KOM / QOM / CR',
    'h.met.14d': 'King/Queen of the Mountain / Course Record — menjadi yang tercepat sepanjang masa di sebuah segmen. "Ada PR" berarti Anda punya rekor pribadi di segmen itu.',
    'h.met.15t': 'PR & Pencapaian',
    'h.met.15d': 'Rekor pribadi dan trofi yang diberikan Strava pada aktivitas Anda (mis. 5 km tercepat, tanjakan terbesar).',
    'h.met.16t': 'Kudos & Komentar',
    'h.met.16d': '"Suka" dan komentar yang diterima aktivitas Anda dari atlet lain.',
    'h.sec.t': 'Apa yang ditampilkan tiap bagian',
    'h.sec.1t': 'Ikhtisar',
    'h.sec.1d': 'Kartu statistik utama untuk olahraga terpilih — total, rata-rata, upaya terbaik, kudos, dan pencapaian dari aktivitas yang dimuat.',
    'h.sec.2t': 'Bersepeda / Lari',
    'h.sec.2d': 'Performa per olahraga: upaya tercepat Anda, tren kecepatan atau pace pada aktivitas terbaru, dan gowes/lari teratas.',
    'h.sec.3t': 'Tren',
    'h.sec.3d': 'Jarak per minggu dan per bulan, plus grafik kecepatan/pace bergulir, agar Anda bisa melihat arah latihan dari waktu ke waktu.',
    'h.sec.4t': 'Aktivitas',
    'h.sec.4d': 'Aktivitas terbaru Anda sebagai daftar — klik baris mana pun untuk membuka kartu detail lengkapnya — di samping grafik gelembung jarak.',
    'h.sec.5t': 'Kalender',
    'h.sec.5d': 'Grid kontribusi 12 bulan: satu sel per hari, diberi warna sesuai jumlah aktivitas, dengan total hari aktif dan rentetan.',
    'h.sec.6t': 'Eddington',
    'h.sec.6d': 'Angka Eddington Anda dengan grafik berapa hari panjang lagi yang Anda butuhkan untuk mencapai milestone berikutnya.',
    'h.sec.7t': 'Bulanan',
    'h.sec.7d': 'Rincian per bulan tentang jarak, waktu, dan jumlah aktivitas, serta perbandingan berdampingan bulan-bulan terkini.',
    'h.sec.8t': 'Upaya Terbaik',
    'h.sec.8d': 'Aktivitas terpanjang, tercepat, dan dengan tanjakan terbesar Anda, diperingkat.',
    'h.sec.9t': 'Perlengkapan',
    'h.sec.9d': 'Total per sepeda dan per sepatu (jarak dan jumlah), diambil dari perlengkapan yang terdaftar di profil Strava Anda.',
    'h.sec.10t': 'Heatmap',
    'h.sec.10d': 'Peta interaktif dengan setiap jejak GPS rute ditumpuk, sehingga jalan yang paling sering Anda lalui bersinar paling terang.',
    'h.sec.11t': 'Segmen',
    'h.sec.11d': 'Segmen berbintang Anda dengan peta, waktu PR Anda, status KOM/QOM, dan VAM tiap segmen. Ketuk tombol <b>perbesar</b> pada segmen mana pun untuk membuka peta besar yang dapat diperbesar dengan rute penuh dan semua detail.',
    'h.sec.12t': 'Milestone',
    'h.sec.12d': 'Pencapaian jarak dan elevasi bernama (mis. "1.000 km Club", Everest pendakian) dan seberapa dekat Anda ke berikutnya.',
    'h.sec.13t': 'Kilas Balik',
    'h.sec.13d': 'Ringkasan kilas-balik tahun pilihan — total, sorotan, dan aktivitas menonjol.',
    'h.sec.14t': 'Trofi',
    'h.sec.14d': 'Total sepanjang waktu, year-to-date, dan 4 minggu terakhir dari endpoint stats Strava, plus KOM/CR apa pun.',
    'h.sec.15t': 'Foto',
    'h.sec.15d': 'Galeri foto yang terlampir pada aktivitas Anda, terbuka di lightbox layar penuh.',
    'h.sec.16t': 'Share Story',
    'h.sec.16d': 'Buat gambar 9:16 yang dapat dibagikan dari aktivitas apa pun, dengan berbagai layout, tema warna, latar kustom, dan statistik yang bisa dipilih.',
    'h.tips.t': 'Tips',
    'h.tips.1': '<b>Detail aktivitas.</b> Di <b>Aktivitas</b>, klik baris mana pun untuk membuka kartu dengan peta rute, metrik lengkap (kecepatan/pace, daya, detak jantung, kadens, energi, kudos, dan lainnya) serta tautan untuk membukanya di Strava.',
    'h.tips.2': '<b>Mode olahraga.</b> Sakelar <b>Cyclist / Runner</b> menyaring sebagian besar bagian ke olahraga itu, sehingga grafik pace, kecepatan, dan jarak hanya mencerminkan aktivitas tersebut.',
    'h.tips.3': '<b>Refresh.</b> Data di-cache demi kecepatan; tekan <b>Refresh</b> untuk menarik aktivitas terbaru dari Strava seketika.',
    'h.tips.4': '<b>Privasi.</b> Gunakan <b>Disconnect</b> untuk menghapus token dan cache perangkat ini, dan cabut akses sepenuhnya dari <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener" style="color:var(--orange);font-weight:700;">Strava → My Apps</a>.',
    'h.faq.t': 'FAQ — Data & Privasi',
    'h.faq.1t': 'Apa itu Ascent?',
    'h.faq.1d': 'Ascent adalah aplikasi web gratis dan independen yang mengubah riwayat aktivitas Strava Anda menjadi dasbor analitik pribadi dan studio kartu-bagikan — statistik, tren, heatmap, segmen, kalender, angka Eddington, milestone, dan kartu cerita 9:16. Semuanya berjalan di browser Anda dan tidak berafiliasi dengan Strava.',
    'h.faq.2t': 'Apakah Anda mengumpulkan data saya?',
    'h.faq.2d': 'Hanya data Strava Anda sendiri, dan hanya setelah Anda mengotorisasi aplikasi melalui login aman Strava (OAuth) — kami menggunakannya untuk menampilkan statistik kepada <i>Anda</i>. Kami juga memakai analitik ramah privasi (Google Analytics) untuk memahami penggunaan yang agregat dan anonim agar dapat menyempurnakan aplikasi; ini tidak pernah mencakup data Strava pribadi Anda. Kami tidak pernah melihat kata sandi Strava Anda, tidak mengumpulkan info pembayaran, dan tidak pernah menjual data Anda.',
    'h.faq.3t': 'Bagaimana data saya diproses?',
    'h.faq.3d': 'Hampir semuanya (statistik, grafik, peta, gambar cerita) dihitung <b>di browser Anda</b>. Aktivitas terbaru Anda di-cache agar aplikasi memuat instan saat kunjungan berulang. Satu-satunya data yang pernah kami <i>tulis</i> kembali ke Strava adalah penetapan ulang perlengkapan — dan hanya jika Anda secara eksplisit memilihnya.',
    'h.faq.4t': 'Di mana data saya disimpan?',
    'h.faq.4d': 'Hanya di <b>perangkat Anda</b> — di localStorage browser Anda (token login, preferensi, dan salinan aktivitas terbaru Anda). <b>Tidak ada yang disimpan di server kami</b> — tidak ada basis data aktivitas, dan token Anda tidak pernah disimpan di sisi server. Kata sandi Anda tidak pernah disimpan.',
    'h.faq.5t': 'Apakah Ascent aman? Bagaimana keamanannya?',
    'h.faq.5d': 'Data dan token Anda hanya ada di browser Anda (tidak ada basis data sisi server yang bisa dibobol); kami tidak pernah melihat kata sandi Strava Anda; <b>client secret</b> rahasia Strava aplikasi disimpan di server dan tidak pernah dikirim ke browser; satu-satunya langkah server adalah fungsi kecil yang menyelesaikan pertukaran token Strava dan tidak menyimpan apa pun; serta lalu lintas memakai HTTPS dengan izin minimal. Anda bisa menghapus semuanya kapan saja dengan <b>Disconnect</b>.',
    'h.faq.6t': 'Mengapa token saya tidak disimpan di server?',
    'h.faq.6d': 'Tidak perlu, dan lebih aman tanpa itu. Token tetap di <b>browser Anda</b> dan langsung ke Strava. Satu-satunya yang disimpan di sisi server adalah client secret aplikasi (agar tidak bisa dicuri dari halaman); pertukaran yang memakainya berjalan sesaat dan tidak menyimpan apa pun.',
    'h.faq.7t': 'Apakah Anda menjual atau membagikan data saya?',
    'h.faq.7d': '<b>Tidak.</b> Kami tidak pernah menjual, menyewakan, menukar, atau membagikan data pribadi Anda untuk iklan atau pemasaran, dan kami tidak membangun profil untuk pihak ketiga atau memakainya untuk hal yang tidak terkait fitur yang Anda gunakan.',
    'h.faq.8t': 'Izin apa yang diminta aplikasi?',
    'h.faq.8d': '<code>read</code>, <code>activity:read_all</code>, dan <code>profile:read_all</code> (untuk membaca aktivitas & profil Anda), plus <code>activity:write</code> — digunakan <i>hanya</i> saat Anda menetapkan ulang perlengkapan pada aktivitas sendiri.',
    'h.faq.9t': 'Pihak ketiga mana yang terlibat?',
    'h.faq.9d': '<b>Strava</b> (sumber data Anda), <b>Vercel</b> (hosting statis), <b>Google Analytics</b> (penggunaan agregat dan anonim), serta penyedia peta/aset seperti <b>CARTO</b> & <b>OpenStreetMap</b> (yang mungkin melihat alamat IP Anda sebagai bagian normal dari menyajikan peta dan font). Tidak ada basis data sisi server untuk data Anda.',
    'h.faq.10t': 'Bisakah saya menghapus data atau memutus koneksi?',
    'h.faq.10d': 'Ya, kapan saja. Gunakan <b>Disconnect</b> untuk menghapus token dan data cache perangkat ini, dan cabut akses aplikasi sepenuhnya di <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener" style="color:var(--orange);font-weight:700;">Strava → My Apps</a>. Karena tidak ada yang disimpan di server kami, itu menghapus data Anda sepenuhnya.',
    'h.faq.11t': 'Apakah ini aplikasi Strava resmi?',
    'h.faq.11d': 'Bukan. Ascent adalah dasbor independen, gratis, untuk penggunaan pribadi atas data Strava Anda sendiri. Aplikasi ini <b>tidak berafiliasi dengan, didukung oleh, atau disponsori oleh Strava, Inc.</b>',
    'h.faq.more': 'Detail lengkap ada di <a href="/privacy" style="color:var(--orange);font-weight:700;">Kebijakan Privasi</a> dan <a href="/terms" style="color:var(--orange);font-weight:700;">Ketentuan Layanan</a> kami.',
    'h.muted.1': 'Dibangun sebagai situs statis di Vercel. Data aktivitas Anda tetap terkait dengan akun Strava Anda; preferensi km/mi dan Cyclist/Runner disimpan secara lokal di browser Anda.',
    'h.muted.2': 'Aplikasi ini independen dan tidak berafiliasi dengan atau didukung oleh Strava, Inc.',
    'fab.image': 'Gambar', 'fab.story': 'Cerita', 'install.app': 'Pasang aplikasi',
    'eddy.title': 'Angka Eddington Anda',
    'eddy.desc': 'Angka <em>E</em> terbesar di mana Anda telah menyelesaikan <em>E</em> gowes sejauh minimal <em>E</em> km. Metrik yang digemari komunitas bersepeda — awalnya digagas oleh astronom Sir Arthur Eddington.',
  },
};

/* ── In-app chrome: translated by matching the English source text in the DOM
   (nav links, section titles, static stat-card labels & subs). The English
   text stays in the HTML; this map provides the Indonesian. ── */
const APP_ID = {
  // sidebar nav + groups + actions
  'Overview': 'Ikhtisar', 'Cycling': 'Bersepeda', 'Running': 'Lari', 'Trends': 'Tren',
  'Best Efforts': 'Upaya Terbaik', 'Eddington': 'Eddington', 'Activities': 'Aktivitas',
  'Calendar': 'Kalender', 'Monthly': 'Bulanan', 'Photos': 'Foto', 'Heatmap': 'Heatmap',
  'Segments': 'Segmen', 'Gear': 'Perlengkapan', 'Milestones': 'Milestone', 'Rewind': 'Kilas Balik',
  'Trophies': 'Trofi', 'Help & Data': 'Bantuan & Data', 'Training': 'Latihan',
  'Performance': 'Performa', 'Explore': 'Jelajahi', 'History': 'Riwayat', 'About': 'Tentang',
  'Share Story': 'Bagikan Cerita', 'Refresh': 'Segarkan', 'Disconnect': 'Putuskan',
  'Save Image': 'Simpan Gambar', 'Athlete': 'Atlet',
  // section titles
  'Cycling Performance': 'Performa Bersepeda', 'Running Performance': 'Performa Lari',
  'Training Load & Fatigue': 'Beban Latihan & Kelelahan',
  'Activity Calendar — Last 12 Months': 'Kalender Aktivitas — 12 Bulan Terakhir',
  'Eddington Number': 'Angka Eddington', 'Monthly Stats': 'Statistik Bulanan',
  'Activity Heatmap': 'Heatmap Aktivitas', 'Starred Segments': 'Segmen Berbintang',
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
  // card titles (static HTML inside sections)
  'Speed Trend — Last 20 Rides': 'Tren Kecepatan — 20 Gowes Terakhir',
  'Ride Distance Distribution': 'Distribusi Jarak Gowes',
  'Pace Trend — Last 20 Runs': 'Tren Pace — 20 Lari Terakhir',
  'Run Distance Distribution': 'Distribusi Jarak Lari',
  'Weekly Distance (km)': 'Jarak Mingguan (km)',
  'Year-over-Year Monthly Distance (km)': 'Jarak Bulanan Antar-Tahun (km)',
  'Avg Speed by Month (km/h)': 'Kecepatan Rata-rata per Bulan (km/h)',
  'Activity Split': 'Pembagian Aktivitas',
  'Recent Activities': 'Aktivitas Terbaru',
  'Activities by Distance (bubble size = km)': 'Aktivitas berdasarkan Jarak (ukuran = km)',
  'Progress to next Eddington number': 'Progres ke angka Eddington berikutnya',
  // hero cards (Cycling / Running)
  'Fastest Speed (Max)': 'Kecepatan Tertinggi (Maks)', 'Best Avg Speed': 'Kecepatan Rata-rata Terbaik',
  'Avg Elevation': 'Elevasi Rata-rata', 'Total Time': 'Total Waktu',
  'Total Rides': 'Total Gowes', 'Total Runs': 'Total Lari', 'Total Distance': 'Total Jarak',
  'Top 5 Fastest Speeds': '5 Kecepatan Tercepat', 'Top 5 Fastest Pace': '5 Pace Tercepat',
  'Best Pace': 'Pace Terbaik', 'Longest Ride': 'Gowes Terjauh', 'Longest Run': 'Lari Terjauh',
  // activity detail modal stat labels
  'Elapsed': 'Waktu Berlalu', 'Avg Speed': 'Kecepatan Rata-rata', 'Avg Pace': 'Pace Rata-rata',
  'Max Speed': 'Kecepatan Maks', 'Max Pace': 'Pace Maks', 'Highest Pt': 'Titik Tertinggi',
  'Avg Cadence': 'Kadens Rata-rata', 'Avg HR': 'HR Rata-rata', 'Max HR': 'HR Maks',
  'Avg Power': 'Daya Rata-rata', 'Norm Power': 'Daya Normal', 'Max Power': 'Daya Maks',
  'Energy': 'Energi', 'Relative Effort': 'Upaya Relatif', 'Avg Temp': 'Suhu Rata-rata',
  'Comments': 'Komentar',
  // badges + links
  'Commute': 'Komuter', 'Indoor': 'Dalam Ruangan', 'Manual': 'Manual', 'Private': 'Privat', 'Race': 'Balapan',
  'View on Strava ↗': 'Lihat di Strava ↗',
  // calendar
  'activities': 'aktivitas', 'active days': 'hari aktif', 'day streak': 'rentetan hari',
  'busiest day': 'hari tersibuk', 'Less': 'Sedikit', 'More': 'Banyak',
  // monthly table
  'Month': 'Bulan',
  // best efforts
  'Longest Rides': 'Gowes Terjauh', 'Most Elevation': 'Elevasi Terbanyak',
  'Fastest Avg Speed': 'Kecepatan Rata-rata Tercepat', 'Highest Max Speed': 'Kecepatan Maks Tertinggi',
  'Highest Heart Rate': 'Detak Jantung Tertinggi', 'Highest Suffer Score': 'Suffer Score Tertinggi',
  // gear
  'Total km': 'Total km', 'Total mi': 'Total mi', 'Rides logged': 'Gowes tercatat',
  'Elevation m': 'Elevasi m', 'Elevation ft': 'Elevasi ft', 'Primary': 'Utama',
  'Reassign Gear': 'Tetapkan Ulang Perlengkapan', 'Assign to': 'Tetapkan ke',
  // milestones
  'Distance (km)': 'Jarak (km)', 'Distance (mi)': 'Jarak (mi)',
  'Elevation (m)': 'Elevasi (m)', 'Elevation (ft)': 'Elevasi (ft)',
  'Longest Duration': 'Durasi Terpanjang', 'Peak Heart Rate': 'Detak Jantung Puncak',
  'Activity Streak': 'Rentetan Aktivitas', 'Fastest Avg': 'Rata-rata Tercepat',
  'Top Speed': 'Kecepatan Tertinggi', 'Longest consecutive days': 'Hari berturut terpanjang',
  // rewind
  'Avg Distance': 'Jarak Rata-rata', 'Top Sport': 'Olahraga Utama', 'Longest': 'Terjauh',
  'Busiest Day': 'Hari Tersibuk', 'Peak Month': 'Bulan Puncak',
  // trophies
  'All-time': 'Sepanjang waktu', 'Last 4 weeks': '4 minggu terakhir', 'Badges': 'Lencana',
  'Biggest Ride': 'Gowes Terbesar', 'Biggest Climb': 'Tanjakan Terbesar', 'Total Runs': 'Total Lari',
  'KOM / QOM': 'KOM / QOM', 'Personal Records': 'Rekor Pribadi', 'Century Rider': 'Pesepeda Seratusan',
  'Everest Climber': 'Pendaki Everest', 'Half Marathoner': 'Pelari Half Marathon',
  '1,000 km Club': 'Klub 1.000 km', '5,000 km Club': 'Klub 5.000 km', '10,000 km Club': 'Klub 10.000 km',
  '100 Rides': '100 Gowes', '500 Rides': '500 Gowes',
  // segments
  'All': 'Semua', 'Climbs': 'Tanjakan', 'With PR': 'Ada PR',
  'No personal record yet': 'Belum ada rekor pribadi', 'View on Strava →': 'Lihat di Strava →',
  'Fastest PR': 'PR Tercepat', 'Steepest': 'Tercuram', 'Most Ridden': 'Paling Sering',
  'Start': 'Mulai', 'Finish': 'Selesai', 'Avg Grade': 'Gradien Rata-rata', 'Max Grade': 'Gradien Maks',
  'Highest': 'Tertinggi', 'Lowest': 'Terendah', 'PR Time': 'Waktu PR', 'PR Speed': 'Kecepatan PR',
  'Efforts': 'Upaya', 'Scan rides': 'Pindai gowes', 'Rescan': 'Pindai ulang',
  // trophies units + athlete-hero labels
  'hours': 'jam', 'segments': 'segmen', 'on Strava': 'di Strava', 'km best': 'km terbaik',
  'm climbed': 'm didaki', 'km total': 'total km', 'rides': 'gowes',
  'KOMs': 'KOM', 'Followers': 'Pengikut',
};

/* ── Strings built in JS (Overview stat labels/subs), via window.t(key) ── */
const I18N_JS = {
  en: { longRide: 'Longest Ride', longRun: 'Longest Run', avgSpeed: 'Avg Speed', avgPace: 'Avg Pace',
        maxSpeed: 'Max Speed', bestPace: 'Best Pace', riding: 'riding', hours: 'hours',
        cycling: 'cycling', running: 'running', avg: 'avg',
        chMax: 'Max', chAvg: 'Avg', chActs: 'Activities', distanceWord: 'Distance' },
  id: { longRide: 'Gowes Terjauh', longRun: 'Lari Terjauh', avgSpeed: 'Kecepatan Rata-rata', avgPace: 'Pace Rata-rata',
        maxSpeed: 'Kecepatan Maks', bestPace: 'Pace Terbaik', riding: 'gowes', hours: 'jam',
        cycling: 'bersepeda', running: 'lari', avg: 'rata-rata',
        chMax: 'Maks', chAvg: 'Rata2', chActs: 'Aktivitas', distanceWord: 'Jarak' },
};

let _lang = 'en';
window.t = function (key) {
  const d = I18N_JS[_lang] || {};
  if (d[key] != null) return d[key];
  return (I18N_JS.en && I18N_JS.en[key] != null) ? I18N_JS.en[key] : key;
};

/* ── Training section (JS-built cards in training.js + the five insight files).
   English is the source string in the code; TR_ID holds the Indonesian. Use
   tr('English') for plain strings and trf('… {0} …', a, b) for interpolated
   ones — both fall back to the English source unless the language is 'id'. ── */
const TR_ID = {
  // form bands + advice
  'High fatigue': 'Kelelahan tinggi',
  'Prioritise recovery — easy spins or a rest day. Your fatigue is well above your fitness right now.': 'Utamakan pemulihan — gowes ringan atau hari istirahat. Kelelahan Anda saat ini jauh di atas kebugaran Anda.',
  'Productive': 'Produktif',
  'Productive training load. Keep hard days hard and easy days easy, and bank a recovery day this week.': 'Beban latihan yang produktif. Jaga hari berat tetap berat dan hari ringan tetap ringan, dan sisihkan satu hari pemulihan minggu ini.',
  'Neutral': 'Netral',
  'Balanced form. A good window for a quality session or a longer endurance ride.': 'Bentuk seimbang. Waktu yang baik untuk sesi berkualitas atau gowes ketahanan yang lebih panjang.',
  'Fresh': 'Segar',
  'Fresh and race-ready. Strong day for a hard effort, an event, or a PR attempt.': 'Segar dan siap balapan. Hari yang bagus untuk upaya keras, sebuah event, atau percobaan PR.',
  'Very fresh': 'Sangat segar',
  'Very fresh — fitness may start to fade. Time to add some training stimulus.': 'Sangat segar — kebugaran mungkin mulai menurun. Saatnya menambah stimulus latihan.',
  ' ⚠ Fitness is ramping fast (+{0}/wk) — watch for overreaching.': ' ⚠ Kebugaran naik cepat (+{0}/mgg) — waspadai overreaching.',
  ' Fitness is drifting down ({0}/wk).': ' Kebugaran menurun ({0}/mgg).',
  // load basis
  '{0} from power': '{0} dari power',
  '{0} from Relative Effort': '{0} dari Relative Effort',
  '{0} from heart rate': '{0} dari detak jantung',
  '{0} from duration': '{0} dari durasi',
  // consistency
  'Consistency — last {0} {1}': 'Konsistensi — {0} {1} terakhir',
  'week': 'minggu', 'weeks': 'minggu',
  'ride': 'gowes', 'rides': 'gowes',
  'consistency': 'konsistensi',
  'Days ridden': 'Hari gowes',
  'this month · {0} elapsed': 'bulan ini · {0} berlalu',
  'Longest streak': 'Rentetan terpanjang',
  'consecutive days': 'hari berturut-turut',
  'Weeks ≥3 rides': 'Minggu ≥3 gowes',
  'hit the target': 'mencapai target',
  'Missed weeks': 'Minggu terlewat',
  'zero rides': 'tanpa gowes',
  '{0} {1}': '{0} {1}',
  // FTP trend
  'Estimated FTP Trend': 'Tren Estimasi FTP',
  '{0} over {1} quarters, from your best ≥20-min normalized power × 0.95.': '{0} selama {1} kuartal, dari power ternormalisasi ≥20 menit terbaik Anda × 0,95.',
  'flat': 'datar',
  // FTP card
  'From your Strava profile FTP.': 'Dari FTP profil Strava Anda.',
  'Estimated from your best sustained power (≈20-min effort × 0.95).': 'Diperkirakan dari power berkelanjutan terbaik Anda (≈upaya 20 menit × 0,95).',
  'Estimated from body weight (~2.5 W/kg baseline) — add power data for a sharper number.': 'Diperkirakan dari berat badan (dasar ~2,5 W/kg) — tambahkan data power untuk angka yang lebih akurat.',
  'Elite': 'Elite', 'Excellent': 'Sangat baik', 'Very good': 'Baik sekali',
  'Good': 'Baik', 'Moderate': 'Sedang', 'Building': 'Membangun',
  'Add your weight on Strava for W/kg': 'Tambahkan berat badan Anda di Strava untuk W/kg',
  // tiles
  'Fitness · CTL': 'Kebugaran · CTL', '42-day load': 'beban 42 hari',
  'Fatigue · ATL': 'Kelelahan · ATL', '7-day load': 'beban 7 hari',
  'Form · TSB': 'Bentuk · TSB',
  'Ramp rate': 'Laju kenaikan', 'CTL change, 7d': 'perubahan CTL, 7h',
  // recovery + chart
  'Recovery recommendation': 'Rekomendasi pemulihan',
  'Get AI plan': 'Dapatkan rencana AI',
  'Performance Management Chart': 'Grafik Manajemen Performa',
  'Daily load basis: ': 'Basis beban harian: ',
  ' (est.)': ' (est.)',
  'Load your activities to see training load & fatigue.': 'Muat aktivitas Anda untuk melihat beban latihan & kelelahan.',
  'Fitness (CTL)': 'Kebugaran (CTL)', 'Fatigue (ATL)': 'Kelelahan (ATL)', 'Form (TSB)': 'Bentuk (TSB)',
  'Load': 'Beban', 'Form': 'Bentuk',
  // climbing ability
  'Climbing Ability': 'Kemampuan Menanjak',
  'Climb rate': 'Laju tanjakan', 'elevation per moving hour': 'elevasi per jam bergerak',
  'Avg gradient': 'Gradien rata-rata', 'net climb over distance': 'tanjakan neto per jarak',
  'Elevation density': 'Kepadatan elevasi', 'climb per {0}': 'tanjakan per {0}',
  'Best ride': 'Gowes terbaik', 'Best VAM': 'VAM terbaik', 'no sustained climbs': 'tak ada tanjakan berkelanjutan',
  'Ride-level estimate — per-climb VAM from GPS streams is a future upgrade.': 'Estimasi tingkat-gowes — VAM per-tanjakan dari aliran GPS adalah peningkatan mendatang.',
  // fitness trend (zone 2)
  'Fitness Trend — last {0} Zone-2 rides': 'Tren Kebugaran — {0} gowes Zona-2 terakhir',
  'Month': 'Bulan', 'Rides': 'Gowes', 'Avg power': 'Daya rata-rata', 'Avg speed': 'Kecepatan rata-rata',
  'at the same aerobic effort': 'pada upaya aerobik yang sama',
  'holding steady at the same aerobic effort': 'stabil pada upaya aerobik yang sama',
  'Speed on easy aerobic rides {0}. Rising numbers at Zone 2 signal real fitness gains.': 'Kecepatan pada gowes aerobik ringan {0}. Angka yang naik di Zona 2 menandakan peningkatan kebugaran nyata.',
  // seasonal insights
  'Seasonal Insights': 'Wawasan Musiman',
  'Biggest year · {0}': 'Tahun terbesar · {0}',
  'Biggest month · {0}': 'Bulan terbesar · {0}',
  'Distance vs same point last year': 'Jarak vs titik sama tahun lalu',
  '{0} avg speed vs last year': 'Kecepatan rata-rata {0} vs tahun lalu',
  // personal records explorer
  'Personal Records Explorer': 'Penjelajah Rekor Pribadi',
  'Longest ride': 'Gowes terjauh', 'Biggest climbing day': 'Hari tanjakan terbesar',
  'Fastest century': 'Century tercepat', 'Longest Zone-2 ride': 'Gowes Zona-2 terpanjang',
  'Highest avg cadence': 'Kadens rata-rata tertinggi', 'Highest avg power': 'Daya rata-rata tertinggi',
  'Hottest ride': 'Gowes terpanas', 'Coldest ride': 'Gowes terdingin',
  // ride quality
  'Ride Quality Score — latest ride': 'Skor Kualitas Gowes — gowes terbaru',
  'Endurance': 'Ketahanan', 'Climbing': 'Menanjak', 'Efficiency': 'Efisiensi', 'Effort': 'Upaya',
  "Each dimension is this ride's percentile against your own ride history.": 'Tiap dimensi adalah persentil gowes ini terhadap riwayat gowes Anda sendiri.',
  // similar ride
  'Similar Ride Comparison': 'Perbandingan Gowes Serupa',
  'Your latest ride — {0} · {1}, {2} — vs {3} similar past {4}:': 'Gowes terbaru Anda — {0} · {1}, {2} — vs {3} {4} serupa sebelumnya:',
  'Fastest': 'Tercepat', 'fastest': 'tercepat',
  'Lowest HR': 'HR terendah', 'lowest HR': 'HR terendah',
  'Most climbing': 'Tanjakan terbanyak', 'most climbing': 'tanjakan terbanyak',
  'of {0}': 'dari {0}',
  // AI recovery plan
  'Connect Strava to use the AI coach.': 'Hubungkan Strava untuk memakai pelatih AI.',
  "AI coach isn't set up on this deployment — the guidance above is rule-based from your form (TSB) and ramp rate. (Owner: add a provider in AI Coach settings.)": 'Pelatih AI belum disiapkan pada deployment ini — panduan di atas berbasis aturan dari bentuk (TSB) dan laju kenaikan Anda. (Pemilik: tambahkan penyedia di pengaturan AI Coach.)',
  "Couldn't reach the AI coach right now. The guidance above is rule-based from your numbers.": 'Tak bisa menghubungi pelatih AI saat ini. Panduan di atas berbasis aturan dari angka-angka Anda.',
  'The guidance above is rule-based from your numbers.': 'Panduan di atas berbasis aturan dari angka-angka Anda.',
  // power curve
  'Power Curve': 'Kurva Power',
  'best average power at each duration': 'power rata-rata terbaik di tiap durasi',
  'Computing… {0} rides ({1} with power)': 'Menghitung… {0} gowes ({1} dengan power)',
  'Best power across {0} {1}.': 'Power terbaik dari {0} {1}.',
  'Partial — rate-limited last time; click to resume (done rides are cached).': 'Sebagian — kena batas laju terakhir kali; klik untuk lanjut (gowes selesai tersimpan).',
  'Estimate your all-time best power at each duration from your ride streams.': 'Perkirakan power terbaik sepanjang masa di tiap durasi dari aliran data gowes Anda.',
  'Compute power curve': 'Hitung kurva power',
  'Recompute': 'Hitung ulang',
  'Update with new rides': 'Perbarui dengan gowes baru',
  "The power curve is computed on the owner's device — it fetches ride streams, and Strava's rate limit is shared across the app.": 'Kurva power dihitung di perangkat pemilik — mengambil aliran data gowes, dan batas laju Strava dibagi ke seluruh aplikasi.',
  'Owner-only (shared Strava rate limit).': 'Khusus pemilik (batas laju Strava dibagi bersama).',
  'No rides with power data.': 'Tak ada gowes dengan data power.',
  'Rate-limited — reopen later to resume; fetched rides are cached.': 'Kena batas laju — buka lagi nanti untuk lanjut; gowes yang diambil tersimpan.',
  // HR decoupling
  'Heart Rate Decoupling': 'Decoupling Detak Jantung',
  'aerobic drift, first vs second half': 'aerobic drift, paruh pertama vs kedua',
  'Negative drift — you held or raised output as HR settled (negative split or long warm-up). Strong aerobic control.': 'Drift negatif — Anda mempertahankan atau menaikkan output saat HR menurun (negative split atau pemanasan panjang). Kontrol aerobik yang kuat.',
  'Well-coupled (<5%). Strong aerobic endurance for this effort — HR stayed steady against your output.': 'Tergandeng baik (<5%). Ketahanan aerobik kuat untuk upaya ini — HR stabil terhadap output Anda.',
  'Moderate drift (5–10%). Normal for a hard or long ride; watch fuelling and pacing on the back half.': 'Drift sedang (5–10%). Normal untuk gowes berat atau panjang; perhatikan nutrisi dan pacing di paruh akhir.',
  'High decoupling (>10%). Aerobic endurance, pacing, heat or fuelling limited the second half — a target to build.': 'Decoupling tinggi (>10%). Ketahanan aerobik, pacing, panas, atau nutrisi membatasi paruh kedua — target untuk dibangun.',
  'First': 'Pertama', 'Second': 'Kedua', '{0} half': 'paruh {0}',
  'decoupling': 'decoupling',
  'power': 'power', 'speed': 'kecepatan',
  'Latest ride: {0} · {1} vs HR.': 'Gowes terbaru: {0} · {1} vs HR.',
  'See how much your heart rate drifts up relative to your pace/power over a long ride.': 'Lihat seberapa jauh detak jantung Anda naik relatif terhadap pace/power selama gowes panjang.',
  'Analyse {0}': 'Analisis {0}',
  'latest ride': 'gowes terbaru',
  'No long ride with heart-rate data yet.': 'Belum ada gowes panjang dengan data detak jantung.',
  "Couldn't load stream data for this ride.": 'Tak bisa memuat data aliran untuk gowes ini.',
  'Not enough continuous HR/output data in this ride to measure drift.': 'Data HR/output kontinu di gowes ini tak cukup untuk mengukur drift.',
  // time lost
  'Time Lost Analysis': 'Analisis Waktu Hilang',
  'where your average speed went': 'ke mana kecepatan rata-rata Anda pergi',
  'Descending': 'Menurun', 'Flat pedalling': 'Kayuh datar', 'Coasting': 'Meluncur', 'Stopped': 'Berhenti',
  'moving': 'bergerak', 'overall': 'keseluruhan',
  '{0}% of the clock spent stopped': '{0}% waktu jam dihabiskan berhenti',
  'Most of your moving time went to {0}. Latest ride: {1}.': 'Sebagian besar waktu bergerak Anda untuk {0}. Gowes terbaru: {1}.',
  'Break your latest ride into climbing, descending, pedalling, coasting and stopped time.': 'Uraikan gowes terbaru Anda menjadi waktu menanjak, menurun, mengayuh, meluncur, dan berhenti.',
  'No ride long enough to analyse yet.': 'Belum ada gowes yang cukup panjang untuk dianalisis.',
  'Not enough stream detail in this ride to break down.': 'Detail aliran di gowes ini tak cukup untuk diuraikan.',
  // wind analysis
  'Wind Analysis': 'Analisis Angin',
  'headwind / tailwind / crosswind': 'angin depan / angin belakang / angin samping',
  'Headwind': 'Angin depan', 'Tailwind': 'Angin belakang', 'Crosswind': 'Angin samping',
  ' net tailwind — the wind helped your speed.': ' angin belakang neto — angin membantu kecepatan Anda.',
  ' net headwind — you were stronger than the raw speed suggests.': ' angin depan neto — Anda lebih kuat dari yang ditunjukkan kecepatan mentah.',
  'roughly neutral — wind mostly crossed your route.': 'kira-kira netral — angin sebagian besar memotong rute Anda.',
  'Wind was {0} from the {1} ({2}°).': 'Angin {0} dari {1} ({2}°).',
  'Net wind along your direction of travel: ': 'Angin neto sepanjang arah perjalanan Anda: ',
  'Latest GPS ride: {0}. Wind sampled at the start hour/location.': 'Gowes GPS terbaru: {0}. Angin diambil pada jam/lokasi mulai.',
  'Your direction comes from the GPS route bearings of {0}; wind speed & direction from Open-Meteo historical weather, sampled at the ride’s start hour and location.': 'Arah Anda berasal dari arah rute GPS {0}; kecepatan & arah angin dari data cuaca historis Open-Meteo, diambil pada jam dan lokasi mulai gowes.',
  'See how much of your latest ride fought a headwind — sometimes a "slow" ride was actually a strong one.': 'Lihat seberapa banyak gowes terbaru Anda melawan angin depan — kadang gowes yang "lambat" sebenarnya kuat.',
  'No outdoor GPS ride to analyse yet.': 'Belum ada gowes GPS luar ruangan untuk dianalisis.',
  "Couldn't load the GPS track for this ride.": 'Tak bisa memuat jejak GPS untuk gowes ini.',
  "Couldn't load historical wind for this ride's time and place.": 'Tak bisa memuat data angin historis untuk waktu dan tempat gowes ini.',
  'Not enough GPS detail to analyse wind.': 'Detail GPS tak cukup untuk menganalisis angin.',
  // segment intelligence
  'Segment Intelligence': 'Intelijen Segmen',
  'closest to PR · improving · stagnating': 'terdekat ke PR · membaik · stagnan',
  'No starred segments with enough effort history yet.': 'Belum ada segmen berbintang dengan riwayat upaya yang cukup.',
  'Closest to a PR': 'Terdekat ke PR', 'Improving fastest': 'Membaik tercepat', 'Stagnating': 'Stagnan',
  'at your PR': 'di PR Anda',
  '+{0} behind': '+{0} di belakang',
  '{0}% chance': 'peluang {0}%',
  '▲ {0}% faster': '▲ {0}% lebih cepat',
  '{0} efforts · flat': '{0} upaya · datar',
  'Next-PR chance is a rough estimate from your recent efforts vs your PR.': 'Peluang PR berikutnya adalah perkiraan kasar dari upaya terkini Anda vs PR Anda.',
  "Analyse your starred segments' effort history — which you're closest to PR-ing, which are improving, and which have stalled.": 'Analisis riwayat upaya segmen berbintang Anda — mana yang paling dekat ke PR, mana yang membaik, dan mana yang mandek.',
  'Analyse my segments': 'Analisis segmen saya',
  "Segment intelligence is computed on the owner's device (it fetches per-segment effort history, and Strava's rate limit is shared).": 'Intelijen segmen dihitung di perangkat pemilik (mengambil riwayat upaya per-segmen, dan batas laju Strava dibagi bersama).',
  'Owner-only (fetches per-segment effort history; shared Strava rate limit).': 'Khusus pemilik (mengambil riwayat upaya per-segmen; batas laju Strava dibagi).',
  'Rate-limited — try again later.': 'Kena batas laju — coba lagi nanti.',
  'Star some segments on Strava first, then their effort history can be analysed.': 'Bintangi beberapa segmen di Strava dulu, lalu riwayat upayanya bisa dianalisis.',
  'Analysing… {0}/{1}': 'Menganalisis… {0}/{1}',
  'Rate-limited — some segments skipped; reopen later to finish.': 'Kena batas laju — beberapa segmen dilewati; buka lagi nanti untuk menyelesaikan.',
};
window.tr = function (s) {
  return (window.LANG === 'id' && TR_ID[s] != null) ? TR_ID[s] : s;
};
window.trf = function (s, ...args) {
  const t = (window.LANG === 'id' && TR_ID[s] != null) ? TR_ID[s] : s;
  return t.replace(/\{(\d+)\}/g, (_, i) => args[i]);
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
  document.querySelectorAll('.section-title, .card-title, .sidebar-group-label, .sidebar-act, .sidebar-user-sub, .nav-link, #saveImgBtn, #shareBtn, #logoutBtn').forEach(grab);
  document.querySelectorAll('.s-label, .s-sub').forEach(el => { if (!el.id) grab(el); });

  // Dynamic labels are rebuilt (in English) by the render layer, so they can't
  // be captured once. Instead we re-scan known label elements and swap the text
  // after each render. English is the source, so this only acts for Indonesian.
  const DYN_SEL = '.hero-label,.ctop-title,.best-card-title,.gear-stat-lbl,.gear-primary,' +
    '.mst-lbl,.mst-cl,.mst-sub,.seg-m-lbl,.actd-stat-lbl,.actd-badge,.actd-strava,' +
    '.seg-chip-btn,.seg-pr-empty,.seg-link,.seg-sum-top,.ryc-l,.gr-to,.gr-title,' +
    '.month-table th,.cal2-stats div,.cal2-legend,.ach-badge-name,.ach-badge-unit,' +
    '#rewindContent .card div,#challengesGrid div,#challengesGrid span';
  function translateDynamic() {
    if (_lang !== 'id') return;
    document.querySelectorAll(DYN_SEL).forEach(el => {
      el.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          const k = n.nodeValue.trim();
          if (k && APP_ID[k] != null) n.nodeValue = n.nodeValue.replace(k, APP_ID[k]);
        }
      });
    });
  }
  window.applyI18n = translateDynamic;

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
    window.LANG = lang;
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
    translateDynamic();
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

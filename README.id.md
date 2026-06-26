<p align="center">
  <img src="images/non_transparent.png" alt="Logo Ascent" width="120">
</p>

<h1 align="center">Ascent — Strava Dashboard</h1>

<p align="center"><a href="README.md">🇬🇧 English</a> · <a href="README.id.md">🇮🇩 Bahasa Indonesia</a></p>

Dashboard aktivitas Strava pribadi dengan pembuat kartu cerita (story card) bergaya Instagram/TikTok. Dibangun sebagai aplikasi satu halaman statis — tanpa framework, tanpa backend.

**Demo langsung:** https://ascent-analytics.vercel.app/

![Ringkasan](images/screenshots/overview.png)

---

## Tangkapan Layar

> Semua tangkapan layar memakai **mode demo** bawaan (data contoh — bukan akun asli).

| Tren | Heatmap |
|---|---|
| ![Tren](images/screenshots/trendsSection.png) | ![Heatmap](images/screenshots/heatSection.png) |

| Kalender | Angka Eddington |
|---|---|
| ![Kalender](images/screenshots/calSection.png) | ![Eddington](images/screenshots/eddington.png) |

| Detail aktivitas | Pembuat kartu cerita |
|---|---|
| ![Detail aktivitas](images/screenshots/activity-detail.png) | ![Pembuat cerita](images/screenshots/story-popup.png) |

**Tata letak kartu cerita:**

| Strava | Pace | Peta |
|---|---|---|
| ![Tata letak Strava](images/screenshots/story-strava.png) | ![Tata letak Pace](images/screenshots/story-pace.png) | ![Tata letak Peta](images/screenshots/story.png) |

---

## Fitur

- Hubungkan akun Strava lewat OAuth
- **AI Coach** — mengobrol dengan AI yang menganalisis riwayat latihan Anda untuk tren, saran, dan caption aktivitas; pilih penyedia AI sendiri (kunci hanya disimpan di perangkat Anda)
- **Route Builder** — buat loop rute jalan baru sesuai jarak pilihan Anda (olahraga, area mulai, preferensi elevasi) dan unduh sebagai GPX; ditenagai OpenRouteService, dengan penamaan AI opsional
- Lihat statistik: total jarak, elevasi, waktu bergerak, kecepatan, detak jantung (dengan label zona latihan), dan lainnya
- Zona detak jantung dari profil Strava Anda (atau diperkirakan dari HR maksimum), plus perkiraan FTP saat Strava tidak punya data daya
- Daftar aktivitas, bubble chart, angka Eddington, grafik mingguan/bulanan, heatmap kalender
- **Pembuat kartu cerita** — ekspor aktivitas sebagai PNG 1080×1920
  - 13+ tata letak: Strip, Grid, Hero, Map, Minimal, Split, Stacked, Cinema, Neon, Sport, Gradient, Badge, Tiles, Ink, Neon 6
  - Dukungan latar transparan — tempel langsung di atas foto apa pun
  - Skema warna kustom + pemilih warna latar/aksen/teks
  - Sakelar sembunyikan judul / sembunyikan tanggal
  - Kalori, daya (power), kadens, detak jantung, elevasi, dan lainnya sebagai statistik pilihan
- Cache aktivitas di browser Anda sendiri — mengurangi panggilan API Strava (lihat [Data & Privasi](#data--privasi))
- PWA — bisa dipasang di ponsel sebagai aplikasi layar utama
- Mode demo — berjalan tanpa akun Strava

---

## Data & Privasi

> [🇬🇧 English](README.md#data--privacy) · 🇮🇩 Bahasa Indonesia

**Aplikasi ini tidak mengumpulkan, menyimpan, atau mengirim data Anda ke server mana pun yang kami kendalikan.**
Tidak ada analitik, tidak ada piksel pelacak, dan tidak ada iklan pihak ketiga.
Seluruh aplikasi berjalan di sisi klien, di dalam browser Anda.

### Data apa yang terlibat

Saat menghubungkan Strava, Anda memberi izin aplikasi dengan scope OAuth berikut:

| Scope | Alasan diminta |
|---|---|
| `read` | Info profil publik dasar |
| `activity:read_all` | Membaca semua aktivitas Anda (termasuk yang privat) untuk membangun dashboard |
| `profile:read_all` | Membaca profil lengkap Anda (nama, foto, statistik) |
| `activity:write` | Opsional — memungkinkan mengunggah gambar cerita / memperbarui aktivitas |

Dengan scope tersebut, **browser** Anda mengambil dari API Strava:
- profil atlet Anda (nama, foto, jumlah pengikut/diikuti),
- aktivitas Anda (jarak, waktu, kecepatan, detak jantung, daya, polyline peta GPS, dll.),
- statistik agregat, segmen/KOM, dan perlengkapan (gear).

Semua ini diminta **langsung oleh browser Anda ke Strava** — tidak pernah
melewati server kami.

### Cara kerja koneksi

1. Anda klik **Connect with Strava** dan masuk **di situs Strava sendiri** —
   aplikasi tidak pernah melihat kata sandi Strava Anda.
2. Strava mengarahkan kembali dengan `code` sekali pakai.
3. Browser Anda mengirim `code` itu ke `api/strava-token.js`, sebuah fungsi
   serverless kecil tanpa-status (stateless). Fungsi ini menambahkan **client
   secret** Strava yang rahasia (disimpan di sisi server, tidak pernah dikirim ke
   browser), menukar code dengan Strava, lalu mengembalikan token. **Fungsi ini
   tidak menyimpan apa pun** — hanya meneruskan permintaan.
4. Token akses/refresh yang dikembalikan disimpan **hanya di `localStorage`
   browser Anda** dan diperbarui otomatis saat kedaluwarsa.

### Di mana data disimpan

- **Cache aktivitas** — `localStorage` browser Anda, dipisah per atlet, dengan
  TTL 6 jam, agar aplikasi tidak mengambil ulang setiap kunjungan.
- **Token login** — `localStorage` browser Anda.
- **Kerangka aplikasi (offline)** — service worker (`sw.js`) menyimpan HTML/CSS/JS
  agar PWA bisa berjalan offline. Ini **tidak** menyimpan data Strava Anda.
- **Tanpa database jarak jauh.** Kode menyertakan cache jarak jauh Supabase yang
  *opsional* untuk sinkronisasi antar-perangkat, tetapi **dinonaktifkan secara
  bawaan** (`_haveRemote = false` di `js/config.js`). Sesuai yang dirilis, tidak
  ada salinan aktivitas Anda yang disimpan di server mana pun — "semuanya berjalan
  di browser Anda" benar-benar harfiah. Jika Anda mengaktifkannya kembali (lihat
  langkah Supabase di bawah), aktivitas Anda akan disimpan di proyek Supabase
  *milik Anda sendiri*, bukan milik kami.

### Menghapus data Anda

- Klik **Disconnect** di aplikasi untuk menghapus token dan cache aktivitas, atau
- bersihkan data situs / `localStorage` browser Anda, dan
- cabut izin aplikasi di <https://www.strava.com/settings/apps> kapan saja.

*Proyek independen — tidak berafiliasi dengan atau didukung oleh Strava, Inc.*

---

## Memulai

### 1. Buat aplikasi API Strava

1. Buka https://www.strava.com/settings/api
2. Buat sebuah aplikasi
3. Atur **Authorization Callback Domain** ke `localhost` untuk pengembangan lokal (ubah ke domain Anda untuk produksi)
4. Catat **Client ID** dan **Client Secret** Anda

### 2. Siapkan Supabase (opsional — nonaktif secara bawaan)

> **Catatan:** cache jarak jauh Supabase **nonaktif** di kode ini
> (`_haveRemote = false` di `js/config.js`). Aplikasi berjalan penuh tanpanya
> menggunakan cache lokal browser. Ikuti langkah ini hanya jika Anda ingin
> sinkronisasi antar-perangkat — lalu kembalikan `_haveRemote` ke pengecekan env
> untuk mengaktifkannya.

1. Buat proyek gratis di https://supabase.com
2. Jalankan SQL ini di editor SQL Supabase:

```sql
-- Satu baris per atlet; `id` adalah id atlet Strava (multi-pengguna)
CREATE TABLE IF NOT EXISTS strava_cache (
  id          BIGINT PRIMARY KEY,
  activities  JSONB NOT NULL,
  synced_at   TIMESTAMPTZ DEFAULT NOW()
);
```

> **Catatan privasi:** browser memakai **anon key** publik, jadi secara bawaan
> pengunjung mana pun bisa membaca baris mana pun. Data tiap atlet dikunci dengan
> id Strava-nya, tetapi untuk benar-benar mengisolasi pengguna Anda harus
> mengaktifkan Row Level Security pada `strava_cache`. Tanpa backend, isolasi
> penuh per-pengguna tidak mungkin hanya dari anon key — cache localStorage tetap
> menjaga data tiap browser bersifat lokal.

3. Catat **Project URL** dan **anon/public key** Anda

### 3. Pengembangan lokal

```bash
git clone https://github.com/doniwirawan/Ascent-Strava-Dashboard.git
cd Ascent-Strava-Dashboard

# Pasang dependensi
npm install

# Salin file env dan isi nilai Anda
cp .env.example .env.local

# Build (menyuntikkan kredensial ke dist/)
node build.js

# Sajikan dist/ dengan server statis apa pun, mis.:
npx serve dist
```

Buka http://localhost:3000 dan klik **Connect with Strava**.

---

## Deploy ke Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/doniwirawan/Ascent-Strava-Dashboard)

1. Fork atau clone repo ini lalu impor di [dashboard Vercel](https://vercel.com/new)
2. Tambahkan variabel lingkungan di **Project Settings → Environment Variables**:

| Variabel | Deskripsi |
|---|---|
| `STRAVA_CLIENT_ID` | Dari https://www.strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | Dari https://www.strava.com/settings/api |
| `SUPABASE_URL` | URL proyek Supabase Anda *(opsional)* |
| `SUPABASE_ANON_KEY` | Anon/public key Supabase Anda *(opsional)* |
| `ORS_API_KEY` | Kunci [OpenRouteService](https://openrouteservice.org) untuk Route Builder *(opsional, free tier)* |
| `OWNER_ATHLETE_ID` | ID atlet Strava Anda — membatasi proxy AI/Route ke Anda *(opsional, disarankan)* |

3. Perbarui **Authorization Callback Domain** aplikasi Strava Anda ke domain Vercel (mis. `domainanda.vercel.app`)
4. Vercel akan otomatis menjalankan `npm install && node build.js` di setiap deploy

---

## Struktur Proyek

```
Ascent-Strava-Dashboard/
├── index.html       # Aplikasi utama — semua JS inline
├── callback.html    # Halaman callback OAuth
├── build.js         # Menyuntikkan variabel env ke dist/ saat build
├── manifest.json    # Manifest PWA
├── sw.js            # Service worker (cache offline)
├── icon.png         # Ikon aplikasi
├── vercel.json      # Konfigurasi Vercel
├── package.json
├── .env.example     # Salin ke .env.local dan isi nilainya
└── dist/            # Hasil build (dihasilkan, tidak di-commit)
```

---

## Tumpukan Teknologi

- HTML / CSS / JavaScript murni (tanpa framework)
- [Chart.js](https://www.chartjs.org/) — grafik
- [Supabase JS](https://supabase.com/docs/reference/javascript) — cache opsional
- [Strava API](https://developers.strava.com/docs/reference/) — data aktivitas
- [Vercel](https://vercel.com) — hosting + pipeline build

---

## Lisensi

**Hanya untuk penggunaan pribadi dan non-komersial.** Anda boleh meng-clone repo
ini dan menjalankan salinan Anda sendiri untuk penggunaan pribadi, serta belajar
dari atau memodifikasi kodenya.

Anda **tidak boleh**:

- menjualnya, atau menggunakannya (seluruhnya atau sebagian) dalam produk atau layanan komersial/berbayar apa pun;
- menjalankannya sebagai layanan ter-hosting/produksi yang ditawarkan kepada orang lain;
- menggunakannya untuk membangun atau mengoperasikan apa pun yang bersaing dengan dashboard Ascent
  (https://ascent-analytics.vercel.app/).

Lihat [LICENSE](LICENSE) untuk ketentuan lengkap. Tidak berafiliasi dengan Strava, Inc.

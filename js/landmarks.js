/* ── BALI LANDMARKS ──
   Well-known spots a ride can turn around at. When a destination (the route
   point furthest from the start) falls inside a landmark's radius r (metres),
   the landmark name is shown instead of just the village, e.g. "Tanah Lot".
   Coordinates were looked up on OpenStreetMap (Nominatim) on 2026-09-24.
   A few trips beyond Bali sit at the end of the list.
   Also loaded by api/strava-webhook.js, hence the module.exports at the end. */
const BALI_LANDMARKS = [
  // Tabanan
  { n: 'Tanah Lot', lat: -8.62122, lng: 115.08688, r: 800 },
  { n: 'Pura Ulun Danu Beratan', lat: -8.27551, lng: 115.16626, r: 600 },
  { n: 'Kebun Raya Bedugul', lat: -8.27398, lng: 115.15383, r: 900 },
  { n: 'Jatiluwih Rice Terraces', lat: -8.37020, lng: 115.13120, r: 1500 },
  { n: 'Pura Luhur Batukaru', lat: -8.37265, lng: 115.10275, r: 800 },
  { n: 'Alas Kedaton', lat: -8.52983, lng: 115.15566, r: 600 },
  { n: 'Pantai Kedungu', lat: -8.60895, lng: 115.08339, r: 700 },
  // Buleleng
  { n: 'Danau Buyan', lat: -8.24583, lng: 115.12422, r: 1500 },
  { n: 'Danau Tamblingan', lat: -8.25706, lng: 115.09685, r: 1200 },
  { n: 'Air Terjun Gitgit', lat: -8.20290, lng: 115.13887, r: 600 },
  { n: 'Pantai Lovina', lat: -8.16092, lng: 115.02453, r: 1000 },
  // Badung
  { n: 'Jembatan Tukad Bangkung', lat: -8.29635, lng: 115.23373, r: 600 },
  { n: 'Pura Taman Ayun', lat: -8.54185, lng: 115.17249, r: 500 },
  { n: 'Pantai Pererenan', lat: -8.64278, lng: 115.12907, r: 800 },
  { n: 'Garuda Wisnu Kencana', lat: -8.81416, lng: 115.16665, r: 1000 },
  { n: 'Pura Uluwatu', lat: -8.82937, lng: 115.08434, r: 700 },
  // Denpasar
  { n: 'Monumen Bajra Sandhi', lat: -8.67175, lng: 115.23389, r: 700 },
  { n: 'Lapangan Puputan Badung', lat: -8.65712, lng: 115.21766, r: 500 },
  { n: 'Pantai Sindhu, Sanur', lat: -8.68581, lng: 115.26450, r: 700 },
  // Gianyar
  { n: 'Alun-alun Gianyar', lat: -8.54225, lng: 115.32986, r: 500 },
  { n: 'Pantai Saba', lat: -8.61334, lng: 115.32119, r: 700 },
  { n: 'Pantai Keramas', lat: -8.60074, lng: 115.33349, r: 800 },
  { n: 'Pantai Masceti', lat: -8.59415, lng: 115.34657, r: 700 },
  { n: 'Pantai Lebih', lat: -8.58083, lng: 115.35566, r: 700 },
  { n: 'Pantai Purnama', lat: -8.59891, lng: 115.28348, r: 800 },
  { n: 'Bali Safari & Marine Park', lat: -8.58050, lng: 115.34389, r: 900 },
  { n: 'Goa Gajah', lat: -8.52369, lng: 115.28669, r: 500 },
  { n: 'Ubud Monkey Forest', lat: -8.51873, lng: 115.25832, r: 500 },
  { n: 'Puri Ubud', lat: -8.50672, lng: 115.26271, r: 400 },
  { n: 'Campuhan Ridge Walk', lat: -8.49902, lng: 115.25516, r: 600 },
  { n: 'Tegallalang Rice Terrace', lat: -8.42855, lng: 115.27988, r: 1000 },
  { n: 'Pura Tirta Empul', lat: -8.41436, lng: 115.31621, r: 600 },
  // Bangli
  { n: 'Penelokan (Batur view)', lat: -8.28409, lng: 115.36497, r: 1000 },
  // Klungkung
  { n: 'Puputan Klungkung (Kerta Gosa)', lat: -8.53485, lng: 115.40346, r: 600 },
  { n: 'Pusat Kebudayaan Bali', lat: -8.56643, lng: 115.42849, r: 1300 },
  { n: 'Pura Goa Lawah', lat: -8.55153, lng: 115.46897, r: 600 },
  // Karangasem
  { n: 'Pura Besakih', lat: -8.37536, lng: 115.45071, r: 900 },
  { n: 'Bukit Jambul', lat: -8.47740, lng: 115.46930, r: 900 },
  { n: 'Pura Lempuyang', lat: -8.39519, lng: 115.64806, r: 800 },
  { n: 'Taman Tirta Gangga', lat: -8.41132, lng: 115.58805, r: 600 },
  { n: 'Candidasa', lat: -8.50970, lng: 115.57159, r: 1000 },
  // Jembrana
  { n: 'Pura Rambut Siwi', lat: -8.40310, lng: 114.76612, r: 700 },
  // Beyond Bali — coordinates from Nominatim, 2026-10-04
  // Jawa Timur
  { n: 'Kawah Ijen', lat: -8.05792, lng: 114.24171, r: 1500 }, // crater lake; Paltuding trailhead is ~3 km out
  { n: 'Gunung Bromo', lat: -7.94207, lng: 112.95298, r: 1500 },
  { n: 'Penanjakan', lat: -7.90373, lng: 112.95214, r: 800 },
  { n: 'Pura Luhur Poten', lat: -7.93344, lng: 112.95419, r: 500 },
  { n: 'Gunung Semeru', lat: -8.10784, lng: 112.92248, r: 2000 },
  { n: 'Ranu Kumbolo', lat: -8.04922, lng: 112.92151, r: 800 },
  { n: 'Ranu Pani', lat: -8.01218, lng: 112.94688, r: 800 },
  { n: 'Air Terjun Tumpak Sewu', lat: -8.23033, lng: 112.91650, r: 600 },
  { n: 'Air Terjun Madakaripura', lat: -7.85530, lng: 113.00771, r: 600 },
  { n: 'Coban Rondo', lat: -7.88473, lng: 112.47697, r: 600 },
  { n: 'Savana Bekol, Baluran', lat: -7.83840, lng: 114.44000, r: 1500 },
  { n: 'Pulau Merah', lat: -8.60508, lng: 114.02613, r: 1000 },
  { n: 'Pantai Plengkung (G-Land)', lat: -8.73148, lng: 114.34949, r: 1000 },
  { n: 'De Djawatan', lat: -8.43143, lng: 114.22614, r: 500 },
  { n: 'Pelabuhan Ketapang', lat: -8.14264, lng: 114.40045, r: 600 },
  { n: 'Tanjung Papuma', lat: -8.43595, lng: 113.55316, r: 1000 },
  { n: 'Pantai Balekambang', lat: -8.40331, lng: 112.53977, r: 800 },
  { n: 'Gunung Kelud', lat: -7.93892, lng: 112.30525, r: 1500 },
  { n: 'Candi Penataran', lat: -8.01642, lng: 112.20950, r: 500 },
  { n: 'Makam Bung Karno', lat: -8.09000, lng: 112.17163, r: 500 },
  { n: 'Telaga Sarangan', lat: -7.67738, lng: 111.21787, r: 800 },
  { n: 'Gunung Lawu', lat: -7.62738, lng: 111.19432, r: 1500 },
  { n: 'Gunung Arjuno', lat: -8.22190, lng: 112.77950, r: 1500 },
  { n: 'Gunung Penanggungan', lat: -7.61566, lng: 112.62006, r: 1500 },
  { n: 'Jembatan Suramadu', lat: -7.18408, lng: 112.78035, r: 1500 },
  { n: 'Tugu Pahlawan', lat: -7.24586, lng: 112.73782, r: 400 },
  { n: 'Alun-alun Kota Batu', lat: -7.87118, lng: 112.52690, r: 400 },
  { n: 'Kebun Raya Purwodadi', lat: -7.79983, lng: 112.74164, r: 800 },
  { n: 'Candi Singosari', lat: -7.88774, lng: 112.66391, r: 400 },
  // Jawa Tengah
  { n: 'Candi Borobudur', lat: -7.60796, lng: 110.20382, r: 700 },
  { n: 'Candi Mendut', lat: -7.60482, lng: 110.23003, r: 400 },
  { n: 'Punthuk Setumbu', lat: -7.61080, lng: 110.18129, r: 500 },
  { n: 'Candi Prambanan', lat: -7.75223, lng: 110.49153, r: 700 }, // just over the line in DIY
  { n: 'Kawah Sikidang', lat: -7.21972, lng: 109.90479, r: 600 },
  { n: 'Telaga Warna Dieng', lat: -7.21366, lng: 109.91543, r: 500 },
  { n: 'Candi Arjuna Dieng', lat: -7.20496, lng: 109.90782, r: 400 },
  { n: 'Bukit Sikunir', lat: -7.23870, lng: 109.92503, r: 700 },
  { n: 'Gunung Prau', lat: -7.17187, lng: 109.93134, r: 2000 }, // area centroid, not the summit
  { n: 'Gunung Merbabu', lat: -7.45424, lng: 110.43969, r: 1500 },
  { n: 'Gunung Merapi', lat: -7.54129, lng: 110.44620, r: 1500 }, // summit on the DIY border
  { n: 'Gunung Sindoro', lat: -7.30114, lng: 109.99670, r: 1500 },
  { n: 'Gunung Sumbing', lat: -7.38189, lng: 110.07582, r: 1500 },
  { n: 'Gunung Slamet', lat: -7.24147, lng: 109.21497, r: 1500 },
  { n: 'Gunung Andong', lat: -7.38867, lng: 110.37155, r: 1000 },
  { n: 'Nepal Van Java', lat: -7.42048, lng: 110.07721, r: 600 },
  { n: 'Candi Gedong Songo', lat: -7.20637, lng: 110.34018, r: 800 },
  { n: 'Lawang Sewu', lat: -6.98398, lng: 110.41079, r: 300 },
  { n: 'Kota Lama Semarang', lat: -6.96723, lng: 110.42690, r: 600 },
  { n: 'Simpang Lima Semarang', lat: -6.98932, lng: 110.42358, r: 400 },
  { n: 'Klenteng Sam Poo Kong', lat: -6.99587, lng: 110.39838, r: 400 },
  { n: 'Umbul Ponggok', lat: -7.61380, lng: 110.63582, r: 400 },
  { n: 'Keraton Surakarta', lat: -7.57844, lng: 110.82835, r: 500 },
  { n: 'Candi Sukuh', lat: -7.62732, lng: 111.13154, r: 400 },
  { n: 'Candi Cetho', lat: -7.59574, lng: 111.15813, r: 400 },
  { n: 'Grojogan Sewu', lat: -7.66070, lng: 111.13108, r: 500 },
  { n: 'Telaga Menjer', lat: -7.26882, lng: 109.92567, r: 600 },
  { n: 'Pantai Menganti', lat: -7.76983, lng: 109.41248, r: 800 },
  { n: 'Goa Jatijajar', lat: -7.66984, lng: 109.42353, r: 500 },
  { n: 'Baturraden', lat: -7.31216, lng: 109.22781, r: 800 },
  { n: 'Benteng Pendem Cilacap', lat: -7.74911, lng: 109.01726, r: 500 },
];

/* ~1,000 more named places (beaches, waterfalls, viewpoints, peaks, attractions,
   monuments, squares) + ~5,000 cafes/restaurants from OpenStreetMap live in
   data/bali-places.json (built 2026-09-24). Loaded once in the background in the
   browser; required directly on the server (webhook). */
let _baliPlaces = null, _baliPlacesP = null;
function loadBaliPlaces() {
  if (_baliPlaces) return Promise.resolve(_baliPlaces);
  if (typeof window === 'undefined') { try { _baliPlaces = require('../data/bali-places.json'); } catch {} return Promise.resolve(_baliPlaces); }
  return _baliPlacesP || (_baliPlacesP = fetch('data/bali-places.json').then(r => r.json()).then(d => (_baliPlaces = d)).catch(() => null));
}
/* Changes when either list changes, so stored destinations get re-tagged once.
   null until the big list is loaded (don't stamp a curated-only result). */
function landmarkVersion() { return _baliPlaces ? BALI_LANDMARKS.length + '.' + _baliPlaces.v : null; }

const FOOD_R = 150; // a cafe/restaurant only counts if you turned around right at it
const _lmM = (lat, lng, lat2, lng2) => { const x = (lng2 - lng) * Math.cos(lat * Math.PI / 180), y = lat2 - lat; return Math.sqrt(x * x + y * y) * 111320; };

/* Where did the ride turn around? Priority: the hand-picked list above, then OSM
   natural/public places (beach, waterfall, peak, lake, monument, square), then
   OSM attractions/viewpoints, then cafes/restaurants within FOOD_R. Within a
   tier, the place the point is relatively closest to (distance / radius). */
function nearestLandmark(lat, lng) {
  if (!_baliPlaces && typeof window === 'undefined') loadBaliPlaces();
  const pick = (list, get) => { let best = null, score = 1;
    list.forEach(x => { const [n, la, ln, r] = get(x); const s = _lmM(lat, lng, la, ln) / r; if (s <= score) { score = s; best = n; } });
    return best; };
  const n = pick(BALI_LANDMARKS, l => [l.n, l.lat, l.lng, l.r])
    || (_baliPlaces && pick(_baliPlaces.landmarks.filter(l => l[4] === 1), l => l))
    || (_baliPlaces && pick(_baliPlaces.landmarks.filter(l => l[4] === 2), l => l))
    || (_baliPlaces && pick(_baliPlaces.food, f => [f[0], f[1], f[2], FOOD_R]));
  return n ? { n } : null;
}

/* What to call a destination: the landmark if there is one, else the village. */
function destName(rp) { return rp ? (rp.furthest_landmark || rp.furthest_place || '') : ''; }

if (typeof module !== 'undefined') module.exports = { BALI_LANDMARKS, nearestLandmark, destName, loadBaliPlaces };

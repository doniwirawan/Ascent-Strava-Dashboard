/* ── BALI LANDMARKS ──
   Well-known spots a ride can turn around at. When a destination (the route
   point furthest from the start) falls inside a landmark's radius r (metres),
   the landmark name is shown instead of just the village, e.g. "Tanah Lot".
   Coordinates were looked up on OpenStreetMap (Nominatim) on 2026-09-24.
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
];

/* The landmark whose radius contains the point; if several overlap, the one
   the point is relatively closest to (distance / radius). null if none. */
function nearestLandmark(lat, lng) {
  const rad = Math.PI / 180;
  let best = null, score = 1;
  BALI_LANDMARKS.forEach(l => {
    const dLat = (l.lat - lat) * rad, dLng = (l.lng - lng) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(l.lat * rad) * Math.sin(dLng / 2) ** 2;
    const m = 2 * 6371000 * Math.asin(Math.sqrt(s));
    if (m / l.r <= score) { score = m / l.r; best = l; }
  });
  return best;
}

/* What to call a destination: the landmark if there is one, else the village. */
function destName(rp) { return rp ? (rp.furthest_landmark || rp.furthest_place || '') : ''; }

if (typeof module !== 'undefined') module.exports = { BALI_LANDMARKS, nearestLandmark, destName };

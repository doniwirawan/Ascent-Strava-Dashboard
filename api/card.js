// Public SVG stats card — embeddable anywhere an image is, e.g. a GitHub profile README:
//
//   ![Riding stats](https://ascent-analytics.vercel.app/api/card)
//
//   GET /api/card?period=ytd|30d|7d|all&theme=dark|light
//
// Same aggregate numbers as /api/stats (no names, dates, routes or coordinates),
// drawn as an image so it needs no JS or CORS on the embedding page.

const { loadStats } = require('./stats.js');

const PERIODS = {
  ytd: { key: 'ytd', label: () => String(new Date().getFullYear()) },
  '30d': { key: 'last_30_days', label: () => 'Last 30 days' },
  '7d': { key: 'last_7_days', label: () => 'Last 7 days' },
  all: { key: 'totals', label: s => 'Last ' + s.sample.activities + ' activities' },
};

const THEMES = {
  dark: { bg: '#131313', border: '#2b2b2b', text: '#f2f2f2', muted: '#8a8a8a', bar: '#2b2b2b' },
  light: { bg: '#ffffff', border: '#e4e4e4', text: '#151515', muted: '#6b6b6b', bar: '#ececec' },
};
const ORANGE = '#FC4C02';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Math.round(n).toLocaleString('en-US');

function card(stats, period, t) {
  const p = PERIODS[period];
  const b = stats[p.key];
  const items = [
    ['Distance', num(b.distance_km), 'km'],
    ['Elevation', num(b.elevation_m), 'm'],
    ['Moving time', num(b.moving_hours), 'h'],
    ['Activities', num(b.activities), ''],
  ];

  // Last 12 months of distance as a small bar chart along the bottom.
  const months = stats.by_month.slice(-12);
  const max = Math.max(1, ...months.map(m => m.distance_km));
  const bw = 445 / 12;
  const bars = months.map((m, i) => {
    const h = Math.max(2, (m.distance_km / max) * 34);
    const x = 25 + (12 - months.length + i) * bw;
    const last = i === months.length - 1;
    return `<rect x="${(x + 3).toFixed(1)}" y="${(178 - h).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${last ? ORANGE : t.bar}"><title>${esc(m.month)}: ${num(m.distance_km)} km</title></rect>`;
  }).join('');

  const cols = items.map(([label, value, unit], i) => {
    const x = 25 + i * 115;
    return `<text x="${x}" y="82" class="v">${esc(value)}<tspan class="u" dx="3">${esc(unit)}</tspan></text>`
      + `<text x="${x}" y="104" class="l">${esc(label)}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img" aria-label="Riding stats, ${esc(p.label(stats))}">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
.t{font-size:15px;font-weight:700;fill:${t.text}}
.s{font-size:12px;fill:${t.muted}}
.v{font-size:24px;font-weight:700;fill:${t.text}}
.u{font-size:12px;font-weight:600;fill:${ORANGE}}
.l{font-size:11px;fill:${t.muted};letter-spacing:.3px}
</style>
<rect x="0.5" y="0.5" width="494" height="194" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<rect x="25" y="22" width="4" height="16" rx="1" fill="${ORANGE}"/>
<text x="36" y="35" class="t">Riding stats</text>
<text x="470" y="35" class="s" text-anchor="end">${esc(p.label(stats))}</text>
${cols}
<text x="25" y="134" class="l">Distance by month</text>
${bars}
</svg>`;
}

function errorCard(t, msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="60" viewBox="0 0 495 60">
<rect x="0.5" y="0.5" width="494" height="59" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<text x="25" y="35" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="13" fill="${t.muted}">Riding stats unavailable — ${esc(msg)}</text>
</svg>`;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const period = PERIODS[q.period] ? q.period : 'ytd';
  const t = THEMES[q.theme] || THEMES.dark;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  const { status, body } = await loadStats();
  if (status !== 200 || body.error) {
    // Short cache so a paused Supabase project recovers quickly in the README.
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(200).send(errorCard(t, body.error || 'error'));
    return;
  }
  // GitHub's image proxy (camo) honours these, so the README refreshes roughly hourly.
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(card(body, period, t));
};

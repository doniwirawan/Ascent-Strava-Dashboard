// Public SVG stats cards — embeddable anywhere an image is, e.g. a GitHub profile README:
//
//   ![Riding stats](https://ascent-analytics.vercel.app/api/card)
//
//   GET /api/card?type=summary|calendar|latest|fitness|bikes|fun&theme=dark|light
//   summary also takes ?period=ytd|30d|7d|all
//
// Built from the same payload as /api/stats (no routes, no coordinates), drawn as
// an image so it needs no JS or CORS on the embedding page. Every card is 495×195
// so they line up in a grid.

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
const W = 495, H = 195;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Math.round(n).toLocaleString('en-US');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Frame shared by every card: background, orange tick, title, right-hand subtitle.
function frame(t, title, sub, body, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title + ', ' + sub)}">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
.t{font-size:15px;font-weight:700;fill:${t.text}}
.s{font-size:12px;fill:${t.muted}}
.v{font-size:24px;font-weight:700;fill:${t.text}}
.u{font-size:12px;font-weight:600;fill:${ORANGE}}
.l{font-size:11px;fill:${t.muted};letter-spacing:.3px}
.n{font-size:13px;font-weight:600;fill:${t.text}}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<rect x="25" y="22" width="4" height="16" rx="1" fill="${ORANGE}"/>
<text x="36" y="35" class="t">${esc(title)}</text>
<text x="470" y="35" class="s" text-anchor="end">${esc(sub)}</text>
${body}
</svg>`;
}

// Up to four big numbers in a row.
function statRow(items, y = 82) {
  return items.map(([label, value, unit], i) => {
    const x = 25 + i * 115;
    return `<text x="${x}" y="${y}" class="v">${esc(value)}<tspan class="u" dx="3">${esc(unit)}</tspan></text>`
      + `<text x="${x}" y="${y + 22}" class="l">${esc(label)}</text>`;
  }).join('');
}

function summary(s, t, period) {
  const p = PERIODS[period] || PERIODS.ytd;
  const b = s[p.key];
  const months = s.by_month.slice(-12);
  const max = Math.max(1, ...months.map(m => m.distance_km));
  const bw = 445 / 12;
  const bars = months.map((m, i) => {
    const h = Math.max(2, (m.distance_km / max) * 34);
    const x = 25 + (12 - months.length + i) * bw;
    return `<rect x="${(x + 3).toFixed(1)}" y="${(178 - h).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${i === months.length - 1 ? ORANGE : t.bar}"><title>${esc(m.month)}: ${num(m.distance_km)} km</title></rect>`;
  }).join('');
  return frame(t, 'Riding stats', p.label(s), statRow([
    ['Distance', num(b.distance_km), 'km'],
    ['Elevation', num(b.elevation_m), 'm'],
    ['Moving time', num(b.moving_hours), 'h'],
    ['Activities', num(b.activities), ''],
  ]) + `<text x="25" y="134" class="l">Distance by month</text>${bars}`);
}

// A year of riding as a GitHub-style contribution grid, coloured by km per day.
function calendar(s, t) {
  const c = s.calendar;
  const km = new Map(c.days.map(d => [d.date, d.km]));
  const vals = c.days.map(d => d.km).sort((a, b) => a - b);
  const q = f => vals[Math.floor((vals.length - 1) * f)] || 0;
  const steps = [q(0.25), q(0.5), q(0.75)];
  const shade = k => (k <= 0 ? t.bar : k <= steps[0] ? 'rgba(252,76,2,.35)' : k <= steps[1] ? 'rgba(252,76,2,.55)' : k <= steps[2] ? 'rgba(252,76,2,.78)' : ORANGE);
  const cell = 8.5, x0 = 22, y0 = 66;
  let out = '', lastMonth = '';
  const start = Date.parse(c.from + 'T00:00:00Z');
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const key = new Date(start + (w * 7 + d) * 86400000).toISOString().slice(0, 10);
      if (key > c.to) break;
      if (d === 0 && key.slice(5, 7) !== lastMonth) {
        lastMonth = key.slice(5, 7);
        if (w < 51) out += `<text x="${(x0 + w * cell).toFixed(1)}" y="${y0 - 6}" class="l">${new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`;
      }
      const k = km.get(key) || 0;
      out += `<rect x="${(x0 + w * cell).toFixed(1)}" y="${(y0 + d * cell).toFixed(1)}" width="7" height="7" rx="1.5" fill="${shade(k)}"><title>${key}${k ? ': ' + k + ' km' : ''}</title></rect>`;
    }
  }
  const total = c.days.reduce((a, d) => a + d.km, 0);
  const legend = [t.bar, 'rgba(252,76,2,.35)', 'rgba(252,76,2,.55)', 'rgba(252,76,2,.78)', ORANGE]
    .map((f, i) => `<rect x="${404 + i * 11}" y="${H - 27}" width="8" height="8" rx="1.5" fill="${f}"/>`).join('');
  return frame(t, 'A year on the bike', c.days.length + ' active days', out
    + `<text x="25" y="${H - 19}" class="s">${num(total)} km in the last 12 months</text>`
    + `<text x="398" y="${H - 19}" class="l" text-anchor="end">Less</text>${legend}<text x="461" y="${H - 19}" class="l">More</text>`);
}

function latest(s, t) {
  const r = s.latest_ride;
  if (!r) return errorCard(t, 'no rides yet');
  const h = Math.floor(r.moving_minutes / 60), m = String(r.moving_minutes % 60).padStart(2, '0');
  return frame(t, 'Latest ride', fmtDate(r.date),
    `<text x="25" y="68" class="n">${esc(clip(r.name || r.sport, 58))}</text>`
    + statRow([
      ['Distance', r.distance_km, 'km'],
      ['Elevation', num(r.elevation_m), 'm'],
      ['Time', h + ':' + m, ''],
      ['Avg speed', r.avg_kmh, 'km/h'],
    ], 120)
    + (r.avg_hr ? `<text x="25" y="${H - 20}" class="s">Avg heart rate ${r.avg_hr} bpm</text>` : ''));
}

// Fitness (CTL) as a filled area over 90 days, form (TSB) as a line.
function fitness(s, t) {
  const f = s.fitness;
  const pts = f.last_90_days;
  const x0 = 25, x1 = 470, y0 = 128, y1 = 178;
  const lo = Math.min(0, ...pts.map(p => p.tsb)), hi = Math.max(1, ...pts.map(p => p.ctl));
  const X = i => x0 + (i / Math.max(1, pts.length - 1)) * (x1 - x0);
  const Y = v => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
  const ctl = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.ctl).toFixed(1)}`).join(' ');
  const tsb = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.tsb).toFixed(1)}`).join(' ');
  const formColor = { 'High fatigue': '#ef4444', Productive: '#fb923c', Neutral: '#eab308', Fresh: '#22c55e', Detraining: '#60a5fa' }[f.form] || ORANGE;
  return frame(t, 'Training form', 'Last 90 days',
    statRow([
      ['Fitness', f.ctl, ''],
      ['Fatigue', f.atl, ''],
      ['Form', (f.tsb > 0 ? '+' : '') + f.tsb, ''],
    ], 74)
    + `<text x="370" y="74" font-size="15" font-weight="700" fill="${formColor}">${esc(f.form)}</text>`
    + `<text x="370" y="96" class="l">${f.ramp >= 0 ? '+' : ''}${f.ramp} fitness this week</text>`
    + `<line x1="${x0}" x2="${x1}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="${t.border}" stroke-dasharray="3 3"/>`
    + `<polygon points="${x0},${Y(lo).toFixed(1)} ${ctl} ${x1},${Y(lo).toFixed(1)}" fill="rgba(252,76,2,.18)"/>`
    + `<polyline points="${ctl}" fill="none" stroke="${ORANGE}" stroke-width="2"/>`
    + `<polyline points="${tsb}" fill="none" stroke="${t.muted}" stroke-width="1.2" stroke-dasharray="4 3"/>`);
}

function bikes(s, t) {
  const list = (s.bikes || []).slice(0, 4);
  if (!list.length) return errorCard(t, 'bikes unavailable');
  const max = Math.max(1, ...list.map(b => b.distance_km));
  const rowH = list.length > 3 ? 30 : 38;
  const rows = list.map((b, i) => {
    const y = 62 + i * rowH;
    const w = Math.max(4, (b.distance_km / max) * 445);
    return `<text x="25" y="${y + 12}" class="n">${esc(clip(b.name, 40))}</text>`
      + `<text x="470" y="${y + 12}" class="s" text-anchor="end">${b.distance_km ? num(b.distance_km) + ' km' : 'new'}</text>`
      + `<rect x="25" y="${y + 18}" width="445" height="6" rx="3" fill="${t.bar}"/>`
      + `<rect x="25" y="${y + 18}" width="${w.toFixed(1)}" height="6" rx="3" fill="${i === 0 ? ORANGE : 'rgba(252,76,2,.55)'}"/>`;
  }).join('');
  return frame(t, 'The bikes', 'All-time km', rows);
}

function fun(s, t) {
  const f = s.fun, st = s.streak;
  const tiles = [
    ['🔥', st.weeks, 'weeks in a row riding'],
    ['🐷', num(f.babi_guling_this_year), 'plates of babi guling burned in ' + new Date().getFullYear()],
    ['🏔️', f.everests + '×', 'Everest climbed'],
    ['🌏', f.around_the_earth_pct + '%', 'of the way around the Earth'],
  ];
  const out = tiles.map(([icon, value, label], i) => {
    const x = 25 + (i % 2) * 230, y = 78 + Math.floor(i / 2) * 58;
    return `<text x="${x}" y="${y}" font-size="22">${icon}</text>`
      + `<text x="${x + 34}" y="${y}" class="v">${esc(value)}</text>`
      + `<text x="${x + 34}" y="${y + 20}" class="l">${esc(label)}</text>`;
  }).join('');
  return frame(t, 'Fun numbers', f.basis === 'all_time' ? 'All time' : 'Recent rides', out);
}

const TYPES = { summary, calendar, latest, fitness, bikes, fun };
// Only these need Strava itself; the rest skip it so a cold start answers inside
// the few seconds GitHub's image proxy waits.
const NEEDS_STRAVA = new Set([bikes, fun]);

function errorCard(t, msg) {
  return frame(t, 'Riding stats', '', `<text x="25" y="70" class="s">Unavailable — ${esc(msg)}</text>`, 100);
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const draw = TYPES[q.type] || summary;
  const t = THEMES[q.theme] || THEMES.dark;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  const { status, body } = await loadStats({ strava: NEEDS_STRAVA.has(draw) });
  if (status !== 200 || body.error) {
    // Short cache so a paused Supabase project recovers quickly in the README.
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(200).send(errorCard(t, body.error || 'error'));
    return;
  }
  // GitHub's image proxy (camo) honours these, so the README refreshes roughly hourly.
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(draw(body, t, q.period));
};

/* ── STORY CARD ── */
const STAT_DEFS = [
  { key: 'distance', label: 'Distance', fmt: a => fmtD(a.distance || 0), unit: '' },
  { key: 'moving_time', label: 'Moving Time', fmt: a => fmtT(a.moving_time || 0), unit: '' },
  { key: 'average_speed', label: 'Avg Speed', fmt: a => kmh(a.average_speed || 0) + ' ' + speedUnit(), unit: '' },
  { key: 'max_speed', label: 'Max Speed', fmt: a => kmh(a.max_speed || 0) + ' ' + speedUnit(), unit: '' },
  { key: 'average_heartrate', label: 'Avg Heart Rate', fmt: a => a.average_heartrate ? Math.round(a.average_heartrate) + ' bpm' : '—', unit: '' },
  { key: 'max_heartrate', label: 'Max Heart Rate', fmt: a => a.max_heartrate ? Math.round(a.max_heartrate) + ' bpm' : '—', unit: '' },
  { key: 'average_cadence', label: 'Avg Cadence', fmt: a => a.average_cadence ? Math.round(a.average_cadence) + ' rpm' : '—', unit: '' },
  { key: 'average_watts', label: 'Avg Power', fmt: a => a.average_watts ? Math.round(a.average_watts) + ' W' : '—', unit: '' },
  { key: 'total_elevation_gain', label: 'Elevation', fmt: a => fmtElev(a.total_elevation_gain || 0), unit: '' },
  { key: 'kilojoules', label: 'Energy', fmt: a => a.kilojoules ? Math.round(a.kilojoules) + ' kJ' : '—', unit: '' },
  { key: 'calories', label: 'Calories', fmt: a => a.calories ? Math.round(a.calories) + ' kcal' : '—', unit: '' },
  { key: 'suffer_score', label: 'Suffer Score', fmt: a => a.suffer_score || '—', unit: '' },
  { key: 'achievement_count', label: 'Achievements', fmt: a => a.achievement_count || 0, unit: '' },
];

let checkedStats = new Set(['distance', 'moving_time', 'average_speed', 'max_speed', 'total_elevation_gain', 'average_heartrate']);
let activeScheme = 'dark';
let customAccent = null; // override accent color
let activeLayout = 'strip';
let hideTitle = false, hideDate = false, hideRoute = false, hideLogo = false;
let storyBgImage = null; // uploaded background image
let currentStreams = null; // altitude+distance streams for selected activity
const streamsCache = {}; // keyed by activity id

/* ── SCHEMES — sleek dark / minimal palette ──
   All cards are solid colours (gradients only render in the strava layout),
   near-black surfaces, soft off-white text, low-chroma muted tones and
   hairline dividers for a calm, modern look. transp.card stays 'transparent'
   and white.card keeps 'rgba(255,255,255' — the strava/ink layouts detect a
   light card by string-matching those. */
const SCHEMES = {
  transp:   { card: 'transparent',          text: '#ffffff', muted: 'rgba(255,255,255,0.5)',  icon: 'rgba(255,255,255,0.7)', div: 'rgba(255,255,255,0.12)', accent: '#FC4C02', bg: 'transparent' },
  dark:     { card: 'rgba(14,14,16,0.98)',  text: '#f4f4f5', muted: '#7a7a83', icon: '#9a9aa3', div: 'rgba(255,255,255,0.08)', accent: '#FC4C02', bg: 'transparent' },
  graphite: { card: 'rgba(24,24,27,0.98)',  text: '#e4e4e7', muted: '#71717a', icon: '#a1a1aa', div: 'rgba(255,255,255,0.07)', accent: '#fafafa', bg: 'transparent' },
  black:    { card: 'rgba(0,0,0,0.985)',    text: '#fafafa', muted: '#5a5a5a', icon: '#7a7a7a', div: 'rgba(255,255,255,0.06)', accent: '#FC4C02', bg: 'transparent' },
  white:    { card: 'rgba(255,255,255,0.98)', text: '#0a0a0a', muted: '#a1a1aa', icon: '#52525b', div: '#ececef', accent: '#FC4C02', bg: 'transparent' },
  night:    { card: 'rgba(12,14,24,0.98)',  text: '#dfe3f0', muted: '#5a6178', icon: '#7681a0', div: 'rgba(160,180,255,0.08)', accent: '#7c8fff', bg: 'transparent' },
  slate:    { card: 'rgba(16,20,28,0.98)',  text: '#dde4f0', muted: '#5c6a82', icon: '#7a8aa6', div: 'rgba(140,170,210,0.08)', accent: '#64a0ff', bg: 'transparent' },
  forest:   { card: 'rgba(12,18,14,0.98)',  text: '#d4e6d6', muted: '#5a7560', icon: '#7a9a80', div: 'rgba(120,190,140,0.08)', accent: '#4caf6a', bg: 'transparent' },
  plum:     { card: 'rgba(20,10,24,0.98)',  text: '#ebd9f5', muted: '#6a5878', icon: '#9a7aae', div: 'rgba(190,140,255,0.08)', accent: '#b07cff', bg: 'transparent' },
  orange:   { card: 'rgba(252,76,2,0.98)',  text: '#ffffff', muted: 'rgba(255,255,255,0.7)', icon: '#ffffff', div: 'rgba(255,255,255,0.18)', accent: '#ffffff', bg: 'transparent' },
};

/* ── icon ── */
const STAT_ICONS = { distance: 'distance', moving_time: 'time', average_speed: 'speed', max_speed: 'speed', average_heartrate: 'hr', max_heartrate: 'hr', average_cadence: 'cadence', average_watts: 'power', total_elevation_gain: 'elev', kilojoules: 'power', calories: 'fire', suffer_score: 'hr', achievement_count: 'star' };

/* ── get resolved scheme ── */
function getScheme() {
  const s = { ...SCHEMES[activeScheme] || SCHEMES.transp };
  if (customAccent) { s.accent = customAccent; }
  return s;
}

/* ── stat value helper ── */
function statVal(s, act) { const v = String(s.fmt(act)); const p = v.split(' '); return { num: p[0], unit: p.slice(1).join(' ') }; }

/* ── 25 LAYOUTS ── */
const LAYOUTS = [
  { id: 'strava', name: 'Strava' },
  { id: 'strip', name: 'Strip' },
  { id: 'grid', name: 'Grid' },
  { id: 'hero', name: 'Hero' },
  { id: 'map', name: 'Map' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'split', name: 'Split' },
  { id: 'stacked', name: 'Stacked' },
  { id: 'cinema', name: 'Cinema' },
  { id: 'neon', name: 'Neon' },
  { id: 'sport', name: 'Sport' },
  { id: 'gradient', name: 'Gradient' },
  { id: 'badge', name: 'Badge' },
  { id: 'tiles', name: 'Tiles' },
  { id: 'ink', name: 'Ink' },
  { id: 'nightrun', name: 'Night Run' },
  { id: 'explorer', name: 'Explorer' },
  { id: 'topo', name: 'Topo' },
  { id: 'graphic', name: 'Graphic' },
  { id: 'field', name: 'Field' },
  { id: 'badgewave', name: 'Badge Wave' },

];

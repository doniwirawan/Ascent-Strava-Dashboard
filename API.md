# Public Stats API

A free, read-only endpoint that serves aggregate Strava numbers from the dashboard's
Supabase cache. Built for **doniwirawan.xyz** to embed live riding stats.

**Base URL:** `https://ascent-analytics.vercel.app`

(`stravadashboard.vercel.app` 307-redirects here — use the canonical host above to
skip the extra hop.)

---

## `GET /api/stats`

No auth, no API key, no query params. Just fetch it.

```js
const stats = await fetch('https://ascent-analytics.vercel.app/api/stats').then(r => r.json());
```

CORS is restricted to `doniwirawan.xyz`, `www.doniwirawan.xyz`, and localhost
(`:3000` / `:5173`). Calling it from browser JS on any other origin is blocked.
Server-side calls (SSR, build-time, curl) work from anywhere.

### Response

```jsonc
{
  "athlete_id": 124436743,
  "synced_at": "2026-07-13T04:00:00Z",     // when the dashboard last refreshed the cache
  "generated_at": "2026-07-13T12:49:14Z",  // when this response was computed
  "sample": {
    "activities": 200,
    "first": "2025-01-14",                 // oldest activity in the window
    "last": "2026-07-11",                  // newest
    "note": "..."                          // human-readable caveat, see below
  },

  // Same shape in all four buckets:
  "totals":       { "activities": 200, "rides": 184, "distance_km": 4210.6, "elevation_m": 51230, "moving_hours": 213.4 },
  "ytd":          { ... },                 // current calendar year
  "last_30_days": { ... },
  "last_7_days":  { ... },

  "bests": {
    "longest_ride_km": 132.4,
    "biggest_climb_m": 1840,
    "fastest_avg_kmh": 31.2,
    "longest_moving_hours": 5.0,
    "highest_avg_watts": 210               // null if no power data
  },

  "by_month": [                            // oldest → newest; empty months omitted
    { "month": "2026-07", "activities": 12, "distance_km": 210.5, "elevation_m": 2750 }
  ],
  "by_sport": [                            // sorted by distance, descending
    { "sport": "Ride", "activities": 184, "distance_km": 3980.1, "moving_hours": 190.2 }
  ]
}
```

**Important caveat for `totals`:** the Strava cache holds the **most recent 200
activities**, not the full career. So `totals` means "over the last 200 activities"
(see `sample.first` / `sample.last` for the actual window) — don't label it "all
time" in the UI. `ytd`, `last_30_days` and `last_7_days` are exact as long as the
window covers them, which it does at normal riding volume.

### Errors

| Response | Meaning |
|---|---|
| `200 { "error": "no_data", "synced_at": null }` | Cache is empty — the owner hasn't loaded the dashboard yet. Render a fallback, don't crash. |
| `500 { "error": "not_configured", "need": [...] }` | Server env vars missing. |
| `502 { "error": "upstream_error" }` | Supabase unreachable. |

Always check for `error` before reading `totals` — a `200` can still carry `no_data`.

### Caching & rate limits

Responses are cached on Vercel's CDN for **10 minutes**
(`s-maxage=600, stale-while-revalidate=3600`). Traffic on doniwirawan.xyz hits the
CDN, not Supabase, so there's no meaningful rate limit and both free tiers are safe.
No need to add your own cache — but if you're on Next.js, a `revalidate: 600` on
the fetch pairs nicely.

### Privacy

Deliberately **numbers only**. No activity names, dates, route polylines, or start
coordinates are ever returned, so nothing reveals where the rides happen.

---

## Example: React

```jsx
function StravaStats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch('https://ascent-analytics.vercel.app/api/stats')
      .then(r => r.json())
      .then(d => !d.error && setS(d))
      .catch(() => {});
  }, []);
  if (!s) return null;

  return (
    <div>
      <Stat label="Distance (last 200 rides)" value={`${s.totals.distance_km.toLocaleString()} km`} />
      <Stat label="Climbed" value={`${s.totals.elevation_m.toLocaleString()} m`} />
      <Stat label="This year" value={`${s.ytd.distance_km.toLocaleString()} km`} />
      <Stat label="Longest ride" value={`${s.bests.longest_ride_km} km`} />
      <Sparkline data={s.by_month.map(m => m.distance_km)} />
    </div>
  );
}
```

## Example: static HTML

```html
<p>I've ridden <b id="km">…</b> km this year.</p>
<script>
  fetch('https://ascent-analytics.vercel.app/api/stats')
    .then(r => r.json())
    .then(d => { if (!d.error) document.getElementById('km').textContent = d.ytd.distance_km.toLocaleString(); });
</script>
```

---

## Server setup (already done, for reference)

Implemented in `api/stats.js`. Reads the owner's row from the RLS-locked
`strava_cache` table with the service-role key (server-side only).

Requires these Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`OWNER_ATHLETE_ID`.

To allow another origin, add it to `ALLOWED_ORIGINS` in `api/stats.js` and redeploy.

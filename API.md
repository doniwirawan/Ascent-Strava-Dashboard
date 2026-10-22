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

### Extra fields

| Field | What it is |
|---|---|
| `calendar` | `{ from, to, days: [{ date, km }] }` — km per day for the last 53 weeks (days without activity omitted) |
| `streak` | `{ weeks, best_weeks, active_days_this_year }` — weeks in a row (Mon–Sun) with an activity |
| `fitness` | `{ ctl, atl, tsb, ramp, form, last_90_days: [{ date, ctl, tsb }] }` — same model as the dashboard's Training section, minus estimated power |
| `latest_ride` | `{ name, sport, date, distance_km, elevation_m, moving_minutes, avg_kmh, avg_hr }` |
| `bikes` | `[{ name, distance_km }]` — active bikes, all-time km from Strava. `null` if Strava is unreachable |
| `all_time` | `{ rides, distance_km, elevation_m, moving_hours, longest_ride_km, biggest_climb_m }` from Strava's athlete stats. `null` if unreachable |
| `fun` | `{ babi_guling_this_year, kcal_this_year, everests, around_the_earth_pct, days_in_the_saddle, basis }` — `basis` is `all_time` or `sample` |

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

No route polylines or coordinates are ever returned, so nothing reveals where the
rides start. Dates appear only as km-per-day in `calendar` and the latest ride's
date; the only activity name is `latest_ride.name`, the auto-caption, which names
the destination and never the start.

---

## `GET /api/card` — SVG cards

Image cards built from the same data, for READMEs or any `<img>`. All 495×195.

```
/api/card?type=summary|calendar|latest|fitness|bikes|fun&theme=dark|light
/api/card?type=summary&period=ytd|30d|7d|all
```

Cached for an hour (`max-age=3600`), which GitHub's image proxy honours.

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

---

# Personal API (`/api/v1`) — your own data, for your own apps

Read-only REST API over **all** of the owner's data, for a phone app or scripts.
Code: `api/_v1.js` (rewritten into `api/stats.js` by `vercel.json`, so it adds no
Serverless Function).

**Base URL:** `https://ascent-analytics.doniwirawan.xyz/api/v1`

## Auth

1. Dashboard → **Settings → Personal API** → name the app → **Create token**.
2. Copy the `asc_…` token. It is shown **once**; only its SHA-256 hash is stored
   (Supabase `api_tokens`). Revoke it there and it stops working immediately.
3. Send it on every request:

```bash
curl -H "Authorization: Bearer asc_…" https://ascent-analytics.doniwirawan.xyz/api/v1/activities?limit=5
```

Responses are JSON, never cached (`Cache-Control: private, no-store`), and CORS is
open (`*`) because auth is the bearer token, not cookies. Keep tokens out of public
code — anyone holding one can read everything below.

## Endpoints (all `GET`)

| Path | Returns |
|---|---|
| `/` | This list of endpoints |
| `/me` | Strava profile, bikes and shoes (live from Strava) |
| `/activities?limit=50&offset=0&type=Ride,Run&after=YYYY-MM-DD&before=YYYY-MM-DD` | Cached activities, newest first — full Strava summaries incl. `map.summary_polyline`. `limit` max 500 |
| `/activities/{id}` | One activity. `?streams=1` adds every stream from Strava (or a list: `?streams=watts,heartrate,latlng`); `?live=1` asks Strava when it isn't cached |
| `/stats` | Totals, YTD, last 7/30 days, bests, by month / sport, calendar, streak, fitness |
| `/strava-stats` | Strava's own all-time / YTD / 4-week totals |
| `/sleep` | Sleep nights (Huawei export + the Android app's Health Connect sync): `{ cols, rows, … }` |
| `POST /sleep` | The one write: `{ source, nights: [{ date, asleep, deep, light, rem, wake, nap, wakeups, bed, up, tib, eff, napt, steps, dist, cal }] }` (minutes; `bed`/`up` local hours, bed negative before midnight; a night is dated by the morning you woke). New nights are added, nights from the Huawei export are never overwritten, nights an earlier app sync wrote are replaced. |
| `/huawei` | Huawei workouts (no tracks); `/huawei/{record_id}` for one with its track |
| `/purchases?category=Cycling&after=&before=&cancelled=1` | Purchases from the finance app; cancelled orders hidden unless `cancelled=1` |
| `/bikes` | Each bike with the parts assigned to it and what they cost |
| `/ai` | AI analysis + caption per activity; `/ai/chats` for AI Coach conversations |
| `/app` | Newest Android build (`versionCode`, `versionName`, `notes`) with a 10-minute download `url` — the app's self-update. Published by `android/publish-update.mjs` |

## Errors

`{ "error": "code" }` with: `401 missing_api_token / invalid_api_token`,
`404 not_found / unknown_endpoint`, `405 method_not_allowed`,
`429 strava_rate_limited` (streams / live calls share the app's Strava limit),
`501 not_configured`, `502 store_unavailable / strava_unavailable`.

## Token management (used by the Settings card)

Authenticated with the owner's **Strava** access token in `X-Strava-Token`:
`GET /api/v1/tokens` (list), `POST /api/v1/tokens {"name"}` (create, returns the
token once), `DELETE /api/v1/tokens/{id}` (revoke).

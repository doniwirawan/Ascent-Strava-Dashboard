# STATUS — Public Stats API for doniwirawan.xyz

Last updated: **2026-11-02**

## TL;DR

**Live.** `GET https://ascent-analytics.vercel.app/api/stats` returns real numbers
(checked 2026-11-02). Integration spec for the consuming site: **[API.md](API.md)**.
The same function also serves the Personal API (`/api/v1/*`, rewritten to
`/api/stats?v1=` in `vercel.json`, code in `api/_v1.js`).

History: the Supabase project was deactivated 2026-07-13 (free org limit of 2 active
projects); it was restored and `SUPABASE_SERVICE_ROLE_KEY` added to Vercel on
2026-09-21.

## What it returns

Aggregates only: `totals`, `ytd`, `last_30_days`, `last_7_days`, `bests`, `by_month`,
`by_sport`. **No** activity names, dates, polylines or coordinates — nothing reveals
where rides happen. CORS is locked to `doniwirawan.xyz`, `www.doniwirawan.xyz` and
localhost (`ALLOWED_ORIGINS` in `api/stats.js`). CDN-cached 10 min
(`s-maxage=600, stale-while-revalidate=3600`).

## ⚠️ Watch item

Supabase free projects **auto-pause after 7 days idle**. In practice the Strava
webhook and every dashboard open write to it, so a quiet week is the only risk.
If `/api/stats` starts returning 500 with a 521 from Supabase, the project paused:
resume `strava_dashboard` (`bfyiqllcglnoocbaigcp`) in the Supabase dashboard.
Check it's alive with:

```bash
curl -o /dev/null -w "%{http_code}\n" https://bfyiqllcglnoocbaigcp.supabase.co/rest/v1/
# 401 = alive (wants a key).  000 = offline.
```

## Key facts

- **API host:** `https://ascent-analytics.vercel.app/api/...` (non-API paths on that
  host redirect to `https://ascent-analytics.doniwirawan.xyz`).
- **Owner athlete id:** `124436743`
- **Data source:** the owner's row in the RLS-locked `strava_cache` table, read
  server-side with the service-role key.
- **Caveat for the consuming site:** `totals` covers only the activities in the
  cache (see `sample.activities`, `sample.first` / `sample.last`), *not* all-time.
  Don't label it "all time" in the UI.

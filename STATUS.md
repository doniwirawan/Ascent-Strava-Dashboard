# STATUS — Public Stats API for doniwirawan.xyz

Last updated: **2026-07-13**

Working notes for the public API that lets doniwirawan.xyz show live Strava stats.
Read this first; update it when the state changes.

---

## TL;DR

The API is **built, committed, and deployed**, but **not yet returning data** —
blocked on a Supabase project that is offline. Nothing is broken in the code.

Live check:

```bash
curl https://ascent-analytics.vercel.app/api/stats
# now:    {"error":"not_configured","need":[...]}
# target: {"athlete_id":124436743,"totals":{...},...}
```

---

## ✅ Done

- **`api/stats.js`** — public read-only `GET /api/stats` on the existing Vercel
  deploy. Returns aggregate numbers only: `totals`, `ytd`, `last_30_days`,
  `last_7_days`, `bests`, `by_month`, `by_sport`. **No** activity names, dates,
  polylines, or coordinates — deliberately, so nothing reveals where rides happen.
- **CORS** locked to `doniwirawan.xyz`, `www.doniwirawan.xyz`, and localhost
  (`:3000`, `:5173`). Verified live: the right `Access-Control-Allow-Origin` comes
  back. To add an origin, edit `ALLOWED_ORIGINS` in `api/stats.js` and redeploy.
- **Caching** — CDN-cached 10 min (`s-maxage=600, stale-while-revalidate=3600`),
  so site traffic never reaches Supabase. Stays inside both free tiers.
- **`API.md`** — full integration spec (response shape, errors, React + plain-HTML
  examples). **Hand this to whoever builds doniwirawan.xyz.**
- Deployed to production; both commits pushed to `master`.

## 🚧 Blocked

**The `strava_dashboard` Supabase project is offline.** Its hostname does not
resolve, so the table `/api/stats` reads from is unreachable.

Cause: the Supabase org `chronic-rose-lark` is on the free plan (**limit: 2 active
projects**) and had **3**. Creating the `doniwirawan.xyz` project on 2026-07-13
tripped the limit and Supabase deactivated `strava_dashboard`.

| Project | Ref | State |
|---|---|---|
| `aksara_bali` | `kgpztrgcgpxuhrnkeltk` | alive — **decided: pause this one** |
| `doniwirawan.xyz` | `srzohrmbbxkecagwyzhb` | alive — created 2026-07-13, keeping |
| `strava_dashboard` | `bfyiqllcglnoocbaigcp` | **OFFLINE — needs restore** |

As of last check the restore would not go through yet. Pausing can take time to
settle; retry later.

Side effect: the dashboard's **cross-device cache is also down** (it falls back to
per-browser localStorage, so the dashboard itself still works).

## 👉 Next steps

1. **Pause `aksara_bali`** — [dashboard](https://supabase.com/dashboard/project/kgpztrgcgpxuhrnkeltk/settings/general)
   → General Settings → bottom → *Pause project*. (Reversible; data is retained.
   The CLI **cannot** pause — dashboard only.)
2. **Restore `strava_dashboard`** — [dashboard](https://supabase.com/dashboard/project/bfyiqllcglnoocbaigcp)
   → *Restore project*. Takes a few minutes. Confirm with:
   ```bash
   curl -o /dev/null -w "%{http_code}\n" https://bfyiqllcglnoocbaigcp.supabase.co/rest/v1/
   # 401 = alive (wants a key).  000 = still offline.
   ```
3. **Add the service-role key** — Supabase → Settings → API → `service_role`
   (the **secret** one, *not* anon). It is the only env var still missing:
   ```bash
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel --prod
   ```
4. **Verify** — `curl https://ascent-analytics.vercel.app/api/stats` returns real
   numbers.

## ⚠️ Known risk (decide once it works)

Supabase **auto-pauses free projects after 7 days of inactivity**.
`strava_dashboard` is only written when the owner opens the dashboard — so a quiet
week can pause it again and take the stats on doniwirawan.xyz down with it.

Options when that becomes annoying:
- a weekly cron that pings the project to keep it warm; or
- rework `/api/stats` to read the Strava API server-side via the owner refresh
  token already in Vercel — drops the Supabase dependency entirely (no project
  limit, no auto-pause). Costs Strava API quota on cache misses, and does **not**
  fix the dashboard's cross-device cache, which needs Supabase regardless.

---

## Key facts

- **Canonical host:** `https://ascent-analytics.vercel.app`
  (`stravadashboard.vercel.app` 307-redirects to it — use the canonical one.)
- **Owner athlete id:** `124436743`
- **Vercel env:** `SUPABASE_URL`, `OWNER_ATHLETE_ID` ✅ set ·
  `SUPABASE_SERVICE_ROLE_KEY` ❌ missing
- **Data source:** the owner's row in the RLS-locked `strava_cache` table, read
  server-side with the service-role key.
- **Caveat for the consuming site:** the cache holds the **most recent 200
  activities**, so `totals` means "over the last 200 activities", *not* all-time.
  Don't label it "all time" in the UI — use `sample.first` / `sample.last` for the
  real window.

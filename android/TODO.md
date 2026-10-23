# Android app — to do

What the website has that the app doesn't yet, in build order. Ship as one
update through the in-app Update bar (`publish-update.mjs`).

- [x] 1. Home: fitness & form chart (90 days) + activity calendar (53 weeks)
- [x] 2. Rides: search by name / place + all-routes heatmap map
- [x] 3. Ride page: HR & power zones and per-km splits (with the ride data)
- [x] 4. Home: records — bests, Eddington number, km per bike
- [x] 5. Power: training zones (power + heart rate) from FTP
- [x] 6. AI Coach history (saved chats, read-only)
- [x] 7. Publish 2.3
- [x] 8. Watch sleep from Health Connect (JoyoFit + Watch Fit 4) → /api/v1/sleep → dashboard + app (2.4)
- [x] 9. AI Coach chat with your own key (DeepSeek, OpenRouter, OpenAI, Anthropic, Groq, Mistral) (2.4)
- [x] 10. Past-data permission: first Health Connect sync reaches a year back (2.5)
- [x] 11. Overlapping sleep / steps from several apps counted once, with unit tests (2.6)
- [x] 12. Updates install themselves: PackageInstaller session, auto-download on open + widget refresh, old APKs removed on publish (2.7)
- [x] 13. Money: Bike care — chain / tyre / brake / wax service reminders per bike, kept on the phone (2.7)
- [x] 15. Ride page: Segments & PRs; Home: all-time + fun facts; "Updated to" banner (2.8)
- [x] 16. Sleep card names the apps that wrote sleep + newest night; past-data button only where supported (2.8)
- [x] 17. 3D maps (ride + all routes, fly-through); map buttons wrap instead of overlapping; Story card button (2.9)
- [x] 14. JoyoFit + Ascent as one app — owner chose b): JoyoFit's watch link in huawei-wear/, Watch card on Sleep; the Android app is now AGPL-3.0 (android/LICENSE), minSdk 30 (3.0)
      a) rebuild JoyoFit's no-watch features (strength logger, manual workouts, gear reminders, run plans) in Ascent — our own code, no licence change;
      b) take JoyoFit's watch link (Kotlin, AGPL-3.0) into Ascent — the whole app then becomes AGPL, and pairing it resets the watch / unpairs Huawei Health, like JoyoFit does;
      c) keep both apps, joined through Health Connect (what works today).

## Web → app parity (owner, 2026-10-23: "every web feature in the app too")

Every dashboard section (index.html) against the app, migrated one at a time in
this order: first what the current /api/v1 data already covers, then what needs
ride streams, then what needs a new route in api/_v1.js (never a new api/ file).

Already in the app: overview stats + all-time + fun facts, fitness & form, 12-month
calendar heat, Eddington, bests, bikes km, activity list + search + routes map (2D/3D),
ride page (charts, zones, splits, segments & PRs, best efforts, AI analysis, Story card),
power (FTP, NP/IF/TSS, zones), sleep basics, recovery/strain, purchases, bike parts cost,
bike care, AI Coach chat + history, watch link.

Uses data the API already has:
- [x] P1. Sports: Running, Walking & hiking, Swimming, Other — totals + last-20 trend + distance spread (render-charts.js) — Rides tab chips (3.1)
- [x] P2. Trends: weekly distance, year-over-year monthly distance, Year in review (renderTrends, renderRewind) — More → Trends (3.2)
- [x] P3. Calendar: month-by-month activity calendar (renderCalendar) — More → Calendar (3.3)
- [x] P4. Overview extras: sport breakdown, HR-zone + speed-zone rings, insights, streak/consistency (render-overview.js) — Home (3.4; zones are average-HR / average-speed estimates like the website before streams)
- [x] P5. Training: 7/42-day load, ramp, climbing ability (VAM, best climb), running VDOT, readiness (training.js, sleep.js renderReadiness) — More → Training (3.5; readiness ring was already on Home)
- [ ] P5b. Training extras: Event ready (event-ready.js), AI training plan (with P19)
- [x] P6. Power extras: aerobic efficiency (EF), cadence vs power, flat vs hilly, best NP, climbing power / FTP without a power meter (power.js, climb-ftp.js) — Power tab (3.6; climbing power moved to P15b)
- [x] P7. Sleep insights: consistency / midpoint, after training vs rest, stress, active kcal, monthly watch metrics (sleep.js) — Sleep tab, findings + trends (3.7)
- [ ] P7b. Sleep, the rest of sleep.js: records & recipe, health risk, year health, stress, energy, steps, bike ↔ body, patterns, export, AI summary
- [x] P8. Gear: bike comparison — usage, cost per km, efficiency, speed on flat rides (gear-maint.js) — Money tab (3.8)
- [x] P9. Milestones & trophies (renderMilestones, renderChallenges) — More → Milestones (3.9; the KOM list joins P16)
- [x] P10. Heatmap extras: ride destinations by regency (regency-map.js) — More → Destinations (3.10; outside Bali is one count, the website looks those up on Nominatim)
- [x] P11. Huawei-only workouts in the activity list (/huawei) — Rides tab (3.11; sending them to Strava joins P19)
- [x] P12. Data: all activities & sleep as a sortable table (data-table.js) — More → Data (3.12)

Needs ride streams (/activities/{id}?streams=…, shares the Strava limit):
- [x] P13. Ride page: heart-rate decoupling, wind analysis, time-lost analysis (hr-decoupling.js, wind-analysis.js, time-lost.js) — ride page (3.13)
- [x] P14. Ride page: abnormal-speed / GPS spike check (gps-fix.js; the GPX repair suite stays web-only) — More → GPS check (3.14; the Strava description note joins P19)
- [x] P15. Power curve + Morton CP / W′ and W′ balance (power-curve.js, sauce.js) — Power tab + ride page (3.15)
- [x] P15b. Climbing power / FTP without a power meter: scans climbs from altitude streams (climb-ftp.js) — Power tab (3.16; bike weight is the website default 10 kg, the API has no gear weights)

Needs a new route in api/_v1.js:
- [x] P16. Segments: your starred segments, segment gaps, segment intelligence, KOM / QOM list — More → Segments (3.17; new /api/v1/segments + /koms)
- [ ] P16b. Segment gaps: road you ride often that no segment covers (segment-gaps.js; needs segment geometry from /segments/{id})
- [x] P17. Photos — More → Photos (3.18; new ?photos=1 on /api/v1/activities/{id}, no photo locations)
- [ ] P18. Chase routes: AI route generator (/api/route + /api/ai need owner auth that accepts the asc_ token)
- [ ] P19. Writes: AI overview insight, bulk caption rewrite, Huawei-only upload to Strava (write routes in _v1.js)
- [ ] P20. Share: stats image + social post (story card is done)

Settings:
- [ ] P21. Units (km / mi) and language (English / Indonesian)
- [ ] P22. Help: what the metrics mean

Stays web-only: landing page, Strava login, PWA install, save page as image, GPX repair
editor, Personal API token management and webhook settings (need the Strava login), Huawei
export upload (the watch link replaces it).

Waiting on the owner / real data:
- Health Connect on the phone has no sleep after 1 Oct (21–22 Oct steps only): after 2.8 the Sleep card says which app wrote what — check Health Sync → Health Connect → Sleep is on
- Real Health Sync nights already arrive (29 Sep – 1 Oct + steps seen 22 Oct); keep an eye on 22 Oct's night after the next phone sync
- Paste an AI key in Ascent → AI → Settings and ask something (only a rejected test key was tried)
- Confirm 2.2 installed, then the 48-h download link can be deleted
- ✓ Webhook adds uploads to strava_cache (23 Oct ride cached without opening the site, checked 23 Oct)
- ✓ PP6 rides look right (21–23 Oct: avg 117–146 W, NP 121–153 W, max 853 W)
- Weight: Strava profile says 78 kg, not 79 — update it on Strava if 79 is right (app reads W/kg from it)
- Stats image: keep Weather + PRs on power rides? (9-stat limit)
- L/R balance: skipped (needs FIT upload)

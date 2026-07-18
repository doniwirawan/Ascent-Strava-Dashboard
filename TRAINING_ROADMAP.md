# Training & Analytics Roadmap

Feature backlog for the new **Training** area of the dashboard, captured from the
planning session on 2026-07-18. This is the source of truth for what to build and
in what order — start at the top of "Confirmed build" and work down.

**Legend — data feasibility**
- ✅ **List data** — computable from the loaded `acts` array (activity list). No extra fetches.
- 🔶 **Streams** — needs a per-activity stream fetch (`/activities/{id}/streams`: watts, heartrate, velocity_smooth, grade_smooth, moving, time). There's already a stream cache (`clearStreamCache`). Heavier: one fetch per activity, rate-limited.
- 🌦 **External weather** — needs a historical weather API keyed on lat/lng + timestamp (wind, rain, temp). No such data in Strava. New integration required.
- 🤖 **AI-enhanced** — routes through the owner-gated `/api/ai` proxy; always ships a rule-based text fallback for non-owners / no-key.

---

## Locked decisions (this initiative)

- **Placement:** a new **"Training"** sidebar nav section holds Load, Consistency, and the FTP/profile summary. Bike usage + maintenance extends the existing **Gear** section.
- **Build order:** Training Load → Consistency → Profile/FTP card → Bike Usage + Maintenance. Iterate one block at a time; review each before the next.
- **Maintenance data:** Strava exposes **no** component data or service history. Reminders work off a **user-entered baseline** (last chain/tire/pad/wax service, km or date) stored in `localStorage`, tracked against editable thresholds. No baseline = no fabricated "due" warnings.
- **AI recovery recs:** reuse `/api/ai` (DeepSeek/etc., gated to `OWNER_ATHLETE_ID`). Non-owners get a rule-based recommendation from TSB/ramp.

---

## Confirmed build (in priority order)

### 1. Training Load & Fatigue ✅ 🤖 — **BUILT** (js/training.js, Training section)
The analytical centerpiece. A TrainingPeaks-style Performance Management Chart.

- **Daily load per activity** (unified TSS-equivalent, best signal available, in order):
  1. Power + FTP → `TSS = (moving_time_s × NP × IF) / (FTP × 3600) × 100`, where `NP = weighted_average_watts || average_watts`, `IF = NP / FTP`.
  2. Else `suffer_score` (Strava Relative Effort — already an HR-TRIMP, comparable scale).
  3. Else HR-TRIMP (Banister) from HR zones / max-HR.
  4. Else duration × default intensity fallback.
- **CTL** (Chronic Training Load, "fitness"): EWMA, 42-day time constant.
- **ATL** (Acute Training Load, "fatigue"): EWMA, 7-day time constant.
- **TSB** (Training Stress Balance, "freshness"): `TSB = CTL_yesterday − ATL_yesterday`.
- **Ramp rate:** ΔCTL over the last 7 days (TSS/week). Flag >~8/wk as ramping fast (injury risk).
- **Recovery recommendation:** rule-based text from TSB bands (fresh / neutral / productive-fatigue / high-fatigue) + ramp; upgraded to a tailored AI plan for the owner.
- Chart: CTL/ATL lines + TSB fill over time.

### 2. Consistency Score ✅
Consistency over raw mileage.
- Days ridden this month
- Longest streak (consecutive days)
- Weeks with ≥3 rides
- Missed weeks (zero-ride weeks)
- Overall consistency percentage

### 3. Profile + FTP card ✅
Promote the existing one-line `estimateFtp()` (in `js/fitness.js`) into a proper card:
FTP value, W/kg (needs athlete weight), and the basis (Strava-set / best 20-min power ×0.95 / 2.5 W/kg from weight), plus profile summary (name, since, location, KOMs/PRs/kudos).

### 4. Bike Usage + Maintenance ✅ (usage) / baseline-tracked (maintenance)
Extends the **Gear** section. Per bike (grouped by `gear_id`, named from `currentAthlete.bikes`):
- Distance, elevation, hours, avg speed. (Table like the example.)
- **Maintenance** (baseline + track): chain wear, tire replacement, brake pad, wax/lube — each with a user-set "last serviced at X km / date" and an editable threshold; warn when km-since ≥ threshold.

---

## Backlog (session brainstorm — build after the four above)

Numbered roughly as raised. Reassess priority when we get here.

- **Fitness Trend (not Distance Trend)** ✅ — track avg power & speed on **Zone-2 rides** over time (monthly buckets). Rising W / km-h at the same aerobic zone = real fitness gain.
- **Climbing Ability** ✅ (list) / 🔶 (per-climb) — VAM (m/hr), meters climbed per hour, climbing speed, climbing efficiency, average gradient ridden. Separate climbing from flat riding. Per-climb detection needs grade streams.
- **Wind Analysis** 🌦 🔶 — headwind / tailwind / crosswind %, wind-adjusted speed. Needs historical weather (wind speed+direction) joined to GPS bearing from streams. Heaviest lift — external weather API required. Reframes a "slow" ride as actually strong.
- **Segment Intelligence** 🔶 — segments closest to PR, stagnating, improving fastest, estimated next-PR probability ("4s behind PR, 82% chance"). Needs segment effort history.
- **Heart Rate Decoupling** 🔶 — aerobic decoupling: compare pace/power-to-HR between first and second half (e.g. same speed, HR drifts 140→150). Needs HR + velocity streams.
- **Ride Quality Score** ✅/🔶 — composite 0–100 from sub-scores (Endurance, Recovery, Climbing, Efficiency). More meaningful than distance.
- **Personal Records Explorer** ✅ / 🌦 (weather ones) — fastest rainy ride, longest Zone-2 ride, biggest climbing day, fastest century, highest avg cadence, highest normalized HR, coldest/hottest ride. Temp sometimes in `average_temp`; rain needs weather.
- **Time Lost Analysis** 🔶 — break a ride into stopped / climbing / descending / coasting / pedaling; "where did average speed disappear?" Needs velocity + grade + moving streams.
- **Power Curve** 🔶 — best power over 5s/30s/1min/5min/20min/60min. Needs the watts stream (power-meter rides only); rolling max per window.
- **FTP Prediction without power** ✅/🔶 — trend estimate from HR, climbing speed, historical segments, previous efforts. Not lab-accurate; shows direction.
- **"Similar Ride" Comparison** ✅ — pick rides of similar distance/elevation to today's and rank (3rd fastest, lowest HR, best climbing, etc.). Context raw averages can't give.
- **Seasonal Insights** ✅ — year-over-year answers: stronger this July vs last? climbing faster this year? best month/year ever? most consistent winter? peak-fitness month?

---

## Implementation notes

- **New section wiring:** add a sidebar `nav-link` + a section container in `index.html`, a `js/training.js` module, include the script in `index.html`, and call its render fn from `renderAll()`. Section switching uses `navScrollTo(...)` / the `.nav-link.active` pattern (see `js/utils.js`, `js/app.js`).
- **Never edit `dist/`** — regenerated by `build.js`. Edit source, then `node build.js` + `vercel --prod`.
- **AI proxy call shape** (from `js/ai-coach.js`): `POST /api/ai` with `{ token, messages, provider, model, key }`; `{ test:true }` to check config without spending tokens. Owner-gated server-side.
- **Charts:** Chart.js is already loaded and wrapped in `js/render-charts.js`; destroy instances before re-render (`charts` map).
- **Streams infra** already exists (`clearStreamCache`) — reuse it for the 🔶 features rather than adding a new fetch layer.
- **Units:** metres/`m·s⁻¹` internally; `fmtD()`/`kmh()` for display. `isRide()` for cycling types.

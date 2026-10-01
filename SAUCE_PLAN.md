# Sauce for Strava — what we can borrow

[SauceLLC/sauce4strava](https://github.com/SauceLLC/sauce4strava) is an MIT-licensed
browser extension that adds analysis panels to strava.com pages. This doc covers
two ideas taken from it:

1. **Port its maths** into the dashboard. This is the bigger win and needs no new
   platform.
2. **Build our own browser extension**, later, that brings dashboard features onto
   strava.com.

Status: **plan only — nothing built yet.**

---

## Licensing

- `sauce4strava` is **MIT** (© Justin Mayfield). We may copy and adapt it if we keep
  the copyright and permission notice. Every ported file gets a header comment that
  names the source file plus the MIT notice, or links a `licenses/sauce4strava.txt`.
- `jsfit` (FIT file parser, a dependency of sauce4strava) is also MIT (© Pierre Jacquier).
- `saucecharts` and their Chart.js fork are MIT. We already use plain Chart.js, so we
  don't need either.

Paths below are relative to the sauce4strava repo.

---

## Part 1 — Tech worth porting into the dashboard

What we already have, for comparison: power curve (`js/power-curve.js`), FTP from climbs
(`js/climb-ftp.js`, `estimateFtp()`), training load from power, then Relative Effort,
then HR-TRIMP (`js/training.js`), HR decoupling (`js/hr-decoupling.js`), wind
(`js/wind-analysis.js`) and time lost (`js/time-lost.js`).

### Tier 1 — high value, because the owner has no power meter

#### 1. Physics power estimate → `js/power-model.js`
- **Source:** `src/common/lib.js`: `cyclingPowerEstimate`, `gravityForce`,
  `rollingResistanceForce`, `aeroDragForce`, `airDensity`, and `createWattsStream`.
- **What it does:** computes watts from speed, grade, total mass, Crr, CdA, air
  density and drivetrain loss, split into gravity, rolling and aero watts.
- **Why:** Strava's estimated watts are crude. We know the real bike weights
  (BIKES.md) and the rider weight (from the FTP card), and we can pick Crr/CdA per bike:
  - Mosso: gravel tyres
  - Camp: road
  - Polygon: MTB
- **What it unlocks:** an estimated per-second watts stream for every ride. The
  existing power curve, NP, TSS and the Tier 1 items below can then run on it, not
  just on rides with `device_watts`.
- **Plan:**
  1. Build a pure function: `(velocity, altitude/grade, time streams, bikeProfile) → watts[]`.
  2. Smooth the grade before using it.
  3. Clamp negative values to 0.
  4. Store per-bike Crr/CdA defaults in a small constant table.
- **Verify:** on rides that have Strava estimated watts, our average should be in the
  same range. On a known climb, check by hand that the gravity watts ≈ m·g·v·sinθ.

#### 2. Gap-aware rolling averages
- **Source:** `lib.js`: `RollingAverage`, `RollingPower`, the `Pad` / `Zero` / `Break`
  classes, `correctedRollingAverage`, and `peakPower`.
- **Why:** `_pcBestFromStreams` currently fills gaps and stops with 0 W. Sauce marks
  pauses as breaks, so a café stop doesn't drag down a 20-min best and a GPS dropout
  doesn't split one.
- **Plan:** port only the parts that peak power, NP and pace need. Run them alongside
  the current maths on cached rides before switching over.

#### 3. NP / xPower / TSS on estimated power
- **Source:** `lib.js`: `calcNP`, `calcXP`, `calcTSS`, `peakNP`.
- **Why:** gives training load a real power-based source for rides without a meter,
  instead of falling back to Relative Effort. Label it "est." in the UI.

#### 4. Morton 3-parameter Critical Power → better eFTP + W′
- **Source:** `src/common/eftp.mjs` (`fitMorton`: P = CP + W′/(t − k), least squares
  over a sweep of k).
- **Why:** replaces the "best 20-min NP × 0.95" rule with a curve fit over the whole
  power curve, using the 5s to 60min bests we already compute. It also gives **W′**
  (anaerobic capacity), a new Profile stat.
- **Plan:** use it in the FTP card / Estimated FTP Trend, and show CP, W′ and the
  fit's error. Fall back to the current method if there are fewer than about 3 good
  durations.

### Tier 2 — new analysis cards

#### 5. W′ balance chart
- **Source:** `lib.js`: `calcWPrimeBalIntegralStatic` / `calcWPrimeBalDifferential`.
- **What:** shows how deep each effort went into the anaerobic reserve on the latest
  ride. Needs CP/W′ (#4) and a watts stream (#1).

#### 6. HR-based TSS (hrTSS) with LTHR
- **Source:** `lib.js`: `tTSS`, `calcTRIMP`, `estimateRestingHR`, `estimateMaxHR`.
- **Why:** a more standard HR load than our scaled Banister TRIMP. It uses the full HR
  stream instead of average HR. Use it as a fallback level in the training-load chain.

#### 7. Peak efforts for more than power
- **Source:** `src/bg/hist/peaks.mjs`, `lib.js`: `RollingPace`, `bestPace`,
  `createVAMStream`.
- **What:** all-time and per-period bests for HR, speed, VAM and cadence over standard
  durations, plus best pace for runs. Extends the Personal Records Explorer.

#### 8. "Time at X watts" segment predictor
- **Source:** `lib.js`: `cyclingPowerVelocitySearch`.
- **What:** solves for speed at a target power on a given grade. That turns the Local
  Legend / next-PR gap into "hold ~N W to take this segment". Pairs with
  `js/segment-intel.js`.

#### 9. Coggan power-profile rank badge
- **Source:** `lib.js`: `rankRequirements`, `rankLevel`, `rankBadge`.
- **What:** W/kg per duration mapped to Cat 5 … World Tour. A small badge on the Power
  Curve card, labelled as estimated.

### Tier 3 — nice to have

#### 10. Food equivalents for calories
- **Source:** `src/site/foods.json` (kcal + emoji per food).
- **What:** "Burned ≈ 3 🍺 + 1 🍕". This could be a story-card stat (`STAT_DEFS`) and a
  caption flavour line. Add a few local foods too (nasi goreng, es teh), plus i18n via
  `TR_ID`.

#### 11. Compact stream storage
- **Source:** `lib.js`: `toVarintArray` / `fromVarintArray`, `toZigZag`, `compress`
  (deflate-raw via `CompressionStream`), and `toBase64`.
- **Why:** lets us cache full-resolution streams in Supabase / localStorage cheaply
  instead of the 200-point downsample. That means fewer API calls and less pressure on
  the shared rate limit.

#### 12. FIT / TCX / GPX export
- **Source:** `src/common/export.mjs`, plus `jsfit`.
- **What:** an "Export" button per activity. `jsfit` could also parse FIT files for
  imports.

**Skip:** the draft model (`cyclingDraftDragReduction`), sea-level power (we ride near
sea level), `BDCC` geo maths (Leaflet already handles it), and the Zwift tooling.

### Build order

1. **#1 Physics power estimate**
   - **Verify:** estimate vs Strava estimate on 10 rides; gravity sanity check on a known climb.
2. **#2 Gap-aware peaks** feeding into the existing Power Curve
   - **Verify:** compare old and new bests side by side; stops no longer pull bests down.
3. **#3 NP/TSS (est.)** in the training-load chain
   - **Verify:** the load source label shows "est. power"; totals stay plausible.
4. **#4 Morton CP/W′** in the FTP card
   - **Verify:** CP is within about ±10% of the current eFTP; W′ is in the 10–25 kJ range.
5. Then Tier 2 as cards, then Tier 3.

Every card follows the existing patterns:

- owner-gated bulk stream fetches
- per-ride caches
- `tr()` / `trf()` + `TR_ID` for i18n
- data stays on the owner's account, never in the public repo

---

## Part 2 — Our own browser extension (later)

How Sauce works: Manifest V3 content scripts on `strava.com/*` read the data the page
already loaded and add panels into the DOM. A background service worker handles
storage and network.

### Scope v0 (personal, loaded unpacked)

- `extension/` folder:
  - `manifest.json` (MV3)
  - a content script for `strava.com/activities/*`
  - shared code reused from `js/`
- One feature: a **"Story card"** button on activity pages that opens our generator
  (`story-*.js`) for that activity.
- **Data source:** prefer our existing OAuth tokens and the official API (stable).
  Strava's internal page endpoints are undocumented and can break at any time.

### Later

- **Segment pages:** Local Legend status/gap, PR history, and the #8 watts-to-PR predictor.
- **Activity pages:** estimated power, W′ balance, peak efforts — the Part 1 maths shown
  inline, the way Sauce does it.
- **Distribution:** Chrome Web Store ($5 one-time + review). This only makes sense once
  it works for any athlete, not only the owner.

### Constraints

- The repo master pushes to a **public** remote. Nothing from `private/` may be
  bundled, and no home location may appear in the extension or any AI prompt.
- Keep the shared code framework-free so the same files run in the dashboard and the
  extension.

# Ascent — Building a Personal Strava Analytics Dashboard (and a Canvas-based Story Generator)

> A case study on designing and shipping a privacy-first, backend-less fitness analytics web app — and the engineering rabbit holes that made it fun: a 28-template share-image generator drawn entirely in Canvas, real topographic contours from elevation data, and a classic timezone bug.

**Live:** https://stravadashboard.vercel.app · **Stack:** Vanilla JS, Canvas 2D, Leaflet, Chart.js, Supabase, Vercel

---

## TL;DR

I built **Ascent**, a personal dashboard for my own Strava data. It turns ~200 activities into stat cards, trends, a heatmap, segment leaderboards, milestones, and — the centerpiece — a **9:16 "story" image generator** with 28 layout templates rendered pixel-by-pixel in the HTML Canvas API.

There's **no traditional backend**: it's a static site that talks to the Strava API straight from the browser, with Supabase as a thin cache so revisits are instant. The interesting engineering lives in the details — a scale-invariant canvas rendering system, a Figma-style drag editor with snapping and group-resize, real terrain contours computed from a Digital Elevation Model, and activity-aware UX that shows pace for runs and power for rides.

---

## Why I built it

Strava is great at recording activities and weak at letting *you* slice your own history the way you want. I wanted:

- A clean, fast overview of **all** my riding and running, not just the last few weeks.
- Shareable, good-looking activity cards that didn't all look identical.
- To own the experience end-to-end — design, code, deploy — as a portfolio piece.

Constraints I set for myself: **no server to maintain**, **no monthly bill**, **privacy-first**, and **instant** on repeat visits.

---

## What it does

A quick tour of the feature set:

- **Overview & sport modes** — headline stats with a Cyclist/Runner toggle that re-scopes every chart.
- **Trends & charts** — weekly/monthly distance, rolling speed/pace (Chart.js).
- **Heatmap** — every GPS trace overlaid on an interactive Leaflet map.
- **Segments** — starred segments with PRs, KOM/QOM status, and VAM, each with a zoomable map.
- **Eddington number, milestones, calendar streaks, monthly breakdowns, gear totals, year-in-review "Rewind", trophies, photo gallery.**
- **Activity detail** — click any activity for a full metric card with a route map.
- **Share Story** — generate a 9:16 image of any activity in one of 28 templates, with themes, a custom background photo, and selectable stats. A free-placement "Custom" mode lets you drag, snap, group-select, and resize every element.

---

## Architecture: a backend-less SPA

```
Browser (static SPA)
  ├── Strava OAuth  ── token exchange ──►  Strava API  (your activities, segments, streams)
  ├── Supabase (Postgres)  ◄── cache per athlete-id ──►  fast repeat loads
  ├── Open-Meteo Elevation API  ──►  real terrain contours for the Topo template
  └── Leaflet tiles (CARTO/OSM)  ──►  maps & heatmap
Hosted as a static build on Vercel.
```

The whole app is **static HTML/CSS/JS**. There's no application server: the browser authenticates with Strava via OAuth and calls the Strava API directly. To avoid re-fetching ~200 activities on every visit (and to respect Strava's rate limits), results are cached in two layers:

1. **`localStorage`** — tokens, preferences, and a copy of recent activities (works offline).
2. **Supabase** — a per-athlete cache row keyed to the Strava athlete ID, so a new device/browser is fast too.

A tiny `build.js` step injects environment secrets and **cache-busts** the JS/CSS URLs on every deploy (so users always get the latest code), then Vercel serves the `dist/` folder.

### Why vanilla JS (no framework)?

The app is ~6,000 lines of JS and ~3,400 lines of CSS, organized into focused modules (`render-overview`, `render-charts`, `render-sections`, `auth`, `utils`, and the `story-*` set). I deliberately skipped React/Vue:

- The UI is mostly **data → DOM** rendering and **Canvas drawing**, where a framework adds ceremony without much payoff.
- Zero build toolchain means **near-instant deploys** and nothing to keep up to date.
- It forced clean separation of concerns the old-fashioned way — small files, shared helpers, explicit globals.

External libraries are limited to **Chart.js** (charts) and **Leaflet** (maps). Everything else is hand-rolled.

---

## Engineering deep-dives

The parts I'm proud of — the ones that turned a CRUD-y dashboard into an interesting build.

### 1. A 28-template share-image generator, drawn in Canvas

Each "story" is a **1080×1920 PNG** composited entirely with the Canvas 2D API — no DOM-to-image hacks. A single `drawLayout(canvas, activity, stats, scheme, layout)` function dispatches to one of 28 template cases (Strava-style card, minimal, cinema, neon, topographic, poster, badge, and more).

The trick that keeps it maintainable is a **scale factor**:

```js
const S = W / 1080; // every pixel value is multiplied by S
```

Because every coordinate, font size, and stroke width is expressed in terms of `S`, the *same* drawing code renders crisply at full 1080px **and** at 216px for the live template thumbnails. One code path, two resolutions.

Color themes are data: a `SCHEMES` map defines card/text/accent colors, including a fully **transparent** theme for overlaying on Instagram backgrounds. Templates respect flags like `hideTitle`/`hideRoute`/`hideLogo` and a `skipBg` flag so an uploaded background photo shows through.

### 2. A Figma-style canvas editor

The "Custom" template turns the preview canvas into a mini design tool:

- **Drag to move** any element, with **alignment & equal-spacing snapping** (marching toward canvas center/edges and neighboring elements, with pink guide lines — Figma style).
- **Marquee + Shift-click** to multi-select.
- **Group resize**: selecting multiple elements draws a bounding box with corner handles; dragging a corner scales every element's size *and* its position relative to the group center, so the whole group scales as a unit.
- Right-click context menu, copy/paste size, wheel-to-resize, flip, and per-element reset.

All of it is hit-tested against lightweight rectangles the renderer publishes each frame, so the interaction layer stays decoupled from the drawing layer.

### 3. Real topography from a Digital Elevation Model

The original "Topo" template drew *fake* contour lines from random noise. That bugged me — it should be the **actual terrain** you rode.

So now, for the route's bounding box, the app samples a **16×16 grid of real elevations** from the free **Open-Meteo Elevation API** (Copernicus DEM), then runs a **marching-squares** algorithm to trace genuine contour lines. The route is re-projected with the *same* lat/lng→canvas mapping (with a `cos(latitude)` correction so it isn't distorted), so it sits correctly on its own contours.

Two details made it production-safe:
- The elevation fetch returns **JSON**, not image tiles, so the canvas never gets "tainted" and PNG export keeps working.
- It's **cached per activity** and falls back to the synthetic field while loading or if the API is unavailable.

A real ride through Bali's Batur caldera now renders ~358 m of true relief instead of decorative squiggles.

### 4. Activity-aware UX

Cyclists and runners care about different numbers. The dashboard adapts:

- **Runs** surface **pace** (min/km, unit-aware) and **cadence in spm**.
- **Rides** surface **speed** and **power**, and **hide pace entirely** — it's filtered out of both the stat picker and the rendered card, even if an old saved selection included it.
- Cadence is relabeled (`rpm` vs `spm`, doubling the value for runs) based on `activity.type`.

Small touches, but they make the tool feel like it understands the sport.

### 5. The bug that taught the timezone lesson (again)

An "Afternoon Ride" was displaying **00:35**. Classic.

Strava returns `start_date_local` as the activity's *local* wall-clock time — but encoded with a trailing `Z` (the UTC marker). So `new Date(localString).toLocaleTimeString()` happily treated 16:35 as UTC and **re-converted it into the viewer's timezone** (UTC+8), landing on 00:35 the next day.

The fix is to format that value **in UTC** so the already-local time renders as-is:

```js
new Date(a.start_date_local)
  .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
```

A one-line fix after the right diagnosis — and a reminder that "local time with a Z" is a trap.

---

## Privacy-first by design

Because the app handles personal location and health-adjacent data, privacy was a first-class requirement, not an afterthought:

- It only ever accesses **your own** Strava data, after **your** OAuth consent.
- Computation happens **in your browser**; the Supabase layer is a cache, not a data warehouse.
- **No selling, sharing, or ad profiling.** The only write scope (`activity:write`) is used solely when you explicitly reassign gear.
- One-click **Disconnect** clears tokens and cache, and access can be revoked anytime from Strava → My Apps.
- A full **Privacy Policy**, **Terms**, and an in-app **Data & Privacy FAQ** spell all of this out.

---

## Challenges & lessons learned

- **Canvas is a great equalizer.** Drawing share images by hand (vs. screenshotting DOM) gave pixel-perfect, dependency-free output that exports cleanly — but every layout is "just math," so a shared scale factor and helper functions are essential to stay sane across 28 templates.
- **Caching is a UX feature.** The two-tier cache (localStorage + Supabase) is the difference between a 5-second load and an instant one, and it keeps me well under Strava's rate limits.
- **Adapt to the domain.** Hiding pace on rides and showing power instead is trivial code, but it's the kind of detail that makes a tool feel considered.
- **Trust real data over clever fakes.** Swapping synthetic contours for a real DEM made the Topo template meaningful instead of decorative.
- **Timezones will always get you once.** Now I assume any "local" timestamp is a lie until proven otherwise.
- **Responsive details matter.** Getting the share modal right meant a fixed header + pinned preview with a scrolling options column on desktop, collapsing to a single column on mobile — and chasing down a `grid` blowout where `1fr` tracks wouldn't shrink below their content (fixed with `minmax(0, 1fr)`).

---

## What's next

- More templates and a shareable link for stories.
- Optional server-side token exchange to harden the OAuth flow.
- Smarter insights (training load, fitness/freshness trends).

---

## Takeaway

Ascent is proof that you can ship a polished, genuinely useful product **without a backend, a framework, or a build pipeline** — and that the most rewarding parts are usually the small, specific problems: making a number render at two resolutions, putting a route on its real mountain, or chasing a ride that insisted it happened at half past midnight.

*Ascent is an independent project and is not affiliated with, endorsed by, or sponsored by Strava, Inc.*

---

### Appendix: short version for a LinkedIn post

> I built **Ascent** — a personal Strava analytics dashboard with no backend. It's a static site that talks to the Strava API from the browser, caches in Supabase for instant loads, and deploys on Vercel.
>
> The fun part: a **share-image generator** that draws 28 different 9:16 templates entirely in the HTML Canvas — including a "Topo" card that pulls **real elevation data** and traces the actual terrain contours you rode, with your route projected on top.
>
> Other highlights: a Figma-style drag editor (snapping + group resize) for custom layouts, activity-aware stats (pace/cadence for runs, power for rides), a two-tier cache, and a privacy-first design (everything computed in your browser, one-click disconnect).
>
> Built with vanilla JS, Canvas 2D, Leaflet, and Chart.js — ~9k lines, zero framework.
>
> 🔗 Live demo + write-up in comments. #webdev #javascript #dataviz #strava #frontend

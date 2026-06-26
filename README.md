<p align="center">
  <img src="images/non_transparent.png" alt="Ascent logo" width="120">
</p>

<h1 align="center">Ascent — Strava Dashboard</h1>

<p align="center"><a href="README.md">🇬🇧 English</a> · <a href="README.id.md">🇮🇩 Bahasa Indonesia</a></p>

A personal Strava activity dashboard with an Instagram/TikTok-style story card generator. Built as a static single-page app — no framework, no backend.

**Live demo:** https://ascent-analytics.vercel.app/

![Overview](images/screenshots/overview.png)

---

## Screenshots

> All screenshots use the built-in **demo mode** (sample data — no real account).

| Trends | Heatmap |
|---|---|
| ![Trends](images/screenshots/trendsSection.png) | ![Heatmap](images/screenshots/heatSection.png) |

| Calendar | Eddington number |
|---|---|
| ![Calendar](images/screenshots/calSection.png) | ![Eddington](images/screenshots/eddington.png) |

| Activity detail | Story card generator |
|---|---|
| ![Activity detail](images/screenshots/activity-detail.png) | ![Story generator](images/screenshots/story-popup.png) |

**Story card layouts:**

| Strava | Pace | Map |
|---|---|---|
| ![Strava layout](images/screenshots/story-strava.png) | ![Pace layout](images/screenshots/story-pace.png) | ![Map layout](images/screenshots/story.png) |

---

## Features

- Connect your Strava account via OAuth
- **AI Coach** — chat with an AI that analyses your training history for trends, advice and activity captions; pick your own provider (key saved on your device only)
- **Route Builder** — generate a brand-new road loop of your chosen distance (sport, start area, elevation preference) and download it as a GPX; powered by OpenRouteService, with optional AI naming
- View stats: total distance, elevation, moving time, speed, heart rate (with training-zone labels), and more
- Heart-rate zones from your Strava profile (or estimated from your max HR), plus FTP estimation when Strava has no power data
- Activity list, bubble chart, Eddington number, weekly/monthly charts, calendar heatmap
- **Story card generator** — export your activity as a 1080×1920 PNG
  - 13+ layouts: Strip, Grid, Hero, Map, Minimal, Split, Stacked, Cinema, Neon, Sport, Gradient, Badge, Tiles, Ink, Neon 6
  - Transparent background support — paste directly over any photo
  - Custom color schemes + BG/accent/text color picker
  - Hide title / hide date toggles
  - Calories, power, cadence, heart rate, elevation and more as selectable stats
- Activity caching in your own browser — reduces Strava API calls (see [Data & Privacy](#data--privacy))
- PWA — installable on mobile as a home screen app
- Demo mode — works without a Strava account

---

## Data & Privacy

> 🇬🇧 English · [🇮🇩 Bahasa Indonesia](README.id.md#data--privasi)

**This app does not collect, store, or send your data to any server we control.**
There is no analytics, no tracking pixels, and no third-party advertising. The
whole app runs client-side in your browser.

### What data is involved

When you connect Strava, you authorise the app with these OAuth scopes:

| Scope | Why it's requested |
|---|---|
| `read` | Basic public profile info |
| `activity:read_all` | Read all your activities (incl. private) to build the dashboard |
| `profile:read_all` | Read your full profile (name, avatar, stats) |
| `activity:write` | Optional — lets you push a generated story image / update an activity |

Using those scopes, your **browser** fetches from the Strava API:
- your athlete profile (name, photo, follower/following counts),
- your activities (distance, time, speed, heart rate, power, GPS map polyline, etc.),
- aggregate stats, segments/KOMs, and gear.

All of this is requested **directly by your browser from Strava** — it never
passes through a server of ours.

### How the connection works

1. You click **Connect with Strava** and sign in **on Strava's own site** — the
   app never sees your Strava password.
2. Strava redirects back with a one-time `code`.
3. Your browser sends that `code` to `api/strava-token.js`, a tiny stateless
   serverless function. It adds the confidential Strava **client secret** (kept
   server-side, never shipped to the browser), exchanges the code with Strava,
   and returns the tokens. **It stores nothing** — it just relays the request.
4. The returned access/refresh tokens are saved **only in your browser's
   `localStorage`** and are auto-refreshed when they expire.

### Where data is stored

- **Activities cache** — your browser's `localStorage`, keyed per athlete, with a
  6-hour TTL, so the app doesn't re-fetch on every visit.
- **Login tokens** — your browser's `localStorage`.
- **App shell (offline)** — a service worker (`sw.js`) caches HTML/CSS/JS so the
  PWA works offline. It does **not** cache your Strava data.
- **No remote database.** The code includes an *optional* Supabase remote cache
  for cross-device syncing, but it is **disabled by default**
  (`_haveRemote = false` in `js/config.js`). As shipped, no copy of your
  activities is kept on any server — "everything runs in your browser" is
  literally true. If you re-enable it (see the Supabase step below), your
  activities would be stored in *your own* Supabase project, not ours.

### Deleting your data

- Click **Disconnect** in the app to clear your tokens and cached activities, or
- clear your browser's site data / `localStorage`, and
- revoke the app at <https://www.strava.com/settings/apps> any time.

*Independent project — not affiliated with or endorsed by Strava, Inc.*

---

## Getting Started

### 1. Create a Strava API app

1. Go to https://www.strava.com/settings/api
2. Create an application
3. Set **Authorization Callback Domain** to `localhost` for local dev (change to your domain for production)
4. Note your **Client ID** and **Client Secret**

### 2. Set up Supabase (optional — disabled by default)

> **Note:** the remote Supabase cache is **off** in this codebase
> (`_haveRemote = false` in `js/config.js`). The app works fully without it
> using the browser-local cache. Only follow this step if you want cross-device
> syncing — then set `_haveRemote` back to the env check to enable it.

1. Create a free project at https://supabase.com
2. Run this SQL in the Supabase SQL editor:

```sql
-- One row per athlete; `id` is the Strava athlete id (multi-user)
CREATE TABLE IF NOT EXISTS strava_cache (
  id          BIGINT PRIMARY KEY,
  activities  JSONB NOT NULL,
  synced_at   TIMESTAMPTZ DEFAULT NOW()
);
```

> **Privacy note:** the browser uses the public **anon key**, so by default any
> visitor could read any row. Each athlete's data is keyed by their Strava id,
> but to truly isolate users you should enable Row Level Security on
> `strava_cache`. Without a backend, full per-user isolation isn't possible from
> the anon key alone — the localStorage cache keeps each browser's data local
> regardless.

3. Note your **Project URL** and **anon/public key**

### 3. Local development

```bash
git clone https://github.com/doniwirawan/Ascent-Strava-Dashboard.git
cd Ascent-Strava-Dashboard

# Install dependencies
npm install

# Copy env file and fill in your values
cp .env.example .env.local

# Build (injects credentials into dist/)
node build.js

# Serve dist/ with any static server, e.g.:
npx serve dist
```

Open http://localhost:3000 and click **Connect with Strava**.

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/doniwirawan/Ascent-Strava-Dashboard)

1. Fork or clone this repo and import it in the [Vercel dashboard](https://vercel.com/new)
2. Add environment variables in **Project Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `STRAVA_CLIENT_ID` | From https://www.strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | From https://www.strava.com/settings/api |
| `SUPABASE_URL` | Your Supabase project URL *(optional)* |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key *(optional)* |
| `ORS_API_KEY` | [OpenRouteService](https://openrouteservice.org) key for the Route Builder *(optional, free tier)* |
| `OWNER_ATHLETE_ID` | Your Strava athlete id — gates the AI/Route proxies to you *(optional, recommended)* |

3. Update your Strava app's **Authorization Callback Domain** to your Vercel domain (e.g. `yourdomain.vercel.app`)
4. Vercel will automatically run `npm install && node build.js` on each deploy

---

## Project Structure

```
Ascent-Strava-Dashboard/
├── index.html       # Main app — all JS is inline
├── callback.html    # OAuth callback page
├── build.js         # Injects env vars into dist/ at build time
├── manifest.json    # PWA manifest
├── sw.js            # Service worker (offline cache)
├── icon.png         # App icon
├── vercel.json      # Vercel config
├── package.json
├── .env.example     # Copy to .env.local and fill in values
└── dist/            # Build output (generated, not committed)
```

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript (no framework)
- [Chart.js](https://www.chartjs.org/) — charts
- [Supabase JS](https://supabase.com/docs/reference/javascript) — optional caching
- [Strava API](https://developers.strava.com/docs/reference/) — activity data
- [Vercel](https://vercel.com) — hosting + build pipeline

---

## License

**Personal, non-commercial use only.** You're welcome to clone this repo and run
your own copy for your own personal use, and to learn from or modify the code.

You may **not**:

- sell it, or use it (in whole or in part) in any commercial or paid product or service;
- run it as a hosted/production service offered to others;
- use it to build or operate anything that competes with the Ascent dashboard
  (https://ascent-analytics.vercel.app/).

See [LICENSE](LICENSE) for the full terms. Not affiliated with Strava, Inc.

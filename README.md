# Ascent — Strava Dashboard

A personal Strava activity dashboard with an Instagram/TikTok-style story card generator. Built as a static single-page app — no framework, no backend.

**Live demo:** https://donistravadashboard.vercel.app

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
- View stats: total distance, elevation, moving time, speed, heart rate, and more
- Activity list, bubble chart, Eddington number, weekly/monthly charts, calendar heatmap
- **Story card generator** — export your activity as a 1080×1920 PNG
  - 13+ layouts: Strip, Grid, Hero, Map, Minimal, Split, Stacked, Cinema, Neon, Sport, Gradient, Badge, Tiles, Ink, Neon 6
  - Transparent background support — paste directly over any photo
  - Custom color schemes + BG/accent/text color picker
  - Hide title / hide date toggles
  - Calories, power, cadence, heart rate, elevation and more as selectable stats
- Activity caching via Supabase (optional) — reduces Strava API calls
- PWA — installable on mobile as a home screen app
- Demo mode — works without a Strava account

---

## Getting Started

### 1. Create a Strava API app

1. Go to https://www.strava.com/settings/api
2. Create an application
3. Set **Authorization Callback Domain** to `localhost` for local dev (change to your domain for production)
4. Note your **Client ID** and **Client Secret**

### 2. Set up Supabase (optional — for caching)

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
├── icon.svg         # App icon
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

MIT

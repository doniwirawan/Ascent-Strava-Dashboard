# Official Strava brand assets

Strava's brand guidelines **forbid recreating their logos** ("Never modify,
alter or animate Strava logos"). To be fully brand-compliant you must use
Strava's official files, not a homemade version.

The app references one file from this folder:

```
images/strava/powered-by-strava-orange.svg
```

Until that file exists, the landing page and dashboard fall back to a
brand-coloured text badge ("Powered by **Strava**") so nothing looks broken —
but that fallback is **not** brand-compliant for submission.

## How to add the official logo (2 minutes)

1. Download the official logo pack:
   https://developers.strava.com/downloads/1.2-Strava-API-Logos.zip
2. Unzip it and pick the **horizontal "Powered by Strava"** logo in **orange**
   (it sits well on this app's dark UI). The white version works too if you
   ever switch to a light background.
3. Save/rename it to exactly:
   `images/strava/powered-by-strava-orange.svg`
4. Run `node build.js` and redeploy. The official logo now shows everywhere
   the badge appears (landing hero, landing footer, dashboard footer) and the
   text fallback disappears automatically.

## Optional: official "Connect with Strava" button

The hero/CTA "Connect with Strava" buttons are currently a styled
approximation. For strict compliance, download the official buttons:
https://developers.strava.com/downloads/1.1-Connect-with-Strava-Buttons.zip
and swap them in. (Not wired up yet — ask if you want this done.)

## Compliance checklist (per Strava's guidelines)

- [x] "Powered by Strava" logo on every view showing Strava data
      (landing + dashboard) — wired up; drop in the official file above.
- [x] "View on Strava" / "Open on Strava" links on activities & segments.
- [x] Disclaimer of non-affiliation with Strava, Inc.
- [ ] Replace the text fallback with the official logo SVG (this folder).
- [ ] (Optional) Official "Connect with Strava" button image.

Reference: https://developers.strava.com/guidelines/

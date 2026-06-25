# Official Strava brand assets

Strava's brand guidelines **forbid recreating their logos** ("Never modify,
alter or animate Strava logos"). To be fully brand-compliant you must use
Strava's official files, not a homemade version.

The app references two files from this folder:

```
images/strava/powered-by-strava-orange.svg   ← IN PLACE (official horiz orange)
images/strava/connect-with-strava-orange.svg ← not added yet (see below)
```

If either file is missing, the app falls back to a brand-coloured text badge /
styled button so nothing looks broken — but those fallbacks are **not**
brand-compliant for submission. The "Powered by Strava" logo above is the
official file copied from `1.2-Strava-API-Logos`, so it is compliant.

The logo source is the official pack:
https://developers.strava.com/downloads/1.2-Strava-API-Logos.zip
(`Powered by Strava/pwrdBy_strava_orange/api_logo_pwrdBy_strava_horiz_orange.svg`).
To switch to the white version on a darker background, copy
`api_logo_pwrdBy_strava_horiz_white.svg` over `powered-by-strava-orange.svg`.

## Official "Connect with Strava" button (last step)

The hero/CTA "Connect with Strava" buttons are wired the same drop-in way but
their official file isn't added yet, so they show the styled fallback. To make
them compliant:

1. Download → https://developers.strava.com/downloads/1.1-Connect-with-Strava-Buttons.zip
2. Pick the **orange** "Connect with Strava" button SVG.
3. Save it as exactly:
   `images/strava/connect-with-strava-orange.svg`
4. Run `node build.js` and redeploy. The official button replaces the fallback
   automatically (its own chrome is dropped — the image *is* the button).

## Compliance checklist (per Strava's guidelines)

- [x] "Powered by Strava" logo on every view showing Strava data
      (landing hero + landing footer + dashboard footer).
- [x] "View on Strava" links on activities & segments.
- [x] Disclaimer of non-affiliation with Strava, Inc.
- [x] Official "Powered by Strava" logo SVG in place (this folder).
- [ ] Official "Connect with Strava" button image (see above).

Reference: https://developers.strava.com/guidelines/

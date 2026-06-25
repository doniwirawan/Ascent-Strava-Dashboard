# Official Strava brand assets

Strava's brand guidelines **forbid recreating their logos** ("Never modify,
alter or animate Strava logos"). To be fully brand-compliant you must use
Strava's official files, not a homemade version.

The app references two files from this folder:

```
images/strava/powered-by-strava-orange.svg   ← IN PLACE (official horiz orange)
images/strava/connect-with-strava-orange.svg ← IN PLACE (official orange button)
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

## Official "Connect with Strava" button

The hero/CTA "Connect with Strava" buttons use the official orange button
(`btn_strava_connect_with_orange.svg`, 237×48) from Strava's 1.1 buttons pack:
https://developers.strava.com/downloads/1.1-Connect-with-Strava-Buttons.zip
When the image loads, the wrapper's own chrome is dropped (the image *is* the
button). To use the white version on a darker background, copy
`btn_strava_connect_with_white.svg` over `connect-with-strava-orange.svg`.

## Compliance checklist (per Strava's guidelines)

- [x] "Powered by Strava" logo on every view showing Strava data
      (landing hero + landing footer + dashboard footer).
- [x] "View on Strava" links on activities & segments.
- [x] Disclaimer of non-affiliation with Strava, Inc.
- [x] Official "Powered by Strava" logo SVG in place (this folder).
- [x] Official "Connect with Strava" button image in place (this folder).

Reference: https://developers.strava.com/guidelines/

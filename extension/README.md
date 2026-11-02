# Ascent for Strava (browser extension, v0)

Adds a **Story card** button to `strava.com/activities/*` pages. It opens
[Ascent](https://ascent-analytics.doniwirawan.xyz/) at `?story=<activity id>`, which
opens the story card generator with that activity picked.

The button is only a link. The dashboard reads the activity with your own Ascent Strava
login, so the extension reads nothing from Strava's pages and asks for no permissions.
It works for activities among your 50 latest (the story picker's range).

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension/` folder.
3. Open one of your Strava activities: the orange button is in the bottom-right corner.

Plan for later versions: [SAUCE_PLAN.md](../SAUCE_PLAN.md) Part 2.

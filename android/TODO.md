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

Waiting on the owner / real data:
- Turn on JoyoFit → Settings → Health & cloud → Write to Health Connect, then Ascent → Sleep → Allow access (first real nights)
- Paste an AI key in Ascent → AI → Settings and ask something (only a rejected test key was tried)
- Confirm 2.2 installed, then the 48-h download link can be deleted
- Next Strava upload: check the webhook adds it to strava_cache (app shows it without opening the site)
- First PP6 rides: check the power numbers look right
- Weight 79 kg on the Strava profile (app reads W/kg from it)
- Stats image: keep Weather + PRs on power rides? (9-stat limit)
- L/R balance: skipped (needs FIT upload)

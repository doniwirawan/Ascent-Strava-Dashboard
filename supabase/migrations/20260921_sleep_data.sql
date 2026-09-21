-- Store the parsed Huawei Health sleep export server-side so a re-upload from
-- the dashboard reaches the phone and the public deploy, not just the browser
-- that did the parse. One row per athlete; `data` is the same {cols,rows,...}
-- object api/sleep.js used to serve from the bundled private/sleep.json file.
CREATE TABLE IF NOT EXISTS sleep_data (
  id         text PRIMARY KEY,          -- Strava athlete id (the owner)
  data       jsonb NOT NULL,            -- {source, tz, note, cols, rows}
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- Same lockdown as strava_cache: only the service role (used by
-- api/sleep-upload.js and api/sleep.js) may touch it. Personal health data, so
-- the public anon key must never reach it.
ALTER TABLE sleep_data ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sleep_data FROM anon, authenticated;

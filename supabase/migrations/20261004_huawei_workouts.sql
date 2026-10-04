-- Workouts from the Huawei Health export ("Motion path detail data"), so the
-- ones that never reached Strava (a hike on Ijen, badminton, indoor walks)
-- are kept server-side next to sleep_data. One row per Huawei record;
-- re-loading an export upserts on record_id.
CREATE TABLE IF NOT EXISTS huawei_workouts (
  record_id    text PRIMARY KEY,         -- Huawei recordId
  athlete_id   text NOT NULL,            -- Strava athlete id (the owner)
  sport_type   int  NOT NULL,            -- Huawei sportType code (260 = mountain climbing, 262 = pool swim, ...)
  sport        text NOT NULL,            -- readable name for sport_type
  start_time   timestamptz NOT NULL,
  end_time     timestamptz NOT NULL,
  tz           text,                     -- e.g. +0800
  duration_s   int,                      -- moving time from the summary
  distance_m   numeric,
  climb_m      numeric,                  -- creepingWave / 10
  min_alt_m    numeric,
  max_alt_m    numeric,
  avg_hr       int,
  max_hr       int,
  calories     numeric,                  -- kcal
  steps        int,
  polyline     text,                     -- simplified GPS track, Google polyline (precision 5); null without GPS
  track        jsonb,                    -- {cols:[t,lat,lng,alt,hr], rows}: GPS every ~2 s, or HR-only (lat/lng null) without GPS
  hr_samples   int,                      -- rows in track with an HR value
  start_latlng numeric[],                -- [lat, lng]
  strava_id    text,                     -- matching Strava activity, null if it never reached Strava
  strava_kind  text,                     -- 'match' (synced by Huawei), 'file' (uploaded GPX/TCX), 'manual' (no HR on Strava)
  summary      jsonb,                    -- the raw summaryData, for anything not lifted into columns
  synced_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS huawei_workouts_start ON huawei_workouts (athlete_id, start_time);

-- Personal health data: service role only, same as sleep_data.
ALTER TABLE huawei_workouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE huawei_workouts FROM anon, authenticated;

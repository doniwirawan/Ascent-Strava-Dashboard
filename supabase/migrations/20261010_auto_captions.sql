-- Which bike each webhook auto-caption was written for, so changing the bike
-- re-captions the activity (api/strava-webhook.js).
CREATE TABLE IF NOT EXISTS auto_captions (
  activity_id text PRIMARY KEY,
  gear_id     text,
  name        text NOT NULL,            -- the title we set; a manual rename stops re-captioning
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auto_captions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE auto_captions FROM anon, authenticated;

-- AI output per activity (performance analysis + last AI caption), so it's there
-- whenever the activity is reopened — on any device, and after a Strava refresh
-- replaces the cached activity list. Written by the dashboard (api/activity-ai.js)
-- and by the auto-caption webhook (api/strava-webhook.js).
CREATE TABLE IF NOT EXISTS activity_ai (
  activity_id   text PRIMARY KEY,
  analysis      text,
  caption_title text,
  caption_desc  text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_ai ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE activity_ai FROM anon, authenticated;

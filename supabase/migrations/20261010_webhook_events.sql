-- Log of the owner's Strava webhook events and what the auto-caption did with each
-- (api/strava-webhook.js), shown in Settings → Auto-caption webhook.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  aspect      text,                     -- create | update
  activity_id text,
  result      text                      -- 'processing…' until done; a row stuck there = timed out
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE webhook_events FROM anon, authenticated;

-- The owner's latest Strava refresh token, so api/strava-webhook.js can caption new
-- activities (api/_owner-token.js). Written on every owner login/refresh.
CREATE TABLE IF NOT EXISTS owner_tokens (
  id            text PRIMARY KEY,          -- 'strava'
  refresh_token text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A credential: service role only.
ALTER TABLE owner_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE owner_tokens FROM anon, authenticated;

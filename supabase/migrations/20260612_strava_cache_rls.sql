-- Lock down strava_cache: only the service role (used by the strava-cache
-- Edge Function) may read or write. With RLS enabled and no policies for the
-- anon role, direct access with the public anon key is denied entirely.
ALTER TABLE strava_cache ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: revoke table privileges from the public API roles so
-- the table is unreachable except through the Edge Function (service role).
REVOKE ALL ON TABLE strava_cache FROM anon, authenticated;

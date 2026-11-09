-- Training plan from the Plan section (js/plan.js): the season plan and the
-- planned workouts, synced across the owner's devices via api/ai-chats.js.
-- One JSON blob per athlete; the browser keeps a copy and the newer ts wins.
CREATE TABLE IF NOT EXISTS training_plan (
  athlete_id  text PRIMARY KEY,          -- Strava athlete id (the owner)
  data        jsonb NOT NULL,            -- { ts, event: {...}, workouts: [...] }
  ts          bigint NOT NULL,           -- last edit (ms)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Personal training data: service role only.
ALTER TABLE training_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE training_plan FROM anon, authenticated;

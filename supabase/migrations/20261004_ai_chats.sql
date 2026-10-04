-- AI Coach conversation history, synced across the owner's devices
-- (api/ai-chats.js). One row per conversation; the browser keeps a copy too.
CREATE TABLE IF NOT EXISTS ai_chats (
  athlete_id  text NOT NULL,             -- Strava athlete id (the owner)
  id          text NOT NULL,             -- conversation id from the browser
  title       text,
  ts          bigint NOT NULL,           -- last message time (ms), newer copy wins on merge
  messages    jsonb NOT NULL,            -- [{role: 'user'|'assistant', content}]
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, id)
);

-- Conversations about personal training/health data: service role only.
ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ai_chats FROM anon, authenticated;

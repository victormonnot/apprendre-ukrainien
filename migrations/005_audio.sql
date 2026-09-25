CREATE TABLE audio_clips (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  cache_key TEXT NOT NULL CHECK (length(cache_key) = 64),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
  voice_id TEXT NOT NULL CHECK (voice_id IN ('macos-lesya', 'openai-marin', 'openai-cedar')),
  voice_label TEXT NOT NULL CHECK (length(voice_label) BETWEEN 1 AND 200),
  provider TEXT NOT NULL CHECK (provider IN ('macos', 'openai')),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  instructions_version INTEGER NOT NULL CHECK (instructions_version >= 1),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('audio/wav', 'audio/mpeg')),
  bytes BLOB NOT NULL CHECK (length(bytes) BETWEEN 1 AND 8388608),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, cache_key),
  CHECK ((provider = 'macos' AND voice_id = 'macos-lesya') OR
    (provider = 'openai' AND voice_id IN ('openai-marin', 'openai-cedar')))
) STRICT;

CREATE TRIGGER audio_clips_no_update BEFORE UPDATE ON audio_clips
BEGIN
  SELECT RAISE(ABORT, 'Audio clips are immutable');
END;

CREATE TRIGGER audio_clips_no_delete BEFORE DELETE ON audio_clips
BEGIN
  SELECT RAISE(ABORT, 'Audio clips cannot be deleted');
END;

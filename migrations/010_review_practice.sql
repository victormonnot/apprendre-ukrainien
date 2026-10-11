ALTER TABLE review_attempts ADD COLUMN mode TEXT NOT NULL DEFAULT 'scheduled'
  CHECK (mode IN ('scheduled', 'practice'));

CREATE TRIGGER review_attempts_mode_no_update BEFORE UPDATE ON review_attempts
WHEN OLD.mode <> NEW.mode
BEGIN
  SELECT RAISE(ABORT, 'Review attempt mode is immutable');
END;

CREATE TABLE review_settings (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles (id),
  daily_new_limit INTEGER CHECK (daily_new_limit IS NULL OR daily_new_limit IN (5, 10, 20, 50)),
  practice_position INTEGER NOT NULL DEFAULT 0 CHECK (practice_position >= 0),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE review_practice_cards (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  next_position INTEGER NOT NULL CHECK (next_position >= 0),
  last_position INTEGER NOT NULL CHECK (last_position >= 1),
  success_streak INTEGER NOT NULL CHECK (success_streak >= 0),
  last_rating TEXT NOT NULL CHECK (last_rating IN ('again', 'hard', 'good', 'easy')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id),
  FOREIGN KEY (user_id, card_id) REFERENCES review_cards (user_id, card_id)
) STRICT;

CREATE TABLE exercise_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  exercise_id TEXT NOT NULL CHECK (length(exercise_id) BETWEEN 1 AND 80),
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  definition TEXT NOT NULL CHECK (json_valid(definition) AND json_type(definition) = 'object'),
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  retry_of TEXT,
  answers TEXT NOT NULL CHECK (json_valid(answers) AND json_type(answers) = 'object'),
  work_note TEXT NOT NULL CHECK (length(work_note) <= 2000),
  assessment TEXT CHECK (assessment IS NULL OR (json_valid(assessment) AND json_type(assessment) = 'object')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  UNIQUE (id, user_id, exercise_id),
  UNIQUE (user_id, exercise_id, attempt_number),
  FOREIGN KEY (retry_of, user_id, exercise_id) REFERENCES exercise_attempts (id, user_id, exercise_id),
  CHECK (retry_of IS NULL OR retry_of <> id),
  CHECK (
    (status = 'draft' AND submitted_at IS NULL AND assessment IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND assessment IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX exercise_attempts_one_draft
  ON exercise_attempts (user_id, exercise_id) WHERE status = 'draft';

CREATE INDEX exercise_attempts_history
  ON exercise_attempts (user_id, exercise_id, attempt_number DESC);

CREATE TRIGGER exercise_attempts_retry_parent BEFORE INSERT ON exercise_attempts
WHEN NEW.retry_of IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'A retry requires an earlier submitted attempt')
  WHERE NOT EXISTS (
    SELECT 1 FROM exercise_attempts
    WHERE id = NEW.retry_of AND user_id = NEW.user_id AND exercise_id = NEW.exercise_id
      AND status = 'submitted' AND attempt_number < NEW.attempt_number
  );
END;

CREATE TRIGGER exercise_attempts_identity_no_update BEFORE UPDATE ON exercise_attempts
WHEN OLD.id <> NEW.id OR OLD.user_id <> NEW.user_id OR OLD.exercise_id <> NEW.exercise_id
  OR OLD.definition_version <> NEW.definition_version OR OLD.definition <> NEW.definition
  OR OLD.attempt_number <> NEW.attempt_number
  OR OLD.retry_of IS NOT NEW.retry_of OR OLD.created_at <> NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'Attempt identity is immutable');
END;

CREATE TRIGGER exercise_attempts_submitted_no_update BEFORE UPDATE ON exercise_attempts
WHEN OLD.status = 'submitted'
BEGIN
  SELECT RAISE(ABORT, 'Submitted attempts are immutable');
END;

CREATE TRIGGER exercise_attempts_submitted_no_delete BEFORE DELETE ON exercise_attempts
WHEN OLD.status = 'submitted'
BEGIN
  SELECT RAISE(ABORT, 'Submitted attempts are immutable');
END;

CREATE TABLE exercise_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  exercise_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('started', 'draft_saved', 'submitted')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY (attempt_id, user_id, exercise_id) REFERENCES exercise_attempts (id, user_id, exercise_id)
) STRICT;

CREATE INDEX exercise_events_by_attempt ON exercise_events (attempt_id, id DESC);

CREATE TRIGGER exercise_events_no_update BEFORE UPDATE ON exercise_events
BEGIN
  SELECT RAISE(ABORT, 'Exercise events are append-only');
END;

CREATE TRIGGER exercise_events_no_delete BEFORE DELETE ON exercise_events
BEGIN
  SELECT RAISE(ABORT, 'Exercise events are append-only');
END;

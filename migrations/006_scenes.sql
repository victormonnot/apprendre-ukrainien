CREATE TABLE scene_drafts (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  scene_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  role_id TEXT NOT NULL CHECK (role_id IN ('anna', 'maxime')),
  definition TEXT NOT NULL CHECK (json_valid(definition) AND json_type(definition) = 'object'),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  answers TEXT NOT NULL CHECK (json_valid(answers) AND json_type(answers) = 'object'),
  help_used INTEGER NOT NULL CHECK (help_used IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, scene_id, variant_id, definition_version, role_id)
) STRICT;

CREATE TRIGGER scene_drafts_identity_no_update BEFORE UPDATE ON scene_drafts
WHEN OLD.user_id <> NEW.user_id OR OLD.scene_id <> NEW.scene_id
  OR OLD.variant_id <> NEW.variant_id OR OLD.definition_version <> NEW.definition_version
  OR OLD.role_id <> NEW.role_id OR OLD.definition <> NEW.definition
  OR NEW.revision <> OLD.revision + 1
BEGIN
  SELECT RAISE(ABORT, 'Scene draft identity is immutable and revisions must advance');
END;

CREATE TRIGGER scene_drafts_no_delete BEFORE DELETE ON scene_drafts
BEGIN
  SELECT RAISE(ABORT, 'Scene draft revision history cannot be deleted');
END;

CREATE TABLE scene_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  request_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  role_id TEXT NOT NULL CHECK (role_id IN ('anna', 'maxime')),
  definition TEXT NOT NULL CHECK (json_valid(definition) AND json_type(definition) = 'object'),
  answers TEXT NOT NULL CHECK (json_valid(answers) AND json_type(answers) = 'object'),
  help_used INTEGER NOT NULL CHECK (help_used IN (0, 1)),
  feedback TEXT NOT NULL CHECK (json_valid(feedback) AND json_type(feedback) = 'array'),
  submitted_at TEXT NOT NULL,
  UNIQUE (user_id, request_id)
) STRICT;

CREATE INDEX scene_attempts_history
  ON scene_attempts (user_id, scene_id, variant_id, role_id, submitted_at DESC);

CREATE TRIGGER scene_attempts_no_update BEFORE UPDATE ON scene_attempts
BEGIN
  SELECT RAISE(ABORT, 'Scene attempts are immutable');
END;

CREATE TRIGGER scene_attempts_no_delete BEFORE DELETE ON scene_attempts
BEGIN
  SELECT RAISE(ABORT, 'Scene attempts cannot be deleted');
END;

CREATE TABLE scene_requests (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  request_id TEXT NOT NULL,
  command TEXT NOT NULL CHECK (json_valid(command) AND json_type(command) = 'object'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
) STRICT;

CREATE TRIGGER scene_requests_no_update BEFORE UPDATE ON scene_requests
BEGIN
  SELECT RAISE(ABORT, 'Scene requests are immutable');
END;

CREATE TRIGGER scene_requests_no_delete BEFORE DELETE ON scene_requests
BEGIN
  SELECT RAISE(ABORT, 'Scene requests cannot be deleted');
END;

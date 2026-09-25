CREATE TABLE resource_states (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  resource_id TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  notes_revision INTEGER NOT NULL DEFAULT 0 CHECK (notes_revision >= 0),
  position_seconds REAL CHECK (position_seconds >= 0 AND position_seconds <= 86400),
  position_revision INTEGER NOT NULL DEFAULT 0 CHECK (position_revision >= 0),
  opened_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (user_id, resource_id)
) STRICT;

CREATE TRIGGER resource_states_identity_no_update BEFORE UPDATE ON resource_states
WHEN OLD.user_id <> NEW.user_id OR OLD.resource_id <> NEW.resource_id
  OR NEW.notes_revision NOT IN (OLD.notes_revision, OLD.notes_revision + 1)
  OR NEW.position_revision NOT IN (OLD.position_revision, OLD.position_revision + 1)
  OR (OLD.notes <> NEW.notes AND NEW.notes_revision <> OLD.notes_revision + 1)
  OR (OLD.position_seconds IS NOT NEW.position_seconds AND NEW.position_revision <> OLD.position_revision + 1)
BEGIN
  SELECT RAISE(ABORT, 'Resource identity is immutable and revisions must advance independently');
END;

CREATE TRIGGER resource_states_no_delete BEFORE DELETE ON resource_states
BEGIN
  SELECT RAISE(ABORT, 'Resource revision history cannot be deleted');
END;

CREATE TABLE resource_requests (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  request_id TEXT NOT NULL,
  command TEXT NOT NULL CHECK (json_valid(command) AND json_type(command) = 'object'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
) STRICT;

CREATE TRIGGER resource_requests_no_update BEFORE UPDATE ON resource_requests
BEGIN
  SELECT RAISE(ABORT, 'Resource requests are immutable');
END;

CREATE TRIGGER resource_requests_no_delete BEFORE DELETE ON resource_requests
BEGIN
  SELECT RAISE(ABORT, 'Resource requests cannot be deleted');
END;

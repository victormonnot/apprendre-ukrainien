CREATE TABLE language_results (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 120),
  input_key TEXT NOT NULL CHECK (length(input_key) = 64),
  input TEXT NOT NULL CHECK (json_valid(input) AND json_type(input) = 'object'),
  content TEXT NOT NULL CHECK (json_valid(content) AND json_type(content) = 'object'),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  saved_at TEXT,
  UNIQUE (user_id, request_id)
) STRICT;

CREATE UNIQUE INDEX language_results_saved_input
  ON language_results (user_id, input_key) WHERE saved_at IS NOT NULL;
CREATE INDEX language_results_library
  ON language_results (user_id, saved_at DESC) WHERE saved_at IS NOT NULL;

CREATE TRIGGER language_results_snapshot_no_update BEFORE UPDATE ON language_results
WHEN OLD.id <> NEW.id OR OLD.user_id <> NEW.user_id
  OR OLD.request_id <> NEW.request_id OR OLD.input_key <> NEW.input_key
  OR OLD.input <> NEW.input OR OLD.content <> NEW.content
  OR OLD.model <> NEW.model OR OLD.created_at <> NEW.created_at
  OR (OLD.saved_at IS NOT NULL AND OLD.saved_at IS NOT NEW.saved_at)
BEGIN
  SELECT RAISE(ABORT, 'Language results and their original save dates are immutable');
END;

CREATE TRIGGER language_results_no_delete BEFORE DELETE ON language_results
BEGIN
  SELECT RAISE(ABORT, 'Language results cannot be deleted');
END;

CREATE TABLE language_saved_references (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  element_id TEXT NOT NULL CHECK (length(element_id) BETWEEN 1 AND 120),
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, element_id)
) STRICT;

CREATE TRIGGER language_saved_references_no_update BEFORE UPDATE ON language_saved_references
BEGIN
  SELECT RAISE(ABORT, 'Saved reference identities and dates are immutable');
END;

CREATE TRIGGER language_saved_references_no_delete BEFORE DELETE ON language_saved_references
BEGIN
  SELECT RAISE(ABORT, 'Saved references cannot be deleted');
END;

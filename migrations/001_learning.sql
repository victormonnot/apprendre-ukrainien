CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  is_local INTEGER NOT NULL DEFAULT 0 CHECK (is_local IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX profiles_one_local ON profiles (is_local) WHERE is_local = 1;

CREATE TABLE document_progress (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  module_id TEXT NOT NULL CHECK (length(module_id) BETWEEN 1 AND 80),
  document_view TEXT NOT NULL CHECK (document_view IN ('cours', 'vocabulaire', 'exercices')),
  last_viewed_at TEXT,
  checkpoint_section_id TEXT CHECK (checkpoint_section_id IS NULL OR length(checkpoint_section_id) BETWEEN 1 AND 300),
  checkpoint_updated_at TEXT,
  self_report_level TEXT CHECK (self_report_level IN ('to_review', 'understood', 'with_help', 'first_success', 'delayed_success')),
  self_report_detail TEXT NOT NULL DEFAULT '' CHECK (length(self_report_detail) <= 2000),
  self_report_updated_at TEXT,
  PRIMARY KEY (user_id, module_id, document_view),
  CHECK (checkpoint_section_id IS NULL OR checkpoint_updated_at IS NOT NULL),
  CHECK ((self_report_level IS NULL AND self_report_updated_at IS NULL AND self_report_detail = '') OR (self_report_level IS NOT NULL AND self_report_updated_at IS NOT NULL))
) STRICT;

CREATE TABLE document_notes (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  module_id TEXT NOT NULL CHECK (length(module_id) BETWEEN 1 AND 80),
  document_view TEXT NOT NULL CHECK (document_view IN ('cours', 'vocabulaire', 'exercices')),
  text TEXT NOT NULL CHECK (length(text) <= 20000),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, module_id, document_view),
  FOREIGN KEY (user_id, module_id, document_view) REFERENCES document_progress (user_id, module_id, document_view)
) STRICT;

CREATE TABLE learning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  module_id TEXT NOT NULL CHECK (length(module_id) BETWEEN 1 AND 80),
  document_view TEXT NOT NULL CHECK (document_view IN ('cours', 'vocabulaire', 'exercices')),
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'checkpoint', 'note_updated', 'self_report')),
  section_id TEXT CHECK (section_id IS NULL OR length(section_id) BETWEEN 1 AND 300),
  self_report_level TEXT CHECK (self_report_level IN ('to_review', 'understood', 'with_help', 'first_success', 'delayed_success')),
  self_report_detail TEXT CHECK (length(self_report_detail) <= 2000),
  note_revision INTEGER CHECK (note_revision >= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id, module_id, document_view) REFERENCES document_progress (user_id, module_id, document_view),
  CHECK (
    (kind IN ('visit', 'checkpoint') AND self_report_level IS NULL AND self_report_detail IS NULL AND note_revision IS NULL)
    OR (kind = 'note_updated' AND section_id IS NULL AND self_report_level IS NULL AND self_report_detail IS NULL AND note_revision IS NOT NULL)
    OR (kind = 'self_report' AND section_id IS NULL AND self_report_level IS NOT NULL AND self_report_detail IS NOT NULL AND note_revision IS NULL)
  )
) STRICT;

CREATE INDEX learning_events_by_user ON learning_events (user_id, id DESC);

CREATE TRIGGER learning_events_no_update BEFORE UPDATE ON learning_events
BEGIN
  SELECT RAISE(ABORT, 'Learning events are append-only');
END;

CREATE TRIGGER learning_events_no_delete BEFORE DELETE ON learning_events
BEGIN
  SELECT RAISE(ABORT, 'Learning events are append-only');
END;

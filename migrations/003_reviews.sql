CREATE TABLE review_elements (
  user_id TEXT NOT NULL REFERENCES profiles (id),
  element_id TEXT NOT NULL CHECK (length(element_id) BETWEEN 1 AND 120),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, element_id)
) STRICT;

CREATE TABLE review_cards (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL CHECK (length(card_id) BETWEEN 1 AND 160),
  element_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (json_valid(state) AND json_type(state) = 'object'),
  due_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  first_presented_at TEXT,
  first_presented_day TEXT,
  buried_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id),
  UNIQUE (user_id, card_id, element_id),
  FOREIGN KEY (user_id, element_id) REFERENCES review_elements (user_id, element_id),
  CHECK ((first_presented_at IS NULL) = (first_presented_day IS NULL))
) STRICT;

CREATE INDEX review_cards_due ON review_cards (user_id, due_at);
CREATE INDEX review_cards_introduced ON review_cards (user_id, first_presented_day);

CREATE TRIGGER review_cards_identity_no_update BEFORE UPDATE ON review_cards
WHEN OLD.user_id <> NEW.user_id OR OLD.card_id <> NEW.card_id
  OR OLD.element_id <> NEW.element_id OR OLD.created_at <> NEW.created_at
  OR (OLD.first_presented_at IS NOT NULL AND (
    OLD.first_presented_at IS NOT NEW.first_presented_at
    OR OLD.first_presented_day IS NOT NEW.first_presented_day
  ))
BEGIN
  SELECT RAISE(ABORT, 'Review card identity and first presentation are immutable');
END;

CREATE TABLE review_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  element_id TEXT NOT NULL,
  card_revision INTEGER NOT NULL CHECK (card_revision >= 1),
  definition TEXT NOT NULL CHECK (json_valid(definition) AND json_type(definition) = 'object'),
  label TEXT NOT NULL,
  source_href TEXT NOT NULL,
  scheduler TEXT NOT NULL CHECK (json_valid(scheduler) AND json_type(scheduler) = 'object'),
  card_before TEXT NOT NULL CHECK (json_valid(card_before) AND json_type(card_before) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('presented', 'revealed', 'rated')),
  answer_text TEXT CHECK (answer_text IS NULL OR length(answer_text) <= 2000),
  preview TEXT CHECK (preview IS NULL OR (json_valid(preview) AND json_type(preview) = 'object')),
  rating TEXT CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  card_after TEXT CHECK (card_after IS NULL OR (json_valid(card_after) AND json_type(card_after) = 'object')),
  review_log TEXT CHECK (review_log IS NULL OR (json_valid(review_log) AND json_type(review_log) = 'object')),
  created_at TEXT NOT NULL,
  revealed_at TEXT,
  rated_at TEXT,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id, card_id, element_id) REFERENCES review_cards (user_id, card_id, element_id),
  CHECK (
    (status = 'presented' AND answer_text IS NULL AND preview IS NULL
      AND rating IS NULL AND card_after IS NULL AND review_log IS NULL
      AND revealed_at IS NULL AND rated_at IS NULL)
    OR (status = 'revealed' AND answer_text IS NOT NULL AND preview IS NOT NULL
      AND rating IS NULL AND card_after IS NULL AND review_log IS NULL
      AND revealed_at IS NOT NULL AND rated_at IS NULL)
    OR (status = 'rated' AND answer_text IS NOT NULL AND preview IS NOT NULL
      AND rating IS NOT NULL AND card_after IS NOT NULL AND review_log IS NOT NULL
      AND revealed_at IS NOT NULL AND rated_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX review_attempts_one_active
  ON review_attempts (user_id) WHERE status <> 'rated';
CREATE INDEX review_attempts_history ON review_attempts (user_id, rated_at DESC);

CREATE TRIGGER review_attempts_identity_no_update BEFORE UPDATE ON review_attempts
WHEN OLD.id <> NEW.id OR OLD.user_id <> NEW.user_id OR OLD.card_id <> NEW.card_id
  OR OLD.element_id <> NEW.element_id OR OLD.card_revision <> NEW.card_revision
  OR OLD.definition <> NEW.definition OR OLD.label <> NEW.label
  OR OLD.source_href <> NEW.source_href OR OLD.scheduler <> NEW.scheduler
  OR OLD.card_before <> NEW.card_before OR OLD.created_at <> NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'Review attempt identity and snapshots are immutable');
END;

CREATE TRIGGER review_attempts_revealed_no_edit BEFORE UPDATE ON review_attempts
WHEN OLD.status = 'revealed' AND (
  NEW.status <> 'rated' OR OLD.answer_text <> NEW.answer_text
  OR OLD.preview <> NEW.preview OR OLD.revealed_at <> NEW.revealed_at
)
BEGIN
  SELECT RAISE(ABORT, 'Revealed answers and scheduling previews are immutable');
END;

CREATE TRIGGER review_attempts_presented_transition BEFORE UPDATE ON review_attempts
WHEN OLD.status = 'presented' AND NEW.status NOT IN ('presented', 'revealed')
BEGIN
  SELECT RAISE(ABORT, 'A presented review must be revealed before it is rated');
END;

CREATE TRIGGER review_attempts_rated_no_update BEFORE UPDATE ON review_attempts
WHEN OLD.status = 'rated'
BEGIN
  SELECT RAISE(ABORT, 'Rated reviews are immutable');
END;

CREATE TRIGGER review_attempts_no_delete BEFORE DELETE ON review_attempts
BEGIN
  SELECT RAISE(ABORT, 'Review attempts cannot be deleted');
END;

CREATE TABLE review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES profiles (id),
  element_id TEXT NOT NULL,
  attempt_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('activated', 'suspended', 'presented', 'revealed', 'rated')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id, element_id) REFERENCES review_elements (user_id, element_id),
  FOREIGN KEY (attempt_id, user_id) REFERENCES review_attempts (id, user_id),
  CHECK ((kind IN ('activated', 'suspended') AND attempt_id IS NULL)
    OR (kind IN ('presented', 'revealed', 'rated') AND attempt_id IS NOT NULL))
) STRICT;

CREATE TRIGGER review_events_no_update BEFORE UPDATE ON review_events
BEGIN
  SELECT RAISE(ABORT, 'Review events are append-only');
END;

CREATE TRIGGER review_events_no_delete BEFORE DELETE ON review_events
BEGIN
  SELECT RAISE(ABORT, 'Review events are append-only');
END;

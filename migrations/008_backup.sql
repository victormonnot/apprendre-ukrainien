CREATE TABLE workspace_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation TEXT NOT NULL CHECK (length(generation) = 32 AND generation NOT GLOB '*[^0-9a-f]*')
) STRICT;

INSERT INTO workspace_state (id, generation) VALUES (1, lower(hex(randomblob(16))));

CREATE TABLE restore_receipts (
  request_id TEXT PRIMARY KEY NOT NULL,
  command TEXT NOT NULL CHECK (json_valid(command) AND json_type(command) = 'object'),
  result TEXT NOT NULL CHECK (json_valid(result) AND json_type(result) = 'object'),
  created_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER restore_receipts_no_update BEFORE UPDATE ON restore_receipts
BEGIN
  SELECT RAISE(ABORT, 'Restore receipts are immutable');
END;

CREATE TRIGGER restore_receipts_no_delete BEFORE DELETE ON restore_receipts
BEGIN
  SELECT RAISE(ABORT, 'Restore receipts cannot be deleted');
END;

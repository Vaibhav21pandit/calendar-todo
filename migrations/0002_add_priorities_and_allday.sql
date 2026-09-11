-- Migration for DBs created before adding blocked/wontdo and allDay
-- Add allDay column if missing
ALTER TABLE todos ADD COLUMN allDay INTEGER NOT NULL DEFAULT 0;

-- Fix CHECK constraint to allow new priorities: need to recreate table because SQLite cannot alter CHECK
-- Only run if needed; this will be attempted by ensureSchema, but this file is for manual `wrangler d1 execute --remote --file=migrations/0002_add_priorities_and_allday.sql`
-- The following recreates table with correct CHECK (idempotent if already correct)

-- Create new table with correct schema
CREATE TABLE IF NOT EXISTS todos_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration INTEGER NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('super','kinda','chill','blocked','wontdo')),
  desc TEXT DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  deviceId TEXT,
  allDay INTEGER NOT NULL DEFAULT 0
);

-- Copy data (ignore if todos_new already has data)
INSERT OR IGNORE INTO todos_new SELECT id, title, date, time, duration, priority, desc, completed, createdAt, updatedAt, deletedAt, deviceId, COALESCE(allDay,0) FROM todos;

-- Only replace if CHECK was old (detect by trying to insert blocked)
-- This step is safe to run even if already migrated; it will just copy again
-- To actually replace, uncomment the following lines when you know you need it:
-- DROP TABLE todos;
-- ALTER TABLE todos_new RENAME TO todos;
-- CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
-- CREATE INDEX IF NOT EXISTS idx_todos_updatedAt ON todos(updatedAt);
-- CREATE INDEX IF NOT EXISTS idx_todos_deletedAt ON todos(deletedAt);

-- For safety, we provide a simpler ALTER-only migration above; manual recreation is needed only if CHECK blocks.

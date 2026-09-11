CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,         -- ISO  YYYY-MM-DD
  time TEXT NOT NULL,         -- HH:MM
  duration INTEGER NOT NULL,  -- minutes
  priority TEXT NOT NULL CHECK (priority IN ('super','kinda','chill','blocked','wontdo')),
  desc TEXT DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0, -- 0/1
  createdAt INTEGER NOT NULL, -- epoch ms
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,          -- soft delete
  deviceId TEXT,
  allDay INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
CREATE INDEX IF NOT EXISTS idx_todos_updatedAt ON todos(updatedAt);
CREATE INDEX IF NOT EXISTS idx_todos_deletedAt ON todos(deletedAt);

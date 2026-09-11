export async function ensureSchema(DB) {
  if (!DB) return;
  if (globalThis.__schemaEnsured) return;
  const tableSql = `CREATE TABLE IF NOT EXISTS todos (
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
    )`;
  await DB.prepare(tableSql).run();
  await DB.prepare('CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date)').run();
  await DB.prepare('CREATE INDEX IF NOT EXISTS idx_todos_updatedAt ON todos(updatedAt)').run();
  await DB.prepare('CREATE INDEX IF NOT EXISTS idx_todos_deletedAt ON todos(deletedAt)').run();
  // migrate existing DBs: add allDay column if missing (for DBs created before 2026-09-11)
  try { await DB.prepare('ALTER TABLE todos ADD COLUMN allDay INTEGER NOT NULL DEFAULT 0').run(); } catch {}
  globalThis.__schemaEnsured = true;
}

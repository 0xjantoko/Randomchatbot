import { getDb } from '../database/db.js';

export function initSessionTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
}

export const sessionStorage = {
  read: async (key) => {
    try {
      const row = getDb().prepare('SELECT data FROM sessions WHERE key = ?').get(key);
      return row ? JSON.parse(row.data) : undefined;
    } catch {
      return undefined;
    }
  },
  write: async (key, value) => {
    try {
      const data = JSON.stringify(value);
      getDb().prepare(
        'INSERT OR REPLACE INTO sessions (key, data, updated_at) VALUES (?, ?, strftime(\'%s\', \'now\'))'
      ).run(key, data);
    } catch (e) {
      console.error('Session write error:', e.message);
    }
  },
  delete: async (key) => {
    try {
      getDb().prepare('DELETE FROM sessions WHERE key = ?').run(key);
    } catch (e) {
      console.error('Session delete error:', e.message);
    }
  }
};

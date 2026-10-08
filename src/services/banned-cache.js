import { getDb } from '../database/db.js';
import { getActiveBans, cleanupExpiredBans } from '../database/db.js';

const REFRESH_INTERVAL = 30_000;

class BannedCache {
  constructor() {
    this.cache = new Set();
    this._interval = null;
  }

  init() {
    cleanupExpiredBans();
    this.refresh();
    this._interval = setInterval(() => {
      cleanupExpiredBans();
      this.refresh();
    }, REFRESH_INTERVAL);
    this._interval.unref();
  }

  refresh() {
    try {
      const rows = getActiveBans();
      this.cache = new Set(rows.map(r => r.user_id));
    } catch (e) {
      console.error('Banned cache refresh error:', e.message);
    }
  }

  isBanned(userId) {
    return this.cache.has(userId);
  }

  add(userId) {
    this.cache.add(userId);
  }

  remove(userId) {
    this.cache.delete(userId);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }
}

export const bannedCache = new BannedCache();

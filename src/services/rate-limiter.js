const WINDOW_MS = 1000;
const MAX_MESSAGES = 5;
const MAX_COMMANDS = 3;
const CLEANUP_INTERVAL = 60_000;

class RateLimiter {
  constructor() {
    this.messageCounts = new Map();
    this.commandCounts = new Map();
    this._interval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    this._interval.unref();
  }

  checkMessage(userId) {
    return this._check(userId, this.messageCounts, MAX_MESSAGES, WINDOW_MS);
  }

  checkCommand(userId) {
    return this._check(userId, this.commandCounts, MAX_COMMANDS, WINDOW_MS);
  }

  _check(userId, map, limit, windowMs) {
    const now = Date.now();
    const entry = map.get(userId);
    if (!entry) {
      map.set(userId, { count: 1, windowStart: now });
      return true;
    }
    if (now - entry.windowStart > windowMs) {
      entry.count = 1;
      entry.windowStart = now;
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  cleanup() {
    const now = Date.now();
    for (const [userId, entry] of this.messageCounts) {
      if (now - entry.windowStart > WINDOW_MS * 2) this.messageCounts.delete(userId);
    }
    for (const [userId, entry] of this.commandCounts) {
      if (now - entry.windowStart > WINDOW_MS * 2) this.commandCounts.delete(userId);
    }
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }
}

export const rateLimiter = new RateLimiter();

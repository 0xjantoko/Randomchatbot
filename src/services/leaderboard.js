import { getLeaderboard as dbGetLeaderboard } from '../database/db.js';

class LeaderboardService {
  constructor() {
    this.leaderboard = [];
    this._refreshInterval = setInterval(() => this.refresh(), 30000);
    this._refreshInterval.unref();
    this.refresh();
  }

  refresh() {
    try {
      this.leaderboard = dbGetLeaderboard();
    } catch (e) {
      console.error('Leaderboard refresh error:', e.message);
    }
  }

  getRank(userId) {
    const idx = this.leaderboard.findIndex(u => u.user_id === userId);
    if (idx === -1) return null;
    const neighbors = [];
    for (let i = Math.max(0, idx - 2); i <= Math.min(this.leaderboard.length - 1, idx + 2); i++) {
      neighbors.push({
        rank: i + 1,
        ...this.leaderboard[i],
        isYou: i === idx
      });
    }
    return {
      rank: idx + 1,
      total: this.leaderboard.length,
      topPercent: this.leaderboard.length > 0
        ? Math.round(((idx + 1) / this.leaderboard.length) * 100)
        : 100,
      neighbors
    };
  }

  getTopN(n = 10) {
    return this.leaderboard.slice(0, n).map((u, i) => ({ rank: i + 1, ...u }));
  }

  getPosition(userId) {
    const idx = this.leaderboard.findIndex(u => u.user_id === userId);
    return idx === -1 ? null : idx + 1;
  }

  stop() {
    if (this._refreshInterval) clearInterval(this._refreshInterval);
  }
}

export { LeaderboardService };

import {
  getUserProfile as dbGetUserProfile,
  createUserProfile as dbCreateUserProfile,
  updateUserProfile as dbUpdateUserProfile,
  getDailyReward as dbGetDailyReward,
  setDailyReward as dbSetDailyReward
} from '../database/db.js';

const XP_SOURCES = {
  message: { amount: 2, dailyMax: 50, key: 'messages_count' },
  photo: { amount: 5, dailyMax: 20, key: 'photos_sent' },
  session: { amount: 10, dailyMax: null, key: null },
  daily_login: { amount: 20, dailyMax: null, key: null },
  streak_bonus: { amount: 0, dailyMax: null, key: null }
};

function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(2, level - 2));
}

function cumulativeXpForLevel(level) {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

function calcLevel(totalXp) {
  let level = 1;
  while (true) {
    const next = cumulativeXpForLevel(level + 1);
    if (totalXp >= next) level++;
    else break;
  }
  return level;
}

function progressInLevel(totalXp) {
  const level = calcLevel(totalXp);
  const currentLevelXp = cumulativeXpForLevel(level);
  const nextLevelXp = cumulativeXpForLevel(level + 1);
  const needed = nextLevelXp - currentLevelXp;
  const earned = totalXp - currentLevelXp;
  return {
    level,
    xpInLevel: earned,
    xpNeeded: needed,
    progress: needed > 0 ? Math.round((earned / needed) * 100) : 100
  };
}

const LEVEL_PERKS = {
  2: { name: 'Custom Status', description: 'Set status message seen by partner' },
  3: { name: 'Turbo Chat', description: 'Rate limit dinaikkan 5→10 msg/s' },
  5: { name: 'Profile Badge', description: 'Badge level muncul di profil partner' },
  7: { name: 'Priority Match', description: 'Dicariin partner lebih cepat' },
  10: { name: 'Custom ID', description: 'Ganti Anon-XXXX pilih sendiri' },
  15: { name: 'Popular Badge', description: 'Badge eksklusif "Popular"' }
};

class XPService {
  constructor(achievementService) {
    this.achievementService = achievementService;
    this.dailyXpCache = new Map();
    this._cleanupInterval = setInterval(() => this._cleanupDailyCache(), 60000);
    this._cleanupInterval.unref();
  }

  ensureProfile(userId) {
    const existing = dbGetUserProfile(userId);
    if (existing) return existing;
    dbCreateUserProfile(userId);
    return dbGetUserProfile(userId);
  }

  addXP(userId, source, metadata = {}, multiplier = 1) {
    const sourceDef = XP_SOURCES[source];
    if (!sourceDef) return null;

    if (sourceDef.dailyMax !== null) {
      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `${userId}:${source}:${today}`;
      const used = this.dailyXpCache.get(cacheKey) || 0;
      if (used >= sourceDef.dailyMax) return null;
    }

    const profile = this.ensureProfile(userId);
    const baseAmount = source === 'streak_bonus'
      ? 5 * (profile.streak_days || 0)
      : sourceDef.amount;
    const amount = baseAmount * multiplier;

    const prevLevel = calcLevel(profile.xp);
    const newXp = profile.xp + amount;

    dbUpdateUserProfile(userId, {
      xp: newXp,
      level: calcLevel(newXp),
      total_messages: source === 'message' ? (profile.total_messages || 0) + 1 : profile.total_messages,
      total_photos: source === 'photo' ? (profile.total_photos || 0) + 1 : profile.total_photos,
      total_sessions: source === 'session' ? (profile.total_sessions || 0) + 1 : profile.total_sessions
    });

    if (sourceDef.dailyMax !== null) {
      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `${userId}:${source}:${today}`;
      this.dailyXpCache.set(cacheKey, (this.dailyXpCache.get(cacheKey) || 0) + amount);
    }

    const newLevel = calcLevel(newXp);
    const result = { amount, xp: newXp, level: newLevel, source };

    if (newLevel > prevLevel) {
      result.levelUp = true;
      result.newPerks = LEVEL_PERKS[newLevel] || null;
    }

    return result;
  }

  checkDailyStreak(userId, streakFreezeCount = 0) {
    const today = new Date().toISOString().slice(0, 10);
    const reward = dbGetDailyReward(userId);

    if (reward && reward.last_claim_date === today) {
      return { streak: reward.streak_count, alreadyClaimed: true, usedFreeze: false };
    }

    let streak = 1;
    let usedFreeze = false;
    if (reward) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (reward.last_claim_date === yesterday) {
        streak = reward.streak_count + 1;
      } else if (streakFreezeCount > 0) {
        // Use streak freeze: keep streak, don't reset
        streak = reward.streak_count;
        usedFreeze = true;
      }
    }

    dbSetDailyReward(userId, today, streak);
    return { streak, alreadyClaimed: false, usedFreeze };
  }

  claimDaily(userId, streakFreezeCount = 0) {
    const result = this.checkDailyStreak(userId, streakFreezeCount);
    if (result.alreadyClaimed) return { claimed: false, ...result };

    const amount = 20 + (result.streak > 1 ? 5 * result.streak : 0);
    this.addXP(userId, 'daily_login', {});
    if (result.streak > 1) {
      this.addXP(userId, 'streak_bonus', {});
    }

    return { claimed: true, amount, ...result };
  }

  getProfile(userId) {
    const profile = dbGetUserProfile(userId);
    if (!profile) return null;

    const progress = progressInLevel(profile.xp);
    const unlockedPerks = [];
    for (let i = 2; i <= progress.level; i++) {
      if (LEVEL_PERKS[i]) unlockedPerks.push({ level: i, ...LEVEL_PERKS[i] });
    }

    return {
      ...profile,
      ...progress,
      unlockedPerks,
      streak: profile.streak_days || 0
    };
  }

  getLevelPerks(level) {
    const perks = [];
    for (let i = 2; i <= level; i++) {
      if (LEVEL_PERKS[i]) perks.push({ level: i, ...LEVEL_PERKS[i] });
    }
    return perks;
  }

  _cleanupDailyCache() {
    const today = new Date().toISOString().slice(0, 10);
    for (const [key] of this.dailyXpCache) {
      if (!key.includes(today)) this.dailyXpCache.delete(key);
    }
  }

  stop() {
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
  }
}

export { XPService, LEVEL_PERKS, XP_SOURCES, calcLevel, cumulativeXpForLevel, xpForLevel, progressInLevel };

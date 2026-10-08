import { getUserAchievements as dbGetUserAchievements, unlockAchievement as dbUnlockAchievement } from '../database/db.js';

const ACHIEVEMENTS = [
  { key: 'first_chat', name: 'First Chat', desc: 'Kirim pesan pertama', icon: '💬', check: (ev, data) => ev === 'message' && data.profile.total_messages >= 1 },
  { key: 'chat_100', name: 'Chatterbox', desc: 'Kirim 100 pesan', icon: '🗣️', check: (ev, data) => ev === 'message' && data.profile.total_messages >= 100 },
  { key: 'chat_500', name: 'Bicara Terus', desc: 'Kirim 500 pesan', icon: '📢', check: (ev, data) => ev === 'message' && data.profile.total_messages >= 500 },
  { key: 'chat_1000', name: 'Ngomong Terus', desc: 'Kirim 1.000 pesan', icon: '🎙️', check: (ev, data) => ev === 'message' && data.profile.total_messages >= 1000 },
  { key: 'chat_10000', name: 'Legenda Chat', desc: 'Kirim 10.000 pesan', icon: '🏆', check: (ev, data) => ev === 'message' && data.profile.total_messages >= 10000 },
  { key: 'first_photo', name: 'First Shot', desc: 'Kirim foto pertama', icon: '📸', check: (ev, data) => ev === 'photo' && data.profile.total_photos >= 1 },
  { key: 'photo_50', name: 'Pap Guy', desc: 'Kirim 50 foto', icon: '📷', check: (ev, data) => ev === 'photo' && data.profile.total_photos >= 50 },
  { key: 'photo_200', name: 'Pap Machine', desc: 'Kirim 200 foto', icon: '🤳', check: (ev, data) => ev === 'photo' && data.profile.total_photos >= 200 },
  { key: 'first_session', name: 'First Match', desc: 'Dapet match pertama', icon: '💕', check: (ev, data) => ev === 'session' && data.profile.total_sessions >= 1 },
  { key: 'session_10', name: 'Playboy', desc: 'Dapet 10 match', icon: '🎯', check: (ev, data) => ev === 'session' && data.profile.total_sessions >= 10 },
  { key: 'session_50', name: 'Social Butterfly', desc: 'Dapet 50 match', icon: '🦋', check: (ev, data) => ev === 'session' && data.profile.total_sessions >= 50 },
  { key: 'session_200', name: 'Minggir yang Lain', desc: 'Dapet 200 match', icon: '👑', check: (ev, data) => ev === 'session' && data.profile.total_sessions >= 200 },
  { key: 'level_5', name: 'Getting Started', desc: 'Capai level 5', icon: '⭐', check: (ev, data) => data.profile && data.profile.level >= 5 },
  { key: 'level_10', name: 'Veteran', desc: 'Capai level 10', icon: '🌟', check: (ev, data) => data.profile && data.profile.level >= 10 },
  { key: 'level_15', name: 'Elite', desc: 'Capai level 15', icon: '💎', check: (ev, data) => data.profile && data.profile.level >= 15 },
  { key: 'streak_3', name: 'On Fire', desc: 'Streak 3 hari', icon: '🔥', check: (ev, data) => ev === 'daily_login' && data.newStreak >= 3 },
  { key: 'streak_7', name: 'Burning Hot', desc: 'Streak 7 hari', icon: '🔥', check: (ev, data) => ev === 'daily_login' && data.newStreak >= 7 },
  { key: 'streak_30', name: 'Immortal', desc: 'Streak 30 hari', icon: '♾️', check: (ev, data) => ev === 'daily_login' && data.newStreak >= 30 }
];

class AchievementService {
  constructor() {
    this.cache = new Map();
  }

  getUserAchievements(userId) {
    if (!this.cache.has(userId)) {
      const rows = dbGetUserAchievements(userId);
      const keys = new Set(rows.map(r => r.achievement_key));
      this.cache.set(userId, keys);
    }
    return this.cache.get(userId);
  }

  invalidateCache(userId) {
    this.cache.delete(userId);
  }

  check(userId, event, data) {
    const unlocked = this.getUserAchievements(userId);
    const newUnlocks = [];

    for (const ach of ACHIEVEMENTS) {
      if (unlocked.has(ach.key)) continue;
      if (ach.check(event, data)) {
        dbUnlockAchievement(userId, ach.key);
        unlocked.add(ach.key);
        newUnlocks.push(ach);
      }
    }

    return newUnlocks;
  }

  getAllDefinitions() {
    return ACHIEVEMENTS;
  }

  getProgress(userId) {
    const unlocked = this.getUserAchievements(userId);
    return {
      unlocked: unlocked.size,
      total: ACHIEVEMENTS.length,
      achievements: ACHIEVEMENTS.map(a => ({
        ...a,
        unlocked: unlocked.has(a.key)
      }))
    };
  }

  stop() {
    this.cache.clear();
  }
}

export { AchievementService, ACHIEVEMENTS };

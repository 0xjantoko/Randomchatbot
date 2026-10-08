/**
 * Database Service - SQLite for persistence
 * Stores: photos, bans, user stats
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { anonymizeUserId } from '../utils/privacy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data.db');

let db;

export function initDatabase() {
  db = new Database(DB_PATH);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_anonymous_id TEXT NOT NULL,
      receiver_anonymous_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE IF NOT EXISTS bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      anonymous_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      banned_at INTEGER DEFAULT (strftime('%s', 'now')),
      banned_by TEXT DEFAULT 'system'
    );
    
    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      anonymous_id TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      details TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY,
      anonymous_id TEXT NOT NULL,
      messages_count INTEGER DEFAULT 0,
      photos_sent INTEGER DEFAULT 0,
      sessions_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_active INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_photos_sender ON photos(sender_anonymous_id);
    CREATE INDEX IF NOT EXISTS idx_photos_receiver ON photos(receiver_anonymous_id);
    CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(user_id);
    CREATE INDEX IF NOT EXISTS idx_bans_user ON bans(user_id);
  `);

  // Migration: add expires_at for temp bans
  try { db.exec(`ALTER TABLE bans ADD COLUMN expires_at INTEGER`); } catch (_) {}
  try { db.exec(`ALTER TABLE bans ADD COLUMN report_count INTEGER DEFAULT 0`); } catch (_) {}

  // Cleanup expired temp bans on startup
  db.exec(`DELETE FROM bans WHERE expires_at IS NOT NULL AND expires_at < strftime('%s', 'now')`);
  
  console.log('✅ Database initialized:', DB_PATH);
  return db;
}

export function getDb() {
  if (!db) initDatabase();
  return db;
}

// ============ PHOTO OPERATIONS ============

export function savePhoto(senderAnonId, receiverAnonId, fileId) {
  const stmt = getDb().prepare(
    'INSERT INTO photos (sender_anonymous_id, receiver_anonymous_id, file_id) VALUES (?, ?, ?)'
  );
  return stmt.run(senderAnonId, receiverAnonId, fileId);
}

export function getPhotosByUser(anonymousId) {
  const stmt = getDb().prepare(
    'SELECT * FROM photos WHERE sender_anonymous_id = ? OR receiver_anonymous_id = ? ORDER BY created_at DESC'
  );
  return stmt.all(anonymousId, anonymousId);
}

// ============ BAN OPERATIONS ============

export function banUser(userId, reason, bannedBy = 'system', durationMs = null) {
  const anonId = anonymizeUserId(userId);
  
  if (durationMs) {
    const expiresAt = Math.floor((Date.now() + durationMs) / 1000);
    const stmt = getDb().prepare(
      'INSERT INTO bans (user_id, anonymous_id, reason, banned_by, expires_at) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(userId, anonId, reason, bannedBy, expiresAt);
    console.log(`🚫 Temp-banned (${durationMs / 60000}min): ${anonId} (reason: ${reason})`);
  } else {
    const stmt = getDb().prepare(
      'INSERT INTO bans (user_id, anonymous_id, reason, banned_by) VALUES (?, ?, ?, ?)'
    );
    stmt.run(userId, anonId, reason, bannedBy);
    console.log(`🚫 Banned permanently: ${anonId} (reason: ${reason})`);
  }
}

export function tempBanUser(userId, reason, durationMs = 86400000, bannedBy = 'system') {
  return banUser(userId, reason, bannedBy, durationMs);
}

export function isBanned(userId) {
  const stmt = getDb().prepare(
    'SELECT id FROM bans WHERE user_id = ? AND (expires_at IS NULL OR expires_at > strftime(\'%s\', \'now\'))'
  );
  return !!stmt.get(userId);
}

export function getBanInfo(userId) {
  const stmt = getDb().prepare(
    'SELECT * FROM bans WHERE user_id = ? AND (expires_at IS NULL OR expires_at > strftime(\'%s\', \'now\'))'
  );
  return stmt.get(userId);
}

export function getActiveBans() {
  const stmt = getDb().prepare(
    'SELECT user_id FROM bans WHERE expires_at IS NULL OR expires_at > strftime(\'%s\', \'now\')'
  );
  return stmt.all();
}

// ───── FREEZE SYSTEM (migration violations) ─────

const MIGRATION_FREEZE_THRESHOLD = 3;
const MIGRATION_FREEZE_DURATION = 86400000; // 24 hours

export function logMigrationViolation(userId, details) {
  const anonId = anonymizeUserId(userId);
  const stmt = getDb().prepare(
    'INSERT INTO violations (user_id, anonymous_id, violation_type, details) VALUES (?, ?, ?, ?)'
  );
  stmt.run(userId, anonId, 'migration', details);

  const countStmt = getDb().prepare(
    "SELECT COUNT(*) as count FROM violations WHERE user_id = ? AND violation_type = 'migration'"
  );
  const result = countStmt.get(userId);

  return {
    count: result.count,
    frozen: result.count >= MIGRATION_FREEZE_THRESHOLD
  };
}

export function freezeUser(userId, reason) {
  return tempBanUser(userId, `freeze:${reason}`, MIGRATION_FREEZE_DURATION, 'system');
}

export function getMigrationViolationCount(userId) {
  const stmt = getDb().prepare(
    "SELECT COUNT(*) as count FROM violations WHERE user_id = ? AND violation_type = 'migration'"
  );
  const result = stmt.get(userId);
  return result?.count || 0;
}

export function resetMigrationViolations(userId) {
  getDb().prepare(
    "DELETE FROM violations WHERE user_id = ? AND violation_type = 'migration'"
  ).run(userId);
}

export function cleanupExpiredBans() {
  const result = getDb().prepare(
    'DELETE FROM bans WHERE expires_at IS NOT NULL AND expires_at < strftime(\'%s\', \'now\')'
  ).run();
  if (result.changes > 0) {
    console.log(`🧹 Cleaned up ${result.changes} expired temp bans`);
  }
  return result.changes;
}

export function getReportCount(userId) {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM bans WHERE user_id = ? AND reason LIKE \'report:%\' AND (expires_at IS NULL OR expires_at > strftime(\'%s\', \'now\'))'
  ).get(userId);
  return row?.count || 0;
}

export function flagUserUnderage(userId) {
  const anonId = anonymizeUserId(userId);
  try {
    getDb().prepare(`
      INSERT INTO user_profiles (user_id, trust_level)
      VALUES (?, 'flagged')
      ON CONFLICT(user_id) DO UPDATE SET trust_level = 'flagged'
    `).run(userId);
    console.log(`🚩 User flagged underage: ${anonId}`);
  } catch (e) {
    console.error('Flag underage error:', e.message);
  }
}

// ============ VIOLATIONS ============

export function logViolation(userId, violationType, details = null) {
  const anonId = anonymizeUserId(userId);
  
  const stmt = getDb().prepare(
    'INSERT INTO violations (user_id, anonymous_id, violation_type, details) VALUES (?, ?, ?, ?)'
  );
  stmt.run(userId, anonId, violationType, details);
  
  // Check if should ban (3 violations = auto ban)
  const countStmt = getDb().prepare(
    'SELECT COUNT(*) as count FROM violations WHERE user_id = ?'
  );
  const result = countStmt.get(userId);
  
  if (result.count >= 3) {
    banUser(userId, `Auto-ban: 3 violations (${violationType})`);
    return { banned: true, violationCount: result.count };
  }
  
  return { banned: false, violationCount: result.count };
}

export function getUserViolations(userId) {
  const stmt = getDb().prepare(
    'SELECT * FROM violations WHERE user_id = ? ORDER BY created_at DESC'
  );
  return stmt.all(userId);
}

// ============ USER STATS ============

export function updateUserStats(userId, type = 'message') {
  const anonId = anonymizeUserId(userId);
  
  const existing = getDb().prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  
  if (existing) {
    const updates = {
      message: 'messages_count = messages_count + 1',
      photo: 'photos_sent = photos_sent + 1',
      session: 'sessions_count = sessions_count + 1'
    };
    
    const stmt = getDb().prepare(
      `UPDATE user_stats SET ${updates[type] || 'messages_count = messages_count + 1'}, last_active = strftime('%s', 'now') WHERE user_id = ?`
    );
    stmt.run(userId);
  } else {
    const stmt = getDb().prepare(
      'INSERT INTO user_stats (user_id, anonymous_id, messages_count, photos_sent, sessions_count) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(userId, anonId, type === 'message' ? 1 : 0, type === 'photo' ? 1 : 0, type === 'session' ? 1 : 0);
  }
}

export function getUserStats(userId) {
  const stmt = getDb().prepare('SELECT * FROM user_stats WHERE user_id = ?');
  return stmt.get(userId);
}

// ============ ADMIN ============

export function getAllBans() {
  const stmt = getDb().prepare('SELECT * FROM bans ORDER BY banned_at DESC');
  return stmt.all();
}

export function getAllPhotos(limit = 50) {
  const stmt = getDb().prepare(
    'SELECT * FROM photos ORDER BY created_at DESC LIMIT ?'
  );
  return stmt.all(limit);
}

export function getPhotoByFileId(fileId) {
  const stmt = getDb().prepare('SELECT * FROM photos WHERE file_id = ?');
  return stmt.get(fileId);
}

export function getViolationStats() {
  const stmt = getDb().prepare(`
    SELECT violation_type, COUNT(*) as count 
    FROM violations 
    GROUP BY violation_type
  `);
  return stmt.all();
}

export function unbanUser(userId) {
  const stmt = getDb().prepare('DELETE FROM bans WHERE user_id = ?');
  return stmt.run(userId);
}

// ═══════════════════════════════════════════════════
// GAMIFICATION TABLES (v2 — created on first access)
// ═══════════════════════════════════════════════════

let _gamificationInitialized = false;

export function initGamificationTables() {
  if (_gamificationInitialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak_days INTEGER DEFAULT 0,
      total_sessions INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      total_photos INTEGER DEFAULT 0,
      total_referrals INTEGER DEFAULT 0,
      unlocked_features TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_active INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_key TEXT NOT NULL,
      unlocked_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id, achievement_key)
    );

    CREATE TABLE IF NOT EXISTS daily_rewards (
      user_id INTEGER PRIMARY KEY,
      last_claim_date TEXT NOT NULL,
      streak_count INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_xp ON user_profiles(xp DESC);
  `);

  // Migrations for existing DBs
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN unlocked_features TEXT DEFAULT '[]'`); } catch (_) {}
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN total_referrals INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN trust_level TEXT DEFAULT 'shadow'`); } catch (_) {}
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN age_verified INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN sessions_completed INTEGER DEFAULT 0`); } catch (_) {}

  // Moderation (bracket-breach) — P0
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN quarantined_at INTEGER`); } catch (_) {}
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN quarantine_reason TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN bracket_locked TEXT`); } catch (_) {}

  _gamificationInitialized = true;
}

// ============ USER PROFILES ============

export function createUserProfile(userId) {
  initGamificationTables();
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)'
  );
  return stmt.run(userId);
}

export function getUserProfile(userId) {
  initGamificationTables();
  const stmt = getDb().prepare('SELECT * FROM user_profiles WHERE user_id = ?');
  return stmt.get(userId);
}

export function updateUserProfile(userId, updates) {
  initGamificationTables();
  // Upsert: pastikan row ada, kalau tidak UPDATE akan no-op untuk user baru
  getDb().prepare('INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)').run(userId);
  const fields = Object.keys(updates)
    .filter(k => k !== 'user_id')
    .map(k => `${k} = ?`)
    .join(', ');
  if (!fields) return;
  const values = Object.keys(updates)
    .filter(k => k !== 'user_id')
    .map(k => updates[k]);
  values.push(userId);
  const stmt = getDb().prepare(
    `UPDATE user_profiles SET ${fields}, last_active = strftime('%s', 'now') WHERE user_id = ?`
  );
  return stmt.run(...values);
}

// ============ MODERATION (bracket-breach) ============

/**
 * Quarantine a user: dikeluarkan dari pool & sesi, masuk antrean review admin.
 * Tidak permanen — admin bisa release via /admin/api/quarantine/:id/release.
 */
export function quarantineUser(userId, reason) {
  initGamificationTables();
  const stmt = getDb().prepare(`
    INSERT INTO user_profiles (user_id, quarantined_at, quarantine_reason, trust_level)
    VALUES (?, strftime('%s','now'), ?, 'flagged')
    ON CONFLICT(user_id) DO UPDATE SET
      quarantined_at = strftime('%s','now'),
      quarantine_reason = excluded.quarantine_reason,
      trust_level = 'flagged'
  `);
  return stmt.run(userId, reason || 'bracket_breach');
}

export function clearQuarantine(userId) {
  initGamificationTables();
  return getDb().prepare(`
    UPDATE user_profiles
    SET quarantined_at = NULL, quarantine_reason = NULL
    WHERE user_id = ?
  `).run(userId);
}

/** Info moderasi satu user (undefined kalau belum ada row profil). */
export function getModerationInfo(userId) {
  initGamificationTables();
  return getDb().prepare(`
    SELECT user_id, quarantined_at, quarantine_reason, bracket_locked, trust_level
    FROM user_profiles WHERE user_id = ?
  `).get(userId);
}

export function getQuarantinedUsers(limit = 100) {
  initGamificationTables();
  return getDb().prepare(`
    SELECT user_id, quarantined_at, quarantine_reason, bracket_locked, trust_level
    FROM user_profiles
    WHERE quarantined_at IS NOT NULL
    ORDER BY quarantined_at DESC
    LIMIT ?
  `).all(limit);
}

/** Ratchet: kunci user ke satu bracket secara permanen (sampai admin cabut). */
export function setBracketLock(userId, bracket) {
  initGamificationTables();
  const stmt = getDb().prepare(`
    INSERT INTO user_profiles (user_id, bracket_locked)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET bracket_locked = excluded.bracket_locked
  `);
  return stmt.run(userId, bracket);
}

export function clearBracketLock(userId) {
  initGamificationTables();
  return getDb().prepare('UPDATE user_profiles SET bracket_locked = NULL WHERE user_id = ?').run(userId);
}

// ============ MATCH PAIRS + EVIDENCE (P1) ============

let _moderationTablesReady = false;

function initModerationTables() {
  if (_moderationTablesReady) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS match_pairs (
      pair_key TEXT PRIMARY KEY,
      last_matched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_key TEXT NOT NULL,
      user_low INTEGER NOT NULL,
      user_high INTEGER NOT NULL,
      reason TEXT,
      bracket TEXT,
      payload TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_user_low ON evidence(user_low);
    CREATE INDEX IF NOT EXISTS idx_evidence_user_high ON evidence(user_high);
    CREATE INDEX IF NOT EXISTS idx_evidence_created ON evidence(created_at);
  `);
  _moderationTablesReady = true;
}

/** Catat pasangan yang baru match (dipakai cooldown re-match di Pool Minor). */
export function recordMatchPair(pairKey) {
  initModerationTables();
  return getDb().prepare(`
    INSERT INTO match_pairs (pair_key, last_matched_at)
    VALUES (?, strftime('%s','now'))
    ON CONFLICT(pair_key) DO UPDATE SET last_matched_at = strftime('%s','now')
  `).run(pairKey);
}

export function hasRecentMatch(pairKey, withinMs = 86_400_000) {
  initModerationTables();
  const row = getDb().prepare('SELECT last_matched_at FROM match_pairs WHERE pair_key = ?').get(pairKey);
  if (!row) return false;
  return (Date.now() - row.last_matched_at * 1000) < withinMs;
}

export function insertEvidence({ pairKey, userLow, userHigh, reason, bracket, payload, messageCount = 0 }) {
  initModerationTables();
  return getDb().prepare(`
    INSERT INTO evidence (pair_key, user_low, user_high, reason, bracket, payload, message_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pairKey, userLow, userHigh, reason || 'unspecified', bracket || null, payload, messageCount);
}

/** Metadata bukti (payload tetap terenkripsi). */
export function listEvidence({ userId = null, limit = 50 } = {}) {
  initModerationTables();
  if (userId !== null) {
    return getDb().prepare(`
      SELECT id, pair_key, user_low, user_high, reason, bracket, message_count, created_at
      FROM evidence WHERE user_low = ? OR user_high = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, userId, limit);
  }
  return getDb().prepare(`
    SELECT id, pair_key, user_low, user_high, reason, bracket, message_count, created_at
    FROM evidence ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

export function getEvidence(id) {
  initModerationTables();
  return getDb().prepare('SELECT * FROM evidence WHERE id = ?').get(id);
}

/** Pangkas bukti lebih tua dari ttlDays. */
export function pruneEvidence(ttlDays = 30) {
  initModerationTables();
  const cutoff = Math.floor(Date.now() / 1000) - ttlDays * 86_400;
  return getDb().prepare('DELETE FROM evidence WHERE created_at < ?').run(cutoff);
}

export function countEvidence() {
  initModerationTables();
  return getDb().prepare('SELECT COUNT(*) AS c FROM evidence').get().c;
}

// ============ ACHIEVEMENTS ============

export function getUserAchievements(userId) {
  initGamificationTables();
  const stmt = getDb().prepare(
    'SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at'
  );
  return stmt.all(userId);
}

export function unlockAchievement(userId, achievementKey) {
  initGamificationTables();
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)'
  );
  return stmt.run(userId, achievementKey);
}

// ============ DAILY REWARDS ============

export function getDailyReward(userId) {
  initGamificationTables();
  const stmt = getDb().prepare('SELECT * FROM daily_rewards WHERE user_id = ?');
  return stmt.get(userId);
}

export function setDailyReward(userId, date, streak) {
  initGamificationTables();
  const stmt = getDb().prepare(
    'INSERT OR REPLACE INTO daily_rewards (user_id, last_claim_date, streak_count) VALUES (?, ?, ?)'
  );
  return stmt.run(userId, date, streak);
}

// ============ UNLOCKED FEATURES ============

export function getUserUnlockedFeatures(userId) {
  initGamificationTables();
  const profile = getUserProfile(userId);
  if (!profile || !profile.unlocked_features) return [];
  try { return JSON.parse(profile.unlocked_features); } catch { return []; }
}

export function addUserUnlockedFeature(userId, feature) {
  initGamificationTables();
  const features = getUserUnlockedFeatures(userId);
  if (features.includes(feature)) return features;
  features.push(feature);
  _updateProfileField(userId, { unlocked_features: JSON.stringify(features) });
  return features;
}

function _updateProfileField(userId, updates) {
  const fields = Object.keys(updates)
    .filter(k => k !== 'user_id')
    .map(k => `${k} = ?`)
    .join(', ');
  if (!fields) return;
  const values = Object.keys(updates)
    .filter(k => k !== 'user_id')
    .map(k => updates[k]);
  values.push(userId);
  const stmt = getDb().prepare(
    `UPDATE user_profiles SET ${fields}, last_active = strftime('%s', 'now') WHERE user_id = ?`
  );
  return stmt.run(...values);
}

// ============ LEADERBOARD ============

// ============ REFERRALS ============

export function getReferralCount(userId) {
  initGamificationTables();
  const row = getDb().prepare('SELECT total_referrals FROM user_profiles WHERE user_id = ?').get(userId);
  return row?.total_referrals || 0;
}

export function incrementReferralCount(userId) {
  initGamificationTables();
  getDb().prepare(`
    INSERT INTO user_profiles (user_id, total_referrals)
    VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET total_referrals = total_referrals + 1
  `).run(userId);
}

export function incrementSessionsCompleted(userId) {
  initGamificationTables();
  getDb().prepare(`
    INSERT INTO user_profiles (user_id, sessions_completed, trust_level)
    VALUES (?, 1, 'shadow')
    ON CONFLICT(user_id) DO UPDATE SET
      sessions_completed = sessions_completed + 1,
      trust_level = CASE
        WHEN trust_level = 'flagged' THEN 'flagged'
        WHEN sessions_completed + 1 >= 3 THEN 'verified'
        ELSE trust_level
      END
  `).run(userId);
}

export function getLeaderboard() {
  initGamificationTables();
  const stmt = getDb().prepare(
    'SELECT user_id, xp, level FROM user_profiles ORDER BY xp DESC LIMIT 100'
  );
  return stmt.all();
}
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

export function banUser(userId, reason, bannedBy = 'system') {
  const anonId = anonymizeUserId(userId);
  
  const stmt = getDb().prepare(
    'INSERT INTO bans (user_id, anonymous_id, reason, banned_by) VALUES (?, ?, ?, ?)'
  );
  stmt.run(userId, anonId, reason, bannedBy);
  
  console.log(`🚫 Banned: ${anonId} (reason: ${reason})`);
}

export function isBanned(userId) {
  const stmt = getDb().prepare('SELECT id FROM bans WHERE user_id = ?');
  return !!stmt.get(userId);
}

export function getBanInfo(userId) {
  const stmt = getDb().prepare('SELECT * FROM bans WHERE user_id = ?');
  return stmt.get(userId);
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
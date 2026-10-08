/**
 * Session Service — Manages active chat sessions with privacy
 */

import config from '../config.js';
import { getPublicProfile, anonymizeUserId, checkPersonalInfo, hashPairId } from '../utils/privacy.js';
import { updateUserStats, incrementSessionsCompleted, recordMatchPair } from '../database/db.js';
import { evaluateSession } from './behavioral.js';
import { clearTrustCache } from './trust.js';
import { flushEvidence } from './evidence.js';

export class SessionService {
  constructor(poolService) {
    this.poolService = poolService;
    this.sessions = new Map();
    this._startCleanup();
  }

  _startCleanup() {
    const DEFAULT_TIMEOUT = config.SESSION_TIMEOUT * 1000;
    const MINOR_TIMEOUT = 600_000; // 10 minutes for minors
    const INTERVAL = Math.min(DEFAULT_TIMEOUT, 300_000);
    this._cleanupInterval = setInterval(() => {
      const now = Date.now();
      const stale = [];
      for (const [userId, session] of this.sessions) {
        const isMinor = (session.user_a === userId ? session.profile_a?._ageBracket : session.profile_b?._ageBracket) === 'minor';
        const timeout = isMinor ? MINOR_TIMEOUT : DEFAULT_TIMEOUT;
        if (now - session.last_activity > timeout && !stale.includes(session)) {
          stale.push(session);
        }
      }
      for (const session of stale) {
        this.endSession(session.user_a, 'timeout');
        try {
          console.log(`⏰ Session timed out: ${anonymizeUserId(session.user_a)} <-> ${anonymizeUserId(session.user_b)}`);
        } catch (e) {}
      }
    }, INTERVAL);
    this._cleanupInterval.unref();
  }

  /** Shutdown — matikan interval cleanup (readiness: shutdown/interval leak). */
  stop() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
  
  /**
   * Create a new session between two users
   */
  async createSession(userAId, userBId, userAProfile, userBProfile) {
    const session = {
      user_a: userAId,
      user_b: userBId,
      // Store sanitized profiles (no real identity)
      profile_a: getPublicProfile(userAProfile, config),
      profile_b: getPublicProfile(userBProfile, config),
      started_at: Date.now(),
      last_activity: Date.now()
    };
    
    this.sessions.set(userAId, session);
    this.sessions.set(userBId, session);
    
    updateUserStats(userAId, 'session');
    updateUserStats(userBId, 'session');
    // Catat pasangan untuk cooldown re-match (Pool Minor)
    try { recordMatchPair(hashPairId(userAId, userBId)); } catch (_) {}
    
    console.log(`💬 Session created: ${anonymizeUserId(userAId)} <-> ${anonymizeUserId(userBId)}`);
    return session;
  }
  
  /**
   * End a session
   */
  async endSession(userId, reason = 'manual') {
    const session = this.sessions.get(userId);
    if (!session) return;
    
    const partnerId = session.user_a === userId ? session.user_b : session.user_a;
    
    this.sessions.delete(userId);
    this.sessions.delete(partnerId);
    
    // Track session completion for trust system
    incrementSessionsCompleted(userId);
    incrementSessionsCompleted(partnerId);

    // Behavioral evaluation — cek apakah user cocok dengan bracket yang diklaim
    const userProfile = session.user_a === userId ? session.profile_a : session.profile_b;
    const partnerProfile = session.user_a === partnerId ? session.profile_a : session.profile_b;
    const userBracket = userProfile?._ageBracket;
    const partnerBracket = partnerProfile?._ageBracket;
    const userTrust = userProfile?.trust_level;
    const partnerTrust = partnerProfile?.trust_level;

    evaluateSession(userId, userBracket, userTrust).catch(() => {});
    evaluateSession(partnerId, partnerBracket, partnerTrust).catch(() => {});

    // P1: sesi Pool Minor → transcript terenkripsi (TTL 30 hari) + invalidasi cache trust
    try {
      if (userBracket === 'minor' || partnerBracket === 'minor') {
        flushEvidence(userId, partnerId, { reason: `session_end:${reason}`, bracket: 'minor' });
      }
    } catch (_) {}
    clearTrustCache(userId);
    clearTrustCache(partnerId);
    
    console.log(`👋 Session ended: ${anonymizeUserId(userId)} <-> ${anonymizeUserId(partnerId)} (${reason})`);
    
    return { session, partnerId };
  }
  
  /**
   * Get session for user
   */
  getSession(userId) {
    return this.sessions.get(userId);
  }
  
  /**
   * Get partner ID
   */
  getPartner(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;
    return session.user_a === userId ? session.user_b : session.user_a;
  }
  
  /**
   * Get partner's public profile (anonymous)
   */
  getPartnerProfile(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;
    
    return session.user_a === userId 
      ? session.profile_b 
      : session.profile_a;
  }
  
  /**
   * Get user's own public profile (anonymous)
   */
  getUserProfile(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;
    
    return session.user_a === userId 
      ? session.profile_a 
      : session.profile_b;
  }
  
  /**
   * Forward message to partner (with personal info check)
   */
  async forwardMessage(bot, fromUserId, text) {
    const partnerId = this.getPartner(fromUserId);
    if (!partnerId) return false;
    
    // Check for personal info
    const safety = checkPersonalInfo(text);
    if (!safety.safe) {
      try {
        await bot.api.sendMessage(fromUserId, 
          `⚠️ *Warning:* Jangan share ${safety.reason}! Ini demi keamanan kamu.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
      return false;
    }
    
    try {
      await bot.api.sendMessage(partnerId, text);
      return true;
    } catch (error) {
      console.error(`Error forwarding message: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if user is in session
   */
  isInSession(userId) {
    return this.sessions.has(userId);
  }
  
  /**
   * Update last activity
   */
  updateActivity(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.last_activity = Date.now();
    }
  }
  
  /**
   * Get all active sessions count
   */
  getActiveSessions() {
    return Math.floor(this.sessions.size / 2);
  }

  /**
   * Get all active sessions (anonymized) for admin dashboard
   */
  getAllSessions() {
    const seen = new Set();
    const result = [];
    for (const [userId, session] of this.sessions) {
      if (seen.has(session)) continue;
      seen.add(session);
      result.push({
        user_a_anon: anonymizeUserId(session.user_a),
        user_b_anon: anonymizeUserId(session.user_b),
        started_at: session.started_at,
        last_activity: session.last_activity,
        duration_sec: Math.round((Date.now() - session.started_at) / 1000)
      });
    }
    return result;
  }
}
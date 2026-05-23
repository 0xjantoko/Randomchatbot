/**
 * Session Service — Manages active chat sessions with privacy
 */

import config from '../config.js';
import { getPublicProfile, anonymizeUserId, checkPersonalInfo } from '../utils/privacy.js';

export class SessionService {
  constructor(poolService) {
    this.poolService = poolService;
    this.sessions = new Map();
    this._startCleanup();
  }

  _startCleanup() {
    const TIMEOUT = config.SESSION_TIMEOUT * 1000;
    const INTERVAL = Math.min(TIMEOUT, 300_000);
    this._cleanupInterval = setInterval(() => {
      const now = Date.now();
      const stale = [];
      for (const [userId, session] of this.sessions) {
        if (now - session.last_activity > TIMEOUT && !stale.includes(session)) {
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
    
    // Get partner profile info for context
    const senderProfile = this.getPartnerProfile(fromUserId);
    const prefix = `💬 [${senderProfile?.age || '?'}y ${senderProfile?.gender || '?'} ${senderProfile?.location || '?'}]`;
    
    try {
      await bot.api.sendMessage(partnerId, `${prefix}\n${text}`);
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
}
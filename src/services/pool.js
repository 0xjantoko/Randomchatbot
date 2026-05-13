/**
 * Pool Service — Manages waiting users and matchmaking
 * With privacy (no real Telegram ID exposed)
 */

import { anonymizeUserId, sanitizeUser } from '../utils/privacy.js';

export class PoolService {
  constructor() {
    this.pool = new Map();
    this.waitingQueue = [];
  }
  
  /**
   * Add user to waiting pool (sanitized)
   */
  async addToPool(user) {
    this.removeFromPool(user.user_id);
    
    // Sanitize user - remove real identity
    const sanitized = sanitizeUser(user);
    
    this.pool.set(user.user_id, sanitized);
    this.waitingQueue.push(user.user_id);
    
    console.log(`📤 ${sanitized.anonymous_id} added to pool. Pool size: ${this.pool.size}`);
  }
  
  /**
   * Remove user from pool
   */
  async removeFromPool(userId) {
    const user = this.pool.get(userId);
    if (user) {
      console.log(`📕 ${user.anonymous_id} removed from pool`);
    }
    this.pool.delete(userId);
    this.waitingQueue = this.waitingQueue.filter(id => id !== userId);
  }
  
  /**
   * Find match for user
   */
  async findMatch(user) {
    const sanitizedUser = sanitizeUser(user);
    
    for (const candidateId of this.waitingQueue) {
      if (candidateId === user.user_id) continue;
      
      const candidate = this.pool.get(candidateId);
      if (!candidate) continue;
      
      // Language match
      if (candidate.language !== sanitizedUser.language) continue;
      
      // Gender preference (mutual)
      if (!this.checkGenderMatch(sanitizedUser, candidate)) continue;
      
      // Age compatibility
      if (!this.checkAgeMatch(sanitizedUser, candidate)) continue;
      
      // Preference match (18+, same, random)
      if (!this.checkPreferenceMatch(sanitizedUser, candidate)) continue;
      
      // Found match!
      return candidate;
    }
    
    return null;
  }
  
  checkGenderMatch(userA, userB) {
    const aPrefs = userA.gender_prefs || ['M', 'F', 'O'];
    const bPrefs = userB.gender_prefs || ['M', 'F', 'O'];
    return aPrefs.includes(userB.gender) && bPrefs.includes(userA.gender);
  }
  
  checkAgeMatch(userA, userB) {
    const aMin = userA.age_min || 18;
    const aMax = userA.age_max || 99;
    const bMin = userB.age_min || 18;
    const bMax = userB.age_max || 99;
    
    return (userA.age >= aMin && userA.age <= aMax && 
            userB.age >= bMin && userB.age <= bMax);
  }
  
  checkPreferenceMatch(userA, userB) {
    if (userA.preference === '18+' || userB.preference === '18+') {
      return userA.preference === '18+' && userB.preference === '18+';
    }
    return true;
  }
  
  getPoolSize() {
    return this.pool.size;
  }
  
  getUser(userId) {
    return this.pool.get(userId);
  }
  
  isInPool(userId) {
    return this.pool.has(userId);
  }
  
  /**
   * Get all anonymous profiles in pool
   */
  getPoolProfiles() {
    const profiles = [];
    for (const [id, user] of this.pool) {
      profiles.push({
        anonymous_id: user.anonymous_id,
        age: user.age,
        gender: user.gender,
        language: user.language,
        preference: user.preference
      });
    }
    return profiles;
  }
}
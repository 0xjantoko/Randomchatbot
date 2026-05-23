import { sanitizeUser } from '../utils/privacy.js';

export class PoolService {
  constructor() {
    this.pool = new Map();
    this.waitingQueue = [];
    this.langBuckets = new Map();
    this._lock = Promise.resolve();
  }

  _acquireLock() {
    let release;
    const prev = this._lock;
    this._lock = new Promise(resolve => { release = resolve; });
    return prev.then(() => release);
  }

  async addToPool(user) {
    const release = await this._acquireLock();
    try {
      this._removeFromPool(user.user_id);
      const sanitized = sanitizeUser(user);
      this.pool.set(user.user_id, sanitized);
      this.waitingQueue.push(user.user_id);

      if (!this.langBuckets.has(sanitized.language)) {
        this.langBuckets.set(sanitized.language, new Map());
      }
      this.langBuckets.get(sanitized.language).set(user.user_id, sanitized);
    } finally {
      release();
    }
  }

  _removeFromPool(userId) {
    const user = this.pool.get(userId);
    if (user) {
      const bucket = this.langBuckets.get(user.language);
      if (bucket) bucket.delete(userId);
    }
    this.pool.delete(userId);
    this.waitingQueue = this.waitingQueue.filter(id => id !== userId);
  }

  async removeFromPool(userId) {
    const release = await this._acquireLock();
    try {
      this._removeFromPool(userId);
    } finally {
      release();
    }
  }

  async findMatch(user) {
    const release = await this._acquireLock();
    try {
      const sanitizedUser = sanitizeUser(user);
      const bucket = this.langBuckets.get(sanitizedUser.language);
      if (!bucket || bucket.size === 0) return null;

      for (const [candidateId, candidate] of bucket) {
        if (candidateId === user.user_id) continue;
        if (!this.checkGenderMatch(sanitizedUser, candidate)) continue;
        if (!this.checkAgeMatch(sanitizedUser, candidate)) continue;
        if (!this.checkPreferenceMatch(sanitizedUser, candidate)) continue;
        return candidate;
      }
      return null;
    } finally {
      release();
    }
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

  getPoolSize() { return this.pool.size; }

  getUser(userId) { return this.pool.get(userId); }

  isInPool(userId) { return this.pool.has(userId); }

  getPoolProfiles() {
    const profiles = [];
    for (const user of this.pool.values()) {
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

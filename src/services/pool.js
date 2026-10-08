import { sanitizeUser, hashPairId } from '../utils/privacy.js';
import config from '../config.js';
import { hasRecentMatch } from '../database/db.js';

export const AGE_BRACKETS = {
  minor: { label: '13-17', min: 13, max: 17, textOnly: true },
  '20s': { label: '18-29', min: 18, max: 29, textOnly: false },
  '30plus': { label: '30+', min: 30, max: 99, textOnly: false }
};

export function getAgeBracket(age) {
  if (age >= 1 && age <= 17) return 'minor';
  if (age >= 18 && age <= 29) return '20s';
  if (age >= 30 && age <= 99) return '30plus';
  return null;
}

const NORMAL_COOLDOWNS = {
  minor: 10000,
  '20s': 5000,
  '30plus': 5000
};

const SPAM_COOLDOWN = 30000;       // 30 detik kalau kena spam detection
const SPAM_WINDOW = 60000;         // 1 menit — jendela deteksi spam
const SPAM_THRESHOLD = 3;          // 3 skip dalam 1 menit = spam
const COOLDOWN_CLEANUP_DELAY = 40000; // bersihin state setelah 40 detik

export class PoolService {
  constructor() {
    this.pool = new Map();
    // Set (insertion-order = FIFO) — array+filter O(n) per hapus → O(n²) agregat.
    // Terbukti di simulasi 100K: addToPool 44.6s; dengan Set menjadi O(1)/op.
    this.waitingQueue = new Set();
    // Pool Minor: partner sama tidak boleh di-match ulang dalam N jam (putus kesinambungan grooming)
    this.rematchWindowMs = (config.MINOR_REMATCH_HOURS || 24) * 3600_000;
    this.buckets = new Map();
    this.skipCooldowns = new Map();
    this.skipHistory = new Map();
    // Hitung kandidat _priority per bucket — pass priority hanya dijalankan
    // kalau benar ada isinya (P1.4 lazy findMatch).
    this.priorityCounts = new Map();
    this._lock = Promise.resolve();
  }

  _bucketKey(language, ageBracket) {
    return `${language}:${ageBracket}`;
  }

  /** Shutdown — bersihkan state antrean (tidak ada interval global: skip
   *  cooldown memakai setTimeout per-user). */
  stop() {
    this.pool.clear();
    this.buckets.clear();
    this.waitingQueue.clear();
    this.skipCooldowns.clear();
    this.skipHistory.clear();
  }

  _cleanupSkipHistory(userId) {
    const now = Date.now();
    const history = this.skipHistory.get(userId);
    if (!history) return;
    const filtered = history.filter(t => now - t < SPAM_WINDOW);
    if (filtered.length > 0) {
      this.skipHistory.set(userId, filtered);
    } else {
      this.skipHistory.delete(userId);
    }
  }

  _isSpamSkipping(userId) {
    this._cleanupSkipHistory(userId);
    const history = this.skipHistory.get(userId);
    return history && history.length >= SPAM_THRESHOLD;
  }

  setSkipCooldown(userId, bracket) {
    // Catat skip ke history
    const now = Date.now();
    const history = this.skipHistory.get(userId) || [];
    history.push(now);
    this.skipHistory.set(userId, history);

    // Cek spam: 3 skip dalam 1 menit?
    const isSpam = this._isSpamSkipping(userId);
    const duration = isSpam ? SPAM_COOLDOWN : (NORMAL_COOLDOWNS[bracket] || 5000);

    this.skipCooldowns.set(userId, now + duration);
    setTimeout(() => this.skipCooldowns.delete(userId), Math.max(duration + 5000, COOLDOWN_CLEANUP_DELAY));
  }

  getSkipCooldown(userId) {
    const expiresAt = this.skipCooldowns.get(userId);
    if (!expiresAt) return 0;
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      this.skipCooldowns.delete(userId);
      return 0;
    }
    return remaining;
  }

  isInCooldown(userId) {
    return this.getSkipCooldown(userId) > 0;
  }

  isSpamSkipping(userId) {
    this._cleanupSkipHistory(userId);
    const history = this.skipHistory.get(userId);
    return history && history.length >= SPAM_THRESHOLD;
  }

  _acquireLock() {
    let release;
    const prev = this._lock;
    this._lock = new Promise(resolve => { release = resolve; });
    return prev.then(() => release);
  }

  async addToPool(user, isPriority = false) {
    const release = await this._acquireLock();
    try {
      this._removeFromPool(user.user_id);
      const sanitized = sanitizeUser(user);
      sanitized._priority = isPriority;
      sanitized._ageBracket = getAgeBracket(user.age) || '20s';
      this.pool.set(user.user_id, sanitized);
      this.waitingQueue.add(user.user_id);

      const key = this._bucketKey(sanitized.language, sanitized._ageBracket);
      if (!this.buckets.has(key)) {
        this.buckets.set(key, new Map());
      }
      this.buckets.get(key).set(user.user_id, sanitized);
      if (isPriority) this.priorityCounts.set(key, (this.priorityCounts.get(key) || 0) + 1);
    } finally {
      release();
    }
  }

  _removeFromPool(userId) {
    const user = this.pool.get(userId);
    if (user) {
      const key = this._bucketKey(user.language, user._ageBracket);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.delete(userId);
      if (user._priority) {
        const c = (this.priorityCounts.get(key) || 0) - 1;
        if (c > 0) this.priorityCounts.set(key, c); else this.priorityCounts.delete(key);
      }
    }
    this.pool.delete(userId);
    this.waitingQueue.delete(userId);
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
      const bracket = getAgeBracket(user.age) || '20s';
      const key = this._bucketKey(sanitizedUser.language, bracket);
      const bucket = this.buckets.get(key);
      if (!bucket || bucket.size === 0) return null;

      const tryCandidate = (candidateId, candidate) => {
        if (candidateId === user.user_id) return null;
        // P1.3 — anti cross-bracket fail-closed: isi bucket harus bracket yg
        // sama. Pemisahan bucket adalah barrier utama; checkAgeMatch hanya
        // mengecek range masing-masing (POV-adult #7), jadi assertion ini
        // defense-in-depth bila bucket pernah tercampur.
        if (candidate._ageBracket !== bracket) return null;
        if (!this.checkGenderMatch(sanitizedUser, candidate)) return null;
        if (!this.checkAgeMatch(sanitizedUser, candidate)) return null;
        // Pool Minor: jangan match ulang partner sama dalam rematchWindowMs
        if (bracket === 'minor' || candidate._ageBracket === 'minor') {
          if (hasRecentMatch(hashPairId(user.user_id, candidateId), this.rematchWindowMs)) return null;
        }
        return { ...candidate, _matchedWithPriority: candidate._priority };
      };

      // P1.4 — lazy 2-pass TANPA membangun array kandidat penuh (array build
      // = O(bucket)/panggilan → O(n²) agregat; terukur 829s fase match @100K).
      // Pass priority hanya kalau bucket memang punya isinya (priorityCounts),
      // lalu stop di kandidat pertama yg lolos → O(1) rata-rata.
      if ((this.priorityCounts.get(key) || 0) > 0) {
        for (const [candidateId, candidate] of bucket) {
          if (!candidate._priority) continue;
          const m = tryCandidate(candidateId, candidate);
          if (m) return m;
        }
      }
      for (const [candidateId, candidate] of bucket) {
        if (candidate._priority) continue;
        const m = tryCandidate(candidateId, candidate);
        if (m) return m;
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
    // Default mengikuti bracket (bukan 18 — pool minor harus match sesama minor)
    const range = (u) => {
      const b = AGE_BRACKETS[u._ageBracket];
      return { min: u.age_min ?? b?.min ?? 18, max: u.age_max ?? b?.max ?? 99 };
    };
    const a = range(userA);
    const b = range(userB);
    return (userA.age >= a.min && userA.age <= a.max &&
            userB.age >= b.min && userB.age <= b.max);
  }

  getPoolSize() { return this.pool.size; }

  getUser(userId) { return this.pool.get(userId); }

  isInPool(userId) { return this.pool.has(userId); }

  getBracketSize(bracket) {
    let count = 0;
    for (const [key, bucket] of this.buckets) {
      if (key.endsWith(`:${bracket}`)) count += bucket.size;
    }
    return count;
  }

  getPoolProfiles() {
    const profiles = [];
    for (const user of this.pool.values()) {
      profiles.push({
        anonymous_id: user.anonymous_id,
        age: user.age,
        gender: user.gender,
        language: user.language,
        preference: user.preference,
        ageBracket: user._ageBracket
      });
    }
    return profiles;
  }
}

/**
 * Trust System — level kepercayaan user (P1: sekarang benar-benar dipakai).
 *
 * | Level    | Syarat                          | Foto / Voice            |
 * |----------|---------------------------------|-------------------------|
 * | shadow   | user baru (<3 sesi selesai)     | ❌ terkunci              |
 * | verified | >=3 sesi selesai                | ✅ aktif                 |
 * | flagged  | bracket-breach / report underage| ❌ terkunci permanen     |
 *
 * `resolveTrust()` membaca DB (kolom user_profiles.trust_level + sessions_completed)
 * dengan cache 30 detik supaya tidak query tiap pesan/foto.
 */
import { getUserProfile } from '../database/db.js';

const TRUST_LEVELS = {
  SHADOW: 'shadow',
  VERIFIED: 'verified',
  FLAGGED: 'flagged'
};

const SHADOW_SESSIONS_REQUIRED = 3;
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 10_000;

/** userId -> { level, at } */
const cache = new Map();

export function getTrustLevel(profile) {
  if (!profile) return TRUST_LEVELS.SHADOW;
  if (profile.trust_level === 'flagged') return TRUST_LEVELS.FLAGGED;
  if ((profile.sessions_completed || 0) >= SHADOW_SESSIONS_REQUIRED) return TRUST_LEVELS.VERIFIED;
  return TRUST_LEVELS.SHADOW;
}

export function isFullyTrusted(profile) {
  return getTrustLevel(profile) === TRUST_LEVELS.VERIFIED;
}

export function isFlagged(profile) {
  return getTrustLevel(profile) === TRUST_LEVELS.FLAGGED;
}

export function isShadowRestricted(profile) {
  const level = getTrustLevel(profile);
  return level === TRUST_LEVELS.SHADOW || level === TRUST_LEVELS.FLAGGED;
}

/**
 * Level trust aktual user (DB + cache). Gagal baca DB → shadow (fail-closed).
 */
export function resolveTrust(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.level;

  let level = TRUST_LEVELS.SHADOW;
  try {
    level = getTrustLevel(getUserProfile(userId));
  } catch (e) {
    level = TRUST_LEVELS.SHADOW;
  }

  if (cache.size > CACHE_MAX_ENTRIES) cache.clear();
  cache.set(userId, { level, at: Date.now() });
  return level;
}

/** Bisa kirim foto/voice? shadow & flagged tidak. */
export function canUseMedia(userId) {
  return resolveTrust(userId) === TRUST_LEVELS.VERIFIED;
}

export function clearTrustCache(userId) {
  if (userId === undefined || userId === null) cache.clear();
  else cache.delete(userId);
}

export function trustCacheSize() {
  return cache.size;
}

export function stop() {
  cache.clear();
}

export { TRUST_LEVELS, SHADOW_SESSIONS_REQUIRED, CACHE_TTL_MS };

/**
 * Privacy Utility — Anonymize user data
 * Ensures user identity is hidden from partners
 */

import crypto from 'crypto';

const HASH_SECRET = process.env.HASH_SECRET || 'randomchat_secret_key';

/**
 * Hash Telegram user ID to create anonymous ID
 * @param {number} userId - Telegram user ID
 * @returns {string} - Anonymous ID (e.g., "Anon-7A3B")
 */
export function anonymizeUserId(userId) {
  const hash = crypto
    .createHash('sha256')
    .update(String(userId) + HASH_SECRET)
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();
  
  return `Anon-${hash}`;
}

/**
 * Get public profile data (only show allowed fields)
 * @param {Object} user - Full user object
 * @param {Object} config - Config with SHOW_PROFILE settings
 * @returns {Object} - Sanitized profile
 */
export function getPublicProfile(user, config) {
  const publicFields = config?.ANONYMITY?.SHOW_PROFILE || ['age', 'gender', 'location', 'language', 'preference'];
  
  const profile = {};
  for (const field of publicFields) {
    if (user[field] !== undefined) {
      profile[field] = user[field];
    }
  }
  
  // Add anonymous ID
  profile.anonymous_id = anonymizeUserId(user.user_id);
  
  return profile;
}

/**
 * Sanitize user object before storing in pool
 * @param {Object} user - Full user object
 * @returns {Object} - Sanitized user (no Telegram details)
 */
export function sanitizeUser(user) {
  return {
    user_id: user.user_id,
    // Don't store name - use anonymous ID instead
    anonymous_id: anonymizeUserId(user.user_id),
    age: user.age,
    gender: user.gender,
    location: user.location,
    language: user.language,
    preference: user.preference,
    gender_prefs: user.gender_prefs,
    age_min: user.age_min,
    age_max: user.age_max,
    is_premium: user.is_premium
  };
}

/**
 * Check if message contains personal info
 * @param {string} text - Message text
 * @returns {Object} - { safe: boolean, reason: string }
 */
export function checkPersonalInfo(text) {
  const patterns = [
    { pattern: /(\+62|62|0)\d{9,12}/, reason: 'phone number' },
    { pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}/, reason: 'credit card' },
    { pattern: /@[\w]+/g, reason: 'username' },
    { pattern: /t\.me\/[\w]+/g, reason: 'Telegram link' },
    { pattern: /whatsapp/i, reason: 'WhatsApp' },
    { pattern: /instagram/i, reason: 'Instagram' },
    { pattern: /facebook/i, reason: 'Facebook' }
  ];
  
  for (const { pattern, reason } of patterns) {
    if (pattern.test(text)) {
      return { safe: false, reason };
    }
  }
  
  return { safe: true };
}
/**
 * Privacy Utility — Anonymize user data
 * Ensures user identity is hidden from partners
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import { digitizeLookalikes } from './leet.js';
dotenv.config();

const HASH_SECRET = process.env.HASH_SECRET;

if (!HASH_SECRET) {
  console.error('❌ FATAL: HASH_SECRET environment variable is required.');
  console.error('   Set it via: export HASH_SECRET="your-secure-random-string"');
  process.exit(1);
}

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
 * Hash pasangan user (canonical — urutan tidak berpengaruh).
 * Dipakai untuk cooldown re-match partner (P1) dan pair_key evidence.
 * @returns {string} hex 32 char
 */
export function hashPairId(a, b) {
  const [low, high] = [String(a), String(b)].sort();
  return crypto
    .createHash('sha256')
    .update(`${low}:${high}:${HASH_SECRET}`)
    .digest('hex')
    .substring(0, 32);
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
  profile._ageBracket = user._ageBracket;
  profile._ageVerified = user._ageVerified;
  profile.trust_level = user.trust_level;
  
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
    is_premium: user.is_premium,
    _ageBracket: user._ageBracket,
    _ageVerified: user._ageVerified,
    trust_level: user.trust_level
  };
}

/**
 * Check if message contains personal info
 * @param {string} text - Message text
 * @returns {Object} - { safe: boolean, reason: string }
 */
export function checkPersonalInfo(text) {
  const lower = text.toLowerCase();
  // Anti-leet: 08l234567890 → 081234567890 sebelum regex digit
  const digitized = digitizeLookalikes(text);
  // Anti-bypass (POV-evader): strip SEMUA non-digit → "0812.3456.7890",
  // "62 812 3456 7890", "0 8 1 2 3 4 5 6 7 8 9 0" tetap kena regex HP/kartu.
  const digitsOnly = text.replace(/[^\d+]/g, '');

  // Sensitive personal data (high risk) → personal_info category
  const sensitivePatterns = [
    { pattern: /(\+62|62|0)\d{8,15}/, reason: 'phone number', category: 'personal_info', useDigitized: true, useDigitsOnly: true },
    { pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}/, reason: 'credit card', category: 'personal_info', useDigitized: true, useDigitsOnly: true },
    { pattern: /email\b|e-mail|@\w+\.(com|co\.id|net|org|id)/i, reason: 'email', category: 'personal_info' }
  ];

  // Platform contact sharing → migration category
  const platformPatterns = [
    { pattern: /@[\w.]{2,}/g, reason: 'username', category: 'migration' },
    { pattern: /t\.me\/(?:joinchat\/)?[\w]+/g, reason: 'Telegram link', category: 'migration' },
    { pattern: /whatsapp|wa\.me|wa\/|wa saya|wa aku/i, reason: 'WhatsApp', category: 'migration' },
    { pattern: /instagram|ig\.|ig saya|ig aku|ig gw/i, reason: 'Instagram', category: 'migration' },
    { pattern: /facebook|fb\.|fb saya|fb aku/i, reason: 'Facebook', category: 'migration' },
    { pattern: /discord|dc\.|dc saya|dc aku|discord saya/i, reason: 'Discord', category: 'migration' },
    { pattern: /line\b|line saya|line aku|line-id|line gw/i, reason: 'Line', category: 'migration' },
    { pattern: /signal|signal\.|signal saya|signal aku/i, reason: 'Signal', category: 'migration' },
    { pattern: /snapchat|snap\.|sc saya|sc aku|snap gw/i, reason: 'Snapchat', category: 'migration' },
    { pattern: /tiktok|tt\.|tt saya|tt aku|tt gw/i, reason: 'TikTok', category: 'migration' },
    { pattern: /twitter|x\.com|twit/i, reason: 'X / Twitter', category: 'migration' },
    { pattern: /telegram|tele\.me/i, reason: 'Telegram', category: 'migration' }
  ];

  // "Ajak keluar" phrases → migration category
  const invitePatterns = [
    { pattern: /(ketemu|temuan|kopi.?yuk|kopi.?dulu|kopi.?aja|ngopi|main.?ke|datang.?ke|janjian|meetup|meet\s*irl)/i, reason: 'ajakan ketemu', category: 'migration' },
    { pattern: /(?<!nice to\s)\bmeet\s+(at|us|up|me|there|here|tomorrow|tonight)\b/i, reason: 'ajakan ketemu', category: 'migration' },
    { pattern: /(pindah|lanjut|move|lanjutin)\s.*(wa|ig|tele|line|dc|discord|chat)/i, reason: 'ajakan pindah platform', category: 'migration' },
    { pattern: /(wa|ig|line|dc|tele|email).*(aku|saya|gue|gw)/i, reason: 'share kontak', category: 'migration' },
    { pattern: /(sini|sana)\s*(wa|ig|line|tele|dc)/i, reason: 'ajakan pindah chat', category: 'migration' },
    { pattern: /dm\s*(aku|saya|gue|gw|sini|sana)/i, reason: 'ajakan DM', category: 'migration' },
    { pattern: /\bcp\b.*(wa|ig|line|tele)/i, reason: 'contact person', category: 'migration' },
    { pattern: /(share|kirim|kirimkan)\s*(lokasi|location|titik)/i, reason: 'share lokasi', category: 'migration' },
    { pattern: /(zoom|skype|telepon|telpon)|\b(call|tele)\s*(me|aku|saya|us|kita)\b/i, reason: 'ajakan call/telepon', category: 'migration' }
  ];

  // Kumpulkan SEMUA kategori yang match (bukan kategori pertama saja) —
  // POV-minor #2: pesan campuran "0812... ketemu" harus memicu JUGA freeze
  // migration di minor pool, bukan hanya personal_info strike.
  const found = [];
  const push = (reason, category) => {
    if (!found.some(f => f.reason === reason && f.category === category)) found.push({ reason, category });
  };

  for (const { pattern, reason, category, useDigitized, useDigitsOnly } of sensitivePatterns) {
    if (pattern.test(text)
      || (useDigitized && pattern.test(digitized))
      || (useDigitsOnly && pattern.test(digitsOnly))) {
      push(reason, category);
    }
  }

  for (const { pattern, reason, category } of platformPatterns) {
    if (pattern.test(text)) {
      push(reason, category);
    }
  }

  for (const { pattern, reason, category } of invitePatterns) {
    if (pattern.test(lower)) {
      push(reason, category);
    }
  }

  if (!found.length) return { safe: true, category: null };
  // `category`/`reason` pertama = prioritas (kompatibel dgn pemanggil lama);
  // `all` = daftar lengkap utk enforcement multi-kategori.
  return { safe: false, reason: found[0].reason, category: found[0].category, all: found };
}

export function getMigrationWarning(reason) {
  const warnings = {
    'phone number': '⚠️ Nomor telepon tidak boleh dibagikan. Pertemuan fisik dengan orang asing sangat berbahaya.',
    'username': '⚠️ Username media sosial tidak boleh dibagikan. Lawan bicaramu tetap anonim untuk alasan keamanan.',
    'WhatsApp': '⚠️ Ajakan pindah ke WhatsApp terdeteksi. Pindah ke platform lain menghilangkan proteksi anonimitas.',
    'Instagram': '⚠️ Ajakan pindah ke Instagram terdeteksi. Identitas aslimu bisa terlacak.',
    'Line': '⚠️ Ajakan pindah ke Line terdeteksi. Pertahankan anonimitasmu di sini.',
    'Discord': '⚠️ Ajakan pindah ke Discord terdeteksi. Jangan bagikan kontak ke orang asing.',
    'Telegram link': '⚠️ Link Telegram terdeteksi. Jangan bagikan kontak ke orang asing.',
    'ajakan ketemu': '⚠️ Ajakan bertemu terdeteksi. Bertemu dengan orang asing dari internet sangat berisiko.',
    'ajakan pindah platform': '⚠️ Ajakan pindah platform terdeteksi. Anonimitasmu hilang di luar sini.'
  };
  return warnings[reason] || `⚠️ Informasi kontak terdeteksi: ${reason}. Ini demi keamananmu.`;
}
import dotenv from 'dotenv';
dotenv.config();

export default {
  // Bot Configuration
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  
  // Admin
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [746661594],
  
  // Database
  DB_PATH: process.env.DB_PATH || './data.db',
  
  // Matchmaking
  MAX_WAIT_TIME: parseInt(process.env.MAX_WAIT_TIME || '300'),
  MIN_AGE: parseInt(process.env.MIN_AGE || '18'),
  MAX_AGE: parseInt(process.env.MAX_AGE || '99'),
  
  // Session
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT || '3600'),

  // Moderation & retention (P1)
  // Pool Minor: partner yang sama tidak boleh di-match ulang dalam N jam
  MINOR_REMATCH_HOURS: parseInt(process.env.MINOR_REMATCH_HOURS || '24'),
  // Bukti (transcript terenkripsi) disimpan N hari, lalu dipangkas otomatis
  EVIDENCE_TTL_DAYS: parseInt(process.env.EVIDENCE_TTL_DAYS || '30'),
  EVIDENCE_MAX_MESSAGES: parseInt(process.env.EVIDENCE_MAX_MESSAGES || '20'),
  
  // Privacy Settings
  ANONYMITY: {
    // Hash Telegram ID to create anonymous ID (enforced at startup via privacy.js)
    HASH_SECRET: process.env.HASH_SECRET,
    
    // Hide these from partner
    HIDE_USERNAME: true,
    HIDE_USER_ID: true,
    HIDE_PHONE: true,
    HIDE_BIO: true,
    
    // Only show profile info
    SHOW_PROFILE: ['age', 'gender', 'location', 'language']
  },
  
  // Messages
  WELCOME_MESSAGE: `👋 Halo! Selamat datang di *RandomChatZ*

🔒 Privasi kamu terjamin — identitas disamarkan.

*Pilih bahasa kamu:*`,
  
  PARTNER_FOUND_MESSAGE: `*🎉 Partner ditemukan!*

📝 Info partner:
• Usia: {age}
• Gender: {gender}
• Lokasi: {location}
• Bahasa: {language}

💬 Mulai chat sekarang!
⚠️ Jangan share data pribadi (no sharing personal info)

Ketik /skip untuk keluar.`,
  
  PARTNER_LEFT_MESSAGE: `*👋 Partner keluar dari chat.*

Ketik /start untuk cari chat baru.`,
  
  LANGUAGE_OPTIONS: {
    'id': '🇮🇩 Indonesia',
    'en': '🇺🇸 English'
  },
  
  GENDER_OPTIONS: {
    'M': '👨 Male',
    'F': '👩 Female',
  },
  
  PREFERENCE_OPTIONS: {
    'random': '🎲 Random'
  }
};
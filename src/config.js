import dotenv from 'dotenv';
dotenv.config();

export default {
  // Bot Configuration
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  
  // Database
  DB_PATH: process.env.DB_PATH || './data.db',
  
  // Matchmaking
  MAX_WAIT_TIME: parseInt(process.env.MAX_WAIT_TIME || '300'),
  MIN_AGE: parseInt(process.env.MIN_AGE || '18'),
  MAX_AGE: parseInt(process.env.MAX_AGE || '99'),
  
  // Session
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT || '3600'),
  
  // Telegram Stars Pricing
  STAR_PRICES: {
    '18+': parseInt(process.env.STAR_PRICE_18 || '50')
  },
  
  PREMIUM_FEATURES: {
    '18+': { 
      name: '🔞 18+ Mode', 
      price: 50,
      description: 'Unlock chat with 18+ users'
    }
  },
  
  // Privacy Settings
  ANONYMITY: {
    // Hash Telegram ID to create anonymous ID
    HASH_SECRET: process.env.HASH_SECRET || 'randomchat_secret_key',
    
    // Hide these from partner
    HIDE_USERNAME: true,
    HIDE_USER_ID: true,
    HIDE_PHONE: true,
    HIDE_BIO: true,
    
    // Only show profile info
    SHOW_PROFILE: ['age', 'gender', 'location', 'language', 'preference']
  },
  
  // Messages
  WELCOME_MESSAGE: `👋 Halo! Welcome ke *RandomChat*

Saya akan mencarikanmu teman chat secara random!
🔒 Privasi kamu terjamin - identitas disamarkan.

*Berapa usia kamu?*`,
  
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
    'en': '🇺🇸 English',
    'ja': '🇯🇵 日本語',
    'ko': '🇰🇷 한국어',
    'zh': '🇨🇳 中文'
  },
  
  GENDER_OPTIONS: {
    'M': '👨 Male',
    'F': '👩 Female',
    'O': '🌈 Other'
  },
  
  PREFERENCE_OPTIONS: {
    'random': '🎲 Random — Gratis!',
    '18+': '🔞 18+ Only — ⭐ 50 Stars'
  }
};
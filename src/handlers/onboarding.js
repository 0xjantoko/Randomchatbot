import { Keyboard } from 'grammy';
import { anonymizeUserId } from '../utils/privacy.js';
import { t, tLang } from '../locales/index.js';
import { incrementReferralCount, getReferralCount, updateUserProfile, getModerationInfo } from '../database/db.js';
import { notifyAchievements, notifyLevelUp } from './gamification.js';
import { getAgeBracket } from '../services/pool.js';
import config from '../config.js';

const genderKeyboard = new Keyboard()
  .text('👨 Male')
  .text('👩 Female')
  .row();

const INDONESIAN_NUMBERS = {
  'nol': 0, 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4,
  'lima': 5, 'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9,
  'sepuluh': 10, 'sebelas': 11, 'seratus': 100
};

function parseIndonesianNumber(text) {
  const cleaned = text.toLowerCase().replace(/\b(dengan|adalah|umur|usia|saya|aku)\b/g, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w);
  
  if (words.length === 0) return NaN;
  
  // Single word: "tujuh" → 7, "sebelas" → 11, "seratus" → 100
  if (words.length === 1) {
    if (INDONESIAN_NUMBERS[words[0]] !== undefined) return INDONESIAN_NUMBERS[words[0]];
    // Try direct parsing for English numbers too
    const num = parseInt(words[0]);
    if (!isNaN(num)) return num;
    return NaN;
  }
  
  // Two words: "dua belas" → 12, "dua puluh" → 20
  if (words.length === 2) {
    const first = INDONESIAN_NUMBERS[words[0]];
    if (first === undefined) return parseInt(words.join('')) || NaN;
    
    if (words[1] === 'belas') return first + 10;
    if (words[1] === 'puluh') return first * 10;
    
    const second = INDONESIAN_NUMBERS[words[1]];
    if (second !== undefined && first === 1) return 10 + second;
    return parseInt(words.join('')) || NaN;
  }
  
  // Three words: "dua puluh satu" → 21
  if (words.length === 3 && words[1] === 'puluh') {
    const tens = INDONESIAN_NUMBERS[words[0]];
    const ones = INDONESIAN_NUMBERS[words[2]];
    if (tens !== undefined && ones !== undefined) return tens * 10 + ones;
  }
  
  return parseInt(cleaned.replace(/\s+/g, '')) || NaN;
}

export function registerOnboardingHandlers(bot, { config, poolService, sessionService, xpService, achievementService }) {
  
  // Handle text messages during onboarding
  // WAJIB next() saat tidak menangani — grammY: return tanpa next MENELAN pesan
  // dan mematikan semua handler berikutnya (chat.js, command, media).
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = ctx.session.state;
    const step = ctx.session.step;

    if (text.startsWith('/')) return next();
    if (!state || !state.startsWith('onboarding_')) return next();

    switch (step) {
      case 'language': await handleLanguage(ctx, text); break;
      case 'age': await handleAge(ctx, text); break;
      case 'age_verify': await handleAgeVerify(ctx, text); break;
      case 'gender': await handleGender(ctx, text); break;
      case 'location': await handleLocation(ctx, text); break;
      default: return next();
    }
  });
  
  bot.command('cancel', async (ctx) => {
    const state = ctx.session.state;
    if (!state || !state.startsWith('onboarding_')) return;
    
    ctx.session.state = null;
    ctx.session.step = null;
    
    await ctx.reply(t(ctx, 'onboarding.cancel'), { parse_mode: 'Markdown' });
  });
  
  // ============ HANDLERS ============
  
  async function handleLanguage(ctx, text) {
    const langMap = { 'Indonesia': 'id', 'English': 'en', '日本語': 'ja', '한국어': 'ko', '中文': 'zh' };
    const lang = langMap[Object.keys(langMap).find(k => text.includes(k))] || 'en';
    
    ctx.session.language = lang;
    ctx.session.step = 'age';
    ctx.session.state = 'onboarding_age';
    
    await ctx.reply(t(ctx, 'onboarding.ask_age'), {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true }
    });
  }
  
  async function handleAge(ctx, text) {
    const age = parseInt(text);
    if (isNaN(age) || age < config.MIN_AGE || age > config.MAX_AGE) {
      await ctx.reply(t(ctx, 'onboarding.invalid_age'));
      return;
    }
    
    ctx.session.age = age;
    ctx.session._age_claimed = age;
    ctx.session._age_verify_trap = Math.random() < 0.5 ? 'word' : 'year';
    ctx.session.step = 'age_verify';
    ctx.session.state = 'onboarding_age_verify';
    
    const traps = {
      word: '🔎 Verifikasi: Ketik usia kamu dalam huruf.\nContoh: "delapan belas"',
      year: '🔎 Verifikasi: Tahun berapa kamu lahir?\nContoh: "2008"'
    };
    
    await ctx.reply(traps[ctx.session._age_verify_trap], { parse_mode: 'Markdown' });
  }

  async function handleAgeVerify(ctx, text) {
    const claimedAge = ctx.session._age_claimed;
    const trapType = ctx.session._age_verify_trap;
    let consistent = false;

    if (trapType === 'word') {
      const parsed = parseIndonesianNumber(text);
      consistent = parsed === claimedAge;
    } else {
      const birthYear = parseInt(text.replace(/\D/g, ''));
      if (!isNaN(birthYear) && birthYear > 1900 && birthYear < 2026) {
        const calculatedAge = 2026 - birthYear;
        consistent = Math.abs(calculatedAge - claimedAge) <= 1;
      }
    }

    if (!consistent) {
      console.log(`⚠️ Age verification failed for user ${ctx.from.id}: claimed=${claimedAge}, trap=${trapType}, answer="${text}"`);
      ctx.session._age_verified = false;
    } else {
      ctx.session._age_verified = true;
    }

    ctx.session.step = 'gender';
    ctx.session.state = 'onboarding_gender';
    
    await ctx.reply(t(ctx, 'onboarding.ask_gender'), {
      parse_mode: 'Markdown',
      reply_markup: genderKeyboard
    });
  }
  
  async function handleGender(ctx, text) {
    let gender = text.includes('Male') ? 'M' : 'F';
    ctx.session.gender = gender;
    ctx.session.step = 'location';
    ctx.session.state = 'onboarding_location';
    
    await ctx.reply(t(ctx, 'onboarding.ask_location'), { parse_mode: 'Markdown' });
  }
  
  async function handleLocation(ctx, text) {
    const location = text.trim();
    
    if (location.length < 2 || location.length > 50) {
      await ctx.reply(t(ctx, 'onboarding.invalid_location'));
      return;
    }
    
    ctx.session.location = location;

    const referredBy = ctx.session.referred_by;

    const ageVerified = ctx.session._age_verified === true;
    const claimedAge = ctx.session._age_claimed || ctx.session.age;

    let bracket = getAgeBracket(claimedAge) || 'minor';

    // Moderation gate: quarantine = tidak boleh masuk pool; bracket_locked = ratchet permanen
    try {
      const modInfo = getModerationInfo(ctx.from.id);
      if (modInfo?.quarantined_at) {
        console.log(`🛑 Quarantined user ${ctx.from.id} blocked from pool (${modInfo.quarantine_reason})`);
        ctx.session.state = null;
        await ctx.reply(t(ctx, 'moderation.quarantine_blocked'), { parse_mode: 'Markdown' });
        return;
      }
      if (modInfo?.bracket_locked === 'minor' || modInfo?.trust_level === 'flagged') {
        console.log(`🔒 User ${ctx.from.id} locked to minor pool (locked=${modInfo?.bracket_locked}, trust=${modInfo?.trust_level})`);
        bracket = 'minor';
      }
    } catch (e) {}

    // Age verify failed → force minor bracket
    if (!ageVerified && bracket !== 'minor') {
      console.log(`🚨 User ${ctx.from.id} age verify FAILED (claimed ${claimedAge}) → forced to minor bracket`);
      bracket = 'minor';
    }

    const bracketForced = bracket !== getAgeBracket(claimedAge);
    const trustLevel = (!ageVerified && claimedAge >= 18) || bracketForced ? 'flagged' : 'shadow';

    // Persist trust level to DB
    try {
      updateUserProfile(ctx.from.id, {
        trust_level: trustLevel,
        age_verified: ageVerified ? 1 : 0
      });
    } catch (e) {}

    const user = {
      user_id: ctx.from.id,
      name: ctx.from.first_name,
      age: claimedAge,
      gender: ctx.session.gender,
      location: location,
      language: ctx.session.language,
      _ageBracket: bracket,
      _ageVerified: ageVerified,
      trust_level: trustLevel
    };
    
    const hasPriority = (ctx.session.inventory?.priority_match || 0) > 0;
    await poolService.addToPool(user, hasPriority);
    
    ctx.session.state = 'waiting';
    ctx.session.user = user;
    ctx.session.anonymous_id = anonymizeUserId(ctx.from.id);

    // Process referral reward if this user was referred
    if (referredBy && referredBy !== user.user_id) {
      await processReferral(ctx, referredBy, user);
    }
    
    await ctx.reply(
      t(ctx, 'onboarding.success', {
        lang: config.LANGUAGE_OPTIONS[user.language] || user.language,
        age: user.age,
        gender: user.gender,
        location: user.location
      }),
      { parse_mode: 'Markdown' }
    );
    
    await tryMatch(ctx, user);
  }
  
  async function processReferral(ctx, referrerId, newUser) {
    try {
      incrementReferralCount(referrerId);
      const count = getReferralCount(referrerId);

      const inviterLang = 'id';
      await xpService.addXP(referrerId, 'session', {}, 5);
      const newAchs = achievementService.check(referrerId, 'session', { profile: xpService.getProfile(referrerId) });
      await notifyAchievements(bot.api, referrerId, newAchs, inviterLang);

      await bot.api.sendMessage(referrerId,
        tLang(inviterLang, 'referral.inviter_reward', { count }),
        { parse_mode: 'Markdown' }
      );

      const lang = ctx.session.language || 'id';
      ctx.session.inventory.xp_booster = { expires_at: Date.now() + 2 * 60 * 60 * 1000 };

      await ctx.reply(
        t(ctx, 'referral.invitee_reward'),
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Referral reward error:', e.message);
    }
  }

  async function tryMatch(ctx, user) {
    const match = await poolService.findMatch(user);

    if (match) {
      await poolService.removeFromPool(user.user_id);
      await poolService.removeFromPool(match.user_id);

      await sessionService.createSession(user.user_id, match.user_id, user, match);

      for (const uid of [user.user_id, match.user_id]) {
        const booster = ctx.session.inventory?.xp_booster;
        const xpMult = (booster && booster.expires_at > Date.now()) ? 2 : 1;
        const xpRes = xpService.addXP(uid, 'session', {}, xpMult);
        if (xpRes) {
          const lang = uid === user.user_id ? ctx.session.language : match.language;
          const newAchs = achievementService.check(uid, 'session', { profile: xpService.getProfile(uid) });
          await notifyAchievements(bot.api, uid, newAchs, lang);
          await notifyLevelUp(bot.api, uid, xpRes, lang);
        }
      }

      // Consume priority match if used by current user
      if (ctx.session.inventory?.priority_match > 0) {
        ctx.session.inventory.priority_match--;
      }
      
      await ctx.reply(
        t(ctx, 'onboarding.partner_found', {
          age: match.age,
          gender: match.gender,
          location: match.location,
          language: config.LANGUAGE_OPTIONS[match.language] || match.language
        }),
        { parse_mode: 'Markdown' }
      );
      
      return match;
    } else {
      await ctx.reply(t(ctx, 'onboarding.waiting'), { parse_mode: 'Markdown' });
    }
  }
}
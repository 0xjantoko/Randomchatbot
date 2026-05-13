/**
 * Onboarding handlers — Profile creation + Premium unlock
 */

import { Keyboard, InlineKeyboard } from 'grammy';
import { anonymizeUserId } from '../utils/privacy.js';

const genderKeyboard = new Keyboard()
  .text('👨 Male')
  .text('👩 Female')
  .row()
  .text('🌈 Other');

export function registerOnboardingHandlers(bot, { config, poolService, sessionService }) {
  
  // Handle text messages during onboarding
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = ctx.session.state;
    const step = ctx.session.step;
    
    if (text.startsWith('/')) return;
    if (!state || !state.startsWith('onboarding_')) return;
    
    switch (step) {
      case 'age': await handleAge(ctx, text); break;
      case 'gender': await handleGender(ctx, text); break;
      case 'location': await handleLocation(ctx, text); break;
      case 'language': await handleLanguage(ctx, text); break;
    }
  });
  
  // Handle callback queries
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('premium_select:')) {
      const preference = data.split(':')[1];
      await handlePremiumSelect(ctx, preference);
    } else if (data.startsWith('payment:')) {
      const parts = data.split(':');
      const action = parts[1];
      const preference = parts[2];
      if (action === 'buy') await handlePayment(ctx, preference);
      else if (action === 'verify') await handlePaymentVerify(ctx, preference);
    } else if (data.startsWith('gender_pref:')) {
      const genderPref = data.split(':')[1];
      await handleGenderPrefSelected(ctx, genderPref);
    } else if (data.startsWith('preference:')) {
      const preference = data.split(':')[1];
      if (preference === 'back') await showPreferenceSelection(ctx);
      else await handlePreferenceSelected(ctx, preference);
    }
    
    await ctx.answerCallbackQuery();
  });
  
  // ============ HANDLERS ============
  
  async function handleAge(ctx, text) {
    const age = parseInt(text);
    if (isNaN(age) || age < 1 || age > 99) {
      await ctx.reply('❌ Ketik angka valid (1-99):');
      return;
    }
    
    // Check if under 18
    ctx.session.isUnderage = age < 18;
    
    ctx.session.age = age;
    ctx.session.step = 'gender';
    ctx.session.state = 'onboarding_gender';
    
    // Different welcome for underage
    if (ctx.session.isUnderage) {
      await ctx.reply(
        `*👋 Welcome!*\n\n` +
        `Usia kamu: ${age} tahun\n` +
        `🔒 Kamu akan menggunakan mode *Random* (acak) saja.\n\n` +
        `*Pilih gender:*`,
        { parse_mode: 'Markdown', reply_markup: genderKeyboard }
      );
    } else {
      await ctx.reply('*Pilih gender:*', {
        parse_mode: 'Markdown',
        reply_markup: genderKeyboard
      });
    }
  }
  
  async function handleGender(ctx, text) {
    let gender = text.includes('Male') ? 'M' : text.includes('Female') ? 'F' : 'O';
    ctx.session.gender = gender;
    ctx.session.step = 'location';
    ctx.session.state = 'onboarding_location';
    
    await ctx.reply('*Ketik lokasi:* (kota)',
      { parse_mode: 'Markdown' }
    );
  }
  
  async function handleLocation(ctx, text) {
    ctx.session.location = text;
    ctx.session.step = 'language';
    ctx.session.state = 'onboarding_language';
    
    const langKeys = new Keyboard();
    for (const [code, label] of Object.entries(config.LANGUAGE_OPTIONS)) {
      langKeys.text(label);
      if (['id', 'en'].includes(code)) langKeys.row();
    }
    
    await ctx.reply('*Pilih bahasa:*', {
      parse_mode: 'Markdown',
      reply_markup: langKeys
    });
  }
  
  async function handleLanguage(ctx, text) {
    const langMap = { 'Indonesia': 'id', 'English': 'en', '日本語': 'ja', '한국어': 'ko', '中文': 'zh' };
    const lang = langMap[text.split(' ')[0]] || 'en';
    
    ctx.session.language = lang;
    ctx.session.step = 'preference';
    ctx.session.state = 'onboarding_preference';
    
    await showPreferenceSelection(ctx);
  }
  
  async function showPreferenceSelection(ctx, errorMsg = '') {
    const unlocked = ctx.session.unlocked || [];
    const isUnderage = ctx.session.isUnderage;
    
    const prefKeys = new InlineKeyboard();
    prefKeys.text('🎲 Random (Gratis)', 'preference:random');
    
    // Only show 18+ for users 18+
    if (!isUnderage) {
      prefKeys.row();
      prefKeys.text('🔞 18+ (⭐ 50)', unlocked.includes('18+') ? 'preference:18+' : 'premium_select:18+');
    }
    
    let msg = '*Pilih preferensi:*';
    if (isUnderage) {
      msg = '*🔒 Kamu berusia di bawah 18*\n\nHanya mode Random yang tersedia.\n\n*Pilih preferensi:*';
    }
    
    const finalMsg = errorMsg ? `*${errorMsg}*\n\n${isUnderage ? 'Hanya Random tersedia.' : ''}*Pilih preferensi:*` : msg;
    await ctx.reply(finalMsg, { parse_mode: 'Markdown', reply_markup: prefKeys });
  }
  
  async function showGenderPrefSelection(ctx) {
    const genderPrefKeys = new InlineKeyboard();
    genderPrefKeys.text('👩 Female', 'gender_pref:F');
    genderPrefKeys.text('👨 Male', 'gender_pref:M');
    genderPrefKeys.row();
    genderPrefKeys.text('🌈 Semua Gender', 'gender_pref:all');
    
    await ctx.editMessageText(
      `*👄 Pilih gender partner untuk 18+:*\n\nSiapa yang ingin kamu chat?`,
      { parse_mode: 'Markdown', reply_markup: genderPrefKeys }
    );
  }
  
  async function handlePremiumSelect(ctx, preference) {
    const unlocked = ctx.session.unlocked || [];
    if (unlocked.includes(preference)) {
      // Already unlocked, go to gender preference for 18+
      if (preference === '18+') {
        await showGenderPrefSelection(ctx);
        return;
      }
      await showPreferenceSelection(ctx);
      return;
    }
    
    const feature = config.PREMIUM_FEATURES[preference];
    const payKeys = new InlineKeyboard();
    payKeys.text(`⭐ Beli ${feature.price}`, `payment:buy:${preference}`);
    payKeys.row();
    payKeys.text('🔙', 'preference:back');
    
    await ctx.editMessageText(
      `*🔒 ${feature.name}*\n\n${feature.description}\n\nHarga: ⭐ ${feature.price}\n\nKlik untuk simulate payment:`,
      { parse_mode: 'Markdown', reply_markup: payKeys }
    );
  }
  
  async function handlePayment(ctx, preference) {
    const feature = config.PREMIUM_FEATURES[preference];
    const verifyKeys = new InlineKeyboard();
    verifyKeys.text('✅ Saya sudah membayar', `payment:verify:${preference}`);
    verifyKeys.row();
    verifyKeys.text('❌ Batal', 'preference:back');
    
    await ctx.editMessageText(
      `*💳 Pembayaran (Simulasi)*\n\n` +
      `1. Buka Settings > Stars\n` +
      `2. Beli ⭐ ${feature.price}\n` +
      `3. Klik bawah setelah membayar:\n\n(Simulation - click verify)`,
      { parse_mode: 'Markdown', reply_markup: verifyKeys }
    );
  }
  
  async function handlePaymentVerify(ctx, preference) {
    const feature = config.PREMIUM_FEATURES[preference];
    
    if (!ctx.session.unlocked) ctx.session.unlocked = [];
    ctx.session.unlocked.push(preference);
    
    // If 18+, ask for gender preference after unlock
    if (preference === '18+') {
      await ctx.editMessageText(
        `*✅ Berhasil di-unlock!*\n\n${feature.name} aktif!`,
        { parse_mode: 'Markdown' }
      );
      await showGenderPrefSelection(ctx);
      return;
    }
    
    await ctx.editMessageText(
      `*✅ Berhasil di-unlock!*\n\n${feature.name} aktif!\n\nSilakan pilih preferensi:`,
      { parse_mode: 'Markdown' }
    );
    await showPreferenceSelection(ctx);
  }
  
  async function handleGenderPrefSelected(ctx, genderPref) {
    ctx.session.gender_pref = genderPref;
    
    // Now proceed with preference selection
    const preference = '18+';
    await handlePreferenceSelected(ctx, preference);
  }
  
  async function handlePreferenceSelected(ctx, preference) {
    const userId = ctx.from.id;
    
    let genderPrefs = ['M', 'F', 'O'];
    const genderPref = ctx.session.gender_pref;
    
    // Custom gender preference for 18+ mode
    if (preference === '18+' && genderPref && genderPref !== 'all') {
      genderPrefs = [genderPref];
    }
    
    const user = {
      user_id: userId,
      name: ctx.from.first_name, // Only stored temporarily
      age: ctx.session.age,
      gender: ctx.session.gender,
      location: ctx.session.location,
      language: ctx.session.language,
      preference: preference,
      gender_prefs: genderPrefs,
      age_min: 18,
      age_max: 99,
      is_premium: preference !== 'random'
    };
    
    // Add to pool
    await poolService.addToPool(user);
    
    ctx.session.state = 'waiting';
    ctx.session.user = user;
    ctx.session.anonymous_id = anonymizeUserId(userId);
    
    // Show success with ANONYMOUS profile
    await ctx.editMessageText(
      `*✅ Berhasil!*\n\n` +
      `🔒 *Identitas tersamarkan*\n\n` +
      `📝 Profil (publik):\n` +
      `• Usia: ${user.age}\n` +
      `• Gender: ${user.gender}\n` +
      `• Lokasi: ${user.location}\n` +
      `• Bahasa: ${user.language}\n` +
      `• Preferensi: ${user.preference}\n\n` +
      `⏳ Mencari partner...`,
      { parse_mode: 'Markdown' }
    );
    
    // Try match
    await tryMatch(ctx, user);
  }
  
  async function tryMatch(ctx, user) {
    const match = await poolService.findMatch(user);
    
    if (match) {
      await poolService.removeFromPool(user.user_id);
      await poolService.removeFromPool(match.user_id);
      
      // Create session with anonymous profiles
      await sessionService.createSession(user.user_id, match.user_id, user, match);
      
      // Show ANONYMOUS partner info
      const partnerMsg = config.PARTNER_FOUND_MESSAGE
        .replace('{age}', match.age)
        .replace('{gender}', match.gender)
        .replace('{location}', match.location)
        .replace('{language}', config.LANGUAGE_OPTIONS[match.language] || match.language);
      
      await ctx.reply(partnerMsg, { parse_mode: 'Markdown' });
      
      // Get bot instance to notify partner (need to pass bot)
      return match;
    } else {
      await ctx.reply('⏳ Belum ketemu... Tunggu ya!\nKetik /cancel untuk cancel.');
    }
  }
}
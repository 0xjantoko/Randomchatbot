import { Keyboard, InlineKeyboard } from 'grammy';
import { t } from '../locales/index.js';

export function registerStartHandler(bot, { config, poolService, sessionService, xpService }) {
  bot.command('start', async (ctx) => {
    const userId = ctx.from.id;

    if (sessionService.isInSession(userId)) {
      await ctx.reply(t(ctx, 'start.already_in_session'), { parse_mode: 'Markdown' });
      return;
    }

    if (poolService.isInPool(userId)) {
      await ctx.reply(t(ctx, 'start.already_in_pool'), { parse_mode: 'Markdown' });
      return;
    }

    // Cek skip cooldown
    const cooldown = poolService.getSkipCooldown(userId);
    if (cooldown > 0) {
      const isSpam = poolService.isSpamSkipping(userId);
      let msg = isSpam
        ? `⚠️ *Skip berulang terdeteksi.*\nMohon tunggu *${cooldown} detik* sebelum mencari partner baru.`
        : `⏳ Mohon tunggu *${cooldown} detik* sebelum mencari partner baru.`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      return;
    }

    xpService.ensureProfile(userId);
    const profile = xpService.getProfile(userId);

    const inv = ctx.session?.inventory || {};
    ctx.session = {
      state: 'onboarding_language',
      step: 'language',
      inventory: inv
    };

    // Parse referral from deep link: t.me/bot?start=ref_USERID
    const match = ctx.match;
    if (match && typeof match === 'string' && match.startsWith('ref_')) {
      const referrerId = parseInt(match.replace('ref_', ''));
      if (referrerId && referrerId !== userId) {
        ctx.session.referred_by = referrerId;
      }
    }

    let welcomeMsg;
    if (profile && profile.level > 0) {
      const streakFire = profile.streak >= 7 ? '🔥' : profile.streak >= 3 ? '✨' : '';
      welcomeMsg = t(ctx, 'start.welcome_back', {
        level: profile.level,
        xp: profile.xp,
        streakFire,
        streak: profile.streak,
        sessions: profile.total_sessions,
        messages: profile.total_messages
      });
    } else {
      welcomeMsg = t(ctx, 'start.welcome_new');
    }

    const langKeys = new Keyboard();
    for (const [code, label] of Object.entries(config.LANGUAGE_OPTIONS)) {
      langKeys.text(label);
      if (['id', 'en'].includes(code)) langKeys.row();
    }

    await ctx.reply(welcomeMsg, {
      parse_mode: 'Markdown',
      reply_markup: langKeys
    });
  });

  bot.command('invite', async (ctx) => {
    const userId = ctx.from.id;
    const botUsername = ctx.me?.username || 'Randomchatzbot';
    const link = `https://t.me/${botUsername}?start=ref_${userId}`;
    const { getReferralCount } = await import('../database/db.js');
    const count = getReferralCount(userId);
    await ctx.reply(
      t(ctx, 'start.invite_text', { link, count }),
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  });
  
  bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = config.ADMIN_IDS.includes(userId);
    
    let helpText = t(ctx, 'start.help_commands');
    if (isAdmin) {
      helpText += t(ctx, 'start.help_admin');
    }
    
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  });
  
  bot.command('stats', async (ctx) => {
    const userBracket = ctx.session?.user?._ageBracket;
    let bracketInfo = '';
    if (userBracket) {
      const count = poolService.getBracketSize(userBracket);
      bracketInfo = `\n👥 Bracket ${userBracket}: ${count} waiting`;
    }
    await ctx.reply(t(ctx, 'start.stats', {
      pool: poolService.getPoolSize(),
      sessions: sessionService.getActiveSessions()
    }) + bracketInfo, { parse_mode: 'Markdown' });
  });
  
  bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    
    if (poolService.isInPool(userId)) {
      await poolService.removeFromPool(userId);
      await ctx.reply(t(ctx, 'start.cancel_success'), { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(t(ctx, 'start.cancel_none'));
    }
  });
  
  bot.command('myprofile', async (ctx) => {
    const user = ctx.session.user;
    
    if (!user) {
      await ctx.reply(t(ctx, 'start.no_profile'), { parse_mode: 'Markdown' });
      return;
    }
    
    await ctx.reply(
      `${t(ctx, 'start.profile_title')}\n\n` +
      t(ctx, 'start.profile_detail', {
        age: user.age,
        gender: user.gender,
        location: user.location,
        language: user.language
      }),
      { parse_mode: 'Markdown' }
    );
  });
}
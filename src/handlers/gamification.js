import { t, tLang } from '../locales/index.js';

export function registerGamificationHandlers(bot, { config, xpService, achievementService, leaderboardService }) {

  bot.command('profile', async (ctx) => {
    const userId = ctx.from.id;
    const profile = xpService.getProfile(userId);
    if (!profile) {
      await ctx.reply(t(ctx, 'gamification.no_profile'), { parse_mode: 'Markdown' });
      return;
    }

    const progressBar = '▓'.repeat(Math.floor(profile.progress / 10)) + '░'.repeat(10 - Math.floor(profile.progress / 10));
    const streakEmoji = profile.streak >= 7 ? '🔥' : profile.streak >= 3 ? '✨' : '📅';

    let msg = `${t(ctx, 'gamification.profile_title')}\n\n` +
      `${t(ctx, 'gamification.profile_level', { level: profile.level })}\n` +
      `${t(ctx, 'gamification.profile_xp', { xp: profile.xp })}\n` +
      `${t(ctx, 'gamification.profile_next', { current: profile.xpInLevel, needed: profile.xpNeeded })}\n` +
      `${t(ctx, 'gamification.profile_progress', { bar: progressBar, percent: profile.progress })}\n\n` +
      `${t(ctx, 'gamification.profile_streak', { emoji: streakEmoji, streak: profile.streak })}\n\n` +
      `${t(ctx, 'gamification.profile_stats', { messages: profile.total_messages, photos: profile.total_photos, sessions: profile.total_sessions })}\n`;

    if (profile.unlockedPerks && profile.unlockedPerks.length > 0) {
      msg += `\n${t(ctx, 'gamification.profile_perks')}\n`;
      for (const perk of profile.unlockedPerks) {
        msg += `${t(ctx, 'gamification.profile_perk_item', { level: perk.level, name: perk.name })}\n`;
      }
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('rank', async (ctx) => {
    const userId = ctx.from.id;
    const rankInfo = leaderboardService.getRank(userId);

    if (!rankInfo) {
      await ctx.reply(t(ctx, 'gamification.no_rank'), { parse_mode: 'Markdown' });
      return;
    }

    const top = leaderboardService.getTopN(5);

    let msg = t(ctx, 'gamification.leaderboard_title') + '\n';
    for (const u of top) {
      const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : `${u.rank}.`;
      msg += `${medal} Level ${u.level} · ${u.xp} XP\n`;
    }

    msg += t(ctx, 'gamification.your_rank', {
      rank: rankInfo.rank,
      total: rankInfo.total,
      percent: rankInfo.topPercent,
      level: rankInfo.neighbors.find(n => n.isYou)?.level || '?'
    });

    if (rankInfo.neighbors) {
      msg += t(ctx, 'gamification.nearby_title') + '\n';
      for (const n of rankInfo.neighbors) {
        msg += t(ctx, 'gamification.nearby_item', {
          arrow: n.isYou ? '👉' : '  ',
          rank: n.rank,
          level: n.level,
          xp: n.xp,
          you: n.isYou ? ' ← You' : ''
        }) + '\n';
      }
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('daily', async (ctx) => {
    const userId = ctx.from.id;
    const streakFreeze = ctx.session.inventory?.streak_freeze || 0;
    const result = xpService.claimDaily(userId, streakFreeze);

    if (result.usedFreeze && ctx.session.inventory?.streak_freeze > 0) {
      ctx.session.inventory.streak_freeze--;
    }

    if (!result.claimed) {
      const remaining = ctx.session.inventory?.streak_freeze || 0;
      let msg = t(ctx, 'gamification.daily_already', { streak: result.streak, next: result.streak + 1 });
      if (remaining > 0) {
        msg += t(ctx, 'gamification.daily_freeze_remaining', { count: remaining });
      } else {
        msg += t(ctx, 'gamification.daily_no_freeze');
      }
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      return;
    }

    const newAchs = achievementService.check(userId, 'daily_login', {
      profile: xpService.getProfile(userId),
      newStreak: result.streak
    });
    await notifyAchievements(bot.api, userId, newAchs, ctx.session.language);

    const streakFire = result.streak >= 7 ? '🔥🔥🔥' : result.streak >= 3 ? '🔥🔥' : '🔥';

    let msg = t(ctx, 'gamification.daily_claimed', { fire: streakFire, streak: result.streak, amount: result.amount });
    if (result.streak > 1) {
      msg += t(ctx, 'gamification.daily_bonus', { amount: 5 * result.streak });
    }
    if (result.streak === 7) msg += t(ctx, 'gamification.daily_streak_7');
    if (result.streak === 30) msg += t(ctx, 'gamification.daily_streak_30');

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('achievements', async (ctx) => {
    const userId = ctx.from.id;
    const progress = achievementService.getProgress(userId);

    if (!progress || progress.total === 0) {
      await ctx.reply(t(ctx, 'gamification.no_achievements'), { parse_mode: 'Markdown' });
      return;
    }

    let msg = t(ctx, 'gamification.achievements_title', { unlocked: progress.unlocked, total: progress.total });
    for (const ach of progress.achievements) {
      const status = ach.unlocked ? '✅' : '🔒';
      msg += `${status} ${ach.icon} *${ach.name}* — ${ach.desc}\n`;
    }
    msg += t(ctx, 'gamification.achievements_footer');

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  console.log('✅ Gamification handlers registered');
}

export async function notifyAchievements(api, userId, achievements, lang = 'id') {
  if (!achievements || achievements.length === 0) return;
  for (const ach of achievements) {
    try {
      await api.sendMessage(
        userId,
        tLang(lang, 'gamification.achievement_unlock', { icon: ach.icon, name: ach.name, desc: ach.desc }),
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Achievement notification error:', e.message);
    }
  }
}

export async function notifyLevelUp(api, userId, xpResult, lang = 'id') {
  if (!xpResult || !xpResult.levelUp) return;
  let msg = tLang(lang, 'gamification.level_up', { level: xpResult.level });
  if (xpResult.newPerks) {
    msg += tLang(lang, 'gamification.perk_unlock', { name: xpResult.newPerks.name, desc: xpResult.newPerks.description });
  }
  try {
    await api.sendMessage(userId, msg, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('Level-up notification error:', e.message);
  }
}

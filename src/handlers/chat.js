import { checkViolation } from './media.js';
import { metrics, logger } from '../admin/index.js';
import { bannedCache } from '../services/banned-cache.js';
import { rateLimiter } from '../services/rate-limiter.js';
import { updateUserStats, tempBanUser, flagUserUnderage, getReportCount, getMigrationViolationCount } from '../database/db.js';
import { t, tLang } from '../locales/index.js';
import { notifyAchievements, notifyLevelUp } from './gamification.js';
import { extractFeatures, getProfile } from '../services/behavioral.js';
import { enforceBracketBreach } from '../services/moderation.js';
import { ContextParameter } from '../services/context-parameter.js';
import { recordMessage as recordEvidence } from '../services/evidence.js';
import { getMigrationWarning } from '../utils/privacy.js';

/** Penilaian konteks percakapan per user (kata kunci + slang + no HP) */
export const contextParameter = new ContextParameter();

export function registerChatHandlers(bot, { sessionService, xpService, achievementService, poolService }) {
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (text.startsWith('/')) return;

    if (bannedCache.isBanned(userId)) {
      await ctx.reply(t(ctx, 'chat.banned'), { parse_mode: 'Markdown' });
      return;
    }

    if (!sessionService.isInSession(userId)) return;

    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;

    if (!rateLimiter.checkMessage(userId)) {
      await ctx.reply(t(ctx, 'chat.rate_limit'), { parse_mode: 'Markdown' });
      return;
    }

    const violations = checkViolation(userId, text, 'text', { bracket: ctx.session?.user?._ageBracket });

    if (bannedCache.isBanned(userId)) {
      await ctx.reply(t(ctx, 'chat.banned_violation'), { parse_mode: 'Markdown' });
      return;
    }

    if (violations.length > 0) {
      try {
        const specificWarning = getMigrationWarning(violations[0]?.reason?.replace('Menyertakan ', '') || '');

        // Check migration freeze status
        let freezeWarning = '';
        const isMigration = violations.some(v => v.category === 'migration' || v.type === 'migration');
        if (isMigration) {
          const migCount = getMigrationViolationCount(userId);
          const remaining = 3 - migCount;
          if (remaining > 0 && remaining <= 2) {
            freezeWarning = `\n\n🧊 *Peringatan ${migCount}/3* — ${remaining}x lagi akun akan dibekukan 24 jam.`;
          }
        }

        await ctx.reply(
          t(ctx, 'chat.warning', { violations: violations.map(v => v.reason).join(', ') }) + '\n\n' + specificWarning + freezeWarning,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    sessionService.updateActivity(userId);
    metrics.incMessage();
    logger.metric('message', { from: userId, to: partnerId, length: text.length });

    try {
      await bot.api.sendMessage(partnerId, text);
      updateUserStats(userId, 'message');
      // Bukti (in-memory ring buffer 20 pesan; dikunci ke DB hanya saat breach/sesi minor berakhir)
      try { recordEvidence(userId, partnerId, text, { bracket: ctx.session?.user?._ageBracket }); } catch (_) {}

      const profile = getProfile(userId);
      extractFeatures(text, profile);

      // Context Parameter: nilai konteks pesan (signal untuk review, bukan auto-ban)
      try {
        const ctxParam = contextParameter.record(userId, text);
        if (ctxParam.total >= 70) {
          logger.warn('context_critical', { userId, score: ctxParam.total, flags: ctxParam.flags });
        }
      } catch (_) {}

      // Enforce bracket-breach real-time: hentikan sesi + karantina/ratchet (bukan sekadar flag)
      if (profile.totalMessages >= 3) {
        const userBracket = ctx.session?.user?._ageBracket;
        enforceBracketBreach(userId, userBracket, {
          sessionService,
          botApi: bot.api,
          language: ctx.session?.language
        }).then(result => {
          if (result) {
            console.log(`⚡ Bracket breach enforced: ${userId} → ${result.kind} (${result.reason})`);
          }
        }).catch(err => console.error('Moderation error:', err.message));
      }

      const booster = ctx.session.inventory?.xp_booster;
      const xpMult = (booster && booster.expires_at > Date.now()) ? 2 : 1;
      const xpResult = xpService.addXP(userId, 'message', {}, xpMult);
      if (xpResult) {
        const lang = ctx.session.language;
        const newAchs = achievementService.check(userId, 'message', { profile: xpService.getProfile(userId) });
        await notifyAchievements(bot.api, userId, newAchs, lang);
        await notifyLevelUp(bot.api, userId, xpResult, lang);
      }
    } catch (error) {
      console.error(`Error forwarding: ${error.message}`);
    }
  });

  bot.command('skip', async (ctx) => {
    const userId = ctx.from.id;

    if (!sessionService.isInSession(userId)) {
      await ctx.reply(t(ctx, 'chat.not_in_session'), { parse_mode: 'Markdown' });
      return;
    }

    const { session, partnerId } = await sessionService.endSession(userId, 'skip');

    // Set skip cooldown berdasarkan bracket
    if (poolService) {
      const userBracket = ctx.session?.user?._ageBracket;
      poolService.setSkipCooldown(userId, userBracket);
    }

    metrics.incSessionEnd();
    logger.info('session_end', { userId, reason: 'skip' });

    await ctx.reply(t(ctx, 'chat.skip_confirm'), { parse_mode: 'Markdown' });

    try {
      const partnerProfile = session.user_a === partnerId ? session.profile_a : session.profile_b;
      const partnerLang = partnerProfile?.language || 'id';
      await bot.api.sendMessage(partnerId,
        t({ session: { language: partnerLang } }, 'chat.partner_left_chat'),
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  });

  bot.command('report', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (!sessionService.isInSession(userId)) {
      await ctx.reply(t(ctx, 'chat.report_no_session'));
      return;
    }

    const args = text.split(' ').slice(1).join(' ').toLowerCase();
    const reason = args || 'not specified';

    const { partnerId, session } = await sessionService.endSession(userId, 'report');
    if (!partnerId) return;

    // === ENFORCEMENT ===

    // 1. Temp ban the reported user for 24 hours
    tempBanUser(partnerId, `report:${reason}`, 86400000, `reporter_${userId}`);
    bannedCache.add(partnerId);

    // 2. Check if this is an underage report
    const isUnderageReport = reason.includes('underage') || reason.includes('umur') || reason.includes('bohong umur');
    if (isUnderageReport) {
      flagUserUnderage(partnerId);
      console.log(`🚨 UNDERAGE REPORT: ${partnerId} flagged by ${userId}`);
    }

    // 3. Check repeat reports (2+ reports = extended ban + flag)
    const reportCount = getReportCount(partnerId);
    if (reportCount >= 2) {
      // Extend to permanent flag + longer temp
      flagUserUnderage(partnerId);
      tempBanUser(partnerId, `report:repeat_offender_${reason}`, 259200000, 'system'); // 72h
      console.log(`🚨 REPEAT OFFENDER: ${partnerId} — ${reportCount} reports`);
    }

    logger.warn('report', { reporter: userId, reported: partnerId, reason, reportCount });
    metrics.incViolation();

    await ctx.reply(t(ctx, 'chat.report_confirm', { reason }), { parse_mode: 'Markdown' });

    // Notify partner in their language
    try {
      const partnerProfile = session.user_a === partnerId ? session.profile_a : session.profile_b;
      const partnerLang = partnerProfile?.language || 'id';
      await bot.api.sendMessage(partnerId,
        `⚠️ Kamu terkena *temp-ban 24 jam* karena laporan dari partner.\n\n` +
        `Alasan: ${reason}\n` +
        (isUnderageReport ? `\n🚩 Akun kamu ditandai untuk review admin.` : ''),
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}

    console.log(`🚨 Report: User ${userId} reported ${partnerId} - ${reason} (report #${reportCount + 1})`);
  });
}

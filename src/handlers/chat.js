import { checkViolation, isBanned } from './media.js';
import { metrics, logger } from '../admin/index.js';
import { bannedCache } from '../services/banned-cache.js';
import { rateLimiter } from '../services/rate-limiter.js';

export function registerChatHandlers(bot, { sessionService }) {
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (text.startsWith('/')) return;

    if (bannedCache.isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned. Hubungi admin.');
      return;
    }

    if (!sessionService.isInSession(userId)) return;

    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;

    if (!rateLimiter.checkMessage(userId)) {
      await ctx.reply('⏳ Mohon tunggu sebelum kirim pesan lagi.');
      return;
    }

    const violations = checkViolation(userId, text, 'text');

    if (bannedCache.isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned karena pelanggaran.');
      return;
    }

    if (violations.length > 0) {
      try {
        await ctx.reply(
          `⚠️ *Peringatan:* Pesan kamu melanggar aturan.\n\n` +
          `Pelanggaran: ${violations.map(v => v.reason).join(', ')}\n\n` +
          `Jika berlanjut, akun akan dibanned.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    sessionService.updateActivity(userId);
    metrics.incMessage();
    logger.metric('message', { from: userId, to: partnerId, length: text.length });

    try {
      await bot.api.sendMessage(partnerId, text);
    } catch (error) {
      console.error(`Error forwarding: ${error.message}`);
    }
  });

  bot.command('skip', async (ctx) => {
    const userId = ctx.from.id;

    if (!sessionService.isInSession(userId)) {
      await ctx.reply('❌ Kamu tidak dalam sesi chat. Ketik /start untuk memulai.');
      return;
    }

    const { session, partnerId } = await sessionService.endSession(userId, 'skip');

    metrics.incSessionEnd();
    logger.info('session_end', { userId, reason: 'skip' });

    await ctx.reply('*👋 Keluar dari chat.*\n\nKetik /start untuk cari chat baru.',
      { parse_mode: 'Markdown' }
    );

    try {
      await bot.api.sendMessage(partnerId,
        `*👋 Partner keluar dari chat.*\n\nKetik /start untuk cari chat baru.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  });

  bot.command('report', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (!sessionService.isInSession(userId)) {
      await ctx.reply('❌ Kamu tidak dalam sesi chat.');
      return;
    }

    const args = text.split(' ').slice(1).join(' ');
    const reason = args || 'Tidak disebutkan';

    const { partnerId } = await sessionService.endSession(userId, 'report');

    logger.warn('report', { reporter: userId, reported: partnerId, reason });
    metrics.incViolation();

    await ctx.reply(`*✅ Laporan dikirim.*\n\nPartner telah dilaporkan karena: ${reason}`,
      { parse_mode: 'Markdown' }
    );

    console.log(`🚨 Report: User ${userId} reported ${partnerId} - ${reason}`);
  });
}

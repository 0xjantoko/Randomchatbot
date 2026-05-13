/**
 * Chat handlers — Message forwarding and session management
 */
import { checkViolation, isBanned } from './media.js';
import { metrics, logger } from '../admin/index.js';

export function registerChatHandlers(bot, { sessionService }) {
  // Forward all text messages to partner
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    // Skip commands
    if (text.startsWith('/')) return;
    
    // Check if banned
    if (isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned. Hubungi admin.');
      return;
    }
    
    // Check if in session
    if (!sessionService.isInSession(userId)) {
      return; // Let other handlers deal with non-session users
    }
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;
    
    // Check for violations
    const violations = checkViolation(userId, text, 'text');
    
    // If banned due to violation, stop
    if (isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned karena pelanggaran.');
      return;
    }
    
    // Send warning if there were violations (but not banned yet)
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
    
    // Update activity
    sessionService.updateActivity(userId);
    
    // Track metrics
    metrics.incMessage();
    logger.metric('message', { from: userId, to: partnerId, length: text.length });
    
    // Forward to partner
    try {
      await bot.api.sendMessage(partnerId, text);
    } catch (error) {
      console.error(`Error forwarding: ${error.message}`);
    }
  });
  
  // /skip command
  bot.command('skip', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!sessionService.isInSession(userId)) {
      await ctx.reply('❌ Kamu tidak dalam sesi chat. Ketik /start untuk memulai.');
      return;
    }
    
    const { session, partnerId } = await sessionService.endSession(userId, 'skip');
    
    // Track metrics
    metrics.incSessionEnd();
    logger.info('session_end', { userId, reason: 'skip' });
    
    await ctx.reply('*👋 Keluar dari chat.*\n\nKetik /start untuk cari chat baru.',
      { parse_mode: 'Markdown' }
    );
    
    // Notify partner
    try {
      await bot.api.sendMessage(partnerId, 
        `*👋 Partner keluar dari chat.*\n\nKetik /start untuk cari chat baru.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      // Partner might have blocked bot
    }
  });
  
  // /report command
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
    
    // Log report
    logger.warn('report', { reporter: userId, reported: partnerId, reason });
    metrics.incViolation();
    
    await ctx.reply(`*✅ Laporan dikirim.*\n\nPartner telah dilaporkan karena: ${reason}`,
      { parse_mode: 'Markdown' }
    );
    
    // Log for admin (simple console for now)
    console.log(`🚨 Report: User ${userId} reported ${partnerId} - ${reason}`);
  });
}
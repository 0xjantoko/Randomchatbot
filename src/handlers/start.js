import { Keyboard, InlineKeyboard } from 'grammy';

export function registerStartHandler(bot, { config, poolService, sessionService }) {
  // /start command
  bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if already in session
    if (sessionService.isInSession(userId)) {
      await ctx.reply('❌ Kamu sedang dalam sesi chat.\nKetik /skip untuk keluar.');
      return;
    }
    
    // Check if already in pool
    if (poolService.isInPool(userId)) {
      await ctx.reply('⏳ Sedang mencari partner...\nKetik /cancel untuk cancel.');
      return;
    }
    
    // Reset session
    ctx.session = {
      state: 'onboarding_age',
      step: 'age',
      unlocked: ctx.session?.unlocked || [] // Keep unlocked premium features
    };
    
    // Show welcome and ask age
    await ctx.reply(config.WELCOME_MESSAGE, {
      parse_mode: 'Markdown'
    });
    
    await ctx.reply('*Ketik usia kamu:*', {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true }
    });
  });
  
  // /help command
  bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = [746661594].includes(userId);
    
    let helpText = `*📖 Help*

*Commands:*
/start — Mulai cari chat random
/skip — Keluar dari chat
/cancel — Cancel pencarian
/report — Laporkan partner
/myprofile — Lihat profil
/stats — Lihat statistik bot

*Fitur:*
📸 *Phantom Photo* — Foto auto-delete 10 detik
🚫 Screenshot/Share = Banned

*Fitur Premium (Telegram Stars):*
• 🔞 18+ Mode — Chat dengan user dewasa

_Beli Stars di Settings > Stars_`;

    // Add admin commands if user is admin
    if (isAdmin) {
      helpText += `\n\n*👑 Admin Commands:*
/adminphotos [n] — Lihat n foto terbaru
/admindb — Download database file
/adminquery [SQL] — Query database`;
    }
    
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  });
  
  // /stats command
  bot.command('stats', async (ctx) => {
    await ctx.reply(`*📊 Stats*

Waiting: ${poolService.getPoolSize()}
Active Sessions: ${sessionService.getActiveSessions()}`,
      { parse_mode: 'Markdown' }
    );
  });
  
  // /cancel command
  bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    
    if (poolService.isInPool(userId)) {
      await poolService.removeFromPool(userId);
      await ctx.reply('*✅ Pencarian dibatalkan.*\n\nKetik /start untuk mulai lagi.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply('❌ Tidak ada pencarian aktif.');
    }
  });
  
  // /myprofile command
  bot.command('myprofile', async (ctx) => {
    const user = ctx.session.user;
    const unlocked = ctx.session.unlocked || [];
    
    if (!user) {
      await ctx.reply('❌ Profil belum ada. Ketik /start untuk buat profil.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const premiumList = unlocked.length > 0 
      ? `\n*Premium:* ${unlocked.join(', ')}`
      : '\n*Premium:* -';
    
    await ctx.reply(
      `*👤 Profil Kamu*\n\n` +
      `• Usia: ${user.age}\n` +
      `• Gender: ${user.gender}\n` +
      `• Lokasi: ${user.location}\n` +
      `• Bahasa: ${user.language}\n` +
      `• Preferensi: ${user.preference}` +
      premiumList,
      { parse_mode: 'Markdown' }
    );
  });
}
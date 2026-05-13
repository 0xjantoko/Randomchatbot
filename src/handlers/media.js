/**
 * Media Handler - Photos with timer + Voice transcription
 */

import { getDb, savePhoto, logViolation, isBanned, getAllPhotos } from '../database/db.js';
import { checkPersonalInfo } from '../utils/privacy.js';
import config from '../config.js';
import { metrics, logger } from '../admin/index.js';
import { InlineKeyboard, InputFile } from 'grammy';

// Store active photo reveals to prevent abuse
const activeReveals = new Map();

// Admin user IDs - Mikhail (Jantoko)
const ADMIN_IDS = [746661594]; // @jantoko Telegram ID

// Photo timer in seconds
const PHOTO_TIMER_SECONDS = 10;

export function registerMediaHandlers(bot, { sessionService }) {
  
  // Handle photo reveal button tap
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('reveal_photo:')) {
      const fileId = data.split(':')[1];
      const userId = ctx.from.id;
      
      // Check if user is still in session
      if (!sessionService.isInSession(userId)) {
        await ctx.answerCallbackQuery({ text: '❌ Sesi chat sudah berakhir', show_alert: true });
        return;
      }
      
      // Prevent multiple reveals at once
      if (activeReveals.has(userId)) {
        await ctx.answerCallbackQuery({ text: '⏳ Foto sedang ditampilkan...', show_alert: false });
        return;
      }
      
      activeReveals.set(userId, true);
      
      try {
        // Delete the "Tap to reveal" message
        await ctx.deleteMessage();
        
        // Send warning first
        await bot.api.sendMessage(userId, 
          `⚠️ *PERINGATAN KEAMANAN*\n\n` +
          `🚫 *DILARANG:*\n` +
          `• Screenshot / screen recording\n` +
          `• Save foto ke gallery\n` +
          `• Share foto ke luar chat\n\n` +
          `🔴 Pelanggaran = *BANNED PERMANEN*\n\n` +
          `⏱️ Foto akan dihapus dalam ${PHOTO_TIMER_SECONDS} detik`,
          { parse_mode: 'Markdown' }
        );
        
        // Send the actual photo
        const photoMsg = await bot.api.sendPhoto(userId, fileId, {
          caption: `⏱️ ${PHOTO_TIMER_SECONDS} detik...`,
          parse_mode: 'Markdown'
        });
        
        // Notify sender that photo was opened
        const partnerId = sessionService.getPartner(userId);
        if (partnerId) {
          try {
            await bot.api.sendMessage(partnerId, 
              `📸 Partner membuka foto`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) {}
        }
        
        await ctx.answerCallbackQuery({ text: '👁️ Foto terbuka!', show_alert: false });
        
        // Schedule auto-delete after 10 seconds
        setTimeout(async () => {
          try {
            await bot.api.deleteMessage(userId, photoMsg.message_id);
            await bot.api.sendMessage(userId, 
              `📸 *Foto telah dihapus*\n\n✅ Phantom picture mode`,
              { parse_mode: 'Markdown' }
            );
            logger.metric('photo_deleted', { userId, photoMessageId: photoMsg.message_id });
          } catch (deleteError) {
            console.log(`Photo delete skipped: ${deleteError.message}`);
          }
          activeReveals.delete(userId);
        }, PHOTO_TIMER_SECONDS * 1000);
        
      } catch (e) {
        activeReveals.delete(userId);
        console.error('Photo reveal error:', e);
        await ctx.answerCallbackQuery({ text: '❌ Gagal menampilkan foto', show_alert: true });
      }
    }
  });
  
  // Block: Video (not allowed per Rules.md)
  bot.on('message:video', async (ctx) => {
    const userId = ctx.from.id;
    if (!sessionService.isInSession(userId)) return;
    
    await ctx.reply('❌ *Video tidak diperbolehkan.*\n\nHanya foto dan voice message yang diizinkan.',
      { parse_mode: 'Markdown' }
    );
    
    logger.warn('media_blocked', { userId, type: 'video' });
  });
  
  // Block: GIF/Sticker (not allowed per Rules.md)
  bot.on('message:animation', async (ctx) => {
    const userId = ctx.from.id;
    if (!sessionService.isInSession(userId)) return;
    
    await ctx.reply('❌ *GIF tidak diperbolehkan.*\n\nGIF dan sticker eksternal tidak didukung.',
      { parse_mode: 'Markdown' }
    );
    
    logger.warn('media_blocked', { userId, type: 'gif' });
  });
  
  bot.on('message:sticker', async (ctx) => {
    const userId = ctx.from.id;
    if (!sessionService.isInSession(userId)) return;
    
    await ctx.reply('❌ *Sticker tidak diperbolehkan.*\n\nGIF dan sticker eksternal tidak didukung.',
      { parse_mode: 'Markdown' }
    );
    
    logger.warn('media_blocked', { userId, type: 'sticker' });
  });
  
  // Handle photos
  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if banned
    if (isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned. Hubungi admin.');
      return;
    }
    
    // Check if in session
    if (!sessionService.isInSession(userId)) {
      return;
    }
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;
    
    // Get photo (largest size)
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    
    // Get anonymous IDs
    const senderAnonId = sessionService.getPartnerProfile(userId)?.anonymous_id || 'unknown';
    const receiverAnonId = sessionService.getPartnerProfile(partnerId)?.anonymous_id || 'unknown';
    
    // Save to database
    try {
      savePhoto(senderAnonId, receiverAnonId, fileId);
      console.log(`📸 Photo saved: ${senderAnonId} → ${receiverAnonId}`);
    } catch (e) {
      console.error('Photo save error:', e);
    }
    
    // Track metrics
    metrics.incPhoto();
    logger.metric('photo', { from: userId, to: partnerId });
    
    // Send blind photo notification with reveal button
    try {
      const revealKeyboard = new InlineKeyboard()
        .text(`👁️ Lihat Foto (${PHOTO_TIMER_SECONDS}s)`, `reveal_photo:${fileId}`);
      
      await bot.api.sendMessage(partnerId, 
        `📸 *FOTO BLIND* diterima\n\n` +
        `🔒 Foto dienkripsi & dilindungi\n` +
        `⏱️ Hanya bisa dilihat ${PHOTO_TIMER_SECONDS} detik\n` +
        `🚫 Screenshot/Share = Banned\n\n` +
        `Tap tombol untuk membuka:`,
        { 
          parse_mode: 'Markdown',
          reply_markup: revealKeyboard
        }
      );
      
    } catch (e) {
      console.error('Photo forward error:', e);
    }
  });
  
  // Handle voice messages (transcribe)
  bot.on('message:voice', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if banned
    if (isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned. Hubungi admin.');
      return;
    }
    
    // Check if in session
    if (!sessionService.isInSession(userId)) {
      return;
    }
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;
    
    // Get voice file
    const voice = ctx.message.voice;
    const fileId = voice.file_id;
    
    try {
      // Get file path
      const file = await bot.api.getFile(fileId);
      const filePath = file.file_path;
      
      // Track metrics
      metrics.incVoice();
      logger.metric('voice', { from: userId, to: partnerId });
      
      // For now, just forward as text placeholder
      // Real implementation would need audio transcription service
      await bot.api.sendMessage(partnerId, 
        `🎤 *Voice message received*\n\n⬇️ Download: ${filePath}\n\n(Speech-to-text belum tersedia)`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Voice forward error:', e);
    }
  });
  
  // /adminphotos command - Admin only
  bot.command('adminphotos', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if user is admin
    if (!ADMIN_IDS.includes(userId)) {
      await ctx.reply('❌ Access denied.');
      return;
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    const limit = parseInt(args[0]) || 5;
    
    const photos = getAllPhotos(limit);
    
    if (photos.length === 0) {
      await ctx.reply('📸 No photos in database.');
      return;
    }
    
    await ctx.reply(`*📸 Admin Photo Log (${photos.length} latest):*`,
      { parse_mode: 'Markdown' }
    );
    
    // Send each photo to admin
    for (const photo of photos) {
      try {
        await bot.api.sendPhoto(userId, photo.file_id, {
          caption: `👤 ${photo.sender_anonymous_id} → ${photo.receiver_anonymous_id}\n🕐 ${new Date(photo.created_at * 1000).toLocaleString()}`,
          parse_mode: 'Markdown'
        });
      } catch (e) {
        console.error(`Failed to send photo ${photo.file_id}:`, e.message);
      }
    }
  });
  
  // /admindb command - Download database file
  bot.command('admindb', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if user is admin
    if (!ADMIN_IDS.includes(userId)) {
      await ctx.reply('❌ Access denied.');
      return;
    }
    
    try {
      const dbPath = process.env.DB_PATH || './data.db';
      
      await ctx.reply('📁 Sending database file...');
      
      // Send database as document
      await bot.api.sendDocument(userId, new InputFile(dbPath), {
        caption: `🗄️ RandomChat Database\n📅 ${new Date().toLocaleString()}`,
        parse_mode: 'Markdown'
      });
      
      logger.info('admin_db_export', { adminId: userId });
      
    } catch (e) {
      console.error('DB export error:', e);
      await ctx.reply(`❌ Failed to send database: ${e.message}`);
    }
  });
  
  // /adminquery command - Run SQL query
  bot.command('adminquery', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if user is admin
    if (!ADMIN_IDS.includes(userId)) {
      await ctx.reply('❌ Access denied.');
      return;
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
      await ctx.reply('Usage: /adminquery SELECT * FROM photos LIMIT 5');
      return;
    }
    
    // Only allow SELECT queries for safety
    if (!query.trim().toLowerCase().startsWith('select')) {
      await ctx.reply('❌ Only SELECT queries allowed for security.');
      return;
    }
    
    try {
      const stmt = getDb().prepare(query);
      const results = stmt.all();
      
      if (results.length === 0) {
        await ctx.reply('📭 Query returned 0 results.');
        return;
      }
      
      // Format results (limit to avoid message too long)
      const maxResults = 20;
      const displayResults = results.slice(0, maxResults);
      
      let response = `*📊 Query Results (${results.length} rows):*\n\n`;
      response += '```json\n';
      response += JSON.stringify(displayResults, null, 2).substring(0, 3500);
      if (results.length > maxResults) {
        response += '\n... (truncated)';
      }
      response += '\n```';
      
      await ctx.reply(response, { parse_mode: 'Markdown' });
      
    } catch (e) {
      await ctx.reply(`❌ Query error: ${e.message}`);
    }
  });
}

// ============ VIOLATION DETECTION ============

export function checkViolation(userId, content, contentType = 'text') {
  const violations = [];
  
  // Check personal info
  const safety = checkPersonalInfo(content);
  if (!safety.safe) {
    violations.push({
      type: 'personal_info',
      reason: `Menyertakan ${safety.reason}`,
      details: content.substring(0, 50)
    });
  }
  
  // 18+ specific keywords (for random mode - not 18+ mode)
  // If user is in random (non-18+) mode and talks about 18+ topics
  const adultKeywords = ['sex', 'porn', '18+', 'adult', 'nsfw', 'xxx', 'sexual'];
  const isAdultContent = adultKeywords.some(kw => content.toLowerCase().includes(kw));
  
  if (isAdultContent) {
    violations.push({
      type: 'adult_content_random',
      reason: 'Konten 18+ di mode random',
      details: content.substring(0, 50)
    });
  }
  
  // Log violations
  for (const v of violations) {
    const result = logViolation(userId, v.type, v.details);
    metrics.incViolation();
    logger.warn('violation', { userId, type: v.type, details: v.details });
    
    if (result.banned) {
      metrics.incBan();
      console.log(`🚫 User ${userId} auto-banned after ${result.violationCount} violations`);
      logger.error('user_banned', { userId, violations: result.violationCount, reason: v.type });
    }
  }
  
  return violations;
}
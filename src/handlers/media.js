/**
 * Media Handler - Photos with timer + Voice transcription
 */

import { getDb, savePhoto, logViolation, logMigrationViolation, freezeUser, getAllPhotos, updateUserStats } from '../database/db.js';
import { checkPersonalInfo } from '../utils/privacy.js';
import config from '../config.js';
import { metrics, logger } from '../admin/index.js';
import { InlineKeyboard, InputFile } from 'grammy';
import { bannedCache } from '../services/banned-cache.js';
import { rateLimiter } from '../services/rate-limiter.js';
import { t } from '../locales/index.js';
import { notifyAchievements, notifyLevelUp } from './gamification.js';
import { resolveTrust } from '../services/trust.js';

// Store active photo reveals to prevent abuse
const activeReveals = new Map();

function getPhotoTimer(ageBracket) {
  return ageBracket === 'minor' ? 3 : 10;
}

export function registerMediaHandlers(bot, { sessionService, xpService, achievementService }) {
  
  // Handle photo reveal button tap
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('reveal_photo:')) {
      const fileId = data.split(':')[1];
      const userId = ctx.from.id;
      
      if (!sessionService.isInSession(userId)) {
        await ctx.answerCallbackQuery({ text: t(ctx, 'media.session_ended'), show_alert: true });
        return;
      }
      
      if (activeReveals.has(userId)) {
        await ctx.answerCallbackQuery({ text: t(ctx, 'media.photo_loading'), show_alert: false });
        return;
      }
      
      activeReveals.set(userId, true);
      
      try {
        await ctx.deleteMessage();
        
        const viewerBracket = ctx.session?.user?._ageBracket;
        const timer = getPhotoTimer(viewerBracket);
        const lang = ctx.session.language;
        
        await bot.api.sendMessage(userId, 
          t({ session: { language: lang } }, 'media.photo_warning', { seconds: timer }),
          { parse_mode: 'Markdown' }
        );
        
        const photoMsg = await bot.api.sendPhoto(userId, fileId, {
          caption: t({ session: { language: lang } }, 'media.photo_timer', { seconds: timer }),
          parse_mode: 'Markdown'
        });
        
        const partnerId = sessionService.getPartner(userId);
        if (partnerId) {
          try {
            const partnerSession = sessionService.getSession(partnerId);
            const partnerLang = partnerSession 
              ? (partnerSession.user_a === partnerId ? partnerSession.profile_a?.language : partnerSession.profile_b?.language)
              : 'id';
            await bot.api.sendMessage(partnerId, 
              t({ session: { language: partnerLang } }, 'media.photo_opened'),
              { parse_mode: 'Markdown' }
            );
          } catch (e) {}
        }
        
        await ctx.answerCallbackQuery({ text: t(ctx, 'media.photo_opened_ack'), show_alert: false });
        
        setTimeout(async () => {
          try {
            await bot.api.deleteMessage(userId, photoMsg.message_id);
            await bot.api.sendMessage(userId, 
              t({ session: { language: lang } }, 'media.photo_deleted'),
              { parse_mode: 'Markdown' }
            );
            logger.metric('photo_deleted', { userId, photoMessageId: photoMsg.message_id });
          } catch (deleteError) {
            console.log(`Photo delete skipped: ${deleteError.message}`);
          }
          activeReveals.delete(userId);
        }, timer * 1000);
        
      } catch (e) {
        activeReveals.delete(userId);
        console.error('Photo reveal error:', e);
        await ctx.answerCallbackQuery({ text: t(ctx, 'media.photo_failed'), show_alert: true });
      }
    }
  });
  
  bot.on('message:video', async (ctx) => {
    const userId = ctx.from.id;
    if (!sessionService.isInSession(userId)) return;
    
    await ctx.reply(t(ctx, 'media.blocked_video'), { parse_mode: 'Markdown' });
    logger.warn('media_blocked', { userId, type: 'video' });
  });
  
  bot.on('message:animation', async (ctx) => {
    const userId = ctx.from.id;
    if (!sessionService.isInSession(userId)) return;
    
    await ctx.reply(t(ctx, 'media.blocked_gif'), { parse_mode: 'Markdown' });
    logger.warn('media_blocked', { userId, type: 'gif' });
  });
  
  bot.on('message:sticker', async (ctx) => {
    const userId = ctx.from.id;
    if (!sessionService.isInSession(userId)) return;
    
    await ctx.reply(t(ctx, 'media.blocked_sticker'), { parse_mode: 'Markdown' });
    logger.warn('media_blocked', { userId, type: 'sticker' });
  });
  
  // Handle photos
  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from.id;
    
    if (bannedCache.isBanned(userId)) {
      await ctx.reply(t(ctx, 'media.session_ended'), { parse_mode: 'Markdown' });
      return;
    }
    
    if (!sessionService.isInSession(userId)) {
      return;
    }

    // Trust gate (P1): shadow (<3 sesi selesai) & flagged → foto terkunci
    const trust = resolveTrust(userId);
    if (trust === 'flagged') {
      await ctx.reply(t(ctx, 'media.locked_flagged'), { parse_mode: 'Markdown' });
      return;
    }
    if (trust === 'shadow') {
      await ctx.reply(t(ctx, 'media.locked_shadow'), { parse_mode: 'Markdown' });
      return;
    }
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;

    if (!rateLimiter.checkMessage(userId)) return;
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    
    const senderAnonId = sessionService.getUserProfile(userId)?.anonymous_id || 'unknown';
    const receiverAnonId = sessionService.getUserProfile(partnerId)?.anonymous_id || 'unknown';
    
    try {
      savePhoto(senderAnonId, receiverAnonId, fileId);
      updateUserStats(userId, 'photo');
      console.log(`📸 Photo saved: ${senderAnonId} → ${receiverAnonId}`);
    } catch (e) {
      console.error('Photo save error:', e);
    }
    
    metrics.incPhoto();
    logger.metric('photo', { from: userId, to: partnerId });
    
    try {
      const partnerSession = sessionService.getSession(partnerId);
      const partnerProfile = partnerSession
        ? (partnerSession.user_a === partnerId ? partnerSession.profile_a : partnerSession.profile_b)
        : null;
      const partnerLang = partnerProfile?.language || 'id';
      const partnerTimer = getPhotoTimer(partnerProfile?._ageBracket);
      const revealKeyboard = new InlineKeyboard()
        .text(t({ session: { language: partnerLang } }, 'media.reveal_button', { seconds: partnerTimer }), `reveal_photo:${fileId}`);
      
      await bot.api.sendMessage(partnerId, 
        t({ session: { language: partnerLang } }, 'media.blind_photo', { seconds: partnerTimer }),
        { 
          parse_mode: 'Markdown',
          reply_markup: revealKeyboard
        }
      );

      const booster = ctx.session.inventory?.xp_booster;
      const xpMult = (booster && booster.expires_at > Date.now()) ? 2 : 1;
      const xpResult = xpService.addXP(userId, 'photo', {}, xpMult);
      if (xpResult) {
        const lang = ctx.session.language;
        const newAchs = achievementService.check(userId, 'photo', { profile: xpService.getProfile(userId) });
        await notifyAchievements(bot.api, userId, newAchs, lang);
        await notifyLevelUp(bot.api, userId, xpResult, lang);
      }
      
    } catch (e) {
      console.error('Photo forward error:', e);
    }
  });
  
  // Handle voice messages (transcribe)
  bot.on('message:voice', async (ctx) => {
    const userId = ctx.from.id;
    
    if (bannedCache.isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned. Hubungi admin.');
      return;
    }
    
    if (!sessionService.isInSession(userId)) {
      return;
    }

    // Voice: minor diblokir total; adult harus verified (>=3 sesi, tidak flagged)
    const senderBracket = ctx.session?.user?._ageBracket;
    const voiceTrust = resolveTrust(userId);
    if (senderBracket === 'minor') {
      await ctx.reply(t(ctx, 'media.voice_minor_blocked'), { parse_mode: 'Markdown' });
      return;
    }
    if (voiceTrust === 'flagged') {
      await ctx.reply(t(ctx, 'media.locked_flagged'), { parse_mode: 'Markdown' });
      return;
    }
    if (voiceTrust !== 'verified') {
      await ctx.reply(t(ctx, 'media.locked_shadow'), { parse_mode: 'Markdown' });
      return;
    }
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;
    
    // Get voice file
    const voice = ctx.message.voice;
    const fileId = voice.file_id;
    
    if (!rateLimiter.checkMessage(userId)) return;
    
    try {
      // Track metrics
      metrics.incVoice();
      updateUserStats(userId, 'message');
      logger.metric('voice', { from: userId, to: partnerId });
      
      const partnerSession = sessionService.getSession(partnerId);
      const partnerLang = partnerSession
        ? (partnerSession.user_a === partnerId ? partnerSession.profile_a?.language : partnerSession.profile_b?.language)
        : 'id';
      await bot.api.sendVoice(partnerId, fileId, {
        caption: t({ session: { language: partnerLang } }, 'media.voice_caption')
      });
    } catch (e) {
      console.error('Voice forward error:', e);
    }
  });
  
  // /adminphotos command - Admin only
  bot.command('adminphotos', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if user is admin
    if (!config.ADMIN_IDS.includes(userId)) {      await ctx.reply('❌ Access denied.');
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
  
  // /adminexport command - Sanitized user stats export only (NO raw DB)
  bot.command('adminexport', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!config.ADMIN_IDS.includes(userId)) {
      await ctx.reply('❌ Access denied.');
      return;
    }
    
    try {
      const db = getDb();
      
      // Export only anonymized, non-sensitive data
      const bans = db.prepare('SELECT anonymous_id, reason, banned_at FROM bans').all();
      const violations = db.prepare('SELECT COUNT(*) as total, violation_type FROM violations GROUP BY violation_type').all();
      const stats = db.prepare('SELECT COUNT(*) as total_users FROM user_stats').get();
      
      let report = `*📊 Admin Export (${new Date().toLocaleString()})*\n\n`;
      report += `*Users tracked:* ${stats.total_users}\n\n`;
      report += `*Violations by type:*\n`;
      for (const v of violations) {
        report += `• ${v.violation_type}: ${v.total}\n`;
      }
      report += `\n*Banned users:* ${bans.length}\n`;
      for (const b of bans.slice(0, 20)) {
        report += `• ${b.anonymous_id} — ${b.reason}\n`;
      }
      
      await ctx.reply(report, { parse_mode: 'Markdown' });
      logger.info('admin_sanitized_export', { adminId: userId });
      
    } catch (e) {
      console.error('Export error:', e);
      await ctx.reply(`❌ Export failed: ${e.message}`);
    }
  });
  
  // /adminquery command - Run SQL query (SAFE mode)
  bot.command('adminquery', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if user is admin
    if (!config.ADMIN_IDS.includes(userId)) {      await ctx.reply('❌ Access denied.');
      return;
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query || !query.trim()) {
      await ctx.reply('Usage: /adminquery "SELECT * FROM photos LIMIT 5"');
      return;
    }
    
    // STRICT whitelist: only allow simple SELECT with no dangerous keywords
    const trimmed = query.trim();
    const upper = trimmed.toUpperCase();
    
    // Reject any query containing DML/DDL or stacked queries
    const forbiddenPatterns = [
      /\bINSERT\b/, /\bUPDATE\b/, /\bDELETE\b/, /\bDROP\b/, /\bALTER\b/, /\bCREATE\b/,
      /\bREPLACE\b/, /\bTRUNCATE\b/, /\bEXEC\b/, /\bEXECUTE\b/, /\bSYSTEM\b/,
      /\bGRANT\b/, /\bREVOKE\b/, /\bATTACH\b/, /\bDETACH\b/, /\bBEGIN\b/, /\bCOMMIT\b/,
      /\bROLLBACK\b/, /\bPRAGMA\b/, /\bLOAD\b/, /\bWITH\s+\w+\s+AS/i,
      /\/\*/, /--/, /;/, /\bUNION\b.*\bSELECT\b/i, /\bEXPLAIN\b/
    ];
    
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(trimmed)) {
        await ctx.reply('❌ Query not allowed: contains forbidden keyword or syntax.');
        return;
      }
    }
    
    // Must start with SELECT and nothing else suspicious
    if (!upper.startsWith('SELECT ') && !upper.startsWith('SELECT(')) {
      await ctx.reply('❌ Only simple SELECT queries allowed.');
      return;
    }
    
    // Limit result size via LIMIT clause if not present
    if (!/\bLIMIT\b/i.test(trimmed)) {
      // Append LIMIT safely — only if no LIMIT already exists
      const safeQuery = trimmed.replace(/;\s*$/, '') + ' LIMIT 20';
      try {
        const stmt = getDb().prepare(safeQuery);
        const results = stmt.all();
        
        if (results.length === 0) {
          await ctx.reply('📭 Query returned 0 results.');
          return;
        }
        
        const displayResults = results.slice(0, 20);
        let response = `*📊 Query Results (${results.length} rows, limited 20):\n\n`;
        response += '```json\n';
        response += JSON.stringify(displayResults, null, 2).substring(0, 3500);
        response += '\n```';
        
        await ctx.reply(response, { parse_mode: 'Markdown' });
        
      } catch (e) {
        await ctx.reply(`❌ Query error: ${e.message}`);
      }
      return;
    }
    
    try {
      const stmt = getDb().prepare(trimmed);
      const results = stmt.all();
      
      if (results.length === 0) {
        await ctx.reply('📭 Query returned 0 results.');
        return;
      }
      
      const displayResults = results.slice(0, 20);
      let response = `*📊 Query Results (${results.length} rows):\n\n`;
      response += '```json\n';
      response += JSON.stringify(displayResults, null, 2).substring(0, 3500);
      if (results.length > 20) {
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

export function checkViolation(userId, content, contentType = 'text', options = {}) {
  const violations = [];
  const minorPool = options.bracket === 'minor';
  
  const safety = checkPersonalInfo(content);
  if (!safety.safe) {
    violations.push({
      type: safety.category || 'personal_info',
      reason: `Menyertakan ${safety.reason}`,
      details: content.substring(0, 50),
      category: safety.category || 'personal_info'
    });
  }
  
  // Log violations — personal_info leads to auto-ban, migration leads to freeze
  for (const v of violations) {
    if (v.category === 'migration') {
      const result = logMigrationViolation(userId, v.details);
      metrics.incViolation();
      logger.warn('migration_violation', { userId, details: v.details, count: result.count, minorPool });

      // Pool Minor = hardened zone: ajakan pindah platform / ketemu = freeze langsung, tanpa 3 strike
      if (minorPool) {
        freezeUser(userId, 'Hardened minor pool: contact-migration attempt');
        bannedCache.add(userId);
        console.log(`🧊 Minor-pool freeze: user ${userId} (${v.reason})`);
        logger.error('user_frozen', { userId, reason: 'minor_pool_migration', count: result.count });
      } else if (result.frozen) {
        freezeUser(userId, 'Migration violation: repeated attempts to share contacts');
        bannedCache.add(userId);
        console.log(`🧊 User ${userId} FROZEN for 24h (${result.count} migration violations)`);
        logger.error('user_frozen', { userId, reason: 'migration', count: result.count });
      }
    } else {
      const result = logViolation(userId, v.type, v.details);
      metrics.incViolation();
      logger.warn('violation', { userId, type: v.type, details: v.details });

      if (result.banned) {
        metrics.incBan();
        bannedCache.add(userId);
        console.log(`🚫 User ${userId} auto-banned after ${result.violationCount} violations`);
        logger.error('user_banned', { userId, violations: result.violationCount, reason: v.type });
      }
    }
  }
  
  return violations;
}
/**
 * Suit (Rock Paper Scissors) Mini-Game Handler
 * Playing between partners in chat session
 * Betting: who shares first, tells story first, etc.
 */

import { bannedCache } from '../services/banned-cache.js';
import { metrics, logger } from '../admin/index.js';

// Emoji constants
const EMOJI = {
  GUNTING: '✂️',
  BATU: '🪨',
  KERTAS: '📄',
  WIN: '🎉',
  LOSE: '😢',
  DRAW: '🤝',
  QUESTION: '❓'
};

const CHOICES = {
  'gunting': { emoji: EMOJI.GUNTING, name: 'Gunting', beats: 'kertas' },
  'batu': { emoji: EMOJI.BATU, name: 'Batu', beats: 'gunting' },
  'kertas': { emoji: EMOJI.KERTAS, name: 'Kertas', beats: 'batu' }
};

// Active games state
const activeGames = new Map();

export function registerSuitHandlers(bot, { sessionService }) {
  
  // /suit command - start or play
  bot.command('suit', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ').slice(1);
    
    // Check if banned
    if (bannedCache.isBanned(userId)) {
      await ctx.reply('❌ Akun kamu telah dibanned. Hubungi admin.');
      return;
    }
    
    // Check if in session
    if (!sessionService.isInSession(userId)) {
      await ctx.reply('❌ Kamu tidak dalam sesi chat.\nKetik /start untuk memulai.');
      return;
    }
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;
    
    const gameKey = [userId, partnerId].sort().join('-');
    const currentGame = activeGames.get(gameKey);
    
    // If no argument, show help or start new game
    if (args.length === 0) {
      if (currentGame?.status === 'waiting') {
        // Partner already waiting
        await ctx.reply('❌ Partner sudah memilih!\nKetik /suit batu / gunting / kertas untuk memilih.');
        return;
      }
      
      // Start new game
      activeGames.set(gameKey, {
        player1: userId,
        player2: partnerId,
        status: 'waiting',
        choices: {},
        createdAt: Date.now()
      });
      
      // Auto-clean stale games after 5 minutes
      setTimeout(() => {
        if (activeGames.has(gameKey) && activeGames.get(gameKey).status === 'waiting') {
          activeGames.delete(gameKey);
        }
      }, 300000);
      
      // Notify both players
      await ctx.reply(
        `🎮 *Suit! (Gunting-Batu-Kertas)*\n\n` +
        `Pilih salah satu:\n` +
        `${EMOJI.GUNTING} Gunting\n` +
        `${EMOJI.BATU} Batu\n` +
        `${EMOJI.KERTAS} Kertas\n\n` +
        `Ketik: /suit [pilihan]\n\n` +
        `Contoh: /suit batu\n\n` +
        `💡 Taruhannya: yang kalah menuruti pemenangnya!`,
        { parse_mode: 'Markdown' }
      );
      
      try {
        await bot.api.sendMessage(partnerId, 
          `🎮 *Partner mengajak main Suit!*\n\n` +
          `Ketik /suit [pilihan] untuk bermain\n\n` +
          `💡 Taruhannya: yang kalah menuruti pemenangnya!`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
      
      logger.info('suit_game', { gameKey, action: 'started' });
      return;
    }
    
    // Player made a choice
    const choiceInput = args[0].toLowerCase();
    
    // Validate choice
    if (!CHOICES[choiceInput]) {
      await ctx.reply(
        `❌ Pilihan tidak valid!\n\n` +
        `Gunakan:\n` +
        `/suit gunting  ${EMOJI.GUNTING}\n` +
        `/suit batu    ${EMOJI.BATU}\n` +
        `/suit kertas  ${EMOJI.KERTAS}`
      );
      return;
    }
    
    // Check game state
    if (!currentGame || currentGame.status === 'finished') {
      // Start new game with choice
      activeGames.set(gameKey, {
        player1: userId,
        player2: partnerId,
        status: 'waiting',
        choices: { [userId]: choiceInput }
      });
      
      await ctx.reply(
        `✅ Kamu memilih: ${CHOICES[choiceInput].emoji} ${CHOICES[choiceInput].name}\n\n` +
        `Menunggu partner...`,
        { parse_mode: 'Markdown' }
      );
      
      try {
        await bot.api.sendMessage(partnerId,
          `🎮 Partner sudah memilih!\n\n` +
          `Sekarang giliranmu:\n` +
          `/suit gunting  ${EMOJI.GUNTING}\n` +
          `/suit batu    ${EMOJI.BATU}\n` +
          `/suit kertas  ${EMOJI.KERTAS}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
      
      return;
    }
    
    // Add choice to existing game
    currentGame.choices[userId] = choiceInput;
    
    // Check if both have chosen
    if (Object.keys(currentGame.choices).length >= 2) {
      currentGame.status = 'finished';
      const result = determineWinner(currentGame.choices);
      
      // Send personalized results to each player
      const resultUser = formatResult(currentGame.choices, result, userId);
      const resultPartner = formatResult(currentGame.choices, result, partnerId);
      
      await ctx.reply(resultUser, { parse_mode: 'Markdown' });
      
      try {
        await bot.api.sendMessage(partnerId, resultPartner, { parse_mode: 'Markdown' });
      } catch (e) {}
      
      // Track metrics
      metrics.incMessage();
      logger.metric('suit_game', { gameKey, winner: result.winner });
      
      // Clean up after 30 seconds
      setTimeout(() => activeGames.delete(gameKey), 30000);
    } else {
      // Waiting for other player
      await ctx.reply(
        `✅ Kamu memilih: ${CHOICES[choiceInput].emoji} ${CHOICES[choiceInput].name}\n\n` +
        `Menunggu partner...`
      );
      
      try {
        await bot.api.sendMessage(partnerId,
          `🎮 Partner sudah memilih ${CHOICES[choiceInput].emoji}\n\n` +
          `Sekarang giliranmu!`
        );
      } catch (e) {}
    }
  });
  
  // /suitcancel - cancel current game
  bot.command('suitcancel', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!sessionService.isInSession(userId)) return;
    
    const partnerId = sessionService.getPartner(userId);
    if (!partnerId) return;
    
    const gameKey = [userId, partnerId].sort().join('-');
    
    if (activeGames.has(gameKey)) {
      activeGames.delete(gameKey);
      await ctx.reply('❌ Game Suit dibatalkan.');
      
      try {
        await bot.api.sendMessage(partnerId, '❌ Game Suit dibatalkan oleh partner.');
      } catch (e) {}
      
      logger.info('suit_game', { gameKey, action: 'cancelled' });
    }
  });
}

function determineWinner(choices) {
  const players = Object.keys(choices);
  const choice1 = choices[players[0]];
  const choice2 = choices[players[1]];
  
  if (choice1 === choice2) {
    return { winner: 'draw', message: 'Seri!' };
  }
  
  if (CHOICES[choice1].beats === choice2) {
    return { winner: players[0], loser: players[1], message: 'Menang!' };
  }
  
  return { winner: players[1], loser: players[0], message: 'Menang!' };
}

function formatResult(choices, result, currentUserId) {
  const players = Object.keys(choices);
  const userChoice = choices[currentUserId];
  const partnerChoice = choices[players.find(p => p !== currentUserId)];
  
  const emojiUser = CHOICES[userChoice].emoji;
  const emojiPartner = CHOICES[partnerChoice].emoji;
  
  let outcome;
  
  if (result.winner === 'draw') {
    outcome = `${EMOJI.DRAW} *Seri!* 🔄\n\nTidak ada yang harus menuruti!`;
  } else if (result.winner === currentUserId) {
    // Current user won
    outcome = `${EMOJI.WIN} *Kamu Menang!* ${EMOJI.WIN}\n\n🎯 Partner harus menuruti kamu!\n\n💡 Contoh: share pic duluan, cerita duluan, ketik dulu, dll.`;
  } else {
    // Current user lost
    outcome = `${EMOJI.LOSE} *Kamu Kalah!* ${EMOJI.LOSE}\n\n😢 Kamu harus menuruti partner!\n\n💡 Contoh: share pic duluan, cerita duluan, ketik dulu, dll.`;
  }
  
  return `🎮 *Hasil Suit*\n\n` +
    `Kamu: ${emojiUser} ${CHOICES[userChoice].name}\n` +
    `Partner: ${emojiPartner} ${CHOICES[partnerChoice].name}\n\n` +
    `${outcome}\n\n` +
    `Ketik /suit untuk main lagi!`;
}
import { Bot, session } from 'grammy';
import config from './config.js';
import { registerHandlers } from './handlers/index.js';
import { PoolService } from './services/pool.js';
import { SessionService } from './services/session.js';
import { initDatabase, getDb } from './database/db.js';
import { startAdminServer, metrics, logger } from './admin/index.js';
import { initSessionTable, sessionStorage } from './services/session-storage.js';
import { bannedCache } from './services/banned-cache.js';
import { rateLimiter } from './services/rate-limiter.js';
import { XPService } from './services/xp.js';
import { AchievementService } from './services/achievements.js';
import { LeaderboardService } from './services/leaderboard.js';

// Environment check
if (!config.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not set! Copy .env.example to .env and fill in your bot token.');
  process.exit(1);
}

// Initialize database
initDatabase();
initSessionTable();

// Initialize banned cache (in-memory, auto-refresh every 30s)
bannedCache.init();

// Initialize bot
const bot = new Bot(config.BOT_TOKEN);

// Grammy session middleware (persisted to SQLite)
bot.use(session({
  initial: () => ({
    state: null,
    step: null,
    user: null,
    age: null,
    gender: null,
    location: null,
    language: null,
    anonymous_id: null,
    inventory: {}
  }),
  storage: sessionStorage
}));

// Initialize services
const poolService = new PoolService();
const sessionService = new SessionService(poolService);
const achievementService = new AchievementService();
const xpService = new XPService(achievementService);
const leaderboardService = new LeaderboardService();

// Register handlers
registerHandlers(bot, {
  poolService,
  sessionService,
  xpService,
  achievementService,
  leaderboardService,
  config,
  bot
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  logger.error('unhandled_rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  logger.error('uncaught_exception', { message: err.message, stack: err.stack });
});

// Bot error handler
bot.catch((err) => {
  console.error('Bot error:', err);
  logger.error('bot_error', { message: err.message });
});

// Start admin server first (bot.start blocks)
startAdminServer(poolService, sessionService);

// Start bot
console.log('🤖 Starting Randomchatbot...');
await bot.start();
console.log('✅ Bot is running!');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  await bot.stop();
  bannedCache.stop();
  rateLimiter.stop();
  xpService.stop();
  achievementService.stop();
  leaderboardService.stop();
  try {
    const db = getDb();
    db.close();
    console.log('📁 Database closed');
  } catch (e) {
    console.error('Error closing database:', e.message);
  }
  process.exit(0);
});
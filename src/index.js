import { Bot } from 'grammy';
import config from './config.js';
import { registerHandlers } from './handlers/index.js';
import { PoolService } from './services/pool.js';
import { SessionService } from './services/session.js';

// Initialize bot
const bot = new Bot(config.BOT_TOKEN);

// Initialize services
const poolService = new PoolService();
const sessionService = new SessionService(poolService);

// Register handlers
registerHandlers(bot, {
  poolService,
  sessionService,
  config
});

// Error handler
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start bot
console.log('🤖 Starting RandomChatbot...');
await bot.start();
console.log('✅ Bot is running!');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  await bot.stop();
  process.exit(0);
});
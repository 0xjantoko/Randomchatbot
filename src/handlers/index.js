/**
 * Register all handlers
 */
import { registerStartHandler } from './start.js';
import { registerOnboardingHandlers } from './onboarding.js';
import { registerChatHandlers } from './chat.js';
import { registerMediaHandlers } from './media.js';
import { registerGamificationHandlers } from './gamification.js';
import { registerPaymentHandlers } from './payment.js';
import { registerShopHandlers } from './shop.js';

export function registerHandlers(bot, services) {
  registerStartHandler(bot, services);
  registerOnboardingHandlers(bot, services);
  registerChatHandlers(bot, services);
  registerMediaHandlers(bot, services);
  registerGamificationHandlers(bot, services);
  registerShopHandlers(bot, services);
  registerPaymentHandlers(bot, services);

  console.log('✅ All handlers registered');
}
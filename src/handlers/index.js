/**
 * Register all handlers
 */
import { registerStartHandler } from './start.js';
import { registerOnboardingHandlers } from './onboarding.js';
import { registerChatHandlers } from './chat.js';
import { registerMediaHandlers } from './media.js';
import { registerSuitHandlers } from './suit.js';

export function registerHandlers(bot, services) {
  registerStartHandler(bot, services);
  registerOnboardingHandlers(bot, services);
  registerChatHandlers(bot, services);
  registerMediaHandlers(bot, services);
  registerSuitHandlers(bot, services);
  
  console.log('✅ All handlers registered');
}
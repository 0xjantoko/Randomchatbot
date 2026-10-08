import { SHOP_ITEMS } from './shop.js';
import { t } from '../locales/index.js';

export function registerPaymentHandlers(bot, { bot: apiBot }) {

  bot.on('pre_checkout_query', async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;

    if (SHOP_ITEMS[payload]) {
      await ctx.answerPreCheckoutQuery(true);
    } else {
      await ctx.answerPreCheckoutQuery(false, { error_message: t(ctx, 'payment.invalid_item') });
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    const item = SHOP_ITEMS[payload];
    if (!item) return;

    if (payload === 'xp_booster') {
      ctx.session.inventory.xp_booster = { expires_at: Date.now() + 24 * 60 * 60 * 1000 };
    } else if (payload === 'streak_freeze') {
      ctx.session.inventory.streak_freeze = (ctx.session.inventory.streak_freeze || 0) + 1;
    } else if (payload === 'priority_match') {
      ctx.session.inventory.priority_match = (ctx.session.inventory.priority_match || 0) + 5;
    }

    await ctx.reply(
      t(ctx, 'payment.success', { emoji: item.emoji, name: item.name }),
      { parse_mode: 'Markdown' }
    );
  });
}

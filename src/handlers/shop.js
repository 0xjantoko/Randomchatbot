import { t } from '../locales/index.js';

const SHOP_ITEMS = {
  xp_booster: {
    name: '⚡ XP Booster',
    description: '2x XP selama 24 jam',
    descriptionEn: '⚡ 2x XP for 24 hours',
    price: 50,
    emoji: '⚡'
  },
  streak_freeze: {
    name: '❄️ Streak Freeze',
    description: 'Lindungi streak 1 hari (habis pakai)',
    descriptionEn: '❄️ Protect streak for 1 day (one use)',
    price: 30,
    emoji: '❄️'
  },
  priority_match: {
    name: '🚀 Priority Match',
    description: 'Prioritas cari partner (5 match)',
    descriptionEn: '🚀 Priority matching (5 matches)',
    price: 40,
    emoji: '🚀'
  }
};

export function registerShopHandlers(bot, { bot: apiBot }) {

  bot.command('shop', async (ctx) => {
    let msg = t(ctx, 'shop.title');
    for (const [key, item] of Object.entries(SHOP_ITEMS)) {
      const desc = ctx.session.language === 'en' ? (item.descriptionEn || item.description) : item.description;
      msg += t(ctx, 'shop.item_line', { emoji: item.emoji, name: item.name, desc, price: item.price });
    }
    let lines = '';
    for (const key of Object.keys(SHOP_ITEMS)) {
      const item = SHOP_ITEMS[key];
      lines += t(ctx, 'shop.buy_item_line', { key, emoji: item.emoji, name: item.name });
    }
    msg += t(ctx, 'shop.buy_instruction', { lines });
    msg += t(ctx, 'shop.inventory_footer');

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('buy', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ').slice(1);
    const itemKey = args[0];

    if (!itemKey || !SHOP_ITEMS[itemKey]) {
      await ctx.reply(t(ctx, 'shop.unknown_item'), { parse_mode: 'Markdown' });
      return;
    }

    const item = SHOP_ITEMS[itemKey];

    try {
      await apiBot.api.sendInvoice(userId, {
        title: item.name,
        description: ctx.session.language === 'en' ? (item.descriptionEn || item.description) : item.description,
        payload: itemKey,
        currency: 'XTR',
        prices: [{ label: item.name, amount: item.price }]
      });
    } catch (e) {
      console.error('buy error:', e.message);
      await ctx.reply(t(ctx, 'shop.buy_failed'), { parse_mode: 'Markdown' });
    }
  });

  bot.command('inventory', async (ctx) => {
    const inv = ctx.session.inventory || {};
    const entries = Object.entries(inv).filter(([_, v]) => {
      if (typeof v === 'object' && v.expires_at) return v.expires_at > Date.now();
      if (typeof v === 'number') return v > 0;
      return false;
    });

    if (entries.length === 0) {
      await ctx.reply(t(ctx, 'shop.inventory_empty'), { parse_mode: 'Markdown' });
      return;
    }

    let msg = t(ctx, 'shop.inventory_title');
    for (const [key, value] of entries) {
      const def = SHOP_ITEMS[key];
      if (!def) continue;
      if (typeof value === 'object' && value.expires_at) {
        const remaining = Math.max(0, Math.ceil((value.expires_at - Date.now()) / 3600000));
        msg += t(ctx, 'shop.item_timed', { emoji: def.emoji, name: def.name, hours: remaining }) + '\n';
      } else if (typeof value === 'number') {
        msg += t(ctx, 'shop.item_uses', { emoji: def.emoji, name: def.name, count: value }) + '\n';
      }
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });
}

export { SHOP_ITEMS };

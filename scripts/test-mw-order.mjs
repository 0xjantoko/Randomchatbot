/**
 * Uji urutan middleware grammY ASLI (bukan fake bot):
 * apakah handler message:text onboarding (didaftr duluan, return tanpa next)
 * menelan pesan sehingga chat.js tak pernah dapat?
 *
 * Jalankan: node scripts/test-mw-order.mjs
 */
process.env.DB_PATH = './tmp-mw.db';
process.env.HASH_SECRET ||= 'x';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.BOT_TOKEN ||= '1:TEST';

// DB segar tiap run — violation count persisten di DB bisa mencemari case
{
  const fs = await import('node:fs');
  for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-journal`]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }
}

const { Bot, session } = await import('grammy');
const { initDatabase, getDb } = await import('../src/database/db.js');
const { initSessionTable, sessionStorage } = await import('../src/services/session-storage.js');
initSessionTable();
// Persis seperti index.js: session middleware SEBELUM semua handler
const attachSession = (b) => b.use(session({
  initial: () => ({ state: null, step: null, user: null, age: null, gender: null, location: null, language: null, anonymous_id: null, inventory: {} }),
  storage: sessionStorage
}));
const { registerHandlers } = await import('../src/handlers/index.js');
const { PoolService } = await import('../src/services/pool.js');
const { SessionService } = await import('../src/services/session.js');
const { XPService } = await import('../src/services/xp.js');
const { AchievementService } = await import('../src/services/achievements.js');
const { LeaderboardService } = await import('../src/services/leaderboard.js');
const config = (await import('../src/config.js')).default;

initDatabase();

const bot = new Bot('123456:TEST_TOKEN_NOT_REAL');
// Hindari panggilan getMe asli — set botInfo manual
bot.botInfo = { id: 123456, is_bot: true, first_name: 'T', username: 'testbot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
// Block semua panggilan API Telegram asli — WAJIB via transformer,
// karena handleUpdate membuat Api baru per update (stub bot.api tak dipakai ctx)
const apiCalls = [];
bot.api.config.use((prev, method, payload) => {
  apiCalls.push({ m: method, args: [payload.chat_id ?? payload.callback_query_id, payload] });
  // grammY expect ApiResponse penuh: { ok, result }
  return { ok: true, result: { message_id: 1, date: 0, chat: { id: payload.chat_id ?? 0, type: 'private' } } };
});

const poolService = new PoolService();
const sessionService = new SessionService(poolService);
const achievementService = new AchievementService();
const xpService = new XPService(achievementService);
const leaderboardService = new LeaderboardService();

attachSession(bot);
registerHandlers(bot, { poolService, sessionService, xpService, achievementService, leaderboardService, config, bot });

// Buat user 777 sedang dalam sesi (state normal, BUKAN onboarding)
await sessionService.createSession(777, 888,
  { user_id: 777, age: 25, gender: 'M', location: 'Jkt', language: 'id', _ageBracket: '20s' },
  { user_id: 888, age: 26, gender: 'F', location: 'Jkt', language: 'id', _ageBracket: '20s' });

const mkUpdate = (text) => ({
  update_id: 1,
  message: {
    message_id: 10, date: Math.floor(Date.now() / 1000),
    chat: { id: 777, type: 'private' },
    from: { id: 777, is_bot: false, first_name: 'T' },
    text,
    // grammY bot.command() WAJIB punya entity bot_command di offset 0
    ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {})
  }
});

let pass = 0, fail = 0;
const check = (label, cond) => { console.log(`${cond ? '✅' : '❌'} ${label}`); cond ? pass++ : fail++; };

// 1. Pesan chat biasa di dalam sesi
apiCalls.length = 0;
await bot.handleUpdate(mkUpdate('halo partner, apa kabar'));
const forwardedToPartner = apiCalls.some(c => c.m === 'sendMessage' && c.args[0] === 888);
check('pesan sesi diteruskan ke partner (chat.js dapat giliran)', forwardedToPartner);

// 2. Command /skip tetap jalan
apiCalls.length = 0;
await bot.handleUpdate(mkUpdate('/skip'));
const skipAck = apiCalls.some(c => c.m === 'sendMessage' && c.args[0] === 777);
if (!skipAck) console.log('DEBUG apiCalls(/skip):', JSON.stringify(apiCalls));
check('command /skip dijawab', skipAck);

// 3. Onboarding state masih menangani pesan (state=onboarding_age)
await sessionService.endSession(777, 'test').catch(() => {});
// default key grammY = ctx.chatId
await sessionStorage.write('777', { state: 'onboarding_age', step: 'age', language: 'id', inventory: {} });
apiCalls.length = 0;
await bot.handleUpdate(mkUpdate('25'));
const replyText = (c) => String(c.m === 'sendMessage' ? (c.args[1]?.text ?? '') : '');
const onboardingAskedVerify = apiCalls.some(c => c.m === 'sendMessage' && /verifikasi|lahir/i.test(replyText(c)));
if (!onboardingAskedVerify) console.log('DEBUG apiCalls(onboarding):', JSON.stringify(apiCalls.map(replyText)));
check('onboarding (state=onboarding_age) tetap menangani umur → lanjut age_verify', onboardingAskedVerify);

// ===== PAKET A =====
const { updateUserProfile, getUserProfile } = await import('../src/database/db.js');
const { clearTrustCache } = await import('../src/services/trust.js');
// User 777: verified (>=3 sesi) supaya lolos trust gate foto/voice
await sessionStorage.delete('777');
updateUserProfile(777, { sessions_completed: 5, trust_level: 'verified' });
updateUserProfile(888, { sessions_completed: 5, trust_level: 'verified' });
clearTrustCache();
await sessionService.createSession(777, 888,
  { user_id: 777, age: 25, gender: 'M', location: 'Jkt', language: 'id', _ageBracket: '20s' },
  { user_id: 888, age: 26, gender: 'F', location: 'Jkt', language: 'id', _ageBracket: '20s' });

const mkMsg = (message) => ({
  update_id: 2,
  message: { message_id: 20, date: Math.floor(Date.now() / 1000), chat: { id: 777, type: 'private' }, from: { id: 777, is_bot: false, first_name: 'T' }, ...message }
});
const mkPhoto = (caption) => mkMsg({ photo: [{ file_id: 'PH', file_unique_id: 'PHU', width: 1, height: 1 }], ...(caption ? { caption } : {}) });

// A1: caption foto berisi no HP → DIBLOKIR (R2), foto tak diteruskan
apiCalls.length = 0;
await bot.handleUpdate(mkPhoto('wa aku 081234567890 ya'));
const a1 = !apiCalls.some(c => c.m === 'sendPhoto' && c.args[0] === 888);
check('A1 caption foto no HP → block-forward', a1);
if (!a1) console.log('DEBUG A1:', JSON.stringify(apiCalls.map(c => c.m)));

// A2: caption foto ketemu → DIBLOKIR
apiCalls.length = 0;
await bot.handleUpdate(mkPhoto('kita ketemu besok ya'));
const a2 = !apiCalls.some(c => c.m === 'sendPhoto' && c.args[0] === 888);
check('A2 caption foto ajakan ketemu → block-forward', a2);

// A3: foto tanpa caption → lolos (blind_photo ke partner)
apiCalls.length = 0;
await bot.handleUpdate(mkPhoto(null));
const a3 = apiCalls.some(c => c.m === 'sendMessage' && c.args[0] === 888 && /FOTO BLIND/i.test(String(c.args[1]?.text ?? '')));
if (!a3) console.log('DEBUG A3:', JSON.stringify(apiCalls.map(c => [c.m, c.args[0], String(c.args[1]?.text ?? '').substring(0, 70)])));
check('A3 foto tanpa caption → tetap diteruskan (blind)', a3);

// A4: contact card → blokir + warning
apiCalls.length = 0;
await bot.handleUpdate(mkMsg({ contact: { phone_number: '081234567890', first_name: 'X', user_id: 999 } }));
const a4 = !apiCalls.some(c => c.m === 'sendContact' && c.args[0] === 888) &&
           apiCalls.some(c => c.m === 'sendMessage' && c.args[0] === 777 && /Menyertakan|peringatan|Peringatan|lapor/i.test(String(c.args[1]?.text ?? '')));
if (!a4) console.log('DEBUG A4:', JSON.stringify(apiCalls.map(c => [c.m, c.args[0], String(c.args[1]?.text ?? '').substring(0, 50)])));
check('A4 contact card → diblokir + warning', a4);

// A4 memicu auto-ban personal_info (memang desainnya) — bersihkan utk case berikut
const { bannedCache } = await import('../src/services/banned-cache.js');
bannedCache.remove(777);
updateUserProfile(777, { trust_level: 'verified', sessions_completed: 5 });
clearTrustCache();

// A5: video_note (tipe jatuh) → TIDAK diteruskan + feedback user
apiCalls.length = 0;
await bot.handleUpdate(mkMsg({ video_note: { file_id: 'VN', file_unique_id: 'VNU', length: 1, duration: 1 } }));
const a5 = !apiCalls.some(c => c.m === 'sendVideoNote' && c.args[0] === 888) &&
           apiCalls.some(c => c.m === 'sendMessage' && c.args[0] === 777 && /tidak didukung|not supported/i.test(String(c.args[1]?.text ?? '')));
if (!a5) console.log('DEBUG A5:', JSON.stringify(apiCalls.map(c => [c.m, c.args[0], String(c.args[1]?.text ?? '').substring(0, 60)])));
check('A5 video_note → fail-closed + feedback', a5);

// A6: pesan teks normal SETELAH catch-all → masih diteruskan (catch-all tak menelan)
apiCalls.length = 0;
await bot.handleUpdate(mkUpdate('lanjut ngobrol normal'));
const a6 = apiCalls.some(c => c.m === 'sendMessage' && c.args[0] === 888 && String(c.args[1]?.text ?? '').includes('lanjut ngobrol'));
check('A6 teks setelah catch-all → tetap diteruskan', a6);

console.log(`\n${pass} pass · ${fail} fail`);
try { await sessionStorage.delete('777'); } catch (_) {}
try { getDb().close(); } catch (_) {}
try {
  const fs = await import('node:fs');
  for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-journal`]) {
    if (f && fs.existsSync(f)) fs.unlinkSync(f);
  }
} catch (_) {}
process.exit(fail ? 1 : 0);

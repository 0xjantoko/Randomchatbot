/**
 * POV-EVADER — simulasi penyerang (bypass attempts) vs bot R2.
 * Metode: harness sama dgn scripts/audit-rules.mjs — DB temp segar via DB_PATH,
 * initDatabase(), handler ASLI (chat.js / media.js / start.js) + fake bot (tanpa Telegram).
 * PASS = pesan pelanggaran DITANGKAP/BLOKIR. GAP = lolos sampai partner (dilaporkan jujur).
 * Jalankan: node scripts/pov-evader.mjs
 */
process.env.DB_PATH = `./pov-evader-${Date.now()}.db`;
process.env.HASH_SECRET ||= 'pov-secret';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);

const { initDatabase, getDb } = await import('../src/database/db.js');
const { registerChatHandlers } = await import('../src/handlers/chat.js');
const { registerMediaHandlers, checkViolation } = await import('../src/handlers/media.js');
const { registerStartHandler } = await import('../src/handlers/start.js');
const { normalizeLeet, digitizeLookalikes } = await import('../src/utils/leet.js');
initDatabase();

const C = { r: '\x1b[0m', red: '\x1b[91m', grn: '\x1b[92m', ylw: '\x1b[93m', cyn: '\x1b[96m', bold: '\x1b[1m' };
const h = (t) => console.log(`\n${C.bold}${C.cyn}═══ ${t} ═══${C.r}`);
const say = (k, m, c = '') => console.log(`${c}[${k}]${C.r} ${m}`);

// ---- fake bot (rekam semua outgoing) ----
const handlers = { cmds: {} };
const outbox = []; // {to, text}
const fakeBot = {
  on: (type, fn) => { (handlers[type] ||= []).push(fn); },
  command: (name, fn) => { (handlers.cmds[name] ||= []).push(fn); },
  api: {
    sendMessage: async (to, text) => { outbox.push({ to, text: String(text) }); return { message_id: 1 }; },
    sendPhoto: async (to) => { outbox.push({ to, text: '[PHOTO]' }); return { message_id: 2 }; },
    sendVoice: async (to) => { outbox.push({ to, text: '[VOICE]' }); return { message_id: 3 }; },
    deleteMessage: async () => true
  }
};

const partnerId = 2002;
const sessionService = {
  isInSession: () => true,
  getPartner: () => partnerId,
  getSession: () => null,
  getUserProfile: () => ({ anonymous_id: 'Anon-TEST' }),
  updateActivity: () => {},
  endSession: async () => ({ partnerId, session: {} })
};
const noop = { addXP: () => null, getProfile: () => null, check: () => [], ensureProfile: () => {} };

registerChatHandlers(fakeBot, {
  sessionService, xpService: noop, achievementService: noop, poolService: { setSkipCooldown: () => {} }
});
registerMediaHandlers(fakeBot, { sessionService, xpService: noop, achievementService: noop });
registerStartHandler(fakeBot, {
  config: { LANGUAGE_OPTIONS: { id: 'Indonesia', en: 'English' }, ADMIN_IDS: [] },
  poolService: { isInPool: () => true, getSkipCooldown: () => 0, isSpamSkipping: () => false },
  sessionService, xpService: noop
});

const { bannedCache } = await import('../src/services/banned-cache.js');
bannedCache.init?.();

const ctxFor = (uid, text, bracket) => ({
  from: { id: uid },
  message: { text },
  session: { language: 'id', inventory: {}, user: { _ageBracket: bracket } },
  reply: async (t) => { outbox.push({ to: uid, text: '[SELF]' + String(t).slice(0, 60) }); }
});

let uidSeq = 7000;
const R = [];
function rec(id, label, pass, evidence) {
  R.push({ id, pass });
  say('CASE', `#${String(id).padEnd(2)} ${label} → ${pass ? `${C.grn}PASS (caught/blocked)${C.r}` : `${C.red}GAP (bypass)${C.r}`} | ${evidence}`);
}

/** dispatch teks lewat handler message:text ASLI; '/…' yg tak ditangani → next() (mirip grammy) */
async function dispatchText(uid, text, bracket = '20s', runCommand = false) {
  outbox.length = 0;
  const ctx = ctxFor(uid, text, bracket);
  let fell = false;
  for (const fn of handlers['message:text'] || []) {
    await fn(ctx, async () => { fell = true; });
  }
  if (runCommand && fell && text.startsWith('/')) {
    const cmd = text.slice(1).split(/[@\s]/)[0];
    for (const f of handlers.cmds[cmd] || []) await f(ctx);
  }
  return {
    reachedPartner: outbox.some(m => m.to === partnerId),
    partnerMsgs: outbox.filter(m => m.to === partnerId).map(m => m.text),
    selfMsgs: outbox.filter(m => m.to === uid).map(m => m.text)
  };
}

/** dispatch pesan tak-didukung lewat catch-all media.js bot.on('message') */
async function dispatchCatchAll(uid, payload, bracket = '20s') {
  outbox.length = 0;
  const ctx = ctxFor(uid, '', bracket);
  ctx.message = payload;
  for (const fn of handlers['message'] || []) await fn(ctx, async () => {});
  return {
    reachedPartner: outbox.some(m => m.to === partnerId),
    selfMsgs: outbox.filter(m => m.to === uid).map(m => m.text)
  };
}

// ================= 1. PHONE 10 VARIAN =================
h('1. PHONE 10 VARIAN — checkViolation (personal_info?) + full chat.js pipeline');
const PHONES = [
  '081234567890', '0812-3456-7890', '0812 3456 7890', '0812.3456.7890',
  '+6281234567890', '62 812 3456 7890', 'o81234567890', '08l234567890',
  '08123456789o', 'wa: 0812 34 567 890'
];
let pid = 0;
for (const p of PHONES) {
  const id = ++pid;
  const v = checkViolation(++uidSeq, p, 'text', { bracket: '20s' });       // uid segar → tanpa carry-over strike
  const cat = v[0]?.category || '-';
  const r = await dispatchText(++uidSeq, p, '20s');
  const isPII = cat === 'personal_info';
  const blocked = !r.reachedPartner;
  rec(id, `"${p}"`, isPII && blocked,
    `direct=${cat}${v.length ? `(${v[0].reason})` : '(lolos)'} digitized="${digitizeLookalikes(p)}" leet="${normalizeLeet(p).slice(0, 24)}" partner=${r.reachedPartner ? 'SAMPAI' : 'blocked'}`);
}

// ================= 2. EXTREME SPACED =================
h('2. EXTREME SPACED PHONE');
{
  const msg = 'gabung wa: 0 8 1 2 3 4 5 6 7 8 9 0';
  const v = checkViolation(++uidSeq, msg, 'text', { bracket: '20s' });
  const r = await dispatchText(++uidSeq, msg, '20s');
  rec(11, `"${msg}"`, v.length > 0 && !r.reachedPartner,
    `direct=${v[0]?.category || 'lolos(safe=true)'} partner=${r.reachedPartner ? 'SAMPAI' : 'blocked'} (regex HP butuh digit berdempetan; 'wa:' tak match /wa aku|wa\\/saya/)`);
}

// ================= 3. LINKS =================
h('3. LINKS — migration');
const LINKS = ['t.me/x', 'instagram.com/x', 'wa.me/62812', 'line id: foo', 'add my telegram'];
for (const l of LINKS) {
  const v = checkViolation(++uidSeq, l, 'text', { bracket: '20s' });
  const r = await dispatchText(++uidSeq, l, '20s');
  rec(12 + LINKS.indexOf(l), `"${l}"`, v[0]?.category === 'migration' && !r.reachedPartner,
    `direct=${v[0]?.category || 'lolos'}${v.length ? `(${v[0].reason})` : ''} partner=${r.reachedPartner ? 'SAMPAI' : 'blocked'}`);
}

// ================= 4. CODED MEETUP =================
h('4. CODED MEETUP — keyword-based (gap = expected utk phrase tak terdaftar)');
const MEET = ['kopi dulu?', 'ntar ketemu', 'dm sini', 'meet irl', 'share lokasi'];
for (const m of MEET) {
  const v = checkViolation(++uidSeq, m, 'text', { bracket: '20s' });
  const r = await dispatchText(++uidSeq, m, '20s');
  rec(17 + MEET.indexOf(m), `"${m}"`, v.length > 0 && !r.reachedPartner,
    `direct=${v[0]?.category || 'lolos'}${v.length ? `(${v[0].reason})` : ''} partner=${r.reachedPartner ? 'SAMPAI' : 'blocked'}`);
}

// ================= 5. UNSUPPORTED MEDIA FAIL-CLOSED =================
h('5. UNSUPPORTED MEDIA — catch-all media.js:277-312 (harus TIDAK diteruskan)');
const UNSUPPORTED = ['video_note', 'document', 'location', 'poll', 'dice', 'game', 'venue'];
let mid = 0;
for (const t of UNSUPPORTED) {
  const r = await dispatchCatchAll(++uidSeq, { [t]: { dummy: true } });
  rec(22 + mid++, `media:${t}`, !r.reachedPartner,
    `partner=${r.reachedPartner ? 'SAMPAI(!)' : 'tidak'} reply=${r.selfMsgs[0] || 'ADA (blocked_type)'}`);
}
// sticker & animation — handler terpisah di atas catch-all
for (const t of ['sticker', 'animation']) {
  outbox.length = 0;
  const ctx = ctxFor(++uidSeq, '', '20s');
  ctx.message = { [t]: { dummy: true } };
  for (const fn of handlers[`message:${t}`] || []) await fn(ctx, async () => {});
  const reached = outbox.some(m => m.to === partnerId);
  rec(29 + mid++, `media:${t} (blocked early, media.js:${t === 'sticker' ? '117-123' : '109-115'})`, !reached,
    `partner=${reached ? 'SAMPAI(!)' : 'tidak'} reply=${outbox.find(m => m.to !== partnerId)?.text || '-'}`);
  mid++;
}

// ================= 6. PHOTO CAPTION =================
h('6. PHOTO CAPTION + PHONE — checkViolation pada caption (gate media.js:154-164)');
{
  const caption = 'wa aku 081234567890';
  const v = checkViolation(++uidSeq, caption, 'text', { bracket: '20s' });
  // e2e: kirim photo handler ASLI dgn caption tsb
  outbox.length = 0;
  const ctx = ctxFor(++uidSeq, '', '20s');
  ctx.message = { photo: [{ file_id: 'FAKE' }], caption };
  for (const fn of handlers['message:photo'] || []) await fn(ctx, async () => {});
  const reached = outbox.some(m => m.to === partnerId);
  const selfMsgs = outbox.filter(m => m.to !== partnerId).map(m => m.text);
  const captionGateHit = selfMsgs.some(s => /Menyertakan|phone number/i.test(s));
  rec(31, `photo caption "${caption}"`,
    v[0]?.category === 'personal_info' && !reached,
    `direct=${v[0]?.category}(${v[0]?.reason}) e2e partner=${reached ? 'SAMPAI(!)' : 'tidak'} reply=${JSON.stringify(selfMsgs).slice(0, 90)}${captionGateHit ? ' [caption gate]' : ' [trust/other gate dulu — gate caption tdk sempat jalan]'}`);
}

// ================= 7. CONTACT CARD =================
h('7. CONTACT CARD — jalur personal_info (media.js:295-305)');
{
  const phone = '+6281234567890';
  const v = checkViolation(++uidSeq, `contact:${phone}`, 'text', { bracket: '20s' });
  const r = await dispatchCatchAll(++uidSeq, { contact: { phone_number: phone, vcard: 'BEGIN:VCARD' } });
  rec(32, `contact card ${phone}`, v[0]?.category === 'personal_info' && !r.reachedPartner,
    `direct=${v[0]?.category}(${v[0]?.reason}) partner=${r.reachedPartner ? 'SAMPAI(!)' : 'tidak'} reply=${r.selfMsgs[0] || '-'}`);
}

// ================= 8. DECOY COMMAND =================
h('8. DECOY "/" — chat.js:24 return next() SEBELUM cek PII');
{
  // 8a. /start <PII> — apakah lolos check & apakah ada sink forward?
  const r = await dispatchText(++uidSeq, '/start 081234567890', '20s', true);
  const piiWarn = r.selfMsgs.some(s => /phone number|Menyertakan/i.test(s));
  // catatan: tidak ada forward utk '/' text — chat.js:91 tak tercapai; start.js:8-11 reply ke pengirim saja
  rec(33, 'decoy "/start 081234567890"', false, // check SENGAJA disc痕 — lihat evidence
    `PII-check di-skip=${!piiWarn ? 'YA (chat.js:24 next() sebelum checkViolation chat.js:41)' : 'tidak'} partner=${r.reachedPartner ? 'SAMPAI' : 'tidak (start.js:8-11 reply ke pengirim saja — tak ada sink forward)'} → coverage GAP, TAPI tak bisa forward`);
  R[R.length - 1].note = 'SKIP-NO-LEAK';

  // 8b. /report <PII> — chat.js:212 mengirim `Alasan: ${reason}` (argumen user) ke partner
  const r2 = await dispatchText(++uidSeq, '/report wa aku 081234567890', '20s', true);
  const leak = r2.partnerMsgs.find(s => /081234567890/.test(s));
  rec(34, 'decoy "/report wa aku 081234567890"', !leak,
    leak ? `LEAK: partner menerima "${leak.slice(0, 70).replace(/\n/g, ' ')}" (chat.js:212)` : 'blocked');
}

// ================= RINGKASAN =================
h('RINGKASAN POV-EVADER');
const caught = R.filter(x => x.pass).length;
const gaps = R.filter(x => !x.pass && x.note !== 'SKIP-NO-LEAK').length;
const skipNoLeak = R.filter(x => x.note === 'SKIP-NO-LEAK').length;
for (const x of R) console.log(`  #${String(x.id).padEnd(2)} ${x.pass ? 'PASS' : (x.note === 'SKIP-NO-LEAK' ? 'SKIP' : 'GAP ')}`);
console.log(`\n${caught} caught / ${R.length} variants / ${gaps} gaps${skipNoLeak ? ` (+${skipNoLeak} check-skip tanpa forward sink)` : ''}`);

try { getDb().close(); } catch (_) {}
try {
  const fs = await import('node:fs');
  for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-journal`]) {
    if (f && fs.existsSync(f)) fs.unlinkSync(f);
  }
} catch (_) {}
process.exit(0);

/**
 * POV CASUAL — simulasi user normal/well-behaved adult terhadap bot.
 * Jalankan: node scripts/pov-casual.mjs
 * Fresh temp DB via process.env.DB_PATH (suffix Date.now()) SEBELUM import src/database/db.js.
 */
process.env.DB_PATH = `./sim-pov-${Date.now()}.db`;
process.env.HASH_SECRET ||= 'pov-casual-secret';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);

const fs = await import('node:fs');

const { initDatabase, getDb, createUserProfile, getUserProfile } = await import('../src/database/db.js');
initDatabase();

const config = (await import('../src/config.js')).default;
const { getAgeBracket, PoolService } = await import('../src/services/pool.js');
const { registerOnboardingHandlers } = await import('../src/handlers/onboarding.js');
const { checkViolation } = await import('../src/handlers/media.js');
const { checkPersonalInfo } = await import('../src/utils/privacy.js');
const { contextParameter } = await import('../src/handlers/chat.js');
const { SessionService } = await import('../src/services/session.js');
const { resolveTrust, clearTrustCache } = await import('../src/services/trust.js');
const { XPService } = await import('../src/services/xp.js');
const { bannedCache } = await import('../src/services/banned-cache.js');
bannedCache.init?.();

const results = [];
const rec = (n, label, pass, detail) => {
  results.push({ n, pass });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${n}. ${label} — ${detail}`);
};

// ---------- helpers ----------
const makeFakeBot = () => {
  const handlers = {};
  return {
    handlers,
    on: (type, fn) => { (handlers[type] ||= []).push(fn); },
    command: (name, fn) => { (handlers[`cmd:${name}`] ||= []).push(fn); },
    api: { sendMessage: async () => ({ message_id: 1 }), sendPhoto: async () => ({ message_id: 1 }) }
  };
};
const noopSvc = { addXP: () => null, getProfile: () => null, check: () => [], unlockIfAny: () => {} };

// ================= 1. Onboard age 26 =================
try {
  const bot = makeFakeBot();
  registerOnboardingHandlers(bot, {
    config,
    poolService: { addToPool: async () => {}, findMatch: async () => null, setSkipCooldown: () => {} },
    sessionService: { isInSession: () => false },
    xpService: noopSvc, achievementService: noopSvc
  });
  const replies = [];
  const ctx = {
    from: { id: 9001 },
    session: { language: 'id', state: 'onboarding_age', step: 'age' },
    message: { text: '26' },
    reply: async (t) => { replies.push(String(t)); return { message_id: 1 }; }
  };
  for (const fn of bot.handlers['message:text'] || []) await fn(ctx, () => {});

  const accepted = ctx.session.age === 26 && ctx.session.step === 'age_verify';
  const bracket = getAgeBracket(ctx.session.age);

  const pool = new PoolService();
  const u1 = { user_id: 9001, age: 26, gender: 'M', language: 'id', preference: 'F', gender_prefs: ['M', 'F', 'O'] };
  const u2 = { user_id: 9002, age: 24, gender: 'F', language: 'id', preference: 'M', gender_prefs: ['M', 'F', 'O'] };
  await pool.addToPool(u1);
  await pool.addToPool(u2);
  const match = await pool.findMatch(u1);
  const ok = accepted && bracket === '20s' && pool.isInPool(9001) && match && match._ageBracket === '20s';
  rec(1, 'Onboard 26', !!ok,
    `accepted=${accepted} step=${ctx.session.step} bracket=${bracket} inPool=${pool.isInPool(9001)} matchWith=${match?.user_id ?? 'null'} matchBracket=${match?._ageBracket ?? '-'}`);
  globalThis.__pool = pool;
} catch (e) {
  rec(1, 'Onboard 26', false, `CRASH: ${e.message}`);
}

// ================= 2. Flirt/sexual id+en → no blocking violation =================
try {
  const msgs = [
    ['id', 'eh sayang, kamu seksi banget malam ini, aku sange pengen pegang kamu'],
    ['en', 'I am so horny looking at you baby, you are gorgeous, I want you tonight']
  ];
  let uid = 9100;
  const detail = [];
  let allClear = true;
  for (const [lang, text] of msgs) {
    const v = checkViolation(++uid, text, 'text', { bracket: '20s' });
    if (v.length) allClear = false;
    detail.push(`${lang}: violations=${v.length}[${v.map(x => x.category).join(',') || '-'}]`);
  }
  rec(2, 'R1 flirt/sexual adult id+en', allClear, detail.join(' | '));
} catch (e) {
  rec(2, 'R1 flirt/sexual adult id+en', false, `CRASH: ${e.message}`);
}

// ================= 3. contextParameter over 10 neutral msgs =================
try {
  const uid = 9200;
  const msgs = [
    'halo apa kabar', 'aku lagi duduk santai', 'hari ini cerah sekali',
    'sudah makan belum kamu', 'mau nonton film nanti malam', 'lagi santai aja di rumah',
    'lagi di jalan nih', 'paketku sampai sore', 'tidur jam sebelas', 'mantap sekali itu'
  ];
  const totals = [];
  let crash = null;
  try {
    for (const m of msgs) totals.push(contextParameter.record(uid, m).total);
  } catch (e) { crash = e.message; }
  const inRange = totals.every(t => Number.isFinite(t) && t >= 0 && t <= 100);
  const finalScore = contextParameter.getScore(uid);
  const verdict = contextParameter.getVerdict(uid);
  const ok = !crash && totals.length === 10 && inRange;
  rec(3, 'contextParameter 10 neutral', ok,
    `crash=${crash ?? 'none'} scores=[${totals.join(',')}] final=${finalScore} verdict=${verdict.verdict} messages=${verdict.messages}`);
} catch (e) {
  rec(3, 'contextParameter 10 neutral', false, `CRASH: ${e.message}`);
}

// ================= 4. personal_info classification =================
try {
  const benign = checkPersonalInfo('aku dari bandung, 26 th');
  const phone = checkPersonalInfo('081234567890');
  const phoneViol = checkViolation(9150, '081234567890', 'text', { bracket: '20s' });
  const benignIsNotPI = benign.safe === true && benign.category !== 'personal_info';
  const phoneIsPI = phone.category === 'personal_info' && phoneViol[0]?.category === 'personal_info';
  rec(4, 'personal_info filter', benignIsNotPI && phoneIsPI,
    `"aku dari bandung, 26 th" → safe=${benign.safe} cat=${benign.category} | "081234567890" → safe=${phone.safe} cat=${phone.category} violCat=${phoneViol[0]?.category ?? '-'} (viol=${phoneViol.length})`);
} catch (e) {
  rec(4, 'personal_info filter', false, `CRASH: ${e.message}`);
}

// ================= 5. Skip cooldown normal + spam =================
try {
  const pool = globalThis.__pool || new PoolService();
  const uid = 9300;
  pool.setSkipCooldown(uid, '20s');
  const firstCd = pool.getSkipCooldown(uid);   // expect ~5s
  const firstSpam = pool.isSpamSkipping(uid);  // expect false
  for (let i = 0; i < 4; i++) pool.setSkipCooldown(uid, '20s'); // 4 skips in <60s
  const spam = pool.isSpamSkipping(uid);       // expect true
  const spamCd = pool.getSkipCooldown(uid);    // expect 30
  const ok = !firstSpam && firstCd >= 4 && firstCd <= 5 && spam === true && spamCd === 30;
  rec(5, 'Skip cooldown/spam', ok,
    `first: cooldown=${firstCd}s spam=${firstSpam} | after 4 skips: isSpamSkipping=${spam} cooldown=${spamCd}s`);
} catch (e) {
  rec(5, 'Skip cooldown/spam', false, `CRASH: ${e.message}`);
}

// ================= 6. Trust journey shadow → verified =================
try {
  const pool = globalThis.__pool || new PoolService();
  const sess = new SessionService(pool);
  const me = 9400, partner = 9401;
  createUserProfile(me);
  const profA = { user_id: me, age: 26, gender: 'M', language: 'id', preference: 'F', _ageBracket: '20s', _ageVerified: true, trust_level: 'shadow' };
  const profB = { user_id: partner, age: 27, gender: 'F', language: 'id', preference: 'M', _ageBracket: '20s', _ageVerified: true, trust_level: 'shadow' };

  clearTrustCache(me);
  const before = resolveTrust(me);
  for (let i = 0; i < 3; i++) {
    await sess.createSession(me, partner, profA, profB);
    await sess.endSession(me, 'manual');
  }
  clearTrustCache(me); // wajib: cache TTL 30s
  const after = resolveTrust(me);
  const row = getUserProfile(me);
  const ok = before === 'shadow' && after === 'verified' && row.sessions_completed === 3;
  rec(6, 'Trust shadow→verified', ok,
    `before=${before} after=${after} sessions_completed=${row.sessions_completed} trust_level=${row.trust_level}`);
} catch (e) {
  rec(6, 'Trust shadow→verified', false, `CRASH: ${e.message}`);
}

// ================= 7. getPhotoTimer (internal fn di media.js) =================
try {
  const src = fs.readFileSync(new URL('../src/handlers/media.js', import.meta.url), 'utf8');
  const m = src.match(/function getPhotoTimer\(ageBracket\)\s*\{[^}]*\}/);
  if (!m) throw new Error('getPhotoTimer source not found');
  const getPhotoTimer = new Function(`return (${m[0]});`)();
  const t20 = getPhotoTimer('20s'), tMinor = getPhotoTimer('minor'), t30 = getPhotoTimer('30plus');
  const ok = t20 === 10 && tMinor === 3;
  rec(7, 'Photo timer', ok, `'20s'=${t20} 'minor'=${tMinor} '30plus'=${t30} (expect 10/3)`);
} catch (e) {
  rec(7, 'Photo timer', false, `CRASH: ${e.message}`);
}

// ================= 8. addXP → profile XP > 0 =================
try {
  const xp = new XPService(null);
  const uid = 9500;
  const r1 = xp.addXP(uid, 'message', {}, 1);
  const r2 = xp.addXP(uid, 'message', {}, 1);
  const r3 = xp.addXP(uid, 'message', {}, 1);
  const prof = xp.getProfile(uid);
  const ok = prof && prof.xp > 0;
  rec(8, 'addXP +2/msg', !!ok,
    `per-msg amounts=[${r1?.amount},${r2?.amount},${r3?.amount}] final xp=${prof?.xp} level=${prof?.level} total_messages=${prof?.total_messages}`);
  xp.stop();
} catch (e) {
  rec(8, 'addXP +2/msg', false, `CRASH: ${e.message}`);
}

// ================= SUMMARY =================
const passCount = results.filter(r => r.pass).length;
console.log('---');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.n}`);
console.log(`${passCount}/8 PASS`);

try { getDb().close(); } catch (_) {}
try {
  for (const f of fs.readdirSync('.')) {
    if (f.startsWith('./sim-pov-') || f.startsWith('sim-pov-')) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  }
} catch (_) {}
process.exit(0);

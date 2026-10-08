/**
 * Test moderation P0 — bracket-breach enforcement (quarantine + ratchet + admin alert).
 * Usage: node scripts/test-moderation.mjs   (exit 1 kalau ada yang gagal)
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDb = path.join(os.tmpdir(), `rcb-moderation-test-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;
process.env.BOT_TOKEN ||= '123456:TEST_TOKEN_NOT_REAL';
process.env.HASH_SECRET ||= 'test-hash-secret';
process.env.ADMIN_API_KEY ||= 'test-admin-key';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);

const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { classifyBreach, enforceBracketBreach, BREACH, GROOMING_EVICT_THRESHOLD } = await imp('src/services/moderation.js');
const { quarantineUser, clearQuarantine, getModerationInfo, getQuarantinedUsers, setBracketLock, initGamificationTables } = await imp('src/database/db.js');
const { getProfile } = await imp('src/services/behavioral.js');
const { tLang } = await imp('src/locales/index.js');

initGamificationTables();

// ---- profil sintetis ----
const adultStats = {
  totalMessages: 10, totalWords: 100, totalLength: 800,
  typoCount: 1, emojiCount: 1, capslockCount: 0, questionCount: 2,
  slangHits: 5, schoolVocabHits: 0, adultVocabHits: 15, groomingSignalHits: 0
};
const minorStats = {
  totalMessages: 10, totalWords: 60, totalLength: 900,
  typoCount: 2, emojiCount: 2, capslockCount: 1, questionCount: 3,
  slangHits: 18, schoolVocabHits: 6, adultVocabHits: 1, groomingSignalHits: 0
};

function makeProfile(userId, stats) {
  return Object.assign(getProfile(userId), stats);
}

const results = [];
function test(name, fn) {
  try { fn(); results.push({ ok: true, name }); }
  catch (e) { results.push({ ok: false, name, err: e.message }); }
}
async function testAsync(name, fn) {
  try { await fn(); results.push({ ok: true, name }); }
  catch (e) { results.push({ ok: false, name, err: e.message }); }
}

// ---- 1. klasifikasi ----
test('classifyBreach: <3 pesan → null', () => {
  assert.equal(classifyBreach({ totalMessages: 2 }, 'minor').kind, null);
});

test('classifyBreach: pola adult di Pool Minor → EVICT', () => {
  const d = classifyBreach({ ...adultStats }, 'minor');
  assert.equal(d.kind, BREACH.EVICT);
  assert.match(d.reason, /adult_pattern_in_minor_pool/);
});

test(`classifyBreach: grooming ≥${GROOMING_EVICT_THRESHOLD} sinyal di Pool Minor → EVICT`, () => {
  const d = classifyBreach({ ...minorStats, groomingSignalHits: GROOMING_EVICT_THRESHOLD }, 'minor');
  assert.equal(d.kind, BREACH.EVICT);
  assert.match(d.reason, /grooming_signals_minor_pool/);
});

test('classifyBreach: pola minor tapi klaim adult → RATCHET_MINOR', () => {
  const d = classifyBreach({ ...minorStats }, '20s');
  assert.equal(d.kind, BREACH.RATCHET_MINOR);
});

test('classifyBreach: adult normal di pool adult → tidak ada breach', () => {
  assert.equal(classifyBreach({ ...adultStats }, '20s').kind, null);
});

// ---- 2. enforcement EVICT ----
const sent = [];
const ended = [];
const botApi = { sendMessage: async (id, text) => { sent.push({ id, text }); } };
const sessionService = {
  endSession: async (userId, reason) => { ended.push({ userId, reason }); return { partnerId: 555 }; },
  poolService: { removeFromPool: () => {} }
};

await testAsync('enforce: EVICT → quarantine DB + sesi dihentikan + user & 2 admin diberi tahu', async () => {
  const userId = 91001;
  makeProfile(userId, adultStats);
  const decision = await enforceBracketBreach(userId, 'minor', {
    sessionService, botApi, language: 'id', adminIds: [1, 2]
  });
  assert.equal(decision.kind, BREACH.EVICT);

  const info = getModerationInfo(userId);
  assert.ok(info.quarantined_at, 'quarantined_at harus terisi');
  assert.match(info.quarantine_reason, /adult_pattern_in_minor_pool/);
  assert.equal(info.trust_level, 'flagged');

  assert.deepEqual(ended, [{ userId, reason: 'bracket_breach' }]);
  const userNotice = sent.find(m => m.id === userId);
  assert.ok(userNotice, 'user harus dapat notifikasi');
  assert.ok(!userNotice.text.includes('moderation.'), 'pesan user harus ter-translate');
  assert.equal(sent.filter(m => m.id === 1 || m.id === 2).length, 2, 'kedua admin harus dapat alert');
  assert.match(sent.find(m => m.id === 1).text, /BRACKET BREACH/);
});

test('quarantine: user masuk antrean review admin', () => {
  const queue = getQuarantinedUsers(10);
  assert.ok(queue.some(u => u.user_id === 91001));
});

test('quarantine: release admin mengosongkan status', () => {
  clearQuarantine(91001);
  assert.equal(getModerationInfo(91001).quarantined_at, null);
  assert.equal(getQuarantinedUsers(10).some(u => u.user_id === 91001), false);
});

test('quarantine: user dengan quarantined_at terisi akan diblokir onboarding', () => {
  quarantineUser(91002, 'test');
  assert.ok(getModerationInfo(91002).quarantined_at);
  clearQuarantine(91002);
});

// ---- 3. enforcement RATCHET ----
await testAsync('enforce: RATCHET → bracket_locked=minor + sesi dihentikan, tanpa quarantine', async () => {
  const userId = 92001;
  makeProfile(userId, minorStats);
  const decision = await enforceBracketBreach(userId, '20s', {
    sessionService, botApi, language: 'id', adminIds: [1]
  });
  assert.equal(decision.kind, BREACH.RATCHET_MINOR);

  const info = getModerationInfo(userId);
  assert.equal(info.bracket_locked, 'minor');
  assert.equal(info.quarantined_at, null, 'ratchet bukan quarantine — user tetap bisa chat di Pool Minor');
  assert.ok(ended.some(e => e.userId === userId && e.reason === 'bracket_ratchet'));
});

test('bracket lock: permanen di DB', () => {
  setBracketLock(93001, 'minor');
  assert.equal(getModerationInfo(93001).bracket_locked, 'minor');
});

// ---- 4. i18n ----
test('i18n: semua kunci moderation resolve di id & en tanpa placeholder tersisa', () => {
  const keys = ['moderation.quarantine_blocked', 'moderation.evict_notice', 'moderation.ratchet_notice'];
  for (const lang of ['id', 'en']) {
    for (const key of keys) {
      const msg = tLang(lang, key);
      assert.notEqual(msg, key, `${key} (${lang}) tidak resolve`);
      assert.ok(!/\{[a-z_]+\}/.test(msg), `${key} (${lang}) masih ada placeholder`);
    }
  }
  const alert = tLang('id', 'moderation.admin_evict', { anon: 'Anon-ABC123', userId: 1, reason: 'r', confidence: '0.91', claimed: 'minor' });
  assert.ok(alert.includes('Anon-ABC123') && alert.includes('0.91'));
});

// ---- report ----
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : ' → ' + r.err}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} pass · ${failed} fail`);
try { (await imp('node:fs')).rmSync(tmpDb, { force: true }); } catch {}
process.exit(failed ? 1 : 0);

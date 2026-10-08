/**
 * Test P1 — evidence terenkripsi, cooldown re-match Pool Minor, trust gating, sync MIN_AGE.
 * Usage: node scripts/test-p1.mjs   (exit 1 kalau ada yang gagal)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDb = path.join(os.tmpdir(), `rcb-p1-test-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;
process.env.BOT_TOKEN ||= '123456:TEST_TOKEN_NOT_REAL';
process.env.HASH_SECRET ||= 'test-hash-secret';
process.env.ADMIN_API_KEY ||= 'test-admin-key';
process.env.LOG_ENCRYPTION_KEY ||= 'b'.repeat(64);
process.env.MIN_AGE = '13';
process.env.MAX_AGE = '99';

const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { recordMessage, flushEvidence, listEvidenceMeta, readEvidence, evidenceCount, bufferCount } = await imp('src/services/evidence.js');
const { recordMatchPair, hasRecentMatch, updateUserProfile, getUserProfile, incrementSessionsCompleted, quarantineUser, clearQuarantine, countEvidence } = await imp('src/database/db.js');
const { hashPairId } = await imp('src/utils/privacy.js');
const { PoolService } = await imp('src/services/pool.js');
const { SessionService } = await imp('src/services/session.js');
const { resolveTrust, canUseMedia, clearTrustCache } = await imp('src/services/trust.js');
const { tLang } = await imp('src/locales/index.js');

const results = [];
const test = (name, fn) => {
  try { fn(); results.push({ ok: true, name }); }
  catch (e) { results.push({ ok: false, name, err: e.message }); }
};
const testAsync = async (name, fn) => {
  try { await fn(); results.push({ ok: true, name }); }
  catch (e) { results.push({ ok: false, name, err: e.message }); }
};

// ============ P1.2 cooldown re-match ============
test('hashPairId simetris (urutan tidak berpengaruh)', () => {
  assert.equal(hashPairId(111, 222), hashPairId(222, 111));
  assert.notEqual(hashPairId(111, 222), hashPairId(111, 223));
});

test('hasRecentMatch: true di dalam window, false di luar window', () => {
  const key = hashPairId(1, 2);
  recordMatchPair(key);
  assert.equal(hasRecentMatch(key, 24 * 3600_000), true);
  assert.equal(hasRecentMatch(key, 0), false);
  assert.equal(hasRecentMatch(hashPairId(3, 4), 24 * 3600_000), false);
});

await testAsync('Pool Minor: partner yang baru match tidak di-match ulang', async () => {
  const pool = new PoolService();
  const minor = (id) => ({
    user_id: id, age: 15, language: 'id', gender: 'F',
    gender_prefs: ['M', 'F'], age_min: 13, age_max: 99, _ageBracket: 'minor'
  });
  const a = minor(7001);
  const b = minor(7002);

  await pool.addToPool(a);
  await pool.addToPool(b);
  const first = await pool.findMatch(a);
  assert.equal(first?.user_id, 7002, 'match pertama harus dapat partner');

  recordMatchPair(hashPairId(7001, 7002));
  await pool.removeFromPool(7001);
  await pool.removeFromPool(7002);
  await pool.addToPool(a);
  await pool.addToPool(b);
  const second = await pool.findMatch(a);
  assert.equal(second, null, 'match kedua harus diblokir cooldown 24 jam');

  // Pasangan yang belum pernah match tetap boleh
  await pool.removeFromPool(7002);
  const c = minor(7003);
  await pool.addToPool(c);
  const other = await pool.findMatch(a);
  assert.equal(other?.user_id, 7003);
});

// ============ P1.1 evidence ============
test('evidence: buffer in-memory diisi & dibatasi', () => {
  recordMessage(8001, 8002, 'pesan satu', { bracket: 'minor' });
  recordMessage(8001, 8002, 'pesan dua', { bracket: 'minor' });
  assert.equal(bufferCount(), 1);
  assert.equal(evidenceCount(), 0, 'belum dipersist sebelum flush');
});

test('evidence: flush → tersimpan terenkripsi & terbaca lagi', () => {
  recordMessage(8001, 8002, 'pesan tiga', { bracket: 'minor' });
  const res = flushEvidence(8001, 8002, { reason: 'test_breach', bracket: 'minor' });
  assert.ok(res?.id, 'flush harus mengembalikan id');
  assert.equal(res.messageCount, 3);

  const meta = listEvidenceMeta({ userId: 8001, limit: 5 });
  assert.equal(meta.length, 1);
  assert.equal(meta[0].reason, 'test_breach');
  assert.match(meta[0].anon_low, /^Anon-/);

  const full = readEvidence(meta[0].id);
  assert.equal(full.messages.length, 3);
  assert.equal(full.messages[0].text, 'pesan satu');
  assert.match(full.messages[0].anon, /^Anon-/);
  assert.equal(full.payload, undefined, 'ciphertext tidak boleh ikut terkirim');
});

test('evidence: buffer terpotong di 20 pesan', () => {
  for (let i = 0; i < 30; i++) recordMessage(8101, 8102, `m${i}`, { bracket: 'minor' });
  const res = flushEvidence(8101, 8102, { reason: 'ring_buffer', bracket: 'minor' });
  assert.equal(res.messageCount, 20);
  const meta = listEvidenceMeta({ userId: 8101, limit: 1 })[0];
  const full = readEvidence(meta.id);
  assert.equal(full.messages[0].text, 'm10');
  assert.equal(full.messages[19].text, 'm29');
});

test('evidence: prune TTL menghapus data lama', async () => {
  const { pruneEvidence } = await imp('src/database/db.js');
  const before = evidenceCount();
  const removed = pruneEvidence(0);
  assert.ok(removed.changes >= before, 'prune(0) harus menghapus semua bukti');
  assert.equal(evidenceCount(), 0);
});

await testAsync('evidence: sesi Pool Minor berakhir → transcript otomatis tersimpan', async () => {
  const sessionService = new SessionService({});
  const p1 = { user_id: 8201, age: 15, language: 'id', gender: 'F', _ageBracket: 'minor' };
  const p2 = { user_id: 8202, age: 16, language: 'id', gender: 'M', _ageBracket: 'minor' };
  await sessionService.createSession(p1.user_id, p2.user_id, p1, p2);
  recordMessage(8201, 8202, 'halo', { bracket: 'minor' });
  await sessionService.endSession(8201, 'skip');

  const meta = listEvidenceMeta({ userId: 8201, limit: 5 });
  assert.equal(meta.length, 1);
  assert.equal(meta[0].reason, 'session_end:skip');
  assert.equal(readEvidence(meta[0].id).messages[0].text, 'halo');
});

// ============ P1.3 trust gating ============
test('trust: user baru (shadow) → media terkunci', () => {
  const id = 8301;
  clearTrustCache(id);
  assert.equal(resolveTrust(id), 'shadow');
  assert.equal(canUseMedia(id), false);
});

test('trust: 3 sesi selesai → verified, media terbuka', () => {
  const id = 8302;
  clearTrustCache(id);
  for (let i = 0; i < 3; i++) incrementSessionsCompleted(id);
  clearTrustCache(id);
  assert.equal(resolveTrust(id), 'verified');
  assert.equal(canUseMedia(id), true);
});

test('trust: updateUserProfile upsert user baru (regresi no-op)', () => {
  const id = 8304;
  updateUserProfile(id, { sessions_completed: 0, trust_level: 'shadow' });
  assert.ok(getUserProfile(id), 'row user_profiles harus dibuat');
});

test('trust: flagged TIDAK naik ke verified walau 3+ sesi', () => {
  const id = 8305;
  quarantineUser(id, 'perm_flag');
  for (let i = 0; i < 5; i++) incrementSessionsCompleted(id);
  assert.equal(getUserProfile(id).trust_level, 'flagged');
  clearTrustCache(id);
  assert.equal(canUseMedia(id), false);
  clearQuarantine(id);
});

test('trust: flagged → terkunci permanen walau sesi banyak', () => {
  const id = 8303;
  updateUserProfile(id, { sessions_completed: 10 });
  quarantineUser(id, 'test_flag');
  clearTrustCache(id);
  assert.equal(resolveTrust(id), 'flagged');
  assert.equal(canUseMedia(id), false);
  clearQuarantine(id);
});

// ============ P1.5 MIN_AGE ============
test('MIN_AGE: gate onboarding memakai config (bukan hardcode)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/handlers/onboarding.js'), 'utf8');
  assert.match(src, /age < config\.MIN_AGE/, 'handleAge harus pakai config.MIN_AGE');
  assert.ok(!/age < 13/.test(src), 'hardcode 13 harus hilang');
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  assert.match(env, /^MIN_AGE=13$/m, '.env harus MIN_AGE=13 (selaras Rules §1)');
});

// ============ i18n ============
test('i18n: kunci media baru resolve di id & en', () => {
  for (const lang of ['id', 'en']) {
    for (const key of ['media.locked_shadow', 'media.locked_flagged', 'media.voice_minor_blocked']) {
      const msg = tLang(lang, key);
      assert.notEqual(msg, key, `${key} (${lang}) tidak resolve`);
    }
  }
});

// ============ report ============
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : ' → ' + r.err}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} pass · ${failed} fail`);
try { fs.rmSync(tmpDb, { force: true }); } catch {}
process.exit(failed ? 1 : 0);

/**
 * Simulasi beban — 100 / 1.000 / 100.000 user.
 *
 * Menjalankan pipeline NYATA per skala, diukur per fase:
 *   1. addToPool            (bucket language:bracket)
 *   2. findMatch + remove   (pairing, termasuk recent-match minor)
 *   3. createSession        (profile sanitize + recordMatchPair)
 *   4. message pipeline     (rateLimiter + checkViolation R2 + evidence + contextParameter)
 *   5. endSession           (trust increment + flushEvidence minor + behavioral eval drain)
 *
 * Jalankan: node scripts/simulate-load.mjs            (semua skala)
 *           node scripts/simulate-load.mjs 100000     (satu skala)
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DB_PATH = path.join(os.tmpdir(), `rcb-load-${Date.now()}.db`);
process.env.HASH_SECRET ||= 'load-test-secret';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.BOT_TOKEN ||= '1:TEST';

const { initDatabase, getDb } = await import('../src/database/db.js');
const { initSessionTable } = await import('../src/services/session-storage.js');
const { initGamificationTables } = await import('../src/database/db.js');
initDatabase();
initSessionTable();
try { initGamificationTables(); } catch (_) {}

const { PoolService } = await import('../src/services/pool.js');
const { SessionService } = await import('../src/services/session.js');
const { rateLimiter } = await import('../src/services/rate-limiter.js');
const { bannedCache } = await import('../src/services/banned-cache.js');
const { checkViolation } = await import('../src/handlers/media.js');
const { contextParameter } = await import('../src/handlers/chat.js');
const { recordMessage: recordEvidence } = await import('../src/services/evidence.js');

// --- redam log bulk (layanan banyak console.log) — hitung saja ---
let suppressed = 0;
const realLog = console.log.bind(console);
console.log = () => { suppressed++; };

const SCALES = process.argv[2] ? [Number(process.argv[2])] : [100, 1000, 100000];
const MSGS_PER_SESSION = 10;
const now = () => Number(process.hrtime.bigint() / 1000000n);
const memMB = () => {
  const m = process.memoryUsage();
  return { heap: Math.round(m.heapUsed / 1048576), rss: Math.round(m.rss / 1048576) };
};
const fmtMs = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

// Distribusi populasi: 15% minor, 55% 20s, 30% 30plus — bahasa id/en
// WAJIB set _ageBracket (persis onboarding.js:226) — tanpa ini checkAgeMatch
// jatuh ke default min=18 dan seluruh minor tak pernah match.
const bracketOf = (age) => age <= 17 ? 'minor' : age <= 29 ? '20s' : '30plus';
const makeUser = (uid) => {
  const r = Math.random();
  const age = r < 0.15 ? 13 + Math.floor(Math.random() * 5)
    : r < 0.70 ? 18 + Math.floor(Math.random() * 12)
    : 30 + Math.floor(Math.random() * 31);
  return {
    user_id: uid,
    age,
    gender: uid % 2 === 0 ? 'M' : 'F',
    gender_prefs: Math.random() < 0.8 ? ['M', 'F', 'O'] : ['M', 'F'],
    location: 'ID',
    language: Math.random() < 0.6 ? 'id' : 'en',
    _ageBracket: bracketOf(age)
  };
};

const rows = [];
for (const N of SCALES) {
  const pool = new PoolService();
  const sessionSvc = new SessionService(pool);
  const uidBase = N * 10; // uid unik antar skala
  const phases = [];

  // ---- 1. addToPool ----
  let t = now();
  const users = [];
  for (let i = 0; i < N; i++) {
    const u = makeUser(uidBase + i + 1);
    users.push(u);
    await pool.addToPool(u);
  }
  phases.push({ fase: '1. addToPool', n: `${N} user`, ms: now() - t, unit: 'user' });

  // ---- 2+3. findMatch → remove → createSession ----
  t = now();
  const sessions = [];
  for (const u of users) {
    if (sessionSvc.isInSession(u.user_id)) continue;
    if (!pool.isInPool(u.user_id)) continue;
    const m = await pool.findMatch(u);
    if (!m) continue;
    await pool.removeFromPool(u.user_id);
    await pool.removeFromPool(m.user_id);
    await sessionSvc.createSession(u.user_id, m.user_id, u, m);
    sessions.push([u.user_id, m.user_id]);
  }
  const matchMs = now() - t;
  phases.push({ fase: '2. match+session', n: `${sessions.length} pasang`, ms: matchMs, unit: 'pasang' });

  // ---- 4. message pipeline ----
  t = now();
  const neutral = ['halo', 'apa kabar', 'lagi apa', 'wkwk', 'santai aja', 'ga tau', 'keren',
    'tertawa gede', 'iya sih', 'emang bener', 'mau cerita nih', 'hmm menarik', 'makasih ya', 'sip'];
  let totalMsgs = 0;
  for (const [a, b] of sessions) {
    for (let k = 0; k < MSGS_PER_SESSION; k++) {
      const from = k % 2 === 0 ? a : b;
      const text = neutral[(k + a) % neutral.length];
      rateLimiter.checkMessage(from);
      checkViolation(from, text, 'text', { bracket: null });
      contextParameter.record(from, text);
      recordEvidence(from, k % 2 === 0 ? b : a, text, { bracket: null });
      totalMsgs++;
    }
  }
  const msgMs = now() - t;
  phases.push({ fase: '3. msg pipeline', n: `${totalMsgs} pesan`, ms: msgMs, unit: 'pesan' });

  // ---- 5. endSession (semua pasangan) ----
  t = now();
  for (const [a] of sessions) {
    await sessionSvc.endSession(a, 'load_sim');
  }
  const endMs = now() - t;
  // drain behavioral evaluateSession (fire-and-forget)
  await new Promise(r => setTimeout(r, N >= 100000 ? 2500 : 800));
  phases.push({ fase: '4. endSession+drain', n: `${sessions.length} sesi`, ms: now() - t, unit: 'sesi' });

  rows.push({ N, phases, matchMs, msgMs, unmatched: N - sessions.length * 2, mem: memMB() });
  sessionSvc.stop?.();
}

// ---- report ----
console.log = realLog;
realLog('=== SIMULASI BEBAN (pipeline nyata: pool → match → session → msg → end) ===');
for (const { N, phases, unmatched, mem } of rows) {
  realLog(`\n--- ${N} user ---`);
  const pad = Math.max(...phases.map(p => p.fase.length));
  for (const p of phases) {
    const rate = p.ms > 0 ? ` (${Math.round(p.n.match(/\d+/)[0] / (p.ms / 1000)).toLocaleString()} ${p.unit}/dtk)` : '';
    realLog(`  ${p.fase.padEnd(pad)}  ${fmtMs(p.ms).padStart(9)}  [${p.n}]${rate}`);
  }
  realLog(`  unmatched: ${unmatched} user · mem: heap ${mem.heap}MB / rss ${mem.rss}MB`);
}

// ---- scaling verdict ----
if (rows.length === 3) {
  realLog('\n--- Scaling verdict (harus ~10x utk 10x user) ---');
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const ratio = b.N / a.N;
    const m1 = a.phases[1].ms, m2 = b.phases[1].ms;
    const g1 = a.phases[2].ms, g2 = b.phases[2].ms;
    const f = (x, y) => y === 0 ? 'n/a' : `${(x / Math.max(y, 1)).toFixed(1)}x`;
    realLog(`  ${a.N}→${b.N}: match ${f(m1, m2)} · msg ${f(g1, g2)} (pertumbuhan ideal ${ratio}x)`);
  }
}
realLog(`\nsuppressed service logs: ${suppressed}`);
try { bannedCache.stop?.(); rateLimiter.stop?.(); } catch (_) {}
try { getDb().close(); } catch (_) {}
try { const fs = await import('node:fs'); fs.rmSync(process.env.DB_PATH, { force: true }); } catch (_) {}
process.exit(0);

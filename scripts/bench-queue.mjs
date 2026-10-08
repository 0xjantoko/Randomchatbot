/**
 * Micro-benchmark antrean pool — bukti O(n²) → O(1).
 *   node scripts/bench-queue.mjs
 * Ukur: addToPool N + removeFromPool N (tanpa match/session — isolasi queue).
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DB_PATH = path.join(os.tmpdir(), `rcb-bench-${Date.now()}.db`);
process.env.HASH_SECRET ||= 'x';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.BOT_TOKEN ||= '1:TEST';

const { initDatabase, getDb } = await import('../src/database/db.js');
initDatabase();
const { PoolService } = await import('../src/services/pool.js');

const N = Number(process.argv[2] || 100000);
const now = () => Number(process.hrtime.bigint() / 1000000n);
const bracketOf = (age) => age <= 17 ? 'minor' : age <= 29 ? '20s' : '30plus';

const pool = new PoolService();
const users = [];
for (let i = 0; i < N; i++) {
  const age = 18 + (i % 40);
  users.push({ user_id: 1000000 + i, age, gender: i % 2 ? 'M' : 'F', location: 'ID', language: i % 5 ? 'id' : 'en', _ageBracket: bracketOf(age) });
}

let t = now();
for (const u of users) await pool.addToPool(u);
const addMs = Number(now() - t);

t = now();
for (const u of users) await pool.removeFromPool(u.user_id);
const delMs = Number(now() - t);

console.log(`N=${N}`);
console.log(`  addToPool    ${addMs}ms  (${Math.round(N / (addMs / 1000)).toLocaleString()} user/dtk)`);
console.log(`  removeFromPool ${delMs}ms  (${Math.round(N / (delMs / 1000)).toLocaleString()} user/dtk)`);
console.log(`  pool residual: ${pool.getPoolSize()} · queue residual: ${pool.waitingQueue.size}`);
try { getDb().close(); } catch (_) {}
try { const fs = await import('node:fs'); fs.rmSync(process.env.DB_PATH, { force: true }); } catch (_) {}

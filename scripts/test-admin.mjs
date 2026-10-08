/**
 * Admin panel smoke test — start server ASLI (port acak), probe endpoint.
 *   node scripts/test-admin.mjs
 * Cek: (1) tanpa key → 401, (2) dgn key → 200, (3) static build tersaji,
 * (4) health, (5) key salah → 401, (6) evidence/quarantine/log API hidup.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3100 + (process.pid % 800);
const KEY = 'smoke-test-key-123';

process.env.ADMIN_PORT = String(PORT);
process.env.ADMIN_API_KEY = KEY;
process.env.DB_PATH = path.join(os.tmpdir(), `rcb-admin-${Date.now()}.db`);
process.env.HASH_SECRET ||= 'x'.repeat(16);
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.BOT_TOKEN ||= '1:TEST';

const { initDatabase, initGamificationTables } = await import('../src/database/db.js');
initDatabase();
try { initGamificationTables(); } catch (e) {}

const { startAdminServer } = await import('../src/admin/server.js');
const server = startAdminServer();
await new Promise((res) => server.listening ? res() : server.once('listening', res));

const base = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${cond ? '' : ' — ' + detail}`);
  cond ? pass++ : fail++;
};

const get = async (p, key) => {
  try {
    const r = await fetch(base + p, { headers: { ...(key ? { 'x-api-key': key } : {}), connection: 'close' } });
    return { status: r.status, body: await r.text() };
  } catch (e) { return { status: 0, body: e.message }; }
};

// 1. tanpa key → 401
let r = await get('/admin/api/metrics');
check('tanpa API key → 401', r.status === 401, `got ${r.status}`);

// 2. key salah → 401
r = await get('/admin/api/metrics', 'wrong-key');
check('key salah → 401', r.status === 401, `got ${r.status}`);

// 3. key benar → 200 + JSON
r = await get('/admin/api/metrics', KEY);
check('key benar → 200 JSON', r.status === 200 && r.body.includes('{'), `got ${r.status}`);

// 4. static build tersaji
r = await get('/admin/');
check('dashboard HTML tersaji (dist build)', r.status === 200 && /<html/i.test(r.body), `got ${r.status}`);

// 5. health publik
r = await get('/admin/health');
check('/admin/health → 200', r.status === 200, `got ${r.status}`);

// 6. endpoint inti hidup (200 dgn key; 500 db-only masih dianggap hidup jika bukan 404)
for (const p of ['/admin/api/quarantine', '/admin/api/evidence', '/admin/api/logs', '/admin/api/system', '/admin/api/traffic']) {
  r = await get(p, KEY);
  check(`${p} → ${r.status}`, r.status === 200, r.body.substring(0, 80));
}

// 7. SSE stream menolak tanpa key
r = await get('/admin/api/traffic/stream');
check('SSE stream tanpa key → 401', r.status === 401, `got ${r.status}`);

console.log(`\n${pass} pass · ${fail} fail`);
try { server.closeAllConnections?.(); server.close(); } catch (_) {}
try {
  const { getDb } = await import('../src/database/db.js');
  getDb().close();
} catch (_) {}
try {
  const fs = await import('node:fs');
  fs.rmSync(process.env.DB_PATH, { force: true });
} catch (_) {}
process.exit(fail ? 1 : 0);

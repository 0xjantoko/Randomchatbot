/**
 * Readiness check — static + integration smoke test WITHOUT starting the bot polling loop.
 * Usage: node scripts/readiness-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, detail = '') => results.push({ status: 'PASS', name, detail });
const bad = (name, detail = '') => results.push({ status: 'FAIL', name, detail });
const warn = (name, detail = '') => results.push({ status: 'WARN', name, detail });

// ---- isolated env (never touch real data.db, never hit Telegram) ----
const tmpDb = path.join(os.tmpdir(), `rcb-readiness-${Date.now()}.db`);
process.env.DB_PATH = tmpDb;
process.env.BOT_TOKEN ||= '123456:TEST_TOKEN_NOT_REAL';
process.env.HASH_SECRET ||= 'test-hash-secret';
process.env.ADMIN_API_KEY ||= 'test-admin-key';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);

const srcDir = path.join(ROOT, 'src');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const modules = walk(srcDir).filter((f) => {
  const rel = path.relative(srcDir, f).replace(/\\/g, '/');
  return rel !== 'index.js' && !rel.startsWith('simulate') && !rel.startsWith('admin/frontend');
});

// ---- 1. every module imports cleanly ----
for (const file of modules) {
  try {
    await import(pathToFileURL(file).href);
    ok('import ' + path.relative(ROOT, file).replace(/\\/g, '/'));
  } catch (e) {
    bad('import ' + path.relative(ROOT, file).replace(/\\/g, '/'), e.message.split('\n')[0]);
  }
}

// ---- 2. handler registration against a real Bot instance (no network) ----
let services = null;
try {
  const { Bot } = await import('grammy');
  const { registerHandlers } = await import(pathToFileURL(path.join(srcDir, 'handlers/index.js')).href);
  const { PoolService } = await import(pathToFileURL(path.join(srcDir, 'services/pool.js')).href);
  const { SessionService } = await import(pathToFileURL(path.join(srcDir, 'services/session.js')).href);
  const { XPService } = await import(pathToFileURL(path.join(srcDir, 'services/xp.js')).href);
  const { AchievementService } = await import(pathToFileURL(path.join(srcDir, 'services/achievements.js')).href);
  const { LeaderboardService } = await import(pathToFileURL(path.join(srcDir, 'services/leaderboard.js')).href);
  const { default: config } = await import(pathToFileURL(path.join(srcDir, 'config.js')).href);

  const bot = new Bot(process.env.BOT_TOKEN);
  const achievements = new AchievementService();
  services = {
    poolService: new PoolService(),
    sessionService: new SessionService({}),
    achievementService: achievements,
    xpService: new XPService(achievements),
    leaderboardService: new LeaderboardService(),
    config,
    bot
  };
  registerHandlers(bot, services);
  ok('registerHandlers()', 'all handlers registered without throwing');

  for (const s of ['poolService', 'sessionService', 'xpService', 'achievementService', 'leaderboardService']) {
    if (typeof services[s]?.stop !== 'function') warn(`${s}.stop()`, 'missing — shutdown/interval leak risk');
    else ok(`${s}.stop()`, 'present');
  }
} catch (e) {
  bad('registerHandlers()', e.message.split('\n')[0]);
}

// ---- 3. database schema on a fresh DB ----
try {
  const { initDatabase, getDb } = await import(pathToFileURL(path.join(srcDir, 'database/db.js')).href);
  const { initSessionTable } = await import(pathToFileURL(path.join(srcDir, 'services/session-storage.js')).href);
  initDatabase();
  initSessionTable();
  const db = getDb();
  // Trigger lazy gamification/moderation migrations (initGamificationTables)
  db.prepare('SELECT 1').get();
  const { getUserProfile } = await import(pathToFileURL(path.join(srcDir, 'database/db.js')).href);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const required = ['user_profiles', 'achievements', 'daily_rewards', 'sessions'];
  const missing = required.filter((t) => !tables.includes(t));
  missing.length ? bad('db schema', 'missing tables: ' + missing.join(', ')) : ok('db schema', tables.join(', '));

  const profileCols = tables.includes('user_profiles')
    ? (getUserProfile(0), db.prepare('PRAGMA table_info(user_profiles)').all().map((c) => c.name)) : [];
  const needed = ['xp', 'level', 'streak_days', 'total_referrals', 'quarantined_at', 'quarantine_reason', 'bracket_locked'];
  const gap = needed.filter((c) => !profileCols.includes(c));
  gap.length ? bad('user_profiles columns', 'missing: ' + gap.join(', ')) : ok('user_profiles columns');
  db.close();
} catch (e) {
  bad('db schema', e.message.split('\n')[0]);
}

// ---- 4. i18n key coverage in source ----
try {
  const { tLang } = await import(pathToFileURL(path.join(srcDir, 'locales/index.js')).href);
  const files = walk(srcDir).filter((f) => !f.includes('locales'));
  const keys = new Set();
  const re = /\bt(?:Lang\(\s*'[a-z]{2}'\s*,\s*|\(\s*(?:ctx|context)[^,]*,\s*)'([a-zA-Z0-9_.]+)'/g;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(re)) keys.add(m[1]);
  }
  const missing = [...keys].filter((k) => tLang('id', k) === k);
  missing.length
    ? bad('i18n id coverage', `${missing.length}/${keys.size} keys unresolved: ` + missing.join(', '))
    : ok('i18n id coverage', `${keys.size} keys resolve`);
} catch (e) {
  bad('i18n coverage', e.message.split('\n')[0]);
}

// ---- 5. real DB integrity (read-only) + admin build ----
try {
  const Database = (await import('better-sqlite3')).default;
  const real = path.join(ROOT, 'data.db');
  if (fs.existsSync(real)) {
    const rdb = new Database(real, { readonly: true, fileMustExist: true });
    const integrity = rdb.pragma('integrity_check')[0].integrity_check;
    integrity === 'ok' ? ok('data.db integrity') : bad('data.db integrity', integrity);
    rdb.close();
  } else {
    warn('data.db', 'not found');
  }
} catch (e) {
  bad('data.db integrity', e.message.split('\n')[0]);
}

const distEntry = path.join(ROOT, 'dist/admin/index.html');
fs.existsSync(distEntry) ? ok('admin build dist/') : warn('admin build dist/', 'run: npm run build:admin');

// ---- report ----
const pad = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌'} ${r.name.padEnd(pad)} ${r.detail}`);
const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\n${results.filter((r) => r.status === 'PASS').length} pass · ${results.filter((r) => r.status === 'WARN').length} warn · ${fails} fail`);
try { fs.rmSync(tmpDb, { force: true }); } catch {}
process.exit(fails ? 1 : 0);

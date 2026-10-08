/**
 * POV-MINOR — simulasi user 13-17 th (dilakukan langsung; subagent 2x crash).
 * Jalur: node scripts/pov-minor.mjs   (DB temp dibersihkan setelah run)
 * Skenario: R1 bebas intra-pool · R2 freeze/migration/PII · R3 isolasi · R4 cite.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(os.tmpdir(), `rcb-pov-minor-${Date.now()}.db`);
process.env.DB_PATH = DB;
process.env.HASH_SECRET ||= 'x';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.BOT_TOKEN ||= '1:TEST';

const { initDatabase, getDb } = await import('../src/database/db.js');
initDatabase();
const { checkViolation } = await import('../src/handlers/media.js');
const { PoolService } = await import('../src/services/pool.js');

let pass = 0, fail = 0;
const ok = (n, cond, ev) => { cond ? pass++ : fail++; console.log(`${cond ? '[PASS]' : '[FAIL]'} ${n} — ${ev}`); };

// 1. R1: konten eksplisit sesama minor TIDAK diblokir
const A = 911001, B = 911002;
const explicit = ['aku mau kamu banget', 'vcs sekarang?', 'malu apa, kita berdua doang'];
let v1 = [];
for (const t of explicit) v1.push(...checkViolation(A, t, 'text', { bracket: 'minor' }));
ok('1. R1 free intra-pool minor', v1.length === 0, `violations=${v1.length} (expected 0)`);

// 2. R2 migration + PII + freeze constant
const v2 = checkViolation(B, 'nih WA ku 081234567890 ketemu aja besok', 'text', { bracket: 'minor' });
const cats = [...new Set(v2.map(x => x.category))];
const dbSrc = fs.readFileSync(path.join(ROOT, 'src/database/db.js'), 'utf8');
const freezeConst = /MIGRATION_FREEZE_DURATION\s*=\s*(\d+)/.exec(dbSrc)?.[1];
ok('2. R2 migration+PII utk minor', cats.includes('migration') && cats.includes('personal_info')
  && freezeConst === '86400000', `cats=[${cats}] freezeConst=${freezeConst} (24h)`);

// 3. R2 coded phone (varian spasi + leet + titik — anti-bypass digitsOnly)
const coded = ['0812 3456 7890', 'o812-3456-7890', '0812.3456.7890'];
const v3 = coded.map((t, i) => checkViolation(911010 + i, t, 'text', { bracket: 'minor' })
  .some(v => v.category === 'personal_info'));
ok('3. R2 coded phone 3 varian', v3.every(Boolean), `per-varian=[${v3}]`);

// 4. R3: minor tak pernah match dgn bucket dewasa
const pool = new PoolService();
const mk = (id, age) => ({ user_id: id, age, gender: 'M', location: 'ID', language: 'id',
  _ageBracket: age <= 17 ? 'minor' : age <= 29 ? '20s' : '30plus' });
await pool.addToPool(mk(911101, 15));
await pool.addToPool(mk(911102, 16));
await pool.addToPool(mk(911103, 25));
await pool.addToPool(mk(911104, 32));
const found = [];
for (let i = 0; i < 5; i++) {
  const m = await pool.findMatch(mk(911101, 15));
  if (m) { found.push(m._ageBracket); await pool.removeFromPool(m.user_id); await pool.removeFromPool(911101); await pool.addToPool(mk(911101, 15)); }
}
ok('4. R3 isolasi bucket', found.length > 0 && found.every(b => b === 'minor'),
  `partners=[${found}] (harus semua 'minor')`);

// 4b. P1.3 — DEFENSE-IN-DEPTH: suntik minor BUKAN ke bucket-nya sendiri.
// Sebelum assertion (candidate._ageBracket !== bracket → skip), checkAgeMatch
// lolos (masing-masing cek range diri sendiri) → cross-bracket MATCH. Kini null.
const fake = { user_id: 911120, age: 15, gender: 'F', language: 'id',
  _ageBracket: 'minor', gender_prefs: ['M', 'F'], location: 'ID' };
pool.buckets.get('id:20s').set(911120, fake);
pool.pool.set(911120, fake);
const m4b = await pool.findMatch(mk(911103, 25));
ok('4b. P1.3 suntik minor ke bucket dewasa → TIDAK match', m4b === null,
  `match=${m4b ? `LEAK id=${m4b.user_id}` : 'null (fail-closed)'}`);

// 5. R4: konstanta moderasi EVICT (drive penuh terekam di scripts/pov-adult.mjs 8/8)
const modSrc = fs.readFileSync(path.join(ROOT, 'src/services/moderation.js'), 'utf8');
const conf = /MIN_CONFIDENCE\s*=\s*([\d.]+)/.exec(modSrc)?.[1];
const groom = /GROOMING_EVICT_THRESHOLD\s*=\s*(\d+)/.exec(modSrc)?.[1];
const evictInMod = /EVICT/.test(modSrc) && /adult_pattern_in_minor_pool|grooming_signals_minor_pool/.test(modSrc);
ok('5. R4 EVICT constants (PARTIAL cite)', conf === '0.6' && groom === '2' && evictInMod,
  `MIN_CONFIDENCE=${conf} GROOMING=${groom} paths present=${evictInMod}`);

console.log(`\n═══ RINGKASAN POV-MINOR ═══\n${pass}/${pass + fail} PASS`);
try { getDb().close(); } catch (_) {}
try { fs.rmSync(DB, { force: true }); fs.rmSync(DB + '-journal', { force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);

/**
 * test-policy — SATU pintu untuk seluruh kebijakan keamanan.
 *
 * Menjalankan semua suite sebagai child process terpisah (DB tak saling
 * mencemari), gagal = exit 1. Wajib dijalankan tiap kali pola/rule diubah
 * (red-team loop otomatis — lihat REKOMENDASI #3, AI-Native analysis).
 *
 *   node scripts/test-policy.mjs          # semua
 *   node scripts/test-policy.mjs --fast   # lewati simulasi berat (personas/abuse)
 *
 * Kebijakan yang diverifikasi:
 *   R1  intra-pool bebas         → audit-rules (R1 salah blokir = 0)
 *   R2  intersepsi keluar-pool   → audit-rules (8/8) + mw-order (Paket A)
 *   R3  no cross-line            → test-p1 + test-moderation
 *   R4  anti-hunting             → test-moderation + simulate-personas (EVICT)
 *   MW  urutan middleware grammY → test-mw-order
 *   Unit                        → test-parameter, readiness, simulate-abuse
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAST = process.argv.includes('--fast');

/** Elemen wajib tiap suite: exit 0 + pola output tertentu (kalau disediakan). */
const SUITES = [
  { name: 'mw-order (R2 Paket A + middleware)', file: 'scripts/test-mw-order.mjs' },
  { name: 'audit-rules (R1/R2 handler asli)', file: 'scripts/audit-rules.mjs', expect: [/R2 Wajib blokir\s*:\s*8\/8/, /Celah R2\s*:\s*tidak ada/, /R1 Salah blokir\s*:\s*tidak ada/] },
  { name: 'test-moderation (R3/R4)', file: 'scripts/test-moderation.mjs', expect: [/0 fail/] },
  { name: 'test-p1 (trust/breach)', file: 'scripts/test-p1.mjs', expect: [/0 fail/] },
  { name: 'test-parameter (context score)', file: 'scripts/test-parameter.mjs', expect: [/0 fail/] },
  { name: 'simulate-abuse (red-team)', file: 'src/simulate-abuse.js', heavy: true, expect: [/22 passed, 0 failed/] },
  { name: 'simulate-personas (R4 EVICT)', file: 'scripts/simulate-personas.mjs', heavy: true, expect: [/Adult predator\s*→\s*EVICT/] },
  { name: 'readiness (smoke)', file: 'scripts/readiness-check.mjs', expect: [/0 fail/] }
];

const run = (file) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(ROOT, file)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => out += d);
  p.stderr.on('data', d => out += d);
  p.on('close', code => resolve({ code, out }));
});

const results = [];
for (const s of SUITES) {
  if (s.heavy && FAST) { results.push({ ...s, status: 'SKIP', detail: '--fast' }); continue; }
  process.stdout.write(`▶ ${s.name} ... `);
  const { code, out } = await run(s.file);
  const missing = (s.expect || []).filter(re => !re.test(out));
  const status = code === 0 && missing.length === 0 ? 'PASS' : 'FAIL';
  const detail = status === 'PASS'
    ? 'ok'
    : code !== 0
      ? `exit ${code} — ${out.trim().split('\n').slice(-1)[0]?.substring(0, 100)}`
      : `pola tak cocok: ${missing.map(m => m.source).join('; ')}`;
  console.log(status === 'PASS' ? 'PASS' : `FAIL (${detail})`);
  results.push({ ...s, status, detail, out });
}

console.log('\n=== TEST-POLICY REPORT ===');
const pad = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  const mark = r.status === 'PASS' ? '[PASS]' : r.status === 'SKIP' ? '[SKIP]' : '[FAIL]';
  console.log(`${mark} ${r.name.padEnd(pad)}  ${r.detail}`);
}
const fails = results.filter(r => r.status === 'FAIL').length;
const skips = results.filter(r => r.status === 'SKIP').length;
console.log(`\n${results.filter(r => r.status === 'PASS').length} pass · ${skips} skip · ${fails} fail`);
process.exit(fails ? 1 : 0);

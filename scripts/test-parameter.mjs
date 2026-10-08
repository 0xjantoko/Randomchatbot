/**
 * Test Context Parameter — skor konteks dari kata kunci + slang + nomor HP.
 * Usage: node scripts/test-parameter.mjs   (exit 1 kalau gagal)
 */
import assert from 'node:assert/strict';
import { evaluateText, verdictOf, ContextParameter } from '../src/services/context-parameter.js';
import { normalizeLeet, digitizeLookalikes } from '../src/utils/leet.js';

const results = [];
const test = (name, fn) => {
  try { fn(); results.push({ ok: true, name }); }
  catch (e) { results.push({ ok: false, name, err: e.message }); }
};

// ---- leet utils ----
test('leet: normalizeLeet k3l4s → kelas', () => {
  assert.equal(normalizeLeet('k3l4s brp4'), 'kelas brpa');
});
test('leet: digitizeLookalikes 08l2 → 0812', () => {
  assert.equal(digitizeLookalikes('08l234567890'), '081234567890');
});

// ---- dimensi kata kunci ----
test('parameter: pesan grooming → keyword score tinggi + flag grooming', () => {
  const r = evaluateText('rahasia ya jangan bilang orang tua, ketemu aku nanti');
  assert.ok(r.scores.keyword >= 50, `keyword=${r.scores.keyword}`);
  assert.ok(r.flags.includes('grooming'));
});
test('parameter: grooming leet (r4h4s14) tetap terdeteksi', () => {
  const r = evaluateText('r4h4s14 y4, j4ng4n b1l4ng 0rtu4');
  assert.ok(r.flags.includes('grooming'), 'leet grooming harus kena');
});
test('parameter: pesan pelajar → keyword score rendah (weight negatif)', () => {
  const r = evaluateText('besok ada ulangan matematika, guru nyuruh belajar');
  assert.ok(!r.flags.includes('grooming'));
  assert.ok(r.scores.keyword < 30, `keyword=${r.scores.keyword}`);
});
test('parameter: pesan netral → total rendah, verdict low', () => {
  const r = evaluateText('halo lagi apa');
  assert.ok(r.total < 20, `total=${r.total}`);
  assert.equal(verdictOf(r.total), 'low');
});

// ---- dimensi slang ----
test('parameter: slang padat → slang score tinggi (termasuk leet s3ks)', () => {
  const r = evaluateText('wkwk gila anjing lu ini parah banget');
  assert.ok(r.scores.slang >= 50, `slang=${r.scores.slang}`);
  const rl = evaluateText('s3ks ng3w3 gila');
  assert.ok(rl.scores.slang >= 30, `leet slang=${rl.scores.slang}`);
});

// ---- dimensi nomor HP ----
test('parameter: no HP normal → phone=100 + flag phone_exposed', () => {
  const r = evaluateText('hubungi 081234567890 ya');
  assert.equal(r.scores.phone, 100);
  assert.ok(r.flags.includes('phone_exposed'));
});
test('parameter: no HP leet (08l…) → phone=100', () => {
  const r = evaluateText('wa aku 08l234567890');
  assert.equal(r.scores.phone, 100);
});
test('parameter: tanpa HP → phone=0', () => {
  assert.equal(evaluateText('santai aja di rumah').scores.phone, 0);
});

// ---- verdict ----
test('verdict: 0→low, 20→medium, 45→high, 70→critical', () => {
  assert.equal(verdictOf(5), 'low');
  assert.equal(verdictOf(30), 'medium');
  assert.equal(verdictOf(50), 'high');
  assert.equal(verdictOf(80), 'critical');
});
test('parameter: kombinasi grooming+HP → total ≥ 70 (critical)', () => {
  const r = evaluateText('rahasia ya jangan bilang, no hp 081234567890');
  assert.ok(r.total >= 70, `total=${r.total}`);
  assert.equal(verdictOf(r.total), 'critical');
});

// ---- akumulator ----
test('ContextParameter: akumulasi pesan + EMA + flags agregat', () => {
  const cp = new ContextParameter();
  cp.record(1, 'halo lagi apa');                        // rendah
  cp.record(1, 'rahasia jangan bilang ketemu aku');     // tinggi
  cp.record(1, 'foto dong kirim foto vcs yuk');          // tinggi
  const v = cp.getVerdict(1);
  assert.ok(v.messages === 3);
  assert.ok(v.score > 20, `score=${v.score}`);
  assert.ok(v.flags.includes('grooming'));
  assert.equal(verdictOf(v.score), v.verdict);
});
test('ContextParameter: user tanpa data → 0/low', () => {
  const cp = new ContextParameter();
  assert.equal(cp.getVerdict(999).verdict, 'low');
});

// ---- invariant: konten seks antar-peer TIDAK jadi flag (by design) ----
test('invariant: kata seks biasa tidak memicu flag (bot tak mempolisi konten)', () => {
  const r = evaluateText('kontol memek ngentot');
  assert.equal(r.flags.length, 0, `flags=${r.flags}`);
  assert.ok(!r.flags.includes('grooming'));
});

// ---- report ----
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : ' → ' + r.err}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);

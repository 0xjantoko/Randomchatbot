/**
 * Simulasi LEET/SLANG typing (s3ks, ng3w3, k0nt0l...) vs engine asli.
 * Bandingkan pasangan pesan IDENTIK: normal vs leet — dampak ke:
 *   1. normalisasi kata (extractFeatures: strip non a-z)
 *   2. grooming signal (includes pada teks mentah)
 *   3. klasifikasi bracket → EVICT / RATCHET (segregasi pool)
 *
 * Jalankan: node scripts/simulate-leet.mjs
 */
process.env.DB_PATH = './sim-leet.db';

const { initDatabase, getModerationInfo, getDb } = await import('../src/database/db.js');
const { PoolService, getAgeBracket } = await import('../src/services/pool.js');
const { SessionService } = await import('../src/services/session.js');
const { extractFeatures, getProfile, estimateAge, clearProfile } = await import('../src/services/behavioral.js');
const { classifyBreach, enforceBracketBreach } = await import('../src/services/moderation.js');
const { checkViolation } = await import('../src/handlers/media.js');
const { bannedCache } = await import('../src/services/banned-cache.js');

initDatabase();
bannedCache.init();

const C = { r: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[91m', grn: '\x1b[92m', ylw: '\x1b[93m', cyn: '\x1b[96m', mag: '\x1b[95m', bold: '\x1b[1m' };
const h = (t) => console.log(`\n${C.bold}${C.cyn}═══ ${t} ═══${C.r}`);
const say = (k, m, c = '') => console.log(`${c}[${k}]${C.r} ${m}`);
const sent = [];
const mockBotApi = { sendMessage: async (uid, text) => { sent.push({ uid, text }); return { message_id: 1 }; } };
const pool = new PoolService();
const sessions = new SessionService(pool);

function user(id, age, bracket, extra = {}) {
  return { user_id: id, age, gender: extra.gender || 'M', location: 'Jakarta', language: 'id',
    _ageBracket: bracket, _ageVerified: true, trust_level: extra.trust || 'shadow', ...extra };
}
async function pair(u1, u2) {
  await pool.addToPool(u1); await pool.addToPool(u2);
  const m = await pool.findMatch(u1);
  if (!m) return false;
  await pool.removeFromPool(u1.user_id); await pool.removeFromPool(u2.user_id);
  await sessions.createSession(u1.user_id, u2.user_id, u1, m);
  return true;
}
async function feed(uid, bracket, text) {
  const violations = checkViolation(uid, text, 'text', { bracket });
  const profile = getProfile(uid);
  extractFeatures(text, profile);
  let breach = null;
  if (profile.totalMessages >= 3) {
    breach = await enforceBracketBreach(uid, bracket, {
      sessionService: sessions, botApi: mockBotApi, language: 'id', adminIds: [999]
    });
  }
  return { violations, breach };
}
const stats = (uid) => {
  const p = getProfile(uid); const e = estimateAge(p);
  return { est: e.bracket, conf: +(e.confidence || 0).toFixed(2), gap: +(e.gap ?? 0).toFixed(2),
    slang: p.slangHits, school: p.schoolVocabHits, adult: p.adultVocabHits, groom: p.groomingSignalHits };
};

// ════════════════════════════════════════════════════════════
h('0. MEKANISME: bagaimana engine memproses kata leet');
// ════════════════════════════════════════════════════════════
say('NORMALISASI', 'extractFeatures: word.toLowerCase().replace(/[^a-z]/g,"") → huruf DIHAPUS, bukan dipetakan', C.ylw);
for (const w of ['k0nt0l', 'ng3w3', 'p3p3k', 's3ks', 'm3m3k', 'krj4', 'g4j1', 's3kol4h', 'wkwk']) {
  const n = w.toLowerCase().replace(/[^a-z]/g, '');
  say('CONTOH', `"${w}" → "${n}"`, C.dim);
}
say('IMPLIKASI', 'k0nt0l→"kntl" ≠ "kontol" (S slang GAGAL) | krj4→"krj" = "krj" (S slang adult KENA)', C.mag);
say('GROOMING', 'pencocokan pakai teks MENTAH (includes) → leet = SEMUA sinyal grooming lolos', C.mag);

// ════════════════════════════════════════════════════════════
h('A. MINOR↔MINOR: sexchat leet di Pool Minor (invarian: konten tak dipolisi)');
// ════════════════════════════════════════════════════════════
clearProfile(701);
const mA = user(701, 15, 'minor', { gender: 'M' });
const mB = user(702, 16, 'minor', { gender: 'F' });
say('MATCH', `minor × minor: ${await pair(mA, mB) ? '✅ MATCHED' : '❌ NO MATCH'}`);
const leetMinor = [
  'wkwk s3ks emng pgn bgt, k0nt0l g4d3',
  'ng3w3 m4l4m 1n0n? p3p3k dh g4t3',
  'ul4ng4n bsk, pr nmpuk bgt 😭',
  'k4mu k3l4s brp4? 4ku k3l4s 2 SMP'
];
for (const t of leetMinor) {
  const { violations, breach } = await feed(701, 'minor', t);
  say('MINOR-LEET→', `"${t.slice(0, 50)}" ${violations.length ? '⚠️ VIOLASI' : '✓ lolos'}`, C.dim);
  if (breach) say('⚡ ENGINE', `${breach.kind} (${breach.reason})`, C.mag);
}
say('STATS', JSON.stringify(stats(701)));
say('CLASSIFY', `claimed=minor → kind=${classifyBreach(getProfile(701), 'minor').kind ?? 'null'}`, C.grn);
say('VERDICT', 'sexchat leet antar-minor = TIDAK diapa-apakan (tak ada filter kata seks) → invariant terpenuhi', C.grn);

// ════════════════════════════════════════════════════════════
h('B. PREDATOR di Pool Minor — NORMAL vs LEET (identik makna)');
// ════════════════════════════════════════════════════════════
const predNormal = [
  'gue kerja di kantor, gaji bulanan lumayan, kost dekat situ',
  'kamu berapa umur sekarang? masih sekolah kan',
  'kamu cantik, aku suka kamu, percaya sama aku ya',
  'nanti kita ketemu dong, rahasia, jangan bilang orang tua'
];
const predLeet = [
  'gue krj4 d1 k4nt0r, g4j1 bulanan lumayan, k0st d3k4t s1tu',
  'k4mu brp4 umur s3krg? m4s1h s3kol4h kan',
  'k4mu c4nt1k, 4ku suk4 k4mu, perc4ya sm4 4ku y4',
  'n4nt1 k1t4 k3t3mu d0ng, r4h4s14, j4ng4n b1l4ng 0rtu4'
];
async function runPredator(tag, msgs, uid) {
  clearProfile(uid);
  const u = user(uid, 16, 'minor', { gender: 'M' });
  const v = user(uid + 1, 15, 'minor', { gender: 'F' });
  await pair(u, v);
  let breach = null;
  for (const t of msgs) {
    const r = await feed(uid, 'minor', t);
    if (r.breach) { breach = r.breach; break; }
  }
  const s = stats(uid);
  const mod = getModerationInfo(uid);
  say(tag, `est=${s.est} conf=${s.conf} school=${s.school} adult=${s.adult} groom=${s.groom} slang=${s.slang}`, C.cyn);
  say(tag, breach
    ? `⚡ EVICT — ${breach.reason}`
    : `🛑 TANPA EVICT → dia tetap di Pool Minor bersama anak-anak`, breach ? C.mag : C.red);
  say(tag, `DB: quarantined=${mod?.quarantined_at ? 'YA' : 'tidak'} trust=${mod?.trust_level ?? '-'}`, C.dim);
  return breach;
}
const bNormal = await runPredator('[NORMAL]', predNormal, 801);
const bLeet = await runPredator('[LEET ]', predLeet, 811);

// ════════════════════════════════════════════════════════════
h('C. MINOR klaim 22 di Pool Adult — NORMAL vs LEET (arahan RATCHET)');
// ════════════════════════════════════════════════════════════
const cNormal = [
  'aku masih kelas 3 SMA sih, besok masih ada pr numpuk',
  'waktu sekolah kemarin libur, guru nyuruh bawa bekal',
  'kamu udah pernah ngewe belum? jujur aja',
  'ulangan matematika susah banget, nilai aku jelek'
];
const cLeet = [
  '4ku m4s1h k3l4s 3 SMA s1h, bsk m4s1h 4d4 pr numpuk',
  'wktu s3kol4h k3m4r1n l1bur, gur0 nyur0h b4w4 b3k4l',
  'k4mu ud4h p3rn4h ng3w3 b3lum? jujur 4j4',
  'ul4ng4n m4t3m4t1k4 sus4h b4ng3t, n1l41 4ku j3l3k'
];
async function runMinor22(tag, msgs, uid) {
  clearProfile(uid);
  const u = user(uid, 22, '20s', { gender: 'M' });
  const v = user(uid + 1, 26, '20s', { gender: 'F' });
  await pair(u, v);
  let breach = null;
  for (const t of msgs) {
    const r = await feed(uid, '20s', t);
    if (r.breach) { breach = r.breach; break; }
  }
  const s = stats(uid);
  const mod = getModerationInfo(uid);
  say(tag, `est=${s.est} conf=${s.conf} gap=${s.gap} school=${s.school} adult=${s.adult} slang=${s.slang}`, C.cyn);
  say(tag, breach
    ? `⚡ ${breach.kind.toUpperCase()} — ${breach.reason}`
    : `🛑 TANPA RATCHET → tetap di Pool Adult (segregasi BOCOR)`, breach ? C.mag : C.red);
  say(tag, `DB: bracket_locked=${mod?.bracket_locked ?? 'tidak'}`, C.dim);
  return breach;
}
const rNormal = await runMinor22('[NORMAL]', cNormal, 821);
const rLeet = await runMinor22('[LEET ]', cLeet, 831);

// ════════════════════════════════════════════════════════════
h('D. VIOLATION FILTER: apakah leet lolos filter personal info?');
// ════════════════════════════════════════════════════════════
const tests = [
  ['no HP normal', '081234567890', '20s'],
  ['no HP leet', '08l234567890 wa ku', '20s'],
  ['username', 'add @randongx', 'minor'],
  ['kata seks normal', 'kontol memek ngentot', 'minor'],
  ['kata seks leet', 'k0nt0l m3m3k ng3w3', 'minor']
];
for (const [label, text, br] of tests) {
  const v = checkViolation(900, text, 'text', { bracket: br });
  say('TEST', `${label}: "${text}" → ${v.length ? '⚠️ ' + v.map(x => x.category).join(',') : '✓ lolos'}`, v.length ? C.red : C.grn);
}

// ════════════════════════════════════════════════════════════
h('E. ADVERSARIAL: predator MENIRU gaya minor + grooming pakai leet');
// ════════════════════════════════════════════════════════════
// Grooming dileet (lolos includes) DAN menulis seperti pelajar (lolos pola adult)
const predStealth = [
  'wkwk aku jg m4s1h s3kol4h ko, pr bnyk bgt',
  'k3l4s brp4 kmu? 4ku k3l4s 2 SMP',
  'r4h4s14 y4, j4ng4n b1l4ng 0rtu4',
  'k3t3mu d0ng nt4r, m4u g4? s3r4h dmn'
];
{
  clearProfile(841);
  const u = user(841, 16, 'minor', { gender: 'M' });
  const v = user(842, 15, 'minor', { gender: 'F' });
  await pair(u, v);
  let breach = null;
  for (const t of predStealth) {
    const r = await feed(841, 'minor', t);
    if (r.breach) { breach = r.breach; break; }
  }
  const s = stats(841);
  const mod = getModerationInfo(841);
  say('[STEALTH]', `est=${s.est} conf=${s.conf} school=${s.school} adult=${s.adult} groom=${s.groom}`, C.cyn);
  say('[STEALTH]', breach
    ? `⚡ EVICT — ${breach.reason}`
    : `🛑 TANPA EVICT → predator bertahan di Pool Minor (grooming leet=${s.groom}, pola tak terdeteksi)`, breach ? C.mag : C.red);
  say('[STEALTH]', `DB: quarantined=${mod?.quarantined_at ? 'YA' : 'tidak'} | keduanya lolos: groomingIncludes=${s.groom === 0 ? '❌ EVADED' : 'kena'} + adultPattern=${s.conf >= 0.6 && s.est !== 'minor' ? 'kena' : '❌ TIDAK'}`, C.dim);
}

// ════════════════════════════════════════════════════════════
h('RINGKASAN PERBANDINGAN');
// ════════════════════════════════════════════════════════════
console.log(`
B. Predator pool minor : NORMAL → ${bNormal ? 'EVICT ✅' : 'lolos ❌'}  |  LEET → ${bLeet ? 'EVICT ✅' : 'lolos ❌ (evasion)'}
C. Minor22 pool adult  : NORMAL → ${rNormal ? 'RATCHET ✅' : 'lolos ❌'}  |  LEET → ${rLeet ? 'RATCHET ✅' : 'lolos ❌ (evasion)'}
D. Filter konten seks  : TIDAK ADA (kata seks normal maupun leet lolos — sesuai invariant)
`);

try { getDb().close(); } catch (_) {}
process.exit(0);

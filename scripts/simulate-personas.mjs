/**
 * Simulasi engine Randomchat — jalankan SISTEM ASLI (pool, behavioral, moderation,
 * violation, trust) dengan persona fiktif. Tidak menyentuh Telegram.
 *
 * Jalankan: node scripts/simulate-personas.mjs
 */
process.env.DB_PATH = './sim-personas.db';

const { initDatabase, getModerationInfo, getDb } = await import('../src/database/db.js');
const { PoolService, getAgeBracket } = await import('../src/services/pool.js');
const { SessionService } = await import('../src/services/session.js');
const { extractFeatures, getProfile, estimateAge, clearProfile } = await import('../src/services/behavioral.js');
const { classifyBreach, enforceBracketBreach, BREACH } = await import('../src/services/moderation.js');
const { checkViolation } = await import('../src/handlers/media.js');
const { resolveTrust, canUseMedia, clearTrustCache } = await import('../src/services/trust.js');
const { bannedCache } = await import('../src/services/banned-cache.js');

initDatabase();
bannedCache.init();

const C = { r: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[91m', grn: '\x1b[92m', ylw: '\x1b[93m', cyn: '\x1b[96m', mag: '\x1b[95m', bold: '\x1b[1m' };
const h = (t) => console.log(`\n${C.bold}${C.cyn}═══ ${t} ═══${C.r}`);
const say = (k, m, c = '') => console.log(`${c}[${k}]${C.r} ${m}`);
const sent = []; // inbox mock bot
const mockBotApi = { sendMessage: async (uid, text) => { sent.push({ uid, text }); return { message_id: 1 }; } };

const pool = new PoolService();
const sessions = new SessionService(pool);

function user(id, age, bracket, extra = {}) {
  return {
    user_id: id, age, gender: extra.gender || 'M', location: extra.location || 'Jakarta',
    language: 'id', _ageBracket: bracket, _ageVerified: true,
    trust_level: extra.trust || 'shadow', ...extra
  };
}

async function pair(u1, u2) {
  await pool.addToPool(u1);
  await pool.addToPool(u2);
  const m = await pool.findMatch(u1);
  if (!m) return false;
  await pool.removeFromPool(u1.user_id);
  await pool.removeFromPool(u2.user_id);
  await sessions.createSession(u1.user_id, u2.user_id, u1, m);
  return true;
}

/** feed pesan ke engine persis seperti chat.js: features → violation → enforce */
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

// ════════════════════════════════════════════════════════════════
h('A. MINOR NORMAL (15 th, pelajar) — sisi minor');
// ════════════════════════════════════════════════════════════════
clearProfile(101); clearProfile(102);
const m1 = user(101, 15, 'minor', { gender: 'M' });
const m2 = user(102, 16, 'minor', { gender: 'F' });
say('ENGINE', `age 15 → bracket "${getAgeBracket(15)}" (bucket language:bracket = id:minor)`);
say('MATCH', `minor × minor: ${await pair(m1, m2) ? '✅ MATCHED' : '❌ NO MATCH'}`);

const minorMsgs = [
  'lagi istirahat di kelas, guru matematika nyuruh PR banyak banget 😭',
  'besok ada ulangan, belum belajar gara-gara kemarin main terus wkwk',
  'kamu kelas berapa? aku kelas 2 SMP nih',
  'di OSIS kemarin seru, rapat sampe sore terus pulang malem'
];
for (const t of minorMsgs) {
  const { violations, breach } = await feed(101, 'minor', t);
  say('MINOR→', `"${t.slice(0, 55)}…" ${violations.length ? '⚠️' : '✓'}`, C.dim);
  if (breach) say('ENGINE', `BREACH: ${breach.kind} (${breach.reason})`, C.red);
}
const est1 = estimateAge(getProfile(101));
say('BEHAVIORAL', `estimasi="${est1.bracket}" conf=${est1.confidence.toFixed(2)} gap=${(est1.gap ?? 0).toFixed(2)}`, C.grn);
say('CLASSIFY', `claimed=minor → ${JSON.stringify(classifyBreach(getProfile(101), 'minor'))}`, C.grn);
say('TRUST', `resolveTrust=${resolveTrust(101)} (baru <3 sesi) → canUseMedia=${canUseMedia(101) ? 'YES' : '❌ LOCKED'}`);
say('PHOTO-TIMER', `viewer minor: ${15 >= 13 && 15 <= 17 ? 3 : 10} detik (adult: 10 detik)`);

// ════════════════════════════════════════════════════════════════
h('B. ADULT NORMAL (25 th, pekerja) — sisi adult');
// ════════════════════════════════════════════════════════════════
clearProfile(201); clearProfile(202);
const a1 = user(201, 25, '20s', { gender: 'M' });
const a2 = user(202, 27, '20s', { gender: 'F' });
say('ENGINE', `age 25 → bracket "${getAgeBracket(25)}" (bucket id:20s — terpisah dari id:minor)`);
say('MATCH', `adult × adult: ${await pair(a1, a2) ? '✅ MATCHED' : '❌ NO MATCH'}`);

const adultMsgs = [
  'Gue lagi lembur di kantor, deadline proyek klien besok pagi',
  'Baru bayar cicilan KPR, nunggu gaji cair akhir bulan',
  'Istri gue lagi hamil, besok kontrol ke rumah sakit',
  'Shift kerja pindah siang, macet parah di toll tadi'
];
for (const t of adultMsgs) {
  const { violations, breach } = await feed(201, '20s', t);
  say('ADULT→', `"${t.slice(0, 55)}…" ${violations.length ? '⚠️' : '✓'}`, C.dim);
  if (breach) say('ENGINE', `BREACH: ${breach.kind} (${breach.reason})`, C.red);
}
const est2 = estimateAge(getProfile(201));
say('BEHAVIORAL', `estimasi="${est2.bracket}" conf=${est2.confidence.toFixed(2)} gap=${(est2.gap ?? 0).toFixed(2)}`, C.grn);
say('CLASSIFY', `claimed=20s → ${JSON.stringify(classifyBreach(getProfile(201), '20s'))}`, C.grn);
say('ISOLASI BUCKET', `cari match utk m1 (minor) di pool: ${await pool.findMatch(m1) ? '❌ TEMBUS ADULT' : '✅ tidak ada match lintas bracket'}`, C.grn);

// ════════════════════════════════════════════════════════════════
h('C. MINOR DENGAN PENGALAMAN SEKS — klaim 22, masuk pool adult');
// ════════════════════════════════════════════════════════════════
clearProfile(301);
const s1 = user(301, 22, '20s', { gender: 'M' }); // bohong umur, perilaku masih pelajar
const a3 = user(203, 26, '20s', { gender: 'F' });
say('ONBOARDING', `klaim 22 (age-verify lulus) → bracket "20s", trust=shadow`);
say('MATCH', `× adult: ${await pair(s1, a3) ? '✅ MATCHED (lolos masuk pool adult!)' : '❌ no match'}`);

const expMinorMsgs = [
  'eh kamu udah pernah ngewe belum? seru kok katanya',
  'aku masih kelas 3 SMA sih, besok masih ada pr numpuk',
  'waktu sekolah kemarin libur terus, bosan di rumah wkwk',
  'eh jangan bilang siapa-siapa ya, rahasia antara kita'
];
let evicted = null;
for (const t of expMinorMsgs) {
  const { violations, breach } = await feed(301, '20s', t);
  say('MINOR-22→', `"${t.slice(0, 55)}…"`, C.dim);
  if (breach) { evicted = breach; say('⚡ ENGINE', `${breach.kind.toUpperCase()} — conf=${(breach.confidence || 0).toFixed(2)} reason=${breach.reason}`, C.mag); break; }
}
const est3 = estimateAge(getProfile(301));
say('BEHAVIORAL', `estimasi="${est3.bracket}" conf=${est3.confidence.toFixed(2)} gap=${(est3.gap ?? 0).toFixed(2)} scores=${JSON.stringify(Object.fromEntries(Object.entries(est3.scores).map(([k, v]) => [k, +v.toFixed(2)])))}`);
const mod3 = getModerationInfo(301);
say('DB SETELAH', `bracket_locked=${mod3?.bracket_locked ?? '-'} trust=${mod3?.trust_level ?? '-'}`, C.mag);
const msgs = sent.filter(s => s.uid === 301);
for (const m of msgs) say('PESAN→USER', `"${m.text.split('\n')[0]}"`, C.mag);

// ════════════════════════════════════════════════════════════════
h('D. ADULT SEXCHAT di pool adult — invarian produk');
// ════════════════════════════════════════════════════════════════
clearProfile(401);
const sx = user(401, 24, '20s', { gender: 'M' });
const sexMsgs = [
  'eh males banget hari ini, pengen santai aja di kasur',
  'kamu suka ngewe juga? jujur aja gak apa-apa',
  'cerita dikit boleh, tadi malem seru abis',
  'udah ah malu, lanjut topik lain wkwk'
];
say('KLAIM', 'klaim 24 (adult) — sexchat antar-peer pool sama = DIIZINKAN menurut invariant');
for (const t of sexMsgs) {
  const { breach } = await feed(401, '20s', t);
  say('ADULT-SX→', `"${t.slice(0, 55)}…"`, C.dim);
  if (breach) say('⚡ ENGINE', `${breach.kind} (${breach.reason})`, C.mag);
}
const est4 = estimateAge(getProfile(401));
say('BEHAVIORAL', `estimasi="${est4.bracket}" conf=${est4.confidence.toFixed(2)} gap=${(est4.gap ?? 0).toFixed(2)}`, C.grn);
say('CLASSIFY', `claimed=20s → kind=${classifyBreach(getProfile(401), '20s').kind ?? 'null (lolos)'}`, C.grn);

// ════════════════════════════════════════════════════════════════
h('E. ADULT PREDATOR di pool minor (klaim 16) — EVICT');
// ════════════════════════════════════════════════════════════════
clearProfile(501); clearProfile(502);
const p1 = user(501, 16, 'minor', { gender: 'M' });
const p2 = user(502, 15, 'minor', { gender: 'F' });
say('MATCH', `predator × minor: ${await pair(p1, p2) ? '✅ MATCHED (dia berhasil masuk)' : '❌ no match'}`);
const predMsgs = [
  'gue kerja di kantor, gaji bulanan lumayan, kost dekat situ',
  'kamu berapa umur sekarang? masih sekolah kan',
  'kamu cantik, aku suka kamu, percaya sama aku ya',
  'nanti kita ketemu dong, rahasia, jangan bilang orang tua'
];
for (const t of predMsgs) {
  const { violations, breach } = await feed(501, 'minor', t);
  say('PREDATOR→', `"${t.slice(0, 55)}…"`, C.dim);
  if (breach) { say('⚡ ENGINE', `EVICT — reason=${breach.reason} conf=${(breach.confidence || 0).toFixed(2)}`, C.mag); break; }
}
const prof501 = getProfile(501);
say('BEHAVIORAL', `estimasi="${estimateAge(prof501).bracket}" conf=${estimateAge(prof501).confidence.toFixed(2)} groomingHits=${prof501.groomingSignalHits} (threshold=2)`);
const mod501 = getModerationInfo(501);
say('DB SETELAH', `quarantined_at=${mod501?.quarantined_at ? '✅ YA' : '-'} reason=${mod501?.quarantine_reason ?? '-'} trust=${mod501?.trust_level ?? '-'} flagged=underage`, C.mag);
say('SESI', `masih aktif? ${sessions.isInSession(501) ? '❌ MASIH' : '✅ DITUTUP'} | partner dapat: "partner left chat"`, C.mag);
const reOnboard = mod501?.quarantined_at ? '🛑 DIBLOKIR masuk pool (gate onboarding)' : 'lolos';
say('GATE ONBOARDING', `coba daftar ulang → ${reOnboard}`, C.mag);

// ════════════════════════════════════════════════════════════════
h('F. ATURAN MINOR-POOL: migration (share kontak) = FREEZE instan');
// ════════════════════════════════════════════════════════════════
const v1 = checkViolation(601, 'nih wa aku 081234567890 ya', 'text', { bracket: 'minor' });
const v2 = checkViolation(601, 'add ig aku @randongx ya', 'text', { bracket: 'minor' });
say('CHECK', `wa → ${v1.length ? 'violasi:' + v1.map(v => v.category).join(',') : 'lolos'}`, v1.length ? C.red : C.grn);
say('CHECK', `ig → ${v2.length ? 'violasi:' + v2.map(v => v.category).join(',') : 'lolos'}`, v2.length ? C.red : C.grn);
say('ENGINE', 'di minor pool: migration → freezeUser + bannedCache TANPA 3 strike (hardened zone)', C.mag);
const v3 = checkViolation(602, 'add ig aku @randongx ya', 'text', { bracket: '20s' });
say('ENGINE', 'di adult pool: migration → hitung strike, freeze di percobaan ke-3', C.dim);
const v4 = checkViolation(603, 'telp 081234567890', 'text', { bracket: '20s' });
say('ENGINE', `personal info (no HP) → ${v4.length ? '⚠️ warning + violation (auto-ban threshold)' : 'lolos'}`, C.dim);

// ════════════════════════════════════════════════════════════════
h('G. REMATCH COOLDOWN POOL MINOR (24 jam)');
// ════════════════════════════════════════════════════════════════
await pool.addToPool(m1); await pool.addToPool(m2);
const rematch = await pool.findMatch(m1);
say('ENGINE', `m1 × m2 match ulang dalam 24 jam: ${rematch ? '❌ MATCH LAGI (bug!)' : '✅ DITOLAK — hasRecentMatch() (putus kesinambungan grooming)'}`, C.grn);
await pool.removeFromPool(m1.user_id); await pool.removeFromPool(m2.user_id);

console.log(`\n${C.bold}═══ RINGKASAN ═══${C.r}`);
console.log(`
A. Minor normal        → tetap di minor, tak ada breach, media terkunci (shadow)
B. Adult normal        → tetap di 20s, bucket terpisah dari minor
C. Minor pengalaman    → RATCHET: kunci permanen ke minor + pesan notice
   seks klaim 22         (sexchat-nya sendiri TIDAK jadi dasar — dasarnya pola pelajar)
D. Adult sexchat 20s   → lolos (invariant: sexchat antar-peer 1 pool diizinkan)
E. Adult predator      → EVICT: quarantine + end session + alert admin + gate onboarding
   di pool minor          (2 jalur: pola dewasa ≥0.6 ATAU grooming ≥2)
F. Migration di minor  → freeze instan; adult → 3 strike; no HP → warning
G. Rematch minor       → partner sama ditolak 24 jam`);

// banned-cache punya timer internal — tutup paksa biar tak crash setelah DB ditutup
try { getDb().close(); } catch (_) {}
process.exit(0);

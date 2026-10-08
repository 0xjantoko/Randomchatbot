/**
 * POV ADVERSARIAL SIMULATION — Malicious adult predator vs RandomChatZ bot
 * ---------------------------------------------------------------------
 * Black-box attack simulation ONLY. Tidak mengubah file yang ada (cuma bikin script ini).
 *
 * Setiap skenario menjalankan jalur produksi yang ASLI:
 *   - chat pipeline  : handlers/chat.js (checkViolation → extractFeatures → enforceBracketBreach)
 *   - moderasi       : services/moderation.js (classifyBreach + enforceBracketBreach)
 *   - behavioral     : services/behavioral.js (extractFeatures + estimateAge + checkMismatch)
 *   - filter konten  : handlers/media.js checkViolation + utils/privacy.js checkPersonalInfo
 *   - auto-ban       : database/db.js logViolation (counter)
 *   - matchmaking    : services/pool.js (bucket + checkAgeMatch)
 *   - trust gate     : handlers/media.js photo/voice gate + services/trust.js resolveTrust
 *
 * Fresh temp DB: process.env.DB_PATH di-set SEBELUM import src/database/db.js.
 * Logs diarahkan ke temp dir (LOG_DIR) supaya logs/ yang ada tidak tersentuh.
 */
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env WAJIB di-set sebelum module apapun di-eval ─────────────────────
process.env.HASH_SECRET = process.env.HASH_SECRET || 'pov-adult-sim-secret';
const STAMP = Date.now();
process.env.DB_PATH = path.join(os.tmpdir(), `pov-adult-${STAMP}.db`);
process.env.LOG_DIR = path.join(os.tmpdir(), `pov-adult-logs-${STAMP}`); // jangan tulis logs/ yang ada

// ── Dynamic import (setelah env) ───────────────────────────────────────
const db = await import('../src/database/db.js');
const { PoolService } = await import('../src/services/pool.js');
const { SessionService } = await import('../src/services/session.js');
const behavioral = await import('../src/services/behavioral.js');
const moderation = await import('../src/services/moderation.js');
const { checkViolation } = await import('../src/handlers/media.js');
const { bannedCache } = await import('../src/services/banned-cache.js');
const trust = await import('../src/services/trust.js');
const { recordMessage: recordEvidence } = await import('../src/services/evidence.js');
const { evaluateText } = await import('../src/services/context-parameter.js');
const { checkPersonalInfo } = await import('../src/utils/privacy.js');

db.initDatabase();
bannedCache.init();

// ── Output helpers ─────────────────────────────────────────────────────
const R = '\x1b[91m', G = '\x1b[92m', C = '\x1b[96m', Y = '\x1b[93m', B = '\x1b[1m', X = '\x1b[0m';
const results = [];
function head(t) { console.log(`\n${B}━━━ ${t}${X}`); }
function ev(m) { console.log(`  ${C}·${X} ${m}`); }
function pass(n, t) { results.push({ n, ok: true, t }); console.log(`  ${G}PASS${X} #${n} — ${t}`); }
function fail(n, t) { results.push({ n, ok: false, t }); console.log(`  ${R}FAIL${X} #${n} — ${t}`); }

// ── Mock bot API (menggantikan grammy — sama seperti harness simulate-abuse) ──
const sent = [];
const mockBotApi = {
  sendMessage: async (uid, text) => { sent.push({ uid, text: String(text).replace(/\s+/g, ' ').slice(0, 90) }); return { message_id: sent.length }; },
  sendPhoto: async () => ({ message_id: 999 }),
  sendVoice: async () => ({ message_id: 999 }),
  deleteMessage: async () => {},
  answerCallbackQuery: async () => {}
};

function mkUser(id, age, bracket) {
  return {
    user_id: id, name: 'u' + id, age, gender: id % 2 ? 'M' : 'F', location: 'Jakarta',
    language: 'id', preference: 'random', gender_prefs: ['M', 'F', 'O'],
    age_min: bracket === 'minor' ? 13 : 18, age_max: bracket === 'minor' ? 17 : 29,
    _ageBracket: bracket, _ageVerified: true, trust_level: 'shadow'
  };
}

/**
 * Mirror 1:1 handlers/chat.js:20-119 — checkViolation → (exit-pool intercept)
 * → forward → recordEvidence → extractFeatures → enforceBracketBreach.
 * Mengembalikan { violations, decision } (decision = hasil enforce di pesan ini).
 */
async function driveChat(userId, text, bracket, { sessionService, partnerId, language = 'id' }) {
  const violations = checkViolation(userId, text, 'text', { bracket });           // chat.js:41
  const bannedNow = bannedCache.isBanned(userId);
  const exitPool = violations.some(v => v.category === 'migration' || v.category === 'personal_info');
  let decision = null;
  if (!bannedNow && !exitPool) {                                                  // chat.js:52 (pesan blokir tak diteruskan)
    if (partnerId) { try { recordEvidence(userId, partnerId, text, { bracket }); } catch (_) {} } // chat.js:94
    const profile = behavioral.getProfile(userId);
    behavioral.extractFeatures(text, profile);                                    // chat.js:97
    if (profile.totalMessages >= 3) {                                             // chat.js:108
      decision = await moderation.enforceBracketBreach(userId, bracket, {
        sessionService, botApi: mockBotApi, language
      });
      if (decision) console.log(`  ${Y}⚡ enforce(${userId}): ${decision.kind} (${decision.reason}) conf=${(decision.confidence ?? 0).toFixed(3)}${X}`);
    }
  }
  return { violations, decision };
}

function vioCount(userId) {
  return db.getDb().prepare('SELECT COUNT(*) c FROM violations WHERE user_id = ?').get(userId).c;
}

const pool = new PoolService();
const sessions = new SessionService(pool);

try {

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 1 — Adult explicit chat di pool 20s SENDIRI → no evict, no violation (R1)
// ══════════════════════════════════════════════════════════════════════
head('S1: ADULT EXPLICIT DI POOL 20s (R1: konten intra-pool bebas)');
{
  const A = 9100, P = 9101;
  behavioral.clearProfile(A);
  const ua = mkUser(A, 24, '20s'), up = mkUser(P, 23, '20s');
  await sessions.createSession(A, P, ua, up);

  const texts = [
    'Udah kerja dari pagi di kantor, lembur terus bayar cicilan kost, capek banget nih hari ini',
    'Gaji masuk nanti malem, langsung bayar listrik sama tagihan bulanan, sisanya buat nabung',
    'Malam ini kita lanjutin di kamar ya, aku udah nggak sabar banget sama kamu sayang :D',
    'Kamu bisa pelan-pelan? Aku suka yang sabar dan tidak buru-buru, tolong ya sayang',
    'Besok pagi aku harus lembur lagi di kantor, terus pulang naik motor kena macet parah',
    'Weekend rencana liburan ke Bandung naik mobil, cuti udah aku ajukan minggu lalu',
    'sooo capek deh hari ini, tapi lumayan lah gaji overtime masuk minggu depan',
    'Aku di kost belum nih, malem ini pesan makanan aja di kamar, males keluar'
  ];
  let totalViol = 0, evicted = false;
  for (const t of texts) {
    const { violations, decision } = await driveChat(A, t, '20s', { sessionService: sessions, partnerId: P });
    totalViol += violations.length;
    if (violations.length) ev(`violation saat kirim: ${violations.map(v => v.category).join(',')}`);
    if (decision && decision.kind === 'evict') evicted = true;
  }
  const est = behavioral.estimateAge(behavioral.getProfile(A));
  const breach = moderation.classifyBreach(behavioral.getProfile(A), '20s');
  const dbVio = vioCount(A);
  const info = db.getModerationInfo(A);
  ev(`estimateAge → bracket=${est.bracket} confidence=${(est.confidence ?? 0).toFixed(3)} gap=${(est.gap ?? 0).toFixed(3)}`);
  ev(`classifyBreach('20s') → kind=${breach.kind ?? 'null'} | enforce → evict=${evicted}`);
  ev(`violations dari checkViolation=${totalViol} | baris di DB violations=${dbVio} | quarantined_at=${info?.quarantined_at ?? 'null'}`);
  ev(`sesi masih aktif=${sessions.isInSession(A)}`);

  if (!evicted && (breach.kind ?? null) === null && totalViol === 0 && dbVio === 0 && !info?.quarantined_at) {
    pass(1, `no evict & no violation (confidence 20s=${(est.confidence ?? 0).toFixed(3)}, kind=null, 0 rows violations)`);
  } else {
    fail(1, `evicted=${evicted} kind=${breach.kind} totalViol=${totalViol} dbVio=${dbVio}`);
  }
  await sessions.endSession(A, 'manual');
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 2 — Perilaku adult di SESI MINOR → EVICT, confidence ≥ 0.6
// ══════════════════════════════════════════════════════════════════════
head('S2: PERILAKU ADULT DI SESI MINOR → EVICT (MIN_CONFIDENCE=0.6)');
{
  const A = 9200, P = 9201;
  behavioral.clearProfile(A);
  const predator = mkUser(A, 15, 'minor');   // profil di sesi: mengaku minor (kolam minor)
  const victim = mkUser(P, 15, 'minor');
  await sessions.createSession(A, P, predator, victim);

  const texts = [
    'Udah kerja dari pagi di kantor, lembur terus bayar cicilan kost, capek banget nih hari ini',
    'Gaji masuk nanti malem, langsung bayar listrik sama tagihan bulanan, sisanya buat nabung',
    'Malam ini kita lanjutin di kamar ya, aku udah nggak sabar banget sama kamu sayang :D',
    'Kamu bisa pelan-pelan? Aku suka yang sabar dan tidak buru-buru, tolong ya sayang',
    'Besok pagi aku harus lembur lagi di kantor, terus pulang naik motor kena macet parah',
    'Weekend rencana liburan ke Bandung naik mobil, cuti udah aku ajukan minggu lalu',
    'sooo capek deh hari ini, tapi lumayan lah gaji overtime masuk minggu depan',
    'Aku di kost belum nih, malem ini pesan makanan aja di kamar, males keluar'
  ];
  let decision = null, evictAt = 0;
  for (let i = 0; i < texts.length; i++) {
    const r = await driveChat(A, texts[i], 'minor', { sessionService: sessions, partnerId: P });
    if (r.decision && r.decision.kind === 'evict') { decision = r.decision; evictAt = i + 1; break; }
  }
  const info = db.getModerationInfo(A);
  const stillIn = sessions.isInSession(A);
  const evictMsgs = sent.filter(s => s.uid === A || s.uid === P);
  ev(`mods.js:31 MIN_CONFIDENCE=${moderation.MIN_CONFIDENCE}, GROOMING_EVICT_THRESHOLD=${moderation.GROOMING_EVICT_THRESHOLD}`);
  ev(`enforceBracketBreach → kind=${decision?.kind} reason=${decision?.reason}`);
  ev(`confidence=${(decision?.confidence ?? 0).toFixed(3)} pada pesan ke-${evictAt} (butuh ≥0.6)`);
  ev(`quarantine: quarantined_at=${info?.quarantined_at ?? 'null'} trust_level=${info?.trust_level ?? '-'} | sesi masih aktif=${stillIn}`);
  ev(`notifikasi terkirim saat evict: ${evictMsgs.length ? evictMsgs.map(m => `[→${m.uid}] "${m.text}"`).join(' | ') : 'TIDAK ADA'}`);

  if (decision?.kind === 'evict' && (decision.confidence ?? 0) >= 0.6 && info?.quarantined_at && !stillIn) {
    pass(2, `EVICT kind=evict confidence=${(decision.confidence).toFixed(3)}≥0.6 (${decision.reason}), sesi diakhiri, user dikarantina`);
  } else {
    fail(2, `kind=${decision?.kind} conf=${(decision?.confidence ?? 0).toFixed(3)} quarantined=${info?.quarantined_at} inSession=${stillIn}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 3 — ≥2 grooming signals dalam 1 sesi minor → EVICT (aturan kejadian)
// ══════════════════════════════════════════════════════════════════════
head('S3: ≥2 GROOMING SIGNAL DI POOL MINOR → EVICT (occurrence rule, threshold=2)');
{
  const A = 9300, P = 9301;
  behavioral.clearProfile(A);
  await sessions.createSession(A, P, mkUser(A, 15, 'minor'), mkUser(P, 15, 'minor'));

  const texts = [
    'Umur berapa sih kamu? Aku penasaran aja deh',        // 'umur berapa'
    'Kamu kelas berapa sih, masih sekolah kan',           // 'kamu kelas berapa' + 'masih sekolah'
    'Rahasia ya jangan bilang ortu sooo deh',              // 'rahasia' + 'jangan bilang'
    'Ih serem deh nanti ngobrolnya 😅'
  ];
  let decision = null;
  for (const t of texts) {
    const r = await driveChat(A, t, 'minor', { sessionService: sessions, partnerId: P });
    if (r.decision && r.decision.kind === 'evict') { decision = r.decision; break; }
  }
  const prof = behavioral.getProfile(A);
  const est = behavioral.estimateAge(prof);
  ev(`groomingSignalHits=${prof.groomingSignalHits} (threshold=${moderation.GROOMING_EVICT_THRESHOLD}) dalam ${prof.totalMessages} pesan`);
  ev(`estimateAge → bracket=${est.bracket} confidence=${(est.confidence ?? 0).toFixed(3)} (bracket minor supaya jalur kejadian, bukan jalur adult-pattern)`);
  ev(`enforceBracketBreach → kind=${decision?.kind} reason=${decision?.reason}`);
  const info = db.getModerationInfo(A);

  if (decision?.kind === 'evict' && /^grooming_signals_minor_pool/.test(decision.reason) && prof.groomingSignalHits >= 2 && info?.quarantined_at) {
    pass(3, `EVICT by occurrence rule (${decision.reason}), ${prof.groomingSignalHits} signals ≥ 2, karantina aktif`);
  } else {
    fail(3, `kind=${decision?.kind} reason=${decision?.reason} hits=${prof.groomingSignalHits} quarantined=${info?.quarantined_at}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 4 — Migration invite di pool minor → violation + freeze instan 24h
// ══════════════════════════════════════════════════════════════════════
head('S4: MIGRATION INVITE DI POOL MINOR → freeze instan 24h');
{
  const U = 9500;
  bannedCache.remove(U);
  const m1 = checkViolation(U, 'add my telegram @predator_x', 'text', { bracket: 'minor' });
  const ban1 = db.getBanInfo(U);
  const m2 = checkViolation(U, "let's meet at the mall", 'text', { bracket: 'minor' });
  const ban2 = db.getBanInfo(U);
  const migCount = db.getMigrationViolationCount(U);
  ev(`msg1 "add my telegram @predator_x" → violations=${JSON.stringify(m1.map(v => ({ c: v.category, r: v.reason })))}`);
  ev(`msg2 "let's meet at the mall"      → violations=${JSON.stringify(m2.map(v => ({ c: v.category, r: v.reason })))}`);
  ev(`checkPersonalInfo(msg2) → ${JSON.stringify(checkPersonalInfo("let's meet at the mall"))} (invitePatterns: privacy.js:136-144 — 'meetup'/'meet irl' literal, TANPA 'meet' polos → "meet at the mall" lolos)`);
  ev(`freeze: bans row=${ban1 ? `reason="${ban1.reason}" expires_at=${ban1.expires_at}` : 'TIDAK ADA'} | bannedCache=${bannedCache.isBanned(U)} | migration_count=${migCount}`);
  if (ban1?.expires_at) ev(`durasi freeze = ${((ban1.expires_at - Math.floor(Date.now() / 1000)) / 3600).toFixed(2)} jam (media.js:507-511 freeze TANPA nunggu 3 strike)`);

  const ok = m1.length > 0 && m1[0].category === 'migration'
    && m2.length > 0 && m2[0].category === 'migration'
    && ban1 && bannedCache.isBanned(U);
  if (ok) pass(4, 'kedua ajakan → migration; freeze 24h instan di pool minor');
  else {
    const missing = [m1[0]?.category !== 'migration' && 'msg1', m2[0]?.category !== 'migration' && 'msg2'].filter(Boolean);
    fail(4, `TIDAK terdeteksi sebagai migration: ${missing.join(', ')} | msg1=${m1[0]?.category ?? 'none'} msg2=${m2[0]?.category ?? 'none'} freeze=${!!ban1}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 5 — Varian nomor HP → HARUS semua personal_info
// (mirror chat.js:41 — teks mentah masuk checkViolation → checkPersonalInfo,
//  anti-leet digitizeLookalikes dipanggil di privacy.js:107)
// ══════════════════════════════════════════════════════════════════════
head('S5: VARIAN NO. HP → personal_info (checkViolation, mirror chat.js)');
{
  const U = 9650;
  const variants = ['0812 3456 7890', '+62 812-3456-7890', '08l2-3456-7890', '0812.3456.7890'];
  const got = [];
  for (const v of variants) {
    const res = checkViolation(U, v, 'text', { bracket: '20s' });
    const ctx = evaluateText(v);
    const cat = res[0]?.category ?? 'NONE';
    got.push(cat);
    ev(`"${v}" → category=${cat}${res[0] ? ` (${res[0].reason})` : ' ← TIDAK TERDETEKSI'} | digitizeLookalikes="${v.toLowerCase().replace(/[a-z]/g, c => ({ l: '1', i: '1', o: '0', s: '5', b: '6', g: '9', z: '2', e: '3', a: '4', t: '7' }[c] ?? c))}" | contextParameter.phone=${ctx.scores.phone}`);
  }
  const bad = variants.filter((v, i) => got[i] !== 'personal_info');
  if (bad.length === 0) pass(5, '4/4 varian → personal_info');
  else fail(5, `${variants.length - bad.length}/4 varian → personal_info; terlewat: ${bad.map(b => `"${b}"`).join(', ')} (regex privacy.js:114-115 + anti-bypass digitsOnly privacy.js:110,146-149)`);
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 6 — Pelanggaran personal_info ke-3 → auto-ban
// ══════════════════════════════════════════════════════════════════════
head('S6: PELANGGARAN personal_info KE-3 → AUTO-BAN');
{
  const U = 9600;
  bannedCache.remove(U);
  const phones = ['0812 3456 7890', '0812 3456 7891', '0812 3456 7892'];
  const marks = [];
  for (let i = 0; i < phones.length; i++) {
    const res = checkViolation(U, phones[i], 'text', { bracket: '20s' });
    const bannedNow = bannedCache.isBanned(U);
    const row = db.getBanInfo(U);
    marks.push(`#${i + 1}:${res[0]?.category ?? 'none'},banned=${bannedNow}`);
    ev(`pelanggaran ${i + 1} "${phones[i]}" → ${res[0]?.category} | bannedCache=${bannedNow} | bans row=${row ? `"${row.reason}"` : '-'}`);
  }
  const total = vioCount(U);
  const row = db.getBanInfo(U);
  ev(`total baris violations=${total} | bans: ${row ? `reason="${row.reason}" banned_by=${row.banned_by}` : 'TIDAK ADA'}`);
  ev(`LOGIC: src/handlers/media.js:519 logViolation(...) → media.js:523 "if (result.banned)" → media.js:525 bannedCache.add`);
  ev(`COUNTER: src/database/db.js:224-227 SELECT COUNT(*) WHERE user_id=? → db.js:229 "if (result.count >= 3)" → db.js:230 banUser()`);
  ev(`catatan: counter db.js:225 menghitung SEMUA tipe violation (bukan hanya personal_info)`);

  if (row && bannedCache.isBanned(U) && total >= 3 && marks[2].includes('banned=true')) {
    pass(6, `auto-ban ke-3 personal_info → bans row "${row.reason}", count=${total}`);
  } else {
    fail(6, `bans row=${!!row} bannedCache=${bannedCache.isBanned(U)} count=${total} marks=[${marks.join(' | ')}]`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 7 — findMatch: adult 25 vs bucket minor → MUST BE IMPOSSIBLE
// ══════════════════════════════════════════════════════════════════════
head('S7: findMatch ADULT 25 vs BUCKET MINOR → tidak mungkin');
{
  const p2 = new PoolService();
  const adult = mkUser(9700, 25, '20s');
  const minor = mkUser(9701, 15, 'minor');
  await p2.addToPool(adult);
  await p2.addToPool(minor);
  const size20 = p2.getBracketSize('20s'), sizeMinor = p2.getBracketSize('minor');
  const mAdult = await p2.findMatch(adult);
  const mMinor = await p2.findMatch(minor);
  const ageOk = p2.checkAgeMatch(adult, minor);
  ev(`bucket key = \`\${language}:\${bracket}\` (pool.js:43-45) → dewasa di "id:20s", minor di "id:minor" (pool.js:114,118,152-155)`);
  ev(`ukuran bucket: 20s=${size20}, minor=${sizeMinor} | findMatch(adult25)= ${mAdult ? mAdult.anonymous_id : 'null'} | findMatch(minor15)= ${mMinor ? mMinor.anonymous_id : 'null'}`);
  ev(`checkAgeMatch(adult, minor) = ${ageOk} → pool.js:185-195 mengecek tiap user terhadap range DIRINYA sendiri (dewasa 25∈[18,29] ✓, minor 15∈[13,17] ✓)`);
  // Probe adversarial: kalau minor DISUNTUK paksa ke bucket dewasa, apa yang terjadi?
  const sanitizedMinor = { ...minor, _ageBracket: 'minor' };
  p2.buckets.get('id:20s').set(minor.user_id, sanitizedMinor);
  p2.pool.set(minor.user_id, sanitizedMinor);
  const forced = await p2.findMatch(adult);
  ev(`PROBE: minor disuntuk paksa ke bucket "id:20s" → findMatch = ${forced ? `user_id=${forced.user_id} (COCOK! checkAgeMatch tak memblokir)` : 'null'} → bukti pemisah UTAMA adalah bucket separation (pool.js:153-155)`);
  await p2.removeFromPool(minor.user_id);
  await p2.removeFromPool(adult.user_id);

  if (mAdult === null && mMinor === null && size20 === 1 && sizeMinor === 1) {
    pass(7, `findMatch dewasa↔minor = null di normal operation (bucket terpisah: id:20s vs id:minor)`);
  } else {
    fail(7, `findMatch(adult)=${mAdult?.anonymous_id} findMatch(minor)=${mMinor?.anonymous_id}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SKENARIO 8 — Trust gate: shadow (<3 sesi) kunci foto/voice; verified (≥3) buka
// ══════════════════════════════════════════════════════════════════════
head('S8: TRUST GATE — shadow<3 sesi terkunci, verified≥3 terbuka');
{
  const U = 9800;
  db.createUserProfile(U);
  trust.clearTrustCache(U);
  // Gerbang yang sama persis dengan handlers/media.js
  const photoGate = (t) => (t === 'flagged' ? 'locked_flagged' : t === 'shadow' ? 'locked_shadow' : 'allow');   // media.js:140-147
  const voiceGate = (bracket, t) => (bracket === 'minor' ? 'blocked_minor' : t === 'flagged' ? 'locked_flagged' : t !== 'verified' ? 'locked_shadow' : 'allow'); // media.js:231-244

  const t0 = trust.resolveTrust(U);
  ev(`sessions_completed=0 → resolveTrust="${t0}" | foto→${photoGate(t0)} (media.js:144) | voice→${voiceGate('20s', t0)} (media.js:241) | canUseMedia=${trust.canUseMedia(U)}`);
  db.updateUserProfile(U, { sessions_completed: 2 });
  trust.clearTrustCache(U);
  const t2 = trust.resolveTrust(U);
  ev(`sessions_completed=2 → resolveTrust="${t2}" (masih < SHADOW_SESSIONS_REQUIRED=${trust.SHADOW_SESSIONS_REQUIRED}) | foto→${photoGate(t2)} | voice→${voiceGate('20s', t2)}`);
  db.updateUserProfile(U, { sessions_completed: 3 });
  trust.clearTrustCache(U);
  const t3 = trust.resolveTrust(U);
  ev(`sessions_completed=3 → resolveTrust="${t3}" (trust.js:31 ≥3) | foto→${photoGate(t3)} | voice→${voiceGate('20s', t3)} | canUseMedia=${trust.canUseMedia(U)}`);

  const lockedShadow = t0 === 'shadow' && photoGate(t0) === 'locked_shadow' && voiceGate('20s', t0) === 'locked_shadow' && t2 === 'shadow';
  const openVerified = t3 === 'verified' && photoGate(t3) === 'allow' && voiceGate('20s', t3) === 'allow' && trust.canUseMedia(U);
  if (lockedShadow && openVerified) pass(8, `shadow(0 & 2 sesi)=terkunci foto+voice; verified(3 sesi)=terbuka`);
  else fail(8, `t0=${t0} t2=${t2} t3=${t3} photoGate0=${photoGate(t0)} photoGate3=${photoGate(t3)}`);
}

} catch (e) {
  console.error(`${R}FATAL:${X}`, e);
}

// ══════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════
const passed = results.filter(r => r.ok).length;
console.log(`\n${B}══════ SUMMARY ══════${X}`);
for (const r of results) console.log(`  ${r.ok ? G + 'PASS' : R + 'FAIL'}${X} #${r.n} — ${r.t}`);
console.log(`\n${B}${passed}/8 PASS${X}`);
console.log(`${C}DB temp: ${process.env.DB_PATH}${X}`);
console.log(`${C}LOG temp: ${process.env.LOG_DIR}${X}`);

process.exit(0);

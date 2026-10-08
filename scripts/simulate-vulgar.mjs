/**
 * Simulasi LEVEL VULGARITAS 1-3 (makin tinggi makin vulgar) × 3 POV:
 *   A. Minor → Minor (normal)
 *   B. Minor → Minor (sex experience)
 *   C. Adult Grooming (di Pool Minor)
 *
 * Per level diukur: Context Parameter (keyword/slang/phone → total/verdict),
 * violation filter, behavioral estimation, breach engine (EVICT/RATCHET).
 *
 * Jalankan: node scripts/simulate-vulgar.mjs
 */
process.env.DB_PATH = './sim-vulgar.db';

const { initDatabase, getModerationInfo, getDb } = await import('../src/database/db.js');
const { PoolService } = await import('../src/services/pool.js');
const { SessionService } = await import('../src/services/session.js');
const { extractFeatures, getProfile, estimateAge, clearProfile } = await import('../src/services/behavioral.js');
const { classifyBreach, enforceBracketBreach } = await import('../src/services/moderation.js');
const { checkViolation } = await import('../src/handlers/media.js');
const { ContextParameter, evaluateText } = await import('../src/services/context-parameter.js');
const { bannedCache } = await import('../src/services/banned-cache.js');

initDatabase();
bannedCache.init();

const C = { r: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[91m', grn: '\x1b[92m', ylw: '\x1b[93m', cyn: '\x1b[96m', mag: '\x1b[95m', bold: '\x1b[1m' };
const h = (t) => console.log(`\n${C.bold}${C.cyn}═══ ${t} ═══${C.r}`);
const say = (k, m, c = '') => console.log(`${c}[${k}]${C.r} ${m}`);
const mockBotApi = { sendMessage: async () => ({ message_id: 1 }) };
const pool = new PoolService();
const sessions = new SessionService(pool);
const cp = new ContextParameter();

function user(id, age, bracket, extra = {}) {
  return { user_id: id, age, gender: extra.gender || 'M', location: 'Jakarta', language: 'id',
    _ageBracket: bracket, _ageVerified: true, trust_level: 'shadow', ...extra };
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
  cp.record(uid, text);
  let breach = null;
  if (profile.totalMessages >= 3) {
    breach = await enforceBracketBreach(uid, bracket, {
      sessionService: sessions, botApi: mockBotApi, language: 'id', adminIds: [999]
    });
  }
  return { violations, breach };
}

const LEVELS = {
  1: { label: 'L1 — RINGAN (slang kasar)' },
  2: { label: 'L2 — VULGAR (eksplisit seks)' },
  3: { label: 'L3 — EKSTREM (vulgar + eskalasi)' }
};

const SCENARIOS = [
  {
    id: 'A', title: 'MINOR → MINOR (normal)', claimed: 'minor',
    me: () => user(1101, 15, 'minor', { gender: 'M' }), partner: () => user(1102, 16, 'minor', { gender: 'F' }),
    msgs: {
      1: ['wkwk lu lucu banget anjing 😂', 'gila sih parah bgt', 'lama ga chat gini wkwk'],
      2: ['ih jorok kamu wkwk', 'emangnya pernah? penasaran aku', 'ya ampun malu lah wkwk'],
      3: ['wah nakal banget lu, sange ya? 😏', 'kamu colmek juga di rumah?', 'ih parah sih lu, kontol gila wkwk']
    }
  },
  {
    id: 'B', title: 'MINOR → MINOR (SEX EXPERIENCE)', claimed: 'minor',
    me: () => user(1201, 16, 'minor', { gender: 'M' }), partner: () => user(1202, 16, 'minor', { gender: 'F' }),
    msgs: {
      1: ['eh kesini mau? gas', 'udah malem gini enaknya ngapain', 'kamu berani ga?'],
      2: ['aku udah pernah ngewe sih, seru kok', 'itu enak ga sih? penasaran', 'kamu udah pernah coba belum'],
      3: ['sange nih, kamu mau vcs ga?', 'kirim foto dong buktinya', 'aku mau ketemu kamu, rahasia ya']
    }
  },
  {
    id: 'C', title: 'ADULT GROOMING (penyusup di Pool Minor, klaim minor)', claimed: 'minor',
    me: () => user(1301, 16, 'minor', { gender: 'M' }), partner: () => user(1302, 15, 'minor', { gender: 'F' }),
    // Predator asli: umur DIPALSUKAN 16 saat onboarding (age-verify bisa lolos) →
    // proteksi datang dari perilaku (grooming signal), bukan dari umur klaim.
    msgs: {
      1: ['eh kamu kelas berapa? masih sekolah kan', 'umur berapa sekarang', 'di mana rumah kamu?'],
      2: ['kamu cantik, aku suka kamu', 'percaya sama aku ya', 'jangan bilang siapa-siapa, rahasia'],
      3: ['sini ketemu aku diam-diam aja', 'vcs yuk sekarang, kirim foto dong', 'no hp kamu berapa? wa aku 081234567890']
    }
  }
];

const summary = [];

for (const sc of SCENARIOS) {
  h(`POV ${sc.id}: ${sc.title}`);
  clearProfile(sc.me().user_id);
  const me = sc.me();
  const partner = sc.partner();
  say('SETUP', `user ${me.age} th klaim bracket="${sc.claimed}" × partner ${partner.age} th → ${await pair(me, partner) ? 'MATCHED' : 'NO MATCH'}`);
  const uid = me.user_id;

  let lastBreach = null;
  for (const lvl of [1, 2, 3]) {
    say('', '');
    console.log(`${C.bold}${C.ylw}  ── ${LEVELS[lvl].label} ──${C.r}`);
    let anyViolation = false;
    for (const t of sc.msgs[lvl]) {
      const { violations, breach } = await feed(uid, sc.claimed, t);
      const single = evaluateText(t);
      say(`L${lvl}→`, `"${t}"`, C.dim);
      say('  pesan', `param total=${single.total} (${single.scores.keyword}/${single.scores.slang}/${single.scores.phone}) flags=[${single.flags.join(',')}]${violations.length ? ` ⚠️${violations.map(v => v.category).join(',')}` : ''}`,
        violations.length ? C.red : C.dim);
      if (violations.length) anyViolation = true;
      if (breach) { lastBreach = breach; say('  ⚡ ENGINE', `${breach.kind.toUpperCase()} — ${breach.reason}`, C.mag); break; }
    }
    const est = estimateAge(getProfile(uid));
    const v = cp.getVerdict(uid);
    const cl = classifyBreach(getProfile(uid), sc.claimed);
    say('LEVEL-END', `PARAM: total=${v.score} verdict=${C.bold}${v.verdict}${C.r} flags=[${v.flags.join(',')}] | BEHAVIORAL: est=${est.bracket} conf=${(est.confidence || 0).toFixed(2)} | classify=${cl.kind ?? 'null'}${anyViolation ? ' | ⚠️ ada violation' : ''}`,
      v.verdict === 'critical' ? C.red : v.verdict === 'high' ? C.ylw : C.grn);
    if (lastBreach) { say('LEVEL-END', '⛔ sesi terhenti — pesan level berikut tidak diproses', C.mag); break; }
  }

  const mod = getModerationInfo(uid);
  const final = cp.getVerdict(uid);
  say('AKHIR', `quarantine=${mod?.quarantined_at ? 'YA (' + mod.quarantine_reason + ')' : 'tidak'} | bracket_locked=${mod?.bracket_locked ?? '-'} | trust=${mod?.trust_level ?? '-'} | sesi=${sessions.isInSession(uid) ? 'aktif' : 'ditutup'}`,
    mod?.quarantined_at ? C.red : C.grn);
  summary.push({ id: sc.id, title: sc.title, score: final.score, verdict: final.verdict,
    quarantine: !!mod?.quarantined_at, breach: lastBreach?.kind ?? null, flags: final.flags });
}

h('RINGKASAN');
console.log(
  ['POV | Parameter | Verdict | Breach | Quarantine',
   '----|-----------|---------|--------|-----------',
   ...summary.map(s => `${s.id}. ${s.title.slice(0, 30)} | ${s.score}/100 | ${s.verdict} | ${s.breach ?? '-'} | ${s.quarantine ? 'YA' : 'tidak'}`)
  ].join('\n')
);

try { getDb().close(); } catch (_) {}
try {
  const fs = await import('node:fs');
  for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-journal`]) {
    if (f && fs.existsSync(f)) fs.unlinkSync(f);
  }
} catch (_) {}
process.exit(0);

/**
 * Audit Rule Engine vs kebijakan pool:
 *  R1 = intra-pool bebas (tak ada sensor konten)
 *  R2 = intersepsi keluar-pool (ketemu/kontak/sosmed) — pesan TIDAK boleh sampai ke partner
 *  R3 = no cross-line (bucket terpisah)
 *  R4 = proteksi minor dari hunting
 *
 * Metode: panggil handler chat.js ASLI dengan fake bot → bukti pesan sampai/tidak ke partner.
 * Jalankan: node scripts/audit-rules.mjs
 */
process.env.DB_PATH = './sim-audit.db';
process.env.HASH_SECRET ||= 'audit-secret';
process.env.LOG_ENCRYPTION_KEY ||= 'a'.repeat(64);

const { initDatabase, getDb } = await import('../src/database/db.js');
const { registerChatHandlers } = await import('../src/handlers/chat.js');
const { checkViolation } = await import('../src/handlers/media.js');
initDatabase();

const C = { r: '\x1b[0m', red: '\x1b[91m', grn: '\x1b[92m', ylw: '\x1b[93m', cyn: '\x1b[96m', bold: '\x1b[1m' };
const h = (t) => console.log(`\n${C.bold}${C.cyn}═══ ${t} ═══${C.r}`);
const say = (k, m, c = '') => console.log(`${c}[${k}]${C.r} ${m}`);

// ---- fake bot: rekam semua handler + pesan keluar ----
const handlers = { text: [], commands: {} };
const outbox = []; // {to, text}
const fakeBot = {
  on: (type, fn) => { if (type === 'message:text') handlers.text.push(fn); },
  command: (name, fn) => { handlers.commands[name] = fn; },
  api: { sendMessage: async (to, text) => { outbox.push({ to, text: String(text) }); return { message_id: 1 }; } }
};

// ---- deps tiruan (cukup untuk jalur chat.js) ----
let inSession = true, partnerId = 2002;
const sessionService = {
  isInSession: () => inSession,
  getPartner: () => partnerId,
  updateActivity: () => {},
  endSession: async () => ({ partnerId, session: {} })
};
const noopService = {
  addXP: () => null, getProfile: () => null, check: () => []
};
registerChatHandlers(fakeBot, {
  sessionService, xpService: noopService, achievementService: noopService, poolService: { setSkipCooldown: () => {} }
});

const ctxFor = (uid, text, bracket) => ({
  from: { id: uid },
  message: { text },
  session: { language: 'id', inventory: {}, user: { _ageBracket: bracket } },
  reply: async (t) => { outbox.push({ to: uid, text: '[SELF]' + String(t).slice(0, 40) }); }
});

// banned-cache per-case: init sekali, kosongkan tiap case (state lintas case di DB)
const { bannedCache } = await import('../src/services/banned-cache.js');
bannedCache.init?.();

async function sendInPool(uid, text, bracket) {
  outbox.length = 0;
  for (const fn of handlers.text) await fn(ctxFor(uid, text, bracket));
  const reachedPartner = outbox.some(m => m.to === partnerId);
  const selfWarn = outbox.some(m => m.to === uid);
  return { reachedPartner, selfWarn };
}

const CASES = [
  // [label, pesan, bracket, kategori kebijakan]
  ['R2 minor: ajakan ketemu', 'kita ketemu dong besok', 'minor', 'MEETUP'],
  ['R2 minor: share WA', 'wa aku 081234567890', 'minor', 'CONTACT'],
  ['R2 minor: no HP polos', '081234567890 ya', 'minor', 'CONTACT'],
  ['R2 minor: ig', 'add ig @randongx', 'minor', 'SOCMED'],
  ['R2 minor: t.me', 't.me/randomx', 'minor', 'SOCMED'],
  ['R2 adult: ajakan ketemu', 'kita ketemu dong besok', '20s', 'MEETUP'],
  ['R2 adult: share WA', 'wa aku 081234567890', '20s', 'CONTACT'],
  ['R2 adult: ig', 'add ig @randongx', '20s', 'SOCMED'],
  ['R1 minor: chatsex vulgar', 'kontol memek ngentot sange', 'minor', 'INTRA-POOL'],
  ['R1 minor: nude request', 'kirim foto dong', 'minor', 'INTRA-POOL'],
  ['R1 adult: vulgar', 'kontol memek ngentot', '20s', 'INTRA-POOL'],
  ['R1 netral', 'halo lagi apa', 'minor', 'INTRA-POOL'],
];

h('A. INTERSEPSI (R2) — pesan pelanggaran: sampai ke partner?');
const results = [];
let uidSeq = 5000;
for (const [label, text, bracket, policy] of CASES) {
  const uid = ++uidSeq; // uid segar per case — hindari carry-over ban/freeze antar case
  const r = await sendInPool(uid, text, bracket);
  const shouldBlock = policy !== 'INTRA-POOL';
  const ok = shouldBlock ? !r.reachedPartner : true; // R1 tak wajib blokir
  results.push({ label, policy, ...r, shouldBlock, ok });
  const status = !shouldBlock
    ? (r.reachedPartner ? `${C.grn}LOLOS→partner ✓ (R1 bebas)${C.r}` : `${C.ylw}terhalang${C.r}`)
    : (r.reachedPartner ? `${C.red}⚠️ SAMPAI ke partner (celah R2)${C.r}` : `${C.grn}DIBLOKIR ✓${C.r}`);
  say('CASE', `${label} [${bracket}] → partner=${r.reachedPartner ? 'YA' : 'tidak'} | warn=${r.selfWarn ? 'ya' : 'tidak'} | ${status}`);
}

h('B. KATEGORI checkViolation per pool (matriks instan)');
const probes = [
  ['ketemu', 'kita ketemu dong'], ['wa', 'wa aku 081234567890'],
  ['noHP', '081234567890'], ['ig', 'add ig @randongx'], ['t.me', 't.me/x123'],
  ['vcs', 'vcs yuk malam ini'], ['foto', 'kirim foto dong']
];
console.log('kata            | minor: kategori(viol?) | adult: kategori(viol?)');
for (const [name, text] of probes) {
  // uid segar per probe — hindari auto-ban 3-strike menyilaukan hasil probe berikutnya
  const vm = checkViolation(++uidSeq, text, 'text', { bracket: 'minor' });
  const va = checkViolation(++uidSeq, text, 'text', { bracket: '20s' });
  say('PROBE', `${name.padEnd(15)} | ${(vm[0]?.category ?? '-')}${vm.length ? '' : ' (lolos)'}${' '.repeat(Math.max(0, 12 - (vm[0]?.category ?? '-').length))} | ${(va[0]?.category ?? '-')} ${va.length ? '' : '(lolos)'}`);
}

h('RINGKASAN');
const leaks = results.filter(r => r.shouldBlock && r.reachedPartner);
const intraBlocked = results.filter(r => !r.shouldBlock && !r.reachedPartner);
console.log(`R2 Wajib blokir : ${results.filter(r => r.shouldBlock).length - leaks.length}/${results.filter(r => r.shouldBlock).length} terblokir`);
console.log(`Celah R2        : ${leaks.length ? leaks.map(l => l.label).join(' | ') : 'tidak ada'}`);
console.log(`R1 Salah blokir : ${intraBlocked.length ? intraBlocked.map(l => l.label).join(' | ') : 'tidak ada'}`);

try { getDb().close(); } catch (_) {}
try {
  const fs = await import('node:fs');
  for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-journal`]) {
    if (f && fs.existsSync(f)) fs.unlinkSync(f);
  }
} catch (_) {}
process.exit(0);

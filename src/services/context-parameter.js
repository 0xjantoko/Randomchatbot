/**
 * Context Parameter — penilaian KONTEKS percakapan berdasarkan 3 sumber data:
 *
 *   1. KATA KUNCI  — dataset terstruktur (grooming / migration / adult / school / personal)
 *   2. SLANG       — kepadatan bahasa gaul/leet (normalisasi anti-evasion)
 *   3. NOMOR HP    — deteksi digit + lookalike (08l…, O812…)
 *
 * Output: skor 0-100 per dimensi + verdict agregat per user.
 * Ini SIGNAL untuk menilai konteks — bukan filter otomatis.
 * Kebijakan tindakan (warn/freeze/evict) tetap di tangan pipeline moderation.
 */
import { normalizeLeet, digitizeLookalikes } from '../utils/leet.js';

// ============ DATASET ============

export const KEYWORD_DATASET = {
  // Ajakan eskalasi kontak/dua-arah — konteks "bawa keluar platform"
  grooming: {
    weight: 4,
    items: [
      'umur berapa', 'kamu kelas berapa', 'masih sekolah', 'kamu dimana',
      'rumah kamu', 'orang tua', 'rahasia', 'jangan bilang', 'diam-diam',
      'kita berdua aja', 'foto dong', 'kirim foto', 'vcs', 'ketemu',
      'temuan', 'aku suka kamu', 'kamu cantik', 'kamu ganteng',
      'dewasa', 'aku jagain', 'percaya sama aku'
    ]
  },
  // Konteks percakapan dewasa (dewasa ≠ pelanggaran — hanya konteks)
  adult: {
    weight: 1,
    items: [
      'kerja', 'kantor', 'gaji', 'cicilan', 'istri', 'suami', 'mertua',
      'nikah', 'menikah', 'hamil', 'asuransi', 'investasi', 'lembur',
      'ngewe', 'kontol', 'memek', 'vagina', 'seks', 'sex', 'sange',
      'horny', 'telanjang', 'bugil', 'colmek', 'masturbasi'
    ]
  },
  // Konteks pelajar
  school: {
    weight: -1, // konteks melindungi: menurunkan skor risiko
    items: [
      'sekolah', 'kelas', 'guru', 'pelajaran', 'ulangan', 'ujian',
      'rapor', 'smp', 'sma', 'smk', 'osis', 'pramuka', 'belajar',
      'seragam', 'tugas', 'mapel'
    ]
  },
  // Berbagi identitas/arah keluar
  personal: {
    weight: 5,
    items: ['alamat', 'rumahku', 'kostku', 'kosanku', 'nomorku', 'no hp', 'nama lengkap']
  }
};

export const SLANG_ITEMS = [
  'wkwk', 'wkwkwk', 'anjing', 'anjir', 'bangsat', 'goblok', 'tolol',
  'gw', 'gue', 'lu', 'elo', 'bgt', 'banget', 'gak', 'nggak', 'udah',
  'aja', 'doang', 'kayak', 'bikin', 'pake', 'temen', 'liat', 'kapan',
  'ngewe', 'sange', 'colmek', 'vcs', 'vc'
];

const PHONE_PATTERNS = [
  /(\+62|62|0)\d{8,15}/,          // normal
  /(\+62|62|0)[\dliobgszeta]{8,15}/i // dengan lookalike: 08l234567890, O812…
];

// ============ SCORING ============

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Nilai satu pesan.
 * @returns {{scores:{keyword:number,slang:number,phone:number}, total:number, hits:object, flags:string[]}}
 */
export function evaluateText(text) {
  const raw = String(text).toLowerCase();
  const normalized = normalizeLeet(raw);          // k3l4s → kelas
  const digitized = digitizeLookalikes(text);     // 08l… → 081…

  // 1. Kata kunci (cocok di mentah + ternormalisasi)
  const hits = {};
  let keywordScore = 0;
  for (const [category, { weight, items }] of Object.entries(KEYWORD_DATASET)) {
    const found = items.filter(i => raw.includes(i) || normalized.includes(i));
    if (found.length) {
      hits[category] = found;
      keywordScore += found.length * weight;
    }
  }

  // 2. Slang — kepadatan per pesan (leet ikut dinilai: s3ks → seks)
  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  const slangHits = words.filter(w => SLANG_ITEMS.includes(w));
  if (slangHits.length) hits.slang = slangHits;
  const slangScore = words.length ? (slangHits.length / words.length) * 100 : 0;

  // 3. Nomor HP
  const phoneHit = PHONE_PATTERNS.some(p => p.test(text) || p.test(digitized));
  if (phoneHit) hits.phone = true;

  // Skor dimensi 0-100
  const keywordDim = clamp(keywordScore * 10, 0, 100);
  const phoneDim = phoneHit ? 100 : 0;
  const flags = [
    ...(hits.grooming ? ['grooming'] : []),
    ...(hits.personal ? ['personal_info'] : []),
    ...(phoneHit ? ['phone_exposed'] : []),
    ...(hits.migration ? ['migration'] : [])
  ].filter(f => f !== 'migration' || hits.migration);

  const total = Math.round(clamp(
    keywordDim * 0.5 + (slangScore * 0.2) + phoneDim * 0.3,
    0, 100
  ));

  return { scores: { keyword: Math.round(keywordDim), slang: Math.round(slangScore), phone: phoneDim }, total, hits, flags };
}

export function verdictOf(total) {
  if (total >= 70) return 'critical';
  if (total >= 45) return 'high';
  if (total >= 20) return 'medium';
  return 'low';
}

// ============ AKUMULATOR PER USER ============

export class ContextParameter {
  constructor({ maxMessages = 100 } = {}) {
    this.agg = new Map();   // userId -> { messages, totals[], flags:Set, last }
    this.maxMessages = maxMessages;
  }

  record(userId, text) {
    const r = evaluateText(text);
    let a = this.agg.get(userId);
    if (!a) { a = { messages: 0, totals: [], flags: new Set(), last: null }; this.agg.set(userId, a); }
    a.messages++;
    a.totals.push(r.total);
    if (a.totals.length > this.maxMessages) a.totals.shift();
    for (const f of r.flags) a.flags.add(f);
    a.last = r;
    return r;
  }

  /** Skor agregat: EMA (pesan terakhir berbobot lebih besar) */
  getScore(userId) {
    const a = this.agg.get(userId);
    if (!a || !a.totals.length) return 0;
    let ema = a.totals[0];
    for (let i = 1; i < a.totals.length; i++) ema = ema * 0.7 + a.totals[i] * 0.3;
    return Math.round(ema);
  }

  getVerdict(userId) {
    const score = this.getScore(userId);
    const a = this.agg.get(userId);
    return {
      score,
      verdict: verdictOf(score),
      messages: a?.messages ?? 0,
      flags: a ? [...a.flags] : [],
      last: a?.last ?? null
    };
  }

  reset(userId) { this.agg.delete(userId); }
}

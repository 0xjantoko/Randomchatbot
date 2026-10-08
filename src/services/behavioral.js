import { flagUserUnderage, updateUserProfile } from '../database/db.js';
import { normalizeLeet } from '../utils/leet.js';

const INDONESIAN_SLANG = [
  'gw', 'gue', 'lu', 'lo', 'elo', 'gua',
  'wkwk', 'wkwkwk', 'kwk', 'kwkw',
  'anjing', 'anjir', 'anjirt', 'anying',
  'bangsat', 'bgst', 'kontol', 'ktl', 'memek', 'ngentot',
  'goblok', 'tolol', 'bego', 'idiot',
  'nggak', 'ngg', 'gak', 'ga', 'gk',
  'sih', 'deh', 'dong', 'kok', 'yah',
  'banget', 'bgt', 'bgtt',
  'udah', 'udh', 'dah',
  'aja', 'doang',
  'kayak', 'kaya', 'kyk',
  'bikin', 'buat',
  'sama', 'sma', 'ama',
  'liat', 'lht', 'liatin',
  'bilang', 'blg',
  'ngomong', 'ngmg',
  'cuman', 'cmn', 'cuma',
  'kalo', 'kl', 'kalau',
  'gitu', 'gt', 'gituloh',
  'begitu', 'bgitu',
  'emang', 'mmg',
  'bener', 'bnr',
  'make', 'pake', 'pk',
  'temen', 'tmn',
  'sendiri', 'sdri',
  'kapan', 'kpn',
  'dimana', 'dmn',
  'dimana', 'dmn'
];

const SCHOOL_VOCAB = [
  'sekolah', 'sklh', 'skul',
  'kelas', 'kls',
  'guru', 'gr',
  'pelajaran', 'mapel',
  'pr', 'tugas', 'tgs',
  'ulangan', 'ulngn',
  'ujian', 'ujn',
  'nilai',
  'rapor', 'raport',
  'smp', 'sma', 'smk', 'sd',
  'osis',
  'pramuka',
  'ekstrakulikuler',
  'belajar', 'bljr',
  'spp',
  'seragam',
  'bangku sekolah',
  'teman sekelas',
  'sebentar lagi lulus',
  'masih sekolah',
  'kelas berapa',
  'santai',
  'bolos'
];

const ADULT_VOCAB = [
  'kerja', 'krj', 'bekerja',
  'kantor', 'kntr',
  'gaji', 'gj',
  'atasan', 'bos',
  'rekan kerja', 'teman kerja', 'kolega',
  'kost', 'kos', 'kontrakan',
  'cicilan', 'kpr',
  'bpjs',
  'npwp',
  'pajak',
  'lembur',
  'spg', 'shift',
  'istri', 'suami', 'mertua',
  'anak', ' bayi',
  'liburan', 'cuti',
  'kendaraan', 'motor', 'mobil',
  'macet',
  'tagihan', 'listrik', 'air',
  'belanja bulanan',
  'suami', 'istri',
  'nikah', 'menikah',
  'hamil',
  'rumah sakit', 'rs',
  'asuransi',
  'investasi',
  'saham',
  'ipb', 'ipk', 'nilai'
];

const GROOMING_SIGNALS = [
  'umur berapa',
  'kamu kelas berapa',
  'masih sekolah',
  'sendiri?',
  'kamu dimana',
  'rumah kamu',
  'orang tua',
  'rahasia',
  'jangan bilang',
  'diam-diam',
  'kita berdua aja',
  'foto dong',
  'kirim foto',
  'vcs', 'vc',
  'call', 'telpon',
  'ketemu', 'temuan',
  'aku suka kamu',
  'kamu cantik', 'kamu ganteng',
  'kamu berbeda',
  'dewasa',
  'aku jagain',
  'percaya sama aku'
];

const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const TYPEO_PATTERN = /(\w)\1{2,}/gi;
const CAPSLOCK_PATTERN = /[A-Z]{3,}/g;
const QUESTION_PATTERN = /\?/g;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

const profiles = new Map();

export function getProfile(userId) {
  if (!profiles.has(userId)) {
    profiles.set(userId, {
      userId,
      totalMessages: 0,
      totalLength: 0,
      totalWords: 0,
      typoCount: 0,
      emojiCount: 0,
      capslockCount: 0,
      questionCount: 0,
      slangHits: 0,
      schoolVocabHits: 0,
      adultVocabHits: 0,
      groomingSignalHits: 0,
      totalSlots: 0,
      activeHours: [],
      sessionCount: 0,
      lastSessionAt: 0
    });
  }
  return profiles.get(userId);
}

export function extractFeatures(text, profile) {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(w => w);

  if (words.length === 0) return;

  profile.totalMessages++;
  profile.totalLength += text.length;
  profile.totalWords += words.length;

  const emojis = text.match(EMOJI_PATTERN);
  if (emojis) profile.emojiCount += emojis.length;

  const typos = text.match(TYPEO_PATTERN);
  if (typos) profile.typoCount += typos.length;

  const caps = text.match(CAPSLOCK_PATTERN);
  if (caps) profile.capslockCount += caps.length;

  const questions = text.match(QUESTION_PATTERN);
  if (questions) profile.questionCount += questions.length;

  for (const word of words) {
    // Leet normalization: k3l4s→kelas, krj4→krj — kamus tetap bisa dicocokkan
    const w = normalizeLeet(word).toLowerCase().replace(/[^a-z]/g, '');
    if (INDONESIAN_SLANG.includes(w)) profile.slangHits++;
    if (SCHOOL_VOCAB.includes(w)) profile.schoolVocabHits++;
    if (ADULT_VOCAB.includes(w)) profile.adultVocabHits++;
  }

  // Grooming: cocok di teks mentah DAN teks ternormalisasi (r4h4s14 → rahasia)
  const lowerText = text.toLowerCase();
  const normalizedText = normalizeLeet(lowerText);
  for (const signal of GROOMING_SIGNALS) {
    if (lowerText.includes(signal) || normalizedText.includes(signal)) {
      profile.groomingSignalHits++;
    }
  }

  const hour = new Date().getHours();
  if (!profile.activeHours.includes(hour) && profile.totalMessages <= 5) {
    profile.activeHours.push(hour);
  }

  return profile;
}

const AGE_REFERENCES = {
  minor: {
    avgMsgLength: { min: 10, max: 40 },
    typoRate: { min: 0.15, max: 0.40 },
    emojiRate: { min: 0.15, max: 0.45 },
    slangRatio: { min: 0.20, max: 0.50 },
    schoolVocabRatio: { min: 0.05, max: 0.30 },
    adultVocabRatio: { min: 0.00, max: 0.05 },
    capslockRatio: { min: 0.02, max: 0.15 },
    questionRate: { min: 0.15, max: 0.40 },
    peakHours: [19, 20, 21, 22],
    typicalSessionCount: { min: 0, max: 20 },
    groomingSignalPerMsg: { min: 0.00, max: 0.02 }
  },
  '20s': {
    avgMsgLength: { min: 30, max: 120 },
    typoRate: { min: 0.02, max: 0.20 },
    emojiRate: { min: 0.03, max: 0.30 },
    slangRatio: { min: 0.03, max: 0.35 },
    schoolVocabRatio: { min: 0.00, max: 0.10 },
    adultVocabRatio: { min: 0.05, max: 0.35 },
    capslockRatio: { min: 0.00, max: 0.08 },
    questionRate: { min: 0.05, max: 0.25 },
    peakHours: [12, 13, 14, 19, 20, 21, 22, 23, 0],
    typicalSessionCount: { min: 0, max: 100 },
    groomingSignalPerMsg: { min: 0.00, max: 0.05 }
  },
  '30plus': {
    avgMsgLength: { min: 50, max: 150 },
    typoRate: { min: 0.01, max: 0.10 },
    emojiRate: { min: 0.01, max: 0.15 },
    slangRatio: { min: 0.01, max: 0.15 },
    schoolVocabRatio: { min: 0.00, max: 0.03 },
    adultVocabRatio: { min: 0.10, max: 0.40 },
    capslockRatio: { min: 0.00, max: 0.04 },
    questionRate: { min: 0.03, max: 0.20 },
    peakHours: [8, 9, 12, 13, 20, 21],
    typicalSessionCount: { min: 0, max: 200 },
    groomingSignalPerMsg: { min: 0.00, max: 0.03 }
  }
};

function scoreBracket(profile, ref) {
  if (profile.totalMessages < 3) return null;

  // Rata-rata panjang pesan (karakter/pesan) — bandingkan dengan range avgMsgLength
  const avgLen = profile.totalMessages > 0 ? profile.totalLength / profile.totalMessages : 0;
  const typoRate = profile.typoCount / profile.totalMessages;
  const emojiRate = profile.emojiCount / profile.totalMessages;
  const slangRatio = profile.slangHits / profile.totalWords;
  const schoolRatio = profile.schoolVocabHits / profile.totalWords;
  const adultRatio = profile.adultVocabHits / profile.totalWords;
  const capslockRatio = profile.capslockCount / profile.totalMessages;
  const questionRate = profile.questionCount / profile.totalMessages;
  const groomingRate = profile.groomingSignalHits / profile.totalMessages;

  const inRange = (val, range) => val >= range.min && val <= range.max;

  let score = 0;
  let maxScore = 0;

  const checks = [
    { val: avgLen, range: ref.avgMsgLength, weight: 1.5 },
    { val: typoRate, range: ref.typoRate, weight: 2.0 },
    { val: emojiRate, range: ref.emojiRate, weight: 1.5 },
    { val: slangRatio, range: ref.slangRatio, weight: 2.0 },
    { val: schoolRatio, range: ref.schoolVocabRatio, weight: 2.5 },
    { val: adultRatio, range: ref.adultVocabRatio, weight: 2.5 },
    { val: capslockRatio, range: ref.capslockRatio, weight: 1.0 },
    { val: questionRate, range: ref.questionRate, weight: 1.0 },
    { val: groomingRate, range: ref.groomingSignalPerMsg, weight: 3.0 }
  ];

  for (const check of checks) {
    maxScore += check.weight;
    if (inRange(check.val, check.range)) {
      score += check.weight;
    }
  }

  return score / maxScore;
}

export function estimateAge(profile) {
  if (profile.totalMessages < 3) {
    return { bracket: null, confidence: 0, suspicion: 0, scores: {} };
  }

  const scores = {};
  for (const [bracket, ref] of Object.entries(AGE_REFERENCES)) {
    const s = scoreBracket(profile, ref);
    if (s !== null) scores[bracket] = s;
  }

  if (Object.keys(scores).length === 0) {
    return { bracket: null, confidence: 0, suspicion: 0, scores };
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const second = Object.entries(scores).sort((a, b) => b[1] - a[1])[1];

  const bracket = best[0];
  const confidence = best[1];
  const gap = second ? best[1] - second[1] : 1;

  return { bracket, confidence, gap, scores };
}

export function checkMismatch(profile, claimedBracket) {
  const estimation = estimateAge(profile);
  if (!estimation.bracket) return { mismatch: false, action: null };

  const isMinorPattern = estimation.bracket === 'minor';
  const claimedNonMinor = claimedBracket && claimedBracket !== 'minor';
  const strongConfidence = estimation.confidence >= 0.6;
  const clearGap = estimation.gap >= 0.1;

  const groomingHigh = profile.groomingSignalHits > 0 && 
    (profile.groomingSignalHits / profile.totalMessages) > 0.15;

  if (isMinorPattern && claimedNonMinor && strongConfidence && clearGap) {
    return {
      mismatch: true,
      action: 'flag_underage',
      confidence: estimation.confidence,
      reason: `behavioral_match:minor_bracket`
    };
  }

  if (groomingHigh && claimedBracket === 'minor') {
    return {
      mismatch: true,
      action: 'flag_grooming',
      confidence: estimation.confidence,
      reason: `grooming_signals:${profile.groomingSignalHits}`
    };
  }

  if (estimation.confidence >= 0.6 && estimation.bracket !== claimedBracket) {
    return {
      mismatch: true,
      action: 'flag_mismatch',
      confidence: estimation.confidence,
      reason: `bracket_mismatch:${estimation.bracket}`
    };
  }

  return { mismatch: false, action: null };
}

export async function evaluateSession(userId, claimedBracket, trustLevel) {
  const profile = getProfile(userId);
  if (profile.totalMessages < 3) return;

  const result = checkMismatch(profile, claimedBracket);
  if (!result.mismatch) return;

  console.log(`🧠 Behavioral: ${userId} → ${result.action} (conf: ${result.confidence.toFixed(2)}, reason: ${result.reason})`);

  if (result.action === 'flag_underage' || result.action === 'flag_mismatch' || result.action === 'flag_grooming') {
    flagUserUnderage(userId);
    try {
      updateUserProfile(userId, { trust_level: 'flagged' });
    } catch (e) {}
  }

  return result;
}

export function clearProfile(userId) {
  profiles.delete(userId);
}

export { profiles };

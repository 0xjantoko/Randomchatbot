/**
 * Leet-speak normalizer — pertahanan anti-evasion untuk deteksi kata kunci.
 *
 * Dua arah pemetaan:
 *  - normalizeLeet():      digit → huruf (k3l4s → kelas)  → untuk pencocokan KATA KUNCI
 *  - digitizeLookalikes(): huruf → digit (08l… → 081…)     → untuk deteksi NOMOR HP
 *
 * Murni transformasi teks untuk deteksi — TIDAK memfilter/melarang konten.
 */

const DIGIT_TO_LETTER = {
  '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a',
  '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g'
};

const LETTER_TO_DIGIT = {
  'l': '1', 'i': '1', 'o': '0', 's': '5', 'b': '6',
  'g': '9', 'z': '2', 'e': '3', 'a': '4', 't': '7'
};

/** 'k3l4s brp4' → 'kelas brpa' (kata kuncicocok lagi) */
export function normalizeLeet(text) {
  return String(text).replace(/[0-9]/g, (d) => DIGIT_TO_LETTER[d] ?? d);
}

/** '08l234567890' → '081234567890' (regex HP kenali lagi) */
export function digitizeLookalikes(text) {
  return String(text).toLowerCase().replace(/[a-z]/g, (c) => LETTER_TO_DIGIT[c] ?? c);
}

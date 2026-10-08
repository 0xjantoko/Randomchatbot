/**
 * Moderation — bracket-breach enforcement (P0)
 *
 * Invariant produk: sexchat antar-peer di pool yang sama DIIZINKAN.
 * Yang dijaga ketat hanya batas pool:
 *   Adult -> Pool Minor   : EVICT (quarantine, keluar dari sesi & pool, review admin)
 *   Minor -> Pool Adult   : RATCHET (dikunci permanen ke Pool Minor, dilindungi dari paparan adult)
 *
 * Deteksi berbasis perilaku HANYA dipakai untuk dua arah di atas —
 * bukan untuk melarang kata/konten seksual antar-peer.
 */
import config from '../config.js';
import { getProfile, estimateAge } from './behavioral.js';
import {
  quarantineUser,
  flagUserUnderage,
  logViolation,
  setBracketLock
} from '../database/db.js';
import { anonymizeUserId } from '../utils/privacy.js';
import { logger, metrics } from '../admin/index.js';
import { tLang } from '../locales/index.js';
import { flushEvidence } from './evidence.js';

export const BREACH = {
  EVICT: 'evict',
  RATCHET_MINOR: 'ratchet_minor',
  LOG_ONLY: 'log_only'
};

export const MIN_CONFIDENCE = 0.6;
export const MIN_GAP = 0.1;
/** Sinyal grooming di Pool Minor = kejadian, bukan rasio (threshold lama 0.15/msg nyaris tak tersentuh). */
export const GROOMING_EVICT_THRESHOLD = 2;

/**
 * Klasifikasi pelanggaran batas pool. Pure function → mudah diuji.
 * @param {object} profile - hasil getProfile()/extractFeatures()
 * @param {string} claimedBracket - 'minor' | '20s' | '30plus'
 */
export function classifyBreach(profile, claimedBracket) {
  if (!profile || profile.totalMessages < 3 || !claimedBracket) return { kind: null };

  const est = estimateAge(profile);
  const groomingHits = profile.groomingSignalHits || 0;
  const confident = Boolean(est.bracket) && est.confidence >= MIN_CONFIDENCE;
  const clear = (est.gap ?? 0) >= MIN_GAP;

  if (claimedBracket === 'minor') {
    // 1. Perilaku konsisten adult di Pool Minor → predator, usir.
    //    Quarantine reversible (review admin), jadi cukup confidence — gap tidak diwajibkan.
    if (confident && est.bracket !== 'minor') {
      return {
        kind: BREACH.EVICT,
        reason: `adult_pattern_in_minor_pool:${est.bracket}`,
        confidence: est.confidence,
        claimed: claimedBracket,
        detected: est.bracket
      };
    }
    // 2. Sinyal grooming berulang di Pool Minor → usir.
    if (groomingHits >= GROOMING_EVICT_THRESHOLD) {
      return {
        kind: BREACH.EVICT,
        reason: `grooming_signals_minor_pool:${groomingHits}`,
        confidence: est.confidence || 0,
        claimed: claimedBracket,
        detected: est.bracket
      };
    }
    return { kind: null };
  }

  // 3. Perilaku konsisten minor tapi klaim adult → lindungi: kunci ke Pool Minor.
  if (confident && clear && est.bracket === 'minor') {
    return {
      kind: BREACH.RATCHET_MINOR,
      reason: 'minor_pattern_in_adult_pool',
      confidence: est.confidence,
      claimed: claimedBracket,
      detected: est.bracket
    };
  }

  // 4. Beda antar sesama pool adult (20s vs 30plus) bukan risiko kontak minor → catat saja.
  if (confident && est.bracket !== claimedBracket) {
    return {
      kind: BREACH.LOG_ONLY,
      reason: `bracket_mismatch:${est.bracket}`,
      confidence: est.confidence,
      claimed: claimedBracket,
      detected: est.bracket
    };
  }

  return { kind: null };
}

async function alertAdmins(botApi, adminIds, text) {
  if (!botApi) return 0;
  let sent = 0;
  for (const adminId of adminIds || []) {
    try {
      await botApi.sendMessage(adminId, text, { parse_mode: 'Markdown' });
      sent++;
    } catch (e) {
      console.error(`Admin alert failed for ${adminId}: ${e.message}`);
    }
  }
  return sent;
}

async function endSessionQuietly(sessionService, userId, reason) {
  if (!sessionService) return null;
  try {
    const res = await sessionService.endSession(userId, reason);
    return res?.partnerId || null;
  } catch (e) {
    console.error(`endSession(${reason}) failed: ${e.message}`);
    return null;
  }
}

/**
 * Tegakkan pelanggaran batas pool: hentikan sesi, karantina/kunci, beri tahu user + admin.
 * @returns {Promise<object|null>} keputusan breach, atau null kalau tidak ada pelanggaran
 */
export async function enforceBracketBreach(userId, claimedBracket, deps = {}) {
  const {
    sessionService = null,
    botApi = null,
    language = 'id',
    adminIds = config.ADMIN_IDS
  } = deps;

  const profile = getProfile(userId);
  const decision = classifyBreach(profile, claimedBracket);
  if (!decision.kind) return null;

  const anon = anonymizeUserId(userId);
  const lang = language || 'id';

  if (decision.kind === BREACH.EVICT) {
    quarantineUser(userId, decision.reason);
    flagUserUnderage(userId);
    try { logViolation(userId, `bracket_breach:${decision.reason}`, `detected=${decision.detected}`); } catch (_) {}
    metrics?.incViolation?.();
    logger.error('bracket_breach_evict', {
      userId, anon, reason: decision.reason, confidence: decision.confidence
    });

    const partnerId = sessionService?.getPartner?.(userId) || null;
    try { flushEvidence(userId, partnerId, { reason: decision.reason, bracket: claimedBracket }); } catch (_) {}
    await endSessionQuietly(sessionService, userId, 'bracket_breach');
    try { sessionService?.poolService?.removeFromPool?.(userId); } catch (_) {}

    if (botApi) {
      try {
        await botApi.sendMessage(userId, tLang(lang, 'moderation.evict_notice'), { parse_mode: 'Markdown' });
      } catch (_) {}
      if (partnerId) {
        try {
          await botApi.sendMessage(partnerId, tLang(lang, 'chat.partner_left_chat'), { parse_mode: 'Markdown' });
        } catch (_) {}
      }
      await alertAdmins(botApi, adminIds, tLang('id', 'moderation.admin_evict', {
        anon,
        userId,
        reason: decision.reason,
        confidence: (decision.confidence || 0).toFixed(2),
        claimed: decision.claimed || '-'
      }));
    }

    return decision;
  }

  if (decision.kind === BREACH.RATCHET_MINOR) {
    setBracketLock(userId, 'minor');
    flagUserUnderage(userId);
    logger.warn('bracket_breach_ratchet', {
      userId, anon, reason: decision.reason, confidence: decision.confidence
    });

    const partnerId = sessionService?.getPartner?.(userId) || null;
    try { flushEvidence(userId, partnerId, { reason: decision.reason, bracket: claimedBracket }); } catch (_) {}
    await endSessionQuietly(sessionService, userId, 'bracket_ratchet');

    if (botApi) {
      try {
        await botApi.sendMessage(userId, tLang(lang, 'moderation.ratchet_notice'), { parse_mode: 'Markdown' });
      } catch (_) {}
      if (partnerId) {
        try {
          await botApi.sendMessage(partnerId, tLang(lang, 'chat.partner_left_chat'), { parse_mode: 'Markdown' });
        } catch (_) {}
      }
      await alertAdmins(botApi, adminIds, tLang('id', 'moderation.admin_ratchet', {
        anon,
        userId,
        reason: decision.reason,
        confidence: (decision.confidence || 0).toFixed(2)
      }));
    }

    return decision;
  }

  logger.info('bracket_mismatch_log', { userId, anon, reason: decision.reason });
  return decision;
}

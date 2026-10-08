/**
 * Evidence — ring buffer pesan per sesi (in-memory, maks 20 pesan).
 *
 * Prinsip:
 * - Tidak ada penyimpanan massal: transcript hanya DIKUNCI (AES-256-GCM via logger) ketika
 *   terjadi bracket-breach / flag, atau saat sesi Pool Minor berakhir.
 * - Retensi terbatas (`EVIDENCE_TTL_DAYS`, default 30 hari) — dipangkas otomatis.
 * - Admin-only. Yang tersimpan: anon_id + teks + timestamp; user_id hanya di kolom DB.
 */
import config from '../config.js';
import logger from '../admin/logger.js';
import { hashPairId, anonymizeUserId } from '../utils/privacy.js';
import {
  insertEvidence,
  listEvidence,
  getEvidence,
  pruneEvidence,
  countEvidence
} from '../database/db.js';

const MAX_MESSAGES = config.EVIDENCE_MAX_MESSAGES;
const TTL_DAYS = config.EVIDENCE_TTL_DAYS;

/** pairKey -> { userLow, userHigh, bracket, messages: [{at, anon, text}] } */
const buffers = new Map();

export function recordMessage(fromUserId, toUserId, text, { bracket = null } = {}) {
  if (!text || !fromUserId || !toUserId) return;
  const key = hashPairId(fromUserId, toUserId);
  let buf = buffers.get(key);
  if (!buf) {
    const [low, high] = [Number(fromUserId), Number(toUserId)].sort((a, b) => a - b);
    buf = { userLow: low, userHigh: high, bracket: bracket || null, messages: [] };
    buffers.set(key, buf);
  }
  if (!buf.bracket && bracket) buf.bracket = bracket;

  buf.messages.push({
    at: Math.floor(Date.now() / 1000),
    anon: anonymizeUserId(fromUserId),
    text: String(text).substring(0, 1000)
  });
  if (buf.messages.length > MAX_MESSAGES) {
    buf.messages.splice(0, buf.messages.length - MAX_MESSAGES);
  }
}

/**
 * Kunci buffer menjadi bukti terenkripsi di DB.
 * @returns {{id:number, messageCount:number}|null}
 */
export function flushEvidence(fromUserId, toUserId, { reason = 'breach', bracket = null } = {}) {
  if (!fromUserId || !toUserId) return null;
  const key = hashPairId(fromUserId, toUserId);
  const buf = buffers.get(key);
  if (!buf || buf.messages.length === 0) return null;

  pruneEvidence(TTL_DAYS);
  const payload = logger.encrypt(JSON.stringify(buf.messages));
  const res = insertEvidence({
    pairKey: key,
    userLow: buf.userLow,
    userHigh: buf.userHigh,
    reason,
    bracket: bracket || buf.bracket,
    payload,
    messageCount: buf.messages.length
  });

  buffers.delete(key);
  console.log(`🗂️ Evidence stored: pair ${key.substring(0, 8)}… (${buf.messages.length} pesan, ${reason})`);
  return { id: Number(res.lastInsertRowid), messageCount: buf.messages.length };
}

/** Metadata bukti (payload tetap terenkripsi) + anon id. */
export function listEvidenceMeta({ userId = null, limit = 50 } = {}) {
  pruneEvidence(TTL_DAYS);
  return listEvidence({ userId, limit }).map(r => ({
    id: r.id,
    anon_low: anonymizeUserId(r.user_low),
    anon_high: anonymizeUserId(r.user_high),
    user_low: r.user_low,
    user_high: r.user_high,
    reason: r.reason,
    bracket: r.bracket,
    message_count: r.message_count,
    created_at: r.created_at
  }));
}

/** Transcript terdekripsi (admin only). */
export function readEvidence(id) {
  const row = getEvidence(id);
  if (!row) return null;
  const raw = logger.decrypt(row.payload);
  let messages = [];
  try { messages = raw ? JSON.parse(raw) : []; } catch { messages = []; }
  const { payload, ...meta } = row;
  return { ...meta, messages };
}

export function evidenceCount() {
  pruneEvidence(TTL_DAYS);
  return countEvidence();
}

export function clearBuffer(fromUserId, toUserId) {
  buffers.delete(hashPairId(fromUserId, toUserId));
}

export function bufferCount() {
  return buffers.size;
}

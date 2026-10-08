# Randomchatbot — Todo List

## ✅ Done — Moderation P0/P1 (bracket-breach)

- [x] `src/services/moderation.js` — EVICT (adult di Pool Minor / grooming ≥2 sinyal) + RATCHET (minor di Pool Adult) + alert `ADMIN_IDS`
- [x] Quarantine DB (`quarantined_at`, `quarantine_reason`, `bracket_locked`) + gate onboarding
- [x] Admin API: `GET /admin/api/quarantine`, `POST /admin/api/quarantine/:id/release`
- [x] Bukti terenkripsi AES-256-GCM (`services/evidence.js`, TTL 30 hari, ring buffer 20 pesan) + API evidence + panel Svelte
- [x] Cooldown re-match Pool Minor (`MINOR_REMATCH_HOURS`, tabel `match_pairs`)
- [x] Trust system aktif: shadow (<3 sesi) & flagged → foto/voice terkunci (`services/trust.js`)
- [x] Pool Minor = hardened zone: ajakan pindah platform/ketemu → freeze langsung 24 jam
- [x] `MIN_AGE`/`MAX_AGE` dari config (.env 13/99), `updateUserProfile` upsert, flagged tidak naik ke verified
- [x] Test: `scripts/test-moderation.mjs` (12), `scripts/test-p1.mjs` (15), `scripts/readiness-check.mjs` (38)

## ✅ Done — Gamified Progression (Opsi 1)

- [x] `src/services/xp.js` — Level thresholds, XP calculator, streak logic, daily cap
- [x] `src/services/achievements.js` — 21 achievement definitions + unlock detection
- [x] `src/services/leaderboard.js` — In-memory leaderboard (refresh 30s, top 100)
- [x] `src/handlers/gamification.js` — Commands /profile, /rank, /daily, /achievements
- [x] `src/database/db.js` — Tables: user_profiles, achievements, daily_rewards + CRUD
- [x] Inject XP ke chat.js (+2/msg), media.js (+5/foto), suit.js (+3 main, +5 menang)
- [x] Inject XP +10 ke onboarding.js (sesi match)
- [x] Welcome stats di start.js (level, XP, streak untuk returning user)
- [x] Notifikasi achievement unlock + level up (semua handler)

## ❌ Belum — 18+ Payment (Telegram Stars)

Prioritas tinggi sebelum launch:

### 🎯 Critical Path

- [ ] **Sinkronisasi harga** — `STAR_PRICES.18+` (50⭐) vs `PREMIUM_FEATURES.18+.price` (100⭐) beda. Pake env aja: `STAR_PRICE_18`.
- [ ] **Implement `bot.api.sendInvoice()`** — Kirim Telegram Star Invoice ke user
- [ ] **Handler `pre_checkout_query`** — Validasi + answer sebelum bayar
- [ ] **Handler `message:successful_payment`** — Unlock fitur, simpan ke DB, kirim konfirmasi
- [ ] **Simpan unlock status ke DB** — `user_profiles.unlocked_features TEXT` atau tabel `user_premium` biar persist walau restart

### 🧹 Polish

- [ ] **Fix handling di start.js** — Saat user unlock 18+, session baru harus baca unlock dari DB, bukan dari `ctx.session.unlocked`
- [ ] **Update /help** — Tampilkan harga real-time dari env
- [ ] **Rate limit 18+ mode** — Bedain rate limit antara mode random vs 18+?

## 🔜 Next — Smart Social Graph (Opsi 2)

- [ ] Interest tags (30+ tags, pilih 3-5)
- [ ] Weighted matching algorithm (interest overlap 25%, reputation 10%, etc.)
- [ ] Match rating (/rate 1-5)
- [ ] Favorites + match again
- [ ] Match history dashboard
- [ ] Topics mode (/topics gaming)
- [ ] Re-engagement push (idle >48 jam)

## 📋 Catatan Pre-Launch

- [ ] **Swap `better-sqlite3` → `sql.js`** atau downgrade Node ke v20-25 (native addon issue di Node 26)
- [ ] **Setup env** — `BOT_TOKEN`, `HASH_SECRET`, `ADMIN_API_KEY`, `LOG_ENCRYPTION_KEY`
- [ ] **Build admin panel** — `npm run build:admin`
- [ ] **Deploy VPS** — Minimal 512MB RAM, domain + SSL untuk webhook

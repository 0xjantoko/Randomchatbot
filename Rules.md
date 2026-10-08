# Aturan & Proteksi RandomChatBot

> **Prinsip desain:** sexchat / flirting / eksplorasi antar-peer di pool yang **sama** tidak dilarang dan tidak dikejar.
> Yang dilindungi adalah **batas pool**: tidak boleh ada kontak Adult ↔ Minor. Karena umur tidak bisa
> diverifikasi tanpa merusak anonimitas, **Pool Minor diperlakukan sebagai hardened zone** — proteksinya
> menempel pada pool, bukan pada klaim identitas user.

## 1. Age Pool Isolation (P1)

| Pool | Umur | Bucket key | Fitur | Proteksi |
|------|------|-----------|-------|----------|
| **minor** | 13-17 | `language:minor` | Text + phantom photo **3 detik** | ❌ Voice, ❌ Video, ❌ re-match partner sama |
| **20s** | 18-29 | `language:20s` | Text + phantom photo 10 detik + voice | ❌ Video |
| **30plus** | 30+ | `language:30plus` | Text + phantom photo 10 detik + voice | ❌ Video |
| **<13** | 1-12 | — | ❌ Tidak bisa daftar (ditolak di `handleAge`) | ❌ |

**Aturan besi:** matchmaking hanya di dalam bucket `language:agePool` (`pool.js:_bucketKey`). Cross-pool
match tidak mungkin secara struktural. Tapi karena pool dipilih dari **klaim** umur, integritas batas
dijaga oleh enforcement di §3, bukan oleh bucket saja.

---

## 2. Age Verification (P2)

- Klaim umur → 1 trap acak: **tulis umur dalam huruf** (`delapan belas`) **atau** **tahun lahir**.
- Konsisten (`±1 tahun`) → `_ageVerified = true`; tidak konsisten → `_ageVerified = false`.
- Klaim **≥18** tapi gagal verifikasi → dipaksa ke pool **minor** + `trust_level = flagged`.
- Klaim **<18** tidak butuh verifikasi (dan tidak bisa dapat akses pool adult).
- **Ratchet:** `bracket_locked = 'minor'` (lihat §3) bersifat permanen sampai admin mencabut —
  user yang pernah dikunci ke pool minor tidak bisa masuk pool adult walau klaim ulang.
- Gate umur memakai `config.MIN_AGE` / `config.MAX_AGE` (`MIN_AGE=13`, `MAX_AGE=99`): 13-17 → Pool Minor,
  18+ → Pool Adult, <13 ditolak. Ubah lewat `.env`, bukan hardcode.

---

## 3. Enforcement Batas Pool (P0 — `services/moderation.js`)

Perilaku user dianalisis real-time per pesan (`behavioral.js`, butuh ≥3 pesan sebelum klasifikasi).
Keputusan hanya menyangkut **lintas pool**, bukan gaya chat:

| Kondisi | Aksi | Efek |
|---------|------|------|
| Perilaku konsisten **adult** di pool **minor** (confidence ≥0.6) | **EVICT** | Sesi dihentikan, `quarantined_at` diisi, `trust_level=flagged`, keluar dari pool, alert ke `ADMIN_IDS` |
| Sinyal grooming **≥2 kejadian** dalam 1 sesi di pool **minor** | **EVICT** | Sama seperti di atas (kejadian, bukan rasio) |
| Perilaku konsisten **minor** tapi klaim **adult** | **RATCHET** | Sesi dihentikan, `bracket_locked='minor'` permanen, dipindah ke Pool Minor (dilindungi, bukan dihukum) |
| Beda pool antar sesama adult (20s vs 30plus) | **LOG** | Hanya dicatat, tanpa sanksi |

- **Quarantine ≠ ban.** User di quarantine tidak bisa masuk pool (`onboarding.js` gate) sampai admin
  melepas via `POST /admin/api/quarantine/:userId/release` (opsional `{"unlock_bracket":true}`).
- Antrean review: `GET /admin/api/quarantine` (anonim `Anon-XXXX`).
- Pool Minor = hardened zone: ajakan pindah platform / ketemu (`privacy.js` kategori `migration`)
  langsung **freeze 24 jam tanpa 3 strike** (`media.js:checkViolation`, `options.bracket==='minor'`).
  Di pool adult tetap berlaku tangga 3 strike.

---

## 4. Trust System (P5 — aktual)

| Level | Syarat (implementasi) | Efek nyata |
|-------|----------------------|-----------|
| **shadow** | Default user baru (<3 sesi selesai) | ✅ Foto & voice **terkunci** (`resolveTrust` → `media.locked_shadow`) |
| **verified** | >=3 sesi selesai (`incrementSessionsCompleted`) | ✅ Foto + voice aktif |
| **flagged** | Mismatch perilaku / report underage / EVICT | ✅ Foto & voice terkunci permanen, dipaksa ke Pool Minor saat `/start` |
| **bracket_locked** | RATCHET minor | ✅ Ratchet permanen ke Pool Minor sampai admin mencabut |

- Trust di-resolve dari DB (`trust_level` + `sessions_completed`) dengan cache 30 detik (`services/trust.js`),
  fail-closed: error baca DB → `shadow` (terkunci).
- `flagged` **tidak pernah** naik ke `verified` walau jumlah sesi bertambah (dijaga di SQL `incrementSessionsCompleted`).

### 4.1 Bukti & Retensi (P1)

- Setiap pesan disimpan **in-memory** (ring buffer 20 pesan/sesi, `services/evidence.js`) — tidak menulis disk.
- Transcript **dikunci** (AES-256-GCM, key `LOG_ENCRYPTION_KEY`) hanya ketika: bracket-breach/flag terjadi,
  atau sesi Pool Minor berakhir.
- Retensi `EVIDENCE_TTL_DAYS` (default 30 hari) — dipangkas otomatis saat baca/tulis.
- Admin-only: `GET /admin/api/evidence?userId=` (metadata) dan `GET /admin/api/evidence/:id` (isi terdekripsi).
- Yang tersimpan: `Anon-XXXX`, teks (maks 1000 char), timestamp. Identitas Telegram tidak ada di dalam payload.

### 4.2 Cooldown Re-match Pool Minor (P1)

- Pasangan yang pernah match tidak bisa di-match ulang dalam `MINOR_REMATCH_HOURS` (default 24 jam).
- Berlaku bila **salah satu** pihak di Pool Minor (`pool.js:findMatch`, `match_pairs` + `hashPairId`).
- Tujuan: memutus kesinambungan grooming tanpa melarang sexchat antar-peer di pool yang sama.
- Fitur favorites / match history / `match again` **tidak diaktifkan** — akan melanggar aturan ini kalau dibuat.

---

## 5. Report & Enforcement (P4)

### Report System
| Aksi | Konsekuensi |
|------|-------------|
| `/report` (alasan apapun) | ⛔ Temp ban 24 jam untuk yang dilaporkan |
| `/report underage` | ⛔ Temp ban 24 jam + 🚩 flagUserUnderage() |
| 2+ report (repeat offender) | ⛔ Temp ban 72 jam + 🚩 flagged permanen |

### Migration Violation (ajak keluar platform)
| Pelanggaran | Kategori | Konsekuensi |
|-------------|----------|-------------|
| Share WA / IG / Line / Discord / Signal / Snapchat / TikTok / X / Telepon | `migration` | Peringatan 1/3 → 2/3 → 3/3 |
| Ajakan ketemu / pindah platform / DM / CP | `migration` | ⛔ **Freeze 24 jam** di pelanggaran ke-3 |
| @username / Telegram link | `migration` | Freeze 24 jam (3x) |

### Personal Info Violation
| Pelanggaran | Kategori | Konsekuensi |
|-------------|----------|-------------|
| Nomor telepon | `personal_info` | Peringatan → **Auto-ban permanent** (3x) |
| Credit card | `personal_info` | Auto-ban permanent (3x) |
| Email | `personal_info` | Auto-ban permanent (3x) |

### Freeze vs Ban

| Status | Durasi | Bisa Chat? | Bisa Match? | Bisa Recovery? |
|--------|--------|------------|-------------|----------------|
| **Freeze** | 24 jam | ❌ | ❌ | ✅ Otomatis setelah 24 jam |
| **Banned** | Permanent | ❌ | ❌ | ❌ Tidak bisa |

---

## 6. Phantom Photo

| Bracket | Timer | Proteksi |
|---------|-------|----------|
| Minor (13-17) | **3 detik** | Blind photo + warning + auto-delete |
| Adult (18+) | **10 detik** | Blind photo + warning + auto-delete |

> Foto & voice hanya untuk trust `verified` (>=3 sesi). `shadow`/`flagged` terkunci (lihat §4).
> Jadi user baru: chat teks dulu; foto terbuka setelah 3 sesi, voice setelah verified dan tidak minor.

- Foto: ❌ Video, ❌ GIF, ❌ Sticker
- Voice: ✅ Adult (verified), ❌ Minor (semua)
- Semua foto disimpan di DB dengan anonymized ID (hanya admin)
- Screenshot: tidak bisa dicegah secara teknis, tapi ada warning + konsekuensi

---

## 7. Session Limits

| Bracket | Max Durasi Sesi | Max Pesan | Cooldown Skip |
|---------|----------------|-----------|---------------|
| Minor (13-17) | 10 menit | Unlimited | Tidak ada |
| Adult (18+) | 60 menit | Unlimited | Tidak ada |

---

## 8. Daftar Hitam

- Semua foto yang dikirim di semua bracket tersimpan di database (hanya admin)
- Semua violation tercatat (3 migration = freeze, 3 personal_info = ban)
- Trust level `flagged` tersimpan permanen di DB (tidak hilang meski restart)
- Ganti akun Telegram = reset, tapi P3 akan flag kembali dalam 3 pesan

---

## 9. Yang Tidak Diizinkan (Semua Bracket)

| Larangan | Deteksi | Konsekuensi |
|----------|---------|-------------|
| Share kontak (WA/IG/Line/DC/dll) | ✅ PII regex | Freeze 24 jam (3x) |
| Ajakan ketemu fisik | ✅ PII regex | Freeze 24 jam (3x) |
| Share nomor telepon | ✅ PII regex | Auto-ban permanent (3x) |
| Share email | ✅ PII regex | Auto-ban permanent (3x) |
| Share credit card | ✅ PII regex | Auto-ban permanent (3x) |
| Video / GIF / Sticker | ✅ Media block | Langsung ditolak |

---

## 10. Yang Diizinkan (Bebas)

| Aktivitas | Minor | Adult |
|-----------|-------|-------|
| Chat text bebas | ✅ | ✅ |
| Flirting / chatsex | ✅ | ✅ |
| Kirim foto (phantom) | ✅ 3 detik | ✅ 10 detik |
| Voice message | ❌ | ✅ (verified) |
| Eksplorasi seksual | ✅ sesama minor | ✅ sesama adult |
| Skip kapan saja | ✅ | ✅ |
| Report abuse | ✅ | ✅ |
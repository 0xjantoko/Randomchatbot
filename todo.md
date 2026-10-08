# Randomchatbot — Todo List

*Terakhir diperbarui: 30 September 2026*

## ✅ Done — Security Hardening (sesi ini)

- [x] **R2 block-forward** — `migration`/`personal_info` **tidak diteruskan ke partner** (semua pool); sebelumnya warning tanpa `return` → 5/8 kasus bocor. `chat.js`
- [x] **Caption foto ikut R2** — `checkViolation` pada `photo.caption` + block-forward. `media.js`
- [x] **Kartu kontak** → jalur `personal_info`, diblokir + warning
- [x] **Catch-all tipe jatuh** — `video_note`/dokumen/lokasi/poll/dice: fail-closed + feedback + log (tak senyap)
- [x] **Voice evidence** — file_id + pengirim masuk ring buffer (terkunci saat sesi minor berakhir/breach)
- [x] **`PRIVACY.md`** — batas diakui eksplisit: screenshot, OCR, ASR, chat luar-bot, estimasi usia
- [x] **P0 grammY middleware** — `onboarding.js` + `chat.js` `message:text` handler `return` tanpa `next()` → menelan SEMUA pesan + mematikan `/skip` `/report` `/profile` `/shop`. Fixed, dibuktikan harness middleware asli
- [x] **Leet anti-bypass** — `utils/leet.js` (`normalizeLeet` + `digitizeLookalikes`) di jalur `checkPersonalInfo`
- [x] **Context Parameter** — `services/context-parameter.js`: keyword/slang/phone, skor 0-100, EMA, **signal-only** (tanpa auto-ban)

## ✅ Done — Eval Gate + Performance

- [x] **`npm test`** (`scripts/test-policy.mjs`) — 9 suite satu pintu, exit 1 saat fail (red-team loop otomatis)
- [x] `scripts/test-mw-order.mjs` — harness grammY ASLI: chain onboarding→chat→command + seluruh Paket A (9 cek)
- [x] `scripts/test-admin.mjs` — smoke panel admin: auth 401/200, static, health, API inti, SSE (11 cek)
- [x] `scripts/audit-rules.mjs` — R2 8/8 terblokir, celah 0, R1 salah blokir 0
- [x] `scripts/simulate-load.mjs` — full-pipeline 100/1K/100K (lihat Benchmark.md §9)
- [x] **Queue O(n²) → O(1)** — `pool.js` `waitingQueue` array→Set: addToPool 100K **44.6s → 525ms (85x)**
- [x] `scripts/bench-queue.mjs` — micro-benchmark antrean
- [x] Docs diperbarui: DevProgress §12 · Benchmark §9 · Rules §5/§6/§9 · APIplan status · PRIVACY

## ⏳ Belum — Perbaikan Terbuka

### Prioritas tinggi
- [ ] **`findMatch` lazy** — `pool.js:157` masih bangun array kandidat penuh per panggilan → O(bucket); satu-satunya O(n²) tersisa (829s fase match di sim 100K)
- [ ] **Bracket fallback** — `findMatch` derive `_ageBracket` dari `age` kalau field kosong (celah defensif; produksi aman)
- [ ] **Pre-launch**: regen `BOT_TOKEN` (@BotFather) · `npm run build:admin` · push origin · deploy VPS (Node 22 LTS, `npm ci`)

### Backlog
- [ ] AI layer L1 — model lokal utk intent keluar-pool (tunggu kasus lolos terukur; evidence sudah terkumpul)
- [ ] Context Parameter → panel admin (signal review, bukan auto-ban)

## 🔜 Next — Smart Social Graph (Opsi 2)

- [ ] Interest tags (30+ tags, pilih 3-5)
- [ ] Weighted matching algorithm (interest overlap 25%, reputation 10%, etc.)
- [ ] Match rating (/rate 1-5)
- [ ] Re-engagement push (idle >48 jam)
- [ ] ⛔ Favorites / match history / match-again — **jangan diaktifkan** (melanggar cooldown re-match Pool Minor, Rules.md §4.2)

## 📋 Catatan Pre-Launch

- [ ] **Node versi** — lokal jalan di Node 26 (better-sqlite3 12.8 prebuilt OK); di VPS pakai **Node 22 LTS** (LTS resmi)
- [ ] **Setup env** — `BOT_TOKEN`, `HASH_SECRET`, `ADMIN_API_KEY`, `LOG_ENCRYPTION_KEY`, `MINOR_REMATCH_HOURS`
- [ ] **Deploy VPS** — minimal 512MB (RSS @100K user = 278MB, lihat Benchmark §9), domain + SSL untuk webhook
- [ ] Catatan: `18+ Payment` lama **dihapus** — mode 18+ sudah tidak ada; Stars payment via `/shop` + `payment.js` (pre_checkout + successful_payment) sudah jalan

## 🗑️ Dihapus (tidak relevan)

- ~~18+ Mode / `STAR_PRICE_18`~~ — dimensi 18+ dihapus total (DevProgress §10.1); pool memakai bracket umur
- ~~better-sqlite3 → sql.js swap~~ — tak perlu; native addon jalan (suite 9/9 hijau di Node 26)

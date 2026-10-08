# DevProgress — RandomChatbot

## Ringkasan

Proyek: **Telegram Random Chat Bot** (Node.js + grammy + SQLite)
Tujuan: Anonymous chat matchmaking dengan fitur premium, privacy, phantom photos, admin dashboard.

---

## 1. Benchmark & Performance

### Baseline (Before Fixes)

| Metric | Value |
|--------|-------|
| Pool add (5000 users) | 188 ms |
| Find match (100x) | 0.38 ms (0.0038 ms/search) |
| Create 500 sessions | 5.63 ms |
| Forward 500 msgs | 0.14 ms |
| End 500 sessions | 3.76 ms |
| Memory (Heap) | 12 MB |
| Memory (RSS) | 61 MB |

### Optimized (After Fixes — 10.000 Users)

| Metric | Value |
|--------|-------|
| Pool add (10.000) | 510 ms (0.0510 ms/user) |
| Find match (1.000x) | 3.78 ms (0.0038 ms/search) |
| Create 1.000 sessions | 13 ms |
| Forward 1.000 msgs | 0.4 ms |
| End 1.000 sessions | 7.1 ms |
| Memory (Heap) | 24 MB |
| Memory (RSS) | 82 MB |

### Massive Scale Simulation (100K → 1M users)

| Batch | Heap | RSS | bytes/user |
|-------|------|-----|------------|
| Start | 5.1 MB | 39.1 MB | — |
| 10.000 | 12.2 MB | 77.1 MB | ~750 |
| 50.000 | 169.8 MB | 289.0 MB | ~3454 |
| 100.000 | 321.7 MB | 405.1 MB | ~3320 |

**Estimasi 1.000.000 user (in-memory):** ~3171 MB heap — ❌ butuh VPS 4GB+
**Rekomendasi 1M user:** Redis backend (~3166 MB Redis) + bot ~50 MB → ✅ VPS 1GB

### Matchmaking Throughput

| Operation | Latency | Throughput |
|-----------|---------|------------|
| Pool add | 0.05 ms/user | 19.563 users/sec |
| Match search | 0.0038 ms/search | 263.922 searches/sec |
| Session create | 0.013 ms/session | 76.923 sessions/sec |
| Message forward | 0.0004 ms/msg | 2.500.000 msgs/sec |

---

## 2. Critical Bug Fixes

| # | Bug | File | Dampak | Fix |
|---|-----|------|--------|-----|
| 1 | Grammy `session()` middleware tidak di-set | `src/index.js` | **Bot crash** di handler pertama — `ctx.session` undefined | `bot.use(session({ initial: () => ({...}) }))` |
| 2 | `poolService`/`sessionService` dibaca dari `ctx.session` (undefined) | `src/handlers/start.js` | **TypeError: Cannot destructure undefined** | Ganti ke closure parameter `{ poolService, sessionService }` |
| 3 | Callback query dijawab 2x (onboarding + media) | `src/handlers/onboarding.js` | **API error: query is outdated** | Tambah `knownPrefixes` guard — hanya answer callback onboarding |
| 4 | Deadlock di pool lock (`addToPool` → `removeFromPool`) | `src/services/pool.js` | **Bot hang permanent** | Split `removeFromPool` jadi `_removeFromPool` (no lock) + public (with lock) |
| 5 | `forwardMessage` show sender profile sebagai prefix | `src/services/session.js` | **Privacy bocor** — recipient lihat info sendiri | `getPartnerProfile(partnerId)` → `getPartnerProfile(fromUserId)` |
| 6 | `getActiveSessions()` return float | `src/services/session.js` | **Display bug** — contoh 1.5 sessions | `Math.floor(sessions.size / 2)` |
| 7 | `isBanned` import dari `./media.js` (tidak di-export) | `src/handlers/chat.js` | **TypeError: isBanned is not a function** di runtime | Hapus import `isBanned` — ganti ke `bannedCache.isBanned()` |
| 8 | `isBanned` masih terimport di `media.js` tapi tidak dipakai | `src/handlers/media.js` | Dead code | Hapus dari import |
| 9 | `feature.description` undefined | `src/config.js` | Tampil "undefined" di UI | Tambah field `description` |
| 10 | Stale suit games tidak pernah cleanup | `src/handlers/suit.js` | **Memory leak** | Auto-cleanup timer 5 menit |
| 11 | `app.listen` error handler tidak jalan | `src/admin/server.js` | EADDRINUSE tidak tertangkap | Ganti ke event-based `server.on('error', ...)` |
| 12 | DB tidak di-close saat shutdown | `src/index.js` | **Data corruption risk** | `getDb().close()` di SIGINT handler |

---

## 3. Performance Optimizations

### Pool Service — Indexed Language Buckets

**Before:** O(n) linear scan seluruh waiting queue.
**After:** O(n/5) — hanya iterasi user dengan bahasa yang sama.

File: `src/services/pool.js`

Perubahan:
- Tambah `this.langBuckets = new Map()` — key: language, value: Map<userId, user>
- `addToPool`: masukin user ke bucket sesuai language
- `_removeFromPool`: hapus dari bucket
- `findMatch`: iterasi `langBuckets[user.language]` saja, bukan seluruh queue

### Banned Cache — In-Memory Set

File: `src/services/banned-cache.js` (NEW)

- `Set` of banned user IDs in memory
- Refresh dari SQLite setiap 30 detik
- **Zero DB reads** untuk ban check per message
- Methods: `init()`, `isBanned()`, `add()`, `remove()`, `stop()`
- Terintegrasi dengan `checkViolation` di `media.js` — bannedCache.add() di call saat user kena ban

### Rate Limiter — Token Bucket

File: `src/services/rate-limiter.js` (NEW)

- **5 messages/second** per user
- **3 commands/second** per user
- Window sliding: 1 detik
- Cleanup stale entries setiap 60 detik
- Methods: `checkMessage(userId)`, `checkCommand(userId)`, `stop()`

### Session Timeout Cleanup

File: `src/services/session.js`

- Periodic check via `setInterval` (every 5 menit atau SESSION_TIMEOUT, mana yang lebih kecil)
- End session otomatis jika `last_activity` melebihi `SESSION_TIMEOUT` (3600 detik)
- Unref() agar tidak blocking process exit

### Global Error Handlers

File: `src/index.js`

- `process.on('unhandledRejection')` — log + prevent silent crash
- `process.on('uncaughtException')` — log + prevent silent crash
- `bot.catch()` — Grammy error handler yang lebih verbose

---

## 4. New Files Created

| File | Purpose |
|------|---------|
| `src/services/banned-cache.js` | In-memory banned user cache (refresh 30s from SQLite) |
| `src/services/rate-limiter.js` | Per-user rate limiter (5 msg/s, 3 cmd/s) |
| `src/admin/frontend/index.html` | Svelte app entry HTML |
| `src/admin/frontend/main.js` | Svelte mount point |
| `src/admin/frontend/app.css` | Global styles (dark theme) |
| `src/admin/frontend/App.svelte` | Root component — state, polling, routing |
| `src/admin/frontend/components/Header.svelte` | Status bar + online indicator |
| `src/admin/frontend/components/StatsGrid.svelte` | 8 metric cards (online, messages, sessions, etc) |
| `src/admin/frontend/components/RealtimeChart.svelte` | Canvas chart (messages/photos over 60 min) |
| `src/admin/frontend/components/LogsViewer.svelte` | Live encrypted logs viewer |
| `src/admin/frontend/components/SystemInfo.svelte` | Server info panel (uptime, memory, etc) |
| `src/admin/frontend/components/ApiKeyPrompt.svelte` | Login modal for API key |
| `src/admin/frontend/lib/api.js` | Fetch wrapper with x-api-key header |
| `src/admin/frontend/lib/format.js` | Number/bytes/time formatters |
| `vite.config.js` | Vite build config for Svelte |
| `DevProgress.md` | This file |
| `Benchmark.md` | Full benchmark report |

---

## 5. Modified Files

| File | Changes |
|------|---------|
| `package.json` | + `build:admin`, `dev:admin` scripts; + devDependencies (svelte, vite) |
| `src/index.js` | + session middleware, env check, bannedCache.init(), error handlers, graceful shutdown |
| `src/config.js` | + `description` field di `PREMIUM_FEATURES` |
| `src/services/pool.js` | + language-indexed buckets, + mutex lock, + `_removeFromPool` internal |
| `src/services/session.js` | + session timeout cleanup interval, + `Math.floor()` |
| `src/handlers/start.js` | + `poolService`, `sessionService` dari closure (bukan ctx.session) |
| `src/handlers/chat.js` | + `bannedCache`, `rateLimiter`; - unused `isBanned` import |
| `src/handlers/media.js` | + `bannedCache`, `rateLimiter`; photo/voice handler pakai cache |
| `src/handlers/suit.js` | + `bannedCache`; + stale game cleanup timeout |
| `src/handlers/onboarding.js` | + `knownPrefixes` guard untuk callback query |
| `src/admin/server.js` | + serve Svelte dist, redirect /admin → /admin/ |
| `src/database/db.js` | No changes (struktur tetap) |

---

## 6. Admin Dashboard (Svelte 5)

### Tech Stack

- **Svelte 5** (runes: `$state`, `$effect`, `$props`)
- **Vite 6** (build tool)
- **Canvas 2D API** (chart — zero dependency)
- **Express** (server + static files)

### Bundle Size

| Asset | Raw | Gzip |
|-------|-----|------|
| HTML | 0.53 kB | 0.38 kB |
| CSS | 3.89 kB | 1.25 kB |
| JS | 43.73 kB | 16.83 kB |
| **Total** | **48.15 kB** | **18.46 kB** |

### Cara Build

```bash
npm run build:admin    # Build → dist/admin/
npm run dev:admin      # Dev server (HMR) di port 5173
npm start              # Production: bot + Express serve dashboard
```

### Endpoints

| URL | Auth | Description |
|-----|------|-------------|
| `GET /admin/` | No | Admin dashboard (Svelte SPA) |
| `GET /admin/health` | No | Health check |
| `GET /admin/api/metrics` | x-api-key | All metrics + history |
| `GET /admin/api/system` | x-api-key | Server info (uptime, memory, node) |
| `GET /admin/api/logs?lines=50` | x-api-key | Encrypted logs (AES-256-GCM decrypted) |
| `GET /admin/api/encryption` | x-api-key | Encryption key info |

Default API Key: `change-this-secret-key`

---

## 7. Architecture Decision Records

### ADR-1: Pool Matchmaking dengan Language Buckets
- **Keputusan:** Ganti linear scan O(n) dengan indexed buckets O(n/numLanguages)
- **Alasan:** Matching selalu filter by language dulu. 5 bahasa → scan 5x lebih cepat.
- **Konsekuensi:** Sedikit kompleksitas tambahan di `addToPool`/`removeFromPool` untuk maintain 2 struktur.

### ADR-2: Banned Cache di Memory
- **Keputusan:** `Set<userId>` in-memory, refresh setiap 30 detik dari SQLite
- **Alasan:** `isBanned` di query setiap message → SQLite read bottleneck. Cache di memory = 0 I/O.
- **Konsekuensi:** Hingga 30 detik delay sebelum ban baru生效.

### ADR-3: Rate Limiter Sederhana
- **Keputusan:** Token bucket in-memory (Map<userId, {count, windowStart}>)
- **Alasan:** Mencegah spam tanpa dependency external. Cukup untuk 10k+ users.
- **Konsekuensi:** State hilang jika restart. Acceptable untuk anti-spam.

### ADR-4: Redis untuk Scale >100K Users
- **Keputusan:** PoolService menggunakan Redis (SMEMBERS/HGETALL) + filter di Node
- **Status:** Desain sudah decoupled via DI pattern. Tinggal swap implementation.
- **Estimasi Memory Redis:** ~3166 bytes/user → ~3.2GB untuk 1M users.

### ADR-5: Svelte untuk Admin Dashboard
- **Keputusan:** Svelte 5 + Vite, bukan React/Vue/vanilla
- **Alasan:** Bundle ~18KB gzip (vs React ~45KB). Zero runtime. Build static.
- **Konsekuensi:** Devs perlu tahu Svelte. Tapi komponen dashboard sederhana, mudah dipelajari.

---

## 8. Node.js Compatibility Note

`better-sqlite3` v12.8.0 requires Visual Studio Build Tools on Windows for native compilation. It officially supports Node.js 20.x — 25.x.

**Current environment:** Node.js v26.1.0 — native addon compilation fails without VS Build Tools.

**Workarounds:**
1. Install `windows-build-tools`: `npm install --global windows-build-tools`
2. Use Node.js 20–25 (downgrade via nvm)
3. Swap to `sql.js` (pure JS SQLite, no native deps, slower)

---

## 9. Retention Optimization — 2 Architectural Options

### Analysis: Mengapa User Tidak Kembali

| Masalah | Dampak |
|---------|--------|
| Tidak ada persistensi profil antar sesi | User input ulang data tiap /start |
| Tidak ada match history | User lupa partner sebelumnya |
| Tidak ada XP/level/streak | Tidak ada investasi emosional |
| Hanya 1 mini-game (suit) | Variasi engagement rendah |
| Tidak ada notifikasi re-engagement | User yang idle >48 jam hilang selamanya |
| Match algorithm O(n/5) tanpa quality scoring | Kualitas chat tidak terjamin |

---

### OPSI 1: Gamified Progression System (RPG Loop)

**Konsep:** Ubah Randomchatbot jadi platform progresi RPG — XP, level, streak, achievement. User kembali karena "investasi" akumulatif.

#### New Files

| File | Fungsi |
|------|--------|
| `src/services/xp.js` | XP calculator, level thresholds, streak logic |
| `src/services/achievements.js` | Achievement definitions + unlock detection |
| `src/services/leaderboard.js` | In-memory leaderboard (daily/weekly/all-time) |
| `src/handlers/gamification.js` | Command /profile, /rank, /achievements, /daily |
| `src/database/migrations/001_gamification.js` | DB migration: XP, streaks, achievements tables |

#### Database Schema Tambahan

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  last_active_date TEXT,           -- YYYY-MM-DD untuk streak calc
  total_sessions INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_photos INTEGER DEFAULT 0,
  total_suit_wins INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_key TEXT NOT NULL,    -- 'first_chat', 'streak_7', 'suit_10'
  unlocked_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS daily_rewards (
  user_id INTEGER PRIMARY KEY,
  last_claim_date TEXT,             -- YYYY-MM-DD
  streak_count INTEGER DEFAULT 0
);
```

#### XP Table & Level Thresholds

```
Level 1:     0 XP  (start)
Level 2:   100 XP
Level 3:   250 XP
Level 4:   500 XP
Level 5:  1000 XP
...
Level N:   XP = 100 * (2^(N-1))

XP Sources:
  • Kirim pesan:       +2 XP  (max 50x/hari = 100 XP/hari)
  • Kirim foto:        +5 XP  (max 20x/hari = 100 XP/hari)
  • Match & chat:     +10 XP  (per sesi baru)
  • Main suit:        +3 XP
  • Menang suit:      +5 XP
  • Daily login:     +20 XP
  • Streak bonus:    +5 XP * streak_day
```

#### Level Perks (Unlockables)

| Level | Perk |
|-------|------|
| 2 | Custom status message ("lagi santai") |
| 3 | Rate limit dinaikkan 5→10 msg/s |
| 5 | Profile badge shown to partner |
| 7 | Priority matching (dicarikan lebih cepat) |
| 10 | Custom anonymous ID (ganti Anon-XXXX) |
| 15 | "Popular" badge |

#### Retention Mechanics

1. **Daily Check-in:** `/daily` → +20 XP + streak bonus (streak 7 hari → +35 XP)
2. **Streak Visual:** "🔥 5-day streak! Besok +30 XP kalau login lagi!"
3. **Achievement Notification:** Post-session: "🏆 Achievement unlocked: First Chat!"
4. **Level Up Notice:** "🎉 Level 3! Kamu sekarang bisa custom status!"
5. **Leaderboard:** `/rank` → "Kamu #42 dari 1,230 users (Top 5%)"
6. **Re-engagement:** Bot kirim pesan ke idle >48 jam: "🔥 Streak kamu mau hilang!"

#### Modified Files

| File | Perubahan |
|------|-----------|
| `index.js` | Init XPService, AchievementService, LeaderboardService + inject ke semua handler |
| `database/db.js` | +3 tabel + fungsi CRUD |
| `handlers/chat.js` | Inject xpService.addXP() setelah forward message |
| `handlers/media.js` | Inject xpService.addXP() setelah kirim foto |
| `handlers/suit.js` | Inject xpService.addXP() untuk menang/kalah |
| `handlers/start.js` | Inject xpService.checkStreak() di /start |

#### Impact

| Metrik | Nilai |
|--------|-------|
| Memory tambahan | ~2-5 MB |
| Est. dev time | 3-5 hari |
| Monetisasi | XP boost, streak freeze, rare badge |
| Retention driver | Habit loop (daily login, streak) |

---

### OPSI 2: Smart Social Graph (Match Quality + Relationship)

**Konsep:** Fokus ke kualitas match dan hubungan — weighted matching, interest tags, match rating, favorites, "match again".

#### New Files

| File | Fungsi |
|------|--------|
| `src/services/interests.js` | 30+ interest tags + matching weight calculator |
| `src/services/reputation.js` | Rating system, report cooldown, trust score |
| `src/services/favorites.js` | Favorite users + "match again" queue |
| `src/handlers/social.js` | /rate, /favorite, /topics, /matchagain, /block |
| `src/handlers/discover.js` | Interest-based matching flow |
| `src/database/migrations/002_social.js` | DB migration: ratings, favorites, interests, blocks |

#### Database Schema Tambahan

```sql
CREATE TABLE IF NOT EXISTS user_interests (
  user_id INTEGER,
  interest TEXT,                    -- 'music', 'game', 'anime', 'coding'
  PRIMARY KEY (user_id, interest)
);

CREATE TABLE IF NOT EXISTS match_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rater_id INTEGER NOT NULL,
  rated_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  session_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER,
  favorite_id INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (user_id, favorite_id)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id INTEGER,
  blocked_id INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL,
  user_b INTEGER NOT NULL,
  duration_sec INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  ended_by TEXT DEFAULT 'manual',
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

#### Interest Tags (30+ tags, pilih 3-5)

```
🎵 Music      🎮 Gaming      📺 Anime/Manga    💻 Coding
📚 Books      🎬 Movies      🏀 Sports         ✈️ Travel
🎨 Art        🍳 Cooking     📸 Photography    🐱 Pets
🧘 Health     💼 Career      📖 Learning       🎧 Podcast
🌍 Languages  🏳️ LGBTQ+      🎭 Theater        🏄 Outdoor
```

#### Smart Matching Algorithm

```javascript
matchScore = 
  (interestOverlap * 0.25) +
  (compatibilityScore * 0.15) +
  (reputationSimilarity * 0.10) +
  (recencyBonus * 0.10)

// Hanya match jika score >= threshold (0.5)
```

#### Retention Mechanics

1. **Match Rating:** End-session prompt "⭐ Rate your chat (1-5)" → data improve matching
2. **Interest Matching:** Pilih 3-5 interest → prioritize overlap → percakapan engaging
3. **Favorites:** `/favorite` → save partner → /matchagain nanti
4. **"You might like":** Rekomendasi user serupa dari match history
5. **Reputation Score:** High-rep user → matched sesama high-rep → quality chat
6. **Topics Mode:** `/topics gaming` → cari partner spesifik interest
7. **Match History Dashboard:** `/history` → lihat match sebelumnya (anonymized)
8. **Re-engagement via Interest:** "Ada 5 user baru yang suka 🎮 Gaming, mau coba match?"

#### Modified Files

| File | Perubahan |
|------|-----------|
| `index.js` | Init InterestService, ReputationService, FavoriteService |
| `services/pool.js` | Weighted matching + interest overlap + reputation score |
| `handlers/onboarding.js` | Tambah step pilih interest setelah language |
| `handlers/chat.js` | End session → auto-prompt rating |
| `handlers/start.js` | Tampilkan "X favorites are online!" saat /start |
| `database/db.js` | +6 tabel + fungsi CRUD |

#### Impact

| Metrik | Nilai |
|--------|-------|
| Memory tambahan | ~3-8 MB |
| Est. dev time | 5-7 hari |
| Monetisasi | Interest slots tambahan, verified badge |
| Retention driver | Match quality (better conversations) |

---

### Comparison

| Aspek | Opsi 1: Gamified Progression | Opsi 2: Smart Social Graph |
|-------|------------------------------|---------------------------|
| **Hook utama** | "Aku mau naik level & streak" | "Aku mau chat sama orang yang cocok" |
| **Target user** | Mass market, casual | Niche communities, quality seekers |
| **Kompleksitas** | Sedang | Tinggi |
| **Dev time** | 3-5 hari | 5-7 hari |
| **Memory** | ~2-5 MB | ~3-8 MB |
| **Monetisasi** | XP boost, streak freeze, rare badge | Interest slots, verified badge |
| **Risk** | User bosan setelah max level | Data cold start (belum ada rating) |

### Recommended Roadmap

```
Week 1-2: Opsi 1 → Gamified Progression (retention loop cepat)
Week 3-4: Opsi 2 → Smart Social Graph (match quality)
Week 5+:  Combine both → interest matching + level/achievement rewards
```

---

## 10. Latest Updates (9 July 2026)

### 10.1 18+ Mode Dihapus Total

| Perubahan | File |
|-----------|------|
| Hapus `PREMIUM_FEATURES`, `STAR_PRICE_18`, `PREFERENCE_OPTIONS.18+` | `config.js` |
| Flow onboarding: langsung ke pool tanpa preference selection | `handlers/onboarding.js` |
| Hapus `checkPreferenceMatch` | `services/pool.js` |
| Hapus adult keyword detection (`sex`, `porn`, `nude`, dll) | `handlers/media.js` |
| Update /help, session init | `handlers/start.js` |

### 10.2 Session Persistence (SQLite)

Session auto-persist ke SQLite via custom `StorageAdapter` — **survive restart bot**.

| File | Fungsi |
|------|--------|
| `src/services/session-storage.js` (NEW) | `read()`, `write()`, `delete()` — implement `StorageAdapter` interface |
| `src/index.js` | `initSessionTable()` + `storage: sessionStorage` di middleware |
| DB table `sessions` | `key TEXT PRIMARY KEY`, `data TEXT`, `updated_at` |

### 10.3 Shop System (Monetisasi)

**2 item MVP — Telegram Stars (XTR):**

| Item | Harga | Mekanisme |
|------|-------|-----------|
| ⚡ XP Booster (24h) | 50⭐ | `session.inventory.xp_booster.expires_at` → cek di `chat.js`, `media.js`, `onboarding.js` → multiplier 2x |
| ❄️ Streak Freeze (1x) | 30⭐ | `session.inventory.streak_freeze` counter → konsumsi saat streak mau reset |

**Commands:**
- `/shop` — lihat katalog
- `/buy <item>` — kirim Telegram Invoice (XTR)
- `/inventory` — cek item aktif + sisa waktu/uses

**Files:**
| File | Status |
|------|--------|
| `handlers/shop.js` (NEW) | `/shop`, `/buy`, `/inventory` |
| `handlers/payment.js` | `pre_checkout_query` validasi → `successful_payment` simpan ke session |
| `services/xp.js` | +`multiplier` parameter di `addXP()` |
| `handlers/gamification.js` | `/daily` cek streak freeze, notifikasi |

### 10.4 i18n System (Multi Bahasa)

File: `src/locales/index.js` (NEW)

- **2 locale:** `id` (default) + `en`
- **123+ string** diterjemahkan di semua handler
- Fungsi `t(ctx, 'module.key', params)` — otomatis baca `ctx.session.language`
- Fungsi `tLang(lang, 'key', params)` — untuk internal call tanpa ctx
- **Flow:** `/start` → pilih Bahasa → semua respon bot ikut bahasa user
- **English messages** sudah lengkap untuk: start, onboarding, chat, media, gamification, shop, payment, suit

### 10.5 Environment Security

| Variable | Source | Keterangan |
|----------|--------|------------|
| `HASH_SECRET` | Generated | SHA-256 salt, fatal jika tidak di-set |
| `ADMIN_API_KEY` | Generated | Admin panel auth |
| `LOG_ENCRYPTION_KEY` | Generated | 32-byte hex untuk AES-256-GCM |

**⚠️ BOT_TOKEN must be regenerated via @BotFather** — old token exposed in codebase.

### 10.6 Simplified Onboarding Flow

```
Before: /start → Age → Gender → Location → Language → Preference (random/18+) → Pool
After:  /start → Language → Age → Gender → Location → Pool
```

- Language dipilih **pertama** → semua respon bot sesuai bahasa user
- Tidak ada preference selection (18+ dihapus)
- Matching tetap berdasarkan language bucket (`pool.js`)

---

## 11. Latest Updates (9 July 2026 — Session 2)

### 11.1 Referral System

| Fitur | Detail |
|-------|--------|
| `/invite` | Generate link `t.me/bot?start=ref_USERID` |
| Parse deep link | `/start ref_USERID` → simpan `ctx.session.referred_by` |
| Reward inviter | +50 XP + notifikasi "Teman baru join!" |
| Reward invitee | ⚡ XP Booster 2 jam + 30 XP starter |
| Tracking | Kolom `total_referrals` di `user_profiles` |

**Files:**
- `handlers/start.js` — `/invite` command + parse `ctx.match`
- `handlers/onboarding.js` — `processReferral()` saat user masuk pool
- `database/db.js` — `incrementReferralCount()`, `getReferralCount()`
- `locales/index.js` — `referral.*` + `start.invite_text` (ID + EN)

### 11.2 Priority Match (Shop)

| Item | Harga | Mekanisme |
|------|-------|-----------|
| 🚀 Priority Match (5x) | 40⭐ | `pool.js:findMatch()` prioritaskan user dengan `_priority: true` di bucket yang sama |

**Files:**
- `handlers/shop.js` — `SHOP_ITEMS.priority_match` (40⭐, 5 uses)
- `handlers/payment.js` — `successful_payment` → `inventory.priority_match += 5`
- `handlers/onboarding.js` — cek `inventory.priority_match > 0` → `addToPool(user, true)`, konsumsi 1 per match
- `services/pool.js` — `addToPool(user, isPriority)`, `findMatch()` scan priority candidates first

### 11.3 Simplified UI

| Perubahan | Detail |
|-----------|--------|
| **Gender** | Hanya Male / Female (hapus Other) |
| **Language** | Hanya Indonesia / English (hapus JA/KO/ZH) |
| **Gender keyboard** | 2 tombol, tanpa baris ketiga |

---

*Last updated: 9 July 2026*

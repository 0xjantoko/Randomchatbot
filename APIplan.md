# RandomChatBot — API Platform Plan

## Visi

Menjual **safety infrastructure untuk anonymous social** yang sudah kita bangun: bracket isolation, trust progression, phantom media, dan enforcement system — sebagai API untuk platform pihak ketiga.

---

## 1. Trust API — Age Verification Without Identity

Menentukan bracket umur user berdasarkan pola percakapan, tanpa meminta KTP/biometrik.

### Endpoints

```
POST /v1/trust/estimate-age
Request:  { messages: ["halo", "kamu sekolah mana?", ...] }
Response: {
  bracket: "minor",          // minor | adult_18_25 | adult_26_35 | adult_36_plus
  confidence: 0.87,          // 0.0 - 1.0
  trust_level: "shadow",     // shadow | verified | flagged
  signals: {
    vocabulary: 0.92,
    topics: ["school"],
    complexity: 0.34
  }
}

POST /v1/trust/verify-age
Request: {
  claimed_age: 19,
  verification_answers: {
    "Ketik usia dalam huruf": "sembilan belas",
    "Tahun lahir": "2007"
  }
}
Response: {
  consistent: true,
  forced_bracket: "adult_18_25",
  risk_score: 0.12
}
```

### Target Pasar
- Platform dengan user <18 (game, social media, dating apps)
- Discord, Roblox, Minecraft servers
- Alternatif lebih murah dari verifikasi KTP

### Pricing
- $0.003/call

### Status
- ⏳ Membutuhkan behavioral NLP (P3)

---

## 2. Isolation Engine API — Bracket-Based Matching

Mencocokkan user dalam pool dengan jaminan tidak ada cross-bracket matching.

### Endpoints

```
POST /v1/isolation/match
Request: {
  pool: [
    { user_id: "anon_1", bracket: "minor", language: "id" },
    { user_id: "anon_2", bracket: "adult_18_25", language: "id" },
    { user_id: "anon_3", bracket: "minor", language: "id" }
  ]
}
Response: {
  matches: [
    { user_a: "anon_1", user_b: "anon_3", bucket: "id:minor", score: 0.85 }
  ],
  isolation_report: {
    cross_bracket_attempts: 1,
    blocked: true
  }
}
```

### Target Pasar
- Dating apps (cegah adult-minor match)
- Anonymous chat platforms
- Online education (student matching)

### Pricing
- $0.001/match

### Status
- ✅ Bracket isolation sudah jadi di pool.js
- ⏳ Butuh REST wrapper + API key auth

---

## 3. Phantom Media API — Ephemeral Content Delivery

Foto/video dengan timer-based auto-delete, screenshot warning, dan one-time view token.

### Endpoints

```
POST /v1/media/phantom-upload
Request:  { image: <base64>, timer: 3, watermark: true }
Response: {
  phantom_id: "ph_7a3f2b",
  expires_at: 1700000000,
  view_token: "vt_k9d8f3",
  preview: { blurhash: "...", thumbnail: "..." }
}

POST /v1/media/phantom-reveal
Request:  { phantom_id: "ph_7a3f2b", view_token: "vt_k9d8f3" }
Response: {
  image_url: "https://cdn.phantom.cdn/private/...",
  expires_in: 10,
  auto_delete: true,
  screenshot_warning: true
}
```

### Target Pasar
- Snapchat competitors
- Anonymous feedback platforms
- Medical/legal document sharing

### Pricing
- $0.01/upload + $0.005/view

### Status
- ✅ Phantom photo system sudah jalan di media.js
- ⏳ Butuh media pipeline (upload → CDN), REST wrapper

---

## 4. Safety Enforcement API — Moderation Pipeline

Report + trust scoring + auto-enforcement (temp ban, flag) dalam satu API.

### Endpoints

```
POST /v1/safety/report
Request: {
  reporter_id: "anon_a3f7",
  reported_id: "anon_b2c8",
  context: {
    session_duration: 342,
    message_count: 15,
    bracket: "adult_18_25"
  },
  reason: "underage"
}
Response: {
  action_taken: "temp_ban_24h",
  trust_impact: "flagged",
  confidence: 0.94,
  previous_reports: 2,
  escalated_to_admin: false
}

GET /v1/safety/trust-score?user_id=anon_b2c8
Response: {
  trust_level: "flagged",
  risk_score: 0.87,
  flags: [
    { type: "underage_report", count: 3, last: "2026-07-09" },
    { type: "age_inconsistency", count: 1, last: "2026-07-01" }
  ],
  recommended_action: "permanent_restriction"
}
```

### Target Pasar
- Platform sosial dengan UGC (user generated content)
- Marketplace (cegah scam)
- Gig economy platforms

### Pricing
- $0.01/report

### Status
- ✅ Report + temp ban + trust level sudah jalan
- ⏳ Butuh REST wrapper + API key auth

---

## 5. Audience DNA API — Generational Behavioral Analytics

Insight perilaku per generasi dari metadata agregat (bukan konten).

### Endpoints

```
POST /v1/audience/dna
Request: {
  bracket: "gen_alpha",     // gen_alpha | gen_z | milenial
  timeframe: "2026-Q2",
  metrics: ["engagement", "churn", "monetization"]
}
Response: {
  segment: "Gen Alpha (13-17)",
  sample_size: 12453,
  dna_fingerprint: {
    peak_hours: ["19:00-22:00"],
    avg_attention_span_sec: 252,
    hook: "streak_and_xp",
    churn_risk_hour: 48,
    monetization: {
      preferred: "cosmetic",
      aversion: "subscription",
      avg_willing_to_pay: 0
    },
    language_dna: {
      top_words: ["wkwk", "sih", "banget", "nggak", "btw"],
      emoji_density: 0.28,
      sentence_complexity: 0.34,
      code_switch_ratio: 0.15
    },
    recommendation: {
      product_fit: "quest_based_gamification",
      avoid: "subscription_model",
      retention_lever: "daily_streak"
    }
  }
}
```

### Target Pasar
- Game developers
- Social media strategists
- Brand marketers
- EdTech platforms

### Pricing
- $0.05/query

### Status
- ❌ Belum ada data pipeline agregasi

---

## 6. Conversation Scaffold API — Safety-First Chat SDK

Bundle semua API di atas dalam satu SDK — integrasi 20 baris kode.

```javascript
import { RandomChatSDK } from 'randomchat-sdk';

const sdk = new RandomChatSDK({ api_key: "sk_..." });

const user = await sdk.createUser({ telegram_id: "12345" });

const match = await sdk.findMatch(user.id);

const photo = await sdk.sendPhantomPhoto(user.id, match.id, file);

await sdk.report(user.id, match.id, "underage");

const insights = await sdk.audienceDNA("gen_z");
```

### Target Pasar
- Startup yang mau build anonymous chat cepat
- Developer yang tidak mau urus moderasi

### Pricing
- Bundled dalam subscription

### Status
- ❌ Butuh semua API di atas selesai

---

## Pricing Model

| Tier | Harga | API Calls | SDK Keys | Support |
|------|-------|-----------|----------|---------|
| **Starter** | $99/bln | 10K/bln | 1 | Email |
| **Growth** | $499/bln | 100K/bln | 5 | Priority |
| **Scale** | $1,999/bln | 1M/bln | Unlimited | Dedicated |
| **Enterprise** | Custom | Custom | Custom | SLA + Infra |
| **Free Tier** | $0 | 100/hari | 1 | Community |

---

## Total Addressable Market

| API | TAM | Competitors | Our Edge |
|-----|-----|-------------|----------|
| Trust API | $500M — age verification | AI biometric | ✅ Text-based, no KTP |
| Isolation Engine | $200M — matchmaking | Build in-house | ✅ Plug-and-play |
| Phantom Media | $1B — ephemeral content | Snapchat (closed) | ✅ API-first |
| Safety Enforcement | $2B — moderation | Google/AWS (generic) | ✅ Built for anonymous |
| Audience DNA | $300M — consumer insights | Nielsen (expensive) | ✅ Real-time generational |
| **Total** | **~$4B** | | |

---

## Prioritas Implementasi

| Rank | API | Effort | Revenue Potential | Dependency |
|------|-----|--------|-------------------|------------|
| 🥇 | Safety Enforcement | 3-5 hari | Medium | ✅ Sudah punya report + ban |
| 🥈 | Phantom Media | 1 minggu | High | ⏳ Pipeline CDN |
| 🥉 | Isolation Engine | 3-5 hari | Low | ✅ Sudah punya bracket |
| 🏅 | Trust API | 1-2 minggu | High | ❌ Behavioral NLP (P3) |
| 🎖️ | Audience DNA | 1-2 minggu | Medium | ❌ Data pipeline |
| 🏆 | Conversation SDK | 2-4 minggu | High | ❌ Semua API di atas |

---

## Data Collection (Foundation untuk Semua API)

Semua API di atas bergantung pada data metadata yang dikumpulkan dari sesi chat. Tidak ada konten yang disimpan.

```sql
CREATE TABLE IF NOT EXISTS session_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  age_bracket TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  duration_sec INTEGER,
  message_count INTEGER,
  photo_count INTEGER,
  skip_reason TEXT,
  avg_msg_length REAL,
  emoji_count INTEGER,
  question_count INTEGER,
  capslock_count INTEGER,
  unique_words INTEGER,
  active_hour INTEGER,
  ended_by TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS audience_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_hour TEXT NOT NULL,
  bracket TEXT NOT NULL,
  total_sessions INTEGER,
  total_users INTEGER,
  avg_duration_sec REAL,
  avg_messages REAL,
  skip_rate REAL,
  report_rate REAL,
  photo_rate REAL,
  engagement_score REAL
);
```

### Prinsip Data
- ✅ Boleh: jumlah pesan, durasi, jam aktif, rasio emoji, conversion rate
- ❌ Tidak boleh: konten pesan, user ID mentah, device fingerprint, IP address
- ✅ Hanya agregat per bracket (bukan per user)
- ✅ User bisa opt-out (invisible mode)

const locales = {
  id: {
    start: {
      welcome_new: '*👋 Halo! Selamat datang di RandomChatZ!*\n\n🔒 Privasi kamu terjamin — identitas disamarkan.\n\n*Pilih bahasa kamu:*',
      welcome_back: '*👋 Selamat datang kembali!*\n\n📊 *Level {level}* · {xp} XP\n{streakFire} *Streak:* {streak} hari\n🏆 {sessions} sesi · {messages} pesan\n\n🔒 Privasi kamu terjamin.\n\n*Pilih bahasa kamu:*',
      already_in_session: '❌ Kamu sedang dalam sesi chat.\nKetik /skip untuk keluar.',
      already_in_pool: '⏳ Sedang mencari partner...\nKetik /cancel untuk cancel.',
      help_title: '*📖 Help*',
      help_commands: '*Commands:*\n/start — Mulai cari chat random\n/skip — Keluar dari chat\n/cancel — Cancel pencarian\n/report — Laporkan partner\n/myprofile — Lihat profil\n/stats — Lihat statistik bot\n\n*Fitur:*\n📸 *Phantom Photo* — Foto auto-delete 10 detik\n🚫 Screenshot/Share = Banned',
      help_admin: '\n\n*👑 Admin Commands:*\n/adminphotos [n] — Lihat n foto terbaru\n/admindb — Download database file\n/adminquery [SQL] — Query database',
      stats: '*📊 Stats*\n\nWaiting: {pool}\nActive Sessions: {sessions}',
      cancel_success: '*✅ Pencarian dibatalkan.*\n\nKetik /start untuk mulai lagi.',
      cancel_none: '❌ Tidak ada pencarian aktif.',
      no_profile: '❌ Profil belum ada. Ketik /start untuk buat profil.',
      profile_title: '*👤 Profil Kamu*',
      profile_detail: '• Usia: {age}\n• Gender: {gender}\n• Lokasi: {location}\n• Bahasa: {language}',
      profile_premium: '\n*Premium:* {list}',
      profile_no_premium: '\n*Premium:* -',
      invite_text: '👥 *Ajak Teman!*\n\nShare link ini ke teman:\n`{link}`\n\n🎁 Kamu dapat +50 XP tiap teman join!\n🎁 Teman dapat ⚡ XP Booster 2 jam + 30 XP!'
    },
    referral: {
      inviter_reward: '👥 *Teman baru join!*\n\n🎉 +50 XP berkat referral kamu!\n📊 Total referral: *{count}*\n\nAjak lebih banyak teman dengan /invite',
      invitee_reward: '🎉 *Kamu diundang oleh teman!*\n\n⚡ *XP Booster 2 jam* aktif!\n✨ +30 XP bonus\n\nSelamat ngobrol! 🗣️'
    },
    onboarding: {
      ask_age: '*Berapa usia kamu?*',
      invalid_age: '❌ Ketik angka valid (1-99):',
      ask_gender: '*Pilih gender:*',
      ask_location: '*Ketik lokasi:* (kota)',
      invalid_location: '❌ Lokasi harus 2-50 karakter. Ketik ulang:',
      success: '*✅ Berhasil!*\n\n🔒 *Identitas tersamarkan*\n\n📝 Profil (publik):\n• Bahasa: {lang}\n• Usia: {age}\n• Gender: {gender}\n• Lokasi: {location}\n\n⏳ Mencari partner...',
      waiting: '⏳ Belum ketemu... Tunggu ya!\nKetik /cancel untuk cancel.',
      cancel: '*❌ Dibatalkan.*\n\nKetik /start untuk mulai lagi.',
      partner_found: '*🎉 Partner ditemukan!*\n\n📝 Info partner:\n• Usia: {age}\n• Gender: {gender}\n• Lokasi: {location}\n• Bahasa: {language}\n\n💬 Mulai chat sekarang!\n⚠️ Jangan share data pribadi (no sharing personal info)\n\nKetik /skip untuk keluar.',
      partner_left: '*👋 Partner keluar dari chat.*\n\nKetik /start untuk cari chat baru.'
    },
    chat: {
      banned: '❌ Akun kamu telah dibanned. Hubungi admin.',
      rate_limit: '⏳ Mohon tunggu sebelum kirim pesan lagi.',
      banned_violation: '❌ Akun kamu telah dibanned karena pelanggaran.',
      warning: '⚠️ *Peringatan:* Pesan kamu melanggar aturan.\n\nPelanggaran: {violations}\n\nJika berlanjut, akun akan dibanned.',
      not_in_session: '❌ Kamu tidak dalam sesi chat. Ketik /start untuk memulai.',
      skip_confirm: '*👋 Keluar dari chat.*\n\nKetik /start untuk cari chat baru.',
      partner_left_chat: '*👋 Partner keluar dari chat.*\n\nKetik /start untuk cari chat baru.',
      report_confirm: '*✅ Laporan dikirim.*\n\nPartner telah dilaporkan karena: {reason}',
      report_no_session: '❌ Kamu tidak dalam sesi chat.'
    },
    moderation: {
      quarantine_blocked: '🛑 *Akun kamu sedang dalam review admin.*\n\nAkunmu sementara tidak bisa mencari partner karena terdeteksi melewati batas pool usia. Kalau ini keliru, hubungi admin.',
      evict_notice: '🛑 *Sesi dihentikan.*\n\nAktivitasmu terdeteksi tidak sesuai dengan batas pool usia yang kamu klaim. Akunmu masuk antrean review admin dan tidak bisa mencari partner sampai ditinjau.',
      ratchet_notice: '⚠️ *Sesi dihentikan sementara.*\n\nDemi keamananmu, pola bicaramu terdeteksi konsisten dengan pengguna di bawah 18 tahun. Akunmu dikunci ke *Pool Minor* (teks + foto phantom 3 detik, tanpa voice).',
      admin_evict: '🚨 *BRACKET BREACH — user di-quarantine*\n\nAnon: `{anon}`\nUser ID: `{userId}`\nAlasan: {reason}\nConfidence: {confidence}\nPool diklaim: {claimed}',
      admin_ratchet: '⚠️ *BRACKET BREACH — user dikunci ke Pool Minor*\n\nAnon: `{anon}`\nUser ID: `{userId}`\nAlasan: {reason}\nConfidence: {confidence}'
    },
    media: {
      session_ended: '❌ Sesi chat sudah berakhir',
      locked_shadow: '🔒 *Fitur foto & voice terkunci.*\n\nSelesaikan *3 sesi* dulu untuk membuka foto (phantom) dan voice. Ini untuk mencegah penyalahgunaan akun baru.',
      locked_flagged: '🔒 *Fitur foto & voice dikunci.*\n\nAkunmu sedang dalam status ditandai (flagged) dan menunggu review admin.',
      voice_minor_blocked: '❌ Fitur voice tidak tersedia untuk pengguna di bawah 18 tahun.',
      photo_loading: '⏳ Foto sedang ditampilkan...',
      photo_warning: '⚠️ *PERINGATAN KEAMANAN*\n\n🚫 *DILARANG:*\n• Screenshot / screen recording\n• Save foto ke gallery\n• Share foto ke luar chat\n\n🔴 Pelanggaran = *BANNED PERMANEN*\n\n⏱️ Foto akan dihapus dalam {seconds} detik',
      photo_timer: '⏱️ {seconds} detik...',
      photo_opened: '📸 Partner membuka foto',
      photo_opened_ack: '👁️ Foto terbuka!',
      photo_deleted: '📸 *Foto telah dihapus*\n\n✅ Phantom picture mode',
      photo_failed: '❌ Gagal menampilkan foto',
      blocked_video: '❌ *Video tidak diperbolehkan.*\n\nHanya foto dan voice message yang diizinkan.',
      blocked_gif: '❌ *GIF tidak diperbolehkan.*\n\nGIF dan sticker eksternal tidak didukung.',
      blocked_sticker: '❌ *Sticker tidak diperbolehkan.*\n\nGIF dan sticker eksternal tidak didukung.',
      blocked_type: '❌ *Tipe pesan ({type}) tidak didukung.*\n\nChat hanya menerima teks, foto, dan voice message. Pesan tidak diteruskan ke partner.',
      blind_photo: '📸 *FOTO BLIND* diterima\n\n🔒 Foto dienkripsi & dilindungi\n⏱️ Hanya bisa dilihat {seconds} detik\n🚫 Screenshot/Share = Banned\n\nTap tombol untuk membuka:',
      reveal_button: '👁️ Lihat Foto ({seconds}s)',
      voice_caption: '🎤 Voice dari partner',
      access_denied: '❌ Access denied.',
      no_photos: '📸 No photos in database.',
      photo_log: '*📸 Admin Photo Log ({count} latest):*',
      photo_caption: '👤 {sender} → {receiver}\n🕐 {time}',
      query_usage: 'Usage: /adminquery "SELECT * FROM photos LIMIT 5"',
      query_forbidden: '❌ Query not allowed: contains forbidden keyword or syntax.',
      query_select_only: '❌ Only simple SELECT queries allowed.',
      query_empty: '📭 Query returned 0 results.',
      query_result: '*📊 Query Results ({count} rows, limited 20):*\n\n```json\n{data}\n```',
      query_result_all: '*📊 Query Results ({count} rows):*\n\n```json\n{data}\n```',
      query_error: '❌ Query error: {msg}',
      export_error: '❌ Export failed: {msg}'
    },
    gamification: {
      no_profile: '❌ Profil belum ada. Ketik /start untuk buat profil.',
      profile_title: '*📊 Profil Progres*',
      profile_level: '*Level:* {level}',
      profile_xp: '*XP:* {xp} total',
      profile_next: '*Next:* {current} / {needed} XP',
      profile_progress: '*Progress:* {bar} {percent}%',
      profile_streak: '{emoji} *Streak:* {streak} hari',
      profile_stats: '*Stats:*\n💬 {messages} pesan\n📸 {photos} foto\n💕 {sessions} sesi',
      profile_perks: '\n*🔓 Unlocked Perks:*',
      profile_perk_item: '• Lv.{level} {name}',
      no_rank: '❌ Belum ada data ranking. Mulai chat dulu!',
      leaderboard_title: '*🏆 Leaderboard*\n\n*Top 5:*',
      your_rank: '\n*Your Rank:* #{rank} / {total}\n*Top {percent}%* — Level {level}',
      nearby_title: '\n*Nearby:*',
      nearby_item: '{arrow} #{rank} · Level {level} · {xp} XP{you}',
      daily_already: '📅 *Daily Reward sudah diambil hari ini!*\n\n🔥 Streak: {streak} hari\n⏰ Kembali besok untuk streak {next}!',
      daily_freeze_remaining: '\n\n❄️ Kamu punya *{count} Streak Freeze*. Streak aman jika lupa besok!',
      daily_no_freeze: '\n\n⚠️ Streak akan reset besok jika lupa claim!\nKetik /buy streak_freeze untuk lindungi streak.',
      daily_claimed: '📅 *Daily Reward!*\n\n{fire} Streak: {streak} hari\n✨ +{amount} XP',
      daily_bonus: '\n🎉 Bonus streak: +{amount} XP\n',
      daily_streak_7: '\n🌟 *7-day streak! Mantap!*',
      daily_streak_30: '\n♾️ *30-day streak! Kamu legenda!*',
      no_achievements: '❌ Data achievement belum tersedia.',
      achievements_title: '*🏅 Achievements*  ({unlocked}/{total})\n\n',
      achievements_footer: '\nKetik /profile untuk lihat progres lengkap.',
      achievement_unlock: '🏆 *Achievement Unlocked!*\n\n{icon} *{name}*\n{desc}',
      level_up: '🎉 *Level Up!* Kamu sekarang Level {level}! 🎉',
      perk_unlock: '\n\n🔓 *Perk Unlocked:* {name}\n   {desc}'
    },
    shop: {
      title: '*🛒 Shop — Item Premium*\n\n',
      item_line: '{emoji} *{name}*\n   {desc}\n   ⭐ {price}\n\n',
      buy_instruction: 'Ketik:\n{lines}',
      buy_item_line: '/buy {key} — Beli {emoji} {name}\n',
      inventory_footer: '/inventory — Cek item yang dimiliki',
      unknown_item: '❌ Item tidak dikenal. Ketik /shop untuk lihat daftar item.',
      buy_failed: '❌ Gagal memproses pembelian. Coba lagi nanti.',
      inventory_empty: '📦 Inventory kosong. Ketik /shop untuk beli item.',
      inventory_title: '*📦 Inventory*\n\n',
      item_timed: '{emoji} *{name}* — ⏱️ {hours} jam lagi',
      item_uses: '{emoji} *{name}* — ×{count} tersisa'
    },
    payment: {
      invalid_item: 'Invalid item',
      success: '*✅ Pembayaran berhasil!*\n\n{emoji} *{name}* telah aktif!\n\nKetik /inventory untuk cek.'
    },
    common: {
      male: '👨 Male',
      female: '👩 Female',
      indonesia: '🇮🇩 Indonesia',
      english: '🇺🇸 English'
    }
  },

  en: {
    start: {
      welcome_new: '*👋 Hello! Welcome to RandomChatZ!*\n\n🔒 Your privacy is protected — identity is anonymized.\n\n*Choose your language:*',
      welcome_back: '*👋 Welcome back!*\n\n📊 *Level {level}* · {xp} XP\n{streakFire} *Streak:* {streak} days\n🏆 {sessions} sessions · {messages} messages\n\n🔒 Your privacy is protected.\n\n*Choose your language:*',
      already_in_session: '❌ You are in an active chat.\nType /skip to leave.',
      already_in_pool: '⏳ Searching for partner...\nType /cancel to cancel.',
      help_title: '*📖 Help*',
      help_commands: '*Commands:*\n/start — Start random chat\n/skip — Leave chat\n/cancel — Cancel search\n/report — Report partner\n/myprofile — View profile\n/stats — View bot stats\n\n*Features:*\n📸 *Phantom Photo* — Auto-delete after 10s\n🚫 Screenshot/Share = Banned',
      help_admin: '\n\n*👑 Admin Commands:*\n/adminphotos [n] — View recent photos\n/admindb — Download database\n/adminquery [SQL] — Query database',
      stats: '*📊 Stats*\n\nWaiting: {pool}\nActive Sessions: {sessions}',
      cancel_success: '*✅ Search cancelled.*\n\nType /start to begin again.',
      cancel_none: '❌ No active search.',
      no_profile: '❌ No profile yet. Type /start to create one.',
      profile_title: '*👤 Your Profile*',
      profile_detail: '• Age: {age}\n• Gender: {gender}\n• Location: {location}\n• Language: {language}',
      profile_premium: '\n*Premium:* {list}',
      profile_no_premium: '\n*Premium:* -',
      invite_text: '👥 *Invite Friends!*\n\nShare this link:\n`{link}`\n\n🎁 You get +50 XP per referral!\n🎁 Your friend gets ⚡ XP Booster 2h + 30 XP!'
    },
    referral: {
      inviter_reward: '👥 *A friend joined via your link!*\n\n🎉 +50 XP for your referral!\n📊 Total referrals: *{count}*\n\nInvite more friends with /invite',
      invitee_reward: '🎉 *You were invited by a friend!*\n\n⚡ *XP Booster 2h* is active!\n✨ +30 XP bonus\n\nEnjoy chatting! 🗣️'
    },
    onboarding: {
      ask_age: '*How old are you?*',
      invalid_age: '❌ Enter a valid number (1-99):',
      ask_gender: '*Choose gender:*',
      ask_location: '*Enter your location:* (city)',
      invalid_location: '❌ Location must be 2-50 characters. Try again:',
      success: '*✅ Success!*\n\n🔒 *Identity anonymized*\n\n📝 Public profile:\n• Language: {lang}\n• Age: {age}\n• Gender: {gender}\n• Location: {location}\n\n⏳ Searching for partner...',
      waiting: '⏳ No match yet... Please wait!\nType /cancel to cancel.',
      cancel: '*❌ Cancelled.*\n\nType /start to begin again.',
      partner_found: '*🎉 Partner found!*\n\n📝 Partner info:\n• Age: {age}\n• Gender: {gender}\n• Location: {location}\n• Language: {language}\n\n💬 Start chatting now!\n⚠️ Do not share personal info\n\nType /skip to leave.',
      partner_left: '*👋 Partner left the chat.*\n\nType /start to find a new chat.'
    },
    chat: {
      banned: '❌ Your account has been banned. Contact admin.',
      rate_limit: '⏳ Please wait before sending another message.',
      banned_violation: '❌ Your account has been banned due to violations.',
      warning: '⚠️ *Warning:* Your message violates the rules.\n\nViolations: {violations}\n\nIf continued, your account will be banned.',
      not_in_session: '❌ You are not in a chat session. Type /start to begin.',
      skip_confirm: '*👋 Left the chat.*\n\nType /start to find a new chat.',
      partner_left_chat: '*👋 Partner left the chat.*\n\nType /start to find a new chat.',
      report_confirm: '*✅ Report sent.*\n\nPartner has been reported for: {reason}',
      report_no_session: '❌ You are not in a chat session.'
    },
    moderation: {
      quarantine_blocked: '🛑 *Your account is under admin review.*\n\nYou cannot search for a partner right now because you were flagged for crossing the age-pool boundary. Contact admin if this is a mistake.',
      evict_notice: '🛑 *Session ended.*\n\nYour activity does not match the age pool you claimed. Your account has been queued for admin review and cannot search for a partner until it is reviewed.',
      ratchet_notice: '⚠️ *Session paused.*\n\nFor your safety, your writing pattern is consistent with users under 18. Your account is locked to the *Minor Pool* (text + 3-second phantom photos, no voice).',
      admin_evict: '🚨 *BRACKET BREACH — user quarantined*\n\nAnon: `{anon}`\nUser ID: `{userId}`\nReason: {reason}\nConfidence: {confidence}\nClaimed pool: {claimed}',
      admin_ratchet: '⚠️ *BRACKET BREACH — user locked to Minor Pool*\n\nAnon: `{anon}`\nUser ID: `{userId}`\nReason: {reason}\nConfidence: {confidence}'
    },
    media: {
      session_ended: '❌ Chat session has ended',
      locked_shadow: '🔒 *Photo & voice are locked.*\n\nComplete *3 sessions* first to unlock phantom photos and voice. This prevents new-account abuse.',
      locked_flagged: '🔒 *Photo & voice are locked.*\n\nYour account is flagged and awaiting admin review.',
      voice_minor_blocked: '❌ Voice is not available for users under 18.',
      photo_loading: '⏳ Photo is being displayed...',
      photo_warning: '⚠️ *SECURITY WARNING*\n\n🚫 *PROHIBITED:*\n• Screenshot / screen recording\n• Save photo to gallery\n• Share photo outside chat\n\n🔴 Violation = *PERMANENT BAN*\n\n⏱️ Photo will be deleted in {seconds} seconds',
      photo_timer: '⏱️ {seconds} seconds...',
      photo_opened: '📸 Partner opened your photo',
      photo_opened_ack: '👁️ Photo opened!',
      photo_deleted: '📸 *Photo deleted*\n\n✅ Phantom picture mode',
      photo_failed: '❌ Failed to show photo',
      blocked_video: '❌ *Video not allowed.*\n\nOnly photos and voice messages are permitted.',
      blocked_gif: '❌ *GIF not allowed.*\n\nExternal GIFs and stickers are not supported.',
      blocked_sticker: '❌ *Sticker not allowed.*\n\nExternal GIFs and stickers are not supported.',
      blocked_type: '❌ *Message type ({type}) is not supported.*\n\nChat only accepts text, photos, and voice messages. The message was not forwarded to your partner.',
      blind_photo: '📸 *BLIND PHOTO* received\n\n🔒 Photo is encrypted & protected\n⏱️ Can only be viewed for {seconds}s\n🚫 Screenshot/Share = Banned\n\nTap the button to open:',
      reveal_button: '👁️ View Photo ({seconds}s)',
      voice_caption: '🎤 Voice message from partner',
      access_denied: '❌ Access denied.',
      no_photos: '📸 No photos in database.',
      photo_log: '*📸 Admin Photo Log ({count} latest):*',
      photo_caption: '👤 {sender} → {receiver}\n🕐 {time}',
      query_usage: 'Usage: /adminquery "SELECT * FROM photos LIMIT 5"',
      query_forbidden: '❌ Query not allowed: contains forbidden keyword or syntax.',
      query_select_only: '❌ Only simple SELECT queries allowed.',
      query_empty: '📭 Query returned 0 results.',
      query_result: '*📊 Query Results ({count} rows, limited 20):*\n\n```json\n{data}\n```',
      query_result_all: '*📊 Query Results ({count} rows):*\n\n```json\n{data}\n```',
      query_error: '❌ Query error: {msg}',
      export_error: '❌ Export failed: {msg}'
    },
    gamification: {
      no_profile: '❌ No profile yet. Type /start to create one.',
      profile_title: '*📊 Progress Profile*',
      profile_level: '*Level:* {level}',
      profile_xp: '*XP:* {xp} total',
      profile_next: '*Next:* {current} / {needed} XP',
      profile_progress: '*Progress:* {bar} {percent}%',
      profile_streak: '{emoji} *Streak:* {streak} days',
      profile_stats: '*Stats:*\n💬 {messages} messages\n📸 {photos} photos\n💕 {sessions} sessions',
      profile_perks: '\n*🔓 Unlocked Perks:*',
      profile_perk_item: '• Lv.{level} {name}',
      no_rank: '❌ No ranking data yet. Start chatting first!',
      leaderboard_title: '*🏆 Leaderboard*\n\n*Top 5:*',
      your_rank: '\n*Your Rank:* #{rank} / {total}\n*Top {percent}%* — Level {level}',
      nearby_title: '\n*Nearby:*',
      nearby_item: '{arrow} #{rank} · Level {level} · {xp} XP{you}',
      daily_already: '📅 *Daily Reward already claimed today!*\n\n🔥 Streak: {streak} days\n⏰ Come back tomorrow for streak {next}!',
      daily_freeze_remaining: '\n\n❄️ You have *{count} Streak Freeze*(s). Your streak is safe if you miss tomorrow!',
      daily_no_freeze: '\n\n⚠️ Your streak will reset if you miss tomorrow!\nType /buy streak_freeze to protect your streak.',
      daily_claimed: '📅 *Daily Reward!*\n\n{fire} Streak: {streak} days\n✨ +{amount} XP',
      daily_bonus: '\n🎉 Streak bonus: +{amount} XP\n',
      daily_streak_7: '\n🌟 *7-day streak! Awesome!*',
      daily_streak_30: '\n♾️ *30-day streak! You are a legend!*',
      no_achievements: '❌ Achievement data not available.',
      achievements_title: '*🏅 Achievements*  ({unlocked}/{total})\n\n',
      achievements_footer: '\nType /profile to see full progress.',
      achievement_unlock: '🏆 *Achievement Unlocked!*\n\n{icon} *{name}*\n{desc}',
      level_up: '🎉 *Level Up!* You are now Level {level}! 🎉',
      perk_unlock: '\n\n🔓 *Perk Unlocked:* {name}\n   {desc}'
    },
    shop: {
      title: '*🛒 Shop — Premium Items*\n\n',
      item_line: '{emoji} *{name}*\n   {desc}\n   ⭐ {price}\n\n',
      buy_instruction: 'Type:\n{lines}',
      buy_item_line: '/buy {key} — Buy {emoji} {name}\n',
      inventory_footer: '/inventory — Check your items',
      unknown_item: '❌ Unknown item. Type /shop to see available items.',
      buy_failed: '❌ Purchase failed. Please try again later.',
      inventory_empty: '📦 Inventory is empty. Type /shop to buy items.',
      inventory_title: '*📦 Inventory*\n\n',
      item_timed: '{emoji} *{name}* — ⏱️ {hours}h remaining',
      item_uses: '{emoji} *{name}* — ×{count} left'
    },
    payment: {
      invalid_item: 'Invalid item',
      success: '*✅ Payment successful!*\n\n{emoji} *{name}* is now active!\n\nType /inventory to check.'
    },
    common: {
      male: '👨 Male',
      female: '👩 Female',
      indonesia: '🇮🇩 Indonesia',
      english: '🇺🇸 English'
    }
  }
};

export function t(ctx, key, params = {}) {
  const lang = ctx?.session?.language || 'id';
  const keys = key.split('.');
  let msg = locales[lang];
  for (const k of keys) {
    if (!msg) break;
    msg = msg[k];
  }
  if (!msg) {
    msg = locales['id'];
    for (const k of keys) {
      if (!msg) break;
      msg = msg[k];
    }
  }
  if (!msg) return key;
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replace(`{${k}}`, v);
  }
  return msg;
}

export function tLang(lang, key, params = {}) {
  const keys = key.split('.');
  let msg = locales[lang] || locales['id'];
  for (const k of keys) {
    if (!msg) break;
    msg = msg[k];
  }
  if (!msg) {
    msg = locales['id'];
    for (const k of keys) {
      if (!msg) break;
      msg = msg[k];
    }
  }
  if (!msg) return key;
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replace(`{${k}}`, v);
  }
  return msg;
}

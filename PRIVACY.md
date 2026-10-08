# Privacy & Security Policy — Random Chat Bot

Terakhir diperbarui: 2026-07-11

## Prinsip

Bot ini adalah ruang chat **anonim berbasis pool**. Yang dijanjikan:

1. **Pool tertutup.** Semua interaksi terjadi antara dua user dalam sesi acak
   berdasarkan bahasa + bracket usia (minor / 20s / 30plus). Bracket berbeda
   **tidak pernah dipertemukan**.
2. **Intersepsi keluar-pool.** Ajakan ketemu fisik, pertukaran kontak
   (nomor HP, email, kartu kontak), dan share sosmed (IG, WA, t.me, dsb.)
   **diblokir dari diteruskan ke partner** — di semua pool, pada teks maupun
   caption foto. Pesan pelanggar dicatat sebagai violation (migration →
   strike/freeze; personal_info → auto-ban pada hitungan ke-3).
3. **Konten intra-pool bebas.** Bot **tidak memfilter** konten seksual antara
   dua user dewasa, maupun antara dua minor, selama tetap di dalam pool.
   Perlindungan minor dari grooming/hunting adult dilakukan lewat pemisahan
   pool + deteksi pola grooming (EVICT), bukan sensor kata.

## Batasan yang diakui secara eksplisit

Keadilan menuntut batasan ditulis, bukan disembunyikan:

| Batasan | Status |
|---|---|
| **Screenshot** | Tidak bisa dicegah teknis. Timer hapus foto (3 dtk minor / 10 dtk adult) hanya membatasi durasi tampil di klien penerima. |
| **Konten dalam gambar (foto)** | Tidak di-OCR. Angka HP / handle yang *digambar* di foto lolos filter teks. Dibatasi oleh trust gate (hanya user verified), blind reveal, timer, dan jejak evidence. |
| **Isi voice message** | Tidak ditranskripsi (tanpa ASR). Voice hanya untuk adult verified; file_id + pengirim tercatat di evidence ring buffer. |
| **Chat di luar bot** | Jika dua user berhasil bertukar kontak, bot tidak bisa mengawasi kelanjutannya. Intersepsi berlaku selama komunikasi masih di dalam bot. |
| **Ketepatan usia** | Estimasi usia berbasis pola bahasa (behavioral) + trap verifikasi huruf/tahun — probabilistik, bukan kepastian. |

## Data

- Sesi tersimpan di SQLite; bukti pesan (evidence) dikunci terenkripsi
  AES-256-GCM hanya saat breach / akhir sesi minor, retensi `EVIDENCE_TTL_DAYS`
  (default 30 hari).
- Log enkripsi; user ID di-hash untuk pair ID.
- Foto tersimpan sebagai `file_id` Telegram (bukan file permanen di server).
- Admin hanya melihat data ter-sanitasi (anon_id, statistik).

## Kontak

Laporkan penyalahgunaan via `/report` dalam sesi atau ke admin bot.

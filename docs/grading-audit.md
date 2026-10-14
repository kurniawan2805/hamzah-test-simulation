# Audit penilaian writing dan speaking — 14 Oktober 2026

## Temuan dan perbaikan lokal

1. **Tinggi — klaim akustik tanpa bukti.** Rubrik lama memberi 70 poin untuk makhraj dan kelancaran dari transkrip Whisper saja. Rubrik speaking v2 menilai bahasa dan koherensi isi, masing-masing 35 poin, serta pemenuhan tugas 30 poin. Pelafalan/kelancaran bernilai `null`; review menjelaskan batas ini. Ini memperbaiki kejujuran penilaian, bukan validasi kemampuan berbicara menyeluruh.
2. **Tinggi — otorisasi endpoint.** Endpoint sebelumnya membaca attempt dengan service role tanpa memeriksa pemilik. Sekarang RPC owner-only `get_attempt_review` harus berhasil untuk attempt selesai sebelum pemanggilan AI dan pembacaan privileged. Payload demo langsung ditolak; demo frontend tetap lokal.
3. **Sedang — output model dipercaya langsung.** Sekarang memakai Responses API, JSON Schema strict, validasi integer dan batas komponen, penjumlahan total di server, serta penolakan respons kosong/tidak lengkap/refusal. Koreksi wajib mengutip substring jawaban. Penghitungan kata writing dilakukan kode, bukan model.
4. **Sedang — kegagalan penyimpanan menjadi nol.** Unduhan rekaman yang gagal kini menghentikan batch tanpa menyimpan nilai nol. Transkripsi gagal juga tidak disimpan sebagai nol. Jawaban yang memang kosong tetap nol.
5. **Sedang — pembulatan skor agregat terlalu dini.** Migration baru mempertahankan kredit pecahan sampai persentase akhir. Contoh satu writing bernilai 65: sebelumnya `ROUND(0.65)` menghasilkan skor akhir 100; sekarang 65. `correct_count` hanya menghitung pilihan ganda benar. Hak execute tetap dibatasi dan pemeriksaan pemilik menolak subject kosong. Nilai historis tidak dihitung ulang otomatis.
6. **Model lama dan rubrik terlalu umum.** Default grading berubah dari `gpt-4o-mini` ke `gpt-6-luna`; transkripsi dari `whisper-1` ke `gpt-transcribe`. Secret override: `EXAM_GRADING_MODEL`, `EXAM_TRANSCRIPTION_MODEL`. Rubrik memberi anchor, menolak instruksi dalam submission, tidak mengarang minimum kata atau menghukum harakat opsional, dan tidak mengklaim sertifikasi resmi.

## Batas yang masih ada

- Belum ada analisis akustik atau kalibrasi blind terhadap penilai manusia. Akurasi/keadilan model baru belum dapat dinyatakan meningkat berdasarkan unit test.
- Pengiriman ujian masih hanya mencatat kegagalan grading ke console dan membuka hasil. Database lama memperlakukan grade `null` sebagai nol dalam agregasi; status pending/error dan UI retry belum tersedia. Hasil setelah kegagalan AI dapat terlihat lebih rendah sampai penilaian berhasil dijalankan ulang.
- Pemanggilan ulang endpoint dapat menilai ulang jawaban dan menghabiskan biaya; belum ada lease/antrean/idempotensi lintas request. Skor model dapat bervariasi.
- File rekaman tetap mengikuti format browser WebM/MP4; nama unggahan transkripsi mengikuti MIME yang didukung atau ekstensi object Storage; file kosong/format tak dikenal ditolak. Belum ada pemeriksaan akustik untuk diam/noise atau pengujian rekaman lintas browser.
- Nilai lama memakai rubrik lama dan tidak sebanding langsung dengan speaking v2.

## Verifikasi

- `npm run lint`, `npm run test` (81 test dalam 11 file), dan `npm run build` lulus pada checkout terpisah dari `origin/main`. Build memberi peringatan ukuran chunk.
- Chrome headless: alur demo mulai → jawab → refresh/resume → kirim → hasil → review lulus pada viewport 1440×900 dan 390×900. Test komponen review mencakup rubrik baru, label historis, dan komponen tanpa nilai.
- Test baru mencakup batas skor, total server, hitungan kata, bukti koreksi, tidak adanya skor akustik, parsing REST, respons tidak lengkap dan refusal.
- Kedua entrypoint Edge Function lolos `deno check`. Test handler memakai Request/Response dan provider tiruan, meliputi autentikasi, payload, STT baru/override lama, MIME file, kegagalan unduh/provider/simpan, respons kosong, serta skor invalid.\n- Migration dijalankan di PostgreSQL WASM (PGlite) dengan fixture skema: writing/speaking 65 tetap 65, gabungan MC 100 + writing 65 menjadi 83, pemilik lain/subject kosong/attempt aktif ditolak, service role diterima, dan anon tidak punya execute. Ini bukan pengujian RLS/storage deployment Supabase penuh.\n- Panggilan OpenAI nyata dan alur cloud dengan akun peserta belum diuji: environment lokal tidak menyediakan OPENAI_API_KEY atau sesi peserta. Migration dan Edge Function belum dideploy.
- Perubahan lokal lain yang sudah ada pada Belajar AI dan migration Agustus tidak termasuk audit ini.

## Aktivasi

Terapkan migration `20261014113000_fix_fractional_exam_scores.sql` dan deploy ulang `evaluate-writing` serta `evaluate-speaking` setelah review. Pastikan proyek OpenAI punya akses kedua model. Uji satu attempt milik sendiri, attempt orang lain, attempt aktif, jawaban kosong, rekaman Arab, dan kegagalan provider; bandingkan sampel hasil dengan penilai manusia sebelum memakai nilai sebagai ukuran kemampuan.

Referensi model: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Kontrak API: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

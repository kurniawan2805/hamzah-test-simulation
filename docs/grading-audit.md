# Audit penilaian writing dan speaking — 14 Oktober 2026

## Temuan dan perbaikan

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

- `npm run lint`, `npm run test` (83 test dalam 12 file), dan `npm run build` lulus pada checkout terpisah dari `origin/main`. Build memberi peringatan ukuran chunk.
- Chrome headless: alur demo mulai → jawab → refresh/resume → kirim → hasil → review lulus pada viewport 1440×900 dan 390×900. Test komponen review mencakup rubrik baru, label historis, dan komponen tanpa nilai.
- Test baru mencakup batas skor, total server, hitungan kata, bukti koreksi, tidak adanya skor akustik, parsing REST, respons tidak lengkap dan refusal.
- Kedua entrypoint Edge Function lolos `deno check`. Test handler memakai Request/Response dan provider tiruan, meliputi autentikasi, payload, STT baru/override lama, MIME file, kegagalan unduh/provider/simpan, respons kosong, serta skor invalid.
- Migration dijalankan di PostgreSQL WASM (PGlite) dengan fixture skema: writing/speaking 65 tetap 65, gabungan MC 100 + writing 65 menjadi 83, pemilik lain/subject kosong/attempt aktif ditolak, service role diterima, dan anon tidak punya execute. Ini bukan pengujian RLS/storage deployment Supabase penuh.
- Migration dan kedua Edge Function sudah diterapkan pada proyek `crbtkqemvvtzfgtffvos`. Secret OpenAI tetap di Supabase. Uji endpoint dengan akun Supabase Auth sementara (bukan sesi Clerk browser) berhasil: writing 200, speaking 200, model `gpt-6-luna`/`gpt-transcribe`, transkrip Arab tidak kosong, skor tersimpan dan agregasi sesuai. Satu sampel sintetis menghasilkan writing 96, speaking 92, agregat 94; ini bukti integrasi, bukan ukuran akurasi penilaian.
- Uji nyata menolak request tanpa login (401), payload langsung (403), attempt aktif (403), dan attempt pemilik lain (403) pada kedua endpoint. Semua fixture akun/paket draft/attempt/audio dibersihkan. Uji sesi Clerk pada browser produksi belum dilakukan.
- Fixture suara pertama berisi header WAV tanpa sampel sehingga provider menolak file (400). Fixture diperbaiki menjadi audio Arab sintetis 16 detik. Skrip live sekarang memeriksa chunk data WAV sebelum membuat fixture server. Diagnostik provider menyimpan status, tahap, kode, dan parameter yang dibatasi formatnya; tidak menyimpan pesan provider, secret, atau jawaban.
- Advisor produksi juga menemukan dua policy RLS lama yang mereferensikan user_metadata (exam_packages dan package_assignments), di luar perubahan penilaian ini. Policy tersebut tidak diubah pada deployment ini.
- Perubahan lokal lain yang sudah ada pada Belajar AI dan migration Agustus tidak termasuk audit ini.

## Mengulang uji server

Gunakan CLI yang sudah login ke proyek tujuan, lalu jalankan:

```bash
node scripts/test-live-grading.mjs PROJECT_REF /path/to/synthetic-arabic.wav
```

Skrip mengambil kredensial proyek hanya ke memori, membuat akun tanpa mengirim email serta paket draft sementara, mengunggah audio, memanggil endpoint, memeriksa persistensi dan agregasi, kemudian membersihkan fixture melalui `finally`. Gunakan audio sintetis. Uji sampel manusia dengan aksen, tingkat kemampuan, dan kondisi mikrofon beragam masih diperlukan untuk kalibrasi.

Referensi model: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Kontrak API: [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

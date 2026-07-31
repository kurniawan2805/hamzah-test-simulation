# PRD — Hamza Test Simulation

> Status: living document · terakhir diperbarui 22 Juli 2026

## 1. Ringkasan produk

Hamza Test Simulation adalah aplikasi CBT (*computer-based test*) untuk latihan kemampuan bahasa Arab. Produk membantu peserta membangun kebiasaan mengerjakan ujian: mengelola waktu, mendengarkan materi dengan kuota terbatas, menjawab soal pilihan ganda, lalu memahami hasilnya per kompetensi.

Produk ini adalah simulasi latihan mandiri. Jangan menyatakan bahwa aplikasi ini berafiliasi, disetujui, atau identik dengan ujian/sistem sertifikasi resmi mana pun tanpa bukti dan persetujuan tertulis.

## 2. Masalah dan sasaran

Peserta belajar bahasa Arab membutuhkan latihan yang lebih realistis daripada kumpulan soal statis: ada batas waktu, urutan soal, materi audio, dan umpan balik yang dapat ditindaklanjuti. Pengelola konten juga memerlukan cara aman untuk menerbitkan paket tanpa mengekspos kunci jawaban di browser.

Sasaran produk saat ini:

- Memberikan satu alur latihan CBT lengkap dari dashboard hingga pembahasan.
- Mempertahankan sesi dan jawaban peserta saat halaman dimuat ulang.
- Menyimpan kunci jawaban dan perhitungan nilai di server saat mode cloud aktif.
- Menyajikan konten Arab dengan RTL dan tipografi yang nyaman dibaca.

Bukan sasaran MVP:

- Sertifikasi resmi, proctoring, anti-cheat penuh, atau penilaian adaptif.
- Penulisan soal, manajemen editor, atau publikasi paket melalui UI produksi.
- Penilaian otomatis produksi untuk tugas esai. Keduanya sekarang dinilai menggunakan OpenAI gpt-4o-mini lewat Edge Function, sedangkan rekaman berbicara saat ini hanya tersedia sebagai mockup demo.

## 3. Pengguna dan kebutuhan utama

| Pengguna | Kebutuhan | Hasil yang diharapkan |
| --- | --- | --- |
| Peserta latihan | Mengerjakan ujian terstruktur dari desktop atau ponsel | Dapat melanjutkan sesi, mengetahui skor, dan meninjau kesalahan |
| Pengelola konten (sementara via Supabase) | Menyiapkan paket, soal, kunci, dan audio | Paket hanya terlihat setelah lengkap dan diterbitkan |
| Pengembang | Memelihara mode demo dan cloud tanpa melemahkan keamanan | Perubahan teruji dan tidak membocorkan jawaban |

## 4. Alur pengguna

```text
Dashboard
  ├─ mode demo: instruksi → ujian → hasil → pembahasan
  └─ mode cloud: pilih paket → instruksi → attempt → hasil → pembahasan
```

1. Peserta membuka dashboard dan melihat paket latihan serta riwayat terbaru.
2. Peserta membaca instruksi, lalu memulai atau melanjutkan sesi aktif.
3. Selama ujian, peserta memilih jawaban, berpindah soal, dan dapat menandai soal ragu-ragu.
4. Untuk soal listening, pemutaran audio dibatasi oleh kuota tiap soal.
5. Peserta mengirim ujian, atau waktu habis dan sesi ditutup otomatis.
6. Hasil menampilkan skor 0–100, jumlah benar, perkiraan CEFR, dan performa per seksi.
7. Setelah selesai, peserta dapat membuka pembahasan beserta jawaban benar dan jawabannya sendiri.

## 5. Ruang lingkup yang sudah berjalan

### 5.1 Dua mode runtime

| Kondisi konfigurasi | Perilaku aplikasi | Penyimpanan utama |
| --- | --- | --- |
| Variabel Clerk/Supabase belum lengkap | Mode demo lokal | `localStorage` melalui Zustand |
| Clerk dan Supabase tersedia | Mode cloud dengan autentikasi | Supabase; cache pemulihan lokal |

Mode demo memakai `src/data/exam-data.ts`. Fitur **Bank soal** pada mode ini adalah alat draft lokal; soal yang dibuat di sana belum otomatis masuk ke paket ujian atau Supabase.

### 5.4 Manajemen User & Hak Akses (Admin)

- **Agregasi Pengguna & Attempt:** Mengelompokkan data sesi berdasarkan `user_id` di mode cloud atau data simulasi/lokal di mode demo.
- **Metrik Utama & CEFR:** Menghitung total sesi, skor rata-rata, skor tertinggi, CEFR terbaik, dan seksi terkuat per user.
- **Pencarian, Filter & Sortir:** Pencarian kata kunci (nama/email/ID), filter role (Admin/Peserta), dan sortir berdasarkan sesi/skor/aktivitas.
- **Inspeksi Jawaban Per Sesi:** Drawer/modal detail user menyediakan akses inspeksi kunci jawaban per attempt.
- **Panduan Access Control:** Integrasi hak akses admin dengan `publicMetadata` Clerk dan fungsi RPC Supabase `public.is_admin()`.
- **Ekspor & Simulasi:** Ekspor laporan CSV data user dan penambahan user simulasi untuk pengujian.

### 5.2 Mesin ujian

- Timer memakai waktu selesai absolut, bukan penghitung yang hanya hidup di memori, sehingga refresh tidak menambah waktu.
- Navigasi nomor soal memperlihatkan status belum dilihat, dijawab, dan ditandai ragu-ragu.
- Soal membaca menampilkan bacaan dan pertanyaan dalam layout responsif dua kolom pada layar besar.
- Soal listening menggunakan pemutar audio dengan batas default dua kali. Mode demo memakai nada latihan bila URL audio tidak tersedia.
- Empat opsi jawaban menggunakan indeks `0` sampai `3`; tampilan memakai label Arab `أ`, `ب`, `ج`, `د`.

### 5.3 Hasil dan penilaian

- Nilai adalah persentase jawaban benar yang dibulatkan ke bilangan bulat.
- Perkiraan CEFR saat ini: `0–39 A2`, `40–59 B1`, `60–79 B2`, `80–100 C1`.
- Nilai per seksi tersedia untuk `listening`, `reading`, `grammar`, dan `dictation`; seksi tanpa soal menghasilkan `0`.
- Pembahasan hanya tersedia setelah attempt selesai.

## 6. Aturan produk yang tidak boleh dilanggar

1. Timer dan penilaian mode cloud harus diputuskan server. UI hanya boleh menampilkan dan memicu aksi.
2. `correct_index` dan `explanation` tidak boleh dimuat untuk peserta sebelum ujian selesai.
3. Peserta hanya boleh membaca dan mengubah attempt miliknya sendiri.
4. Jawaban hanya dapat diubah ketika attempt masih `active` dan belum melewati `ends_at`.
5. Kuota audio harus diperiksa oleh server dalam mode cloud; pembatasan UI saja tidak cukup.
6. Satu paket hanya memiliki satu versi `published` dalam satu waktu.
7. Teks Arab, soal, opsi, dan bacaan memakai `dir="rtl"` serta kelas `font-arabic`.

## 7. Model konten

Soal pilihan ganda memiliki empat opsi dan satu kunci jawaban. Prototipe demo juga memuat tugas `writing` dan `speaking` yang tidak dihitung dalam skor otomatis; skema lokal divalidasi oleh Zod di `src/lib/schema.ts`. Satu `shared_asset_id` dapat digunakan oleh beberapa soal listening atau bacaan.

```json
{
  "id": "hamza_q_001",
  "section": "listening",
  "question": "…",
  "options": ["…", "…", "…", "…"],
  "correct_index": 0,
  "explanation": "…",
  "passage": "…",
  "audio_url": "/path/to/audio.mp3"
}
```

Di cloud, `correct_index` dan `explanation` dipisahkan ke skema privat `private.exam_answer_keys`. Konten peserta berada pada `public.exam_questions`, sedangkan `audio_path` mengarah ke object pada bucket private `exam-audio`. Prototipe frontend lokal memakai bucket `Audio1` dengan empat object `1.mp3`–`4.mp3`; bucket demo perlu dapat dibaca publik agar URL audio bisa dipakai tanpa backend.

## 8. Kriteria penerimaan

Sebuah perubahan dianggap selesai bila, sesuai dampaknya:

- Alur demo dapat dimulai, di-refresh, diselesaikan, dan direview tanpa kehilangan sesi.
- Alur cloud hanya menampilkan paket berstatus `published`; peserta yang tidak berhak tidak dapat mengakses attempt atau review orang lain.
- Hasil server sesuai kunci jawaban dan aturan CEFR di atas.
- Audio tidak dapat diputar melebihi `max_audio_plays`, termasuk lewat pemanggilan API berulang.
- Layout tetap dapat dipakai pada lebar 320 px dan teks Arab terbaca tanpa harakat bertumpuk.
- `npm run lint`, `npm run test`, dan `npm run build` lulus apabila area terkait berubah.

## 9. Backlog terarah

Urutan ini adalah arah berikutnya, bukan fitur yang telah tersedia.

1. **Admin konten aman:** UI khusus peran admin untuk membuat paket, versi, soal, kunci, dan unggahan audio.
2. **Authoring yang nyata:** hubungkan Bank soal ke draft versi di server; tambahkan validasi konten dan pratinjau RTL/audio.
3. **Keandalan attempt:** retry/sinkronisasi eksplisit, indikator koneksi, dan penanganan konflik multi-tab.
4. **Kualitas pembelajaran:** filter riwayat, analisis tren, target per kompetensi, serta penjelasan hasil yang lebih berguna.
5. **Aksesibilitas dan pengujian E2E:** navigasi keyboard, pengumuman pembaca layar, dan skenario refresh/timeout/audio.

## 10. Ukuran keberhasilan awal

- Peserta berhasil menyelesaikan simulasi tanpa kehilangan jawaban saat refresh.
- Tidak ada endpoint peserta yang mengekspos kunci sebelum attempt selesai.
- Sebagian besar attempt aktif dapat disinkronkan kembali setelah gangguan jaringan sementara.
- Peserta memahami seksi yang perlu dilatih dari halaman hasil.

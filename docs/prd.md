# PRD — Hamza Test Simulation

> Status: living document · terakhir diperbarui 3 Agustus 2026

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
| Peserta tier gratis | Mengakses satu modul latihan tanpa biaya | Tepat satu paket `free` tersedia; maksimal 2 attempt selesai per paket |
| Peserta VIP / VIP+ | Mengakses paket tambahan dan fitur eksklusif | Tier aktif menentukan paket yang tampil dan bisa dimulai |
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
- **Tier User (Gratis/VIP/VIP+):** kolom `tier` di `profiles` dikelola lewat RPC admin dan panel Manajemen User; akses paket ditegakkan di RLS `exam_packages` dan RPC `start_attempt`; akun tier `free` dibatasi maksimal 2 attempt selesai per paket.
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
- Halaman hasil menampilkan kartu **Topik yang disarankan** berdasarkan seksi terendah: seksi `grammar`/`structures` menunjuk topik spesifik dari katalog Belajar AI, sedangkan `listening`/`reading` memberi saran generik untuk mengulang seksi tersebut.

### 5.5 Belajar Topik dengan AI (VIP+)

- Katalog v1 mencakup lima topik `grammar` & `structures`: Huruf Jar, Fi'il Madhi & Mudhari', Mubtada' & Khabar, Kaana wa Akhwatuha, dan Isim Majrur.
- Alur: pilih topik → materi ringkas dari AI → kuis 5 soal → hasil + pembahasan per soal → chat lanjutan yang terikat topik.
- Soal kuis diambil dari bank yang bertag `topic` pada `exam_questions`; bila stok kurang dari 5, kekurangannya digenerate AI dan kuncinya disimpan di `private.ai_study_quiz_keys`. Klien tidak pernah menerima `correct_index` atau pembahasan sebelum kuis dinilai.
- Kuota harian per user: 30 pesan dan 10 kuis, direset harian, dan ditegakkan oleh RPC/database pada mode cloud (bukan hanya UI). Mode demo memakai aturan yang sama lewat state Zustand lokal.
- Mode demo memakai `demoAiStudyAdapter` dengan materi dan soal contoh berlabel jelas "mode demo"; mode cloud memakai Edge Function `ai-study` (action `lesson`, `quiz_generate`, `grade`, `chat`, `recommend`) dengan Responses API model `gpt-5.6-luna` (variabel `AI_STUDY_MODEL`, fallback `gpt-5-mini` bila proyek belum punya akses).
- Sesi, pesan, dan kuis disimpan di Supabase (`ai_study_sessions`, `ai_study_messages`, `ai_study_quizzes`) dengan RLS owner-only; refresh/resume tidak menghilangkan progres.
- Akses dibatasi untuk tier `vip_plus` atau admin; pengguna lain tetap melihat gerbang terkunci yang sudah ada.

## 6. Aturan produk yang tidak boleh dilanggar

1. Timer dan penilaian mode cloud harus diputuskan server. UI hanya boleh menampilkan dan memicu aksi.
2. `correct_index` dan `explanation` tidak boleh dimuat untuk peserta sebelum ujian selesai.
3. Peserta hanya boleh membaca dan mengubah attempt miliknya sendiri.
4. Jawaban hanya dapat diubah ketika attempt masih `active` dan belum melewati `ends_at`.
5. Kuota audio harus diperiksa oleh server dalam mode cloud; pembatasan UI saja tidak cukup.
6. Satu paket hanya memiliki satu versi `published` dalam satu waktu.
7. Teks Arab, soal, opsi, dan bacaan memakai `dir="rtl"` serta kelas `font-arabic`.
8. Akses paket ditentukan tier user (`free`/`vip`/`vip_plus`) atau assignment manual; user tier `free` hanya memperoleh satu paket bertier `free` yang terbit. Pembatasan ini ditegakkan server (RLS + `start_attempt`), bukan hanya UI.
9. Akun tier `free` maksimal 2 attempt selesai per paket; attempt yang dihitung berstatus `submitted`/`timed_out`, dan batas ini ditegakkan di RPC `start_attempt`, bukan hanya UI.
10. Badge tier hanya ditampilkan untuk peserta; admin dianggap berada di atas VIP+ dan tidak memerlukan badge tier.
11. Kuota Belajar AI (30 pesan / 10 kuis per hari) dan penilaian kuis AI harus ditegakkan server; kunci kuis hanya ada di `private.ai_study_quiz_keys` dan tidak pernah dibaca klien.
12. Materi dan chat AI tidak boleh membocorkan atau menebak kunci jawaban ujian; AI hanya menjelaskan kaidah topik yang dipilih.

## 7. Model konten

Soal pilihan ganda memiliki empat opsi dan satu kunci jawaban. Prototipe demo juga memuat tugas `writing` dan `speaking` yang tidak dihitung dalam skor otomatis; skema lokal divalidasi oleh Zod di `src/lib/schema.ts`. Satu `shared_asset_id` dapat digunakan oleh beberapa soal listening atau bacaan.

Soal `grammar`/`structures` boleh membawa bidang opsional `topic` (mis. `grammar_huruf_jar`) agar bisa dipilih sebagai sumber soal kuis Belajar Topik AI. Bidang ini tidak memengaruhi penilaian ujian biasa.

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
- Alur Belajar AI demo (pilih topik → materi → kuis 5 soal → hasil/pembahasan → chat) dapat di-refresh tanpa kehilangan progres; mode cloud menolak non-VIP+ dan kuota yang habis.
- Tidak ada endpoint peserta yang mengekspos kunci kuis AI sebelum kuis dinilai.
- Layout tetap dapat dipakai pada lebar 320 px dan teks Arab terbaca tanpa harakat bertumpuk.
- `npm run lint`, `npm run test`, dan `npm run build` lulus apabila area terkait berubah.

## 9. Backlog terarah

Urutan ini adalah arah berikutnya, bukan fitur yang telah tersedia.

1. **Admin konten aman:** UI khusus peran admin untuk membuat paket, versi, soal, kunci, dan unggahan audio.
2. **Authoring yang nyata:** hubungkan Bank soal ke draft versi di server; tambahkan validasi konten dan pratinjau RTL/audio.
3. **Keandalan attempt:** retry/sinkronisasi eksplisit, indikator koneksi, dan penanganan konflik multi-tab.
4. **Kualitas pembelajaran:** filter riwayat, analisis tren, target per kompetensi, serta penjelasan hasil yang lebih berguna.
5. **Aksesibilitas dan pengujian E2E:** navigasi keyboard, pengumuman pembaca layar, dan skenario refresh/timeout/audio.
6. **Pembayaran dan upgrade mandiri:** integrasi langganan (mis. Stripe) untuk penetapan tier VIP/VIP+ secara otomatis; saat ini tier hanya diubah oleh admin.
7. **Belajar Topik AI untuk VIP+ (lanjutan):** v1 (katalog grammar & structures, materi, kuis 5 soal, pembahasan, chat, kuota harian, rekomendasi dari hasil ujian) sudah berjalan di demo dan cloud. Lanjutan yang belum ada: topik listening/reading, streaming respons, riwayat sesi lintas topik, dan integrasi pembayaran untuk aktivasi VIP+ mandiri.

## 10. Ukuran keberhasilan awal

- Peserta berhasil menyelesaikan simulasi tanpa kehilangan jawaban saat refresh.
- Tidak ada endpoint peserta yang mengekspos kunci sebelum attempt selesai.
- Sebagian besar attempt aktif dapat disinkronkan kembali setelah gangguan jaringan sementara.
- Peserta memahami seksi yang perlu dilatih dari halaman hasil.

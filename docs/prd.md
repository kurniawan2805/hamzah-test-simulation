# Product Requirement Document (PRD)

## 1. Project Overview & Objectives
Aplikasi ini adalah platform simulasi ujian mandiri (CBT - Computer Based Test) bernama *"Hamza Test Simulation". Aplikasi ini meniru secara persis format, struktur kompetensi, aturan teknis, dan pengalaman pengguna dari **Hamza Test (اختبار همزة)* — ujian sertifikasi kemahiran bahasa Arab resmi berstandar nasional dari Kerajaan Arab Saudi.

### Objectives
*   Menyediakan media latihan bagi penutur asing (non-native) untuk menguji kemahiran bahasa Arab standar akademik Saudi.
*   Mengimplementasikan mesin ujian (Exam Engine) dengan penanganan arah teks kanan-ke-kiri (RTL) yang sempurna.
*   Menghasilkan visual antarmuka yang bersih, formal, dan bebas gangguan (distraction-free) untuk menjaga fokus pengguna.

---

## 2. Target User & Use Cases
*   *User Persona:* Pelajar, mahasiswa, atau profesional non-Arab yang bersiap mengambil sertifikasi Hamza Test resmi untuk keperluan beasiswa atau kerja di Arab Saudi.
*   *User Goal:* Melakukan simulasi ujian dalam kondisi yang mirip dengan aslinya (berbatas waktu, tipe soal acak, performa per sesi).

---

## 3. Functional Requirements (Fitur & Spesifikasi)

### 3.1. User Flow Diagram (Alur Utama Aplikasi)
[Dashboard/Home] ➔ [Pilih Mode: Full Test / Practice] ➔ [Halaman Instruksi & Cek Audio] ➔ [Exam Interface (Timer Aktif)] ➔ [Kirim Jawaban / Waktu Habis] ➔ [Halaman Hasil & Pembahasan]

### 3.2. Fitur 1: Dashboard Utama
*   *Pilihan Paket Ujian:* Menampilkan daftar simulasi tersedia (contoh: "Simulasi Akbar 1", "Latihan Mandiri").
*   *Riwayat Skor:* Kartu ringkasan yang menampilkan nilai dari ujian-ujian sebelumnya (Tanggal, Skor Total, Level CEFR).

### 3.3. Fitur 2: Sistem Mesin Ujian (The Exam Engine)
*   *Sistem Timer Global:* Waktu berjalan mundur (countdown). Jika waktu mencapai 00:00, sistem wajib mengunci semua input, menyimpan jawaban yang ada, dan otomatis mengarahkan pengguna ke halaman hasil.
*   *Sidebar Navigasi Soal (Question Grid):* 
    *   Berisi kotak nomor soal yang bisa diklik untuk berpindah soal secara cepat (jump to question).
    *   *Warna Status Kotak:*
        *   Abu-abu (#E2E8F0): Belum dibaca/dilihat.
        *   Hijau Utama (#006C35): Sudah dijawab.
        *   Kuning (#C5A059): Ditandai oleh user sebagai "Ragu-Ragu" (Bookmark).
*   *Komponen Pembaca Soal (Split Layout):*
    *   *Sesi Membaca (Reading/Qira'ah):* Layar terbagi dua. Sisi kanan menampilkan teks bacaan panjang (scrollable), sisi kiri menampilkan pertanyaan dan opsi jawaban.
    *   *Sesi Mendengar (Listening/Istima'):* Menampilkan pemutar audio khusus. Audio *hanya bisa diputar maksimal 2 kali. Setelah putaran kedua selesai, tombol *Play wajib dinonaktifkan (disabled).
*   *Input Jawaban:* 4 Pilihan Ganda (Opsi أ, ب, ج, د). Area klik harus luas berbentuk kartu radio (Radio Card).

### 3.4. Fitur 3: Halaman Hasil & Analisis Skor
*   *Skor Konversi:* Menampilkan total poin dan konversi otomatis ke standar tingkat kemahiran Eropa (CEFR: A2, B1, B2, C1).
*   *Analisis Sesi:* Grafik batang atau persentase performa yang memecah nilai berdasarkan 4 kompetensi (Listening, Reading, Grammar, Dictation).
*   *Mode Tinjau (Review Mode):* Pengguna dapat melihat kembali soal-soal yang dikerjakan lengkap dengan indikator jawaban mereka, jawaban yang benar, dan teks pembahasan solusi.

---

## 4. Technical & Non-Functional Requirements

### 4.1. Data Architecture (Format Bank Soal JSON)
Bank soal disimpan dalam file JSON dengan struktur baku berikut. AI harus menggunakan struktur ini saat membuat data tiruan (mock data):

json
[
  {
    "id": "hamza_q_001",
    "section": "listening",
    "audio_url": "/assets/audio/audio_sample_1.mp3",
    "passage": null,
    "question": "مَا هُوَ المَوْضُوعُ الرَّئِيسِيُّ لِلْحِوَارِ؟",
    "options": [
      "التَّسْجِيلُ فِي الجَامِعَةِ",
      "السَّفَرُ إِلَى الرِّيَاضِ",
      "شِرَاءُ الكُتُبِ",
      "البَحْثُ عَنْ عَمَلٍ"
    ],
    "correct_index": 0,
    "explanation": "Pembahasan: Dalam audio tersebut, kedua pembicara membahas langkah-langkah mendaftar kuliah (التسجيل في الجامعة)."
  },
  {
    "id": "hamza_q_002",
    "section": "reading",
    "audio_url": null,
    "passage": "تَأْسِيسُ مَجْمَعِ المَلِكِ سَلْمَانَ العَالَمِيِّ لِلُّغَةِ العَرَبِيَّةِ جَاءَ لِتَعْزِيزِ دَوْرِ اللُّغَةِ...",
    "question": "لِمَاذَا تَأَسَّسَ مَجْمَعُ المَلِكِ سَلْمَانَ؟",
    "options": [
      "لِتَعْزِيزِ دَوْرِ اللُّغَةِ العَرَبِيَّةِ",
      "لِتَعْلِيمِ اللُّغَاتِ الأُخْرَى",
      "لِلتِّجَارَةِ العَالَمِيَّةِ",
      "لِلسِّيَاحَةِ الدِّينِيَّةِ"
    ],
    "correct_index": 0,
    "explanation": "Pembahasan: Sesuai dengan kalimat pertama pada teks bacaan."
  }
]


### 4.2. Aturan Teknis Sistem & UI
*   *State Retention (Penyimpanan Lokal):* Menggunakan localStorage untuk menyimpan status ujian yang sedang berjalan (jawaban terpilih dan sisa detik timer). Jika aplikasi tidak sengaja ter-refresh, pengguna langsung melanjutkan ujian (resume) tanpa kehilangan data.
*   *Bidirectional Layout (RTL & LTR):* Elemen yang berisi teks Arab harus secara otomatis menerapkan atribut dir="rtl" dan menggunakan font Amiri atau Cairo dengan ukuran minimal 18px agar tanda harakat tidak bertumpuk.
*   *Responsivitas:* Aplikasi harus berwujud Mobile-First, namun memiliki adaptasi Split Screen yang baik saat diakses di perangkat komputer/tablet untuk mengakomodasi teks bacaan panjang.

---

## 5. Acceptance Criteria (Kriteria Validasi Akhir)
1.  Ujian dapat diselesaikan dari awal hingga akhir, dan tombol selesai memicu kalkulasi skor yang akurat sesuai kunci jawaban JSON.
2.  Tombol audio pada sesi listening benar-benar terkunci dan tidak bisa diklik lagi setelah diputar 2 kali.
3.  Desain halaman ujian sepenuhnya mengikuti panduan warna resmi Saudi yang tertera pada file DESIGN.md (dominan hijau tua #006C35 dan bersih).

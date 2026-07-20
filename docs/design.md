# DESIGN.md - Visual Style Guide

Dokumen ini adalah aturan desain visual mutlak untuk sistem kecerdasan buatan (AI) guna membangun antarmuka pengguna (UI) aplikasi "Hamza Test Simulation". Patuhi semua aturan warna, tipografi, jarak, dan komponen di bawah ini dengan ketat demi menjaga konsistensi merek.

---

## 1. Palet Warna (Color Palette)

Aplikasi ini menggunakan skema warna formal instansi akademik Kerajaan Arab Saudi. Desain harus didominasi oleh warna hijau tua yang bersih dikombinasikan dengan aksen emas kerajaan yang elegan.

*   *Warna Utama (Primary):* #006C35 (Hijau Tua Bendera/Akademik Saudi)
*   *Warna Utama Redup (Primary Light):* #E6F0EB (Hijau sangat muda untuk latar belakang komponen aktif)
*   *Warna Aksen (Accent/Gold):* #C5A059 (Emas Kerajaan untuk lencana, peringkat, dan skor)
*   *Latar Belakang Aplikasi (Background):* #F8FAFC (Abu-abu sangat terang, bersih, dan meminimalkan kelelahan mata)
*   *Permukaan Konten (Surface/Card):* #FFFFFF (Putih bersih)
*   *Warna Teks Utama (Text Primary):* #0F172A (Slate gelap untuk keterbacaan tinggi)
*   *Warna Teks Sekunder (Text Secondary):* #475569 (Abu-abu medium untuk keterangan dan sub-judul)
*   *Warna Batas (Border Color):* #E2E8F0 (Abu-abu tipis untuk pemisah)

### Status Sistem:
*   *Warna Timer & Peringatan:* #DC2626 (Merah tegas)
*   *Warna Sukses & Jawaban Benar:* #16A34A (Hijau sukses)
*   *Warna Ragu-Ragu (Bookmark):* #D97706 (Amber/Kuning Tua)

---

## 2. Tipografi & Pengaturan Bahasa (Typography & RTL)

Karena berfokus pada teks Arab berharakat, tipografi harus diatur agar tanda baca tidak saling bertabrakan atau terlalu kecil.

### Pengaturan Arah Teks (Directionality)
*   Semua area yang menampilkan konten soal Arab *wajib* menggunakan atribut HTML dir="rtl" (Right-to-Left).
*   Area instruksi dalam bahasa Indonesia/Inggris menggunakan atribut dir="ltr" (Left-to-Right).

### Huruf (Fonts)
*   *Font Bahasa Arab (Utama):* Cairo, Amiri, atau Noto Naskh Arabic, sans-serif.
*   *Font Bahasa Latin (Sistem):* Inter, system-ui, sans-serif.

### Hirarki & Ukuran Teks (Typography Scale)
*   *Judul Utama / Teks Bacaan (H1):* 22px - 24px | Tebal (Bold) | line-height: 1.8 (Wajib longgar untuk harakat).
*   *Teks Pertanyaan Soal (H2):* 18px - 20px | Semi-Tebal (Semi-Bold) | line-height: 1.6.
*   *Pilihan Ganda & Isi Teks (Body):* 16px - 18px | Reguler (Regular) | line-height: 1.6.
*   *Teks Info / Timer / Nomor (Caption):* 14px | Semi-Tebal | Font Monospace untuk angka timer agar tidak bergeser.

---

## 3. Komponen Antarmuka & Tata Letak (Layout & Components)

### 3.1. Tata Letak Layar Ujian (Exam Layout)
*   *Header Atas (Sticky Top):* Tinggi 60px, latar belakang #FFFFFF, memiliki bayangan tipis bawah. Berisi info sub-tes, timer, dan progress bar.
*   *Tata Letak Responsif (Split View):*
    *   Layar PC/Tablet: Menggunakan sistem 2 kolom grid (grid-cols-2). Kolom kanan untuk teks bacaan panjang (overflow-y scroll), kolom kiri untuk pertanyaan dan pilihan ganda.
    *   Layar HP: Layout 1 kolom vertikal. Teks bacaan diletakkan di atas kotak pertanyaan dengan batas vertikal yang jelas.

### 3.2. Kartu Pilihan Ganda (Radio Cards)
*   *Bentuk:* Kotak memanjang ke bawah, border-radius: 12px, padding dalam 16px.
*   *State Visual:*
    *   Default (Belum Dipilih): Latar belakang #FFFFFF, border 1px padat #E2E8F0.
    *   Hover (Kursor di atas): Border berubah menjadi #006C35.
    *   Selected (Terpilih): Latar belakang berubah menjadi #E6F0EB (Primary Light), border 2px tebal #006C35. Teks opsi otomatis menjadi Semi-Bold.

### 3.3. Panel Navigasi Soal (Question Grid)
*   *Bentuk:* Grid kotak-kotak kecil ukuran 40px x 40px dengan border-radius: 8px.
*   *Indikator Warna Kotak:*
    *   Belum Dijawab: Latar belakang #FFFFFF, border #E2E8F0, teks abu-abu.
    *   Sudah Dijawab: Latar belakang #006C35 (Primary), teks putih #FFFFFF.
    *   Ragu-Ragu (Ditandai): Latar belakang #D97706 (Amber), teks putih #FFFFFF.
    *   Sedang Aktif (Dilihat): Berikan outline atau efek ring tebal di luar kotak sebesar 2px.

### 3.4. Pemutar Audio (Listening Audio Player)
*   *Bentuk:* Bar horizontal minimalis berlatar belakang #F1F5F9.
*   *Elemen:* Tombol Play besar berwarna #006C35, diiringi teks petunjuk kuota putar (Contoh: "Sisa putar: 2/2").
*   *State Disabled:* Jika kuota habis, ubah latar belakang menjadi #E2E8F0, ikon tombol menjadi abu-abu, dan kursor tidak bisa diklik (cursor-not-allowed).

---

## 4. Aturan Penting Do & Don't (AI Guidelines)

*   *DO (Wajib):* Berikan jarak ruang kosong (white space) yang cukup luas antar komponen utama (minimal 24px margin/padding) agar tampilan terasa lapang dan formal mirip aplikasi CAT/CBT resmi pemerintah.
*   *DO (Wajib):* Gunakan ikon bergaya garis tipis minimalis (outline icons) seperti Lucide Icons atau Heroicons dengan warna senada tema.
*   *DON'T (Jangan dilakukan):* Jangan menggunakan warna hitam pekat #000000 untuk teks atau latar belakang mode gelap, gunakan variasi abu-abu slate tua agar visual tetap premium.
*   *DON'T (Jangan dilakukan):* Jangan menerapkan efek animasi transisi masuk/keluar (seperti fade atau slide) yang terlalu lama atau berlebihan pada komponen soal karena akan mengganggu konsentrasi peserta ujian.

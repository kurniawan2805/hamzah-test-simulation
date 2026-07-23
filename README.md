# Hamza Test Simulation

React/Vite CBT MVP untuk simulasi Hamza Test. Saat environment Clerk dan Supabase belum tersedia, aplikasi otomatis berjalan dalam mode demo lokal agar UI dan test dapat dikembangkan.

## Setup cloud MVP

1. Buat aplikasi Clerk, lalu aktifkan integrasi **Connect with Supabase**. Gunakan token sesi Clerk native; jangan memakai JWT template Clerk lama bernama `supabase`.
2. Buat proyek Supabase dan tambahkan Clerk pada **Authentication → Third-Party Auth**. Pastikan domain/issuer Clerk yang terdaftar sama dengan instance yang dipakai publishable key. Token sesi harus mempunyai claim `role: authenticated`.
3. Terapkan migration di `supabase/migrations/` ke proyek tersebut. Migration ini membuat tabel paket, versi, soal publik, answer key private, attempt, RLS, RPC, serta bucket `exam-audio` private.
4. Di Supabase Dashboard, masukkan `exam_packages`, `exam_versions`, `exam_questions`, lalu answer key di `private.exam_answer_keys`. Ubah versi menjadi `published` setelah semua soal dan key lengkap.
5. Untuk prototipe frontend, unggah empat audio ke bucket `Audio1` sebagai `1.mp3`, `2.mp3`, `3.mp3`, dan `4.mp3`. Jadikan bucket dapat dibaca publik saat menjalankan demo lokal; demo memakai URL publik, sedangkan CloudApp memakai signed URL. Backend produksi tetap memakai bucket private `exam-audio` dan `audio_path`.
6. Salin `.env.example` menjadi `.env.local` dan isi tiga nilai public di dalamnya.

## Commands

```bash
npm run dev
npm run test
npm run build
```

Untuk Vercel, set tiga variabel `VITE_*` pada environment Preview dan Production. Tidak ada service-role key atau secret Clerk yang dibutuhkan di browser.

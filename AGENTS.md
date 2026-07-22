# AGENTS.md — Panduan kontribusi Hamza Test Simulation

Panduan ini berlaku untuk perubahan di repository ini. Baca `docs/prd.md` dan `docs/DESIGN.md` sebelum mengubah perilaku produk atau UI.

## Konteks singkat

- Stack: React + TypeScript + Vite + Tailwind CSS v4 + TanStack Router + Zustand.
- Dua runtime: demo lokal saat konfigurasi cloud belum lengkap, atau cloud memakai Clerk dan Supabase.
- Bahasa antarmuka: Indonesia; teks soal: Arab dan wajib RTL.
- Product claim: aplikasi adalah simulasi latihan mandiri, bukan representasi atau sertifikasi resmi tanpa persetujuan tertulis.

## Peta kode

| Area | Lokasi |
| --- | --- |
| Aplikasi demo dan rute lokal | `src/app.tsx` |
| Aplikasi cloud dan rute attempt | `src/cloud-app.tsx` |
| API Supabase di browser | `src/lib/exam-api.ts` |
| Auth Clerk dan fallback demo | `src/lib/auth.tsx` |
| State lokal/cadangan cloud | `src/store/exam-store.ts` |
| Skor murni dan testnya | `src/lib/scoring.ts`, `src/lib/scoring.test.ts` |
| Kontrak konten demo | `src/types.ts`, `src/lib/schema.ts`, `src/data/` |
| Komponen ujian bersama | `src/components/` |
| Skema dan RPC database | `supabase/migrations/` |

## Aturan implementasi

1. Pertahankan mode demo. Aplikasi harus tetap dapat dibangun dan digunakan tanpa variabel cloud.
2. Jangan menaruh secret, service-role key, atau kunci jawaban dalam kode browser, data publik, atau `VITE_*`. Kunci dan pembahasan cloud tetap di `private.exam_answer_keys` dan hanya keluar melalui RPC review untuk attempt selesai.
3. Untuk perubahan database, buat migration baru yang bersifat maju (*forward-only*); jangan menulis ulang migration yang sudah diterapkan. RLS dan hak `execute` RPC harus ditinjau bersamaan.
4. Time limit, kepemilikan attempt, kuota audio, dan penilaian cloud harus ditegakkan oleh RPC/database, bukan hanya UI.
5. Konten Arab menggunakan `dir="rtl"` dan `font-arabic`. Ikuti token serta pola dalam `docs/DESIGN.md`.
6. Gunakan tipe dan utilitas yang sudah ada. Perbarui Zod schema, tipe, tes, dan data contoh bila kontrak soal berubah.
7. Jangan mencampur UI authoring lokal dengan data paket published tanpa kontrak backend dan model peran yang jelas.

## Verifikasi

Jalankan pemeriksaan yang relevan sebelum menyerahkan perubahan:

```bash
npm run lint
npm run test
npm run build
```

Tambahkan atau perbarui test Vitest untuk aturan bisnis murni: skor, CEFR, timer, store, dan batas audio. Untuk perubahan UI ujian, cek setidaknya alur mulai → jawab → refresh/resume → kirim → hasil → review pada viewport ponsel dan desktop.

## Dokumentasi

- Perbarui `docs/prd.md` jika scope, aturan produk, atau backlog berubah.
- Perbarui `docs/DESIGN.md` jika token, komponen, responsivitas, atau aksesibilitas berubah.
- Gunakan bahasa Indonesia yang lugas; sebutkan perbedaan antara fitur yang **sudah ada** dan **rencana**.

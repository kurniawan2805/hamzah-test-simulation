# Verifikasi revisi Belajar AI

Pada 15 Oktober 2026, migration `20261015023048_restrict_ai_study_table_privileges.sql` diterapkan ke produksi untuk menutup temuan grant berlebih. Empat tabel public AI Study kini hanya memberi SELECT kepada authenticated, tetap dengan RLS pemilik; anon dan PUBLIC tidak memiliki hak tabel. Penulisan tetap lewat RPC yang sudah diperiksa. Query produksi mengonfirmasi nol grant tak diharapkan, empat grant SELECT authenticated, dan RLS aktif.

Setelah pembatasan, 58 pemeriksaan akses menggunakan dua akun VIP+ dan satu free berhasil, termasuk akses silang, token palsu, manipulasi metadata/tier, RPC internal, kunci sebelum submit, dan mutasi langsung. Smoke test provider nyata materi/chat/kuis/kuota/resume juga berhasil. Fixture dibersihkan. Lint, 128 tes, dan build berhasil. Penerapan ini tidak mengubah tabel ujian maupun fungsi speaking/writing.

Hotfix autentikasi Clerk: `ai-study` memakai `verify_jwt = false` pada gateway karena token Clerk diperiksa melalui Data API dan RPC `ai_study_is_allowed`, bukan validator JWT legacy gateway. Handler tetap menolak request tanpa Bearer, token tidak sah, serta pengguna tanpa akses. Smoke test Supabase Auth saja tidak mencakup token Clerk; verifikasi browser akun Clerk diperlukan saat mengubah konfigurasi autentikasi.

Revisi PR #6 memperbaiki pembacaan output Responses API, penyimpanan kunci kuis pada schema private, reservasi kuota sebelum panggilan model, penanganan kegagalan penyimpanan, dan tipe Promise Edge Function. Model default adalah `gpt-6-luna`.

Migration baru menambahkan RPC untuk konteks sesi, reservasi pesan, publikasi kuis atomik, dan hasil submit yang tetap. RPC penulisan internal hanya dapat dijalankan service role; pemilik sesi dan akses VIP+ diperiksa di server.

Verifikasi lokal:

- Lint dan build berhasil.
- 121 tes pada 17 file berhasil, termasuk handler cloud serta migration SQL melalui PGlite.
- `deno check supabase/functions/ai-study/index.ts` berhasil.
- 24 pemeriksaan browser demo berhasil pada viewport 1280px dan 320px: materi, kuis, hasil, chat, kuota, resume, akses, dan rekomendasi.
- Pemicu React Refresh pada HTML dibatasi ke mode development. Pengulangan QA preview produksi berhasil tanpa console error atau resource gagal. Analytics Vercel dan favicon distub oleh harness lokal.

Setelah persetujuan deploy pada 14 Oktober 2026, migration diterapkan dalam transaksi dan Edge Function `ai-study` aktif pada versi 3. Uji produksi dengan akun QA sementara berhasil untuk gerbang free/VIP+, sesi dan resume, penolakan sesi asing serta RPC internal, materi dan chat dengan provider sungguhan, kuis lima soal tanpa kunci di respons awal, hasil immutable, kuota, dan penyimpanan pesan. Fixture dibersihkan setelah tes.

Regresi produksi `evaluate-writing` dan `evaluate-speaking` berhasil: provider sungguhan, transkripsi Arab, penyimpanan skor dan agregat, serta penolakan request tanpa autentikasi, attempt aktif, dan attempt pengguna lain. Fungsi tetap pada versi 11 dan 14; fixture termasuk audio dibersihkan. Pengujian audio memakai rekaman sintetis, sehingga tidak mencakup semua variasi mikrofon dan aksen pengguna.

Database advisor masih melaporkan dua temuan lama `rls_references_user_metadata` pada policy `exam_packages` dan `package_assignments`, serta peringatan RPC SECURITY DEFINER yang dapat dipanggil pengguna. Policy lama tersebut tidak diubah oleh revisi ini. RPC AI Study yang memang publik memeriksa pemilik dan VIP+; RPC penulisan internal hanya untuk service role. Temuan akses paket perlu audit terpisah; hasil tes ini bukan klaim bahwa seluruh database bebas masalah keamanan.

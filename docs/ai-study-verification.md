# Verifikasi revisi Belajar AI

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

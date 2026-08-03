# DESIGN.md — Pedoman UI Hamza Test Simulation

> Status: living document · terakhir diperbarui 22 Juli 2026

Dokumen ini adalah sumber acuan desain untuk UI aplikasi. Ikuti token dan pola yang sudah digunakan di `src/styles.css`, `src/app.tsx`, dan `src/cloud-app.tsx`; jangan menciptakan gaya visual baru tanpa alasan produk yang jelas.

## 1. Prinsip desain

1. **Fokus saat ujian.** Antarmuka ujian mengutamakan soal, waktu, dan navigasi; dekorasi tidak boleh mengalihkan perhatian.
2. **Jelas sebelum menarik.** Status jawaban, waktu hampir habis, dan kuota audio harus dapat dipahami tanpa menebak.
3. **Arab adalah warga kelas satu.** RTL, font Arab, ukuran, dan tinggi baris diperlakukan sebagai kebutuhan fungsional.
4. **Tenang dan formal.** Gunakan ruang kosong, hierarki yang konsisten, dan animasi pendek hanya sebagai umpan balik tindakan.
5. **Responsif.** Tampilan harus tetap layak pakai di lebar minimum 320 px dan efisien pada layar desktop.

## 2. Token visual

| Peran | Nilai | Penggunaan |
| --- | --- | --- |
| Primary | `#006C35` | CTA, jawaban terpilih, brand, status sukses utama |
| Primary light | `#E6F0EB` | Latar state terpilih dan badge lembut |
| Accent gold | `#C5A059` | Aksen progres dan level; jangan untuk aksi utama |
| Badge tier Gratis | `#E6F0EB` + teks `#006C35`, border `#A7D7C0` | Label tingkat akses gratis |
| Badge tier VIP | `#FEF3C7` + teks `#78350F`, border `#FCD34D` | Label tingkat akses VIP |
| Badge tier VIP+ | `#78350F` + teks putih, border gelap senada | Label tingkat akses VIP+ |
| App background | `#F8FAFC` | Latar halaman |
| Surface | `#FFFFFF` | Kartu, header, panel |
| Text primary | `#0F172A` | Teks utama |
| Text secondary | `#475569` / Tailwind `slate-600` | Deskripsi dan metadata |
| Border | `#E2E8F0` | Pemisah dan border default |
| Danger | `#DC2626` | Timer kritis dan kegagalan |
| Warning/bookmark | `#D97706` | Soal ditandai ragu-ragu |
| Success review | Tailwind `green-700`/`green-50` | Indikator jawaban benar di review |

Jangan memakai hitam murni sebagai warna antarmuka utama. Gunakan slate untuk keterbacaan yang tidak terlalu keras.

## 3. Tipografi dan arah bahasa

- UI Latin memakai `Arial, Helvetica, ui-sans-serif, system-ui, sans-serif`.
- Konten Arab memakai `.font-arabic`, yang memetakan ke `Noto Naskh Arabic` dengan fallback `Tahoma, serif`.
- Tambahkan `dir="rtl"` untuk pertanyaan, opsi, dan bacaan Arab; instruksi bahasa Indonesia tetap LTR.
- Pertanyaan Arab: sekitar `22–25px`, `line-height: 1.85`.
- Bacaan Arab: sekitar `22–24px`, `line-height: 2`.
- Opsi Arab: sekitar `17–18px`, `line-height: 1.8`.
- Angka timer memakai `font-mono` dan `tabular-nums` agar lebarnya stabil.
- Jangan mengecilkan teks Arab untuk memaksa lebih banyak konten masuk ke layar. Lebih baik beri area scroll yang jelas.

## 4. Tata letak dan responsivitas

### Halaman umum

- Lebar konten dashboard: `max-w-6xl`; halaman ujian: `max-w-[1440px]`.
- Gutter halaman: `px-5` pada ponsel, `sm:px-8` pada layar lebih lebar.
- Panel utama menggunakan `rounded-2xl` atau `rounded-3xl`, surface putih, dan bayangan slate tipis.
- Tinggi target interaksi minimal `44px` (`min-h-11`).

### Halaman ujian

- Header menempel di atas, tinggi `60px`, memuat seksi, timer, aksi kirim, dan progress tipis.
- Desktop ekstra lebar: grid navigasi `17rem` + area soal fleksibel.
- Soal dengan bacaan: pada `lg` gunakan dua kolom; bacaan berada di sisi awal visual dan dapat di-scroll. Pada layar kecil, bacaan muncul sebelum pertanyaan.
- Jangan menyembunyikan informasi penting hanya untuk mendapatkan layout dua kolom. Susun vertikal di layar sempit.

## 5. Komponen dan state

### Tombol

- CTA utama: latar primary, teks putih, `rounded-xl`, tebal, tinggi minimal 44px.
- CTA sekunder: surface putih dengan border atau teks primary.
- Gunakan `active:scale-[0.96]` secara hemat untuk umpan balik tekan. Hindari animasi masuk/keluar yang lama.
- Semua tombol dan tautan harus memiliki `:focus-visible` dengan outline emas. Jangan menghapus fokus keyboard.

### Opsi jawaban

| State | Tampilan |
| --- | --- |
| Default | Putih, border slate-200 |
| Hover | Border primary |
| Terpilih | `#E6F0EB`, border primary 2px, teks lebih tegas |
| Review benar | `green-50`, border `green-200` |
| Review salah terpilih | `red-50`, border `red-200` |

Opsi adalah seluruh kartu yang dapat diklik, bukan radio kecil yang sulit disentuh. Label huruf `أ–د` tetap muncul sebagai penanda terpisah.

### Grid navigasi soal

| Status | Tampilan |
| --- | --- |
| Belum dilihat | Putih, border slate-200, teks slate-400 |
| Dilihat, belum dijawab | Slate lembut |
| Dijawab | Primary, teks putih |
| Ragu-ragu | Warning, teks putih, ikon bookmark |
| Aktif | Ring primary 2px dengan offset |

Status bookmark diprioritaskan secara visual atas status telah dijawab.

### Tier badge, pemilih tier, gerbang Diskusi AI, dan tab Belajar Topik

- `TierBadge` adalah pill dengan ikon (Sparkles untuk Gratis, Crown untuk VIP/VIP+), teks tebal 11px, dan warna sesuai tabel token; dipakai di kartu paket, menu akun, tabel manajemen user, dan daftar penugasan paket.
- Pemilih tier (paket/user) memakai `select` 44px, border slate, dan focus ring emas; opsi berlabel Gratis/VIP/VIP+.
- Gerbang "Diskusi AI": pengguna non-VIP+ melihat kartu terkunci (ikon Lock, judul "Fitur VIP+", CTA "Lihat ketentuan VIP+") yang membuka dialog non-pembayaran "Hubungi admin". Pengguna VIP+ dan admin masuk ke tab Belajar Topik (`AiStudyTab`).

### Tab Belajar Topik AI

- Daftar topik: kartu dua kolom per seksi (Grammar, Structures) dengan judul Arab RTL, judul Latin, dan deskripsi singkat; seluruh kartu adalah tombol 44px+ dengan focus ring emas.
- Header tab menampilkan badge kuota harian: pesan `X/30` dan kuis `X/10`; saat kuota habis, tombol terkait nonaktif dengan pesan "Coba lagi besok".
- Materi dan chat: gelembung pesan (user di kanan `#E6F0EB`, AI di kiri `slate-50`), area teks `whitespace-pre-wrap` dengan `dir="auto"` agar campuran Indonesia-Arab terbaca benar, dan pengiriman lewat tombol atau Enter (Shift+Enter untuk baris baru).
- Kuis: kartu soal memakai `dir="rtl"` dan `font-arabic`; opsi adalah kartu penuh dengan label huruf `أ–د`, state terpilih `#E6F0EB` + border primary 2px; navigasi Sebelumnya/Berikutnya dan tombol "Kumpulkan jawaban".
- Hasil kuis: panel skor hijau dengan angka besar, lalu kartu pembahasan per soal (benar `green-50`, salah terpilih `red-50`, pembahasan di panel krem `#FFFCF4`).
- Rekomendasi dari halaman hasil: kartu amber "Topik yang disarankan" dengan tombol "Buka Belajar AI"; klik menulis topik ke `localStorage` (`hamza_ai_topic`) lalu membuka dashboard ke tab Belajar Topik dengan topik terpilih.
- State demo dipersist di Zustand (`demoAiStudySessions`, `demoAiStudyUsage`); mode cloud membaca ulang sesi dari Supabase sehingga refresh/resume tidak kehilangan progres.

### Pemutar audio

- Panel `slate-100`, tombol play primary, dan badge sisa putar menggunakan angka tabular.
- Saat sedang diputar atau kuota habis, tombol tidak dapat ditekan dan state disabled harus tampak jelas.
- Jangan menganggap pemblokiran tombol sebagai keamanan; server tetap harus menegakkan kuota pada mode cloud.

### Tugas menulis dan berbicara (prototipe)

- Tugas menulis memakai area jawaban RTL yang lapang dan menyatakan jelas jumlah kata minimum.
- Tugas berbicara boleh memakai tombol rekam dummy pada demo, tetapi harus menjelaskan bahwa rekaman belum tersimpan atau dinilai otomatis.

### Timer

- State normal: primary light dan teks primary.
- Di bawah 60 detik: latar merah lembut, teks danger. Jangan bergantung pada warna saja; angka selalu terlihat.

## 6. Aksesibilitas dan kualitas interaksi

- Gunakan elemen `<button>` untuk aksi; sediakan `aria-label` untuk ikon tanpa label.
- Pertahankan urutan tab yang mengikuti urutan visual dan fokus keyboard yang selalu terlihat.
- Kontras teks harus memadai di atas latar yang dipakai. Jangan memakai emas sebagai teks kecil di atas putih.
- Pesan error, loading, dan state kosong harus spesifik dalam bahasa Indonesia.
- Gunakan `min-width: 320px`; uji layout pada ponsel dan desktop setelah mengubah komponen utama.

## 7. Yang perlu dihindari

- Gradien dekoratif, dark mode baru, atau warna cerah tambahan tanpa kebutuhan yang tervalidasi.
- Modal konfirmasi berlapis saat mengerjakan soal.
- Animasi panjang yang membuat perpindahan soal lambat.
- Teks Arab dalam font Latin, atau konten RTL tanpa atribut `dir`.
- Materi, soal generate, atau chat AI yang menyinggung/membocorkan kunci jawaban ujian nyata.
- Hanya membedakan state lewat warna tanpa teks, bentuk, atau ikon pendukung.

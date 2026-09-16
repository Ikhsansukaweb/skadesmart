# Pemahaman SkadesMart & Usulan Fitur Tambahan

Disusun setelah membaca 28 halaman frontend, 76 endpoint backend, dan skema
database lengkap.

---

# BAGIAN 1 — APA ISI WEBSITE INI

## 1.1 Identitas

**SkadesMart** = marketplace internal SMKN 1 Depok Sleman. Dua unit KWU resmi
sekolah (Ayam Geprek Brital & Laundry) + jualan bebas antar siswa.

## 1.2 Peran pengguna (5)

| Role | Bisa apa |
|---|---|
| `siswa` | Beli, jual produk, chat, rating, laundry |
| `kwu_brital` | Kelola produk Brital, proses pesanan Brital, buka/tutup toko |
| `kwu_laundry` | Input pesanan laundry atas nama siswa, ubah status cucian |
| `cs` | Moderasi konten, tiket bantuan, balas chat (bot AI → manusia) |
| `admin` | Semua di atas + kelola pengguna, banner, KWU, config |

## 1.3 Peta halaman (28)

**Publik / siswa:** `/` (landing), `/login`, `/home`, `/marketplace`,
`/product/[id]`, `/product/add`, `/product/edit/[id]`, `/product/mine`,
`/cart`, `/orders/status`, `/chat`, `/chat/[chatId]`, `/account`,
`/profile/[userId]`, `/rating/[orderId]`

**Staf:** `/dashboard/brital` (+`/orders`, `/history`), `/dashboard/laundry`
(+`/orders`, `/history`), `/cs`, `/cs/chat`

**Admin:** `/admin`, `/admin/banners`, `/admin/kwu`

## 1.4 Fitur yang SUDAH ADA (lengkap)

- Login NISN 5 digit, JWT httpOnly, auto-logout, ganti password
- Marketplace: kategori, pencarian, urut, produk + galeri 8 foto
- Keranjang: tambah/ubah/hapus, catatan per item
- Pesanan Brital: checkout keranjang & pesan langsung
- Pesanan Laundry: staf input atas nama siswa (cari via NISN), lacak status
- Chat: 1:1 & per-unit, foto, balasan AI CS, mute, hapus, lencana belum dibaca
- Realtime WebSocket + Web Push (VAPID)
- Rating per pesanan + moderasi CS (sembunyikan)
- Banner carousel (admin atur)
- Dashboard staf: grafik 7 hari (penjualan/pendapatan), overview
- Admin: kelola pengguna, ubah role, hapus, transaksi, config
- Buka/tutup toko manual (produk unit ditandai "Tutup")
- Notifikasi browser on/off dari halaman Akun
- Upload foto ke Catbox

## 1.5 Halaman yang ADA tapi BELUM TERPAKAI

- `firestore.rules` — sisa Firebase, sudah digantikan WebSocket
- Endpoint `GET /app/version` + tabel `app_config` (latest_version,
  force_update, update_message) — **backend lengkap, frontend 0 pemakaian**

## 1.6 Fitur SETENGAH JALAN (temuan penting)

| # | Temuan | Dampak |
|---|---|---|
| 1 | Tabel `cs_tickets` ada, tapi **tidak ada endpoint POST** | Siswa tak bisa buat tiket; CS hanya bisa lihat tabel kosong |
| 2 | `GET /app/version` tak dipakai frontend | Fitur "paksa update" mati |
| 3 | Rating: `avg_rating` null & `rating_count` salah | Bintang produk sering kosong |
| 4 | Keranjang tak validasi stok | Bisa pesan 500 pcs padahal stok 5 |
| 5 | `/orders/status` tab "Dikirim" ≠ status `diantar` | Filter tab kosong |
| 6 | Jualan siswa: transaksi ditandai selesai manual penjual | Tidak ada konfirmasi pembeli |
| 7 | Laundry tak bisa dikonfirmasi siswa selesai | Status menggantung |
| 8 | `/product/5` muter selamanya | Halaman rusak |
| 9 | `avg_rating` dihitung ulang tiap request | Lambat bila data banyak |

---

# BAGIAN 2 — USULAN FITUR TAMBAHAN

Diurutkan: **A. cepat & berdampak** → **F. jangka panjang**.
Tanda: 🔥 = saya sarankan kerjakan lebih dulu.

---

## A. MELENGKAPI YANG SUDAH SETENGAH JALAN (paling murah, dampak besar)

1. 🔥 **Tombol "Buat Tiket Bantuan"** di halaman Akun → `POST /cs/tickets`.
   Sekarang tabel tiket kosong selamanya; CS punya layar tapi tak ada isinya.
2. 🔥 **Keranjang validasi stok** — tolak bila `qty > stock`, tampilkan sisa stok.
3. 🔥 **Perbaiki `avg_rating`** — hitung sekali, simpan di kolom `products.avg_rating`
   & `rating_count`, perbarui saat rating dibuat/dihapus.
4. 🔥 **Perbaiki `/product/[id]` yang muter selamanya** (produk tidak ada → 404 ramah).
5. 🔥 **Samakan tab "Dikirim" dengan status `diantar`** di `/orders/status`.
6. **Dropdown status di dashboard Brital** hanya menampilkan transisi sah
   (baru→diproses→diantar→selesai), bukan semua status.
7. **Isi `how_to_order` & `price_info` Brital** — sekarang NULL, padahal Home
   sudah menyiapkan tempatnya.
8. **Pesan error ramah** untuk `/cs/chat` (sekarang error mentah) dan
   `/chat/<id>` 401 (sekarang tanpa penjelasan).

---

## B. KEMUDAHAN PEMBELI

9. 🔥 **Riwayat pesanan lengkap** dengan filter tanggal + rincian item
   (sekarang hanya judul + harga).
10. 🔥 **"Beli Lagi"** dari riwayat → masukkan item yang sama ke keranjang.
11. 🔥 **Favorit / simpan produk** (ikon hati) + halaman "Disimpan".
12. **Pencarian dengan saran otomatis** (nama produk, penjual, kategori).
13. **Filter lanjutan marketplace**: rentang harga, hanya yang ada stok,
    urut rating/terbaru/termurah.
14. **Riwayat pencarian** tersimpan.
15. **Detail produk: berapa kali dilihat & terjual** (bukti sosial).
16. **Perkiraan waktu pengambilan** di detail produk Brital.
17. **Notifikasi harga turun** untuk produk favorit.
18. **Keranjang tersimpan antar perangkat** (sekarang per-browser).
19. **Ringkasan belanja** sebelum checkout (subtotal, jumlah item).
20. **Ulangi pesanan laundry terakhir** dalam 1 klik (untuk siswa langganan).

---

## C. JUALAN SISWA (penjual)

21. 🔥 **Konfirmasi terima pesanan oleh pembeli** — sekarang penjual bisa
    menandai "selesai" sendiri; pembeli tak pernah menyetujui.
22. 🔥 **Stok otomatis berkurang** saat pesanan dibuat (sekarang tidak).
23. **Statistik penjual**: total penjualan, produk terlaris, pendapatan bulanan.
24. **Duplikat produk** (buat varian dari produk yang ada).
25. **Mode draf / jadwalkan tayang** produk.
26. **Varian produk** (ukuran, warna, level pedas) dengan harga berbeda.
27. **Diskon / harga promo** per produk (harga normal dicoret).
28. **Paket bundling** ("beli 2 lebih murah").
29. **Label produk**: Baru, Terlaris, Rekomendasi, Habis.
30. **Balas ulasan** dari penjual.
31. **Papan pengumuman penjual** (mis. "libur, buka Senin").
32. **Peringatan stok menipis** di dashboard penjual.
33. **Produk terlaris diurut otomatis** di halaman Marketplace.
34. **Impor produk massal** dari CSV/Excel (untuk bazar/kegiatan sekolah).
35. **QR code produk** — tempel di meja, siswa pindai langsung ke halaman produk.

---

## D. KWU BRITAL & LAUNDRY (unit usaha)

36. 🔥 **Antrean pesanan bernomor** untuk Brital (siswa tahu urutannya).
37. 🔥 **Estimasi waktu siap** di pesanan Brital (mis. "siap 10 menit lagi").
38. 🔥 **Struk / bukti pesanan yang bisa dicetak** (Brital & Laundry).
39. 🔥 **Konfirmasi pengambilan laundry oleh siswa** — sekarang status
    menggantung di "bisa_diambil" selamanya.
40. **Antrean laundry** — perkiraan selesai & posisi antrean.
41. 🔥 **Riwayat harga laundry per kg** (sekarang hanya teks bebas
    "hubungi petugas"; tidak ada catatan harga resmi).
42. **Kalkulator biaya laundry** (masukkan kg → muncul total).
43. **Jadwal buka/tutup otomatis** unit usaha (sekarang manual saja).
44. **Papan status realtime di layar kantin** — daftar pesanan yang siap diambil.
45. **Pengurangan stok bahan baku** Brital saat pesanan masuk.
46. **Laporan harian otomatis** ke staf (jumlah pesanan & pendapatan hari ini).
47. **Rekap kas mingguan** yang bisa diunduh (Excel/PDF) untuk laporan sekolah.
48. **Tanda "sedang ramai"** di Brital (jumlah antrean) supaya siswa tahu.
49. **Pesanan terjadwal** — pesan sekarang, ambil jam istirahat.
50. **Bagi hasil / pencatatan pendapatan per unit** untuk laporan KWU.

---

## E. ADMIN & OPERASIONAL

51. 🔥 **Audit log** — catat siapa mengubah apa dan kapan (role, produk, banner,
    config). Sekarang perubahan role tidak meninggalkan jejak.
52. 🔥 **Kelola kategori/tag** produk (sekarang hanya 2 kategori kaku).
53. **Impor akun siswa massal** dari CSV (satu kelas sekaligus).
54. **Reset password pengguna** oleh admin (siswa lupa sandi).
55. **Nonaktifkan akun sementara** (bukan hanya hapus).
56. **Pengumuman global** ke semua pengguna (muncul sekali saat login).
57. **Kelola laporan pengguna** (laporkan produk/chat/ulasan bermasalah).
58. **Ekspor data** pengguna/produk/pesanan ke Excel.
59. **Dashboard: tren pendapatan mingguan/bulanan** (sekarang hanya 7 hari).
60. **Bandingkan unit** (Brital vs Laundry vs Siswa) dalam satu grafik.
61. **Config aplikasi dari UI** (`/app/version` yang sudah ada) — versi minimum,
    pesan paksa update.
62. **Pemeliharaan mode** — tampilkan halaman "sedang diperbaiki" tanpa matikan server.
63. **Verifikasi produk** — admin menandai produk layak jual.
64. **Ikon notifikasi aplikasi** (favicon/PWA) di tab browser.

---

## F. CS & DUKUNGAN

65. 🔥 **Papan tiket CS** dengan balasan (sekarang tiket hanya bisa diubah status).
66. **Pertanyaan umum (FAQ) otomatis** di chat CS — jawab tanpa staf.
67. **Antrean chat CS** — urutkan yang menunggu paling lama.
68. **Ringkasan chat oleh AI** saat eskalasi (staf tak perlu baca semua).
69. **Label/tag chat** (keluhan, pembayaran, teknis) + filter.
70. **Canned response** — balasan siap pakai sekali klik.
71. **Waktu respons rata-rata CS** di laporan.
72. **Terjemahkan istilah teknis** (error) jadi bahasa ramah.

---

## G. KEAMANAN & KEPERCAYAAN

73. 🔥 **6 celah keamanan lama** yang belum ditambal (lintas unit, privilege
    escalation edit produk, staf baca semua chat, `/orders/stats`, pemalsuan
    `/orders/siswa/complete`, spam `/api/chats/rating`).
74. **Verifikasi email/nomor HP** (opsional, untuk pemulihan akun).
75. **2FA sederhana** untuk admin (PIN 6 digit).
76. **Riwayat login** (perangkat, waktu) + "keluar dari semua perangkat".
77. **Sesi aktif** yang bisa dicabut satu per satu.
78. **Batas transaksi harian** per pengguna.
79. **Laporkan produk palsu/mencurigakan** → otomatis masuk moderasi.
80. **Mode aman anak sekolah** — sensor kata di chat & ulasan.

---

## H. TAMPILAN & AKSESIBILITAS

81. 🔥 **Uji & perbaiki tata letak HP** `/chat/[chatId]` (belum tuntas).
82. **Mode gelap** (dark mode) — tema warna sudah rapi, tinggal ditambah.
83. **Perbesar/perkecil ukuran huruf** (aksesibilitas).
84. **PWA** — bisa dipasang di HP seperti aplikasi ("Tambah ke layar utama").
85. **Skema offline** — halaman yang sudah dibuka tetap terbaca tanpa internet.
86. **Gambar placeholder** untuk produk tanpa foto (sekarang kotak kosong).
87. **Muat bertahap (lazy load)** galeri produk + rangka pemuatan (skeleton).
88. **Animasi transisi halaman** halus.
89. **Navigasi keyboard penuh** + fokus terlihat (aksesibilitas).
90. **Teks alternatif (alt)** bermakna untuk semua foto produk.
91. **Tampilan kalender** untuk jadwal laundry/pesanan.
92. **Tata letak padat vs longgar** (pilihan pengguna).

---

## I. KOMUNIKASI & SOSIAL

93. **Bagikan produk** ke WhatsApp/tautan (salin link).
94. **Papan pengumuman sekolah** di halaman Home.
95. **Polling/angket** dari admin (mis. menu baru favorit).
96. **Ranking penjual terbaik** bulanan (papan juara KWU).
97. **Lencana pencapaian** (pembeli aktif, penjual rajin).
98. **Event/bazar sekolah** sebagai produk khusus berjangka waktu.
99. **Tanda "sedang online"** di chat.
100. **Status "sedang menulis"** di chat.
101. **Balas/forward pesan** tertentu di chat.
102. **Pesan suara** di chat.
103. **Grup chat per kelas** (jualan antar kelas).
104. **Tag teman** di produk yang layak dibeli.

---

## J. TEKNIS & PEMELIHARAAN

105. 🔥 **Uji otomatis** (test suite) untuk alur utama — sekarang semua uji manual.
106. **Cadangan database otomatis** harian + unduh cadangan.
107. **Pemantauan**: catat request lambat & error, tampilkan di admin.
108. **Bersihkan berkas & data yatim** berkala (foto tak terpakai).
109. **Pemantauan kuota Catbox** (foto hilang kalau kuota habis).
110. **Mode perawatan** dengan pesan terjadwal.
111. **Uji beban** — berapa pengguna serentak yang sanggup dilayani.
112. **Migrasi schema aman** (sekarang hapus DB & migrate ulang).
113. **Log perubahan versi** di halaman Akun ("apa yang baru").
114. **Hapus Firebase sepenuhnya** — `firestore.rules` tinggal sisa.
115. **Uji cakupan kode** (coverage) agar tahu bagian yang belum diuji.

---

# BAGIAN 3 — SARAN URUTAN PENGERJAAN

**Tahap 1 (perbaikan cepat, 1-2 hari):** A1-A5, A8, B9, B10, A6-A7
→ memperbaiki fitur yang rusak/setengah jalan, tanpa menambah kompleksitas.

**Tahap 2 (keamanan, 2-3 hari):** G73 (6 celah lama) + B11, B12
→ menutup celah yang sudah diketahui.

**Tahap 3 (nilai nyata untuk KWU):** D36, D37, D38, D39, D41, B21, B22
→ langsung terasa oleh siswa & staf unit usaha.

**Tahap 4 (pertumbuhan):** E51, E52, E59, E60, F65, B23
→ memberi admin & penjual alat kerja yang lebih baik.

**Tahap 5 (poles):** H82, H84, H86, H87, I93, I99
→ kenyamanan & kesan profesional.

**Tahap 6 (jangka panjang):** J105-J115
→ kelangsungan hidup proyek.

---

# CATATAN JUJUR

**Jangan kerjakan semuanya.** Daftar ini sengaja banyak karena kamu minta
"harus banyak", tapi memilih sedikit yang benar-benar dipakai jauh lebih
berguna daripada menumpuk 115 fitur yang tak tersentuh.

Tiga yang menurut saya paling berharga untuk sekolah ini:

1. **A1 (tiket bantuan)** — melengkapi fitur yang sudah 90% jadi. CS punya
   layar tapi tak ada isinya; ini aneh dan mudah diperbaiki.
2. **D39 + D41 (laundry)** — laundry adalah unit paling sibuk dan paling
   bergantung pada status pesanan. Konfirmasi pengambilan + riwayat harga
   per kg menghilangkan pekerjaan manual berulang tiap hari.
3. **J105 (uji otomatis)** — saya baru saja menghabiskan waktumu berhari-hari
   karena tidak ada uji otomatis; setiap perubahan berisiko merusak yang lain.
   Ini yang paling tidak terlihat, tapi paling mencegah masalah di masa depan.

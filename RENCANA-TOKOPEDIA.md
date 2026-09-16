# RENCANA ROMBAKAN SkadesMart — "Ala Tokopedia"

Dokumen ini disusun **setelah membedah langsung halaman Tokopedia asli**
(beranda, pencarian, detail produk, toko, promo, ulasan, bantuan, login)
dan membaca pusat edukasi Seller Center Tokopedia.

Tanggal: 16 September 2026 · Versi 1.0

---

# BAGIAN 1 — HASIL BEDAH TOKOPEDIA

## 1.1 Halaman yang berhasil dibedah

| Halaman | Yang ditemukan |
|---|---|
| **Pencarian** | Filter: Kategori, Jenis toko, Lokasi, Harga, Produk/Toko, Urutkan |
| **Detail Produk** | 21 tombol aksi, 3 tab, spesifikasi, breadcrumb, ulasan berbintang |
| **Toko** | Tab Beranda/Produk/Ulasan + Follow + Chat Penjual |
| **Ulasan toko** | Filter Media, Rating, Topik Ulasan, Terbaru, ULASAN PILIHAN |
| **Promo** | Banner geser, tab kategori promo, kupon |
| **Bantuan** | Topik kendala, pertanyaan sering, pencarian bantuan |
| **Login** | Nomor HP/Email → Selanjutnya, QR, Google, TikTok |

## 1.2 Fitur Tokopedia hasil bedah langsung

### Halaman Pencarian (SRP)
- **Filter Kategori** (bertingkat: Dapur → Bekal → Peralatan Masak)
- **Jenis toko**: Mall · Power Shop
- **Lokasi**: DKI Jakarta · Jabodetabek · Bandung · Medan · Surabaya …
- **Harga**: isian Minimum – Maksimum
- **Toggle**: Produk / Toko
- **Urutkan**: Paling Sesuai, Terbaru, Terlaris, Harga Tertinggi/Terendah
- **Info jumlah**: "Menampilkan 1 - 60 barang dari total"
- **Kartu produk berisi**:
  - Persentase diskon (badge merah, 89%)
  - Nama produk
  - Harga coret + harga jual
  - "Hemat s.d 8% Pakai Bonus"
  - Rating bintang (4.9)
  - Jumlah terjual (30+ terjual)
  - Label **PreOrder** / **Bisa COD**
  - Nama toko + lokasi

### Detail Produk (PDP) — 21 tombol
```
+ Keranjang    Beli Langsung    Chat    Wishlist    Share
Tambah 1  /  Kurangi 1   (pengatur jumlah)
Detail Produk  |  Ulasan  |  Rekomendasi     (tab)
Detail Produk  |  Spesifikasi  |  Info Penting  (sub-bagian)
Follow  ·  Laporkan  ·  Scan QR  ·  Lihat Kurir Lainnya
```
**Isi PDP:**
- Breadcrumb: Home › Makanan & Minuman › Bumbu & Bahan Masakan › Aneka Sambal
- Judul + "Terjual 250+"
- Bintang + "4.9 (160 rating)"
- Harga + "Spesial Diskon"
- Panel "Atur jumlah dan catatan" + "Stok Total: 44" + Subtotal
- **Spesifikasi**: Kondisi · Berat Satuan · Min. Beli · Kategori · Etalase
- **Info Penting** / catatan penjual
- Kotak toko: Follow · rating toko · jumlah barang
- Pengiriman: dari mana · ongkir · estimasi tiba + pilihan kurir
- **Ulasan Pembeli**: 4.9/5.0 · % puas · grafik 5★(145) 4★(11) 3★(2) 2★(1) 1★(1)

### Halaman Toko
- Header: nama toko · lokasi · **Follow** · **Chat Penjual** · rating (7.451) · total terjual
- Tab: **Beranda** · **Produk** · **Ulasan**
- "Spesial Diskon" · "Semua Produk" · filter diskon

### Ulasan Toko
- Filter: **Media** · **Rating** · **Topik Ulasan** · **Terbaru**
- **ULASAN PILIHAN** (ulasan unggulan)
- Tombol **Membantu** · **Lihat Balasan** per ulasan

### Promo
- Banner geser (prev/next)
- Tab kategori: Semua Promo · Makanan & Minuman · Kesehatan · Rumah Tangga · Elektronik · Kecantikan
- Kartu promo dengan badge diskon + "Bisa COD" + "PreOrder"

### Bantuan
- "Pilih topik sesuai kendala pembelianmu"
- Daftar pertanyaan sering
- Topik: pembatalan, refund, status kirim, tagihan, akses akun

---

# BAGIAN 2 — FITUR SELLER (dari Seller Center Tokopedia)

## 2.1 Kelola Produk
| Fitur | Keterangan |
|---|---|
| Daftar produk | cari by SKU/kategori/harga |
| Aksi massal | aktif/nonaktif, salin, ubah harga & stok, hapus |
| **Etalase** | kelompokkan produk jadi rak toko |
| **Varian** | maks 2 tingkat, maks 30 varian (warna/ukuran) |
| **Diskon produk** | persen, default 30 hari |
| **Stock Dashboard** | Normal / Low Stock / Out of Stock |
| **Stock Alert** | notifikasi saat stok menipis |
| **Stock History** | riwayat perubahan stok 30 hari |
| **Sales forecast** | perkiraan penjualan 30 hari |
| **Saran restock** | jumlah saran isi ulang |
| **Days of supply** | stok cukup untuk berapa hari |
| Spesifikasi | manfaat, kandungan, cara pakai |
| Pusat Media Produk | kumpulan foto |

## 2.2 Kelola Pesanan
| Fitur | Keterangan |
|---|---|
| Tab **Tindakan yang Diperlukan** | pesanan yang butuh perhatian |
| Cari & filter | SKU, status, tanggal |
| **Ekspor pesanan** | Excel (25+ kolom) |
| Tampilan **Daftar / Kartu** | bisa dipilih |
| Catatan pesanan | |
| Riwayat | pembatalan & pengembalian |

## 2.3 Promosi
| Fitur | Keterangan |
|---|---|
| **Diskon Produk** | persen/nominal |
| **Voucher** | kode, syarat minimum, prioritas |
| **Flash Sale** | waktu terbatas |
| **Beli Lebih Banyak Lebih Hemat** | bertingkat |
| **Campaign produk** | kumpulan produk promo |
| **Smart Promotion** | saran diskon otomatis |

## 2.4 Analitik (Kompas Data)
- Ringkasan data toko
- Performa produk · kartu produk · produk tren
- Pencarian: pengoptimal judul · kata kunci · peringkat
- Marketing: promosi · campaign · program
- Pelanggan: performa IM · pengiriman · ulasan negatif

## 2.5 Rating Toko (6 metrik)
1. Persentase ulasan negatif (1-2 bintang)
2. Tingkat retur/refund karena kesalahan penjual
3. Tingkat pengiriman cepat (FDR)
4. Tingkat keluhan pelanggan
5. Kepuasan produk
6. Waktu penanganan purnajual

## 2.6 Lain-lain
- **Dekorasi Halaman Toko** — banner, produk unggulan, promo
- **Manajemen Akses** — sub-akun dengan peran (produk, pesanan, chat, keuangan)
- **Follow toko** · **Chat Penjual** · **Balas Ulasan**

---

# BAGIAN 3 — RENCANA UNTUK SKADESMART

## 3.1 Kategori jualan siswa (BARU — sesuai permintaan)

> **"kategori jualan siswa hapus aja ganti jadi, minuman, makanan, jasa.
> tapi brital dan laundry tetap"**

| Lama | Baru |
|---|---|
| Brital (ayam geprek) | **Brital** — tetap, unit KWU |
| Laundry | **Laundry** — tetap, unit KWU |
| "Jualan Siswa" (kategori tunggal) | **Minuman** · **Makanan** · **Jasa** (3 kategori) |

**Aturan:**
- Kategori **Minuman, Makanan, Jasa** = untuk siswa perorangan
- **Brital** & **Laundry** = unit KWU resmi (tetap, tidak berubah)
- Product card menampilkan badge kategori
- Filter marketplace: Semua · Brital · Laundry · Minuman · Makanan · Jasa

**Perlu keputusan:** apakah Brital & Laundry juga muncul di filter kategori,
atau hanya sebagai "unit resmi" di beranda? *(lihat Pertanyaan Terbuka)*

## 3.2 Halaman detail produk — WAJIB LENGKAP (permintaan khusus)

Meniru PDP Tokopedia, dengan **kolom database baru**:

| Bagian | Isi | Kolom DB baru |
|---|---|---|
| Foto | galeri + thumbnail, bisa zoom | *(sudah ada 8 foto)* |
| Judul | nama + "Terjual N" | `terjual` |
| Harga | harga + harga coret + % diskon | `harga_asli`, `diskon_persen` |
| Varian | pilihan (level pedas, ukuran, topping) | tabel `product_variants` |
| Stok | stok total + per varian | `stok` *(sudah ada)* |
| Pengatur jumlah | − / + dengan batas stok | *(ada)* |
| Catatan pembeli | kotak catatan per item | *(ada)* |
| Tombol | **+ Keranjang** · **Beli Langsung** · **Chat** · **Wishlist** · **Share** | tabel `wishlist` |
| Spesifikasi | tabel: Kondisi, Berat/Isi, Min. Beli, Kategori, Etalase, Kadaluarsa | `spesifikasi` (JSON) |
| Info Penting | catatan penjual / cara penyajian / alergen | `info_penting` |
| Deskripsi | panjang, minimal 260 karakter | `deskripsi` *(ada)* |
| Etalase | pengelompokan produk | `etalase` |
| Kotak penjual | Follow · rating toko · jumlah produk · Chat | tabel `toko_follow` |
| Ulasan | rating rata-rata + grafik 5★…1★ + filter + foto pembeli | tabel `review_foto` |
| Rekomendasi | produk serupa / dari toko sama | *(query)* |
| Laporkan | laporkan produk bermasalah | tabel `laporan_produk` |
| Breadcrumb | Home › Kategori › Sub | *(query)* |

## 3.3 Dashboard yang WAJIB ada & lengkap

> **"dashboard nya kalo bisa di lengkapin lagi (semua dashboard baik admin cs
> brital dll) wajib mudah untuk di atur dan menejemen"**

| # | Dashboard | Peran | Isi utama |
|---|---|---|---|
| 1 | **Admin** | `admin` | Statistik, pengguna, banner, KWU, config, audit log, kategori |
| 2 | **CS** | `cs` | Antrean tiket, balas, moderasi, FAQ, riwayat |
| 3 | **Brital** | `kwu_brital` | Pesanan, produk, stok, etalase, promo, laporan, buka/tutup |
| 4 | **Laundry** | `kwu_laundry` | Pesanan, status cucian, harga/kg, riwayat, laporan |
| 5 | **Penjual Siswa** ★BARU | `siswa` penjual | **Produk saya, pesanan masuk, stok, statistik, ulasan, chat, etalase** |

### ★ Dashboard Penjual Siswa (baru, permintaan khusus)
> **"dashboard untuk seller siswa (siswa biasa juga harus ada) dan lengkap bisa atur atur"**

Semua siswa otomatis punya dashboard ini. Menu:

```
Ringkasan      statistik: dilihat, terjual, pendapatan, rating
Produk Saya    tambah/edit/hapus · aktif/nonaktif · salin · stok
Pesanan Masuk  baru → diproses → selesai · tolak · catatan
Stok           peringatan stok menipis · riwayat stok
Etalase        kelompokkan produk
Varian         level pedas, ukuran, topping
Promo          diskon · voucher · flash sale
Ulasan         baca & balas ulasan pembeli
Chat Pembeli   balas pesan
Statistik      grafik pengunjung & penjualan
Pengaturan     nama toko, deskripsi, jam buka, foto toko
```

## 3.4 Tema warna dipertahankan + DARK MODE

> **"tema warna nya tetep kaya gitu, terus ada darkmode juga"**

| Aspek | Aturan |
|---|---|
| Warna | **Dipertahankan** — jangan ganti palet merek |
| Dark mode | **Wajib** — tombol di navbar + Akun, ikut setelan sistem |
| Penyimpanan | `localStorage` + `prefers-color-scheme` |
| Cakupan | Semua halaman & dashboard |
| Penerapan | Variabel CSS (`--bg`, `--teks`, `--border`) → ganti sekali, berlaku semua |

## 3.5 Tampilan "terlalu kuno" → ala Tokopedia

| Sebelum | Sesudah |
|---|---|
| Daftar polos | **Grid kartu produk** (2 kolom HP, 4-5 desktop) |
| Filter minimal | **Filter lengkap**: kategori, harga, rating, lokasi, kondisi |
| Tanpa urutan | **Urutkan**: Paling Sesuai · Terbaru · Terlaris · Harga |
| Detail produk miskin | **PDP lengkap** (lihat 3.2) |
| Tanpa tab | **Tab**: Detail Produk · Ulasan · Rekomendasi |
| Tombol kecil | **Tombol besar**: + Keranjang · Beli Langsung |
| Tanpa breadcrumb | **Breadcrumb** navigasi |
| Tanpa badge | **Badge**: diskon %, PreOrder, Terlaris, Stok habis |
| Home sederhana | **Home**: banner geser, kategori bulat, promo, terlaris |

---

# BAGIAN 4 — URUTAN PENGERJAAN

## Tahap 0 — Fondasi (1 hari)
```
0.1  Kolom & tabel DB baru (varian, wishlist, etalase, toko, ulasan foto, audit)
0.2  Variabel CSS tema + dark mode (sekali, berlaku semua)
0.3  Komponen dasar: Kartu Produk, Badge, Tombol, Tab, Breadcrumb, Toast
0.4  Kerangka dashboard (sidebar + mobile navbar) untuk semua peran
```

## Tahap 1 — Kategori & Produk (2 hari)
```
1.1  Ubah kategori: Minuman · Makanan · Jasa (+ Brital · Laundry)
1.2  Form produk baru: spesifikasi, info penting, etalase, varian
1.3  Marketplace: grid, filter, urutkan, pencarian
1.4  Halaman detail produk lengkap (ala Tokopedia)
```

## Tahap 2 — Dashboard Penjual Siswa (2 hari)
```
2.1  Ringkasan statistik
2.2  Produk saya (CRUD + aksi massal)
2.3  Pesanan masuk + ubah status
2.4  Stok · etalase · varian · promo
2.5  Ulasan + balas · chat pembeli · pengaturan toko
```

## Tahap 3 — Dashboard KWU (2 hari)
```
3.1  Brital: pesanan, produk, stok, buka/tutup, laporan
3.2  Laundry: pesanan, status, harga/kg, riwayat
3.3  Antrean bernomor + estimasi waktu
```

## Tahap 4 — Dashboard Admin & CS (2 hari)
```
4.1  Admin: statistik, pengguna, kategori, banner, KWU, config, audit log
4.2  CS: antrean tiket, balas, moderasi, FAQ
```

## Tahap 5 — Fitur pendukung (2 hari)
```
5.1  Wishlist · Share · Follow toko
5.2  Ulasan: foto pembeli, filter media/rating/topik, "Membantu"
5.3  Promo: diskon, voucher, flash sale
5.4  Notifikasi: stok menipis, pesanan baru, ulasan baru
```

## Tahap 6 — Penyelesaian (1 hari)
```
6.1  Dark mode seluruh halaman
6.2  Perbaikan 8 bug P0 (dari PRD.md)
6.3  Uji di browser sungguhan + ukuran HP
6.4  Build produksi + node --check bundel
```

**Total perkiraan: 12 hari kerja**

---

# BAGIAN 5 — YANG DIMINTA vs RENCANA

| Permintaan | Dijawab di |
|---|---|
| Ubah tampilan ala Tokopedia | 3.5 |
| Tema warna tetap | 3.4 |
| Dark mode | 3.4 |
| Dashboard dilengkapi (admin, cs, brital, dll) | 3.3 |
| Semua dashboard mudah diatur & dimanajemen | 3.3 |
| Banyakin fitur seller | 3.3 (Dashboard Penjual Siswa) |
| Kategori: minuman, makanan, jasa | 3.1 |
| Brital & Laundry tetap | 3.1 |
| Dashboard seller siswa (siswa biasa) | 3.3 ★ |
| Halaman detail produk wajib lengkap & banyak | 3.2 ★ |
| Pahami Tokopedia, list semua fiturnya | Bagian 1 & 2 |

---

# BAGIAN 6 — PERTANYAAN TERBUKA

1. **Brital & Laundry di filter kategori?** Muncul sebagai kategori biasa,
   atau dipisah jadi bagian "Unit Resmi"?
2. **Varian untuk makanan** — bentuknya apa? (level pedas / topping / ukuran)
   Untuk **Jasa** (misal jasa titip, desain) variannya apa?
3. **Wishlist** — perlu? Tokopedia punya, tapi di sekolah mungkin jarang dipakai.
4. **Voucher & Flash Sale** — perlu? Ini butuh staf memantau waktu promo.
5. **Ongkir/kurir** — Tokopedia pakai kurir. Di sekolah: ambil sendiri,
   diantar ke kelas, atau antar ke kantin? Ini perlu alur sendiri.
6. **Ulasan berfoto** — siswa boleh unggah foto ulasan?
7. **Follow toko** — perlu, atau cukup "Favorit"?
8. **Etalase** — siswa perlu mengelompokkan produk? (misal "Minuman Dingin")
9. **Sub-akun** — staf KWU bergilir; perlu akun terpisah, atau tetap per-peran?
10. **Warna merek** — palet persisnya apa? (kode warna) untuk saya jadikan
    variabel CSS light & dark.

---

**Akhir dokumen — rencana v1.0**

# RENCANA FINAL — SkadesMart "Ala Tokopedia"

Dokumen ini **men jawab** semua pertanyaan dari `RENCANA-TOKOPEDIA.md` dan
**mengunci keputusan** dari pemilik produk.

Tanggal: 16 September 2026 · Versi 2.0 (FINAL — siap dikerjakan)

---

# BAGIAN 1 — KEPUTUSAN YANG SUDAH DIKUNCI

| # | Pertanyaan | Keputusan pemilik produk |
|---|---|---|
| 1 | Brital & Laundry di filter kategori? | **Masuk filter kategori biasa** |
| 2 | Varian produk? | **Seller bisa tambah varian sendiri** di dashboard |
| 3 | Wishlist? | **Ada** |
| 4 | Voucher? | **Ada**, dibuat **admin/CS**, **terikat unit** (Brital / Laundry) |
| 5 | Alur pengiriman? | **Tetap seperti sekarang** (ambil/diantar internal sekolah) |
| 6 | Ulasan berfoto? | **Boleh**, pakai **Catbox** (sama seperti upload produk) |
| 7 | Follow toko? | **Boleh follow toko DAN follow akun lain** |
| 8 | Etalase? | **Ada** (bagus) |
| 9 | Staf KWU bergilir? | **Peran diubah manual** oleh admin/CS setiap hari |
| 10 | Palet warna? | **Ambil dari landing page & home page yang ada** |

## 1.1 Fitur BARU yang belum tercantum sebelumnya

### ★ Chat KWU — satu ruang, banyak staf (permintaan khusus)

> **"chat kwu bisa di akses siapa aja yang punya role kwu. Misal laundry, mau
> tanya apakah udah selesai, nanti yang bisa akses yang role kwu semua.
> Jadi 1to beberapa akun. Cuma nanti role kwu yang balas punya tag misal
> -isan. Nah nanti otomatis -isan itu ada sesuai nama akun yang balas."**

**Cara kerja:**

```
Siswa  →  kirim pesan ke "KWU Laundry"
              ↓
     SATU ruang chat (chat bersama)
              ↓
  SEMUA akun ber-role kwu_laundry bisa membuka & membalas
              ↓
  Staf yang membalas → pesannya otomatis diberi tag nama akun:
       "-isan   Sebentar ya kak, pesanan lagi di buat"
       "-sari   Sudah selesai kak, bisa diambil"
```

**Aturan teknis:**
- Tabel `chats` tipe baru: **`kwu`** (selain `pribadi` & `cs` yang sudah ada)
- Satu ruang per unit → **`chats` unik per `kwu_unit_id`**
- Semua pengguna ber-role `kwu_*` melihat daftar chat unit **yang sama**
- Setiap pesan dari staf KWU disimpan dengan `pengirim_id` asli
- **Tag `-nama` muncul otomatis** saat dirender (dari `users.nama`)
- Staf lain juga melihat tag itu → tahu siapa yang sudah menjawab
- Riwayat: siapa membalas apa, tersimpan (untuk audit)

**Tampilan:**
```
┌──────────────────────────────────────────┐
│ KWU Laundry · 3 staf bertugas            │
├──────────────────────────────────────────┤
│ Anak Sholeh: cucian saya sudah selesai?  │
│                                          │
│ -isan  Sebentar ya kak, sedang dicuci    │
│ -sari  Sudah selesai kak, bisa diambil   │
│                                          │
│ Anak Sholeh: siap kak, makasih 🙏        │
├──────────────────────────────────────────┤
│ [ tulis balasan sebagai -sari ...]  Kirim│
└──────────────────────────────────────────┘
```

### ★ Pembagian Tugas CS vs Admin (KEPUTUSAN FINAL)

> **"Admin+cs bisa ngatur 22 nya. CS buat lebih ke masalah siswa.
> Admin ke semua masalah di website."**

**Prinsip:** CS **bidangnya luas tapi dangkal** (fokus siswa); Admin **seluas mungkin dan dalam** (seluruh website).

| Wewenang | CS | Admin |
|---|---|---|
| Lihat pengguna | ✅ | ✅ |
| Bantu masalah siswa | ✅ | ✅ |
| **Ubah peran → `siswa`** | ✅ | ✅ |
| **Ubah peran → `kwu_brital`** | ✅ | ✅ |
| **Ubah peran → `kwu_laundry`** | ✅ | ✅ |
| **Ubah peran → `cs`** | ❌ | ✅ |
| **Ubah peran → `admin`** | ❌ | ✅ |
| Reset password siswa | ✅ | ✅ |
| Nonaktifkan akun siswa | ✅ | ✅ |
| Tiket bantuan | ✅ | ✅ |
| Moderasi ulasan & produk | ✅ | ✅ |
| Voucher (Brital/Laundry) | ✅ | ✅ |
| FAQ | ✅ | ✅ |
| Kelola kategori | ❌ | ✅ |
| Kelola banner | ❌ | ✅ |
| Tarif & konfigurasi KWU | ❌ | ✅ |
| Audit log | ❌ | ✅ |
| Config aplikasi | ❌ | ✅ |
| Cadangan & pemeliharaan | ❌ | ✅ |

**Alasan batas ini:**
CS **tidak boleh** mengubah peran menjadi `cs` atau `admin` — kalau boleh,
CS bisa **membuat admin baru** dan menaikkan dirinya sendiri
(*privilege escalation*). Ini celah keamanan, bukan sekadar soal rapi.

**Di kode sekarang:** `cs.ts` sudah `requireRole(["cs","admin"])` (benar),
`admin.ts` masih `requireRole(["admin"])` (perlu ditambah `cs`,
lalu di dalam rute dibatasi tingkat perannya).

**Catatan penting soal piket harian:** CS boleh mengubah peran ke
`kwu_brital`/`kwu_laundry` — inilah yang membuat **piket harian bisa
diatur CS tanpa melibatkan admin**. Tapi perubahan ini **wajib tercatat
di audit log** (siapa, kapan, dari peran apa ke apa).

### ★ Kategori (final)

| Kategori | Jenis | Siapa yang jual |
|---|---|---|
| **Brital** | Unit KWU | Staf Brital |
| **Laundry** | Unit KWU | Staf Laundry |
| **Minuman** | Siswa | Siswa perorangan |
| **Makanan** | Siswa | Siswa perorangan |
| **Jasa** | Siswa | Siswa perorangan |

Semua **5 kategori muncul di filter marketplace**. Brital & Laundry
diberi badge "Unit Resmi".

---

# BAGIAN 2 — PALET WARNA (diambil dari kode yang ada)

Sumber: `frontend/app/globals.css` + `tailwind.config.ts`
(dipakai nyata di landing page `app/page.tsx` & home `app/home/page.tsx`)

## 2.1 Warna merek — TIDAK DIUBAH

| Token | Kode | Peran |
|---|---|---|
| `electric` | **#5196fe** | Biru utama (aksi, tautan, tombol) |
| `electric-600` | #3a7ce0 | Biru gelap (hover) |
| `electric-100` | #dce9ff | Biru muda (latar sorot) |
| `electric-50` | #eef5ff | Biru sangat muda |
| `ember` | **#f9754e** | Oranye aksen (badge, penekanan) |
| `ember-600` | #e35f39 | Oranye gelap |
| `ink` | **#1b1d20** | Hitam teks utama |
| `midnight` | #101828 | Hitam kebiruan |
| `paper` | #ffffff | Putih kartu |
| `parchment` | #f2f1ec | Krem latar |
| `sand` | #e1dfd8 | Garis/border |
| `graphite` | #27272a | Abu gelap |
| `steel` | #6e6e6e | Abu teks sekunder |
| `ash` | #797876 | Abu |
| `fog` | #a3a3a3 | Abu terang |

Bentuk: `borderRadius` card **24px**, input/badge **12.8px**.
Font: **Inter**.

## 2.2 Variabel tema (BARU) — untuk dark mode

Mengganti **cara mengakses** warna, bukan warnanya:

```css
:root {                             /* TERANG (sekarang) */
  --bg-halaman:  #f2f1ec;   /* parchment */
  --bg-kartu:    #ffffff;   /* paper */
  --bg-sorot:    #eef5ff;   /* electric-50 */
  --teks-utama:  #1b1d20;   /* ink */
  --teks-kedua:  #6e6e6e;   /* steel */
  --teks-samar:  #a3a3a3;   /* fog */
  --garis:       #e1dfd8;   /* sand */
  --aksi:        #5196fe;   /* electric */
  --aksi-hover:  #3a7ce0;   /* electric-600 */
  --aksen:       #f9754e;   /* ember */
  --naik:        #16a34a;   /* hijau - stok aman, selesai */
  --turun:       #dc2626;   /* merah - stok habis, batal */
  --peringatan:  #f59e0b;   /* kuning - stok menipis */
}

[data-tema="gelap"] {               /* GELAP (baru) */
  --bg-halaman:  #101828;   /* midnight */
  --bg-kartu:    #1b1d20;   /* ink */
  --bg-sorot:    #1e2939;
  --teks-utama:  #f2f1ec;   /* parchment */
  --teks-kedua:  #a3a3a3;   /* fog */
  --teks-samar:  #6e6e6e;   /* steel */
  --garis:       #27272a;   /* graphite */
  --aksi:        #6ea8ff;   /* electric-400 - lebih terang agar kontras */
  --aksi-hover:  #8fbdff;   /* electric-300 */
  --aksen:       #f9754e;   /* ember tetap */
  --naik:        #4ade80;
  --turun:       #f87171;
  --peringatan:  #fbbf24;
}
```

**Warna merek (electric & ember) tetap sama** — hanya versi terangnya
yang disesuaikan supaya tetap terbaca di latar gelap.

**Cara ganti tema:** `document.documentElement.dataset.tema = "gelap"` +
simpan di `localStorage["tema"]` + hormati `prefers-color-scheme` bila
pengguna belum pernah memilih.

---

# BAGIAN 3 — DAFTAR HAL YANG DIROMBAK

## 3.1 Struktur halaman

| Sekarang (28 halaman) | Rencana |
|---|---|
| landing, login | tetap, dirapikan |
| home, marketplace | **ditulis ulang** ala Tokopedia |
| product/[id] | **ditulis ulang** — PDP lengkap |
| product/add, edit, saya | **ditulis ulang** — bentuk seller |
| cart, orders/status, chat, chat/[id] | diperbarui |
| account, profile, rating | diperbarui |
| **BARU** `shop/[id]` | halaman toko (ala Tokopedia) |
| **BARU** `wishlist` | daftar simpanan |
| **BARU** `etalase/[nama]` | rak produk |
| **BARU** `seller/*` | **dashboard penjual siswa (10 menu)** |
| **BARU** `seller/chat` | chat pembeli |
| dashboard admin/cs/brital/laundry | dilengkapi |

## 3.2 Marketplace — ala Tokopedia

```
┌───────────────────────────────────────────────────┐
│  [Cari produk...]                    [Keranjang]  │
├───────────────────────────────────────────────────┤
│  Kategori:  Semua · Brital · Laundry ·            │
│             Minuman · Makanan · Jasa              │
├───────────────────────────────────────────────────┤
│  Filter: [Kategori] [Harga] [Rating] [Kondisi]    │
│  Urutkan: [Paling Sesuai ▾]    60 produk          │
├───────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│  │ [foto] │ │ [foto] │ │ [foto] │ │ [foto] │     │
│  │ -30%   │ │        │ │ -15%   │ │ [Habis]│     │
│  │ Geprek │ │ Es Teh │ │ Jasa   │ │ Nasi   │     │
│  │ Rp12rb │ │ Rp3rb  │ │ Rp5rb  │ │ Rp10rb │     │
│  │ Rp17rb │ │        │ │        │ │        │     │
│  │ ★4.9   │ │ ★4.8   │ │ ★5.0   │ │ ★4.5   │     │
│  │ 100+   │ │ 50+    │ │ 10+    │ │ 20+    │     │
│  │ terjual│ │ terjual│ │ terjual│ │ terjual│     │
│  │ Brital │ │ Minuman│ │ Jasa   │ │ Makanan│     │
│  │ Sleman │ │ Sleman │ │ Sleman │ │ Sleman │     │
│  └────────┘ └────────┘ └────────┘ └────────┘     │
│      [ 1 ] 2  3  4  ...                        │
└───────────────────────────────────────────────────┘
```

**Fitur filter:** Kategori (5) · Harga min-maks · Rating ·
Kondisi · Lokasi/kantin · **Produk/Toko** (toggle)
**Urutkan:** Paling Sesuai · Terbaru · Terlaris · Harga Terendah/Tertinggi · Rating

## 3.3 Halaman Detail Produk — lengkap (permintaan khusus)

```
Home › Makanan › Ayam Geprek                          (breadcrumb)

┌──────────────────┬────────────────────────────────────────┐
│  [Foto besar]    │ Ayam Geprek Sambel Korek                │
│  ┌──┐┌──┐┌──┐   │ Terjual 250+                            │
│  │  ││  ││  │   │ ★ 4.9 (160 rating)                      │
│  └──┘└──┘└──┘   │ ┌─────────────────────────────────────┐ │
│  (8 foto)        │ │ -30%  Rp12.000                      │ │
│                  │ │       Rp 17.000  (coret)            │ │
│                  │ └─────────────────────────────────────┘ │
│                  │                                         │
│                  │ Varian:                                 │
│                  │ Level pedas: [1][2][3][4][5]            │
│                  │ Topping: [Keju +3rb][Telur +5rb]        │
│                  │                                         │
│                  │ ┌─ Atur jumlah dan catatan ───────────┐ │
│                  │ │  [−]  2  [+]     Stok Total: 44     │ │
│                  │ │  Catatan: [pedas banget ya___]      │ │
│                  │ │  Subtotal            Rp 24.000      │ │
│                  │ └─────────────────────────────────────┘ │
│                  │                                         │
│                  │ [ + Keranjang ]  [ Beli Langsung ]      │
│                  │ [ Chat ] [ ♡ Wishlist ] [ Share ]       │
│                  └─────────────────────────────────────────┘

┌─ Toko ────────────────────────────────┐
│ Brital (Unit Resmi)                   │
│ ★ 4.9 (7.451) · 110 produk            │
│ [ Ikuti Toko ]  [ Chat Penjual ]      │
└───────────────────────────────────────┘

[ Detail Produk ] [ Spesifikasi ] [ Info Penting ]

Spesifikasi              Info Penting
 Kondisi    : Baru        • Dibuat setelah dipesan
 Isi        : 1 porsi     • Bisa request tanpa sambal
 Berat      : ±300 g      • Alergen: mengandung telur
 Min. Beli  : 1 Buah
 Kategori   : Makanan
 Etalase    : Semua Etalase
 Kadaluarsa : Sama hari

Deskripsi produk (minimal 260 karakter) ...

[ Ulasan ] [ Rekomendasi ]

ULASAN PEMBELI
  ★ 4.9 / 5.0     97% pembeli merasa puas
  160 rating · 28 ulasan
  5 ████████████ 90.63% (145)
  4 ██            6.88% (11)
  3 ▌             1.25% (2)
  2 ▌             0.63% (1)
  1 ▌             0.63% (1)

  Filter: [Media] [Rating] [Topik] [Terbaru]

  ┌─────────────────────────────────────────┐
  │ Anak Sholeh · ★5 · 2 hari lalu          │
  │ Pedasnya mantap, sambelnya nampol 🔥    │
  │ [foto1] [foto2]                         │
  │ 👍 Membantu (12)   [ Lihat Balasan ]    │
  │ └ Brital: Terima kasih kak! 🙏          │
  └─────────────────────────────────────────┘

Rekomendasi: produk serupa dari toko lain ...
Ada masalah? [ Laporkan ]
```

## 3.4 Chat KWU — 1 ruang, banyak staf

*(lihat Bagian 1.1 untuk alur lengkap)*

**Yang dibangun:**
- Tabel: `chats.tipe` nilai baru `kwu`, unik per unit
- Daftar chat untuk staf KWU: **semua staf lihat ruang yang sama**
- Balasan otomatis bertag `-nama_akun`
- Tanda "sedang dibalas oleh -sari" (opsional, biar tidak tabrakan)
- Riwayat siapa membalas apa

## 3.5 Voucher (admin/CS, terikat unit)

```
Admin/CS → Dashboard Voucher → Buat Voucher
  Kode        : GEPREK50
  Jenis       : Persen / Nominal
  Nilai       : 50%  atau  Rp5.000
  Min. belanja: Rp20.000
  Unit        : [ Brital ] [ Laundry ] [ Semua ]
  Berlaku     : 17 Sep - 24 Sep
  Kuota       : 100
  Aktif       : ya/tidak
```

**Siswa** masukkan kode di keranjang/checkout → potongan otomatis dihitung.
Hanya berlaku untuk produk unit yang sesuai.

## 3.6 Ulasan berfoto (Catbox)

- Pembeli bisa unggah **maks 5 foto** per ulasan
- Lewat Catbox (fungsi upload yang sudah ada)
- Foto tampil di ulasan + filter **"Media"**
- Penjual bisa **balas ulasan**

## 3.7 Follow (toko & akun)

- **Ikuti Toko** → dapat kabar saat ada produk baru
- **Ikuti Akun** → tombol di halaman profil & halaman toko
- Halaman **"Diikuti"** di akun: daftar toko & akun yang diikuti
- Jumlah pengikut tampil di halaman toko

## 3.8 Etalase

- Penjual buat rak: "Minuman Dingin", "Menu Favorit", "Barang Bekas"
- Atur urutan & pilih produk per rak
- Tampil di halaman toko sebagai tab/filter

## 3.9 Manajemen Peran Harian (staf KWU bergilir)

Admin/CS punya halaman **Kelola Peran**:
```
Cari pengguna → [ NISN / nama ]
Ubah peran: ( ) siswa  ( ) kwu_brital  ( ) kwu_laundry  ( ) cs  ( ) admin
Catatan: "piket Brital hari ini"
[ Simpan ]  → tercatat di audit log
```
- Bisa **banyak akun** ber-role sama (1 unit → beberapa staf)
- Riwayat perubahan peran tersimpan

---

# BAGIAN 4 — DASHBOARD (semua peran, lengkap)

## 4.1 ★ Dashboard Penjual Siswa (BARU — siswa biasa)

```
┌ Ringkasan ────────────────────────────────────────┐
│ Dilihat hari ini 128 · Terjual 12 · Rp 156.000   │
│ Menunggu diproses 3 · Ulasan baru 2              │
└──────────────────────────────────────────────────┘

Produk Saya     tabel + aksi massal (aktif/salin/hapus)
Pesanan Masuk   baru → diproses → selesai · tolak
Stok            peringatan menipis · riwayat stok
Etalase         kelompokkan produk jadi rak
Varian          level/topping/ukuran bebas
Promo           diskon produk · lihat voucher unit
Ulasan          baca · balas · tandai membantu
Chat Pembeli    balas pesan
Statistik       grafik 7/30 hari: dilihat, terjual, pendapatan
Pengaturan      nama toko · deskripsi · jam buka · foto toko
Diikuti         toko & akun yang diikuti
Wishlist        produk yang disimpan
```

## 4.2 Dashboard Brital & Laundry

```
Ringkasan      pesanan hari ini · pendapatan · antrean
Pesanan        baru → diproses → diantar → selesai (Brital)
               dicuci → bisa diambil → diambil (Laundry)
Produk         CRUD · stok · varian · etalase
Stok           menipis/habis · saran restock
Buka/Tutup     status toko harian
Promo          voucher unit
Laporan        harian/mingguan · ekspor Excel
Chat Unit      ★ 1 ruang bersama semua staf KWU
Pengaturan     jam operasional · tarif (laundry per kg)
```

**Tambahan khusus Laundry:** harga per kg · estimasi selesai ·
konfirmasi pengambilan (menutup bug status menggantung)
**Tambahan khusus Brital:** antrean bernomor · estimasi siap

## 4.3 Dashboard Admin

```
Ringkasan      statistik seluruh sekolah
Pengguna       cari · tambah · ubah peran ★ · nonaktifkan
Kelola Peran   ★ piket harian KWU
Kategori       kelola 5 kategori
Produk         moderasi seluruh produk
Pesanan        pantau semua unit
Voucher        ★ buat & kelola (terikat unit)
Banner         kelola carousel
KWU            tarif laundry · jam buka
Laporan        ekspor Excel · rekap kas
Audit Log      ★ siapa mengubah apa
Config         versi app · pemeliharaan
```

## 4.4 Dashboard CS

```
Antrean Tiket    baru · diproses · selesai
Balas Tiket      balas + ubah status
Chat             moderasi chat
Moderasi         ulasan & produk dilaporkan
FAQ              kelola pertanyaan sering
Voucher          ★ ikut mengelola
Kelola Peran     ★ ikut mengelola
Laporan          tiket & keluhan
```

---

# BAGIAN 5 — FONDASI TEKNIS (Tahap 0)

## 5.1 Tabel & kolom database baru

```sql
-- Kategori jadi banyak (ganti 'jualan_siswa' → 3 kategori)
-- products.kategori: brital | laundry | minuman | makanan | jasa

-- Varian
product_variants (id, product_id, nama_varian, nilai, harga_tambahan, stok)

-- Etalase
etalase (id, seller_id, nama, urutan)
etalase_produk (etalase_id, product_id)

-- Promo & voucher
vouchers (id, kode, jenis, nilai, min_belanja, unit, mulai, selesai,
          kuota, terpakai, aktif, dibuat_oleh)
product_discounts (id, product_id, persen, mulai, selesai)

-- Sosial
wishlist (id, user_id, product_id, dibuat)
toko_follow (id, follower_id, seller_id, dibuat)
toko_profil (seller_id, nama_toko, deskripsi, foto, jam_buka)

-- Ulasan
review_foto (id, rating_id, url_foto)
review_balasan (id, rating_id, penjual_id, teks, dibuat)

-- Chat KWU
-- chats.tipe: 'pribadi' | 'cs' | 'kwu'  (BARU: 'kwu')
-- chats unik untuk (kwu_unit_id) saat tipe='kwu'

-- Laporan & audit
laporan_produk (id, product_id, pelapor_id, alasan, status, dibuat)
audit_log (id, aktor_id, aksi, tabel, record_id, sebelum, sesudah, dibuat)
```

## 5.2 Komponen dasar baru

```
KartuProduk     kartu grid ala Tokopedia (badge, harga coret, rating, terjual)
Badge           diskon% · PreOrder · Terlaris · Habis · Unit Resmi
Tab             Detail Produk / Ulasan / Rekomendasi
Breadcrumb      navigasi bertingkat
PengaturJumlah  [−] n [+] dengan batas stok
Bintang         tampilan rating
GrafikUlasan    batang 5★…1★
Toast           notifikasi ringan
Dialog          konfirmasi
KerangkaTabel   tabel dengan filter, urut, halaman
ToggleTema      tombol terang/gelap
```

## 5.3 Batasan yang tetap dipatuhi

| Aturan | |
|---|---|
| **9router jangan dimatikan** (port 20128) | tetap |
| Semua ikon **SVG**, tanpa emoji di UI | tetap |
| Desktop sidebar / mobile navbar bawah | tetap |
| Uji butuh-login lewat **HTTPS publik** | tetap |
| Uji di **browser sungguhan**, bukan cuma Node | tetap |

---

# BAGIAN 6 — URUTAN KERJA (14 hari)

| Tahap | Isi | Hari |
|---|---|---|
| **0** | Fondasi: DB, variabel tema + dark mode, komponen dasar | 2 |
| **1** | Kategori 5 + marketplace (grid, filter, urut) | 2 |
| **2** | **Detail produk lengkap** + varian + ulasan foto | 2 |
| **3** | **Dashboard penjual siswa** (11 menu) | 3 |
| **4** | **Chat KWU 1-ruang-banyak-staf** + tag nama | 2 |
| **5** | Voucher · follow · etalase · wishlist | 2 |
| **6** | Dashboard Admin & CS (termasuk Kelola Peran) | 2 |
| **7** | Dark mode penuh · 8 bug P0 · uji browser | 1 |

---

# BAGIAN 7 — RINGKASAN YANG DIROMBAK

| Area | Dari | Ke |
|---|---|---|
| Marketplace | daftar polos | grid kartu + filter + urut |
| Detail produk | sederhana | **PDP lengkap 20 bagian** |
| Kategori | Brital · Laundry · Jualan Siswa | **Brital · Laundry · Minuman · Makanan · Jasa** |
| Varian | tidak ada | **bebas dibuat seller** |
| Dashboard siswa | hanya "Produk Saya" | **dashboard penjual 11 menu** |
| Chat KWU | per akun | **1 ruang bersama + tag `-nama`** |
| Voucher | tidak ada | **ada, terikat unit, dibuat admin/CS** |
| Ulasan | teks saja | **+ foto (Catbox) + balasan penjual** |
| Follow | tidak ada | **ikuti toko & akun** |
| Etalase | tidak ada | **ada** |
| Wishlist | tidak ada | **ada** |
| Dark mode | tidak ada | **ada** |
| Peran KWU | tetap | **diubah manual tiap hari (piket)** |
| Tema warna | — | **DIPERTAHANKAN** (electric #5196fe, ember #f9754e) |

---

**Akhir dokumen — rencana final v2.0**

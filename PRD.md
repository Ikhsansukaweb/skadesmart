# PRD — SkadesMart

**Product Requirements Document**
Marketplace Internal SMKN 1 Depok Sleman

| | |
|---|---|
| Versi dokumen | 1.0 |
| Tanggal | 16 September 2026 |
| Status | Untuk ditinjau |
| Pemilik produk | Muhammad Ikhsan Setiawan |
| Pengguna utama | Siswa, Staf KWU, CS, Admin SMKN 1 Depok Sleman |

---

# 1. RINGKASAN EKSEKUTIF

## 1.1 Masalah

Sekolah punya **dua unit KWU resmi** (Ayam Geprek Brital & Laundry) dan
**jualan bebas antar siswa**. Saat ini pencatatan pesanan, komunikasi pembeli,
dan pemantauan status dilakukan **manual** — pesanan ditulis di kertas, pembeli
harus bertanya langsung, dan tidak ada satu tempat untuk melihat status.

## 1.2 Solusi

**SkadesMart** — aplikasi web satu pintu untuk seluruh transaksi jual-beli
internal sekolah:

- Siswa memesan sendiri lewat aplikasi, tanpa bertanya ke staf
- Status pesanan terlihat realtime (diproses → diantar → selesai)
- Chat langsung dengan penjual / unit KWU / CS
- Staf KWU mengelola pesanan & stok dari dashboard

## 1.3 Sasaran (OKR — kuartal pertama)

| Sasaran | Ukuran keberhasilan |
|---|---|
| Kurangi beban tanya-jawab manual | ≥70% status pesanan dilihat sendiri di aplikasi |
| Percepat layanan KWU | Pesanan Brital selesai <15 menit rata-rata |
| Kurangi kesalahan catat | 0 pesanan tercatat ganda |
| Tingkat penggunaan | ≥60% siswa aktif memakai ≥1×/minggu |
| Kepuasan | Rating rata-rata unit ≥4,3 dari 5 |

## 1.4 Bukan cakupan (non-goals)

- Pembayaran daring / dompet digital → transaksi tetap **tunai di sekolah**
- Pengiriman ke luar sekolah → hanya **lingkup sekolah**
- Menggantikan sistem akademik sekolah
- Aplikasi mobile native (Android/iOS) → cukup **web + PWA**

---

# 2. PENGGUNA & PERAN

## 2.1 Peta pengguna

| Peran | Siapa | Volume | Kebutuhan utama |
|---|---|---|---|
| `siswa` | Murid SMKN 1 Depok | ±1000 | Beli, lacak pesanan, chat, jualan |
| `kwu_brital` | Staf unit Brital | ±6 (bergilir) | Kelola pesanan & produk, buka/tutup toko |
| `kwu_laundry` | Staf unit Laundry | ±6 (bergilir) | Catat & lacak cucian |
| `cs` | Customer service | ±3 | Moderasi, tiket, balas chat |
| `admin` | Pengelola sistem | 1-2 | Kelola pengguna, konten, konfigurasi |

## 2.2 Catatan penting soal staf KWU

Staf KWU **bergilir setiap hari** (±6 orang per unit). Karena itu:

- Akses pesanan & chat berbasis **PERAN**, bukan akun pribadi
- Siapa pun yang bertugas hari ini bisa memproses pesanan mana pun di unitnya
- Riwayat "siapa memproses" tetap dicatat di audit log

## 2.3 Persona

**Anak Sholeh (Siswa, 16 thn)**
Jam istirahat 15 menit. Mau beli geprek tanpa mengantre lama. Tidak sabar
mengisi formulir panjang. Membuka aplikasi dari HP.

> "Saya cuma mau tahu geprek saya sudah jadi atau belum, tanpa harus tanya."

**Bu Sari (Staf Laundry)**
Menerima 30+ potong pakaian per hari, bergantian shift dengan 5 staf lain.
Butuh mencatat cepat, dan tahu siapa yang sudah mengambil cuciannya.

> "Kalau ada 3 tumpuk pakaian, saya tidak boleh salah menyerahkan."

**Mas Danang (Admin)**
Satu-satunya pengelola sistem. Butuh melihat masalah tanpa harus bertanya
ke pengguna.

> "Kalau ada yang salah, saya perlu tahu apa yang terjadi, bukan menebak."

---

# 3. ALUR PENGGUNA UTAMA

## 3.1 Alur 1 — Beli Brital (pesan langsung)

```
Siswa buka /home
  → pilih produk di Marketplace
  → buka detail produk
  → isi jumlah + catatan ("pedas level 3")
  → tekan "Pesan Langsung"
  → pesanan dibuat (status: baru, belum bayar)
  → [Siswa] pantau di /orders/status
  → [Staf] pesanan masuk /dashboard/brital/orders
  → [Staf] ubah → diproses
  → [Staf] ubah → diantar  → push: "Siapkan uang Rp15.000"
  → [Staf] ubah → selesai
  → [Siswa] beri rating
```

**Titik gagal:** stok berubah saat siswa lain membeli serentak.
**Titik gagal:** siswa tidak tahu berapa lama harus menunggu.

## 3.2 Alur 2 — Beli Brital (keranjang)

```
Siswa tambahkan beberapa produk ke keranjang
  → buka keranjang (atau /cart)
  → sesuaikan jumlah & catatan per item
  → checkout
  → pesanan dibuat + order_items (snapshot nama & harga)
```
**Titik gagal:** keranjang menerima jumlah melebihi stok.

## 3.3 Alur 3 — Laundry (datang fisik)

```
Siswa datang ke ruang KWU Laundry
  → staf cari siswa lewat NISN
  → staf isi jumlah potong / berat / total / catatan
  → pesanan dibuat (status: dicuci)
  → staf ubah → bisa_diambil  → push ke siswa
  → siswa ambil pakaian
  → [SELESAI?] ← hari ini tidak ada langkah ini
```
**Titik gagal:** status menggantung di `bisa_diambil` selamanya.

## 3.4 Alur 4 — Chat & bantuan

```
Siswa buka chat (dari produk / profil / menu Chat)
  → chat dengan penjual perorangan, ATAU unit KWU
  → chat ke akun CS: dibalas BOT AI
  → siswa ketik "1" → eskalasi ke CS manusia
  → CS balas dari /cs/chat
```

## 3.5 Alur 5 — Jualan siswa (informal)

```
Penjual tayangkan produk (/product/add)
  → pembeli chat penjual
  → nego & COD di sekolah
  → PENJUAL menandai transaksi selesai  ← hanya sepihak
  → pembeli dapat kartu rating
```
**Titik gagal:** pembeli tidak pernah menyetujui transaksi.

---

# 4. KEBUTUHAN FUNGSIONAL

## 4.1 Sudah ada (BASELINE — jangan diubah tanpa alasan)

| # | Fitur | Status |
|---|---|---|
| F-01 | Login NISN 5 digit + JWT httpOnly | ✅ |
| F-02 | Ganti password | ✅ |
| F-03 | Marketplace: kategori, cari, urut | ✅ |
| F-04 | Produk + galeri hingga 8 foto | ✅ |
| F-05 | Keranjang (+catatan per item) | ⚠️ tanpa validasi stok |
| F-06 | Checkout Brital (keranjang & langsung) | ✅ |
| F-07 | Pesanan Laundry oleh staf | ⚠️ tanpa konfirmasi ambil |
| F-08 | Chat realtime 1:1 & per-unit | ✅ |
| F-09 | Bot AI CS + eskalasi ke manusia | ✅ |
| F-10 | Web Push (VAPID) | ✅ |
| F-11 | Rating per pesanan + moderasi | ⚠️ rata-rata salah |
| F-12 | Banner carousel | ✅ |
| F-13 | Dashboard staf + grafik 7 hari | ✅ |
| F-14 | Admin: pengguna, banner, KWU | ✅ |
| F-15 | Buka/tutup toko manual | ✅ |
| F-16 | Notifikasi on/off dari Akun | ✅ |

## 4.2 PERBAIKAN (P0 — kerjakan lebih dulu)

| ID | Kebutuhan | Kenapa | Kriteria terima |
|---|---|---|---|
| **P-01** | Tombol **Buat Tiket Bantuan** di Akun, endpoint `POST /cs/tickets` | Tabel `cs_tickets` ada, layar CS ada, tapi **tak ada jalan masuk** — tiket kosong selamanya | Siswa buat tiket → muncul di `/cs` → status bisa diubah |
| **P-02** | **Validasi stok** di keranjang & checkout | Bisa pesan 500 pcs padahal stok 5 | `qty > stock` → 400 dengan sisa stok |
| **P-03** | Perbaiki **`avg_rating` & `rating_count`** | Bintang di kartu produk sering kosong | Kolom tersimpan di DB, diperbarui saat rating dibuat/dihapus |
| **P-04** | Perbaiki **`/product/[id]` muter selamanya** | Halaman rusak bila produk tidak ada | Produk tak ada → tampil "Produk tidak ditemukan" + tombol kembali |
| **P-05** | **Selaraskan tab "Dikirim"** dengan status `diantar` | Filter tab selalu kosong | Tab "Dikirim" menampilkan pesanan `diantar` |
| **P-06** | **Konfirmasi pengambilan laundry** oleh siswa | Status menggantung selamanya | Siswa tekan "Sudah Diambil" → status `selesai` |
| **P-07** | **Dropdown status hanya transisi sah** di dashboard KWU | Staf bisa lompat status tidak wajar | Hanya transisi berikutnya yang muncul |
| **P-08** | **Pesan error ramah** di `/cs/chat` & `/chat/<id>` | Error mentah membingungkan | Tampil pesan berbahasa manusia |

## 4.3 FITUR BARU (P1 — nilai tinggi, usaha sedang)

| ID | Kebutuhan | Untuk | Kriteria terima |
|---|---|---|---|
| **N-01** | **Antrean bernomor Brital** | Siswa tahu urutannya | Nomor tampil setelah pesan + di status pesanan |
| **N-02** | **Estimasi waktu siap** Brital | Siswa tahu harus tunggu berapa lama | Staf set menit → siswa lihat "siap ±10 menit" |
| **N-03** | **Struk / bukti pesanan cetak** | Bukti serah terima | Tombol cetak → halaman siap cetak (Brital & Laundry) |
| **N-04** | **Riwayat harga laundry per kg** | Harga resmi, bukan teks bebas | Admin/staf set harga → tampil otomatis di Home |
| **N-05** | **Konfirmasi terima pesanan oleh pembeli** (jualan siswa) | Sekarang penjual menandai selesai sendiri | Pembeli tekan "Pesanan Diterima" → baru bisa rating |
| **N-06** | **Stok berkurang otomatis** saat pesanan dibuat | Stok sekarang tidak berubah | Stok turun saat pesanan dibuat, kembali bila dibatalkan |
| **N-07** | **Riwayat pesanan lengkap** + filter tanggal | Sekarang hanya judul + harga | Rincian item, total, filter rentang tanggal |
| **N-08** | **Beli Lagi** dari riwayat | Mengulang pesanan lama | Tombol → item masuk keranjang |
| **N-09** | **Favorit produk** | Menyimpan produk untuk nanti | Ikon hati → halaman "Disimpan" |
| **N-10** | **Audit log** | Sekarang perubahan role tak meninggalkan jejak | Catat siapa-mengubah-apa-kapan; tampil di admin |
| **N-11** | **Kelola kategori produk** | Sekarang hanya 2 kategori kaku | Admin bisa tambah/ubah kategori |
| **N-12** | **Balasan tiket CS** | Tiket hanya bisa diubah status | CS bisa membalas; siswa melihat balasan |
| **N-13** | **Estimasi posisi antrean laundry** | Siswa tak tahu kapan siap | Tampil posisi & perkiraan selesai |
| **N-14** | **Kalkulator biaya laundry** | Hitung mandiri sebelum datang | Masukkan kg → muncul total |

## 4.4 FITUR BARU (P2 — nilai baik, boleh menyusul)

Pencarian bersaran otomatis · Filter harga & stok · Riwayat pencarian ·
Jumlah dilihat/terjual · Notifikasi harga turun · Statistik penjual ·
Varian produk · Diskon/promo · Bundling · Label produk · Balas ulasan ·
QR code produk · Jadwal buka otomatis · Laporan harian otomatis ·
Rekap kas mingguan (Excel) · Laporan pengguna · Ekspor data ·
Impor akun CSV · Reset password oleh admin · Nonaktifkan akun ·
Pengumuman global · Tren pendapatan bulanan · Bandingkan unit ·
Mode pemeliharaan · FAQ otomatis · Label/tag chat · Balasan siap pakai ·
Riwayat login · Cabut sesi · Sesi aktif

## 4.5 FITUR BARU (P3 — jangka panjang)

Dark mode · PWA · Mode offline · Animasi transisi · Mode padat · Lencana ·
Ranking penjual · Polling/angket · Bagikan produk · Pesan suara ·
Balas/forward pesan · Grup chat per kelas · Tanda online · Tanda menulis ·
2FA admin · Verifikasi HP · Uji otomatis · Cadangan DB otomatis ·
Pemantauan request · Hapus Firebase

---

# 5. KEBUTUHAN NON-FUNGSIONAL

| Aspek | Target | Cara ukur |
|---|---|---|
| **Kecepatan** | Halaman tampil <2 s (4G sekolah) | Lighthouse / WebPageTest |
| **Realtime** | Pesan & status sampai <1 s | Uji dua arah |
| **Ketersediaan** | ≥99% jam sekolah (06.00–18.00) | Pemantauan PM2 |
| **Keamanan** | 0 celah kritis; 6 celah lama ditambal | Uji penetrasi ulang |
| **Ukuran HP** | Berfungsi penuh di 360×640 | Uji nyata di HP |
| **Aksesibilitas** | Semua fungsi tercapai keyboard; kontras ≥4,5:1 | Uji manual + Axe |
| **Batasan desain** | **Tanpa emoji di UI** — semua ikon SVG | Pemeriksaan kode |
| **Timezone** | Tampilan `Asia/Jakarta`; DB UTC | Uji lintas hari |
| **Bahasa** | Indonesia, sapaan ramah siswa | Tinjauan konten |

---

# 6. KEBUTUHAN TEKNIS

## 6.1 Tumpukan saat ini

| Lapisan | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind |
| Backend | Express + TypeScript |
| Database | SQLite (better-sqlite3) — **sumber kebenaran** |
| Realtime | WebSocket sendiri (pengganti Firebase) |
| Push | Web Push VAPID (pengganti FCM) |
| Berkas | Upload ke Catbox |
| Auth | JWT httpOnly + `token_version` |
| Proses | PM2 (`skades-backend`:3737, `skades-frontend`:3000, `skades-tunnel`) |

## 6.2 Batasan yang WAJIB dipatuhi

| # | Aturan | Alasan |
|---|---|---|
| B-1 | **Jangan matikan proses `9router` (port 20128)** | Milik layanan lain |
| B-2 | Jangan `pkill -f next-server` — matikan berdasarkan **PID** | Ikut mematikan 9router |
| B-3 | Jangan simpan kredensial di kode/uji — baca dari `.env` | Kebocoran |
| B-4 | Jangan `npm run dev` untuk SkadesMart | CSP memblokir WebSocket lokal |
| B-5 | Uji halaman butuh-login **wajib lewat HTTPS publik** | Cookie `SameSite=None; Secure` |
| B-6 | `NEXT_PUBLIC_API_URL` sudah berakhir `/api` | Jangan tambah `/api` lagi |
| B-7 | **Semua ikon SVG, tanpa emoji** di UI | Aturan desain |
| B-8 | Navigasi: desktop sidebar / mobile navbar bawah 5 tab | Aturan desain |
| B-9 | Navbar disembunyikan **hanya** di detail chat mobile | Aturan desain |
| B-10 | Perubahan `schema.sql` → hapus DB & migrate ulang | `IF NOT EXISTS` tak ALTER |

## 6.3 Utang teknis yang diketahui

| # | Utang | Risiko |
|---|---|---|
| T-1 | Tidak ada uji otomatis | Setiap perubahan bisa merusak yang lain |
| T-2 | Migrasi = hapus DB | Data hilang bila dilakukan di produksi |
| T-3 | `firestore.rules` tinggal sisa | Kebingungan; Firebase sudah tak dipakai |
| T-4 | `useSearchParams` wajib `Suspense` (Next 16) | Build gagal bila terlewat |
| T-5 | Turbopack pernah merusak hasil minify | Bundel rusak walau sumber & tsc bersih |
| T-6 | Gambar dari Catbox bisa hilang | Kuota habis → foto hilang |

---

# 7. PRIORITAS & JADWAL

## 7.1 Prinsip prioritas

```
P0  Perbaikan bug & fitur setengah jalan  → dahulukan, risiko kecil
P1  Fitur bernilai tinggi untuk KWU       → setelah P0
P2  Pertumbuhan & kenyamanan              → sesuai permintaan
P3  Poles & jangka panjang                → bila ada waktu
```

## 7.2 Rencana bertahap

| Tahap | Isi | Perkiraan | Hasil |
|---|---|---|---|
| **1** | P-01 … P-08 | 2 hari | 8 fitur rusak/tidur menjadi berfungsi |
| **2** | Tambal 6 celah keamanan lama | 2 hari | 0 celah kritis |
| **3** | N-01, N-02, N-03, N-06, N-13, N-14 | 3 hari | KWU Brital & Laundry jauh lebih cepat |
| **4** | N-05, N-07, N-08, N-09, N-10, N-11 | 3 hari | Admin & penjual punya alat kerja |
| **5** | N-12, N-04, P2 pilihan | 3 hari | CS & konten lengkap |
| **6** | PWA, dark mode, uji otomatis | 4 hari | Tahan lama & enak dipakai |

## 7.3 Yang TIDAK dianjurkan dikerjakan

| Fitur | Alasan |
|---|---|
| D36 layar status di kantin | Butuh perangkat fisik & kebiasaan baru — tanya staf dulu |
| I103 grup chat per kelas | Memecah komunikasi; bisa jadi sarana tidak terkendali |
| G75 2FA admin | Satu admin di sekolah; menambah friksi tanpa ancaman nyata |
| Pembayaran daring | **Di luar cakupan** — transaksi tunai di sekolah |

---

# 8. KRITERIA TERIMA (Definition of Done)

Satu fitur dinyatakan **selesai** hanya bila **semuanya** terpenuhi:

```
✅ Berfungsi sesuai kriteria terima
✅ Diuji di BROWSER SUNGGUHAN (bukan hanya skrip Node)
✅ Diuji di ukuran HP (360×640) DAN desktop
✅ Tidak merusak fitur lain (uji regresi: login, chat, pesanan, keranjang)
✅ Tanpa emoji — semua ikon SVG
✅ Semua input divalidasi di backend (Zod)
✅ Endpoint mutasi terlindungi auth + role
✅ Pesan error berbahasa Indonesia yang ramah
✅ Build produksi sukses + `node --check` pada bundel
✅ Tidak menyentuh proses 9router
```

> **Catatan penting dari pengalaman:** bug CSRF sebelumnya lolos **5 kali**
> verifikasi karena hanya diuji dari Node. Node tidak punya Same-Origin Policy,
> sehingga selalu melaporkan "berhasil". **Pengujian wajib lewat browser.**

---

# 9. RISIKO

| Risiko | Dampak | Pencegahan |
|---|---|---|
| Staf KWU enggan memakai dashboard | Fitur sepi | Libatkan 2-3 staf sejak awal; uji coba sehari |
| Siswa lupa password | Beban CS | Reset oleh admin (P2) |
| Foto Catbox hilang | Produk tanpa gambar | Placeholder + pantau kuota |
| DB hilang saat migrasi | **Kehilangan data** | Cadangan otomatis sebelum migrate |
| Perubahan merusak fitur lain | Aplikasi mati saat jam sekolah | Uji regresi + uji otomatis |
| Koneksi sekolah lambat/putus | Aplikasi tak terpakai | Ringankan halaman; PWA offline |

---

# 10. LAMPIRAN

## 10.1 Endpoint yang sudah ada (76)

`auth` 6 · `products` 6 · `cart` 5 · `orders` 11 · `ratings` 3 · `chat` 13 ·
`admin` 6 · `cs` 6 · `kwu` 4 · `account` 5 · `banners` 5 · `upload` 2 ·
`users` 3 · `app` 1

## 10.2 Tabel database (12)

`users` · `kwu_units` · `products` · `product_images` · `cart_items` ·
`orders` · `order_items` · `chats` · `chat_messages` · `ratings` ·
`cs_tickets` · `banners` · `app_config` · `push_subscriptions`

## 10.3 Status pesanan

**Brital & Siswa:** `baru` → `diproses` → `diantar` → `selesai` (atau `dibatalkan`)
**Laundry:** `dicuci` → `bisa_diambil` → `selesai`

## 10.4 Akun uji

NISN 10001–10010 · password di `backend/.env` (`DUMMY_PASSWORD`)
10001 = admin "Anak Sholeh"

## 10.5 Berkas terkait

- `USULAN-FITUR.md` — 115 usulan fitur (bahan mentah PRD ini)
- `CATATAN-PELAJARAN.md` — pelajaran teknis (CSRF, pengujian browser)
- `SECURITY_AUDIT_*.md` — laporan audit keamanan
- `AGEN-AUDIT-ATURAN.md` — aturan audit

---

# 11. PERTANYAAN TERBUKA

Perlu jawaban dari pemilik produk sebelum tahap 3:

1. **Antrean bernomor Brital** — apakah staf sanggup memanggil nomor, atau
   lebih baik cukup estimasi waktu?
2. **Harga laundry per kg** — berapa tarif resminya? Apakah berjenjang
   (reguler/ekspres)?
3. **Jualan siswa** — perlu konfirmasi pembeli (N-05), atau memang
   kesepakatan lisan sudah cukup?
4. **Struk cetak** — apakah sekolah punya printer di kantin/laundry?
5. **Data siswa** — apakah NISN & kelas boleh diimpor massal dari
   data sekolah (N-kuat), atau siswa mendaftar sendiri?
6. **Batas waktu ambil laundry** — apakah ada batas hari sebelum dikenakan
   biaya tambahan?
7. **Zona waktu laporan** — laporan harian mengikuti tanggal sekolah atau
   tanggal kalender?
8. **Siapa yang mengelola konten** — admin merangkap CS, atau ada guru
   penanggung jawab KWU?

---

**Akhir dokumen — versi 1.0**

# SkadesMart

Marketplace internal SMKN 1 Depok Sleman: unit KWU (Ayam Geprek Brital & Laundry) plus jualan bebas antar siswa, dalam satu aplikasi web.

- Backend: Express.js + TypeScript + SQLite (better-sqlite3)
- Frontend: Next.js 14 (App Router) + Tailwind CSS
- Realtime: Firebase (Firestore untuk chat & status pesanan, FCM untuk push notification)
- Upload gambar: Catbox.moe (lewat backend, userhash tidak pernah ke client)
- Auth: JWT di httpOnly cookie + Firebase Custom Token sebagai jembatan ke Firestore

## Struktur folder

```
skadesmart/
├── backend/         Express API + SQLite
├── frontend/         Next.js App Router
└── firestore.rules   Security Rules Firestore (chat & orders_status)
```

## 1. Setup Firebase

1. Buat project Firebase baru (atau pakai project yang sudah ada) dengan **Firestore** dan **Cloud Messaging** aktif.
2. Firebase Console > Project Settings > Service Accounts > Generate new private key. Simpan file JSON-nya sebagai `backend/config/firebase-service-account.json` (folder ini sudah di-gitignore, jangan pernah commit file ini).
3. Firebase Console > Cloud Messaging > Web Push certificates > generate VAPID key, salin ke `NEXT_PUBLIC_FIREBASE_VAPID_KEY` di `.env.local` frontend.
4. Deploy `firestore.rules` ke project Firebase kamu (lewat Firebase CLI: `firebase deploy --only firestore:rules`, atau paste manual di Firebase Console > Firestore > Rules).
5. Salin config web app Firebase (`firebaseConfig`) ke `.env.local` frontend, dan ke `frontend/public/firebase-messaging-sw.js` (service worker tidak bisa baca env Next.js, jadi nilainya ditulis manual di file tersebut — update kalau config berubah).

## 2. Setup Catbox

1. Buat akun di https://catbox.moe (opsional tapi disarankan supaya file tidak dihapus otomatis).
2. Ambil userhash dari halaman akun Catbox, isi ke `CATBOX_USERHASH` di `.env` backend.

## 2b. Setup AI CS Bot

Chat dengan akun CS otomatis dibalas bot AI (lewat endpoint OpenAI-compatible, misal LiteLLM/Ollama gateway lokal) sampai siswa ketik `1` untuk pindah ke CS manusia. Isi di `backend/.env`:

```
AI_BASE_URL=http://localhost:20128/v1
AI_API_KEY=isi_api_key_kamu
AI_MODEL=isan
```

Kalau env ini kosong/gagal dihubungi, bot otomatis membalas pesan fallback yang tetap mengarahkan ke "ketik 1" - fitur chat tetap jalan normal, cuma tanpa balasan pintar.

## 3. Menjalankan Backend

```bash
cd backend
cp .env.example .env
# edit .env: isi JWT_SECRET, CATBOX_USERHASH, FIREBASE_SERVICE_ACCOUNT_PATH, dst.
npm install
npm run migrate   # inisialisasi schema SQLite (data/skadesmart.db)
npm run dev        # jalan di http://localhost:4000
```

Build untuk produksi:
```bash
npm run build
npm start
```

## 4. Menjalankan Frontend

```bash
cd frontend
cp .env.local.example .env.local
# edit .env.local: isi NEXT_PUBLIC_FIREBASE_* dan NEXT_PUBLIC_API_URL
npm install
npm run dev   # jalan di http://localhost:3000
```

Build untuk produksi:
```bash
npm run build
npm start
```

## 5. Login pertama kali (sistem dummy)

Login pakai skema NISN + password. **NISN wajib 5 digit angka.** Kalau NISN
belum terdaftar, login akan gagal dengan pesan untuk mendaftar dulu lewat
halaman Register (`/register`) - tidak ada lagi auto-create akun dari NISN
sembarangan, dan password yang salah akan ditolak (401), bukan diterima asal
isi. Ini beda dari versi sebelumnya yang sempat auto-register + terima
password apa saja (sudah diperbaiki).

Untuk membuat akun admin pertama, daftar/login dulu sebagai siswa biasa lalu
jalankan query manual di database:

```bash
cd backend
sqlite3 data/skadesmart.db "UPDATE users SET role = 'admin' WHERE nisn = 'NISN_KAMU';"
```

Dari situ, role user lain (termasuk penjual `kwu_brital` / `kwu_laundry` dan
`cs`) bisa diatur langsung dari Admin Dashboard (`/admin`).

10 akun dummy siap pakai lewat `npm run seed` (di folder `backend/`), semua
NISN 5 digit (10001-10010), password sama untuk semua: `smkn1`.

## 6. Deploy ke VPS ("Jarvis")

1. Clone/upload folder `backend/` dan `frontend/` ke VPS.
2. Install Node.js (LTS), lalu `npm install` + `npm run build` di masing-masing folder.
3. Jalankan keduanya dengan `pm2`:
   ```bash
   cd backend && pm2 start dist/server.js --name skadesmart-api
   cd ../frontend && pm2 start npm --name skadesmart-web -- start
   ```
4. Pasang reverse proxy (Nginx) untuk domain kamu, arahkan `/api` ke port backend (default 4000) dan sisanya ke port frontend (default 3000). Pastikan `FRONTEND_URL` di `.env` backend dan `NEXT_PUBLIC_API_URL` di `.env.local` frontend sesuai domain produksi (pakai HTTPS supaya cookie `secure` jalan).

## Catatan arsitektur penting

- **SQLite adalah sumber kebenaran** untuk users, products, orders, ratings. Firestore hanya dipakai untuk dua hal yang butuh realtime: isi pesan chat (`chats/{id}/messages`) dan mirror status pesanan (`orders_status/{orderId}`) supaya siswa tidak perlu refresh manual.
- Setiap login berhasil, backend membuat **Firebase Custom Token** berisi `user_id` DAN klaim `role` (`admin.auth().createCustomToken(String(user_id), { role })`). Klaim `role` inilah yang dipakai Firestore Security Rules untuk mengizinkan **chat & produk milik unit KWU** (Ayam Geprek Brital, Laundry) diakses siapa pun staf dengan role yang cocok — bukan cuma satu akun tertentu — karena staf KWU biasanya bergantian tiap hari (~6 orang). Kalau role seseorang diubah admin, staf itu perlu logout/login ulang (atau tunggu sesi Firebase-nya di-refresh otomatis) supaya klaim rolenya ikut ter-update.
- Chat sekarang punya dua mode: **1:1 biasa** (`seller_id` terisi — jualan siswa, chat ke profil orang) dan **milik unit** (`unit_slug` terisi — chat ke KWU Brital/Laundry, dibalas siapa pun staf yang shift). Satu chat room per pasangan (buyer, seller) atau per (buyer, unit) — dicek dua arah supaya tidak dobel.
- Produk kategori `kwu_brital` bisa dikelola (edit/hapus/ubah stok) oleh **siapa pun** dengan role `kwu_brital`, bukan cuma akun yang pertama kali membuatnya. Produk kategori `siswa` tetap murni milik akun pembuatnya.
- Semua endpoint mutasi (POST/PUT/DELETE) divalidasi dengan Zod di `backend/src/validators/`, dan endpoint sensitif (login, upload) dibatasi rate limiter lebih ketat.
- Tidak ada emoji di UI — semua ikon pakai `lucide-react` (SVG), sesuai aturan desain.

## Perubahan schema — migrasi ulang wajib

Setiap kali `backend/src/db/schema.sql` berubah (termasuk update ini — tabel baru `banners`), database lama **harus dihapus dan di-migrate ulang** karena migrasi ini pakai `CREATE TABLE IF NOT EXISTS` (tidak otomatis `ALTER TABLE` skema lama):

```bash
cd backend
rm -f data/skadesmart.db*
npm run migrate
npm run seed   # opsional, isi ulang 10 akun dummy
```

## Desain & branding

- **Landing page** (`/`) — halaman publik sebelum login, pakai desain tersendiri (Electric Blue/Ember/Ink/Parchment, font Inter + Source Serif 4 italic aksen). User yang sudah login otomatis diarahkan ke `/home`.
- **Logo tunggal** (cuma logo SkadesMart) dipakai di Navbar, Home, dan header Landing Page.
- **Logo ganda** (SMK Negeri 1 Depok Sleman × SkadesMart berdampingan) khusus di Footer, sebagai identitas resmi unit usaha sekolah.
- **Banner geser** di Home Page dikelola penuh dari Admin Dashboard → Kelola Banner (`/admin/banners`): upload gambar, atur judul, link tujuan, urutan tampil, dan aktif/nonaktifkan. Tidak muncul sama sekali kalau belum ada banner aktif.
- **Dashboard** (Admin/CS/KWU Brital/KWU Laundry) pakai layout sidebar khusus (`DashboardShell` + `DashboardSidebar`) di layar besar (≥1024px), dengan bagian "Menu Utama" (Beranda/Marketplace/Chat/Akun) supaya staf tidak terjebak tanpa jalan keluar dari dashboard. Desain widget/section dashboard itu sendiri tidak diubah dari yang sudah ada.

# skadesmart

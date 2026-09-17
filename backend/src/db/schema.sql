-- SkadesMart SQLite schema (v2)
-- Data transaksional utama. Firestore hanya lapisan realtime (chat & mirror status).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nisn          TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  class_name    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'siswa'
                CHECK (role IN ('siswa','kwu_brital','kwu_laundry','cs','admin')),
  profile_photo_url TEXT,
  banner_url    TEXT,
  -- Buka/tutup toko manual (khusus staf kwu_brital/kwu_laundry). Saat tutup,
  -- produk unit itu tidak bisa dipesan dan ditandai "Tutup" di marketplace.
  shop_open     INTEGER NOT NULL DEFAULT 1,
  fcm_token     TEXT,
  notif_enabled INTEGER NOT NULL DEFAULT 1,
  -- Nomor versi token sesi. Nilai ini ikut ditulis ke dalam JWT saat login,
  -- lalu dicocokkan setiap permintaan. Kalau nilainya dinaikkan (logout, ganti
  -- kata sandi, atau akun dinonaktifkan), SEMUA token lama otomatis tidak sah.
  -- Tanpa ini, JWT tetap berlaku sampai kedaluwarsa meski pengguna sudah logout.
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kwu_units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE, -- 'kwu_brital' | 'kwu_laundry'
  name        TEXT NOT NULL,
  description TEXT,
  -- Info cara pesan (dipakai banner "Cara Pesan Laundry" di Home/Marketplace,
  -- karena laundry TIDAK punya listing produk - pemesanan dilakukan langsung
  -- datang ke tempat, bukan lewat marketplace).
  how_to_order TEXT,
  price_info    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Produk hanya untuk kwu_brital dan jualan bebas siswa. Laundry sengaja TIDAK
-- punya produk/listing (lihat kwu_units.how_to_order untuk banner info).
--
-- Kategori (final, bagian 1.1 "Rombakan ala Tokopedia"):
--   brital   = unit KWU Ayam Geprek Brital (staf Brital)
--   laundry  = unit KWU Laundry (jasa; staf Laundry)
--   minuman  = jualan bebas siswa
--   makanan  = jualan bebas siswa
--   jasa     = jualan bebas siswa
-- Nilai lama ('kwu_brital','siswa') tetap diterima agar basis data lama tidak
-- langsung error; migrasi v3 memetakannya ke kategori baru.
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('brital','laundry','minuman','makanan','jasa','barang','kwu_brital','siswa')),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url   TEXT, -- foto sampul (diambil dari product_images pertama)
  is_active   INTEGER NOT NULL DEFAULT 1,
  terjual     INTEGER NOT NULL DEFAULT 0, -- jumlah terjual (ala Tokopedia)
  harga_asli  INTEGER,                    -- harga sebelum diskon (coret)
  spesifikasi TEXT,                       -- spesifikasi produk (JSON/teks)
  info_penting TEXT,                      -- info penting produk
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Galeri foto produk, mendukung banyak foto (2,3,4,5+) sesuai kebutuhan penjual.
CREATE TABLE IF NOT EXISTS product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);

-- Keranjang belanja untuk unit KWU Brital (checkout multi-produk sekaligus).
CREATE TABLE IF NOT EXISTS cart_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note        TEXT, -- request khusus siswa untuk item ini (misal: "pedas level 3")
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);

-- Pesanan (order) - dipakai untuk DUA alur berbeda:
--  1) kwu_brital: dibuat SISWA (langsung/dari keranjang), berisi order_items.
--     status: baru -> diproses -> diantar -> selesai (atau dibatalkan)
--  2) kwu_laundry: dibuat STAF kwu_laundry atas nama siswa (siswa datang
--     langsung ke tempat), TIDAK ada order_items (jasa, bukan produk).
--     status: dicuci -> bisa_diambil -> selesai
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kwu_unit      TEXT NOT NULL CHECK (kwu_unit IN ('kwu_brital','kwu_laundry','siswa')),
  status        TEXT NOT NULL DEFAULT 'baru'
                CHECK (status IN ('baru','diproses','diantar','dicuci','bisa_diambil','selesai','dibatalkan')),
  payment_status TEXT NOT NULL DEFAULT 'belum_bayar' CHECK (payment_status IN ('belum_bayar','sudah_bayar')),
  note          TEXT,          -- brital: request siswa. laundry: catatan staf (misal jenis pakaian).
  quantity      INTEGER,       -- dipakai laundry: jumlah potong pakaian. NULL untuk brital (lihat order_items).
  weight_kg     REAL,          -- dipakai laundry saja
  total_price   INTEGER NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);

-- Item pesanan Brital (snapshot nama & harga saat dipesan, supaya histori
-- tidak berubah walau produk aslinya diedit/dihapus setelahnya).
CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name  TEXT NOT NULL,
  unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Metadata chat saja. Isi pesan (termasuk foto) disimpan realtime di
-- Firestore chats/{chatId}/messages.
CREATE TABLE IF NOT EXISTS chats (
  id            TEXT PRIMARY KEY,      -- dipakai juga sebagai Firestore doc id (chats/{id})
  buyer_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- seller_id: chat 1:1 biasa (jualan siswa, chat ke profil spesifik).
  -- unit_slug: chat MILIK UNIT KWU (bukan individu) - siapa pun staf dengan
  -- role kwu_brital/kwu_laundry yang sedang shift bisa baca & balas thread
  -- yang sama, karena staf bergantian tiap hari (biasanya 6 orang).
  -- Tepat salah satu dari dua kolom ini yang terisi.
  seller_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  unit_slug     TEXT CHECK (unit_slug IN ('kwu_brital','kwu_laundry')),
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  last_message  TEXT,
  last_sender_id INTEGER,
  last_message_at TEXT,
  -- Senyapkan notifikasi push per sisi (dipakai menu titik-tiga di chat).
  muted_by_buyer  INTEGER NOT NULL DEFAULT 0,
  muted_by_seller INTEGER NOT NULL DEFAULT 0,
  -- Khusus chat dengan akun CS: 'ai' = dibalas bot otomatis, 'human' = sudah
  -- dieskalasi ke staf CS manusia (siswa ketik "1" untuk pindah ke sini).
  cs_mode         TEXT NOT NULL DEFAULT 'ai' CHECK (cs_mode IN ('ai','human')),
  -- tipe: jenis percakapan (bagian 1.1 & 5.1 "Rombakan ala Tokopedia").
  --   'pribadi' = chat 1:1 biasa (jualan siswa / chat ke profil orang)
  --   'cs'      = chat dengan akun CS (dibalas bot lalu staf manusia)
  --   'kwu'     = chat MILIK UNIT KWU. Ruang ini BUKAN milik satu akun staf:
  --               SEMUA akun ber-role kwu_brital/kwu_laundry berbagi ruang
  --               yang sama, sehingga staf bergilir (piket harian) tetap bisa
  --               membaca & membalas percakapan yang sama. Setiap pesan staf
  --               tetap disimpan dengan `pengirim_id` asli (lihat
  --               chat_messages.sender_id) supaya tag "-nama" bisa dirender
  --               otomatis dari users.full_name.
  tipe            TEXT NOT NULL DEFAULT 'pribadi' CHECK (tipe IN ('pribadi','cs','kwu')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((seller_id IS NOT NULL AND unit_slug IS NULL) OR (seller_id IS NULL AND unit_slug IS NOT NULL)),
  UNIQUE (buyer_id, seller_id)
);
CREATE INDEX IF NOT EXISTS idx_chats_buyer_id ON chats(buyer_id);
CREATE INDEX IF NOT EXISTS idx_chats_seller_id ON chats(seller_id);
CREATE INDEX IF NOT EXISTS idx_chats_unit_slug ON chats(unit_slug);

-- Rating terikat ke order (bukan cuma produk), supaya laundry (yang tidak
-- punya produk) tetap bisa dirating. product_id NULL untuk rating laundry.
CREATE TABLE IF NOT EXISTS ratings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kwu_unit    TEXT NOT NULL CHECK (kwu_unit IN ('kwu_brital','kwu_laundry','siswa')),
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  is_hidden   INTEGER NOT NULL DEFAULT 0, -- moderasi CS
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id) -- satu pesanan cuma bisa dirating sekali
);
CREATE INDEX IF NOT EXISTS idx_ratings_seller_id ON ratings(seller_id);
CREATE INDEX IF NOT EXISTS idx_ratings_product_id ON ratings(product_id);

CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cs_tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Banner geser (carousel) di Home Page, dikelola admin lewat dashboard.
-- Klik banner opsional mengarah ke link (misal ke produk/promosi tertentu).
CREATE TABLE IF NOT EXISTS banners (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url   TEXT NOT NULL,
  title       TEXT,
  link_url    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(is_active, sort_order);

INSERT OR IGNORE INTO kwu_units (slug, name, description, how_to_order, price_info) VALUES
  ('kwu_brital', 'Ayam Geprek Brital', 'Unit usaha kuliner ayam geprek SMKN 1 Depok Sleman', NULL, NULL),
  ('kwu_laundry', 'Laundry', 'Unit usaha jasa laundry SMKN 1 Depok Sleman',
   '1. Datang langsung ke tempat laundry sekolah.
2. Serahkan pakaianmu ke petugas KWU Laundry.
3. Petugas akan mencatat data pesananmu ke sistem.
4. Pantau status cucian lewat halaman Status Pesanan di akunmu.
5. Ambil pakaian setelah status berubah menjadi "Bisa Diambil".',
   'Hubungi petugas Laundry langsung di tempat untuk info harga per kg.');

INSERT OR IGNORE INTO app_config (key, value) VALUES
  ('latest_version', '1.0.0'),
  ('min_supported_version', '1.0.0'),
  ('force_update', 'false'),
  ('update_message', 'Versi terbaru tersedia.');

-- ============================================================================
-- Pesan chat - pengganti Firestore chats/{chatId}/messages
--
-- Sebelumnya isi percakapan disimpan di Firestore. Sekarang di SQLite supaya
-- tidak bergantung pada layanan pihak ketiga dan tidak kena kuota.
-- id dibuat TEXT (bukan auto-increment) karena frontend lama memakai id
-- berupa string; ini menjaga kompatibilitas tautan dan data lama.
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
id          TEXT PRIMARY KEY,
chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
sender_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
-- 'teks' = pesan biasa, 'sistem' = pemberitahuan otomatis dari server
jenis       TEXT NOT NULL DEFAULT 'teks',
-- 1 = pesan ini dihasilkan Bot CS, 0 = dari manusia. Dipakai frontend untuk
-- menampilkan label "Bot" di atas bubble.
is_ai       INTEGER NOT NULL DEFAULT 0,
-- Bila pesan ini kartu ajakan menilai, simpan id pesanannya supaya tautan
-- "Beri rating" bisa dibuat ulang setelah halaman dimuat ulang.
order_id    TEXT,
-- Tautan foto yang dikirim bersama pesan (hasil upload Catbox). NULL = pesan
-- teks biasa. Sebelumnya kolom ini tidak ada, sehingga foto yang dikirim
-- pengguna tidak pernah tersimpan dan tampil sebagai kotak putih kosong.
image_url   TEXT,
isi         TEXT NOT NULL,
-- 0 = belum dibaca penerima. Dipakai untuk lencana jumlah pesan belum dibaca.
sudah_dibaca INTEGER NOT NULL DEFAULT 0,
created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_belum ON chat_messages(chat_id, sudah_dibaca);

-- ============================================================================
-- Langganan Web Push (VAPID) - pengganti Firebase Cloud Messaging
--
-- Satu baris = satu perangkat. Endpoint bersifat unik dari browser, jadi
-- dipakai sebagai kunci alami untuk mencegah langganan ganda.
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
id          INTEGER PRIMARY KEY AUTOINCREMENT,
user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
endpoint    TEXT NOT NULL UNIQUE,
p256dh      TEXT NOT NULL,
auth        TEXT NOT NULL,
created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- ============================================================================
-- SKEMA BARU v3 - "Rombakan ala Tokopedia"
-- Ditambahkan 16 Sep 2026. Semua pakai IF NOT EXISTS sehingga aman dijalankan
-- berulang kali pada basis data yang sudah berisi data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VARIAN PRODUK - penjual bisa menambah varian sendiri dari dashboard.
-- Contoh: "Level Pedas" -> 1,2,3,4,5 ; "Topping" -> Keju, Telur
-- Satu produk boleh punya beberapa kelompok varian (nama_varian), dan tiap
-- kelompok punya beberapa pilihan (nilai).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  nama_varian    TEXT NOT NULL,              -- "Level Pedas", "Ukuran", "Topping"
  nilai          TEXT NOT NULL,              -- "3", "Large", "Keju"
  harga_tambahan INTEGER NOT NULL DEFAULT 0, -- 0 = tidak menambah harga
  stok           INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  aktif          INTEGER NOT NULL DEFAULT 1,
  urutan         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_varian_produk ON product_variants(product_id);

-- ----------------------------------------------------------------------------
-- ETALASE - penjual mengelompokkan produk jadi "rak" di halaman tokonya.
-- Contoh: "Minuman Dingin", "Menu Favorit", "Barang Bekas"
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etalase (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nama       TEXT NOT NULL,
  urutan     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (seller_id, nama)
);
CREATE INDEX IF NOT EXISTS idx_etalase_seller ON etalase(seller_id);

CREATE TABLE IF NOT EXISTS etalase_produk (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  etalase_id  INTEGER NOT NULL REFERENCES etalase(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  urutan      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (etalase_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_etalase_produk_etalase ON etalase_produk(etalase_id);

-- ----------------------------------------------------------------------------
-- VOUCHER - dibuat admin/CS, TERIKAT UNIT (brital atau laundry).
-- Voucher Brital tidak bisa dipakai untuk produk Laundry, dan sebaliknya.
-- unit = 'kwu_brital' | 'kwu_laundry' | 'semua'
-- jenis = 'persen' (nilai 1-100) | 'nominal' (nilai dalam rupiah)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kode          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  jenis         TEXT NOT NULL CHECK (jenis IN ('persen','nominal')),
  nilai         INTEGER NOT NULL CHECK (nilai > 0),
  min_belanja   INTEGER NOT NULL DEFAULT 0 CHECK (min_belanja >= 0),
  unit          TEXT NOT NULL DEFAULT 'semua'
                CHECK (unit IN ('kwu_brital','kwu_laundry','semua')),
  mulai         TEXT,
  selesai       TEXT,
  kuota         INTEGER,                 -- NULL = tanpa batas
  terpakai      INTEGER NOT NULL DEFAULT 0,
  aktif         INTEGER NOT NULL DEFAULT 1,
  keterangan    TEXT,
  dibuat_oleh   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_voucher_kode ON vouchers(kode);
CREATE INDEX IF NOT EXISTS idx_voucher_unit ON vouchers(unit);

-- Catatan pemakaian voucher per pesanan (untuk membatalkan & mengembalikan kuota).
CREATE TABLE IF NOT EXISTS voucher_pemakaian (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id  INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  potongan    INTEGER NOT NULL CHECK (potongan >= 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (voucher_id, order_id)
);

-- ----------------------------------------------------------------------------
-- DISKON PRODUK - potongan harga langsung pada produk (tanpa kode voucher).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_discounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  persen      INTEGER NOT NULL CHECK (persen BETWEEN 1 AND 99),
  mulai       TEXT,
  selesai     TEXT,
  aktif       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_diskon_produk ON product_discounts(product_id);

-- ----------------------------------------------------------------------------
-- WISHLIST (simpan produk) & FOLLOW (ikuti toko / akun lain)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);

CREATE TABLE IF NOT EXISTS toko_follow (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (follower_id, seller_id),
  CHECK (follower_id <> seller_id)   -- tidak bisa follow diri sendiri
);
CREATE INDEX IF NOT EXISTS idx_follow_seller ON toko_follow(seller_id);

-- ----------------------------------------------------------------------------
-- PROFIL TOKO - penjual mengatur nama toko, deskripsi, foto, jam buka.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS toko_profil (
  seller_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nama_toko   TEXT,
  deskripsi   TEXT,
  foto_url    TEXT,
  jam_buka    TEXT,     -- "07.00 - 15.00"
  lokasi      TEXT,     -- "Kantin belakang", "Depan lab TKJ"
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- ULASAN BERFOTO + BALASAN PENJUAL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_foto (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rating_id  INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  url_foto   TEXT NOT NULL,
  urutan     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_foto_rating ON review_foto(rating_id);

CREATE TABLE IF NOT EXISTS review_balasan (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rating_id  INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  penjual_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teks       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rating_id)     -- satu ulasan dibalas sekali (masih bisa diedit)
);

-- Menandai ulasan yang "membantu" (tombol Membantu ala Tokopedia).
CREATE TABLE IF NOT EXISTS review_membantu (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rating_id  INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rating_id, user_id)
);

-- ----------------------------------------------------------------------------
-- LAPORAN PRODUK - siswa melaporkan produk bermasalah; ditangani CS.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS laporan_produk (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pelapor_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alasan      TEXT NOT NULL,
  keterangan  TEXT,
  status      TEXT NOT NULL DEFAULT 'baru'
              CHECK (status IN ('baru','ditinjau','selesai','ditolak')),
  ditangani_oleh INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_laporan_status ON laporan_produk(status);

-- ----------------------------------------------------------------------------
-- AUDIT LOG - catat siapa mengubah apa. WAJIB untuk perubahan peran
-- (piket harian KWU), karena staf bergilir setiap hari.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  aktor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  aksi       TEXT NOT NULL,      -- 'ubah_peran', 'hapus_produk', 'buat_voucher', dll
  tabel      TEXT,               -- tabel yang disentuh
  record_id  TEXT,               -- id baris yang disentuh
  sebelum    TEXT,               -- nilai sebelum (JSON) - opsional
  sesudah    TEXT,               -- nilai sesudah (JSON) - opsional
  keterangan TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_aktor ON audit_log(aktor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_aksi ON audit_log(aksi, created_at);

-- ----------------------------------------------------------------------------
-- PESAN DIBACA - untuk chat UNIT KWU (banyak staf, satu ruang), kita perlu
-- tahu sampai mana SETIAP staf sudah membaca, supaya lencana "belum dibaca"
-- tidak salah hitung. Pada chat 1:1, kolom chat_messages.sudah_dibaca cukup.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pesan_dibaca (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (chat_id, user_id)
);

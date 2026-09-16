/**
 * Migrasi v3 — "Rombakan ala Tokopedia"
 *
 * Ditulis untuk mengubah hal-hal yang TIDAK bisa dilakukan oleh schema.sql
 * (CREATE TABLE IF NOT EXISTS tidak mengubah tabel yang sudah ada).
 *
 * Aman dijalankan berulang kali: setiap langkah memeriksa dulu apakah
 * perubahannya sudah ada.
 *
 * Yang dikerjakan:
 *  1. products.category — ganti CHECK ('kwu_brital','siswa') menjadi
 *     5 kategori: brital, laundry, minuman, makanan, jasa
 *     Data lama dipetakan: 'kwu_brital' -> 'brital', 'siswa' -> 'makanan'
 *  2. Panjang deskripsi minimal (divalidasi di lapisan validator, bukan DB)
 *  3. Kolom baru pada tabel lama:
 *     - products   : terjual, harga_asli, spesifikasi, info_penting
 *     - chat_messages : pengirim_peran (untuk tag -nama pada chat KWU)
 *     - orders     : voucher_id, potongan, etalase (opsional)
 *
 * CATATAN PENTING: SQLite tidak mendukung ALTER TABLE untuk mengubah CHECK
 * constraint. Karena itu tabel `products` dibuat ulang (copy -> drop -> rename)
 * di dalam SATU transaksi supaya data tidak hilang bila gagal di tengah jalan.
 */

import { db, runMigrations } from "./index";

function kolomAda(tabel: string, kolom: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === kolom);
}

function tabelAda(tabel: string): boolean {
  const r = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tabel);
  return Boolean(r);
}

function bacaDefinisiTabel(tabel: string): string | null {
  const r = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(tabel) as { sql?: string } | undefined;
  return r?.sql ?? null;
}

/** 1. Ubah CHECK constraint products.category + peta data lama ke kategori baru. */
function perbaikiKategoriProduk() {
  const sql = bacaDefinisiTabel("products");
  if (!sql) return;

  // Kalau CHECK-nya sudah memuat kategori baru, tidak perlu apa-apa.
  if (sql.includes("'minuman'") && sql.includes("'makanan'") && sql.includes("'jasa'")) {
    console.log("[MIGRASI] products.category sudah pakai kategori baru.");
    return;
  }

  console.log("[MIGRASI] Mengubah products.category -> brital/laundry/minuman/makanan/jasa ...");

  // SQLite menolak DROP TABLE selama ada tabel lain yang mereferensikannya
  // lewat FOREIGN KEY (product_images, cart_items, order_items, chats,
  // ratings). Pemeriksaan FK karena itu dimatikan SEMENTARA.
  //
  // PENTING: `PRAGMA foreign_keys` TIDAK BERLAKU di dalam transaksi — SQLite
  // mengabaikannya tanpa error. Jadi pragma harus dijalankan di LUAR
  // transaksi (terbukti: percobaan pertama gagal karena pragma diletakkan
  // di dalam db.transaction()).
  db.pragma("foreign_keys = OFF");

  const jalankan = db.transaction(() => {
    // Tabel sementara dengan skema baru. Disalin dari skema asli, hanya
    // CHECK category yang diperluas, plus kolom baru yang kita butuhkan.
    db.exec(`
      CREATE TABLE products_baru (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category    TEXT NOT NULL CHECK (category IN
                      ('brital','laundry','minuman','makanan','jasa','kwu_brital','siswa')),
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price       INTEGER NOT NULL CHECK (price >= 0),
        stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        image_url   TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        terjual     INTEGER NOT NULL DEFAULT 0,
        harga_asli  INTEGER,
        spesifikasi TEXT,
        info_penting TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Pindahkan data lama sambil MEMETAKAN kategori.
    //   kwu_brital -> brital
    //   siswa      -> makanan  (kategori siswa lama paling banyak makanan)
    db.exec(`
      INSERT INTO products_baru
        (id, seller_id, category, name, description, price, stock, image_url,
         is_active, created_at, updated_at)
      SELECT id, seller_id,
             CASE category
               WHEN 'kwu_brital' THEN 'brital'
               WHEN 'siswa'      THEN 'makanan'
               ELSE category
             END,
             name, description, price, stock, image_url, is_active,
             created_at, updated_at
      FROM products;
    `);

    db.exec("DROP TABLE products;");
    db.exec("ALTER TABLE products_baru RENAME TO products;");
    db.exec("CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);");

    // Pastikan tidak ada baris yatim sebelum FK dinyalakan kembali.
    const yatim = db
      .prepare(
        "SELECT COUNT(*) AS n FROM product_images WHERE product_id NOT IN (SELECT id FROM products)",
      )
      .get() as { n: number };
    if (yatim.n > 0) {
      throw new Error(
        `Migrasi dibatalkan: ada ${yatim.n} baris product_images tanpa produk. ` +
          "Perbaiki dulu sebelum mengulang.",
      );
    }
  });

  jalankan();
  db.pragma("foreign_keys = ON");

  const cekFk = db.pragma("foreign_key_check") as unknown[];
  if (cekFk.length > 0) {
    console.warn(`[MIGRASI] PERINGATAN: ${cekFk.length} pelanggaran foreign key terdeteksi.`);
  } else {
    console.log("[MIGRASI] Pemeriksaan foreign key: bersih.");
  }

  const jumlah = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
  console.log(`[MIGRASI] Selesai. ${jumlah.n} produk dipindahkan.`);
  const per = db
    .prepare("SELECT category, COUNT(*) AS n FROM products GROUP BY category")
    .all() as Array<{ category: string; n: number }>;
  for (const p of per) console.log(`[MIGRASI]   ${p.category}: ${p.n}`);
}

/** 2. Tambah kolom baru pada tabel lama (kalau belum ada). */
function tambahKolom() {
  const daftar: Array<[string, string, string]> = [
    // [tabel, kolom, definisi]
    ["chat_messages", "pengirim_peran", "pengirim_peran TEXT"],
    ["chats", "unit_slug_baru", "unit_slug_baru TEXT"],
    ["orders", "voucher_id", "voucher_id INTEGER"],
    ["orders", "potongan", "potongan INTEGER NOT NULL DEFAULT 0"],
    ["ratings", "dibantu", "dibantu INTEGER NOT NULL DEFAULT 0"],
    ["users", "toko_aktif", "toko_aktif INTEGER NOT NULL DEFAULT 1"],
  ];

  for (const [tabel, kolom, definisi] of daftar) {
    if (!tabelAda(tabel)) continue;
    if (kolomAda(tabel, kolom)) continue;
    db.exec(`ALTER TABLE ${tabel} ADD COLUMN ${definisi}`);
    console.log(`[MIGRASI] Kolom ${tabel}.${kolom} ditambahkan.`);
  }
}

/** 3. Isi kategori laundry (kalau belum ada produk laundry, tidak apa-apa). */
function siapkanKategoriLaundry() {
  // Laundry memang TIDAK punya produk (jasa, dipesan langsung ke tempat),
  // jadi tidak ada yang perlu diisi. Fungsi ini hanya penanda supaya
  // kategori 'laundry' tetap sah dipakai bila nanti staf menambah paket
  // laundry (misal "Paket Ekspres 1 hari").
}

/**
 * 4. Isi kolom `chats.tipe` untuk basis data lama.
 *
 * Kolom `tipe` baru ditambahkan lewat ALTER TABLE (nilai bawaan 'pribadi'),
 * sehingga SEMUA chat lama akan bernilai 'pribadi' meski sebenarnya milik unit
 * KWU atau dengan akun CS. Fungsi ini memperbaikinya:
 *   - chat dengan unit_slug  -> 'kwu'   (satu ruang per unit, banyak staf)
 *   - chat dengan lawan akun ber-role cs -> 'cs'
 *   - sisanya tetap 'pribadi'
 */
function isiTipeChat() {
  if (!kolomAda("chats", "tipe")) return;

  const jumlahKw = db
    .prepare("UPDATE chats SET tipe = 'kwu' WHERE unit_slug IS NOT NULL AND tipe != 'kwu'")
    .run().changes;
  if (jumlahKw > 0) console.log(`[MIGRASI] ${jumlahKw} chat unit ditandai tipe='kwu'.`);

  const jumlahCs = db
    .prepare(
      `UPDATE chats SET tipe = 'cs'
       WHERE unit_slug IS NULL AND tipe = 'pribadi'
         AND (buyer_id IN (SELECT id FROM users WHERE role = 'cs')
              OR seller_id IN (SELECT id FROM users WHERE role = 'cs'))`,
    )
    .run().changes;
  if (jumlahCs > 0) console.log(`[MIGRASI] ${jumlahCs} chat CS ditandai tipe='cs'.`);
}

export function jalankanMigrasiV3() {
  console.log("[MIGRASI] === Mulai migrasi v3 ===");
  // PENTING: schema.sql HARUS dijalankan lebih dulu supaya tabel-tabel baru
  // (product_variants, etalase, vouchers, dst) benar-benar terbentuk.
  // Tanpa ini, migrasi "berhasil" tapi tabelnya tidak ada sama sekali —
  // pernah terjadi saat pengujian pertama.
  runMigrations();
  perbaikiKategoriProduk();
  tambahKolom();
  siapkanKategoriLaundry();
  isiTipeChat();
  console.log("[MIGRASI] === Migrasi v3 selesai ===");
}

// Bisa dijalankan langsung: npx tsx src/db/migrasiV3.ts
if (require.main === module) {
  jalankanMigrasiV3();
}

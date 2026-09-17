/**
 * Migrasi V4 — menambahkan kategori "barang".
 *
 * LATAR: pemilik produk meminta kategori baru "barang" untuk jualan siswa
 * (mis. alat tulis, aksesori, perlengkapan sekolah) — melengkapi
 * minuman / makanan / jasa.
 *
 * MASALAH: SQLite tidak bisa mengubah CHECK constraint lewat ALTER TABLE.
 * Satu-satunya cara adalah membuat tabel baru, menyalin SELURUH data,
 * lalu mengganti nama. Karena itu migrasi ini:
 *   1. mematikan sementara PRAGMA foreign_keys (WAJIB di luar transaksi —
 *      di dalam transaksi pragma ini diabaikan tanpa pesan galat),
 *   2. membuat tabel baru dengan CHECK yang sudah memuat 'barang',
 *   3. menyalin semua baris apa adanya,
 *   4. mengganti tabel lama,
 *   5. menyalakan kembali foreign_keys.
 *
 * Aman dijalankan berulang: kalau 'barang' sudah ada di CHECK, migrasi
 * langsung berhenti dan tidak menyentuh data sama sekali.
 */

import { db } from "./index";

const KOLOM = [
  "id",
  "seller_id",
  "category",
  "name",
  "description",
  "price",
  "stock",
  "image_url",
  "is_active",
  "created_at",
  "updated_at",
  "harga_asli",
  "spesifikasi",
  "info_penting",
  "terjual",
];

export function jalankanMigrasiV4(): void {
  // ---------------------------------------------------------------- Periksa
  const skema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")
    .get() as { sql?: string } | undefined;

  if (!skema?.sql) {
    console.log("[MIGRASI V4] Tabel products belum ada — dilewati.");
    return;
  }

  if (skema.sql.includes("'barang'")) {
    // Sudah pernah dijalankan. Tidak menyentuh apa pun.
    return;
  }

  console.log("[MIGRASI V4] Menambahkan kategori 'barang' ke products.category ...");

  // ------------------------------------------------------------------ Cadang
  // Simpan jumlah baris sebelum migrasi supaya bisa dibandingkan sesudahnya.
  const sebelum = (db.prepare("SELECT COUNT(*) AS n FROM products").get() as any).n;

  // PRAGMA WAJIB di luar transaksi. Di dalam transaksi, SQLite mengabaikannya
  // tanpa pesan galat dan DROP TABLE akan gagal karena foreign key.
  db.pragma("foreign_keys = OFF");

  try {
    db.exec(`
      CREATE TABLE products_baru (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category     TEXT NOT NULL CHECK (category IN (
                       'brital','laundry','minuman','makanan','jasa','barang',
                       'kwu_brital','siswa'
                     )),
        name         TEXT NOT NULL,
        description  TEXT,
        price        INTEGER NOT NULL CHECK (price >= 0),
        stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        image_url    TEXT,
        is_active    INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        harga_asli   INTEGER,
        spesifikasi  TEXT,
        info_penting TEXT,
        terjual      INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Salin apa adanya — TIDAK ada kategori yang diubah.
    db.exec(`
      INSERT INTO products_baru (${KOLOM.join(", ")})
      SELECT ${KOLOM.join(", ")} FROM products;
    `);

    db.exec("DROP TABLE products;");
    db.exec("ALTER TABLE products_baru RENAME TO products;");

    // Indeks yang dipakai marketplace ikut dibuat ulang (DROP TABLE
    // menghapus indeksnya juga).
    db.exec("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);");
  } finally {
    // Apa pun yang terjadi, foreign_keys HARUS dinyalakan kembali —
    // kalau tidak, seluruh integritas database menjadi longgar.
    db.pragma("foreign_keys = ON");
  }

  const sesudah = (db.prepare("SELECT COUNT(*) AS n FROM products").get() as any).n;

  // ------------------------------------------------------------ Pemeriksaan
  if (sebelum !== sesudah) {
    // Ini tidak seharusnya terjadi. Laporkan dengan lantang, jangan diam.
    console.error(
      `[MIGRASI V4] PERINGATAN: jumlah produk berubah! ${sebelum} -> ${sesudah}`,
    );
  }

  // Pastikan integritas foreign key masih utuh.
  const pelanggaran = db.pragma("foreign_key_check") as any[];
  if (pelanggaran.length > 0) {
    console.error(`[MIGRASI V4] PERINGATAN: ${pelanggaran.length} pelanggaran FK.`);
  }

  console.log(
    `[MIGRASI V4] Selesai. ${sesudah} produk utuh, ${pelanggaran.length} pelanggaran FK.`,
  );
}

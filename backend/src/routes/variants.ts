/**
 * Rute: Varian Produk — Tahap 2
 *
 * Keputusan pemilik produk: "varian bisa di tambahkan sendiri sama seller
 * di dashboard."
 *
 * Jadi penjual (siswa maupun staf KWU) bisa membuat kelompok varian untuk
 * produknya sendiri, misalnya:
 *   Nama varian: "Level Pedas"  -> pilihan: 1, 2, 3, 4, 5
 *   Nama varian: "Topping"      -> pilihan: Keju, Telur, Sosis
 *   Nama varian: "Ukuran"       -> pilihan: Reguler, Jumbo
 *
 * ATURAN HAK AKSES:
 *  - Produk kategori unit (brital/laundry) boleh diatur oleh SEMUA staf unit
 *    yang sedang bertugas (staf bergilir tiap hari) dan admin.
 *  - Produk jualan siswa hanya boleh diatur oleh PEMILIKnya dan admin/CS.
 *    (Sama dengan aturan di routes/products.ts - lihat bolehUbahProduk().)
 */

import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { sanitizeText } from "../utils/sanitize";

const router = Router();

const KATEGORI_UNIT: Record<string, string> = {
  brital: "kwu_brital",
  laundry: "kwu_laundry",
  kwu_brital: "kwu_brital",
  kwu_laundry: "kwu_laundry",
};

/**
 * Bolehkah pengguna ini mengubah produk tersebut?
 * Mengembalikan produk bila boleh, atau null bila tidak.
 */
function ambilProdukBilaBoleh(productId: number, user: any): any | null {
  const produk = db.prepare("SELECT * FROM products WHERE id = ?").get(productId) as any;
  if (!produk) return null;

  if (user.role === "admin" || user.role === "cs") return produk;

  const unit = KATEGORI_UNIT[produk.category];
  if (unit) {
    // Produk unit: semua staf unit terkait boleh mengatur (staf bergilir).
    return user.role === unit ? produk : null;
  }
  // Produk siswa: hanya pemiliknya.
  return produk.seller_id === user.user_id ? produk : null;
}

// GET /api/variants/produk/:productId - daftar varian sebuah produk.
// Bisa diakses penjual (untuk dashboard) maupun pembeli (untuk halaman detail).
router.get("/produk/:productId", readLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID produk tidak valid." });
  }

  const baris = db
    .prepare(
      `SELECT id, nama_varian, nilai, harga_tambahan, stok, aktif, urutan
       FROM product_variants WHERE product_id = ?
       ORDER BY nama_varian ASC, urutan ASC, id ASC`
    )
    .all(productId) as any[];

  const peta = new Map<string, any[]>();
  for (const v of baris) {
    if (!peta.has(v.nama_varian)) peta.set(v.nama_varian, []);
    peta.get(v.nama_varian)!.push(v);
  }

  res.json({
    variants: [...peta.entries()].map(([nama, pilihan]) => ({ nama, pilihan })),
  });
});

// POST /api/variants/produk/:productId - tambah satu pilihan varian.
// Body: { nama_varian, nilai, harga_tambahan?, stok?, urutan? }
router.post("/produk/:productId", authMiddleware, defaultLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID produk tidak valid." });
  }

  const produk = ambilProdukBilaBoleh(productId, req.user);
  if (!produk) {
    return res.status(403).json({ error: "Kamu tidak berhak mengatur produk ini." });
  }

  const namaVarian = sanitizeText(String(req.body?.nama_varian ?? "")).trim().slice(0, 40);
  const nilai = sanitizeText(String(req.body?.nilai ?? "")).trim().slice(0, 40);
  if (!namaVarian) return res.status(400).json({ error: "Nama varian wajib diisi." });
  if (!nilai) return res.status(400).json({ error: "Pilihan varian wajib diisi." });

  const hargaTambahan = Math.max(0, Math.trunc(Number(req.body?.harga_tambahan ?? 0)) || 0);
  const stok = Math.max(0, Math.trunc(Number(req.body?.stok ?? produk.stock)) || 0);
  const urutan = Math.trunc(Number(req.body?.urutan ?? 0)) || 0;

  // Cegah pilihan kembar dalam kelompok yang sama.
  const kembar = db
    .prepare(
      "SELECT id FROM product_variants WHERE product_id = ? AND nama_varian = ? AND nilai = ?"
    )
    .get(productId, namaVarian, nilai);
  if (kembar) {
    return res.status(409).json({ error: `Pilihan "${nilai}" sudah ada di ${namaVarian}.` });
  }

  const info = db
    .prepare(
      `INSERT INTO product_variants (product_id, nama_varian, nilai, harga_tambahan, stok, urutan)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(productId, namaVarian, nilai, hargaTambahan, stok, urutan);

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// PUT /api/variants/:id - ubah satu pilihan varian.
router.put("/:id", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID varian tidak valid." });

  const varian = db.prepare("SELECT * FROM product_variants WHERE id = ?").get(id) as any;
  if (!varian) return res.status(404).json({ error: "Varian tidak ditemukan." });

  const produk = ambilProdukBilaBoleh(varian.product_id, req.user);
  if (!produk) return res.status(403).json({ error: "Kamu tidak berhak mengatur varian ini." });

  const namaVarian = sanitizeText(String(req.body?.nama_varian ?? varian.nama_varian))
    .trim()
    .slice(0, 40);
  const nilai = sanitizeText(String(req.body?.nilai ?? varian.nilai)).trim().slice(0, 40);
  if (!namaVarian || !nilai) return res.status(400).json({ error: "Nama & pilihan wajib diisi." });

  const hargaTambahan =
    req.body?.harga_tambahan === undefined
      ? varian.harga_tambahan
      : Math.max(0, Math.trunc(Number(req.body.harga_tambahan)) || 0);
  const stok =
    req.body?.stok === undefined ? varian.stok : Math.max(0, Math.trunc(Number(req.body.stok)) || 0);
  const aktif =
    req.body?.aktif === undefined ? varian.aktif : req.body.aktif ? 1 : 0;

  db.prepare(
    `UPDATE product_variants
     SET nama_varian = ?, nilai = ?, harga_tambahan = ?, stok = ?, aktif = ?
     WHERE id = ?`
  ).run(namaVarian, nilai, hargaTambahan, stok, aktif, id);

  res.json({ ok: true });
});

// DELETE /api/variants/:id - hapus satu pilihan varian.
router.delete("/:id", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID varian tidak valid." });

  const varian = db.prepare("SELECT * FROM product_variants WHERE id = ?").get(id) as any;
  if (!varian) return res.status(404).json({ error: "Varian tidak ditemukan." });

  const produk = ambilProdukBilaBoleh(varian.product_id, req.user);
  if (!produk) return res.status(403).json({ error: "Kamu tidak berhak menghapus varian ini." });

  db.prepare("DELETE FROM product_variants WHERE id = ?").run(id);
  res.json({ ok: true });
});

// DELETE /api/variants/produk/:productId/nama/:nama - hapus SATU KELOMPOK varian.
// Dipakai tombol "Hapus kelompok" di dashboard.
router.delete("/produk/:productId/nama/:nama", authMiddleware, defaultLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID produk tidak valid." });
  }
  const produk = ambilProdukBilaBoleh(productId, req.user);
  if (!produk) return res.status(403).json({ error: "Kamu tidak berhak mengatur produk ini." });

  const info = db
    .prepare("DELETE FROM product_variants WHERE product_id = ? AND nama_varian = ?")
    .run(productId, String(req.params.nama));
  res.json({ ok: true, dihapus: info.changes });
});

export default router;

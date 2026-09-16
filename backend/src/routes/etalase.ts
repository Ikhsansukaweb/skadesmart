/**
 * Rute: Etalase & Profil Toko — Tahap 5
 *
 * Keputusan pemilik produk: "Etalase bagus boleh juga."
 *
 * Etalase = "rak" untuk mengelompokkan produk di halaman toko, seperti
 * fitur Etalase Tokopedia. Contoh: "Minuman Dingin", "Menu Favorit",
 * "Alat Tulis".
 *
 * ATURAN: hanya PEMILIK toko yang boleh mengatur etalase & profil tokonya.
 * Admin/CS boleh membantu (mereka berwenang atas seluruh website).
 */

import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { sanitizeText } from "../utils/sanitize";
import { urlGambar } from "../utils/urlAman";

const router = Router();

/** Bolehkah pengguna mengatur toko milik sellerId? */
function bolehAturToko(sellerId: number, user: any): boolean {
  if (user.role === "admin" || user.role === "cs") return true;
  return user.user_id === sellerId;
}

// ============================================================================
// ETALASE
// ============================================================================

// GET /api/etalase/milik/:sellerId - daftar etalase milik penjual (publik).
router.get("/milik/:sellerId", readLimiter, (req, res) => {
  const sellerId = Number(req.params.sellerId);
  if (!Number.isInteger(sellerId)) {
    return res.status(400).json({ error: "ID penjual tidak valid." });
  }

  const daftar = db
    .prepare(
      `SELECT e.id, e.nama, e.urutan,
              (SELECT COUNT(*) FROM etalase_produk ep WHERE ep.etalase_id = e.id) AS jumlah_produk
       FROM etalase e WHERE e.seller_id = ?
       ORDER BY e.urutan ASC, e.id ASC`
    )
    .all(sellerId);

  res.json({ etalase: daftar });
});

// GET /api/etalase/:id - isi satu etalase (produk-produknya).
router.get("/:id", readLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID etalase tidak valid." });

  const etalase = db.prepare("SELECT * FROM etalase WHERE id = ?").get(id) as any;
  if (!etalase) return res.status(404).json({ error: "Etalase tidak ditemukan." });

  const produk = db
    .prepare(
      `SELECT p.*, ep.urutan AS urutan_etalase,
              (SELECT ROUND(AVG(score),1) FROM ratings r
                 WHERE r.product_id = p.id AND r.is_hidden = 0) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r
                 WHERE r.product_id = p.id AND r.is_hidden = 0) AS rating_count
       FROM etalase_produk ep
       JOIN products p ON p.id = ep.product_id
       WHERE ep.etalase_id = ? AND p.is_active = 1
       ORDER BY ep.urutan ASC, ep.id ASC`
    )
    .all(id);

  res.json({ etalase, produk });
});

// POST /api/etalase - buat etalase baru.
router.post("/", authMiddleware, defaultLimiter, (req, res) => {
  const nama = sanitizeText(String(req.body?.nama ?? "")).trim().slice(0, 60);
  if (!nama) return res.status(400).json({ error: "Nama etalase wajib diisi." });

  try {
    const info = db
      .prepare("INSERT INTO etalase (seller_id, nama, urutan) VALUES (?, ?, ?)")
      .run(req.user!.user_id, nama, Math.trunc(Number(req.body?.urutan ?? 0)) || 0);
    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  } catch {
    // UNIQUE(seller_id, nama) -> nama etalase tidak boleh kembar.
    res.status(409).json({ error: `Etalase "${nama}" sudah ada.` });
  }
});

// PUT /api/etalase/:id - ubah nama/urutan etalase.
router.put("/:id", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID etalase tidak valid." });

  const etalase = db.prepare("SELECT * FROM etalase WHERE id = ?").get(id) as any;
  if (!etalase) return res.status(404).json({ error: "Etalase tidak ditemukan." });
  if (!bolehAturToko(etalase.seller_id, req.user)) {
    return res.status(403).json({ error: "Etalase ini bukan milikmu." });
  }

  const nama = sanitizeText(String(req.body?.nama ?? etalase.nama)).trim().slice(0, 60);
  if (!nama) return res.status(400).json({ error: "Nama etalase wajib diisi." });
  const urutan =
    req.body?.urutan === undefined ? etalase.urutan : Math.trunc(Number(req.body.urutan)) || 0;

  db.prepare("UPDATE etalase SET nama = ?, urutan = ? WHERE id = ?").run(nama, urutan, id);
  res.json({ ok: true });
});

// DELETE /api/etalase/:id - hapus etalase (produknya TIDAK ikut terhapus).
router.delete("/:id", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID etalase tidak valid." });

  const etalase = db.prepare("SELECT * FROM etalase WHERE id = ?").get(id) as any;
  if (!etalase) return res.status(404).json({ error: "Etalase tidak ditemukan." });
  if (!bolehAturToko(etalase.seller_id, req.user)) {
    return res.status(403).json({ error: "Etalase ini bukan milikmu." });
  }

  // etalase_produk punya ON DELETE CASCADE, jadi barisnya ikut terhapus,
  // tetapi tabel `products` TIDAK tersentuh - produk tetap ada.
  db.prepare("DELETE FROM etalase WHERE id = ?").run(id);
  res.json({ ok: true });
});

// POST /api/etalase/:id/produk - masukkan produk ke etalase.
router.post("/:id/produk", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const productId = Number(req.body?.product_id);
  if (!Number.isInteger(id) || !Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID etalase / produk tidak valid." });
  }

  const etalase = db.prepare("SELECT * FROM etalase WHERE id = ?").get(id) as any;
  if (!etalase) return res.status(404).json({ error: "Etalase tidak ditemukan." });
  if (!bolehAturToko(etalase.seller_id, req.user)) {
    return res.status(403).json({ error: "Etalase ini bukan milikmu." });
  }

  // Produk yang dimasukkan harus MILIK penjual pemilik etalase.
  // Tanpa pemeriksaan ini, penjual bisa menaruh produk milik orang lain
  // di etalasenya sendiri.
  const produk = db.prepare("SELECT * FROM products WHERE id = ?").get(productId) as any;
  if (!produk) return res.status(404).json({ error: "Produk tidak ditemukan." });
  if (produk.seller_id !== etalase.seller_id) {
    return res.status(403).json({ error: "Produk itu bukan milik pemilik etalase ini." });
  }

  const info = db
    .prepare(
      "INSERT OR IGNORE INTO etalase_produk (etalase_id, product_id, urutan) VALUES (?, ?, ?)"
    )
    .run(id, productId, Math.trunc(Number(req.body?.urutan ?? 0)) || 0);

  res.json({ ok: true, baru: info.changes > 0 });
});

// DELETE /api/etalase/:id/produk/:productId - keluarkan produk dari etalase.
router.delete("/:id/produk/:productId", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const productId = Number(req.params.productId);
  if (!Number.isInteger(id) || !Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID etalase / produk tidak valid." });
  }

  const etalase = db.prepare("SELECT * FROM etalase WHERE id = ?").get(id) as any;
  if (!etalase) return res.status(404).json({ error: "Etalase tidak ditemukan." });
  if (!bolehAturToko(etalase.seller_id, req.user)) {
    return res.status(403).json({ error: "Etalase ini bukan milikmu." });
  }

  db.prepare("DELETE FROM etalase_produk WHERE etalase_id = ? AND product_id = ?").run(
    id,
    productId
  );
  res.json({ ok: true });
});

// ============================================================================
// PROFIL TOKO
// ============================================================================

// GET /api/toko-profil/saya - profil toko milik sendiri (untuk dashboard).
router.get("/saya", authMiddleware, readLimiter, (req, res) => {
  const profil =
    db.prepare("SELECT * FROM toko_profil WHERE seller_id = ?").get(req.user!.user_id) || null;
  res.json({ profil });
});

// PUT /api/toko-profil - simpan profil toko sendiri.
router.put("/", authMiddleware, defaultLimiter, (req, res) => {
  const sellerId = req.user!.user_id;

  const namaTokoRaw = req.body?.nama_toko;
  const deskripsiRaw = req.body?.deskripsi;
  const fotoRaw = req.body?.foto_url;
  const jamRaw = req.body?.jam_buka;
  const lokasiRaw = req.body?.lokasi;

  const nama_toko =
    namaTokoRaw === undefined || namaTokoRaw === null
      ? null
      : sanitizeText(String(namaTokoRaw)).trim().slice(0, 60) || null;
  const deskripsi =
    deskripsiRaw === undefined || deskripsiRaw === null
      ? null
      : sanitizeText(String(deskripsiRaw)).trim().slice(0, 400) || null;
  const jam_buka =
    jamRaw === undefined || jamRaw === null
      ? null
      : sanitizeText(String(jamRaw)).trim().slice(0, 40) || null;
  const lokasi =
    lokasiRaw === undefined || lokasiRaw === null
      ? null
      : sanitizeText(String(lokasiRaw)).trim().slice(0, 60) || null;

  // Foto harus lolos penyaring URL gambar yang sama dengan foto produk,
  // supaya tidak bisa diisi `javascript:` atau domain luar seenaknya.
  let foto_url: string | null = null;
  if (fotoRaw) {
    const cek = urlGambar.safeParse(String(fotoRaw));
    if (!cek.success) {
      return res.status(400).json({
        error: cek.error.issues[0]?.message || "URL foto tidak diizinkan.",
      });
    }
    foto_url = cek.data;
  }

  // UPSERT: kalau belum ada barisnya, buat; kalau sudah, perbarui.
  db.prepare(
    `INSERT INTO toko_profil (seller_id, nama_toko, deskripsi, foto_url, jam_buka, lokasi, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(seller_id) DO UPDATE SET
       nama_toko = excluded.nama_toko,
       deskripsi = excluded.deskripsi,
       foto_url  = COALESCE(excluded.foto_url, toko_profil.foto_url),
       jam_buka  = excluded.jam_buka,
       lokasi    = excluded.lokasi,
       updated_at = datetime('now')`
  ).run(sellerId, nama_toko, deskripsi, foto_url, jam_buka, lokasi);

  const profil = db.prepare("SELECT * FROM toko_profil WHERE seller_id = ?").get(sellerId);
  res.json({ ok: true, profil });
});

export default router;

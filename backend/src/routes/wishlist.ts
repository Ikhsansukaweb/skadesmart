/**
 * Rute: Simpan (Wishlist) & Ikuti (Follow)  — Tahap 5
 *
 * Keputusan pemilik produk: "Wishlist adain aja. Follow toko boleh, follow
 * akun lain boleh." Jadi:
 *   - wishlist  : pengguna menyimpan produk
 *   - toko_follow: pengguna mengikuti PENJUAL (toko maupun siswa biasa,
 *                  karena setiap siswa penjual punya toko juga)
 *
 * Semua rute di sini butuh login.
 */

import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { invalidateByPrefix } from "../services/cache";

const router = Router();

// ============================================================================
// WISHLIST
// ============================================================================

// GET /api/wishlist - daftar produk yang disimpan pengguna.
router.get("/wishlist", authMiddleware, readLimiter, (req, res) => {
  const baris = db
    .prepare(
      `SELECT w.id AS wishlist_id, w.created_at AS disimpan_pada,
              p.id, p.name, p.price, p.harga_asli, p.stock, p.image_url,
              p.category, p.terjual, p.seller_id,
              u.full_name AS seller_name, u.shop_open AS seller_shop_open,
              (SELECT ROUND(AVG(score),1) FROM ratings r
                 WHERE r.product_id = p.id AND r.is_hidden = 0) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r
                 WHERE r.product_id = p.id AND r.is_hidden = 0) AS rating_count
       FROM wishlist w
       JOIN products p ON p.id = w.product_id
       JOIN users u ON u.id = p.seller_id
       WHERE w.user_id = ? AND p.is_active = 1
       ORDER BY w.created_at DESC`
    )
    .all(req.user!.user_id);

  res.json({ wishlist: baris });
});

// POST /api/wishlist/:productId - simpan produk.
router.post("/wishlist/:productId", authMiddleware, defaultLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID produk tidak valid." });
  }

  const ada = db.prepare("SELECT id FROM products WHERE id = ? AND is_active = 1").get(productId);
  if (!ada) return res.status(404).json({ error: "Produk tidak ditemukan." });

  // INSERT OR IGNORE: menekan tombol dua kali tidak menimbulkan galat.
  const info = db
    .prepare("INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)")
    .run(req.user!.user_id, productId);

  res.json({ ok: true, disimpan: true, baru: info.changes > 0 });
});

// DELETE /api/wishlist/:productId - buang dari simpanan.
router.delete("/wishlist/:productId", authMiddleware, defaultLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: "ID produk tidak valid." });
  }
  db.prepare("DELETE FROM wishlist WHERE user_id = ? AND product_id = ?").run(
    req.user!.user_id,
    productId
  );
  res.json({ ok: true, disimpan: false });
});

// ============================================================================
// FOLLOW TOKO / AKUN
// ============================================================================

// GET /api/follow/mengikuti - daftar toko yang saya ikuti.
router.get("/follow/mengikuti", authMiddleware, readLimiter, (req, res) => {
  const baris = db
    .prepare(
      `SELECT f.seller_id, f.created_at AS diikuti_pada,
              u.full_name AS seller_name, u.profile_photo_url AS seller_photo,
              tp.nama_toko, tp.foto_url AS toko_foto,
              (SELECT COUNT(*) FROM products p
                 WHERE p.seller_id = u.id AND p.is_active = 1) AS jumlah_produk,
              (SELECT COUNT(*) FROM toko_follow f2 WHERE f2.seller_id = u.id) AS jumlah_pengikut
       FROM toko_follow f
       JOIN users u ON u.id = f.seller_id
       LEFT JOIN toko_profil tp ON tp.seller_id = u.id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC`
    )
    .all(req.user!.user_id);
  res.json({ mengikuti: baris });
});

// GET /api/follow/pengikut - daftar yang mengikuti saya (untuk dashboard penjual).
router.get("/follow/pengikut", authMiddleware, readLimiter, (req, res) => {
  const baris = db
    .prepare(
      `SELECT f.follower_id, f.created_at,
              u.full_name, u.class_name, u.profile_photo_url
       FROM toko_follow f JOIN users u ON u.id = f.follower_id
       WHERE f.seller_id = ?
       ORDER BY f.created_at DESC`
    )
    .all(req.user!.user_id);
  res.json({ pengikut: baris });
});

// POST /api/follow/:sellerId - ikuti toko/akun.
router.post("/follow/:sellerId", authMiddleware, defaultLimiter, (req, res) => {
  const sellerId = Number(req.params.sellerId);
  if (!Number.isInteger(sellerId)) {
    return res.status(400).json({ error: "ID penjual tidak valid." });
  }
  if (sellerId === req.user!.user_id) {
    return res.status(400).json({ error: "Tidak bisa mengikuti toko sendiri." });
  }
  const ada = db.prepare("SELECT id FROM users WHERE id = ?").get(sellerId);
  if (!ada) return res.status(404).json({ error: "Penjual tidak ditemukan." });

  const info = db
    .prepare("INSERT OR IGNORE INTO toko_follow (follower_id, seller_id) VALUES (?, ?)")
    .run(req.user!.user_id, sellerId);

  const jumlah = (
    db.prepare("SELECT COUNT(*) AS n FROM toko_follow WHERE seller_id = ?").get(sellerId) as any
  ).n;

  res.json({ ok: true, diikuti: true, baru: info.changes > 0, jumlah_pengikut: jumlah });
});

// DELETE /api/follow/:sellerId - berhenti mengikuti.
router.delete("/follow/:sellerId", authMiddleware, defaultLimiter, (req, res) => {
  const sellerId = Number(req.params.sellerId);
  if (!Number.isInteger(sellerId)) {
    return res.status(400).json({ error: "ID penjual tidak valid." });
  }
  db.prepare("DELETE FROM toko_follow WHERE follower_id = ? AND seller_id = ?").run(
    req.user!.user_id,
    sellerId
  );
  const jumlah = (
    db.prepare("SELECT COUNT(*) AS n FROM toko_follow WHERE seller_id = ?").get(sellerId) as any
  ).n;
  res.json({ ok: true, diikuti: false, jumlah_pengikut: jumlah });
});

// ============================================================================
// PROFIL TOKO (dilihat publik)
// ============================================================================

// GET /api/toko/:sellerId - profil toko + produknya + status ikut.
router.get("/toko/:sellerId", readLimiter, (req, res) => {
  const sellerId = Number(req.params.sellerId);
  if (!Number.isInteger(sellerId)) {
    return res.status(400).json({ error: "ID penjual tidak valid." });
  }

  const penjual = db
    .prepare(
      `SELECT id, full_name, class_name, profile_photo_url, shop_open, role
       FROM users WHERE id = ?`
    )
    .get(sellerId) as any;
  if (!penjual) return res.status(404).json({ error: "Penjual tidak ditemukan." });

  const profil: any =
    db.prepare("SELECT * FROM toko_profil WHERE seller_id = ?").get(sellerId) || {};

  const jumlahProduk = (
    db
      .prepare("SELECT COUNT(*) AS n FROM products WHERE seller_id = ? AND is_active = 1")
      .get(sellerId) as any
  ).n;

  const jumlahPengikut = (
    db.prepare("SELECT COUNT(*) AS n FROM toko_follow WHERE seller_id = ?").get(sellerId) as any
  ).n;

  const rating = db
    .prepare(
      `SELECT ROUND(AVG(r.score),1) AS rata, COUNT(*) AS n
       FROM ratings r JOIN products p ON p.id = r.product_id
       WHERE p.seller_id = ? AND r.is_hidden = 0`
    )
    .get(sellerId);

  // Etalase penjual (Tahap 5).
  const etalase = db
    .prepare("SELECT id, nama, urutan FROM etalase WHERE seller_id = ? ORDER BY urutan ASC, id ASC")
    .all(sellerId);

  let diikuti = false;
  try {
    const pengguna: any = (req as any).user;
    if (pengguna?.id) {
      diikuti = Boolean(
        db
          .prepare("SELECT 1 FROM toko_follow WHERE follower_id = ? AND seller_id = ?")
          .get(pengguna.id, sellerId)
      );
    }
  } catch {
    /* belum login */
  }

  res.json({
    penjual,
    profil,
    etalase,
    jumlah_produk: jumlahProduk,
    jumlah_pengikut: jumlahPengikut,
    rating_toko: rating,
    diikuti,
  });
});

export default router;

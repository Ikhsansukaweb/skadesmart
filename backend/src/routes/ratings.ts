import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { createRatingSchema } from "../validators/ratingValidator";
import { sanitizeText } from "../utils/sanitize";
import { invalidateByPrefix } from "../services/cache";

const router = Router();

// POST /api/ratings - siswa memberi rating & ulasan setelah pesanan (brital
// ATAU laundry) berstatus selesai. Satu pesanan cuma bisa dirating sekali.
router.post("/", authMiddleware, defaultLimiter, validate(createRatingSchema), (req, res) => {
  const { order_id, score, comment } = req.body;

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(order_id) as any;
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (order.buyer_id !== req.user!.user_id) {
    return res.status(403).json({ error: "Pesanan ini bukan milikmu." });
  }
  if (order.status !== "selesai") {
    return res.status(400).json({ error: "Rating hanya bisa diberikan setelah pesanan selesai." });
  }

  const existing = db.prepare("SELECT id FROM ratings WHERE order_id = ?").get(order_id);
  if (existing) return res.status(409).json({ error: "Pesanan ini sudah pernah dirating." });

  // Untuk brital & siswa, kaitkan rating ke produk di pesanan supaya muncul
  // di halaman detail produk juga. Laundry tidak punya produk (product_id NULL).
  let productId: number | null = null;
  if (order.kwu_unit === "kwu_brital" || order.kwu_unit === "siswa") {
    const firstItem = db.prepare("SELECT product_id FROM order_items WHERE order_id = ? LIMIT 1").get(order_id) as any;
    productId = firstItem?.product_id ?? null;
  }

  const info = db
    .prepare(
      `INSERT INTO ratings (order_id, buyer_id, seller_id, kwu_unit, product_id, score, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(order_id, req.user!.user_id, order.seller_id, order.kwu_unit, productId, score, sanitizeText(comment || ""));

  invalidateByPrefix("products:");
  res.status(201).json({ id: info.lastInsertRowid });
});

// GET /api/ratings/product/:productId - ulasan untuk satu produk (KWU Brital).
router.get("/product/:productId", readLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  const rows = db
    .prepare(
      `SELECT r.id, r.score, r.comment, r.created_at, u.full_name AS buyer_name
       FROM ratings r JOIN users u ON u.id = r.buyer_id
       WHERE r.product_id = ? AND r.is_hidden = 0
       ORDER BY r.created_at DESC`
    )
    .all(productId);
  res.json({ ratings: rows });
});

// GET /api/ratings/seller/:sellerId - agregat rating penjual (dipakai profil publik).
router.get("/seller/:sellerId", readLimiter, (req, res) => {
  const sellerId = Number(req.params.sellerId);
  const rows = db
    .prepare(
      `SELECT r.id, r.score, r.comment, r.created_at, r.kwu_unit, u.full_name AS buyer_name
       FROM ratings r JOIN users u ON u.id = r.buyer_id
       WHERE r.seller_id = ? AND r.is_hidden = 0
       ORDER BY r.created_at DESC LIMIT 30`
    )
    .all(sellerId);
  res.json({ ratings: rows });
});

export default router;

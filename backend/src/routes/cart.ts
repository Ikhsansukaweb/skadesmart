import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { addCartItemSchema, updateCartItemSchema } from "../validators/cartValidator";
import { sanitizeText } from "../utils/sanitize";

const router = Router();

// GET /api/cart - isi keranjang siswa saat ini (khusus kwu_brital).
router.get("/", authMiddleware, readLimiter, (req, res) => {
  const items = db
    .prepare(
      `SELECT c.id, c.product_id, c.quantity, c.note, p.name, p.price, p.image_url, p.stock, p.seller_id
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ? AND p.is_active = 1
       ORDER BY c.created_at ASC`
    )
    .all(req.user!.user_id) as any[];

  const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  res.json({ items, total });
});

// POST /api/cart - tambah produk ke keranjang (atau tambah quantity kalau sudah ada).
router.post("/", authMiddleware, defaultLimiter, validate(addCartItemSchema), (req, res) => {
  const { product_id, quantity, note } = req.body;

  const product = db.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1").get(product_id) as any;
  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  // Kategori produk KWU Brital ditulis "brital" di basis data baru, tetapi
  // "kwu_brital" masih dipakai data lama — terima keduanya.
  if (product.category !== "brital" && product.category !== "kwu_brital") {
    return res.status(400).json({ error: "Keranjang hanya berlaku untuk produk KWU Brital." });
  }

  const seller = db.prepare("SELECT shop_open FROM users WHERE id = ?").get(product.seller_id) as any;
  if (!seller?.shop_open) {
    return res.status(400).json({ error: "Toko sedang tutup, tidak bisa menambahkan produk ini." });
  }

  db.prepare(
    `INSERT INTO cart_items (user_id, product_id, quantity, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, product_id) DO UPDATE SET
       quantity = quantity + excluded.quantity,
       note = excluded.note,
       updated_at = datetime('now')`
  ).run(req.user!.user_id, product_id, quantity, note ? sanitizeText(note) : null);

  res.status(201).json({ message: "Ditambahkan ke keranjang." });
});

// PUT /api/cart/:productId - ubah quantity/catatan item di keranjang.
router.put("/:productId", authMiddleware, defaultLimiter, validate(updateCartItemSchema), (req, res) => {
  const productId = Number(req.params.productId);
  const { quantity, note } = req.body;

  const result = db
    .prepare(
      `UPDATE cart_items SET quantity = ?, note = ?, updated_at = datetime('now')
       WHERE user_id = ? AND product_id = ?`
    )
    .run(quantity, note ? sanitizeText(note) : null, req.user!.user_id, productId);

  if (result.changes === 0) return res.status(404).json({ error: "Item keranjang tidak ditemukan." });
  res.json({ message: "Keranjang diperbarui." });
});

// DELETE /api/cart/:productId - hapus satu item dari keranjang.
router.delete("/:productId", authMiddleware, defaultLimiter, (req, res) => {
  const productId = Number(req.params.productId);
  db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(req.user!.user_id, productId);
  res.json({ message: "Item dihapus dari keranjang." });
});

// DELETE /api/cart - kosongkan seluruh keranjang.
router.delete("/", authMiddleware, defaultLimiter, (req, res) => {
  db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.user!.user_id);
  res.json({ message: "Keranjang dikosongkan." });
});

export default router;

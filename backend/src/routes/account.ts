import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { defaultLimiter, readLimiter, strictLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { updateProfileSchema, changePasswordSchema, shopStatusSchema } from "../validators/accountValidator";

const router = Router();

router.get("/", authMiddleware, readLimiter, (req, res) => {
  const user = db
    .prepare(
      `SELECT id, nisn, full_name, class_name, role, profile_photo_url, banner_url,
              shop_open, notif_enabled, created_at
       FROM users WHERE id = ?`
    )
    .get(req.user!.user_id);
  res.json({ user });
});

// Hanya foto profil, banner, dan preferensi notifikasi yang bisa diubah siswa
// sendiri. Nama, kelas, NISN TIDAK BISA diubah - sudah terhubung ke data NISN
// resmi sekolah.
router.put("/", authMiddleware, defaultLimiter, validate(updateProfileSchema), (req, res) => {
  const fields = req.body;
  const setClauses: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  if (setClauses.length === 0) return res.json({ message: "Tidak ada perubahan." });
  values.push(req.user!.user_id);
  db.prepare(`UPDATE users SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  res.json({ message: "Profil diperbarui." });
});

// Ganti password - wajib verifikasi password lama dulu.
router.put("/password", authMiddleware, strictLimiter, validate(changePasswordSchema), async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user!.user_id) as any;

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Password saat ini salah." });

  const password_hash = await bcrypt.hash(new_password, 10);
  // Naikkan `token_version` sekaligus supaya semua sesi lama langsung berakhir.
  //
  // Ini penting: kalau kata sandi diganti karena akun diduga dibajak, sesi
  // penyerang harus ikut putus. Tanpa ini, penyerang tetap bisa memakai
  // tokennya sampai kedaluwarsa (2 hari) meski kata sandi sudah berganti.
  db.prepare(
    "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?"
  ).run(password_hash, req.user!.user_id);
  res.json({ message: "Password berhasil diganti. Silakan login ulang." });
});

// Buka/tutup toko - SEMUA role yang bisa jualan: staf kwu_brital, kwu_laundry,
// dan siswa biasa (jualan minuman/makanan/jasa/barang). Saat tutup, produk
// seller itu tidak bisa dipesan (dicegah di routes/cart.ts & routes/orders.ts)
// dan ditandai "Tutup" di marketplace.
router.put(
  "/shop-status",
  authMiddleware,
  defaultLimiter,
  validate(shopStatusSchema),
  (req, res) => {
    db.prepare("UPDATE users SET shop_open = ?, updated_at = datetime('now') WHERE id = ?").run(
      req.body.shop_open ? 1 : 0,
      req.user!.user_id
    );
    res.json({ message: "Status toko diperbarui.", shop_open: req.body.shop_open });
  }
);

// Riwayat pesanan lengkap (brital + laundry) milik siswa sendiri.
router.get("/history", authMiddleware, readLimiter, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.full_name AS seller_name FROM orders o
       JOIN users u ON u.id = o.seller_id
       WHERE o.buyer_id = ? ORDER BY o.created_at DESC LIMIT 50`
    )
    .all(req.user!.user_id);
  res.json({ orders });
});

export default router;

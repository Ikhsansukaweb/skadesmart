import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { readLimiter } from "../middleware/rateLimiter";

const router = Router();

// GET /api/users/staff/cs - cari satu akun CS aktif (dipakai tombol "Chat CS").
// Didefinisikan SEBELUM /:id supaya "staff" tidak ketangkep sebagai :id numerik.
router.get("/staff/cs", authMiddleware, readLimiter, (req, res) => {
  const cs = db.prepare("SELECT id, full_name FROM users WHERE role = 'cs' ORDER BY id ASC LIMIT 1").get();
  if (!cs) return res.status(404).json({ error: "Belum ada staf CS yang terdaftar." });
  res.json({ cs });
});

// GET /api/users/search?query=... - cari pengguna berdasarkan nama (autocomplete),
// dipakai staf KWU Laundry supaya tidak perlu ketik NISN manual. Mencari SEMUA
// role (bukan cuma siswa) karena staf/guru pun bisa jadi pelanggan laundry.
// Dibatasi ke staf/cs/admin karena mengembalikan NISN (data yang privat).
router.get(
  "/search",
  authMiddleware,
  requireRole(["kwu_laundry", "kwu_brital", "cs", "admin"]),
  readLimiter,
  (req, res) => {
    const query = String(req.query.query || "").trim();
    if (query.length < 2) return res.json({ users: [] });

    const rows = db
      .prepare(
        `SELECT id, nisn, full_name, class_name, role FROM users
         WHERE full_name LIKE ?
         ORDER BY full_name ASC LIMIT 8`
      )
      .all(`%${query}%`);
    res.json({ users: rows });
  }
);

// GET /api/users/:id - profil publik siswa lain: foto, banner, nama, kelas,
// role, produk yang dijual (kalau ada), dan rating agregat sebagai penjual.
// NISN sengaja TIDAK ditampilkan ke publik (tetap privat), hanya dipakai
// internal (login & pencarian staf KWU Laundry).
router.get("/:id", authMiddleware, readLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID pengguna tidak valid." });

  const user = db
    .prepare(
      `SELECT id, full_name, class_name, role, profile_photo_url, banner_url, created_at
       FROM users WHERE id = ?`
    )
    .get(id);

  if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

  const products = db
    .prepare(
      `SELECT id, name, price, image_url, category, stock
       FROM products WHERE seller_id = ? AND is_active = 1
       ORDER BY created_at DESC`
    )
    .all(id);

  const ratingSummary = db
    .prepare(
      `SELECT ROUND(AVG(score),1) AS avg_rating, COUNT(*) AS rating_count
       FROM ratings WHERE seller_id = ? AND is_hidden = 0`
    )
    .get(id) as any;

  res.json({
    user,
    products,
    rating: {
      avg_rating: ratingSummary?.avg_rating || 0,
      rating_count: ratingSummary?.rating_count || 0,
    },
  });
});

export default router;

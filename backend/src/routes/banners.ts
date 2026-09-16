import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import { readLimiter, defaultLimiter } from "../middleware/rateLimiter";
import { createBannerSchema, updateBannerSchema } from "../validators/bannerValidator";
import { cache, invalidateByPrefix } from "../services/cache";

const router = Router();

// GET /api/banners - publik, dipakai carousel di Home Page. Cached singkat.
router.get("/", readLimiter, (req, res) => {
  const cached = cache.get("banners:active");
  if (cached) return res.json(cached);

  const banners = db
    .prepare("SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC")
    .all();

  const result = { banners };
  cache.set("banners:active", result, 60);
  res.json(result);
});

// GET /api/banners/all - khusus admin, termasuk yang nonaktif (halaman Kelola Banner).
router.get("/all", authMiddleware, requireRole(["admin"]), readLimiter, (req, res) => {
  const banners = db.prepare("SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC").all();
  res.json({ banners });
});

router.post("/", authMiddleware, requireRole(["admin"]), defaultLimiter, validate(createBannerSchema), (req, res) => {
  const { image_url, title, link_url, sort_order } = req.body;
  const info = db
    .prepare("INSERT INTO banners (image_url, title, link_url, sort_order) VALUES (?, ?, ?, ?)")
    .run(image_url, title || null, link_url || null, sort_order ?? 0);
  invalidateByPrefix("banners:");
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put("/:id", authMiddleware, requireRole(["admin"]), defaultLimiter, validate(updateBannerSchema), (req, res) => {
  const id = Number(req.params.id);
  const fields = req.body;
  const setClauses: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value === "" ? null : value);
  }
  if (setClauses.length === 0) return res.json({ message: "Tidak ada perubahan." });
  values.push(id);
  db.prepare(`UPDATE banners SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  invalidateByPrefix("banners:");
  res.json({ message: "Banner diperbarui." });
});

router.delete("/:id", authMiddleware, requireRole(["admin"]), defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM banners WHERE id = ?").run(id);
  invalidateByPrefix("banners:");
  res.json({ message: "Banner dihapus." });
});

export default router;

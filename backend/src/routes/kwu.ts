import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import { readLimiter, defaultLimiter } from "../middleware/rateLimiter";
import { createKwuSchema, updateKwuSchema } from "../validators/kwuValidator";
import { cache, invalidateByPrefix } from "../services/cache";

const router = Router();

// GET /api/kwu - publik (dipakai Home & Marketplace filter), cached.
router.get("/", readLimiter, (req, res) => {
  const cached = cache.get("kwu:list");
  if (cached) return res.json(cached);
  const rows = db.prepare("SELECT * FROM kwu_units WHERE is_active = 1").all();
  const result = { units: rows };
  cache.set("kwu:list", result, 60);
  res.json(result);
});

// Endpoint di bawah ini = "Edit KWU" di Dashboard Admin, wajib role admin.
router.post("/", authMiddleware, requireRole(["admin"]), defaultLimiter, validate(createKwuSchema), (req, res) => {
  const { slug, name, description, how_to_order, price_info } = req.body;
  db.prepare(
    "INSERT INTO kwu_units (slug, name, description, how_to_order, price_info) VALUES (?, ?, ?, ?, ?)"
  ).run(slug, name, description || null, how_to_order || null, price_info || null);
  invalidateByPrefix("kwu:");
  res.status(201).json({ message: "Unit KWU ditambahkan." });
});

router.put("/:id", authMiddleware, requireRole(["admin"]), defaultLimiter, validate(updateKwuSchema), (req, res) => {
  const id = Number(req.params.id);
  const fields = req.body;
  const setClauses: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  if (setClauses.length === 0) return res.json({ message: "Tidak ada perubahan." });
  values.push(id);
  db.prepare(`UPDATE kwu_units SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  invalidateByPrefix("kwu:");
  res.json({ message: "Unit KWU diperbarui." });
});

router.delete("/:id", authMiddleware, requireRole(["admin"]), defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE kwu_units SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  invalidateByPrefix("kwu:");
  res.json({ message: "Unit KWU dinonaktifkan." });
});

export default router;

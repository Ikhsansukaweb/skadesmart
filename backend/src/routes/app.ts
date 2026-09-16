import { Router } from "express";
import { db } from "../db";

const router = Router();

// GET /api/app/version - dipakai frontend untuk App/Build Version Check.
router.get("/version", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM app_config").all() as { key: string; value: string }[];
  const config: Record<string, string> = {};
  rows.forEach((r) => (config[r.key] = r.value));

  res.json({
    latest_version: config.latest_version || "1.0.0",
    min_supported_version: config.min_supported_version || "1.0.0",
    force_update: config.force_update === "true",
    update_message: config.update_message || "",
  });
});

export default router;

import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/authMiddleware";
import { uploadLimiter } from "../middleware/rateLimiter";
import { uploadToCatbox } from "../services/catbox";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from "../validators/uploadValidator";

const router = Router();

// Memory storage saja - tidak ada file yang disimpan permanen di disk server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
});

// POST /api/upload/image - wajib JWT, forward ke Catbox, simpan URL saja.
router.post("/image", authMiddleware, uploadLimiter, upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "File tidak ditemukan." });

    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ error: "Tipe file harus JPEG, PNG, atau WebP." });
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return res.status(400).json({ error: "Ukuran file maksimal 5MB." });
    }

    const url = await uploadToCatbox(file.buffer, file.originalname);
    res.json({ url });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/upload/images - upload BANYAK foto sekaligus (2,3,4,5+), dipakai
// form tambah produk & jualan siswa yang butuh galeri foto lebih dari satu.
router.post("/images", authMiddleware, uploadLimiter, upload.array("files", 8), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: "File tidak ditemukan." });

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        return res.status(400).json({ error: "Semua file harus JPEG, PNG, atau WebP." });
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return res.status(400).json({ error: "Setiap file maksimal 5MB." });
      }
    }

    const urls = await Promise.all(files.map((f) => uploadToCatbox(f.buffer, f.originalname)));
    res.json({ urls });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;

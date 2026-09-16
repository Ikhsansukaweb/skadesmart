import { Request, Response, NextFunction } from "express";
import { verifyToken, AUTH_COOKIE_NAME, JwtPayload } from "../utils/jwt";
import { db } from "../db";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Wajib untuk semua endpoint yang butuh identitas user.
 * Membaca JWT dari httpOnly cookie (bukan Authorization header/localStorage),
 * supaya token tidak bisa dibaca lewat JS jika terjadi XSS.
 *
 * Selain memeriksa tanda tangan token, fungsi ini juga mencocokkan
 * `token_version` dengan nilai di basis data. Dengan begitu token lama
 * langsung tidak berlaku setelah pengguna logout atau mengganti kata sandi -
 * sebelumnya token tetap sah sampai kedaluwarsa (2 hari) meski sudah logout.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Tidak terautentikasi. Silakan login." });
  }

  let isi: JwtPayload;
  try {
    isi = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Sesi tidak valid atau kedaluwarsa. Silakan login ulang." });
  }

  // Cocokkan versi token dengan basis data.
  //
  // Kalau baris pengguna tidak ditemukan, akunnya sudah dihapus - token harus
  // ditolak. Kalau versinya berbeda, token ini diterbitkan sebelum logout atau
  // sebelum kata sandi diganti - juga harus ditolak.
  try {
    const baris = db
      .prepare("SELECT token_version FROM users WHERE id = ?")
      .get(isi.user_id) as { token_version: number } | undefined;

    if (!baris) {
      return res.status(401).json({ error: "Akun tidak ditemukan. Silakan login ulang." });
    }

    const versiToken = Number(isi.token_version ?? 1);
    if (Number(baris.token_version ?? 1) !== versiToken) {
      return res.status(401).json({ error: "Sesi sudah berakhir. Silakan login ulang." });
    }
  } catch {
    // Kalau pemeriksaan versi gagal karena masalah basis data, JANGAN loloskan
    // permintaan - lebih baik memaksa login ulang daripada menerima token yang
    // mungkin sudah dibatalkan.
    return res.status(401).json({ error: "Sesi tidak dapat diverifikasi. Silakan login ulang." });
  }

  req.user = isi;
  next();
}

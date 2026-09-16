import { Request, Response, NextFunction } from "express";
import { Role } from "../utils/jwt";

/**
 * Dipasang SETELAH authMiddleware. Menolak 403 jika role user tidak
 * termasuk salah satu allowedRoles.
 */
export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Tidak terautentikasi." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Akses ditolak. Role tidak memenuhi syarat." });
    }
    next();
  };
}

export const requireKwuSeller = requireRole(["kwu_brital", "kwu_laundry", "admin"]);

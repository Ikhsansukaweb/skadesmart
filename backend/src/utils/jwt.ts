import jwt from "jsonwebtoken";

export type Role = "siswa" | "kwu_brital" | "kwu_laundry" | "cs" | "admin";

export interface JwtPayload {
  user_id: number;
  nisn: string;
  role: Role;
  /**
   * Nomor versi token milik pengguna saat token ini diterbitkan.
   *
   * Dicocokkan dengan kolom `users.token_version` pada setiap permintaan.
   * Kalau nilainya dinaikkan (logout, ganti kata sandi), token lama otomatis
   * tidak sah - tanpa ini, JWT tetap bisa dipakai sampai kedaluwarsa meski
   * pengguna sudah logout.
   */
  token_version?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable is required in production");
    }
    // Development only - use a consistent dev secret but warn
    console.warn("[JWT] WARNING: Using default development secret. Set JWT_SECRET in production!");
    return "dev_secret_change_in_production_min_32_chars_long";
  }
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }
  return secret;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2d";

export function signToken(payload: JwtPayload): string {
  const options: jwt.SignOptions = {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign(payload, getJwtSecret(), options);
}

export function verifyToken(token: string): JwtPayload {
  // `algorithms` WAJIB dipatok. Kalau tidak, jsonwebtoken mempercayai algoritma
  // yang tertulis di header token, sehingga penyerang bisa mencoba
  // "algorithm confusion" (mis. memaksa alg:none atau RS256->HS256).
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  }) as JwtPayload;
}

export const AUTH_COOKIE_NAME = "skadesmart_token";

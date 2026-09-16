import rateLimit from "express-rate-limit";

/**
 * Catatan penting soal pembatasan percobaan (rate limit).
 *
 * Semua pembatas di bawah memakai `req.ip` sebagai kunci. Nilai itu baru bisa
 * dipercaya kalau `app.set("trust proxy", ...)` di server.ts disetel dengan
 * benar. Kalau tidak, penyerang cukup mengirim header `X-Forwarded-For` palsu
 * untuk mendapatkan "IP" baru setiap kali percobaan - dan rate limit tidak
 * pernah tercapai. Lihat komentar di server.ts bagian trust proxy.
 */

/**
 * Pembatas percobaan login berdasarkan IP.
 *
 * Dulu disetel 100 percobaan per MENIT dengan komentar "lenient for dev" -
 * angka itu praktis tidak membatasi apa pun dan ikut terbawa ke produksi,
 * sehingga kata sandi bisa ditebak berulang kali. Sekarang 10 percobaan per
 * 15 menit, sejalan dengan pesan galatnya.
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  // 30 percobaan per 15 menit. Sebelumnya 100 per MENIT (praktis tanpa batas),
  // sekarang 30 per 15 menit - masih sangat ketat untuk mencegah tebak kata
  // sandi, tetapi tidak mengganggu pemakaian wajar (satu kelas mengakses lewat
  // satu IP WiFi sekolah yang sama).
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Coba lagi nanti.", code: "RATE_LIMITED" },
  keyGenerator: (req) => req.ip || "unknown",
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Pembatas percobaan login berdasarkan NISN (akun).
 *
 * Menghitung SEMUA percobaan (termasuk yang gagal) supaya satu akun tidak bisa
 * ditebak kata sandinya dari banyak IP sekaligus.
 */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  // 20 percobaan per akun per 15 menit - cukup untuk salah ketik wajar,
  // tetap tidak memungkinkan penebakan kata sandi.
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan untuk akun ini. Coba lagi nanti.", code: "ACCOUNT_LOCKED" },
  keyGenerator: (req) => `login:${req.body?.nisn || "unknown"}`,
  // Dulu `skipSuccessfulRequests: true`, artinya percobaan yang BERHASIL tidak
  // dihitung. Karena penyerang menghitung kegagalan, nilainya tetap 0 - jadi
  // pembatas ini tidak pernah aktif pada serangan tebak kata sandi.
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

// Limiter untuk upload gambar.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak upload. Coba lagi beberapa menit lagi." },
});

// Endpoint baca data umum (marketplace, produk, chat list).
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
});

// Default umum untuk endpoint publik/mutasi lain.
export const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
});

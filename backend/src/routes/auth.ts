import { Router } from "express";
import { setCsrfCookie, clearCsrfCookie } from "../middleware/csrf";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { validate } from "../middleware/validate";
import { authMiddleware } from "../middleware/authMiddleware";
import { strictLimiter, loginAccountLimiter } from "../middleware/rateLimiter";
import { loginSchema } from "../validators/authValidator";
import { signToken, verifyToken, AUTH_COOKIE_NAME } from "../utils/jwt";

const router = Router();

/**
 * Hash bcrypt tiruan, dipakai saat NISN tidak ditemukan.
 *
 * Tujuannya menyamakan WAKTU respons: kalau NISN tidak ada kita tetap
 * menjalankan perbandingan bcrypt, sehingga permintaan tidak bisa dibedakan
 * dari kasus kata sandi salah hanya berdasarkan kecepatan balasan
 * (timing attack / user enumeration).
 */
const HASH_TIRUAN = "$2a$10$zi1EXsvRNtzfWd.EOvNu/e10xvnZOIY1nFhQEK0yzeY/WsfHYkMBW";

const isProd = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  // Frontend (skadesmart.web.id) dan API (api.skadesmart.web.id) berada di
  // subdomain yang berbeda, jadi bagi browser ini permintaan LINTAS SITUS.
  // Dengan "strict", cookie TIDAK ikut terkirim sehingga semua permintaan
  // chat/pesanan gagal 401 meski pengguna sudah login. Karena itu di produksi
  // dipakai "none" (wajib berpasangan dengan secure: true).
  sameSite: (isProd ? "none" : "lax") as "none" | "lax" | "strict",
  maxAge: 2 * 24 * 60 * 60 * 1000,
  path: "/",
};

/**
 * Buat sesi login.
 *
 * Dulu mengembalikan Firebase Custom Token supaya frontend bisa login ke
 * Firestore. Sekarang tidak perlu: WebSocket dan Web Push memakai JWT backend
 * yang sama, jadi token itu dikembalikan untuk dipakai klien.
 */
async function issueSession(req: any, res: any, user: any) {
  const token = signToken({
    user_id: user.id,
    nisn: user.nisn,
    role: user.role,
    // Sertakan versi token saat ini. Kalau nanti dinaikkan (logout / ganti kata
    // sandi), token ini otomatis tidak sah - lihat middleware/authMiddleware.ts
    token_version: Number(user.token_version ?? 1),
  });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
  // Terbitkan token CSRF sekaligus. Klien membacanya dari cookie `csrf_token`
  // lalu mengirimnya kembali di header `x-csrf-token` pada setiap permintaan
  // yang mengubah data (lihat frontend/lib/api.ts).
  const csrfToken = setCsrfCookie(res, undefined, req);
  // Kembalikan juga token CSRF-nya: cookie-nya tersimpan di domain API dan
  // TIDAK BISA dibaca JavaScript halaman (beda domain) - lihat penjelasan
  // lengkap di rute GET /csrf di bawah.
  return { token, csrfToken };
}

// Login KETAT: NISN harus sudah terdaftar (via seed data sekolah) dan password
// harus cocok dengan hash tersimpan. TIDAK ADA auto-register di sini dan
// TIDAK ADA password yang "keterima asal isi" - keduanya bug dari versi
// sebelumnya, sekarang diperbaiki.
// Rate limiting: strictLimiter (5/IP/15min) + loginAccountLimiter (5/account/15min)
router.post("/login", strictLimiter, loginAccountLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { nisn, password } = req.body;

    const user = db.prepare("SELECT * FROM users WHERE nisn = ?").get(nisn) as any;
    if (!user) {
      // Catat di log server untuk keperluan audit, tetapi JANGAN bedakan
      // balasannya kepada klien.
      //
      // Sebelumnya balasannya 404 dengan pesan "NISN belum terdaftar", sehingga
      // penyerang bisa membedakan NISN yang TERDAFTAR (401) dari yang TIDAK
      // (404). Dengan mengirim banyak NISN, daftar siswa bisa dipetakan tanpa
      // login (user enumeration).
      //
      // Sekarang balasannya disamakan dengan kasus kata sandi salah. Untuk
      // menghemat waktu (dan menyamakan waktu respons), tetap jalankan
      // perbandingan bcrypt terhadap hash tiruan supaya durasinya mirip.
      console.warn(`[AUTH] Percobaan login untuk NISN tidak terdaftar: ${nisn} dari IP: ${req.ip}`);
      await bcrypt.compare(password, HASH_TIRUAN);
      return res.status(401).json({ error: "NISN atau password salah." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Log failed attempt for existing account
      console.warn(`[AUTH] Failed login attempt for NISN: ${nisn} from IP: ${req.ip}`);
      return res.status(401).json({ error: "NISN atau password salah." });
    }

    // Log successful login
    console.log(`[AUTH] Successful login for NISN: ${nisn} (role: ${user.role}) from IP: ${req.ip}`);

    const { token, csrfToken } = await issueSession(req, res, user);
    res.json({
      user: {
        id: user.id,
        nisn: user.nisn,
        full_name: user.full_name,
        class_name: user.class_name,
        role: user.role,
        profile_photo_url: user.profile_photo_url,
      },
      // JWT backend. Dipakai frontend untuk WebSocket (/ws?token=...) dan
      // sebagai cadangan Authorization header. Dulu ini Firebase Custom Token.
      token,
      // Token CSRF untuk header `x-csrf-token`. Dikirim lewat body karena
      // cookie-nya berada di domain API yang tidak bisa dibaca JS halaman.
      csrf_token: csrfToken,
    });
  } catch (err) {
    next(err);
  }
});


router.post("/logout", (req, res) => {
  // Naikkan versi token pengguna supaya SEMUA token yang sudah diterbitkan
  // tidak berlaku lagi di server - bukan sekadar menghapus cookie di browser.
  //
  // Tanpa ini, token yang sudah tersalin (mis. dari riwayat perangkat lain,
  // atau yang dicuri lewat XSS) tetap bisa dipakai sampai kedaluwarsa meski
  // pengguna sudah menekan Logout.
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (token) {
    try {
      const isi = verifyToken(token);
      db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(isi.user_id);
    } catch {
      // Token sudah tidak sah - tidak ada yang perlu dibatalkan.
    }
  }

  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  clearCsrfCookie(res);
  res.json({ message: "Logout berhasil." });
});

// Terbitkan ulang cookie CSRF.
//
// Berguna untuk pengguna yang sudah login SEBELUM fitur CSRF dipasang, atau
// yang cookie CSRF-nya kedaluwarsa lebih cepat daripada cookie sesi. Frontend
// memanggil ini sekali lalu mencoba ulang permintaannya (lihat lib/api.ts).
router.get("/csrf", (req, res) => {
  // Kembalikan tokennya di BODY, bukan hanya di cookie.
  //
  // KENAPA: halaman web ada di `skadesmart.web.id`, sedangkan API di
  // `api.skadesmart.web.id`. Cookie apa pun yang disetel API akan tersimpan di
  // domain `api.skadesmart.web.id`, dan JavaScript di halaman TIDAK BISA
  // membacanya - itu aturan Same-Origin Policy browser, tidak bisa ditembus.
  //
  // Akibatnya pola double-submit-cookie tidak berfungsi: frontend tidak pernah
  // tahu tokennya, tidak pernah mengirim header `x-csrf-token`, dan SEMUA
  // permintaan yang mengubah data ditolak 403.
  //
  // Dengan mengembalikan token di body, frontend menyimpannya di memori
  // (variabel JavaScript) lalu mengirimnya sebagai header. Situs penyerang
  // tetap tidak bisa membacanya karena diblokir CORS + Same-Origin Policy.
  const token = setCsrfCookie(res, undefined, req);
  res.json({ ok: true, csrf_token: token });
});

router.get("/me", authMiddleware, (req, res) => {
  const user = db
    .prepare(
      `SELECT id, nisn, full_name, class_name, role, profile_photo_url, notif_enabled
       FROM users WHERE id = ?`
    )
    .get(req.user!.user_id);
  if (!user) return res.status(404).json({ error: "User tidak ditemukan." });
  res.json({ user });
});

// GET /api/auth/ws-token - token untuk membuka koneksi WebSocket.
//
// Dulu di sini ada /firebase-token yang menerbitkan Firebase Custom Token.
// Sekarang frontend cukup memakai JWT backend yang sama; rute ini ada supaya
// halaman yang di-refresh bisa mengambil token baru tanpa login ulang
// (cookie httpOnly tidak bisa dibaca JavaScript, jadi perlu diambil di sini).
router.get("/ws-token", authMiddleware, strictLimiter, (req, res) => {
  const user = db.prepare("SELECT id, nisn, role FROM users WHERE id = ?").get(
    req.user!.user_id,
  ) as any;
  if (!user) return res.status(404).json({ error: "User tidak ditemukan." });

  const token = signToken({ user_id: user.id, nisn: user.nisn, role: user.role });
  res.json({ token });
});

// POST /api/auth/notif - nyalakan/matikan notifikasi untuk akun ini.
//
// Menggantikan /fcm-token: dulu yang disimpan adalah token perangkat FCM,
// sekarang cukup satu saklar, karena Web Push menyimpan langganan perangkatnya
// sendiri di tabel push_subscriptions.
router.post("/notif", authMiddleware, strictLimiter, (req, res) => {
  const enabled = req.body?.enabled !== false;
  db.prepare("UPDATE users SET notif_enabled = ? WHERE id = ?").run(
    enabled ? 1 : 0,
    req.user!.user_id,
  );
  res.json({ ok: true, notif_enabled: enabled });
});

// Rute /fcm-token dihapus: token perangkat FCM tidak dipakai lagi.
// Langganan notifikasi sekarang disimpan per perangkat lewat
// POST /api/chats/push/langganan (Web Push VAPID).

export default router;

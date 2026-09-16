import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * CSRF Protection using Double-Submit Cookie Pattern
 * - Generates a CSRF token stored in a cookie (SameSite=Strict)
 * - Requires the same token in a custom header for state-changing requests
 * - Only applied to mutating methods (POST, PUT, PATCH, DELETE)
 */

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only protect state-changing methods
  const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Skip for paths that don't need CSRF (e.g., login, webhooks)
  const skipPaths = [
    "/api/auth/login",
    "/api/auth/logout",
    "/api/upload/image",
    "/api/upload/images",
  ];
  if (skipPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  // Ambil SEMUA nilai cookie bernama sama, bukan hanya yang pertama.
  //
  // KENAPA: kalau server pernah menerbitkan token lebih dari sekali, browser
  // menyimpan BEBERAPA cookie bernama `csrf_token` untuk domain yang sama
  // (browser tidak otomatis menghapus yang lama karena hanya satu nama yang
  // boleh ada per path - tetapi Path/atribut yang berbeda membuat keduanya
  // bertahan). Browser lalu mengirim KEDUANYA:
  //     Cookie: csrf_token=<LAMA>; csrf_token=<BARU>
  //
  // `cookie-parser` mengambil yang PERTAMA (LAMA), sementara JavaScript di
  // frontend membaca `document.cookie` yang cenderung melihat yang TERAKHIR
  // (BARU). Akibatnya token cookie dan header tidak pernah cocok dan SEMUA
  // permintaan ditolak 403 - aplikasi rusak meski keamanannya "benar".
  //
  // Dengan memeriksa semua nilai, kita menerima token selama SALAH SATU cocok.
  const cookieMentah = req.headers.cookie || "";
  const nilaiCookie = cookieMentah
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))
    .map((c) => decodeURIComponent(c.slice(CSRF_COOKIE_NAME.length + 1)));

  // Tetap sertakan hasil `cookie-parser` sebagai cadangan.
  const dariParser = req.cookies?.[CSRF_COOKIE_NAME];
  if (dariParser && !nilaiCookie.includes(dariParser)) nilaiCookie.push(dariParser);

  // Nilai header juga bisa berisi lebih dari satu (dipisah koma) - ambil semua.
  const headerMentah = String(req.headers[CSRF_HEADER_NAME] ?? "");
  const nilaiHeader = headerMentah
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  if (nilaiCookie.length === 0 || nilaiHeader.length === 0) {
    return res.status(403).json({
      error: "CSRF token missing. Please refresh the page and try again.",
      code: "CSRF_MISSING",
    });
  }

  // Bandingkan token dengan aman.
  //
  // `crypto.timingSafeEqual` MELEMPAR galat kalau panjang kedua buffer berbeda,
  // bukan mengembalikan false. Tanpa pemeriksaan panjang lebih dulu, token
  // palsu berukuran lain membuat permintaan gagal dengan HTTP 500 - sekaligus
  // membocorkan bahwa panjang token itu penting (bocoran informasi kecil).
  // Cocokkan semua kombinasi cookie x header. Selama SATU pasangan sama persis
  // (dan panjangnya sama), permintaan diterima.
  //
  // `crypto.timingSafeEqual` MELEMPAR galat kalau panjang buffer berbeda, jadi
  // panjang wajib diperiksa lebih dulu - kalau tidak, token yang panjangnya
  // beda membuat server membalas 500, bukan 403.
  let cocok = false;
  for (const nilaiC of nilaiCookie) {
    for (const nilaiH of nilaiHeader) {
      const bufCookie = Buffer.from(nilaiC);
      const bufHeader = Buffer.from(nilaiH);
      if (
        bufCookie.length === bufHeader.length &&
        crypto.timingSafeEqual(bufCookie, bufHeader)
      ) {
        cocok = true;
        break;
      }
    }
    if (cocok) break;
  }

  if (!cocok) {
    console.warn(`[CSRF] Token mismatch from IP: ${req.ip}, path: ${req.path}`);
    return res.status(403).json({
      error: "CSRF token invalid. Please refresh the page and try again.",
      code: "CSRF_INVALID",
    });
  }

  next();
}

/**
 * Sets CSRF token cookie for the client
 * Call this after successful authentication (login, token refresh)
 *
 * PENTING: cookie ini SENGAJA `httpOnly: false`.
 *
 * Ini pola double-submit cookie: server menaruh token di cookie, lalu klien
 * membacanya lewat JavaScript dan mengirimkannya kembali di header
 * `x-csrf-token`. Penyerang dari situs lain TIDAK BISA membaca cookie ini
 * (terhalang Same-Origin Policy), sehingga tidak dapat menyalin tokennya -
 * itulah yang membuat pola ini aman meski cookie-nya terbaca JavaScript.
 *
 * Kalau `httpOnly` disetel `true`, klien tidak dapat membaca token dan SEMUA
 * permintaan POST/PUT/DELETE akan ditolak 403 (aplikasi rusak total).
 * Jangan mengubahnya tanpa menyesuaikan sisi frontend (lib/api.ts).
 */
export function setCsrfCookie(res: Response, token?: string, req?: Request): string {
  // Pakai ulang token yang SUDAH dimiliki klien kalau masih ada.
  //
  // KENAPA: kalau setiap login menerbitkan token BARU dengan nama cookie yang
  // sama, browser menahan token lama (Path/atribut berbeda) lalu mengirim
  // KEDUANYA. Server dan frontend bisa membaca nilai yang berbeda -> 403 terus
  // menerus. Dengan memakai ulang token yang ada, hanya ada SATU nilai dan
  // tidak ada penumpukan.
  //
  // Token baru hanya dibuat kalau klien memang belum punya (login pertama).
  const dariKlien = req?.cookies?.[CSRF_COOKIE_NAME];
  const csrfToken = token || dariKlien || generateCsrfToken();
  const isProd = process.env.NODE_ENV === "production";

  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isProd,
    // WAJIB `none`, BUKAN `lax`.
    //
    // Halaman web ada di `skadesmart.web.id` sedangkan API ada di
    // `api.skadesmart.web.id` - untuk aturan SameSite keduanya adalah SITUS
    // yang BERBEDA. Dengan `lax`, browser TIDAK mengirim cookie ini saat
    // frontend memanggil API lintas-situs, sehingga:
    //   - `document.cookie` di frontend kosong (token tak terbaca)
    //   - header `x-csrf-token` tidak pernah ikut terkirim
    //   - SEMUA POST/PUT/PATCH/DELETE ditolak 403 dan aplikasi rusak total
    //
    // Cookie JWT sesi sudah memakai `none`; cookie ini harus sama agar konsisten.
    // `none` mewajibkan `secure: true`, yang memang sudah dipenuhi di produksi.
    sameSite: isProd ? "none" : "lax",
    maxAge: 2 * 24 * 60 * 60 * 1000, // 2 hari (sama dengan cookie sesi)
    path: "/",
  });

  return csrfToken;
}

/**
 * Clear CSRF cookie on logout
 */
export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
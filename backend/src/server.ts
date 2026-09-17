// Muat variabel lingkungan dari berkas `.env` yang letaknya DIJAMIN benar.
//
// `import "dotenv/config"` hanya membaca `.env` dari folder kerja saat proses
// dijalankan. Kalau proses dijalankan dari folder lain (mis. oleh PM2), berkas
// itu tidak ditemukan dan SEMUA variabel diam-diam kosong - tanpa pesan error.
// Itu pernah menyebabkan CATBOX_USERHASH tidak terbaca, sehingga upload foto
// gagal dan gambar tampil kosong.
//
// Di sini path-nya dihitung dari lokasi berkas ini, bukan dari folder kerja,
// sehingga selalu menemukan backend/.env apa pun cara menjalankannya.
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const akarBackend = path.resolve(__dirname, "..");
const berkasEnv = path.join(akarBackend, ".env");

if (fs.existsSync(berkasEnv)) {
  dotenv.config({ path: berkasEnv });
} else {
  // Masih coba perilaku bawaan sebagai cadangan.
  dotenv.config();
  console.warn(`[env] Berkas .env tidak ditemukan di ${berkasEnv} - memakai variabel lingkungan yang ada.`);
}

import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import { runMigrations } from "./db";
import { defaultLimiter } from "./middleware/rateLimiter";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { securityAuditMiddleware } from "./middleware/securityAudit";
import { csrfMiddleware } from "./middleware/csrf";
import { allowedOrigins } from "./config/origins";
import { pasangWebSocket } from "./services/wsHub";
import { siapkanWebPush } from "./services/webPush";

import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import orderRoutes from "./routes/orders";
import chatRoutes from "./routes/chat";
import ratingRoutes from "./routes/ratings";
import accountRoutes from "./routes/account";
import adminRoutes from "./routes/admin";
import csRoutes from "./routes/cs";
import uploadRoutes from "./routes/upload";
import appRoutes from "./routes/app";
import kwuRoutes from "./routes/kwu";
import cartRoutes from "./routes/cart";
import usersRoutes from "./routes/users";
import bannerRoutes from "./routes/banners";
import wishlistRoutes from "./routes/wishlist";
import variantRoutes from "./routes/variants";
import etalaseRoutes from "./routes/etalase";
import { jalankanMigrasiV3 } from "./db/migrasiV3";
import { jalankanMigrasiV4 } from "./db/migrasiV4";

runMigrations();
// Migrasi v3: ubah products.category ke kategori baru + tambah kolom baru.
// Aman dijalankan berulang kali (setiap langkah memeriksa dulu).
jalankanMigrasiV3();

// Migrasi v4: tambah kategori 'barang' pada CHECK constraint products.category.
// Aman dijalankan berulang kali (berhenti sendiri kalau 'barang' sudah ada).
jalankanMigrasiV4();

const app = express();

// ---------------------------------------------------------------------------
// Kepercayaan pada proxy (trust proxy)
// ---------------------------------------------------------------------------
// Backend ini TIDAK pernah diakses langsung oleh browser. Semua lalu lintas
// masuk lewat Cloudflare Tunnel (cloudflared) yang meneruskan permintaan ke
// port 3737 dan menambahkan header X-Forwarded-For.
//
// Kenapa pengaturan ini penting untuk keamanan: beberapa pembatas percobaan
// login (rate limit) memakai `req.ip` sebagai kunci. Express hanya mengambil
// nilai dari X-Forwarded-For kalau `trust proxy` disetel. Kalau disetel terlalu
// longgar (`true`), penyerang cukup mengirim header X-Forwarded-For palsu untuk
// mendapatkan "IP" baru di setiap percobaan - rate limit tidak akan pernah
// tercapai dan kata sandi bisa ditebak tanpa batas.
//
// Nilai 1 berarti: percayai HANYA satu lapisan proxy terakhir (cloudflared).
// Kalau nanti backend diakses langsung tanpa proxy, setel ke `false` supaya
// header X-Forwarded-For dari klien diabaikan sepenuhnya.
//
// Ubah lewat env var supaya tidak perlu menyentuh kode:
//   TRUST_PROXY=1     (default, lewat Cloudflare Tunnel)
//   TRUST_PROXY=false (diakses langsung, tanpa proxy)
const trustProxy = process.env.TRUST_PROXY ?? "1";
app.set("trust proxy", trustProxy === "false" ? false : Number(trustProxy) || 1);

const isProd = process.env.NODE_ENV === "production";

// Enhanced CSP for API backend (stricter than frontend)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:", "https://files.catbox.moe", "https://n.uguu.se", "https://tmpfiles.org", "blob:"],
        "font-src": ["'self'", "data:"],
        // Domain Firebase dihapus - real-time sekarang lewat WebSocket ke
        // server sendiri (wss://api.skadesmart.web.id) dan notifikasi lewat
        // Web Push (endpoint push milik browser, bukan domain Google).
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "object-src": ["'none'"],
        "frame-src": ["'none'"],
        "worker-src": ["'self'"],
        "manifest-src": ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  })
);

// Additional security headers not covered by helmet
app.use((req, res, next) => {
  // Prevent caching of sensitive responses
  if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// CORS ketat - tidak pakai wildcard, whitelist eksplisit dari .env, credentials
// diaktifkan supaya httpOnly cookie JWT ikut terkirim (bagian 12.2).
//
// CATATAN: origin HARUS ditulis lengkap dengan skema dan tanpa garis miring di
// akhir, karena browser membandingkannya persis dengan header Origin.
// Daftar origin dipakai bersama dengan pemeriksaan Origin pada WebSocket.
// Lihat src/config/origins.ts - jangan menulis daftar terpisah di sini.
// (allowedOrigins diimpor di bagian atas berkas.)

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // `x-csrf-token` ikut diizinkan supaya permintaan yang menyertakan token
    // CSRF tidak ditolak saat preflight (OPTIONS). Tanpa ini browser
    // menghentikan permintaan sebelum dikirim.
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-csrf-token",
      "X-CSRF-Token",
      "Accept",
      "Origin",
    ],
    maxAge: 86400, // Cache preflight for 24 hours
  })
);

app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Logging response time per endpoint untuk memantau bottleneck (bagian 8).
morgan.token("body-size", (req, res) => String(res.getHeader("content-length") || 0));
app.use(morgan(":method :url :status :response-time ms - :body-size bytes"));

app.use(defaultLimiter);

// Security audit logging for sensitive endpoints
app.use(securityAuditMiddleware);

// ---------------------------------------------------------------- CSRF
// Melindungi permintaan yang mengubah data (POST/PUT/PATCH/DELETE) dengan pola
// double-submit cookie: token di cookie `csrf_token` harus sama dengan header
// `x-csrf-token`.
//
// Sebelumnya middleware ini ADA tapi TIDAK PERNAH DIPASANG, sehingga seluruh
// permintaan lintas-origin diterima tanpa token apa pun. Akibatnya halaman
// jahat bisa memaksa pengguna yang sedang login melakukan aksi (ubah profil,
// hapus produk, kirim pesan) hanya dengan mengunjungi situs penyerang.
//
// Wajib dipasang SETELAH `cookieParser()` supaya `req.cookies` sudah terisi.
app.use(csrfMiddleware);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cs", csRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/app", appRoutes);
app.use("/api/kwu", kwuRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/banners", bannerRoutes);
// Rute baru Tahap 2 & 5 (rombakan ala Tokopedia).
app.use("/api", wishlistRoutes);   // /api/wishlist/* · /api/follow/* · /api/toko/*
app.use("/api/variants", variantRoutes);
app.use("/api/etalase", etalaseRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// WebSocket + Web Push
//
// Server HTTP dibuat eksplisit (bukan app.listen) supaya WebSocket bisa
// menumpang pada server yang sama lewat jalur /ws. Ini menggantikan peran
// Firestore (real-time) dan FCM (notifikasi).
// ---------------------------------------------------------------------------
const server = createServer(app);
pasangWebSocket(server);

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
  console.log(`SkadesMart backend berjalan di http://localhost:${PORT}`);
  console.log(`WebSocket siap di ws://localhost:${PORT}/ws`);
  console.log(`[env] Berkas konfigurasi: ${fs.existsSync(berkasEnv) ? berkasEnv : "TIDAK DITEMUKAN"}`);
  // Diperiksa sekali saat start supaya masalah konfigurasi langsung terlihat
  // di log, bukan baru ketahuan saat pengguna mengirim foto.
  console.log(`[env] CATBOX_USERHASH: ${process.env.CATBOX_USERHASH ? "ADA" : "KOSONG (upload anonim - berkas bisa terhapus otomatis)"}`);
  console.log(`[env] JWT_SECRET: ${process.env.JWT_SECRET ? "ADA" : "KOSONG (BERBAHAYA)"}`);
  console.log(`[env] VAPID: ${process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? "ADA" : "KOSONG (notifikasi push mati)"}`);
  siapkanWebPush();
});

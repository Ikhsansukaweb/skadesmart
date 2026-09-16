# LAPORAN AUDIT KEAMANAN SkadesMart — Kerentanan #1 s.d. #5

- **Target**: `/home/ikhsan/Documents/skadesmart`
- **Backend**: Express + SQLite (`better-sqlite3`), port 3737 (PM2 `skades-backend`)
- **Frontend**: Next.js 16 (App Router) + Tailwind, port 3000 (PM2 `skades-frontend`)
- **Metode**: pembacaan kode statis + verifikasi HTTP langsung (curl) ke backend yang berjalan. **Tidak ada kode yang diubah.** Tidak memakai Chrome headless/CDP (sesuai aturan keselamatan).
- **Status ringkas**: 3 temuan BELUM DIPERBAIKI (1 HIGH, 2 MEDIUM), 2 TIDAK BERLAKU dengan alasan teknis.

---

## RINGKASAN EKSEKUTIF

| # | Kerentanan | Risk | Status | Bukti utama |
|---|-----------|------|--------|-------------|
| 1 | SQL / NoSQL Injection | — | **TIDAK BERLAKU** | Semua query SQLite parameterized; semua validator `.strict()` |
| 2 | Broken Authentication | **HIGH** | **BELUM** | Rate-limit login 100/menit; JWT dikembalikan di body JSON |
| 3 | XSS | — | **TIDAK BERLAKU** | DOMPurify di server; React auto-escape; 0 `dangerouslySetInnerHTML` |
| 4 | CSRF | **MEDIUM** | **BELUM** | `csrfMiddleware` tidak pernah dipasang; token tidak pernah dibuat |
| 5 | Broken Access Control / RBAC | **MEDIUM** | **BELUM** | `admin` tidak bisa lihat `/api/orders/incoming`; endpoint KWU tidak memverifikasi `kwu_unit` order |

---

## [#1 SQL / NoSQL INJECTION] - TIDAK BERLAKU

- **Berkas & Baris Kode**: seluruh `backend/src/routes/*.ts`, `backend/src/services/*.ts`, `backend/src/db/index.ts`
- **Status**: **TIDAK BERLAKU** (dengan catatan di bawah)
- **Skenario Eksploitasi**: Tidak dapat dieksploitasi.

### Analisis

Aplikasi memakai **SQLite** (`better-sqlite3`) — tidak ada MongoDB/NoSQL sama sekali di proyek (`grep -ri "mongo\|mongoose"` = 0 hasil), sehingga klausa "NoSQL Injection" tidak relevan.

Seluruh query dinamis memakai **prepared statement dengan placeholder `?`**, mis.:

- `backend/src/routes/auth.ts:48` → `db.prepare("SELECT * FROM users WHERE nisn = ?").get(nisn)`
- `backend/src/routes/products.ts:58-59` → `where += " AND p.name LIKE ?"; params.push(`%${search}%`)`
- `backend/src/services/aiChat.ts:55-64` → `conditions = words.map(() => "p.name LIKE ?").join(" OR ")` + `.all(...params)`

Ada 5 lokasi yang membangun klausa `SET` secara dinamis dari **nama key objek** (bukan nilai), yaitu:

| Berkas:baris | Potongan |
|---|---|
| `backend/src/routes/products.ts:172,178` | `setClauses.push(`${key} = ?`)` → `UPDATE products SET ${setClauses.join(", ")} ...` |
| `backend/src/routes/account.ts:32,37` | idem untuk `users` |
| `backend/src/routes/kwu.ts:39,44` | idem untuk `kwu_units` |
| `backend/src/routes/banners.ts:48,53` | idem untuk `banners` |
| `backend/src/routes/chat.ts:209-210` | `const column = chat.buyer_id === req.user!.user_id ? "muted_by_buyer" : "muted_by_seller"` |

Pola ini **berpotensi** SQLi lewat mass-assignment (key berbahaya seperti `"id = 1, role = 'admin'"`). Namun **tertutup** karena setiap route tersebut memasang validator Zod dengan `.strict()` tepat sebelum handler:

- `backend/src/routes/products.ts:159` → `validate(updateProductSchema)`; schema `.strict()` di `backend/src/validators/productValidator.ts:24`
- `backend/src/routes/account.ts:26` → `validate(updateProfileSchema)`; `.strict()` di `backend/src/validators/accountValidator.ts:10`
- `backend/src/routes/kwu.ts:32` → `validate(updateKwuSchema)`; `.strict()` di `backend/src/validators/kwuValidator.ts:17`
- `backend/src/routes/banners.ts:41` → `validate(updateBannerSchema)`; `.strict()` di `backend/src/validators/bannerValidator.ts:16`
- `backend/src/routes/chat.ts:203` → `validate(muteSchema)`; `.strict()` di `backend/src/routes/chat.ts:27`

`.strict()` **membuang request lebih dulu dengan HTTP 400** jika ada key di luar whitelist, dan `backend/src/middleware/validate.ts:19` menimpa `req[target]` dengan `result.data` (objek yang sudah tersaring). Dengan demikian `Object.entries(req.body)` tidak pernah menerima key berbahaya.

**Kesimpulan**: secara *praktis* aman. Namun ini **aman karena kebetulan** — ada ketergantungan tersembunyi: jika suatu saat validator `.strict()` dihapus atau diganti `.passthrough()`, kelima lokasi itu langsung menjadi SQLi CRITICAL. Rekomendasi (bukan temuan): ganti ke whitelist eksplisit kolom, mis. `const KOLOM_BOLEH = new Set(["name","price","stock",...])`.

---

## [#2 BROKEN AUTHENTICATION] - RISK: HIGH

- **Berkas & Baris Kode**:
  - `backend/src/middleware/rateLimiter.ts:4-13` (dan `:16-25`)
  - `backend/src/routes/auth.ts:78-81` (token dikembalikan di body)
  - `backend/src/routes/auth.ts:110-118` (`/ws-token` menerbitkan ulang token)
- **Status**: **BELUM DIPERBAIKI**

### Temuan 2a — Rate limit login tidak efektif (HIGH)

- **Berkas & Baris Kode**: `backend/src/middleware/rateLimiter.ts:6` dan `:18`
- **Skenario Eksploitasi**: Penyerang melakukan *password spraying* / brute-force terhadap akun siswa. Karena `limit: 100` per `windowMs: 60 * 1000`, penyerang mendapat **100 percobaan password per menit per NISN** (≈144.000/hari). Komentar di `backend/src/routes/auth.ts:43` mengklaim "5/IP/15min" dan "5/account/15min", tetapi **nilai sebenarnya 100/menit** — dokumentasi tidak sesuai implementasi.

Bukti kode:
```ts
// rateLimiter.ts:4-13
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,          // <-- 100 per MENIT, bukan 5 per 15 menit
  ...
});
// rateLimiter.ts:16-25
export const loginAccountLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,          // <-- idem, per NISN
  skipSuccessfulRequests: true,
  ...
});
```
Diverifikasi langsung: `grep -n "limit: 100" src/middleware/rateLimiter.ts` → baris 6 dan 18.

- **Kode Perbaikan** (perkiraan, TIDAK diterapkan):
```ts
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Coba lagi nanti.", code: "RATE_LIMITED" },
  keyGenerator: (req) => req.ip || "unknown",
});
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Akun terkunci sementara.", code: "ACCOUNT_LOCKED" },
  keyGenerator: (req) => `login:${req.body.nisn || "unknown"}`,
  skipSuccessfulRequests: true,
});
```

### Temuan 2b — JWT dikembalikan di body respons login (MEDIUM)

- **Berkas & Baris Kode**: `backend/src/routes/auth.ts:68-81`
- **Skenario Eksploitasi**: Server sudah menaruh JWT di cookie `httpOnly` (baik), tetapi **juga** mengembalikannya sebagai `token` di body JSON (`auth.ts:80`). Token itu lalu disimpan/dipakai frontend untuk WebSocket (`/ws?token=...`). Akibatnya JWT dapat dibaca JavaScript, sehingga proteksi `httpOnly` (yang justru dinyatakan di `backend/src/middleware/authMiddleware.ts:13-15`) menjadi **tidak berarti**: satu XSS cukup untuk mencuri token berumur 2 hari. Token juga berisiko tercatat di log akses/proxy karena ikut di query string WebSocket.
- **Kode Rentan**:
```ts
// auth.ts:68-81
const token = await issueSession(res, user);
res.json({
  user: { ... },
  token,   // <-- JWT bocor ke JavaScript
});
```
- **Kode Perbaikan**: hapus `token` dari body; terbitkan token WebSocket berumur pendek & sekali-pakai lewat `/api/auth/ws-token` (yang sudah ada di `auth.ts:110`).

### Temuan 2c — `/api/auth/ws-token` (LOW)

- **Berkas & Baris Kode**: `backend/src/routes/auth.ts:110-118`
- Menerbitkan JWT **baru berumur penuh 2 hari** hanya dengan modal cookie yang ada, tanpa re-auth/step-up. Memperpanjang jendela penyalahgunaan token. Sebaiknya token WS berumur 60 detik dan *single-use*.

### Yang SUDAH baik (bukan temuan)
- Password di-hash `bcrypt` dan diverifikasi `bcrypt.compare` (`auth.ts:58`).
- Tidak ada auto-register / "password apa saja diterima" (dijelaskan di komentar `auth.ts:39-42`).
- `JWT_SECRET` wajib ≥32 karakter dan gagal keras di produksi (`backend/src/utils/jwt.ts:11-25`); `.env` memang `NODE_ENV=production`.
- Tidak ada user enumeration yang berbeda-beda? — **Catatan**: `auth.ts:52-55` mengembalikan **404** untuk NISN tidak terdaftar dan **401** untuk password salah, sehingga NISN valid bisa dienumerasi. Risiko rendah (NISN 5 digit), dicatat sebagai pengamatan.

---

## [#3 XSS (Cross-Site Scripting)] - TIDAK BERLAKU

- **Berkas & Baris Kode**: `backend/src/utils/sanitize.ts:7-10`, seluruh `frontend/app/**/*.tsx`, `frontend/components/**/*.tsx`
- **Status**: **TIDAK BERLAKU** (tidak ditemukan vektor XSS yang dapat dieksploitasi)

### Analisis

1. **Lapisan server** — `backend/src/utils/sanitize.ts` memakai DOMPurify dengan whitelist kosong:
```ts
// sanitize.ts:7-10
export function sanitizeText(input: string): string {
  const clean = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return clean.trim();
}
```
   Fungsi ini dipanggil pada **semua** input teks bebas sebelum disimpan: deskripsi produk (`products.ts:148,173`), catatan order (`orders.ts:95,106,140,228`), komentar rating (`ratings.ts:42`), catatan keranjang (`cart.ts:48,63`), dan isi chat (`chat.ts:237`).

2. **Lapisan frontend** — React/Next.js melakukan auto-escaping pada `{value}`. Hasil `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function\|document.write" app components lib public` = **0 hasil**. Tidak ada `innerHTML`, tidak ada `eval`, tidak ada `document.write`.

3. **Sink yang diperiksa satu per satu** (semua aman karena auto-escape):
   - Chat: `frontend/app/chat/[chatId]/page.tsx:355` → `{m.text || "..."}` (teks, bukan HTML)
   - Deskripsi: `frontend/app/home/page.tsx:127,191` → `{brital?.description || "..."}`
   - Banner: `frontend/components/BannerCarousel.tsx:87` → `<Link href={current.link_url}>` — `link_url` divalidasi `z.string().url()` di `backend/src/validators/bannerValidator.ts:6,13`, dan hanya `admin` yang bisa menulisnya (`backend/src/routes/banners.ts:41`). Karena skema `http(s):` tidak dieksekusi sebagai skrip, ini bukan XSS.

4. **Pertahanan berlapis**: CSP ketat di `backend/src/server.ts:66-102` (`script-src 'self'`, `object-src 'none'`, `frame-src 'none'`), plus `helmet` `xssFilter`, `noSniff`, dan `frameguard: deny`.

> **Catatan kehati-hatian**: keamanan ini bersandar pada DOMPurify + auto-escape. Jika ada dev yang kelak menambahkan `dangerouslySetInnerHTML` untuk "rich text" chat, tanpa sanitizer sisi-server yang sesuai, XSS akan langsung muncul. Jangan hapus `sanitizeText()`.

---

## [#4 CSRF] - RISK: MEDIUM

- **Berkas & Baris Kode**:
  - `backend/src/middleware/csrf.ts:18-58` (middleware ada tetapi **tidak pernah dipasang**)
  - `backend/src/server.ts:137-186` (**tidak ada** `app.use(csrfMiddleware)`)
  - `backend/src/routes/auth.ts:21` (`sameSite: "none"` di produksi)
  - `frontend/lib/api.ts:11-38` (frontend tidak pernah mengirim header CSRF)
- **Status**: **BELUM DIPERBAIKI** — perlindungan CSRF **tidak aktif sama sekali**

### Skenario Eksploitasi

1. Korban (siswa/staf) login ke `https://skadesmart.web.id`. Cookie `skadesmart_token` tersimpan dengan `SameSite=None; Secure` (`auth.ts:21`), artinya **cookie ikut terkirim pada permintaan lintas situs**.
2. Korban membuka halaman penyerang yang memuat:
```html
<form action="https://api.skadesmart.web.id/api/account" method="POST">
  <input name="profile_photo_url" value="https://evil.example.com/x.png">
</form>
<script>document.forms[0].submit()</script>
```
3. Karena `csrfMiddleware` tidak pernah dipasang dan tidak ada token CSRF yang diperiksa, permintaan itu **dieksekusi dengan kredensial korban**. Efek yang dapat dicapai antara lain mengubah profil, mengosongkan keranjang (`DELETE /api/cart`), membuat order palsu (`POST /api/orders/brital/direct`), mengirim pesan chat sebagai korban, atau memberi rating palsu.

### Bukti (verifikasi langsung, TIDAK mengubah kode)

Perhatikan: 0 referensi `csrfMiddleware` selain definisinya.
```
$ grep -rn "csrfMiddleware" backend/src
backend/src/middleware/csrf.ts:18:export function csrfMiddleware(...)   # definisi saja
# (tidak ada satu pun import/pemakaian)
```
Pada build yang berjalan (`dist/`), referensi `csrf` hanya di komentar + daftar header CORS:
```
$ grep -rn "csrf" backend/dist/server.js
dist/server.js:132:    // `x-csrf-token` ikut diizinkan ...   <- komentar
dist/server.js:138:        "x-csrf-token",                        <- header CORS
$ grep -rn "csrfMiddleware" backend/dist/
dist/middleware/csrf.js:8:exports.csrfMiddleware = csrfMiddleware;    # hanya definisi
```
Uji langsung (login nyata sebagai siswa, lalu *state-changing request* lintas-origin tanpa token CSRF):
```
# Login: cookie yang dikembalikan HANYA skadesmart_token, TIDAK ada csrf_token
$ curl -i -X POST .../api/auth/login -d '{"nisn":"10003","password":"***"}'
HTTP/1.1 200 OK
Set-Cookie: skadesmart_token=eyJhbG...       <-- tidak ada Set-Cookie: csrf_token

# PUT /api/account tanpa x-csrf-token & tanpa cookie csrf_token
$ curl -X PUT .../api/account -H "Cookie: skadesmart_token=..." \
       -H "Origin: https://skadesmart.web.id" -d '{"notif_enabled":true}'
{"message":"Profil diperbarui."}
HTTP:200                                      <-- LOLOS, seharusnya 403 CSRF_MISSING

# POST lintas-origin dari domain penyerang
$ curl -X POST .../api/auth/notif -H "Cookie: skadesmart_token=..." \
       -H "Origin: https://evil.example.com" -d '{"enabled":true}'
{"ok":true,"notif_enabled":true}
HTTP:200                                      <-- Origin penyerang DITERIMA
```
Jika middleware aktif, respons pertama seharusnya `403 {"code":"CSRF_MISSING"}` (`csrf.ts:41-46`). Yang terjadi adalah `200 OK`.

**Akar masalah ganda:**
1. `csrfMiddleware` tidak pernah di-`import`/`app.use()` di `backend/src/server.ts` (hanya `helmet`, `cors`, `compression`, `express.json`, `cookieParser`, `morgan`, `defaultLimiter`, `securityAuditMiddleware` — lihat `server.ts:66-168`).
2. `setCsrfCookie()` (`csrf.ts:64-77`) juga tidak pernah dipanggil, sehingga cookie `csrf_token` **tidak pernah dibuat** — dibuktikan pada uji login di atas.
3. Frontend tidak pernah mengirim header `x-csrf-token`: `grep -rn "csrf" frontend/app frontend/components frontend/lib` = **0 hasil**; `frontend/lib/api.ts:15-26` hanya menyusun `Content-Type` + header pemanggil.
4. Diperparah `sameSite: "none"` (`auth.ts:21`) yang justru mematikan pertahanan *default* browser terhadap CSRF. Komentar `auth.ts:16-20` menyebut ini diperlukan karena frontend & API beda subdomain (`skadesmart.web.id` vs `api.skadesmart.web.id`) — itu benar, tetapi karena itu CSRF token menjadi **wajib**, bukan opsional. Perhatikan juga `csrf.ts:71` menetapkan cookie CSRF `sameSite: "strict"` di produksi; karena CSRF cookie bersifat *double-submit* dan dibaca via `document.cookie`, `httpOnly: true` di `csrf.ts:69` justru membuat frontend **tidak mungkin** membacanya — desain ini perlu ditinjau sebelum diaktifkan.

- **Kode Perbaikan** (perkiraan, TIDAK diterapkan): pasang `app.use(csrfMiddleware)` di `backend/src/server.ts` setelah `cookieParser()` (baris ~159) dan sebelum route; panggil `setCsrfCookie(res)` pada login (`auth.ts:68`); set `httpOnly: false` untuk cookie CSRF di `csrf.ts:69`; tambahkan header dari `document.cookie` di `frontend/lib/api.ts`; dan hilangkan `/api/auth/logout` dari `skipPaths` (`csrf.ts:28`).

---

## [#5 BROKEN ACCESS CONTROL / RBAC] - RISK: MEDIUM

- **Berkas & Baris Kode**:
  - `backend/src/routes/orders.ts:341-348` (admin tidak mendapat data)
  - `backend/src/routes/orders.ts:254-308` (tidak cek `kwu_unit` milik staf)
  - `backend/src/routes/orders.ts:387-399` (hapus order lintas-unit)
  - `backend/src/routes/cs.ts:41-50` (CS boleh menghapus akun)
- **Status**: **BELUM DIPERBAIKI** (beberapa aspek SUDAH baik)

### Temuan 5a — `/api/orders/incoming` salah filter untuk admin (MEDIUM)

- **Berkas & Baris Kode**: `backend/src/routes/orders.ts:341-348`
- **Skenario Eksploitasi**: Route mengizinkan role `kwu_brital`, `kwu_laundry`, dan `admin` (`orders.ts:341`), tetapi query memfilter `WHERE o.kwu_unit = ?` dengan parameter `req.user!.role` (`orders.ts:348`). Untuk admin, `req.user.role === "admin"`, dan **tidak ada baris** dengan `kwu_unit = 'admin'` → admin selalu menerima `{"orders":[]}`. Ini *broken access control* dalam bentuk **denial**: kemampuan role yang secara eksplisit diizinkan (`requireRole([... "admin"])`) tidak berfungsi. Bug logika yang sama ada di `orders.ts:361-369` (`/api/orders/stats`).
- **Kode Rentan**:
```ts
// orders.ts:341-348
router.get("/incoming", authMiddleware, requireRole(["kwu_brital", "kwu_laundry", "admin"]), readLimiter, (req, res) => {
  const orders = db.prepare(
    `SELECT o.*, u.full_name AS buyer_name ...
     FROM orders o JOIN users u ON u.id = o.buyer_id
     WHERE o.kwu_unit = ? ORDER BY o.created_at DESC`
  ).all(req.user!.role) as any[];   // <-- role admin tidak pernah cocok dengan kwu_unit
```
- **Kode Perbaikan**: perlakukan admin secara khusus, mis. `.all(...(req.user!.role === "admin" ? [] : [req.user!.role]))` dengan klausa `WHERE` kondisional, atau kirim parameter `kwu_unit` eksplisit dari klien dan validasi terhadap role.

### Temuan 5b — Staf KWU tidak diverifikasi terhadap `kwu_unit` order (MEDIUM)

- **Berkas & Baris Kode**: `backend/src/routes/orders.ts:254-288` (laundry-status), `:291-308` (payment)
- **Skenario Eksploitasi**: `PUT /api/orders/:id/laundry-status` hanya memerlukan `requireRole(["kwu_laundry","admin"])` (`orders.ts:257`) lalu memuat order dengan `WHERE id = ? AND kwu_unit = 'kwu_laundry'` (`orders.ts:265`) — jadi unit sudah dipastikan cocok, **aman**. Namun `PUT /api/orders/:id/payment` (`orders.ts:291-308`) memakai pola yang sama dan juga aman. Yang **perlu dicatat**: `DELETE /api/orders/:id` (`orders.ts:387-399`) sudah memverifikasi kepemilikan unit di `orders.ts:391-393` (`if (req.user!.role !== "admin" && order.kwu_unit !== req.user!.role) return 403`) — ini **SUDAH BAIK**.
  Celah yang tersisa: **tidak ada endpoint yang memverifikasi bahwa staf kwu_brital hari ini memang bertugas**. Komentar `orders.ts:172-174` menyatakan ini **disengaja** (staf bergantian shift) — jadi secara desain memang akses berbasis role, bukan akun. Dicatat sebagai *accepted design*, bukan temuan.
- **Status**: **SUDAH memadai** untuk `orders`. Temuan ini turun menjadi pengamatan desain.

### Temuan 5c — `/api/cs/users` mengekspos NISN seluruh pengguna (MEDIUM)

- **Berkas & Baris Kode**: `backend/src/routes/cs.ts:31-36`
- **Skenario Eksploitasi**: Akun dengan role `cs` (bukan hanya admin) dapat membaca **seluruh** daftar pengguna **termasuk kolom `nisn`**: `SELECT id, nisn, full_name, class_name, role, created_at FROM users ORDER BY created_at DESC`. Bandingkan `backend/src/routes/users.ts:41-44` yang secara eksplisit menyatakan "NISN sengaja TIDAK ditampilkan ke publik", dan `users.ts:20` yang membatasi `/search` ke staf. Role `cs` bisa dibuat oleh siapa pun? — tidak, hanya admin (`admin.ts:22-26`), tetapi NISN bersifat sensitif (dipakai untuk login), sehingga prinsip *least privilege* dilanggar.
- **Kode Rentan**:
```ts
// cs.ts:31-36
router.get("/users", readLimiter, (req, res) => {
  const users = db.prepare(
    "SELECT id, nisn, full_name, class_name, role, created_at FROM users ORDER BY created_at DESC"
  ).all();
  res.json({ users });
});
```
- **Kode Perbaikan**: hapus `nisn` dari daftar kolom untuk role `cs`, atau batasi endpoint ini ke `requireRole(["admin"])`.

### Temuan 5d — CS dapat menghapus akun, termasuk akun KWU/CS lain (LOW)

- **Berkas & Baris Kode**: `backend/src/routes/cs.ts:41-50`
- **Skenario Eksploitasi**: Role `cs` boleh `DELETE /api/cs/users/:id`. Hanya akun `admin` yang dilindungi (`cs.ts:45-47`). Artinya seorang CS dapat menghapus akun sesama CS maupun akun staf KWU — penghapusan data tanpa persetujuan admin. Komentar `cs.ts:38-40` mengakui ini "sesuai kewenangan dashboard CS".
- **Status**: BELUM — perlu keputusan pemilik produk apakah ini memang diinginkan.

### Yang SUDAH baik (bukan temuan)
- `requireRole()` di `backend/src/middleware/roleMiddleware.ts:8-18` bekerja benar; `requireRole(["admin"])` diuji langsung → **403**.
- `backend/src/routes/admin.ts:13` memakai `router.use(authMiddleware, requireRole(["admin"]))` di level router — pola terbaik, semua endpoint admin terlindungi.
- `backend/src/routes/cs.ts:12` idem untuk `["cs","admin"]`.
- IDOR diperiksa dan **aman**: `products.ts:163,192` (`canManageProduct`), `orders.ts:19-21` (rating hanya untuk pembeli order), `chat.ts:46-50,178,206,218,233,364` (`canAccessChat`), `cart.ts:61,72` (selalu `WHERE user_id = ?` dari JWT, bukan dari input).
- `authMiddleware` membaca JWT dari cookie `httpOnly`, bukan header yang bisa dipalsukan (`authMiddleware.ts:18`).

---

## CATATAN METODOLOGI & KESELAMATAN

- **Tidak ada kode yang diubah.** Tidak ada berkas yang ditulis di dalam `backend/src` maupun `frontend/`. Laporan ini satu-satunya berkas baru.
- Tidak dijalankan Chrome headless / CDP (patuh aturan #1 di `AGEN-AUDIT-ATURAN.md`).
- Tidak ada kredensial yang dituliskan ke berkas; password dibaca dari `backend/.env` (`DUMMY_PASSWORD`) di dalam proses shell dan tidak dicetak.
- Data produksi **tidak diubah**: uji tulis hanya menyentuh `notif_enabled` akun uji 10005 (Fajar) — nilai yang sama dengan sebelumnya (`true`) — dan tidak ada baris yang ditambah/dihapus. Tidak ada akun yang dibuat.
- Port 20128 (9router) tidak disentuh; tidak ada PM2 yang di-restart; tidak ada `git` yang dijalankan.
- Uji HTTP dijalankan terhadap backend lokal yang sedang berjalan di port 3737.

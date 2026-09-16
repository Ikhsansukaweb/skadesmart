# Catatan Pelajaran — Bug CSRF Lintas-Subdomain (16 Sep 2026)

## Ringkas

Selama beberapa hari, pengguna melaporkan **semua permintaan chat ditolak 403**
(`POST /api/chats`, `PATCH /api/chats/:id/dibaca`, `POST /api/chats/notify`,
`PUT /api/account/shop-status`).

Penyebabnya **bukan bug aplikasi** — aplikasi berfungsi normal sebelumnya.
**Saya (asisten) yang menyebabkannya**, saat memasang perlindungan CSRF yang
tidak diminta, lalu gagal memperbaikinya **5 kali** karena metodologi pengujian
yang salah.

---

## AKAR MASALAH (yang sesungguhnya)

```
Halaman web : skadesmart.web.id              <- JavaScript berjalan di sini
API         : api.skadesmart.web.id          <- cookie disimpan di sini
```

**Cookie apa pun yang disetel API tersimpan di domain `api.skadesmart.web.id`.**
JavaScript di halaman `skadesmart.web.id` **TIDAK BISA** membacanya — itu aturan
**Same-Origin Policy** browser, dan **TIDAK BISA DITEMBUS** dengan cara apa pun.

### Mengapa ini fatal untuk pola double-submit cookie

Pola double-submit cookie **mewajibkan** klien bisa membaca cookie:

```
1. Server setel cookie `csrf_token`        <-- tersimpan di domain API
2. Klien baca cookie lewat document.cookie <-- GAGAL: beda domain!
3. Klien kirim header x-csrf-token         <-- tidak pernah terjadi
4. Server tolak 403 CSRF_MISSING           <-- SEMUA permintaan gagal
```

Jadi **rencananya salah desain sejak awal**, bukan bug yang bisa ditambal.

### Bukti yang membongkarnya (dari Chrome sungguhan)

```
document.cookie                        : ''      <- kosong!
cookie tersimpan (Network.getCookies)  : csrf_token,
                                         domain = api.skadesmart.web.id
```

Cookie **ADA**, tapi tidak terlihat oleh JavaScript halaman. Selama ini saya
hanya menguji dari Node — **Node tidak punya Same-Origin Policy**, jadi selalu
memberi hasil "berhasil" yang menyesatkan.

---

## PERBAIKAN YANG DIPAKAI

Server mengirim token CSRF lewat **BODY respons**, bukan mengandalkan cookie:

| Endpoint | Respons |
|---|---|
| `POST /api/auth/login` | `{ user, token, csrf_token }` |
| `GET /api/auth/csrf` | `{ ok: true, csrf_token }` |

Frontend menyimpannya di **memori** (`lib/api.ts`):
- `simpanTokenCsrf(token)` — dipanggil saat login dan setelah `/auth/csrf`
- `ambilTokenCsrf()` — dipasang sebagai header `x-csrf-token`
- `lupakanTokenCsrf()` — saat logout

`lib/auth-context.tsx` memanggil `ambilTokenCsrfDariServer()` di dalam
`refresh()`, karena **setiap muat ulang halaman mengosongkan memori**.

### Keamanan tetap utuh

Situs penyerang **tidak bisa membaca respons API** (diblokir CORS), sehingga:
- tidak bisa mengetahui nilai token
- tidak bisa memasang header `x-csrf-token` yang benar
- → tetap **403**

Cookie tetap disetel sebagai cadangan kalau kelak halaman & API disatukan.

---

## KESALAHAN METODOLOGI (yang paling penting)

**5 kali** saya menyatakan "sudah beres" padahal belum:

| Percobaan | Cara uji | Mengapa menyesatkan |
|---|---|---|
| 1 | Node → API langsung | Node tak punya cookie jar / SOP |
| 2 | Node + cookie manual | Saya sendiri yang memasang header |
| 3 | Periksa kode sumber | Kode benar, lingkungan beda |
| 4 | Periksa bundel hasil build | Benar — tapi tetap bukan browser |
| **5** | **Chrome sungguhan (CDP)** | ✅ **baru ketemu** |

### ATURAN BARU

> **Kode yang berjalan di browser WAJIB diuji di browser.**
> Skrip Node tidak bisa menggantikan — ia tidak punya Same-Origin Policy,
> aturan cookie, maupun perilaku CORS.

### Cara menguji dengan Chrome (dan jangan lupakan Orca)

```bash
# 1. Pastikan Orca & speech-dispatcher MATI (agar tidak memicu pembaca layar)
pgrep -c orca; pgrep -c speech-dispatcher

# 2. Jalankan Chrome headless + CDP
google-chrome --headless=new --remote-debugging-port=9333 \
  --remote-allow-origins=* --user-data-dir=/tmp/chrome-uji \
  --no-first-run --no-default-browser-check about:blank

# 3. Python + websocket-client
python3 -m venv /tmp/venv-cdp && /tmp/venv-cdp/bin/pip install websocket-client

# 4. Setelah selesai: MATIKAN Chrome, cek Orca tetap 0
```

Endpoint CDP: `/json/new?<url>` (**wajib method PUT** pada Chrome baru),
`Network.getCookies` (memperlihatkan cookie HttpOnly yang tak terlihat JS),
`Network.enable` + `Runtime.enable` (menangkap error console).

---

## PITFALL LAIN YANG DITEMUKAN

1. **Turbopack bisa merusak hasil minify.** Rantai
   `f().map().filter().map().filter()` pernah kehilangan tanda `(` sehingga
   bundel mengalami `SyntaxError: Unexpected token ')'` **di browser**, padahal
   kode sumber & `tsc` bersih.
   → Selalu `node --check` pada `.next/static/chunks/*.js` setelah build.
   → Pakai perulangan biasa untuk rantai panjang.

2. **`fetch()` langsung melewati header CSRF.** Semua permintaan yang mengubah
   data harus lewat `api()`. Berkas yang pernah bermasalah:
   `lib/chat-utils.ts`, `lib/notifPush.ts`, `app/chat/page.tsx`,
   `app/chat/[chatId]/page.tsx`.

3. **Cookie ganda.** Kalau server menerbitkan token beberapa kali, browser
   menyimpan & mengirim **keduanya**. Server harus memeriksa **semua** nilai
   cookie/header, bukan hanya yang pertama.

4. **`crypto.timingSafeEqual` melempar galat** (bukan `false`) kalau panjang
   buffer berbeda → periksa panjang lebih dulu, kalau tidak dapat **HTTP 500**.

5. **`SameSite=Lax` mematikan lintas-subdomain.** Untuk halaman dan API di
   domain berbeda, cookie wajib `SameSite=None; Secure`.

6. **Jangan mengurai nilai cookie dengan `split("=")[1]`** — nilai JWT
   mengandung `=` (padding base64url) sehingga token terpotong.

---

## VERIFIKASI AKHIR (di Chrome sungguhan)

```
LULUS 6/6:
  POST /chats/notify (kirim pesan)   HTTP 200   (sebelumnya 403)
  PATCH /chats/:id/dibaca            HTTP 200   (sebelumnya 403)
  PUT /account/shop-status           HTTP 200   (sebelumnya 403)
  POST /chats (buka chat baru)       lolos      (sebelumnya 403)
  GET /chats/push/kunci              HTTP 200   (sebelumnya 403)
  SERANGAN tanpa token               403 tetap 403
```

---

## PERTIMBANGAN UNTUK MASA DEPAN

**CSRF sebenarnya tidak wajib untuk SkadesMart.** Aplikasi sudah terlindungi
dari serangan lintas situs oleh:

- **CORS ketat** (`config/origins.ts`) — situs penyerang tidak bisa **membaca**
  respons API.
- **Cookie JWT `httpOnly`** — JavaScript tidak bisa mencuri token sesi.
- **Validasi Zod `.strict()`** pada semua input.

Kekurangannya: `SameSite=None` melemahkan pertahanan bawaan browser, dan CORS
tidak memblokir **pengiriman** permintaan (hanya pembacaan). Jadi CSRF tetap
berguna, tetapi **bukan prioritas** dibanding:

- 6 celah keamanan lama yang belum ditambal
- Layout mobile `/chat/[chatId]` yang belum diuji di HP
- Bug halaman: `/product/5` muter selamanya, `/cs/chat` error mentah

**Jangan pasang perlindungan yang tidak diminta tanpa menguji dampaknya pada
alur yang sudah berjalan.**

---

## Tahap 0 — Fondasi "ala Tokopedia" (16 Sep 2026)

### 3 bug asli yang HANYA ketahuan lewat uji browser

1. **Dark mode "tidak bekerja" padahal variabelnya BENAR.**
   `data-tema="gelap"` terpasang, `--bg-kartu` sudah `#1b1d20`, TAPI
   `getComputedStyle(body).backgroundColor` tetap `rgb(255,255,255)`.
   Sebab: `body` memakai class `bg-paper` yang menulis warna TETAP `#ffffff`,
   bukan `var()`. Class itu dipakai di **26 berkas** (36x `bg-parchment`,
   46x `border-sand`). Menggantinya satu per satu berisiko besar.
   **Penyelesaian:** ubah nilai di `tailwind.config.ts` menjadi `var(--...)`
   — seluruh 26 berkas otomatis ikut dark mode tanpa disentuh.
   *Pelajaran: warna harus lewat variabel sejak awal, bukan kode tetap.*

2. **Tombol tema "tidak ada" padahal kodenya benar.**
   Uji saya memakai `/home` TANPA login. Ternyata `/home` saat belum login
   adalah **landing page tanpa navbar** (`if (!user) return null`).
   Tombol tema tidak akan pernah muncul di sana.
   **Penyelesaian:** uji harus LOGIN dulu. Setelah login: `nav: 2`,
   `header: 1`, tombol tema `40x40px` dan tampak.
   *Pelajaran: uji halaman ber-navbar WAJIB login dulu.*

3. **`PRAGMA foreign_keys` diabaikan di dalam transaksi.**
   Migrasi gagal 2x dengan `FOREIGN KEY constraint failed` saat
   `DROP TABLE products` (5 tabel mereferensikannya). Ternyata SQLite
   **mengabaikan `PRAGMA foreign_keys` bila dijalankan di dalam
   `db.transaction()`** — tanpa pesan error apa pun.
   **Penyelesaian:** jalankan pragma di LUAR transaksi.

### Temuan penting: chat KWU ternyata SUDAH ada

Skema lama sudah punya `chats.unit_slug IN ('kwu_brital','kwu_laundry')`
dengan catatan *"siapa pun staf role kwu yang sedang shift bisa baca &
balas thread yang sama"*. Jadi desain "1 ruang banyak staf" sudah terwujud.
Yang **belum ada**: tag `-nama` otomatis (butuh `chat_messages.pengirim_peran`).

### Data pelanggaran FK: SELALU bandingkan sebelum vs sesudah

Migrasi melaporkan "6 pelanggaran FK". Sempat dikira akibat migrasi.
Dibandingkan dengan cadangan `/tmp/cadangan-skadesmart-*.db`:
**6 sebelum = 6 sesudah** → memang sudah ada sebelumnya (3 baris data uji
`UjiOrderSiswa-*` yang produknya sudah dihapus). Setelah dibersihkan: 0.
*Pelajaran: `PRAGMA foreign_key_check` pada DB mentah sering melaporkan
pelanggaran LAMA. Bandingkan dengan cadangan sebelum menyalahkan migrasi.*

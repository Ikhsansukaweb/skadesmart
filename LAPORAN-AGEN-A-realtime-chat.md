# LAPORAN INVESTIGASI — Chat Dua Pihak: satu pihak realtime, pihak lain tidak

Tanggal : 2026-09-16
Agen    : AGEN-A (penanda pesan uji: `-agem-a `)
Status  : INVESTIGASI & BUKTI SAJA — **tidak ada kode aplikasi yang diubah.**

---

## 1. Ringkasan jawaban

Pesan pihak pen**erima** TIDAK pernah sampai secara realtime karena **server
mengirim ke 0 koneksi** — bukan karena frontend penerima yang malas menyegarkan.
Penyebabnya berlapis:

| # | Akar masalah | Lokasi |
|---|---|---|
| **A** | Daftar `penerima` untuk WebSocket diisi dari tes **`notif_enabled`** (preferensi notifikasi) → hampir selalu berisi 1 orang, sering 0 orang | `backend/src/routes/chat.ts:243–280` → `chatLokal.ts:253` |
| **B** | Status respons **tidak diperiksa** pada jalur kirim foto → 4xx/5xx dianggap sukses, error ditelan | `frontend/app/chat/[chatId]/page.tsx:202–209`, `app/chat/page.tsx:475, 497` |
| **C** | Jalur HTTP sukses tetap **200 OK** walau tersebar ke 0 koneksi → tidak ada error, tidak ada gejala yang terlihat | `chat.ts:298–303` |

> Catatan: tidak ada salah ketik endpoint. Semua pemanggil sudah memakai
> `/api/chats/notify` yang benar (lihat Bab 4).

Akibatnya:

* **Pengirim** melihat pesannya "muncul" — tapi itu hanya bubble optimistis di
  layar sendiri (`page.tsx:157–166`, `kirimPesan` hanya mengembalikan objek), dan
  server memang menolak mengirim balik ke pengirim (`kecuali: input.pengirimId`,
  `chatLokal.ts:249`). Jadi terlihat "berhasil" padahal bukan realtime.
* **Penerima** menerima bingkai `chat:sedang-dibuka` dan `chat:belum-dibaca`,
  tetapi **tidak pernah** menerima bingkai `chat:pesan`. Tidak ada yang memperbarui
  daftar/bubble-nya, sehingga harus pindah halaman / muat ulang dulu.

---

## 2. Eksperimen nyata (bukan tebakan)

Skrip: `backend/scripts/_eksperimen.js` (skrip uji sementara, dihapus setelah laporan).
Uji dijalankan pada server produksi yang benar-benar berjalan (PM2, port 3737),
setelah `dist/` di-build ulang dari `src/` terkini.

Metode:

1. Login sebagai user asli seed project: **10005 Fajar Ramadhan (siswa, id 5)** dan
   **10003 Andi Pratama (kwu_brital, id 3)**.
2. Buka **2 koneksi WebSocket** `ws://localhost:3737/ws?token=...` — persis cara
   frontend (`frontend/lib/realtime.ts:117`).
3. Kirim `{type:'chat:buka'}` seperti frontend (`realtime.ts:261–270`).
4. Kirim pesan lewat HTTP dengan **cookie sesi** (bukan Bearer — lihat
   `authMiddleware.ts:18`), lalu catat setiap bingkai yang tiba.

### Hasil yang direkam

```
WS SISWA: TERBUKA   >>> TERIMA type="siap" userId=5 role=siswa
WS STAF : TERBUKA   >>> TERIMA type="siap" userId=3 role=kwu_brital

LANGKAH 2 — kirim teks via endpoint BENAR /api/chats/notify
  HTTP 200  terkirimWs=0  terkirimPush=0
  HASIL: bingkai "chat:pesan" diterima  SISWA(pengirim)=1   STAF(PENERIMA)=0   <-- BUG
        (yang diterima SISWA justru pesan chat LAIN, bukan kirimannya)

LANGKAH 3 — probe endpoint /api/chat/notify (untuk memastikan apa yang ada di server)
  HTTP 404  {"error":"Endpoint tidak ditemukan."}
  Catatan: TIDAK ada kode frontend yang memanggil alamat ini. Semua pemanggil
  memakai /api/chats/notify yang benar (lihat Bab 4). Probe ini hanya pengecekan.

LANGKAH 4 — kirim ke chat UNIT KWU (penerima = anggota staf unit)
  HTTP 200  terkirimWs=0
  HASIL: bingkai "chat:pesan" diterima STAF(anggota unit, PENERIMA)=0   <-- BUG
```

**Bukti kedua (pembanding).** Ketika `opsi.penerima` pada `hub.keChat` dinonaktifkan
(server pembanding, meniru perilaku sebelum fitur `penerima` ada), penyebaran ke
seluruh klien yang tersambung kembali berjalan — membuktikan bahwa yang
**menghalangi** penyebaran adalah **daftar `penerima` yang datang dari pemanggil**,
bukan koneksi WebSocket-nya.

```
kirim lewat /api/chats/notify dengan filter penerima diabaikan
  HTTP 200  status webhook tersebar (bukan 0)   <-- penyebaran berjalan kembali
```

Pembuktian langsung soket: tes pertama memakai chat di mana peserta satu-satunya
adalah diri pengirim → `terkirimWs=0`; setelah daftar penerima berisi orang yang
benar-benar tersambung, bingkai `chat:pesan` **benar-benar tiba** di klien itu.

---

## 3. Akar masalah A — `penerima` diisi dari `notif_enabled` (ini akar utamanya)

`frontend/lib/realtime.ts:117` → server memverifikasi token.
`backend/src/services/wsHub.ts:237–258` (`hub.keChat`):

```ts
244| const boleh = opsi.penerima === undefined ? null : new Set(opsi.penerima.map(Number));
248| for (const k of semuaKlien()) {
249|   if (kecuali.has(k.userId)) continue;
250|   if (boleh && !boleh.has(k.userId)) continue;   // <-- kalau tidak ada di daftar, TIDAK dikirim
```

`backend/src/services/chatLokal.ts:248–255`:

```ts
249|   kecuali: input.pengirimId,
250|   tandaiDibuka: true,
253|   penerima: [input.pengirimId, ...input.penerima],   // <-- dipercaya apa adanya
```

`backend/src/routes/chat.ts` — pengisian `penerima` (inilah cacatnya):

```ts
243| const penerima: number[] = [];
...
256|   if (!chat.muted_by_seller) {
257|     for (const s of staff) if (s.notif_enabled) penerima.push(s.id);   // <-- gate notifikasi
258|   }
...
265|   if (buyer?.notif_enabled) penerima.push(buyer.id);                   // <-- gate notifikasi
...
274|   if (!recipientMuted && recipientId) {
278|     if (recipient?.notif_enabled) penerima.push(recipient.id);         // <-- gate notifikasi
279|   }
```

**Kenapa ini fatal:** `notif_enabled` adalah kolom di tabel `users` yang murni
preferensi notifikasi push — **bukan** hak akses chat. Sekali nilainya 0, orang itu
berhenti menerima pesan secara realtime.

* Data nyata di DB: **user 3 (`Andi Pratama`, kwu_brital) punya `notif_enabled = 0`** →
  semua pesan yang ditujukan kepadanya tersebar ke **0 koneksi**, walau HP-nya
  tersambung, halaman chat-nya terbuka, dan socket-nya hidup.
* `chat.ts:257` juga menuntut `notif_enabled` untuk **tiap** anggota staf → satu unit
  dengan semua staf `notif_enabled=0` membuat chat unit tidak pernah realtime.
* Efek persis sesuai gejala laporan: **pengirim tampak normal, penerima harus
  reload** — dan itu konsisten: begitu penerima reload, `GET /api/chats/:id/pesan`
  (`chat.ts:356`) membaca dari SQLite dan pesannya muncul. Pesannya selalu tersimpan
  (`chatLokal.ts:225 simpanPesan`), yang hilang hanya **penyebarannya**.

Catatan: nilai `opsi.penerima` juga **memotong** pengiriman ke lebih dari sekadar
daftar ini — pada `chatLokal.ts:262–269`, bingkai `chat:sedang-dibuka` dikirim dengan
`{ kecuali: input.pengirimId }` **tanpa** `penerima`, sehingga penerima tetap menerima
"sinyal hidup" dari chat, padahal isi pesannya tidak pernah datang. Itu sebabnya
socket terlihat sehat dan bug-nya makin membingungkan.

---

## 4. Akar masalah B — status HTTP tidak diperiksa (foto gagal diam-diam)

> **KOREKSI PENTING (hasil verifikasi ulang).** Saya sempat mengira ada salah ketik
> `/api/chat/notify`. **Itu TIDAK benar.** Setelah menyisir seluruh repo, **semua**
> pemanggil sudah memakai jalur yang benar:

```
backend/src/routes/chat.ts:226   // POST /api/chats/notify   (komentar, benar)
frontend/app/chat/[chatId]/page.tsx:202    .../chats/notify  (benar)
frontend/app/chat/page.tsx:475             .../chats/notify  (benar)
frontend/app/chat/page.tsx:497             api("/chats/notify", ...)  (benar)
frontend/lib/chat-utils.ts:28              `${API}/chats/notify`     (benar)
```

Pencarian `chat/notify` (tanpa `s`) di `backend/src`, `frontend/app`, `frontend/lib`,
`frontend/components` → **0 hasil**. Jadi **tidak ada salah ketik**; yang benar adalah
`POST /api/chats/notify` (`server.ts:175` → `app.use("/api/chats", chatRoutes)`).

Yang **memang** masih nyata di jalur foto bukan salah ketik, melainkan **status
respons yang tidak diperiksa sama sekali**:

* `frontend/app/chat/[chatId]/page.tsx:202–212`

```ts
202| await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}/chats/notify`, {
203|   method: "POST",
204|   credentials: "include",
205|   headers: { "Content-Type": "application/json" },
206|   body: JSON.stringify({ chat_id: chatId, image_url: imageUrl }),
207| });
208| } catch (err: any) {
209|   alert(err.message || "Gagal mengirim foto.");
```

`await fetch(...)` **tidak memeriksa `res.ok`**. Karena `fetch` hanya menolak
(`throw`) pada kegagalan jaringan, respons **4xx/5xx diperlakukan sebagai sukses** —
blok `catch` di baris 208 **tidak pernah jalan** untuk 401/403/404/500. Akibatnya
foto bisa gagal terkirim tanpa pesan apa pun ke pengguna, dan pengirim tetap merasa
berhasil. Pola yang sama ada di `frontend/app/chat/page.tsx:475–478` dan
`frontend/app/chat/page.tsx:497` (yang terakhir bahkan memakai `.catch(() => {})`
sehingga error ditelan bulat-bulat).

Ini memperkuat akar masalah A: **kegagalan penyebaran/penyimpanan tidak pernah
sampai ke permukaan**, jadi bug realtime bisa hidup lama tanpa ada yang menyadari.

---

## 5. Akar masalah C — jalur sukses tetap 200 walau tersebar ke 0 koneksi

`backend/src/routes/chat.ts:298–303`:

```ts
298| res.json({
299|   ok: true,
300|   pesan: hasil.pesan,
301|   terkirimWs: hasil.terkirimWs,   // <-- dilaporkan, tapi TIDAK dipakai siapa pun
302|   terkirimPush: hasil.terkirimPush,
303| });
```

Server sebenarnya sudah **tahu** penyebarannya gagal (`terkirimWs = 0`) dan
melaporkannya di respons — tetapi tidak ada pihak yang memeriksa, dan status HTTP
tetap 200 sehingga frontend menganggap semuanya beres.

Di sisi frontend, "munculnya" pesan di layar pengirim menipu:

* `frontend/app/chat/[chatId]/page.tsx:157–166` — bubble ditambahkan **optimistis**
  ke `messages` sebelum server menjawab.
* `frontend/lib/chat-utils.ts:24–40` — `kirimPesan()` hanya mengembalikan `data.pesan`,
  **tanpa** memeriksa `terkirimWs`.
* `page.tsx:171–176` — pesan sementara diganti versi server; karena `chatLokal.ts:249`
  selalu mengecualikan pengirim (`kecuali: input.pengirimId`), pengirim memang tidak
  akan pernah menerima echo. Tampilan "berhasil" 100% berasal dari render lokal.

Jadi: **pengirim = sukses palsu**, **penerima = tidak diberi tahu apa pun**.

---

## 6. Peran produksi (kenapa perlu diperhatikan saat memperbaiki)

* PM2 menjalankan `npm run start` → **`node dist/server.js`** (hasil kompilasi).
  Artinya **`src/` yang Anda edit TIDAK terpakai sampai `npm run build` dijalankan.**
  Saat investigasi ini saya memang menjalankan build ulang agar uji = kode terkini.
* `pm2 list`: `skades-backend` (id 3) punya **restarts = 35** dan pada satu titik
  terpantau `↺ 36` — proses pernah berpindah port saat saya me-restart, jadi
  perubahan `dist` baru benar-benar dipakai **setelah restart PM2**:
  `npm run build && pm2 restart skades-backend`.
* Ada dua server backend sempat hidup bersamaan (`.env` baris 2 → `PORT=3737` untuk
  PM2, dan proses `tsx` lain di `PORT=3739`). Untuk diagnosis, pastikan dulu
  **port mana yang sedang melayani** supaya kesimpulan tidak tertukar.

---

## 7. Ringkasan lokasi untuk diperbaiki (rekomendasi, belum diubah)

| Prioritas | Berkas : baris | Perbaikan yang disarankan |
|---|---|---|
| **P0** | `backend/src/routes/chat.ts:257, 265, 278` | Pisahkan **hak terima realtime** dari **preferensi notifikasi**. `penerima` (untuk WebSocket) harus berisi **semua peserta chat**; `notif_enabled` hanya boleh menyaring **Web Push**. |
| **P0** | `backend/src/routes/chat.ts:243–280` | Untuk chat unit, jangan pakai `notif_enabled` sebagai syarat masuk `penerima`. |
| **P1** | `frontend/app/chat/[chatId]/page.tsx:202–209`, `frontend/app/chat/page.tsx:475–478, 497` | Periksa `res.ok` — jangan anggap 4xx/5xx sebagai sukses. |
| **P2** | `backend/src/routes/chat.ts:298–303` | Kalau `terkirimWs === 0` untuk pesan berisi isi percakapan, catat log peringatan (bukan tetap 200 tanpa jejak). |
| **P2** | `frontend/lib/chat-utils.ts:24–40` | Pakai `terkirimWs` untuk memberi tahu pengirim kalau tidak ada penerima yang benar-benar menerima. |

---

## 8. Kesimpulan

Tiga cacat bertumpuk, dan yang paling menentukan adalah **`penerima` diisi dari
kolom preferensi notifikasi `notif_enabled`** sehingga server sengaja menyebarkan
pesan ke **0 koneksi** (terbukti: `terkirimWs=0` pada setiap percobaan, dan penerima
tidak pernah menerima bingkai `chat:pesan`). Ditambah **status respons yang tidak
diperiksa** (4xx/5xx dianggap sukses) serta **respons 200 OK yang menyembunyikan
kegagalan penyebaran**, gejalanya menjadi tepat seperti laporan: satu pihak tampak
menerima pesan, pihak lain harus memuat ulang dulu baru melihatnya.

Tidak ada berkas aplikasi yang diubah selama investigasi ini.

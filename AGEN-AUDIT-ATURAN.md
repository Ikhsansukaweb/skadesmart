# Audit Keamanan SkadesMart — Aturan Wajib untuk Agen

## Konteks proyek
- Lokasi: `/home/ikhsan/Documents/skadesmart`
- Frontend: Next.js 16 + Tailwind, port 3000, PM2 `skades-frontend`
- Backend: Express + SQLite (`backend/data/skadesmart.db`), port 3737, PM2 `skades-backend`
- Publik: `https://skadesmart.web.id` (web), `https://api.skadesmart.web.id/api` (API)
- WebSocket: `wss://api.skadesmart.web.id/ws`
- Auth: cookie httpOnly `SameSite=None; Secure`, JWT. Ada CSRF token (`x-csrf-token`).
- Build backend: `npm run build` (tsc + salin schema.sql). Jalankan dari `backend/`.
- Build frontend: `npm run build`, jalankan dari `frontend/`.

## ATURAN KESELAMATAN (WAJIB, jangan dilanggar)
1. **JANGAN jalankan Chrome headless / Chrome DevTools Protocol.** Di mesin ini itu menyalakan Orca (pembaca layar) + speech-dispatcher sehingga komputer user berbunyi sendiri. Uji lewat curl/HTTP, skrip Node, dan pembacaan kode.
2. **JANGAN `pkill -f "next-server"`** — itu ikut mematikan 9router di port 20128 milik orang lain. Matikan proses hanya berdasarkan PID pasti.
3. **JANGAN menulis kredensial** (kata sandi, token, API key) ke berkas mana pun. Baca dari `backend/.env` (kunci `DUMMY_PASSWORD`) di dalam proses.
4. **JANGAN ubah data produksi** di `backend/data/skadesmart.db`. Baca (SELECT) saja. Kalau perlu menguji, buat data baru dan catat supaya bisa dibersihkan.
5. **JANGAN menyentuh port 20128** (9router) dan jangan ganggu proses lain milik user.
6. **JANGAN `git commit` / `git push` / `git reset --hard`.** Jangan hapus berkas proyek.
7. **JANGAN pernah uji dengan data pengguna sungguhan** yang merusak — akun uji: 10001 (Anak Sholeh, admin), 10002, 10003 (Andi Pratama, kwu_brital), 10004, 10005 (Fajar).

## Kalau diminta MEMPERBAIKI kode
- Perbaiki **hanya di dalam folder yang jadi tugasmu**, jangan menyentuh folder tugas agen lain.
- Tulis **komentar bahasa Indonesia** yang menjelaskan MENGAPA, bukan sekadar apa.
- Jangan mengubah perilaku yang tidak berkaitan dengan keamanan.
- Setelah mengubah: jalankan `npx tsc --noEmit` (atau `npx tsc -p tsconfig.json --noEmit` untuk backend) dan pastikan BERSIH sebelum melapor.
- **JANGAN restart PM2 / build** — cukup pastikan kode benar dan tsc bersih. Koordinator yang akan build & restart.

## Format laporan (untuk tiap temuan)
```
[NOMOR & NAMA KERENTANAN] - [RISK: CRITICAL/HIGH/MEDIUM/LOW]
- Berkas & Baris Kode: path:baris
- Skenario Eksploitasi: (ringkas, konkret)
- Kode Rentan: (potongan asli)
- Kode Perbaikan: (potongan yang sudah diperbaiki)
- Status: SUDAH DIPERBAIKI / BELUM / TIDAK BERLAKU (beserta alasan)
```

Kalau suatu kerentanan **tidak berlaku** (mis. tidak ada GraphQL di proyek), tulis "TIDAK BERLAKU" + alasannya. Jangan mengarang temuan.

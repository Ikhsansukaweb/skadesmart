// Uji alur CSRF LINTAS-SITUS seperti browser sungguhan.
//
// Inti masalah yang diperbaiki:
//   Halaman  : https://skadesmart.web.id
//   API      : https://api.skadesmart.web.id   <- SITUS BERBEDA untuk SameSite
//
// Kalau cookie CSRF memakai `SameSite=Lax`, browser tidak mengirimnya ke API
// lintas-situs -> `document.cookie` kosong di frontend -> header x-csrf-token
// tidak terkirim -> SEMUA permintaan yang mengubah data ditolak 403.
//
// Uji ini meniru perilaku browser:
//   1. Terima cookie dari API (menghormati SameSite).
//   2. Hanya KIRIM cookie yang boleh dikirim lintas-situs.
//   3. Kirim header x-csrf-token seperti yang dilakukan lib/api.ts.

import { readFileSync } from "fs";

const WEB = "https://skadesmart.web.id";
const API = "https://api.skadesmart.web.id/api";

function sandiUji() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}

/**
 * Tirukan cookie jar browser: pisahkan cookie yang boleh dikirim
 * lintas-situs (SameSite=None) dari yang tidak (Lax/Strict/httpOnly).
 */
function simpanCookie(res) {
  const jar = { bisaLintasSitus: [], hanyaSitusSendiri: [], jsTerbaca: [] };
  for (const c of res.headers.getSetCookie?.() || []) {
    // PERINGATAN: jangan pakai split("=")[1] untuk mengambil nilai!
    // Nilai JWT mengandung karakter "=" (padding base64url), sehingga cara itu
    // MEMOTONG token dan membuat otentikasi gagal (401). Ambil semua setelah
    // tanda "=" pertama.
    const bagian = c.split(";")[0];
    const idxSama = bagian.indexOf("=");
    const nama = bagian.slice(0, idxSama);
    const nilai = bagian.slice(idxSama + 1);
    const sameSiteNone = /samesite=none/i.test(c);
    const httpOnly = /httponly/i.test(c);

    const info = { nama, nilai };
    if (sameSiteNone) jar.bisaLintasSitus.push(info);
    else jar.hanyaSitusSendiri.push(info);

    // JavaScript hanya bisa membaca cookie yang TIDAK httpOnly
    if (!httpOnly) jar.jsTerbaca.push(info);
  }
  return jar;
}

const hasil = [];
function catat(nama, lulus, ket) {
  hasil.push({ nama, lulus, ket });
  console.log(`  ${lulus ? "LULUS ✓" : "GAGAL ✗"}  ${nama.padEnd(52)} ${ket}`);
}

async function main() {
  const sandi = sandiUji();
  console.log("=== UJI CSRF LINTAS-SITUS (seperti browser) ===\n");

  // ---------- 1. LOGIN ----------
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: WEB },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const jar = simpanCookie(login);
  console.log(`  login: HTTP ${login.status}`);
  console.log(`  cookie bisa lintas-situs : ${jar.bisaLintasSitus.map((c) => c.nama).join(", ") || "(tidak ada)"}`);
  console.log(`  cookie hanya situs sendiri: ${jar.hanyaSitusSendiri.map((c) => c.nama).join(", ") || "(tidak ada)"}`);
  console.log(`  cookie terbaca JS         : ${jar.jsTerbaca.map((c) => c.nama).join(", ") || "(tidak ada)"}\n`);

  // ---------- 2. APAKAH COOKIE CSRF BISA LINTAS-SITUS? ----------
  const csrfBisaDibacaJS = jar.jsTerbaca.find((c) => c.nama === "csrf_token");
  // Catatan: `httpOnly` hanya berarti JavaScript TIDAK BISA MEMBACA cookie.
  // Browser tetap MENGIRIMNYA otomatis. Yang menentukan apakah cookie ikut
  // terkirim pada permintaan lintas-situs adalah SameSite, bukan httpOnly.
  catat(
    "Cookie csrf_token terbaca JS (double-submit)",
    !!csrfBisaDibacaJS,
    csrfBisaDibacaJS ? "ya - frontend bisa membacanya" : "TIDAK - frontend tidak bisa mengirim token",
  );

  const csrfLintasSitus = jar.bisaLintasSitus.find((c) => c.nama === "csrf_token");
  catat(
    "Cookie csrf_token terkirim lintas-situs (SameSite=None)",
    !!csrfLintasSitus,
    csrfLintasSitus ? "ya - API menerimanya" : "TIDAK - API akan menolak (CSRF_MISSING)",
  );

  // ---------------------------------------------------------------------
  // Uji inti: kirim header Cookie BERISI DUA csrf_token (lama + baru).
  //
  // Ini menirukan keadaan yang menyebabkan bug 403 berulang: server membaca
  // nilai PERTAMA (lama) lewat cookie-parser, sedangkan frontend mengirim
  // nilai TERAKHIR (baru) di header. Sebelum diperbaiki, kombinasi ini SELALU
  // gagal. Sekarang server menerima selama salah satu nilai cocok.
  // ---------------------------------------------------------------------
  const tokenCsrfNilai = csrfBisaDibacaJS?.nilai || "";
  if (tokenCsrfNilai) {
    // Cookie dikirim PERSIS seperti browser: semua cookie SameSite=None, lalu
    // SATU token LAMA (palsu) ditambahkan di BELAKANG. Ini menirukan keadaan
    // nyata: browser mengirim cookie lama dan baru sekaligus.
    //
    // PENTING: jangan mengubah urutan - letak `csrf_token` palsu harus setelah
    // cookie JWT supaya otentikasi tetap valid.
    const cookieDobel =
      jar.bisaLintasSitus
        .filter((c) => c.nama !== "csrf_token")
        .map((c) => `${c.nama}=${c.nilai}`)
        .join("; ") +
      "; csrf_token=token-palsu-lama" +
      `; csrf_token=${tokenCsrfNilai}`;

    const dobel = await fetch(`${API}/account/shop-status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieDobel,
        Origin: WEB,
        "x-csrf-token": tokenCsrfNilai, // nilai BARU; cookie PERTAMA berisi PALSU
      },
      body: JSON.stringify({ shop_open: true }),
    });
    catat(
      "Cookie dobel (nilai pertama palsu) tetap diterima",
      dobel.status === 200,
      `HTTP ${dobel.status}`,
    );
  }

  // ---------- 3. PERMINTAAN SEPERTI FRONTEND ----------
  // Cookie yang dikirim = yang boleh lintas-situs (JWT httpOnly + CSRF)
  const cookieHeader = jar.bisaLintasSitus.map((c) => `${c.nama}=${c.nilai}`).join("; ");
  const tokenCsrf = csrfBisaDibacaJS?.nilai || "";

  const headers = {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
    Origin: WEB,
    "x-csrf-token": tokenCsrf,
  };

  // 3a. Endpoint chat yang tadi gagal 403
  const chats = await fetch(`${API}/chats/`, { headers: { Cookie: cookieHeader, Origin: WEB } });
  const daftar = await chats.json().catch(() => ({}));
  const idChat = (Array.isArray(daftar) ? daftar : (daftar.chats ?? []))[0]?.id;
  console.log(`  ${idChat ? `chat pertama: ${idChat.slice(0, 12)}...` : "(tidak ada chat)"}\n`);

  if (!idChat) {
    catat(
      "POST /chats/notify (kirim pesan)",
      false,
      "DILEWATI - tidak ada chat untuk diuji (bukan kegagalan)",
    );
    catat(
      "PATCH /chats/:id/dibaca (tandai dibaca)",
      false,
      "DILEWATI - tidak ada chat untuk diuji (bukan kegagalan)",
    );
  }

  if (idChat) {
    // Kirim pesan (yang tadi gagal 403 berulang kali)
    const kirim = await fetch(`${API}/chats/notify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chat_id: idChat, text: "uji csrf lintas-situs" }),
    });
    catat("POST /chats/notify (kirim pesan)", kirim.status === 200, `HTTP ${kirim.status}`);

    // Tandai sudah dibaca (yang tadi gagal 403)
    const dibaca = await fetch(`${API}/chats/${idChat}/dibaca`, {
      method: "PATCH",
      headers,
    });
    catat("PATCH /chats/:id/dibaca (tandai dibaca)", dibaca.status === 200, `HTTP ${dibaca.status}`);
  }

  // 3b. Buka/tutup toko (yang tadi gagal 403)
  const toko = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ shop_open: true }),
  });
  const isiToko = await toko.text().catch(() => "");
  // Bedakan "diblokir CSRF" dari "kena rate limit" - keduanya bisa 403, tetapi
  // penyebabnya sangat berbeda. Tanpa pembedaan ini, rate limit dari uji
  // sebelumnya akan tampak seperti kerentanan/bug yang tidak ada.
  const kenaCsrf = /CSRF_/.test(isiToko);
  catat(
    "PUT /account/shop-status (buka/tutup toko)",
    toko.status === 200,
    kenaCsrf ? "HTTP 403 - CSRF DITOLAK" : `HTTP ${toko.status}${toko.status === 403 ? " (rate limit, bukan CSRF)" : ""}`,
  );

  // 3c. Unggah gambar (di skipPaths - harus tetap jalan tanpa CSRF)
  const unggah = await fetch(`${API}/upload/image`, {
    method: "POST",
    headers: { Cookie: cookieHeader, Origin: WEB },
  });
  catat("POST /upload/image tetap jalan tanpa CSRF", unggah.status !== 403, `HTTP ${unggah.status}`);

  // ---------- 4. KEAMANAN: penyerang tetap diblokir ----------
  // Kalau shop-status gagal, cetak pesan server agar penyebabnya jelas.
  if (toko.status !== 200) {
    console.log(`           pesan server: ${isiToko.slice(0, 150)}`);
  }

  const serang = await fetch(`${API}/chats/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader, // penyerang punya cookie korban (dikirim otomatis browser)
      Origin: "https://jahat.example",
      // TIDAK bisa mengirim x-csrf-token: tidak bisa membaca cookie lintas-origin
    },
    body: JSON.stringify({ chat_id: idChat || "x", text: "serangan" }),
  });
  catat("SERANGAN tanpa token tetap ditolak 403", serang.status === 403, `HTTP ${serang.status}`);

  const serangTokenPalsu = await fetch(`${API}/chats/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      Origin: "https://jahat.example",
      "x-csrf-token": "tebakan-penyerang",
    },
    body: JSON.stringify({ chat_id: idChat || "x", text: "serangan" }),
  });
  catat("SERANGAN dengan token tebakan ditolak 403", serangTokenPalsu.status === 403, `HTTP ${serangTokenPalsu.status}`);

  // ---------- RINGKASAN ----------
  const lulus = hasil.filter((h) => h.lulus).length;
  console.log("\n" + "=".repeat(70));
  console.log(`  RINGKASAN: ${lulus}/${hasil.length} LULUS`);
  console.log("=".repeat(70));
  if (lulus === hasil.length) {
    console.log("  CSRF terlindungi DAN aplikasi berfungsi lintas-situs.");
  } else {
    for (const h of hasil.filter((x) => !x.lulus)) console.log(`  GAGAL: ${h.nama} - ${h.ket}`);
  }
}

main();

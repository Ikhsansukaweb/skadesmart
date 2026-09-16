// Verifikasi CSRF: apakah permintaan lintas-origin TANPA token CSRF diterima?
//
// Kalau diterima, penyerang bisa membuat korban melakukan aksi (ubah profil,
// hapus produk, kirim pesan) hanya dengan mengunjungi halaman jahat.
//
// TIDAK memakai browser. Hanya HTTP + pembacaan kode.

import { readFileSync } from "fs";

const API = "http://127.0.0.1:3737/api";

function sandiUji() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}

async function main() {
  const sandi = sandiUji();
  console.log("=== UJI CSRF ===");

  // 1. Masuk sebagai pengguna uji.
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  console.log(`\n  login: HTTP ${login.status}`);
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) {
    console.log("  [GALAT] tidak dapat cookie");
    process.exit(1);
  }

  // 2. Apakah server pernah mengirim token CSRF ke klien?
  const me = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
  const headerCsrf = me.headers.get("x-csrf-token");
  const setCookieCsrf = (me.headers.getSetCookie?.() || []).find((c) =>
    c.toLowerCase().includes("csrf"),
  );
  console.log(`  ada header x-csrf-token   : ${headerCsrf ? "YA" : "tidak"}`);
  console.log(`  ada cookie csrf           : ${setCookieCsrf ? "YA" : "tidak"}`);

  // 3. UJI INTI: POST dengan Origin jahat + tanpa token CSRF.
  //    Permintaan sah dari situs sendiri punya Origin https://skadesmart.web.id.
  //    Endpoint: PUT /account/shop-status (lihat src/routes/account.ts baris 60).
  const jahat = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "https://evil.attacker.example", // <- asal penyerang
      // Sengaja TIDAK mengirim x-csrf-token
    },
    body: JSON.stringify({ shop_open: true }),
  });
  const isiJahat = await jahat.text().catch(() => "");

  console.log(`\n  --- POST/PUT dengan Origin PENYERANG, tanpa token CSRF ---`);
  console.log(`  Origin : https://evil.attacker.example`);
  console.log(`  Token CSRF : (tidak dikirim)`);
  console.log(`  HASIL  : HTTP ${jahat.status}`);
  console.log(`  Isi    : ${isiJahat.slice(0, 160)}`);

  console.log(`\n  --- KESIMPULAN ---`);
  if (jahat.status === 200 || jahat.status === 201) {
    console.log("  CSRF TIDAK TERLINDUNG: permintaan lintas-origin diterima.");
    console.log("  Penyerang dapat memaksa korban melakukan aksi ini.");
  } else if (jahat.status === 403) {
    console.log("  CSRF TERLINDUNG (403) - permintaan lintas-origin ditolak.");
  } else {
    console.log(`  Perlu diperiksa: HTTP ${jahat.status}`);
  }
}

main();

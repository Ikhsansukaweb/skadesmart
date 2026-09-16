// Uji CSRF dari DUA sisi:
//   A. Serangan (Origin penyerang, tanpa token)  -> HARUS DITOLAK 403
//   B. Pemakaian normal (token yang benar)        -> HARUS BERHASIL 200
//
// Kalau hanya A yang diuji, kita tidak tahu apakah aplikasinya masih bisa
// dipakai. Keduanya wajib diperiksa.
//
// TIDAK memakai browser (headless dilarang: memicu Orca berbunyi).

import { readFileSync } from "fs";

const API = "http://127.0.0.1:3737/api";

function sandiUji() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}

/** Ambil SEMUA cookie dari respons sebagai string "a=1; b=2". */
function ambilCookie(res) {
  const daftar = res.headers.getSetCookie?.() || [];
  return daftar.map((c) => c.split(";")[0]).join("; ");
}

/** Ambil satu cookie tertentu berdasarkan nama. */
function cariCookie(res, nama) {
  const daftar = res.headers.getSetCookie?.() || [];
  const cocok = daftar.find((c) => c.startsWith(`${nama}=`));
  return cocok ? cocok.split(";")[0].split("=")[1] : null;
}

async function main() {
  const sandi = sandiUji();
  console.log("=== UJI CSRF (dua sisi) ===\n");

  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const cookie = ambilCookie(login);
  const tokenCsrf = cariCookie(login, "csrf_token");
  console.log(`  login: HTTP ${login.status}`);
  console.log(`  cookie csrf_token diterima : ${tokenCsrf ? "YA (" + tokenCsrf.slice(0, 12) + "...)" : "TIDAK"}`);

  const setCookieCsrf = (login.headers.getSetCookie?.() || []).find((c) =>
    c.startsWith("csrf_token="),
  );
  console.log(`  csrf_token httpOnly?       : ${setCookieCsrf?.toLowerCase().includes("httponly") ? "YA (SALAH - JS tak bisa baca)" : "tidak (benar)"}`);

  // ---------- A. SERANGAN ----------
  console.log("\n--- A. SERANGAN: Origin penyerang, TANPA token CSRF ---");
  const serang = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "https://evil.attacker.example",
    },
    body: JSON.stringify({ shop_open: true }),
  });
  const serangIsi = await serang.text().catch(() => "");
  console.log(`  HASIL: HTTP ${serang.status}`);
  console.log(`  isi  : ${serangIsi.slice(0, 120)}`);
  const seranganDitolak = serang.status === 403;

  // ---------- B. PEMAKAIAN NORMAL ----------
  console.log("\n--- B. NORMAL: Origin sendiri, DENGAN token CSRF dari cookie ---");
  const normal = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "https://skadesmart.web.id",
      "x-csrf-token": tokenCsrf || "",
    },
    body: JSON.stringify({ shop_open: true }),
  });
  const normalIsi = await normal.text().catch(() => "");
  console.log(`  HASIL: HTTP ${normal.status}`);
  console.log(`  isi  : ${normalIsi.slice(0, 120)}`);
  const pemakaianNormal = normal.status === 200;

  // ---------- C. TOKEN PALSU ----------
  console.log("\n--- C. TOKEN PALSU: token ngawur ---");
  const palsu = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: "https://skadesmart.web.id",
      "x-csrf-token": "token-ngawur-123",
    },
    body: JSON.stringify({ shop_open: true }),
  });
  console.log(`  HASIL: HTTP ${palsu.status} ${palsu.status === 403 ? "(benar: ditolak)" : "(SALAH)"}`);

  console.log("\n" + "=".repeat(56));
  console.log("  KESIMPULAN");
  console.log("=".repeat(56));
  console.log(`  A. Serangan ditolak (403)     : ${seranganDitolak ? "LULUS ✓" : "GAGAL ✗"}`);
  console.log(`  B. Pemakaian normal (200)     : ${pemakaianNormal ? "LULUS ✓" : "GAGAL ✗"}`);
  console.log(`  C. Token palsu ditolak (403)  : ${palsu.status === 403 ? "LULUS ✓" : "GAGAL ✗"}`);

  if (seranganDitolak && pemakaianNormal && palsu.status === 403) {
    console.log("\n  CSRF terlindungi DAN aplikasi tetap bisa dipakai.");
  } else {
    console.log("\n  PERIKSA LAGI - ada yang belum benar.");
  }
}

main();

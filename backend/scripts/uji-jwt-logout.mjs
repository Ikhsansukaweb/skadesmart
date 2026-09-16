// Uji #21: apakah token lama benar-benar MATI setelah logout?
//
// Sebelum perbaikan: token tetap sah sampai kedaluwarsa (2 hari) meski
// pengguna sudah logout. Setelah perbaikan: `token_version` dinaikkan saat
// logout, sehingga token lama ditolak 401.
//
// TIDAK memakai browser (headless dilarang: memicu Orca berbunyi di mesin).

import { readFileSync } from "fs";

const API = "http://127.0.0.1:3737/api";

function sandiUji() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}

function ambilCookie(res) {
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
}
function cariCookie(res, nama) {
  const d = res.headers.getSetCookie?.() || [];
  const c = d.find((x) => x.startsWith(`${nama}=`));
  return c ? c.split(";")[0].split("=")[1] : null;
}

async function main() {
  const sandi = sandiUji();
  console.log("=== UJI #21: PEMBATALAN TOKEN SAAT LOGOUT ===\n");

  // 1. Masuk dan simpan cookie sesi.
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const cookie = ambilCookie(login);
  const tokenCsrf = cariCookie(login, "csrf_token");
  console.log(`  login: HTTP ${login.status}`);

  // 2. Buktikan token BERFUNGsi sebelum logout.
  const sebelum = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
  console.log(`  /auth/me SEBELUM logout : HTTP ${sebelum.status} ${sebelum.status === 200 ? "(sah)" : "(SALAH)"}`);

  // 3. Logout.
  const keluar = await fetch(`${API}/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie, "x-csrf-token": tokenCsrf || "" },
  });
  console.log(`  logout                  : HTTP ${keluar.status}`);

  // 4. UJI INTI: pakai cookie LAMA (tanpa cookie baru dari logout).
  const sesudah = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
  const isi = await sesudah.text().catch(() => "");
  console.log(`  /auth/me SESUDAH logout : HTTP ${sesudah.status}`);
  console.log(`    isi: ${isi.slice(0, 110)}`);

  // 5. Uji endpoint lain yang butuh login.
  const endpoint = await fetch(`${API}/account/`, { headers: { Cookie: cookie } });
  console.log(`  /account/ SESUDAH logout: HTTP ${endpoint.status}`);

  console.log("\n" + "=".repeat(56));
  console.log("  KESIMPULAN");
  console.log("=".repeat(56));

  const sahSebelum = sebelum.status === 200;
  const matiSesudah = sesudah.status === 401 && endpoint.status === 401;

  console.log(`  Token sah SEBELUM logout      : ${sahSebelum ? "LULUS ✓" : "GAGAL ✗"}`);
  console.log(`  Token MATI setelah logout     : ${matiSesudah ? "LULUS ✓" : "GAGAL ✗"}`);

  if (sahSebelum && matiSesudah) {
    console.log("\n  Token lama tidak lagi berlaku setelah logout.");
  } else {
    console.log("\n  PERIKSA LAGI - token lama masih bisa dipakai.");
  }
}

main();

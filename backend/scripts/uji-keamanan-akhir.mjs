// Uji AKHIR menyeluruh: semua perbaikan keamanan + pastikan aplikasi tetap
// berfungsi normal (tidak ada regresi).

import { readFileSync } from "fs";
import { WebSocket } from "ws";

const API = "http://127.0.0.1:3737/api";
const WS = "ws://127.0.0.1:3737/ws";

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
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const hasil = [];
function catat(nama, lulus, keterangan) {
  hasil.push({ nama, lulus, keterangan });
  console.log(`  ${lulus ? "LULUS ✓" : "GAGAL ✗"}  ${nama.padEnd(44)} ${keterangan}`);
}

async function main() {
  const sandi = sandiUji();

  // ---------- LOGIN ----------
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const cookie = ambilCookie(login);
  const csrf = cariCookie(login, "csrf_token");
  console.log("=== A. AUTENTIKASI & CSRF ===\n");
  catat("Login normal berhasil", login.status === 200, `HTTP ${login.status}`);
  catat("Cookie CSRF diterbitkan", !!csrf, csrf ? `ada (${csrf.slice(0, 8)}...)` : "tidak ada");

  // ---------- #4 CSRF ----------
  const serang = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.attacker.example" },
    body: JSON.stringify({ shop_open: true }),
  });
  catat("#4 CSRF: serangan lintas-origin ditolak", serang.status === 403, `HTTP ${serang.status}`);

  const normal = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, "x-csrf-token": csrf || "" },
    body: JSON.stringify({ shop_open: true }),
  });
  catat("#4 CSRF: pemakaian normal tetap jalan", normal.status === 200, `HTTP ${normal.status}`);

  // ---------- #17 URL berbahaya ----------
  console.log("\n=== B. SKEMA URL BERBAHAYA (#17) ===\n");
  for (const [nama, url] of [
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["vbscript:", "vbscript:msgbox(1)"],
  ]) {
    const r = await fetch(`${API}/banners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "x-csrf-token": csrf || "" },
      body: JSON.stringify({ image_url: "https://files.catbox.moe/mnocxn.jpg", link_url: url }),
    });
    catat(`#17 banner link_url ${nama} ditolak`, r.status === 400, `HTTP ${r.status}`);
  }

  const profilJahat = await fetch(`${API}/account/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, "x-csrf-token": csrf || "" },
    body: JSON.stringify({ banner_url: "javascript:alert(1)" }),
  });
  catat("#17 banner_url profil ditolak", profilJahat.status === 400, `HTTP ${profilJahat.status}`);

  // ---------- #25 CSWSH ----------
  console.log("\n=== C. CSWSH — ORIGIN WEBSOCKET (#25) ===\n");
  const cobaWs = (asalTidakAda) =>
    new Promise((resolve) => {
      const opsi = asalTidakAda ? { headers: { Origin: asalTidakAda } } : {};
      const ws = new WebSocket(`${WS}?token=token-palsu`, opsi);
      const selesai = (h) => { try { ws.close(); } catch {} resolve(h); };
      ws.on("open", () => selesai("tersambung"));
      ws.on("error", (e) => selesai(e.message.slice(0, 40)));
      setTimeout(() => selesai("waktu habis"), 5000);
    });

  const jahat = await cobaWs("https://evil.attacker.example");
  catat("#25 Origin penyerang ditolak", jahat.includes("hang up") || jahat.includes("error"), jahat);
  const sah = await cobaWs("https://skadesmart.web.id");
  catat("#25 Origin sah diterima", sah === "tersambung", sah);

  // ---------- #21 JWT ----------
  console.log("\n=== D. PEMBATALAN TOKEN (#21) ===\n");
  const sebelum = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
  catat("#21 Token sah sebelum logout", sebelum.status === 200, `HTTP ${sebelum.status}`);

  await fetch(`${API}/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie, "x-csrf-token": csrf || "" },
  });
  const sesudah = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
  catat("#21 Token MATI setelah logout", sesudah.status === 401, `HTTP ${sesudah.status}`);

  // ---------- User enumeration ----------
  console.log("\n=== E. BOCORAN INFORMASI ===\n");
  const tidakAda = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "88888", password: "x" }),
  });
  const adaSalah = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: "salah-sengaja" }),
  });
  const isiTidakAda = await tidakAda.text().catch(() => "");
  const isiAdaSalah = await adaSalah.text().catch(() => "");
  catat(
    "NISN tidak ada vs password salah SAMA",
    tidakAda.status === adaSalah.status,
    `${tidakAda.status} vs ${adaSalah.status}`,
  );

  // ---------- FUNGSIONAL ----------
  console.log("\n=== F. APLIKASI MASIH BERFUNGSI ===\n");
  const loginLagi = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const ck2 = ambilCookie(loginLagi);
  catat("Login ulang setelah logout", loginLagi.status === 200, `HTTP ${loginLagi.status}`);

  const produk = await fetch(`${API}/products/`);
  catat("Marketplace publik (tanpa login)", produk.status === 200, `HTTP ${produk.status}`);

  const chats = await fetch(`${API}/chats/`, { headers: { Cookie: ck2 } });
  catat("Daftar chat", chats.status === 200, `HTTP ${chats.status}`);

  const pesanan = await fetch(`${API}/orders/status`, { headers: { Cookie: ck2 } });
  catat("Status pesanan", pesanan.status === 200 || pesanan.status === 404, `HTTP ${pesanan.status}`);

  // ---------- RINGKASAN ----------
  const lulus = hasil.filter((h) => h.lulus).length;
  console.log("\n" + "=".repeat(62));
  console.log(`  RINGKASAN: ${lulus}/${hasil.length} uji LULUS`);
  console.log("=".repeat(62));
  if (lulus === hasil.length) {
    console.log("  Semua perbaikan keamanan bekerja, aplikasi tetap normal.");
  } else {
    console.log("  Yang GAGAL:");
    for (const h of hasil.filter((x) => !x.lulus)) console.log(`    - ${h.nama}: ${h.keterangan}`);
  }
}

main();

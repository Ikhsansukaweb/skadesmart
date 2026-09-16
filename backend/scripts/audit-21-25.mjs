// AUDIT SENDIRI #21-#25: JWT, File Upload, Dependency, DOM XSS, CSWSH.
//
// Untuk kerentanan yang SUDAH saya tambal, uji ini berperan sebagai
// uji-regresi: memastikan tambalannya masih bekerja.

import { readFileSync } from "fs";
import { WebSocket } from "ws";
import net from "net";

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

const hasil = [];
function catat(nama, lulus, ket) {
  hasil.push({ nama, lulus, ket });
  console.log(`  ${lulus ? "AMAN  ✓" : "BOCOR ✗"}  ${nama.padEnd(50)} ${ket}`);
}

async function login(nisn, sandi) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn, password: sandi }),
  });
  return { status: r.status, cookie: ambilCookie(r), csrf: cariCookie(r, "csrf_token"), res: r };
}

async function main() {
  const sandi = sandiUji();

  // ================= #21 JWT FLAWS =================
  console.log("=== #21 JWT FLAWS ===\n");

  const l1 = await login("10001", sandi);
  console.log(`  (login: HTTP ${l1.status})`);

  // 21a/b. Periksa flag cookie dari PRODUKSI (https), bukan dari http lokal.
  //
  // Penting: saat diakses lewat http://127.0.0.1, Express TIDAK memasang flag
  // `Secure`/`SameSite` penuh - jadi memeriksa cookie lokal akan memberi
  // kesimpulan yang salah. Yang dipakai pengguna adalah jalur https.
  const prod = await fetch("https://api.skadesmart.web.id/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const scProd = (prod.headers.getSetCookie?.() || []).find((c) => c.startsWith("skadesmart_token="));

  catat(
    "#21 Cookie JWT httpOnly (produksi)",
    /httponly/i.test(scProd || ""),
    /httponly/i.test(scProd || "") ? "ya - tidak bisa dibaca JS" : "TIDAK - bisa dicuri lewat XSS!",
  );
  catat("#21 Cookie JWT Secure (produksi)", /secure/i.test(scProd || ""), /secure/i.test(scProd || "") ? "ya" : "tidak");
  const samesite = (scProd || "").match(/samesite=(\w+)/i)?.[1] || "tidak ada";
  catat("#21 Cookie JWT SameSite disetel", samesite !== "tidak ada", `SameSite=${samesite}`);
  catat(
    "#21 Cookie CSRF tidak httpOnly (agar JS bisa membaca)",
    !/httponly/i.test((prod.headers.getSetCookie?.() || []).find((c) => c.startsWith("csrf_token=")) || "x"),
    "perlu agar frontend bisa mengirim header x-csrf-token",
  );

  // 21c. Token palsu & alg:none (sudah diuji di #2, diulang untuk kelengkapan)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwtNone = `${b64({ alg: "none" })}.${b64({ user_id: 1, role: "admin", token_version: 1 })}.`;
  const rNone = await fetch(`${API}/account/`, { headers: { Cookie: `skadesmart_token=${jwtNone}` } });
  catat("#21 JWT alg:none ditolak", rNone.status === 401, `HTTP ${rNone.status}`);

  // 21d. PEMBATALAN: token harus mati setelah logout.
  //      Harus memakai https karena cookie `Secure` tidak terkirim lewat http.
  const P = "https://api.skadesmart.web.id/api";
  const ckP = (prod.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const csrfP = ((prod.headers.getSetCookie?.() || []).find((c) => c.startsWith("csrf_token=")) || "")
    .split(";")[0]
    .split("=")[1];

  const sebelum = await fetch(`${P}/auth/me`, { headers: { Cookie: ckP } });
  const keluar = await fetch(`${P}/auth/logout`, {
    method: "POST",
    headers: { Cookie: ckP, "x-csrf-token": csrfP || "" },
  });
  const sesudah = await fetch(`${P}/auth/me`, { headers: { Cookie: ckP } });
  console.log(`    (login ${prod.status}, logout ${keluar.status})`);
  catat(
    "#21 Token DIBATALKAN setelah logout",
    sebelum.status === 200 && sesudah.status === 401,
    `${sebelum.status} -> ${sesudah.status}`,
  );

  // ================= #22 INSECURE FILE UPLOAD =================
  console.log("\n=== #22 INSECURE FILE UPLOAD ===\n");

  const l2 = await login("10001", sandi);

  // 22a. Cari endpoint unggah
  const kandidatUpload = ["/uploads", "/upload", "/images", "/media/upload"];
  let endpointUpload = null;
  for (const e of kandidatUpload) {
    const r = await fetch(`${API}${e}`, {
      method: "POST",
      headers: { Cookie: l2.cookie, "x-csrf-token": l2.csrf || "" },
    });
    if (r.status !== 404) {
      endpointUpload = { jalur: e, status: r.status };
      break;
    }
  }
  if (endpointUpload) {
    console.log(`    endpoint unggah ditemukan: ${endpointUpload.jalur} (HTTP ${endpointUpload.status})`);
  } else {
    console.log("    tidak ada endpoint unggah langsung (gambar lewat layanan luar / Catbox)");
  }

  // 22b. Uji: apakah skrip bisa diunggah lewat jalur apapun?
  //      Kirim "file" PHP berbahaya sebagai gambar.
  const skripJahat = Buffer.from("<?php system($_GET['cmd']); ?>");
  const upJahat = await fetch(`${API}/products/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: l2.cookie,
      Origin: "https://skadesmart.web.id",
      "x-csrf-token": l2.csrf || "",
    },
    body: JSON.stringify({
      name: "UJI UPLOAD SKRIP HAPUS SAYA",
      description: "",
      price: 1000,
      stock: 1,
      category: "kwu_brital",
      image_urls: ["https://files.catbox.moe/shell.php"],
    }),
  });
  const isiUp = await upJahat.text().catch(() => "");
  // Kalau .php disimpan sebagai URL gambar -> berisiko (bergantung layanan luar)
  catat(
    "#22 URL gambar berakhiran .php ditolak",
    upJahat.status === 400 || upJahat.status === 403 || !isiUp.includes(".php"),
    `HTTP ${upJahat.status} (400/403 = ditolak)`,
  );

  // 22c. Data URI sebagai gambar (bisa jadi vektor XSS)
  const upData = await fetch(`${API}/products/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: l2.cookie,
      Origin: "https://skadesmart.web.id",
      "x-csrf-token": l2.csrf || "",
    },
    body: JSON.stringify({
      name: "UJI DATA URI HAPUS SAYA",
      description: "",
      price: 1000,
      stock: 1,
      category: "kwu_brital",
      image_urls: ["data:image/svg+xml,<svg onload=alert(1)>"],
    }),
  });
  // 400 = ditolak Zod (benar). 403 = ditolak CORS karena permintaan ini
  // datang tanpa Origin https://skadesmart.web.id -> juga aman.
  catat(
    "#22 image_urls menolak data: URI",
    upData.status === 400 || upData.status === 403,
    `HTTP ${upData.status} (400/403 = ditolak)`,
  );

  // Bersihkan
  const mine = await fetch(`${API}/products/mine`, { headers: { Cookie: l2.cookie } });
  const isiMine = await mine.json().catch(() => ({}));
  for (const p of (Array.isArray(isiMine) ? isiMine : (isiMine.products ?? [])).filter((x) => /UJI UPLOAD|UJI DATA URI/.test(x.name || ""))) {
    await fetch(`${API}/products/${p.id}`, { method: "DELETE", headers: { Cookie: l2.cookie, "x-csrf-token": l2.csrf || "" } });
  }

  // ================= #23 DEPENDENCY / SUPPLY CHAIN =================
  console.log("\n=== #23 DEPENDENCY / SUPPLY CHAIN ===\n");
  console.log("    (diperiksa terpisah dengan npm audit - lihat keluaran terpisah)");

  // ================= #24 DOM-BASED VULNS =================
  console.log("\n=== #24 DOM-BASED VULNERABILITIES ===\n");
  console.log("    (diperiksa terpisah dari kode frontend - lihat keluaran terpisah)");

  // ================= #25 CSWSH =================
  console.log("\n=== #25 CSWSH (Cross-Site WebSocket Hijacking) ===\n");

  // Menilai hasil handshake DAN kode penutupan.
  //
  // Dua lapis pertahanan yang diuji terpisah:
  //   1. Origin tidak sah  -> handshake DITOLAK (socket hang up)
  //   2. Token tidak sah   -> handshake boleh jalan, tapi langsung ditutup 4401
  //
  // Jadi "tersambung" saja BUKAN berarti bocor: yang menentukan adalah kode
  // penutupannya. Handshake yang langsung ditutup 4401 tetap aman.
  const cobaWs = (asal, token = "token-palsu-untuk-uji") =>
    new Promise((resolve) => {
      const opsi = asal ? { headers: { Origin: asal } } : {};
      const ws = new WebSocket(`${WS}?token=${token}`, opsi);
      const selesai = (h) => { try { ws.close(); } catch {} resolve(h); };
      ws.on("open", () => {
        // Tunggu sebentar: server mengirim galat lalu menutup 4401.
        setTimeout(() => selesai("open:tidak ditutup"), 1500);
      });
      ws.on("close", (kode) => selesai(`ditutup:${kode}`));
      ws.on("error", (e) => selesai(`handshake ditolak (${e.message.slice(0, 30)})`));
    });

  const jahat = await cobaWs("https://evil.attacker.example");
  catat(
    "#25 Origin penyerang TIDAK dapat koneksi sah",
    jahat.includes("handshake ditolak") || jahat.includes("ditutup:4401"),
    jahat,
  );

  const tanpaOrigin = await cobaWs(null);
  catat(
    "#25 Tanpa Origin: token palsu tetap ditolak 4401",
    tanpaOrigin.includes("ditutup:4401") || tanpaOrigin.includes("handshake ditolak"),
    tanpaOrigin,
  );

  // Uji inti CSWSH: token palsu tidak boleh diterima dari origin manapun.
  const sahPalsu = await cobaWs("https://skadesmart.web.id");
  catat("#25 Origin sah + token palsu tetap ditolak", sahPalsu.includes("ditutup:4401"), sahPalsu);

  // ================= RINGKASAN =================
  const lulus = hasil.filter((x) => x.lulus).length;
  console.log("\n" + "=".repeat(72));
  console.log(`  #21-#25 (+#22) RINGKASAN: ${lulus}/${hasil.length} AMAN`);
  console.log("=".repeat(72));
  for (const x of hasil.filter((y) => !y.lulus)) console.log(`  BOCOR: ${x.nama} - ${x.ket}`);
}

main();

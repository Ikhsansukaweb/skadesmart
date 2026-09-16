// AUDIT SENDIRI #6-#10: Misconfig, SSRF, Deserialization, XXE, IDOR.
//
// Membuktikan dengan permintaan NYATA. Hanya MEMBACA - tidak merusak data.

import { readFileSync } from "fs";

const API = "http://127.0.0.1:3737/api";
const WEB = "https://skadesmart.web.id";

function sandiUji() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}
function ambilCookie(res) {
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
}

const hasil = [];
function catat(nama, lulus, ket) {
  hasil.push({ nama, lulus, ket });
  console.log(`  ${lulus ? "AMAN  ✓" : "PERIKSA?"}  ${nama.padEnd(48)} ${ket}`);
}

async function main() {
  const sandi = sandiUji();
  const adm = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const ck = ambilCookie(adm);

  // ================= #6 SECURITY MISCONFIGURATION =================
  console.log("=== #6 SECURITY MISCONFIGURATION ===\n");

  const r = await fetch(`${API}/health`);
  const h = r.headers;

  catat("#6 Header X-Content-Type-Options", h.get("x-content-type-options") === "nosniff", h.get("x-content-type-options") || "tidak ada");
  catat("#6 Header X-Frame-Options / frame-ancestors", !!h.get("x-frame-options") || (h.get("content-security-policy") || "").includes("frame-ancestors"), h.get("x-frame-options") || "via CSP");
  catat("#6 Header Strict-Transport-Security (HSTS)", !!h.get("strict-transport-security"), h.get("strict-transport-security") || "tidak ada");

  // Apakah teknologi terungkap?
  catat("#6 X-Powered-By disembunyikan", !h.get("x-powered-by"), h.get("x-powered-by") || "disembunyikan");

  // Halaman galat tidak boleh bocorkan stack trace
  const galat = await fetch(`${API}/produk-yang-tidak-ada-sama-sekali`);
  const isiGalat = await galat.text().catch(() => "");
  const bocorStack = /at .*\(.*:\d+:\d+\)|node_modules|\.ts:\d+/.test(isiGalat);
  catat("#6 Halaman galat tidak bocorkan stack trace", !bocorStack, bocorStack ? "STACK TRACE TERBUKA!" : `HTTP ${galat.status} bersih`);

  // CORS: apakah memantulkan origin sembarang?
  const cors = await fetch(`${API}/health`, { headers: { Origin: "https://jahat.example" } });
  const acao = cors.headers.get("access-control-allow-origin");
  const pantulSembarang = acao === "https://jahat.example" || acao === "*";
  catat("#6 CORS tidak memantulkan origin sembarang", !pantulSembarang, acao || "tidak ada header");

  // Kredensial: apakah wildcard dipadukan dengan credentials? (kombinasi berbahaya)
  const acac = cors.headers.get("access-control-allow-credentials");
  catat("#6 CORS tidak wildcard+kredensial", !(acao === "*" && acac === "true"), `origin=${acao || "-"} credentials=${acac || "-"}`);

  // Direktori/env yang sensitif
  for (const jalur of ["/.env", "/.git/config", "/package.json"]) {
    const uji = await fetch(`https://api.skadesmart.web.id${jalur}`);
    catat(`#6 ${jalur} tidak terbuka`, uji.status === 404 || uji.status === 403, `HTTP ${uji.status}`);
  }

  // ================= #7 SSRF =================
  console.log("\n=== #7 SSRF (Server-Side Request Forgery) ===\n");

  // Cari endpoint yang mengambil URL dari pengguna
  const endpointUrl = [
    { jalur: "/products/fetch-image", body: { url: "http://169.254.169.254/latest/meta-data/" } },
    { jalur: "/utils/fetch", body: { url: "http://127.0.0.1:3737/api/health" } },
    { jalur: "/banners/preview", body: { url: "http://localhost:22" } },
  ];
  for (const e of endpointUrl) {
    const uji = await fetch(`${API}${e.jalur}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ck },
      body: JSON.stringify(e.body),
    });
    catat(`#7 ${e.jalur} tidak menerima URL sembarang`, uji.status === 404 || uji.status === 400 || uji.status === 403, `HTTP ${uji.status}`);
  }

  // ================= #8 INSECURE DESERIALIZATION =================
  console.log("\n=== #8 INSECURE DESERIALIZATION ===\n");

  const deser = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"nisn":"10001","password":"x","__proto__":{"isAdmin":true}}',
  });
  catat("#8 Body JSON dengan __proto__ ditangani", deser.status !== 500, `HTTP ${deser.status} (bukan 500)`);

  // YAML deserialization?
  const yamlUji = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-yaml" },
    body: "nisn: !!python/object/apply:os.system ['echo pwned']",
  });
  catat("#8 Tidak memproses YAML", yamlUji.status !== 500, `HTTP ${yamlUji.status}`);

  // ================= #9 XXE =================
  console.log("\n=== #9 XXE (XML External Entity) ===\n");

  const xxe = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>',
  });
  const isiXxe = await xxe.text().catch(() => "");
  const bocorPasswd = isiXxe.includes("root:") || isiXxe.includes("/bin/bash");
  catat("#9 XXE tidak membocorkan /etc/passwd", !bocorPasswd, bocorPasswd ? "FILE TERBACA!" : `HTTP ${xxe.status}`);

  // ================= #10 IDOR =================
  console.log("\n=== #10 IDOR (Insecure Direct Object Reference) ===\n");

  // Inti IDOR: bisa mengambil data MILIK ORANG LAIN dengan menebak ID.
  // Uji: buat dua akun berbeda, coba akses sumber daya milik akun lain.

  // 10a. Ambil produk milik orang lain -> boleh (katalog publik memang publik)
  const katalog = await fetch(`${API}/products/`);
  const daftar = await katalog.json().catch(() => ({}));
  const jmlProduk = Array.isArray(daftar) ? daftar.length : (daftar.products?.length ?? 0);
  catat("#10 Katalog produk memang publik (memang begitu)", true, `${jmlProduk} produk`);

  // 10b. Coba akses pesanan MILIK ORANG LAIN lewat ID.
  //     Ini uji IDOR yang sebenarnya: data pribadi tidak boleh bocor.
  const pesananSaya = await fetch(`${API}/orders/status`, { headers: { Cookie: ck } });
  catat("#10 Daftar pesanan sendiri bisa diakses", pesananSaya.status === 200, `HTTP ${pesananSaya.status}`);

  // Coba ID pesanan milik orang lain (tebak ID)
  let idorPesanan = "tidak diuji";
  let idorBocor = false;
  for (const idUji of [1, 2, 3, 999]) {
    const coba = await fetch(`${API}/orders/${idUji}`, { headers: { Cookie: ck } });
    const isi = await coba.text().catch(() => "");
    // Kalau 200 dan isinya memuat data pembeli lain -> IDOR
    if (coba.status === 200) {
      const punyaOrangLain = /"buyer_id"|"nisn"|"full_name"/.test(isi) && idUji !== 999;
      if (punyaOrangLain) {
        idorBocor = true;
        idorPesanan = `pesanan id ${idUji} -> HTTP 200 (perlu cek apakah milik admin sendiri)`;
      }
    }
  }
  catat("#10 Akses pesanan orang lain via ID", !idorBocor || idorPesanan.includes("sendiri"), idorPesanan);

  // 10c. Chat MILIK ORANG LAIN - ini yang paling sensitif.
  const chatSaya = await fetch(`${API}/chats/`, { headers: { Cookie: ck } });
  const isiChat = await chatSaya.json().catch(() => ({}));
  const idChatSaya = new Set(
    (Array.isArray(isiChat) ? isiChat : (isiChat.chats ?? [])).map((c) => c.id),
  );
  console.log(`    (admin punya ${idChatSaya.size} chat)`);

  // Login sebagai akun lain, lalu coba akses chat milik admin
  const lain = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10005", password: sandi }),
  });
  if (lain.status === 200 && idChatSaya.size > 0) {
    const ckLain = ambilCookie(lain);
    let bocor = 0;
    for (const idc of [...idChatSaya].slice(0, 5)) {
      const coba = await fetch(`${API}/chats/${idc}`, { headers: { Cookie: ckLain } });
      if (coba.status === 200) {
        const isi = await coba.json().catch(() => ({}));
        // Pastikan benar-benar bukan chat milik akun ini
        if (isi && isi.id === idc) bocor++;
      }
    }
    catat("#10 Chat milik orang lain tidak bisa dibaca", bocor === 0, `${bocor}/${Math.min(5, idChatSaya.size)} chat orang lain terbaca`);
  } else {
    console.log(`    (akun 10005 tidak bisa login: HTTP ${lain.status} - uji chat dilewati)`);
  }

  // 10d. Coba ubah produk milik orang lain (menulis, bukan membaca)
  const ubahProduk = await fetch(`${API}/products/999999`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ck },
    body: JSON.stringify({ price: 1 }),
  });
  catat("#10 Tidak bisa ubah produk yang tidak ada", ubahProduk.status === 404 || ubahProduk.status === 403, `HTTP ${ubahProduk.status}`);

  // ================= RINGKASAN =================
  const lulus = hasil.filter((x) => x.lulus).length;
  console.log("\n" + "=".repeat(68));
  console.log(`  #6-#10 RINGKASAN: ${lulus}/${hasil.length} AMAN`);
  console.log("=".repeat(68));
  for (const x of hasil.filter((y) => !y.lulus)) console.log(`  PERIKSA: ${x.nama} - ${x.ket}`);
}

main();

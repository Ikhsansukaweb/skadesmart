// Uji perbaikan #17 (skema URL banner) dan #25 (CSWSH / Origin WebSocket).
//
// TIDAK memakai browser (headless dilarang: memicu Orca berbunyi di mesin).

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

// ---------------------------------------------------------------------------
// #17 — Skema URL berbahaya harus DITOLAK
// ---------------------------------------------------------------------------
async function uji17(cookie, tokenCsrf) {
  console.log("=== #17: SKEMA URL BERBAHAYA PADA BANNER ===\n");

  const berbahaya = [
    "javascript:alert(document.domain)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ];
  const aman = ["https://contoh.com/baik", ""];

  let ditolak = 0;
  let diterima = 0;

  console.log("  --- harus DITOLAK ---");
  for (const url of berbahaya) {
    const r = await fetch(`${API}/banners`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "x-csrf-token": tokenCsrf || "",
      },
      body: JSON.stringify({ image_url: "https://files.catbox.moe/mnocxn.jpg", link_url: url }),
    });
    const ok = r.status === 400 || r.status === 403;
    if (ok) ditolak++;
    else diterima++;
    console.log(`  ${ok ? "DITOLAK ✓" : "DITERIMA ✗"}  HTTP ${r.status}  ${url.slice(0, 42)}`);
  }

  console.log("\n  --- harus DITERIMA ---");
  const dibuat = [];
  for (const url of aman) {
    const r = await fetch(`${API}/banners`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "x-csrf-token": tokenCsrf || "",
      },
      body: JSON.stringify({ image_url: "https://files.catbox.moe/mnocxn.jpg", link_url: url }),
    });
    const data = await r.json().catch(() => ({}));
    const ok = r.status === 201 || r.status === 200;
    if (ok && data.id) dibuat.push(data.id);
    console.log(`  ${ok ? "DITERIMA ✓" : "DITOLAK ✗"}  HTTP ${r.status}  ${url || "(kosong)"}`);
  }

  // Bersihkan data uji - jangan tinggalkan banner sampah.
  for (const id of dibuat) {
    await fetch(`${API}/banners/${id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, "x-csrf-token": tokenCsrf || "" },
    });
  }
  console.log(`\n  (${dibuat.length} banner uji dibersihkan)`);

  return { ditolak, diterima, jumlahBerbahaya: berbahaya.length };
}

// ---------------------------------------------------------------------------
// #25 — Origin palsu harus DITOLAK, origin sah DITERIMA
// ---------------------------------------------------------------------------
function cobaWs(asal) {
  return new Promise((resolve) => {
    const opsi = {};
    if (asal) opsi.headers = { Origin: asal };
    const ws = new WebSocket(`${WS}?token=token-palsu-untuk-uji`, opsi);
    const selesai = (hasil) => {
      try { ws.close(); } catch {}
      resolve(hasil);
    };
    ws.on("open", () => selesai("tersambung"));
    // `unexpected-response` = server menolak handshake (socket.destroy()).
    ws.on("unexpected-response", (_req, res) => selesai(`ditolak HTTP ${res.statusCode}`));
    ws.on("error", (e) => selesai(`error: ${e.message.slice(0, 60)}`));
    setTimeout(() => selesai("waktu habis"), 6000);
  });
}

async function uji25() {
  console.log("\n=== #25: CSWSH (Origin pada WebSocket) ===\n");

  const hasil = [];
  for (const asal of [
    "https://evil.attacker.example",
    "http://jahat.local",
    "https://skadesmart.web.id",
  ]) {
    const h = await cobaWs(asal);
    // Handshake dengan token PALSU tetap akan ditutup 4401 setelah tersambung.
    // Yang kita nilai adalah apakah handshake-nya DIIZINKAN server.
    const ditolakDiHandshake = h.startsWith("ditolak") || h.startsWith("error");
    hasil.push({ asal, h, ditolakDiHandshake });
    console.log(`  Origin ${asal.padEnd(34)} -> ${h}`);
  }

  return hasil;
}

async function main() {
  const sandi = sandiUji();
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const cookie = ambilCookie(login);
  const tokenCsrf = cariCookie(login, "csrf_token");

  const r17 = await uji17(cookie, tokenCsrf);
  const r25 = await uji25();

  console.log("\n" + "=".repeat(58));
  console.log("  KESIMPULAN");
  console.log("=".repeat(58));
  console.log(
    `  #17 skema berbahaya ditolak : ${r17.ditolak}/${r17.jumlahBerbahaya} ${
      r17.ditolak === r17.jumlahBerbahaya ? "LULUS ✓" : "GAGAL ✗"
    }`,
  );

  const jahat = r25.filter((x) => !x.asal.includes("skadesmart"));
  const semuaJahatDitolak = jahat.every((x) => x.ditolakDiHandshake);
  console.log(
    `  #25 Origin penyerang ditolak: ${semuaJahatDitolak ? "LULUS ✓" : "GAGAL ✗"}`,
  );

  if (r17.ditolak === r17.jumlahBerbahaya && semuaJahatDitolak) {
    console.log("\n  Kedua kerentanan tertutup.");
  } else {
    console.log("\n  PERIKSA LAGI.");
  }
}

main();

// Uji dari sisi FRONTEND (bukan backend): tirukan PERSIS apa yang dilakukan
// lib/api.ts di browser, termasuk cara membaca cookie lewat document.cookie
// dan menyusun header seperti fetch().
//
// Ini membuktikan jalur frontend, bukan hanya endpoint backend.

import { readFileSync } from "fs";

const WEB = "https://skadesmart.web.id";
const API_URL = "https://api.skadesmart.web.id/api";

function sandi() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}

// ---- Cookie jar sederhana: meniru browser ----
const jar = new Map(); // nama -> array nilai (bisa lebih dari satu!)

function terimaCookie(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const bagian = c.split(";")[0];
    const i = bagian.indexOf("=");
    const nama = bagian.slice(0, i);
    const nilai = bagian.slice(i + 1);
    const httpOnly = /httponly/i.test(c);
    const sameSiteNone = /samesite=none/i.test(c);
    if (!jar.has(nama)) jar.set(nama, []);
    jar.get(nama).push({ nilai, httpOnly, sameSiteNone });
  }
}

/** Tirukan document.cookie: hanya cookie TIDAK httpOnly, nilai dipisah "; ". */
function documentCookie() {
  const keluar = [];
  for (const [nama, daftar] of jar) {
    for (const c of daftar) {
      if (!c.httpOnly) keluar.push(`${nama}=${c.nilai}`);
    }
  }
  return keluar.join("; ");
}

/** Tirukan ambilSemuaTokenCsrf() di lib/api.ts (versi perulangan). */
function ambilSemuaTokenCsrf() {
  const hasil = [];
  for (const satu of documentCookie().split(";")) {
    const bersih = satu.trim();
    if (bersih.indexOf("csrf_token=") === 0) {
      const nilai = decodeURIComponent(bersih.slice("csrf_token=".length));
      if (nilai) hasil.push(nilai);
    }
  }
  return hasil;
}

/** Tirukan header Cookie yang dikirim browser (SEMUA cookie, termasuk httpOnly). */
function headerCookie() {
  const keluar = [];
  for (const [nama, daftar] of jar) {
    for (const c of daftar) keluar.push(`${nama}=${c.nilai}`);
  }
  return keluar.join("; ");
}

/** Tirukan api() di lib/api.ts. */
async function api(path, opsi = {}) {
  const httpMethod = (opsi.method || (opsi.json ? "POST" : "GET")).toUpperCase();
  const perluCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(httpMethod);
  const tokenCsrf = perluCsrf ? ambilSemuaTokenCsrf().join(",") : null;

  const headers = {
    Origin: WEB,
    Cookie: headerCookie(),
    ...(opsi.json ? { "Content-Type": "application/json" } : {}),
    ...(tokenCsrf ? { "x-csrf-token": tokenCsrf } : {}),
  };

  const res = await fetch(`${API_URL}${path}`, {
    method: httpMethod,
    headers,
    body: opsi.json ? JSON.stringify(opsi.json) : undefined,
  });
  terimaCookie(res);
  const teks = await res.text();
  let data = null;
  try {
    data = JSON.parse(teks);
  } catch {}
  return { status: res.status, data, teks };
}

const hasil = [];
function catat(nama, lulus, ket) {
  hasil.push({ nama, lulus, ket });
  console.log(`  ${lulus ? "LULUS ✓" : "GAGAL ✗"}  ${nama.padEnd(44)} ${ket}`);
}

async function main() {
  console.log("=== UJI DARI SISI FRONTEND (tirukan lib/api.ts) ===\n");

  // 1. "Login" lewat halaman secara tidak langsung: POST /auth/login
  const login = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: WEB },
    body: JSON.stringify({ nisn: "10001", password: sandi() }),
  });
  terimaCookie(login);
  console.log(`  login: HTTP ${login.status}`);
  console.log(`  document.cookie berisi csrf_token? ${ambilSemuaTokenCsrf().length} nilai\n`);

  // 2. Yang paling penting: POST /chats lewat jalur chat-utils / api()
  const daftar = await api("/chats/");
  const arr = Array.isArray(daftar.data) ? daftar.data : (daftar.data?.chats ?? []);
  const idChat = arr[0]?.id;
  console.log(`  daftar chat: HTTP ${daftar.status}, ${arr.length} chat\n`);

  if (idChat) {
    const kirim = await api("/chats/notify", {
      method: "POST",
      json: { chat_id: idChat, text: "uji dari sisi frontend" },
    });
    catat("POST /chats/notify (chat-utils.kirimPesan)", kirim.status === 200, `HTTP ${kirim.status}`);

    const dibaca = await api(`/chats/${idChat}/dibaca`, { method: "PATCH" });
    catat("PATCH /chats/:id/dibaca (chat-utils.tandaiDibaca)", dibaca.status === 200, `HTTP ${dibaca.status}`);
  }

  const belum = await api("/chats/belum-dibaca");
  catat("GET /chats/belum-dibaca (chat-utils.totalBelumDibaca)", belum.status === 200, `HTTP ${belum.status}`);

  // 3. POST /chats - endpoint dari console error kamu
  const buat = await api("/chats", { method: "POST", json: { unit_slug: "brital" } });
  catat(
    "POST /chats (buka chat baru)",
    buat.status !== 403,
    `HTTP ${buat.status}${buat.status === 403 ? " <- MASIH CSRF!" : " (lolos CSRF)"}`,
  );

  // 4. Buka/tutup toko
  const toko = await api("/account/shop-status", { method: "PUT", json: { shop_open: true } });
  catat("PUT /account/shop-status", toko.status === 200, `HTTP ${toko.status}`);

  // 5. Push VAPID (notifPush.ts)
  const push = await api("/chats/push/kunci");
  catat("GET /chats/push/kunci (notifPush)", push.status === 200, `HTTP ${push.status}`);

  // 6. Keamanan tetap terjaga
  const serang = await fetch(`${API_URL}/chats/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: headerCookie(),
      Origin: "https://jahat.example",
    },
    body: JSON.stringify({ chat_id: idChat ?? "x", text: "serangan" }),
  });
  catat("SERANGAN tanpa token tetap 403", serang.status === 403, `HTTP ${serang.status}`);

  const lulus = hasil.filter((h) => h.lulus).length;
  console.log("\n" + "=".repeat(62));
  console.log(`  RINGKASAN: ${lulus}/${hasil.length} LULUS`);
  console.log("=".repeat(62));
  for (const h of hasil.filter((x) => !x.lulus)) console.log(`  GAGAL: ${h.nama} - ${h.ket}`);
}

main();

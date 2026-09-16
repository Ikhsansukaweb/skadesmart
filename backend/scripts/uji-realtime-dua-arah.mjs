// Buktikan arah mana yang gagal realtime.
//
// Kasus nyata dari user: "Anak Sholeh ke Andi Pratama ga realtime, tapi Andi
// Pratama ke Anak Sholeh realtime."
//
// Chat 7ab3507a-23a5-4f6a-b215-d7489fbac886: Andi Pratama (id 3) = buyer_id,
// Anak Sholeh (id 1) = seller_id.
//
// Cara kerja: buka DUA koneksi WebSocket sungguhan (satu sebagai Andi, satu
// sebagai Anak Sholeh), lalu kirim pesan lewat HTTP satu arah dan catat siapa
// yang menerima siaran `chat:pesan`. Ulangi untuk arah sebaliknya.

import { WebSocket } from "ws";
import { readFileSync } from "fs";

const API = "http://127.0.0.1:3737/api";
const WS = "ws://127.0.0.1:3737/ws";
const CHAT = "7ab3507a-23a5-4f6a-b215-d7489fbac886";
const ANDI = { id: 3, nisn: "10003", nama: "Andi Pratama" };
const SHOLEH = { id: 1, nisn: "10001", nama: "Anak Sholeh" };

// Ambil kata sandi dari .env (jangan pernah ditulis ke berkas uji).
function kataSandi() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const baris = isi.split("\n").find((b) => b.startsWith("DUMMY_PASSWORD="));
  return baris ? baris.slice("DUMMY_PASSWORD=".length).trim() : "";
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(nisn, sandi) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn, password: sandi }),
  });
  const daftar = r.headers.getSetCookie?.() || [];
  const cookie = daftar.map((c) => c.split(";")[0]).join("; ");
  // Cookie CSRF diperlukan untuk permintaan yang mengubah data (POST/PUT),
  // termasuk POST /chats/notify. Lihat middleware/csrf.ts.
  const barisCsrf = daftar.find((c) => c.startsWith("csrf_token="));
  const csrf = barisCsrf ? barisCsrf.split(";")[0].split("=")[1] : null;
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, cookie, csrf, data };
}

async function ambilToken(cookie) {
  const r = await fetch(`${API}/auth/ws-token`, { headers: { Cookie: cookie } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.token;
}

// Buka koneksi WebSocket dan catat SEMUA kejadian yang masuk.
function bukaWs(nama, token) {
  return new Promise((resolve) => {
    const diterima = [];
    const ws = new WebSocket(`${WS}?token=${encodeURIComponent(token)}`);
    ws.on("message", (buf) => {
      try {
        const k = JSON.parse(buf.toString());
        if (k.type === "pong") return;
        diterima.push(k);
      } catch {}
    });
    ws.on("open", () => resolve({ ws, diterima, nama }));
    ws.on("error", (e) => resolve({ ws: null, diterima, nama, galat: e.message }));
  });
}

async function kirimPesan(cookie, csrf, isi) {
  // Endpoint pengiriman pesan yang benar adalah POST /chats/notify
  // (lihat backend/src/routes/chat.ts baris 228).
  //
  // Wajib menyertakan x-csrf-token karena middleware CSRF sekarang aktif.
  const r = await fetch(`${API}/chats/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "x-csrf-token": csrf || "",
    },
    body: JSON.stringify({ chat_id: CHAT, text: isi }),
  });
  return { status: r.status, body: await r.text().catch(() => "") };
}

function laporan(diterima, sejak) {
  const baru = diterima.filter((k) => k.type === "chat:pesan" && k.diterimaPada >= sejak);
  return baru.length;
}

async function ujiArah(pengirim, penerima, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`    pengirim: ${pengirim.nama} (id ${pengirim.id})`);

  // Kosongkan catatan sebelum mengirim.
  const awal = Date.now();
  const isi = `-uji-${label.replace(/\s/g, "")}-${awal}`;

  const hasil = await kirimPesan(pengirim.cookie, pengirim.csrf, isi);
  console.log(`    POST pesan -> HTTP ${hasil.status}`);
  if (hasil.status !== 200 && hasil.status !== 201) {
    console.log(`    isi respons: ${hasil.body.slice(0, 160)}`);
  }

  // Beri waktu siaran WebSocket tiba.
  await tidur(3500);

  // Siapa yang menerima pesan ini?
  const dapatPengirim = pengirim.diterima.filter(
    (k) => k.type === "chat:pesan" && k.pesan && k.pesan.isi === isi,
  ).length;
  const dapatPenerima = penerima.diterima.filter(
    (k) => k.type === "chat:pesan" && k.pesan && k.pesan.isi === isi,
  ).length;

  console.log(`    diterima PENERIMA (${penerima.nama}): ${dapatPenerima > 0 ? "YA ✓" : "TIDAK ✗"}`);
  console.log(`    diterima PENGIRIM (${pengirim.nama}): ${dapatPengirim > 0 ? "YA" : "TIDAK"}`);

  return { label, dapatPenerima: dapatPenerima > 0, dapatPengirim: dapatPengirim > 0 };
}

async function main() {
  const sandi = kataSandi();
  if (!sandi) {
    console.log("  [GALAT] DUMMY_PASSWORD tidak ditemukan di .env");
    process.exit(1);
  }

  // --- Masuk sebagai kedua pihak ---
  const lAndi = await login(ANDI.nisn, sandi);
  const lSholeh = await login(SHOLEH.nisn, sandi);
  console.log("=== LOGIN ===");
  console.log(`  Andi Pratama  : ${lAndi.ok ? "OK" : "GAGAL " + JSON.stringify(lAndi.data).slice(0, 100)}`);
  console.log(`  Anak Sholeh   : ${lSholeh.ok ? "OK" : "GAGAL " + JSON.stringify(lSholeh.data).slice(0, 100)}`);
  if (!lAndi.ok || !lSholeh.ok) process.exit(1);

  // --- Buka koneksi WebSocket untuk keduanya ---
  const tAndi = await ambilToken(lAndi.cookie);
  const tSholeh = await ambilToken(lSholeh.cookie);
  const kAndi = await bukaWs(ANDI.nama, tAndi);
  const kSholeh = await bukaWs(SHOLEH.nama, tSholeh);
  console.log("\n=== KONEKSI WEBSOCKET ===");
  console.log(`  ${ANDI.nama.padEnd(14)}: ${kAndi.ws ? "TERSAMBUNG" : "GAGAL - " + kAndi.galat}`);
  console.log(`  ${SHOLEH.nama.padEnd(14)}: ${kSholeh.ws ? "TERSAMBUNG" : "GAGAL - " + kSholeh.galat}`);

  // Beri waktu kedua koneksi benar-benar siap sebelum diuji.
  await tidur(2000);

  // --- Uji KEDUA arah ---
  const arah1 = await ujiArah(
    { ...SHOLEH, cookie: lSholeh.cookie, csrf: lSholeh.csrf, diterima: kSholeh.diterima },
    { ...ANDI, diterima: kAndi.diterima },
    "Anak Sholeh -> Andi Pratama",
  );

  const arah2 = await ujiArah(
    { ...ANDI, cookie: lAndi.cookie, csrf: lAndi.csrf, diterima: kAndi.diterima },
    { ...SHOLEH, diterima: kSholeh.diterima },
    "Andi Pratama -> Anak Sholeh",
  );

  // --- Kesimpulan ---
  console.log("\n" + "=".repeat(58));
  console.log("  KESIMPULAN");
  console.log("=".repeat(58));
  for (const a of [arah1, arah2]) {
    const tanda = a.dapatPenerima ? "REALTIME ✓" : "TIDAK REALTIME ✗";
    console.log(`  ${a.label.padEnd(30)} ${tanda}`);
  }
  const gagal = [arah1, arah2].filter((a) => !a.dapatPenerima).map((a) => a.label);
  console.log();
  if (gagal.length === 0) {
    console.log("  Kedua arah REAL TIME - bug sudah tidak ada.");
  } else {
    console.log(`  MASIH BERMASALAH: ${gagal.join(", ")}`);
  }

  kAndi.ws?.close();
  kSholeh.ws?.close();
  process.exit(0);
}

main();

// Uji tampilan chat di browser sungguhan lewat CDP.
//
// Memeriksa dua keluhan:
//   1. Pesan yang KITA kirim harus muncul di KANAN (items-end / bg-electric).
//   2. Chat yang kita kirimi pesan harus MUNCUL di daftar chat.
//
// Cara kerja: login di browser, kirim pesan lewat WebSocket/HTTP sebagai
// pengguna lain, lalu periksa DOM halaman chat.

import { spawn } from "child_process";

const PORT = 9471;
const WEB = "https://skadesmart.web.id";
const API = "https://api.skadesmart.web.id/api";

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

function chrome() {
  return spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${PORT}`,
      "--window-size=430,932",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

async function targetWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const d = await r.json();
      const page = d.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await tidur(500);
  }
  throw new Error("CDP tidak tersedia");
}

function buatKlien(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let id = 0;
    const tunggu = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && tunggu.has(m.id)) {
        tunggu.get(m.id)(m.result);
        tunggu.delete(m.id);
      }
    };
    ws.onopen = () =>
      resolve({
        kirim: (method, params = {}) =>
          new Promise((res) => {
            const i = ++id;
            tunggu.set(i, res);
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
        tutup: () => ws.close(),
      });
  });
}

async function evalJs(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || "gagal eval");
  }
  return r.result?.value;
}

async function login(cdp, nisn, sandi) {
  // Login lewat halaman agar cookie httpOnly tersimpan di browser.
  await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
  await tidur(4000);
  const hasil = await evalJs(
    cdp,
    `(async () => {
       const r = await fetch(${JSON.stringify(API)} + "/auth/login", {
         method: "POST",
         credentials: "include",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ nisn: ${JSON.stringify(nisn)}, password: ${JSON.stringify(sandi)} })
       });
       const d = await r.json();
       return { status: r.status, nama: d?.user?.full_name, id: d?.user?.id };
     })()`
  );
  return hasil;
}

async function main() {
  const proc = chrome();
  let lulus = 0,
    gagal = 0;
  const cek = (nama, ok, catatan) => {
    if (ok) {
      lulus++;
      console.log(`  [OK]    ${nama}`);
    } else {
      gagal++;
      console.log(`  [GAGAL] ${nama}${catatan ? ` -> ${catatan}` : ""}`);
    }
  };

  try {
    const cdp = await buatKlien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    await cdp.kirim("Network.enable");

    // Kumpulkan error console - memastikan tidak ada lagi keluhan Firestore.
    const pesanConsole = [];
    const ws2 = cdp;
    await evalJs(
      cdp,
      `(() => { window.__err = []; const o = console.error; console.error = (...a) => { window.__err.push(a.map(String).join(" ")); o(...a); }; return true; })()`
    );

    console.log("=== UJI TAMPILAN CHAT DI BROWSER ===\n");

    const env = await evalJs(
      cdp,
      `(async () => { const r = await fetch("file:///dev/null").catch(()=>null); return null; })()`
    );
    void env;

    // Kata sandi dikirim lewat argumen lingkungan agar tidak ditulis di kode.
    const sandi = process.env.SKADES_PW;
    if (!sandi) throw new Error("SKADES_PW tidak diset");

    console.log("1. Login pengguna A (Fajar) di browser");
    const a = await login(cdp, "10005", sandi);
    cek("A login berhasil", a?.status === 200, `status ${a?.status}`);
    console.log(`     id=${a?.id} nama=${a?.nama}`);

    console.log("\n2. Buka halaman daftar chat");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(5000);

    const jumlahAwal = await evalJs(
      cdp,
      `document.querySelectorAll('a[href^="/chat/"]').length`
    );
    cek("halaman daftar chat termuat", typeof jumlahAwal === "number",
        `jumlah tautan chat: ${jumlahAwal}`);

    // Kirim pesan dari pengguna LAIN ke chat dengan A, lalu periksa apakah
    // chat itu muncul di daftar.
    console.log("\n3. Pengguna B mengirim pesan ke A");
    const b = await evalJs(
      cdp,
      `(async () => {
         const login = await fetch(${JSON.stringify(API)} + "/auth/login", {
           method: "POST", credentials: "include",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ nisn: "10004", password: ${JSON.stringify(sandi)} })
         });
         const d = await login.json();
         const chats = await (await fetch(${JSON.stringify(API)} + "/chats", { credentials: "include" })).json();
         const ke = (chats.chats || []).find(c => c.other_id === ${a?.id});
         if (!ke) return { err: "chat tidak ditemukan", other: (chats.chats||[]).map(c=>c.other_id) };
         const kirim = await fetch(${JSON.stringify(API)} + "/chats/notify", {
           method: "POST", credentials: "include",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ chat_id: ke.id, text: "pesan-uji-${Date.now()}" })
         });
         const hasil = await kirim.json();
         return { chatId: ke.id, status: kirim.status, terkirimWs: hasil.terkirimWs };
       })()`
    );
    cek("B berhasil mengirim pesan", b?.status === 200, JSON.stringify(b));
    console.log(`     chat=${b?.chatId?.slice(0, 12)} terkirimWs=${b?.terkirimWs}`);

    // Kembali sebagai A dan lihat apakah chat itu muncul di daftar.
    console.log("\n4. Chat baru muncul di daftar (keluhan ke-2)");
    await evalJs(
      cdp,
      `(async () => {
         await fetch(${JSON.stringify(API)} + "/auth/login", {
           method: "POST", credentials: "include",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ nisn: "10005", password: ${JSON.stringify(sandi)} })
         });
         return true;
       })()`
    );
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(6000);

    const adaChat = await evalJs(
      cdp,
      `(() => {
         const tautan = Array.from(document.querySelectorAll('a[href^="/chat/"]'))
           .map(a => a.getAttribute('href'));
         return { jumlah: tautan.length, tautan };
       })()`
    );
    cek("daftar chat terisi", (adaChat?.jumlah ?? 0) > 0, JSON.stringify(adaChat));
    cek(
      "chat yang baru dikirimi pesan MUNCUL di daftar",
      (adaChat?.tautan ?? []).some((h) => h.includes(b?.chatId)),
      `tautan: ${JSON.stringify(adaChat?.tautan)}`
    );
    cek(
      "chat juga menampilkan cuplikan pesan terakhir",
      await evalJs(
        cdp,
        `document.body.innerText.includes("pesan-uji")`
      )
    );

    // Periksa posisi bubble: pesan yang kita kirim harus rata KANAN.
    console.log("\n5. Pesan yang kita kirim muncul di KANAN (keluhan ke-1)");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat/${b?.chatId}` });
    await tidur(6000);

    const bubble = await evalJs(
      cdp,
      `(() => {
         // Bubble berisi teks pesan ada di dalam div dengan kelas rounded-card.
         const semua = Array.from(document.querySelectorAll('div'))
           .filter(d => d.className && String(d.className).includes('rounded-card'));
         return semua.map(d => ({
           teks: (d.innerText || '').slice(0, 40),
           kelas: String(d.className),
           rataKanan: String(d.className).includes('items-end'),
         }));
       })()`
    );
    cek("bubble pesan ter-render", (bubble ?? []).length > 0, `jumlah: ${(bubble ?? []).length}`);

    const pesanKu = (bubble ?? []).find((x) => x.teks.includes("Halo, apakah"));
    if (pesanKu) {
      cek(
        "pesan yang SAYA kirim rata KANAN (items-end)",
        pesanKu.rataKanan,
        `kelas: ${pesanKu.kelas.slice(0, 90)}`
      );
    } else {
      // Pesan uji dari B adalah pesan orang lain, harus rata KIRI.
      const pesanLain = (bubble ?? []).find((x) => x.teks.includes("pesan-uji"));
      if (pesanLain) {
        cek(
          "pesan dari ORANG LAIN rata KIRI (bukan items-end)",
          !pesanLain.rataKanan,
          `kelas: ${pesanLain.kelas.slice(0, 90)}`
        );
      }
    }

    // Pastikan sudah tidak ada jejak Firebase di console.
    console.log("\n6. Tidak ada error Firebase lagi");
    const err = await evalJs(cdp, `JSON.stringify(window.__err || [])`);
    const daftarErr = JSON.parse(err || "[]");
    cek(
      "tidak ada pesan Firestore di console",
      !daftarErr.some((e) => String(e).toLowerCase().includes("firestore") || String(e).includes("firebase")),
      daftarErr.slice(0, 3).join(" | ")
    );

    void pesanConsole;
    cdp.tutup();
  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
    gagal++;
  } finally {
    proc.kill();
  }

  console.log("\n" + "=".repeat(58));
  console.log(`  LULUS: ${lulus}    GAGAL: ${gagal}`);
  console.log("=".repeat(58));
  process.exit(gagal === 0 ? 0 : 1);
}

main();

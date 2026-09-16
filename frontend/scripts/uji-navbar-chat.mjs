// Uji aturan penyembunyian navbar.
//
// Memastikan navbar HILANG hanya di detail chat, dan tetap ADA di halaman lain
// termasuk daftar chat.

import { spawn } from "child_process";

const PORT = 9521;
const WEB = "https://skadesmart.web.id";
const API = "https://api.skadesmart.web.id/api";
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const d = await r.json();
      const p = d.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await tidur(500);
  }
  throw new Error("CDP tidak tersedia");
}

function klien(url) {
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
      });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) return { _err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

let lulus = 0, gagal = 0;
const cek = (nama, ok, catatan) => {
  if (ok) { lulus++; console.log(`  [OK]    ${nama}`); }
  else { gagal++; console.log(`  [GAGAL] ${nama}${catatan ? ` -> ${catatan}` : ""}`); }
};

// Hitung navbar: header <nav> atas dan nav fixed bottom.
const PERIKSA_NAV = `(() => {
  const header = document.querySelector('header');
  const navBawah = Array.from(document.querySelectorAll('nav'))
    .filter(n => String(n.className||'').includes('fixed bottom-0'));
  return JSON.stringify({
    adaHeader: !!header,
    adaNavBawah: navBawah.length > 0,
  });
})()`;

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank",
  ]);

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    const sandi = process.env.SKADES_PW;

    console.log("=== UJI NAVBAR: HILANG HANYA DI DETAIL CHAT ===\n");

    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(4000);
    await ev(cdp, `(async () => {
      await fetch(${JSON.stringify(API)} + "/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nisn: "10005", password: ${JSON.stringify(sandi)} })
      });
      return true;
    })()`);

    // Ambil satu id chat untuk diuji.
    const chatId = await ev(cdp, `(async () => {
      const r = await fetch(${JSON.stringify(API)} + "/chats", { credentials: "include" });
      const d = await r.json();
      return (d.chats || [])[0]?.id ?? null;
    })()`);
    cek("ada chat untuk diuji", !!chatId);
    if (!chatId) throw new Error("tidak ada chat");

    // ---------------------------------------------------- Detail chat
    console.log("\n1. DETAIL chat (/chat/<id>) - navbar harus HILANG");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat/${chatId}` });
    await tidur(7000);
    const navDetail = JSON.parse(await ev(cdp, PERIKSA_NAV));
    cek("navbar ATAS hilang", !navDetail.adaHeader, JSON.stringify(navDetail));
    cek("navbar BAWAH hilang", !navDetail.adaNavBawah, JSON.stringify(navDetail));

    // ---------------------------------------------------- Daftar chat
    console.log("\n2. DAFTAR chat (/chat) - navbar harus TETAP ADA");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(7000);
    const navDaftar = JSON.parse(await ev(cdp, PERIKSA_NAV));
    cek("navbar BAWAH tetap ada", navDaftar.adaNavBawah, JSON.stringify(navDaftar));

    // ---------------------------------------------------- Halaman lain
    console.log("\n3. Halaman lain (/home) - navbar harus TETAP ADA");
    await cdp.kirim("Page.navigate", { url: `${WEB}/home` });
    await tidur(6000);
    const navHome = JSON.parse(await ev(cdp, PERIKSA_NAV));
    cek("navbar ATAS tetap ada", navHome.adaHeader, JSON.stringify(navHome));
    cek("navbar BAWAH tetap ada", navHome.adaNavBawah, JSON.stringify(navHome));

    // ---------------------------------------------------- Layout detail
    console.log("\n4. Layout detail chat: tidak menggulir, input di bawah");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat/${chatId}` });
    await tidur(7000);
    const layout = await ev(cdp, `(() => {
      const main = document.querySelector('main');
      const areaPesan = document.querySelector('main .overflow-y-auto');
      const form = document.querySelector('main form');
      const rForm = form ? form.getBoundingClientRect() : null;
      return JSON.stringify({
        tinggiMain: main ? Math.round(main.getBoundingClientRect().height) : 0,
        tinggiLayar: window.innerHeight,
        bisaGulirHalaman: document.documentElement.scrollHeight > window.innerHeight + 2,
        areaPesanBisaGulir: areaPesan ? areaPesan.scrollHeight > areaPesan.clientHeight : null,
        bawahForm: rForm ? Math.round(window.innerHeight - rForm.bottom) : null,
      });
    })()`);
    const L = JSON.parse(layout);
    console.log(`     ${layout}`);
    cek("halaman TIDAK bisa digulir", L.bisaGulirHalaman === false,
        `scrollHeight > layar`);
    cek("main setinggi layar", Math.abs(L.tinggiMain - L.tinggiLayar) <= 2,
        `main=${L.tinggiMain} layar=${L.tinggiLayar}`);
    cek("kolom ketik menempel di bawah (jarak < 30px)", L.bawahForm != null && L.bawahForm < 30,
        `jarak dari bawah=${L.bawahForm}px`);
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

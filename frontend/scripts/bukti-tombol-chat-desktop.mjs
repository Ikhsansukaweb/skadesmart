// BUKTI: menekan tombol chat/detail di DESKTOP menghasilkan layout MOBILE.
//
// Hipotesis: tombol "Chat"/"Hubungi" di halaman produk & profil memanggil
//   router.push(`/chat/${chatId}`)
// yang membuka app/chat/[chatId]/page.tsx. Halaman itu TIDAK punya logika
// isMobile / sidebar desktop sama sekali -> selalu satu kolom (mobile).
//
// Bandingkan 2 jalur di lebar jendela DESKTOP yang sama (1440x900):
//   A. /chat          -> punya <aside> (split view desktop)
//   B. /chat/<id>     -> TIDAK punya <aside> (satu kolom / mobile)
//
// Kalau B tidak punya <aside> padahal lebar desktop, itu buktinya.

import { spawn } from "child_process";

const PORT = 9891;
const WEB = process.env.WEB || "https://skadesmart.web.id";
const API = process.env.API || "https://api.skadesmart.web.id/api";
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
      if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m.result); tunggu.delete(m.id); }
    };
    ws.onopen = () => resolve({
      kirim: (method, params = {}) => new Promise((res) => {
        const i = ++id; tunggu.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      }),
    });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) return { _err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

// Ukur bentuk layout: DESKTOP = ada <aside>, MOBILE = tidak ada.
const BENTUK = `(() => {
  const aside = document.querySelector('aside');
  const main = document.querySelector('main');
  const navBawah = Array.from(document.querySelectorAll('nav'))
    .filter(n => String(n.className||'').includes('fixed bottom-0')).length;
  const navAtas = document.querySelector('header');
  const form = document.querySelector('main form');
  const rForm = form ? form.getBoundingClientRect() : null;
  return JSON.stringify({
    url: location.pathname,
    lebarJendela: window.innerWidth,
    adaAsideSidebar: !!aside,
    adaNavAtas: !!navAtas,
    navBawah,
    kelasMain: main ? String(main.className).slice(0, 90) : null,
    lebarMain: main ? Math.round(main.getBoundingClientRect().width) : 0,
    bawahForm: rForm ? Math.round(window.innerHeight - rForm.bottom) : null,
    layout: aside ? 'DESKTOP(split)' : 'MOBILE(satu-kolom)',
  });
})()`;

let lulus = 0, gagal = 0;
const cek = (nama, ok, catatan) => {
  if (ok) { lulus++; console.log(`  [OK]    ${nama}`); }
  else { gagal++; console.log(`  [GAGAL] ${nama}${catatan ? ` -> ${catatan}` : ""}`); }
};

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--ignore-certificate-errors",
    `--remote-debugging-port=${PORT}`,
    // LEBAR DESKTOP: 1440x900 -- jelas-jelas desktop
    "--window-size=1440,900", "about:blank",
  ]);

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");

    console.log(`=== UJI JALUR TOMBOL CHAT DI DESKTOP (1440x900) ===`);
    console.log(`    ${WEB}\n`);

    // Login lewat API (dapat cookie).
    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(5000);
    const sandi = process.env.SKADES_PW;
    const okLogin = await ev(cdp, `(async () => {
      const r = await fetch(${JSON.stringify(API)} + "/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nisn: "10005", password: ${JSON.stringify(sandi)} })
      });
      return r.status;
    })()`);
    console.log(`  login HTTP: ${okLogin}\n`);

    // Ambil data yang dibutuhkan: satu produk siswa/kwu + id chat.
    // Buka /home dulu supaya cookie sesi terbaca oleh fetch same-origin.
    await cdp.kirim("Page.navigate", { url: `${WEB}/home` });
    await tidur(7000);
    const data = await ev(cdp, `(async () => {
      const r = await fetch(${JSON.stringify(API)} + "/products?limit=50", { credentials: "include" });
      const d = await r.json();
      const list = d.products || d.data || (Array.isArray(d) ? d : []);
      const p = list.find(x => x && x.id);
      const rc = await fetch(${JSON.stringify(API)} + "/chats", { credentials: "include" });
      const dc = await rc.json();
      const c = (dc.chats || [])[0];
      return JSON.stringify({
        produkId: p ? p.id : null,
        produkKategori: p ? p.category : null,
        produkNama: p ? p.name : null,
        chatId: c ? c.id : null,
      });
    })()`);
    const D = JSON.parse(data || "{}");
    console.log(`  data: ${JSON.stringify(D)}\n`);

    // ---------------------------------------------------------------- A
    console.log("A. Buka /chat LEBIH DULU (halaman punya logika isMobile)");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(9000);
    const A = JSON.parse(await ev(cdp, BENTUK) || "{}");
    console.log(`     ${JSON.stringify(A)}`);
    cek("lebar jendela memang desktop (>=1024)", A.lebarJendela >= 1024, `${A.lebarJendela}px`);
    cek("/chat di desktop -> ADA sidebar <aside>", A.adaAsideSidebar === true);

    // ---------------------------------------------------------------- B
    console.log("\nB. Buka /chat/<id> -- INILAH yang dihasilkan tombol Chat/Hubungi");
    if (!D.chatId) throw new Error("tidak ada chat id untuk diuji");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat/${D.chatId}` });
    await tidur(9000);
    const B = JSON.parse(await ev(cdp, BENTUK) || "{}");
    console.log(`     ${JSON.stringify(B)}`);
    cek("lebar jendela MASIH desktop", B.lebarJendela >= 1024, `${B.lebarJendela}px`);
    cek("TIDAK ada sidebar <aside>  <-- bug", B.adaAsideSidebar === false);
    cek("terdeteksi sebagai layout MOBILE", B.layout === "MOBILE(satu-kolom)", B.layout);
    cek("navbar ATAS ikut hilang (gaya mobile full-screen)", B.adaNavAtas === false);

    // ---------------------------------------------------------------- C
    console.log("\nC. Bukti tombol produk memang menuju /chat/<id>");
    if (D.produkId) {
      await cdp.kirim("Page.navigate", { url: `${WEB}/product/${D.produkId}` });
      await tidur(8000);
      const tombol = await ev(cdp, `(() => {
        const b = Array.from(document.querySelectorAll('button'))
          .map(x => (x.innerText||'').trim())
          .filter(t => t && /chat|hubungi|pesan|tanya/i.test(t));
        return JSON.stringify(b);
      })()`);
      console.log(`     tombol chat di halaman produk: ${tombol}`);

      // Klik tombol chat dan lihat ke URL mana berakhir.
      const diklik = await ev(cdp, `(() => {
        const b = Array.from(document.querySelectorAll('button'))
          .find(x => /chat|hubungi|pesan|tanya/i.test((x.innerText||'').trim()));
        if (!b) return 'tidak ditemukan';
        b.click();
        return 'diklik: ' + b.innerText.trim().slice(0,40);
      })()`);
      console.log(`     ${diklik}`);
      await tidur(9000);
      const C = JSON.parse(await ev(cdp, BENTUK) || "{}");
      console.log(`     ${JSON.stringify(C)}`);
      cek("setelah klik tombol chat -> URL /chat/<id>", /^\/chat\/[^/]+$/.test(C.url || ""), C.url);
      cek("dan hasilnya layout MOBILE di desktop  <-- BUG UTAMA", C.adaAsideSidebar === false, C.layout);
    }

  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
    gagal++;
  } finally {
    proc.kill();
  }

  console.log("\n" + "=".repeat(62));
  console.log(`  LULUS: ${lulus}    GAGAL: ${gagal}`);
  console.log("=".repeat(62));
  process.exit(gagal === 0 ? 0 : 1);
}

main();

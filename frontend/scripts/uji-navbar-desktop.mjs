// Uji navbar di /chat pada DUA ukuran layar: desktop & mobile.
//
// Aturan yang benar:
//   DESKTOP (split view) : navbar SELALU ada
//   MOBILE (buka chat)   : navbar HILANG
//   MOBILE (daftar chat) : navbar ADA

import { spawn } from "child_process";

const WEB = "https://skadesmart.web.id";
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function ambilTarget(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const d = await r.json();
      const p = d.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
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
      if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m.result); tunggu.delete(m.id); }
    };
    ws.onopen = () => resolve({
      kirim(method, params = {}) {
        return new Promise((res) => {
          const i = ++id; tunggu.set(i, res);
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      },
    });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise: true,
  });
  if (r && r.exceptionDetails) return undefined;
  return r ? r.result?.value : undefined;
}

const PERIKSA = `(() => {
  const header = document.querySelector('header');
  const navBawah = Array.from(document.querySelectorAll('nav'))
    .filter(n => String(n.className||'').includes('fixed bottom-0'));
  return JSON.stringify({
    adaNavbarAtas: !!header,
    adaNavbarBawah: navBawah.length > 0,
    lebarLayar: window.innerWidth,
    jumlahPercakapan: document.querySelectorAll('main button').length,
  });
})()`;

async function uji(kunci, port, lebar, tinggi) {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--ignore-certificate-errors",
    `--remote-debugging-port=${port}`, `--window-size=${lebar},${tinggi}`, "about:blank",
  ]);

  try {
    const cdp = await buatKlien(await ambilTarget(port));
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");

    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(9000);
    const sandi = process.env.SKADES_PW;
    await ev(cdp, `(() => {
      const i = Array.from(document.querySelectorAll('input'));
      const n = i.find(x => x.type !== 'password'), q = i.find(x => x.type === 'password');
      if (!n || !q) return 0;
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(n, '10001'); n.dispatchEvent(new Event('input', { bubbles: true }));
      s.call(q, ${JSON.stringify(sandi)}); q.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('button[type=submit]').click(); return 1;
    })()`);
    await tidur(13000);

    console.log(`\n=== ${kunci} (${lebar}x${tinggi}) ===`);

    // 1) Halaman daftar chat.
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(15000);
    const daftar = JSON.parse(await ev(cdp, PERIKSA) || "{}");
    console.log(`  daftar chat  : navbarAtas=${daftar.adaNavbarAtas} navbarBawah=${daftar.adaNavbarBawah}`);

    // 2) Buka satu percakapan (di mobile ini mengubah tampilan).
    await ev(cdp, `(() => {
      const k = Array.from(document.querySelectorAll('main button'))
        .filter(b => b.getBoundingClientRect().height > 50 && b.innerText.trim().length > 0);
      if (k.length) k[0].click();
      return 1;
    })()`);
    await tidur(14000);
    const detail = JSON.parse(await ev(cdp, PERIKSA) || "{}");
    console.log(`  buka 1 chat  : navbarAtas=${detail.adaNavbarAtas} navbarBawah=${detail.adaNavbarBawah}`);

    return { kunci, daftar, detail };
  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
    return null;
  } finally {
    proc.kill();
  }
}

async function main() {
  const hasil = [];
  hasil.push(await uji("DESKTOP", 9901, 1440, 900));
  hasil.push(await uji("MOBILE", 9902, 430, 932));

  console.log("\n" + "=".repeat(62));
  console.log("  PENILAIAN");
  console.log("=".repeat(62));
  let lulus = 0, gagal = 0;
  const cek = (nama, ok) => {
    if (ok) { lulus++; console.log(`  [OK]    ${nama}`); }
    else { gagal++; console.log(`  [GAGAL] ${nama}`); }
  };

  const d = hasil.find((h) => h && h.kunci === "DESKTOP");
  const m = hasil.find((h) => h && h.kunci === "MOBILE");

  if (d) {
    cek("DESKTOP daftar  : navbar ADA", d.daftar.adaNavbarAtas === true);
    cek("DESKTOP buka chat: navbar TETAP ADA", d.detail.adaNavbarAtas === true);
  }
  if (m) {
    cek("MOBILE daftar   : navbar ADA", m.daftar.adaNavbarBawah === true);
    cek("MOBILE buka chat: navbar HILANG", m.detail.adaNavbarBawah === false);
    cek("MOBILE buka chat: navbar atas HILANG", m.detail.adaNavbarAtas === false);
  }

  console.log("=".repeat(62));
  console.log(`  LULUS: ${lulus}   GAGAL: ${gagal}`);
  console.log("=".repeat(62));
}

main();

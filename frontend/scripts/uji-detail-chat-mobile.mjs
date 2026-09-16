// Uji DETAIL CHAT versi MOBILE di produksi lewat /chat (bukan /chat/<id>).
//
// Inilah jalur yang dipakai di ponsel: /chat menampilkan detail secara inline.

import { spawn } from "child_process";

const PORT = 9671;
const WEB = "https://skadesmart.web.id";
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
  if (r.exceptionDetails) return null;
  return r.result?.value;
}

const PERIKSA = `(() => {
  const header = document.querySelector('header');
  const navBawah = Array.from(document.querySelectorAll('nav'))
    .filter(n => String(n.className||'').includes('fixed bottom-0'));
  const main = document.querySelector('main');
  const form = document.querySelector('main form');
  const rForm = form ? form.getBoundingClientRect() : null;
  const areaPesan = document.querySelector('main .overflow-y-auto');
  return JSON.stringify({
    adaHeader: !!header,
    adaNavBawah: navBawah.length > 0,
    kelasMain: main ? String(main.className) : null,
    tinggiMain: main ? Math.round(main.getBoundingClientRect().height) : 0,
    tinggiLayar: window.innerHeight,
    bisaGulirHalaman: document.documentElement.scrollHeight > window.innerHeight + 2,
    bawahForm: rForm ? Math.round(window.innerHeight - rForm.bottom) : null,
    adaAreaPesan: !!areaPesan,
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
    `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank",
  ]);

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");

    // Login.
    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(9000);
    const sandi = process.env.SKADES_PW;
    await ev(cdp, `(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const nisn = inputs.find(i => i.type !== 'password');
      const pw = inputs.find(i => i.type === 'password');
      if (!nisn || !pw) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nisn, '10005'); nisn.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pw, ${JSON.stringify(sandi)}); pw.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('button[type=submit]').click();
      return true;
    })()`);
    await tidur(13000);

    console.log("=== DETAIL CHAT MOBILE lewat /chat ===\n");

    // Buka /chat (daftar) - navbar HARUS ada di sini.
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(10000);
    const daftar = JSON.parse(await ev(cdp, PERIKSA));
    console.log(`  (daftar) ${JSON.stringify(daftar)}\n`);
    cek("di DAFTAR chat navbar tetap ada", daftar.adaNavBawah);

    // Klik percakapan pertama untuk membuka detail inline.
    const dibuka = await ev(cdp, `(() => {
      const el = document.querySelector('main button, main a[href^="/chat/"]');
      // Cari item daftar percakapan: biasanya tombol yang memuat nama orang.
      const kandidat = Array.from(document.querySelectorAll('main button'))
        .filter(b => b.getBoundingClientRect().height > 50 && b.innerText.trim().length > 0);
      if (kandidat.length === 0) return 'tidak ada item percakapan';
      kandidat[0].click();
      return 'diklik: ' + kandidat[0].innerText.replace(/\\n/g, ' ').slice(0, 40);
    })()`);
    console.log(`  buka percakapan: ${dibuka}`);
    await tidur(11000);

    const detail = JSON.parse(await ev(cdp, PERIKSA));
    console.log(`\n  (detail) ${JSON.stringify(detail)}\n`);
    console.log("  Setelah percakapan dibuka:");

    cek("navbar ATAS hilang", !detail.adaHeader);
    cek("navbar BAWAH hilang", !detail.adaNavBawah);
    cek("pakai h-[100dvh]", (detail.kelasMain || "").includes("100dvh"), detail.kelasMain);
    cek("halaman tidak bisa digulir", detail.bisaGulirHalaman === false);
    cek("kolom ketik menempel di bawah (<30px)", detail.bawahForm != null && detail.bawahForm < 30, `${detail.bawahForm}px`);
    cek("main setinggi layar", Math.abs(detail.tinggiMain - detail.tinggiLayar) <= 2, `${detail.tinggiMain} vs ${detail.tinggiLayar}`);

  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
    gagal++;
  } finally {
    proc.kill();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  LULUS: ${lulus}    GAGAL: ${gagal}`);
  console.log("=".repeat(60));
  process.exit(gagal === 0 ? 0 : 1);
}

main();

// Verifikasi menyeluruh setelah perbaikan login:
//   1. login berhasil dari browser
//   2. tidak ada unhandledRejection / error konsol
//   3. halaman-halaman utama bisa dibuka setelah login

import { spawn } from "child_process";

const PORT = 9621;
const WEB = "http://127.0.0.1:3000";
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const HALAMAN = [
  "/home", "/marketplace", "/cart", "/chat", "/account",
  "/product/mine", "/product/add", "/account", "/login",
];

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
    const peristiwa = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m.result); tunggu.delete(m.id); }
      else if (m.method) peristiwa.push(m);
    };
    ws.onopen = () => resolve({
      peristiwa,
      bersihkan: () => { peristiwa.length = 0; },
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

let lulus = 0, gagal = 0;
const cek = (nama, ok, catatan) => {
  if (ok) { lulus++; console.log(`  [OK]    ${nama}`); }
  else { gagal++; console.log(`  [GAGAL] ${nama}${catatan ? ` -> ${catatan}` : ""}`); }
};

// Pesan konsol yang menandakan masalah nyata (bukan noise dev seperti HMR/font).
const RELEVAN = /unhandled|not a function|undefined is not|cannot read|hydrat|Minified React|Application error|Tidak terautentikasi/i;

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank",
  ]);

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    await cdp.kirim("Log.enable");
    await cdp.kirim("Network.enable");

    console.log("=== VERIFIKASI SETELAH PERBAIKAN LOGIN ===\n");

    // ------------------------------------------------------------ login
    console.log("1. Login dari browser");
    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(10000);

    const sandi = process.env.SKADES_PW;
    await ev(cdp, `(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const nisn = inputs.find(i => i.type !== 'password');
      const pw = inputs.find(i => i.type === 'password');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nisn, '10005'); nisn.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pw, ${JSON.stringify(sandi)}); pw.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('button[type=submit]').click();
      return true;
    })()`);
    await tidur(13000);

    const url = await ev(cdp, "location.pathname");
    cek("login berhasil, masuk ke /home", url === "/home", `halaman: ${url}`);

    // ------------------------------------------- error saat login
    const errLogin = cdp.peristiwa
      .filter((m) => m.method === "Runtime.exceptionThrown")
      .map((m) => m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
      .filter((t) => RELEVAN.test(String(t)));
    cek("tidak ada exception saat login", errLogin.length === 0,
        errLogin.slice(0, 2).join(" | ").slice(0, 180));

    const logLogin = cdp.peristiwa
      .filter((m) => m.method === "Log.entryAdded" && m.params.entry.level === "error")
      .map((m) => m.params.entry.text)
      .filter((t) => RELEVAN.test(String(t)));
    cek("tidak ada error konsol saat login", logLogin.length === 0,
        logLogin.slice(0, 2).join(" | ").slice(0, 180));

    // ------------------------------------------- buka semua halaman
    console.log("\n2. Buka semua halaman setelah login");
    for (const h of HALAMAN) {
      cdp.bersihkan();
      await cdp.kirim("Page.navigate", { url: `${WEB}${h}` });
      await tidur(6500);

      const info = await ev(cdp, `JSON.stringify({
        hal: location.pathname,
        panjang: (document.body ? document.body.innerText : '').trim().length,
        teks: (document.body ? document.body.innerText : '').replace(/\\n/g, ' ').slice(0, 70),
      })`);

      const I = JSON.parse(info);
      const errHalaman = cdp.peristiwa
        .filter((m) => m.method === "Runtime.exceptionThrown")
        .map((m) => m.params.exceptionDetails.exception?.description || "")
        .filter((t) => RELEVAN.test(String(t)));

      // Halaman dianggap sehat kalau punya isi DAN tidak ada exception.
      const sehat = I.panjang > 40 && errHalaman.length === 0;

      if (sehat) {
        lulus++;
        console.log(`  [OK]    ${h.padEnd(18)} isi ${String(I.panjang).padStart(4)} char`);
      } else {
        gagal++;
        const sebab = errHalaman.length > 0
          ? `exception: ${String(errHalaman[0]).slice(0, 110)}`
          : `isi hanya ${I.panjang} char: "${I.teks}"`;
        console.log(`  [GAGAL] ${h.padEnd(18)} ${sebab}`);
      }
    }

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

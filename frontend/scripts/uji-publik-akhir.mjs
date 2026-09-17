#!/usr/bin/env node
// Uji akhir lewat HTTPS publik — jalur yang dipakai pengguna sebenarnya.
//
// Diuji lewat HTTP lokal TIDAK sah untuk halaman yang butuh login, karena
// cookie SameSite=None;Secure tidak dikirim lewat HTTP.

import { spawn } from "child_process";

const PORT = 9651;
const WEB = "https://skadesmart.web.id";
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const HALAMAN = [
  "/home", "/marketplace", "/cart", "/chat", "/account",
  "/product/mine", "/product/add", "/account",
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

const RELEVAN = /unhandled|not a function|cannot read|Minified React|Application error|Tidak terautentikasi/i;

let lulus = 0, gagal = 0;

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

    console.log("=== UJI AKHIR LEWAT HTTPS PUBLIK ===\n");

    // ------------------------------------------------------------ login
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

    const hal = await ev(cdp, "location.pathname");
    const okLogin = hal === "/home";
    if (okLogin) lulus++; else gagal++;
    console.log(`  ${okLogin ? "[OK]   " : "[GAGAL]"} login -> ${hal}\n`);

    // -------------------------------------------------- semua halaman
    console.log("  Halaman (login dulu, lalu buka tiap halaman):");
    for (const h of HALAMAN) {
      cdp.bersihkan();
      await cdp.kirim("Page.navigate", { url: `${WEB}${h}` });
      await tidur(7000);

      const info = await ev(cdp, `(document.body ? document.body.innerText : '').trim()`);
      const panjang = (info || "").length;

      // Permintaan API yang gagal (401/403/500) di halaman ini.
      const apiGagal = cdp.peristiwa
        .filter((m) => m.method === "Network.responseReceived"
          && m.params.response.url.includes("/api/")
          && m.params.response.status >= 400)
        .map((m) => `${m.params.response.status} ${m.params.response.url.split("/api/")[1]?.split("?")[0]}`);

      const errKeras = cdp.peristiwa
        .filter((m) => m.method === "Runtime.exceptionThrown")
        .map((m) => m.params.exceptionDetails.exception?.description || "")
        .filter((t) => RELEVAN.test(String(t)));

      const sehat = panjang > 40 && errKeras.length === 0;
      if (sehat) lulus++; else gagal++;

      const catatan = [];
      if (errKeras.length) catatan.push(`exception: ${String(errKeras[0]).slice(0, 80)}`);
      if (panjang <= 40) catatan.push(`isi cuma ${panjang} char`);
      if (apiGagal.length) catatan.push(`API gagal: ${apiGagal.slice(0, 3).join(", ")}`);

      console.log(`    ${sehat ? "[OK]   " : "[GAGAL]"} ${h.padEnd(17)} ${String(panjang).padStart(5)} char${catatan.length ? "  <- " + catatan.join("; ") : ""}`);
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

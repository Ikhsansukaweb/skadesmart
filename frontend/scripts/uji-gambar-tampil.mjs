// Uji dari sisi PENGGUNA: kirim foto lewat antarmuka dan pastikan gambar
// benar-benar TAMPIL (bukan kotak putih).
//
// Cara memeriksa tanpa melihat gambar: hitung elemen <img> yang benar-benar
// berhasil dimuat (naturalWidth > 0). Gambar yang gagal punya naturalWidth 0.

import { spawn } from "child_process";

const PORT = 9681;
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
  if (r.exceptionDetails) return { _err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

// Hitung gambar yang benar-benar termuat.
const PERIKSA_GAMBAR = `(() => {
  const imgs = Array.from(document.querySelectorAll('img'));
  const detail = imgs.map(i => ({
    src: (i.currentSrc || i.src || '').slice(0, 70),
    lebarNyata: i.naturalWidth,
    tinggiNyata: i.naturalHeight,
    tampil: i.getBoundingClientRect().width > 0,
  }));
  const dimuat = detail.filter(d => d.lebarNyata > 0);
  const gagal = detail.filter(d => d.tampil && d.lebarNyata === 0);
  return JSON.stringify({
    total: detail.length,
    dimuat: dimuat.length,
    gagal: gagal.length,
    contohDimuat: dimuat.slice(0, 3),
    contohGagal: gagal.slice(0, 3),
  });
})()`;

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
    console.log(`  login: ${await ev(cdp, "location.pathname")}`);

    // ------------------------------------------------ halaman AKUN (banner)
    console.log("\n=== HALAMAN AKUN: apakah banner & foto profil TAMPIL? ===");
    await cdp.kirim("Page.navigate", { url: `${WEB}/account` });
    await tidur(12000);
    const akun = JSON.parse(await ev(cdp, PERIKSA_GAMBAR));
    console.log(`  ${JSON.stringify(akun, null, 0).slice(0, 400)}`);

    // ------------------------------------------------ detail chat (foto kirim)
    console.log("\n=== DETAIL CHAT: apakah foto pesan TAMPIL? ===");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(11000);

    // Buka percakapan yang punya foto.
    await ev(cdp, `(() => {
      const kandidat = Array.from(document.querySelectorAll('main button'))
        .filter(b => b.getBoundingClientRect().height > 50 && b.innerText.trim().length > 0);
      if (kandidat.length) kandidat[0].click();
      return true;
    })()`);
    await tidur(13000);

    const chat = JSON.parse(await ev(cdp, PERIKSA_GAMBAR));
    console.log(`  ${JSON.stringify(chat, null, 0).slice(0, 400)}`);

    console.log("\n" + "=".repeat(60));
    console.log("  RINGKASAN");
    console.log("=".repeat(60));
    console.log(`  halaman akun : ${akun.dimuat} gambar tampil, ${akun.gagal} gagal`);
    console.log(`  detail chat  : ${chat.dimuat} gambar tampil, ${chat.gagal} gagal`);
    if (chat.gagal > 0) {
      console.log("\n  Gambar yang GAGAL dimuat:");
      chat.contohGagal.forEach((g) => console.log(`    ${g.src}`));
    }

  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
  } finally {
    proc.kill();
  }
}

main();

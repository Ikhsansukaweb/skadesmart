// Uji navbar /chat - versi yang MEMBEDAKAN navbar utama dari header identitas chat.
//
// Penting: di dalam ChatDetailView ada <header> yang berisi nama lawan bicara
// dan tombol kembali. Itu BUKAN navbar dan HARUS tetap ada. Yang harus hilang
// di mobile hanya navbar utama (yang berisi logo SkadesMart + menu tab).

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

// Navbar utama dikenali dari isinya: mengandung nama merek "SkadesMart"
// atau tautan ke menu tab utama (Beranda/Marketplace/Akun).
const PERIKSA = `(() => {
  const navUtama = Array.from(document.querySelectorAll('header')).filter(h => {
    const t = h.innerText || '';
    return t.includes('Beranda') || t.includes('Marketplace') && t.includes('Akun') || t.includes('SkadesMart');
  });
  const navBawah = Array.from(document.querySelectorAll('nav'))
    .filter(n => String(n.className||'').includes('fixed bottom-0'));
  // Header identitas lawan bicara: punya tombol Kembali.
  const headerChat = Array.from(document.querySelectorAll('header')).filter(h => {
    const t = h.innerText || '';
    return t.includes('Kembali') || (h.querySelector('button[aria-label]') && !t.includes('Beranda'));
  });
  return JSON.stringify({
    navUtama: navUtama.length,
    navBawah: navBawah.length,
    headerChat: headerChat.length,
    lebar: window.innerWidth,
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

    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(15000);
    const daftar = JSON.parse(await ev(cdp, PERIKSA) || "{}");

    await ev(cdp, `(() => {
      const k = Array.from(document.querySelectorAll('main button'))
        .filter(b => b.getBoundingClientRect().height > 50 && b.innerText.trim().length > 0);
      if (k.length) k[0].click();
      return 1;
    })()`);
    await tidur(14000);
    const detail = JSON.parse(await ev(cdp, PERIKSA) || "{}");

    console.log(`\n=== ${kunci} (${lebar}x${tinggi}) ===`);
    console.log(`  daftar chat : navUtama=${daftar.navUtama} navBawah=${daftar.navBawah}`);
    console.log(`  buka 1 chat : navUtama=${detail.navUtama} navBawah=${detail.navBawah} headerChat=${detail.headerChat}`);
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
  hasil.push(await uji("DESKTOP", 9911, 1440, 900));
  hasil.push(await uji("MOBILE", 9912, 430, 932));

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
    cek("DESKTOP daftar  : navbar utama ADA", d.daftar.navUtama > 0);
    cek("DESKTOP buka chat: navbar utama TETAP ADA", d.detail.navUtama > 0);
  }
  if (m) {
    cek("MOBILE daftar   : navbar bawah ADA", m.daftar.navBawah > 0);
    cek("MOBILE buka chat: navbar utama HILANG", m.detail.navUtama === 0);
    cek("MOBILE buka chat: navbar bawah HILANG", m.detail.navBawah === 0);
  }

  console.log("=".repeat(62));
  console.log(`  LULUS: ${lulus}   GAGAL: ${gagal}`);
  console.log("=".repeat(62));
}

main();

// Uji HALAMAN /chat di banyak ukuran layar.
//
// Keluhan: "pas pertama kali chat ke CS / tombol pesan di menu, UI-nya malah
// masuk ke layout mobile padahal pakai desktop".
//
// Jadi: jendela desktop LEBAR harus memakai layout desktop (sidebar kiri +
// panel kanan). Yang membedakan jelas: layout mobile hanya punya SATU panel
// dan navbar di BAWAH; layout desktop punya <aside> di samping.

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
  const aside = document.querySelector('aside');
  const navBawah = Array.from(document.querySelectorAll('nav'))
    .filter(n => String(n.className||'').includes('fixed bottom-0'));
  const navAtas = Array.from(document.querySelectorAll('header'))
    .filter(h => (h.innerText||'').includes('Beranda'));
  return JSON.stringify({
    lebarJendela: window.innerWidth,
    adaSidebar: !!aside,
    navBawah: navBawah.length,
    navAtas: navAtas.length,
    // Penanda visual layout desktop: ada kolom daftar chat di samping.
    layout: aside ? 'DESKTOP' : 'MOBILE',
  });
})()`;

const UKURAN = [
  { nama: "Desktop lebar  ", lebar: 1920, tinggi: 1080, harus: "DESKTOP" },
  { nama: "Laptop         ", lebar: 1440, tinggi: 900,  harus: "DESKTOP" },
  { nama: "Laptop kecil   ", lebar: 1280, tinggi: 800,  harus: "DESKTOP" },
  { nama: "Jendela sedang ", lebar: 1100, tinggi: 800,  harus: "DESKTOP" },
  { nama: "Ambang batas   ", lebar: 1024, tinggi: 800,  harus: "DESKTOP" },
  { nama: "Tablet/HP      ", lebar: 900,  tinggi: 800,  harus: "MOBILE"  },
  { nama: "HP             ", lebar: 430,  tinggi: 932,  harus: "MOBILE"  },
];

async function main() {
  const hasil = [];
  let port = 9950;

  for (const u of UKURAN) {
    port++;
    const proc = spawn("google-chrome", [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--ignore-certificate-errors",
      `--remote-debugging-port=${port}`, `--window-size=${u.lebar},${u.tinggi}`, "about:blank",
    ]);

    try {
      const cdp = await buatKlien(await ambilTarget(port));
      await cdp.kirim("Runtime.enable");
      await cdp.kirim("Page.enable");

      await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
      await tidur(8000);
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
      await tidur(12000);

      // Masuk lewat MENU "Chat" (seperti klik pengguna), bukan buka URL langsung.
      await cdp.kirim("Page.navigate", { url: `${WEB}/home` });
      await tidur(11000);
      await ev(cdp, `(() => {
        const a = Array.from(document.querySelectorAll('a')).find(x => (x.getAttribute('href')||'') === '/chat');
        if (a) { a.click(); return 1; }
        return 0;
      })()`);
      await tidur(14000);

      const d = JSON.parse(await ev(cdp, PERIKSA) || "{}");
      const benar = d.layout === u.harus;
      hasil.push({ ...u, nyata: d.layout, benar });

      console.log(`  ${u.nama} ${String(u.lebar).padStart(4)}px -> ${String(d.layout).padEnd(7)} (harus ${u.harus})  ${benar ? "OK" : "SALAH"}`);
    } catch (e) {
      console.log(`  ${u.nama} -> [GALAT] ${e.message}`);
      hasil.push({ ...u, nyata: "GALAT", benar: false });
    } finally {
      proc.kill();
    }
  }

  const benar = hasil.filter((h) => h.benar).length;
  console.log(`\n  BENAR: ${benar}/${hasil.length}`);
  const salah = hasil.filter((h) => !h.benar);
  if (salah.length) {
    console.log("  Yang salah:");
    for (const s of salah) console.log(`    ${s.lebar}px -> ${s.nyata} (harus ${s.harus})`);
  }
}

main();

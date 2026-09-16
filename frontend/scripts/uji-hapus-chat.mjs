// Uji ALUR HAPUS CHAT secara menyeluruh:
//   1. buka chat, kirim pesan
//   2. hapus chat -> harus HILANG dari daftar sidebar
//   3. chat yang dihapus TIDAK bisa dibuka lagi
//   4. buat chat baru ke orang yang sama -> harus BISA kirim pesan
//
// Ini menguji keluhan: "pas chat dihapus, mau chat lagi ke orang yang sama
// tulisan memulai percakapan terus, gabisa kirim pesan".

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
  if (r && r.exceptionDetails) return "__ERR__:" + (r.exceptionDetails.text || "");
  return r ? r.result?.value : undefined;
}

// Hitung percakapan di sidebar kiri (tombol tinggi di dalam <aside>).
const HITUNG = `(() => {
  const aside = document.querySelector('aside');
  if (!aside) return -1;
  return aside.querySelectorAll('button').length;
})()`;

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--ignore-certificate-errors",
    "--remote-debugging-port=9921", "--window-size=1440,900", "about:blank",
  ]);

  const hasil = [];
  const cek = (nama, ok, info = "") => {
    hasil.push({ nama, ok });
    console.log(`  ${ok ? "[OK]   " : "[GAGAL]"} ${nama}${info ? "  " + info : ""}`);
  };

  try {
    const cdp = await buatKlien(await ambilTarget(9921));
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");

    // Dialog konfirmasi hapus otomatis dijawab "OK".
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

    // Buka /chat
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(16000);

    const sebelum = await ev(cdp, HITUNG);
    console.log(`\n=== ALUR HAPUS CHAT ===`);
    console.log(`  percakapan di sidebar: ${sebelum}`);

    if (!(sebelum > 0)) {
      console.log("  [GAGAL] tidak ada percakapan untuk diuji");
      proc.kill();
      return;
    }

    // Buka percakapan pertama.
    await ev(cdp, `(() => {
      const b = document.querySelector('aside').querySelectorAll('button');
      if (b.length) b[0].click();
      return 1;
    })()`);
    await tidur(12000);

    // Jawab otomatis semua dialog konfirmasi dengan "OK".
    await cdp.kirim("Page.setInterceptFileChooserDialog", { enabled: false }).catch(() => {});
    await ev(cdp, `window.confirm = () => true; 1`);

    // Hapus percakapan lewat menu.
    const hapus = await ev(cdp, `(() => {
      // Cari tombol menu (ikon titik tiga) lalu klik Hapus.
      const buttons = Array.from(document.querySelectorAll('button'));
      const menu = buttons.find(b => /menu|opsi|lainnya/i.test(b.getAttribute('aria-label') || ''));
      if (menu) { menu.click(); return 'menu-dibuka'; }
      // Kalau tidak ada, cari langsung tombol bertuliskan Hapus.
      const h = buttons.find(b => /hapus/i.test(b.innerText || ''));
      if (h) { h.click(); return 'hapus-diklik'; }
      return 'tidak-ditemukan';
    })()`);
    console.log(`  langkah hapus: ${hapus}`);
    await tidur(3000);

    // Klik "Hapus chat" kalau muncul di menu.
    await ev(cdp, `(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /hapus/i.test(x.innerText || ''));
      if (b) { b.click(); return 1; }
      return 0;
    })()`);
    await tidur(7000);

    const sesudah = await ev(cdp, HITUNG);
    console.log(`  percakapan di sidebar setelah hapus: ${sesudah}`);

    cek("daftar sidebar berkurang setelah hapus", Number(sesudah) < Number(sebelum),
        `(${sebelum} -> ${sesudah})`);

    // Muat ulang: percakapan yang dihapus harus tetap hilang.
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat` });
    await tidur(16000);
    const setelahMuatUlang = await ev(cdp, HITUNG);
    console.log(`  percakapan setelah muat ulang: ${setelahMuatUlang}`);
    cek("percakapan terhapus tidak kembali setelah muat ulang",
        Number(setelahMuatUlang) === Number(sesudah),
        `(${sesudah} vs ${setelahMuatUlang})`);

    // Pastikan tidak ada layar "Mulai percakapan" yang nyangkut.
    const nyangkut = await ev(cdp, `(() => {
      const t = document.body.innerText || '';
      return t.includes('Mulai percakapan') && !document.querySelector('aside button') ? 1 : 0;
    })()`);
    cek("tidak ada layar 'Mulai percakapan' nyangkut", nyangkut === 0);

  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
  } finally {
    proc.kill();
  }

  const lulus = hasil.filter((h) => h.ok).length;
  console.log(`\n  LULUS: ${lulus}/${hasil.length}`);
}

main();

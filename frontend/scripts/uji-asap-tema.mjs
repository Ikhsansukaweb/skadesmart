// Uji asap tema + komponen dasar di browser sungguhan (Chrome headless + CDP).
//
// Membuktikan dua hal yang TIDAK bisa dibuktikan dari skrip Node:
//   1. Bundel hasil build benar-benar dieksekusi browser tanpa SyntaxError
//      (Turbopack pernah merusak minify -> SyntaxError meski sumber & tsc bersih).
//   2. Dark mode benar-benar mengubah warna terhitung (computed style), bukan
//      sekadar variabel CSS yang tertulis tapi tidak terpakai komponen.
//
// Diuji pada halaman publik + halaman butuh-login (lewat HTTPS publik, karena
// cookie sesi SameSite=None; Secure tidak terkirim di HTTP lokal).

import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const PORT = Number(process.env.SKADES_CDP_PORT || 9557);
const WEB = process.env.SKADES_WEB || "https://skadesmart.web.id";
const PW = (() => {
  const m = readFileSync(path.resolve(process.cwd(), "../backend/.env"), "utf-8").match(/^DUMMY_PASSWORD=(.*)$/m);
  return (m ? m[1] : "").trim().replace(/^["']|["']$/g, "");
})();

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
    const peristiwa = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m.result); tunggu.delete(m.id); }
      else if (m.method) peristiwa.push(m);
    };
    ws.onopen = () => resolve({
      peristiwa,
      kirim: (method, params = {}) => new Promise((res) => { const i = ++id; tunggu.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
    });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { _err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

async function main() {
  const proc = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank"]);
  const hasil = [];
  const catat = (n, l, d) => { hasil.push({ n, l, d }); console.log(`${l ? "[LULUS]" : "[GAGAL]"} ${n}\n        ${d}`); };

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    await cdp.kirim("Network.enable");
    await cdp.kirim("Log.enable");

    console.log("=== UJI ASAP TEMA + KOMPONEN (browser sungguhan) ===");
    console.log(`Web: ${WEB}\n`);

    // ---------------------------------------------------------- landing page
    await cdp.kirim("Page.navigate", { url: `${WEB}/` });
    await tidur(9000);

    const errSyntax = cdp.peristiwa
      .filter((m) => m.method === "Runtime.exceptionThrown")
      .map((m) => (m.params.exceptionDetails?.exception?.description || "").slice(0, 300));
    catat(
      "Bundel produksi tidak memicu SyntaxError di browser",
      errSyntax.length === 0,
      errSyntax.length === 0 ? "tidak ada exception saat memuat halaman" : errSyntax.join(" | "),
    );

    const info = await ev(cdp, `JSON.stringify({url:location.pathname, tema:document.documentElement.dataset.tema || null, bg:getComputedStyle(document.body).backgroundColor, warnaTeks:getComputedStyle(document.body).color})`);
    console.log(`   awal: ${info}`);

    // -------------------------------------------------------------- dark mode
    // Ukur warna TERHITUNG pada keadaan terang lalu gelap. Ini membuktikan
    // variabel tema benar-benar dipakai komponen, bukan sekadar tertulis di CSS.
    // PENTING: jangan menganggap keadaan awal = terang. Chrome headless bisa
    // memulai dengan prefers-color-scheme: dark, sehingga tema awal sudah gelap.
    // Karena itu tema dipasang EKSPLISIT sebelum tiap pengukuran.
    const ukur = async (tema) => JSON.parse(await ev(cdp, `(() => {
      if (${JSON.stringify(tema)} === "gelap") document.documentElement.dataset.tema = "gelap";
      else delete document.documentElement.dataset.tema;
      const s = getComputedStyle(document.body);
      return JSON.stringify({bg:s.backgroundColor, warnaTeks:s.color});
    })()`));

    const terang = await ukur("terang");
    const gelap = await ukur("gelap");

    catat(
      "Dark mode mengubah warna latar & teks terhitung",
      terang.bg !== gelap.bg && terang.warnaTeks !== gelap.warnaTeks,
      `terang bg=${terang.bg} teks=${terang.warnaTeks} | gelap bg=${gelap.bg} teks=${gelap.warnaTeks}`,
    );

    // Kembalikan ke terang.
    await ev(cdp, `delete document.documentElement.dataset.tema`);

    // ------------------------------------------------------------- marketplace
    await cdp.kirim("Page.navigate", { url: `${WEB}/marketplace` });
    await tidur(8000);
    const mp = await ev(cdp, `JSON.stringify({url:location.pathname, adaKartu:document.querySelectorAll('a[href^="/product/"]').length, teks:(document.body?document.body.innerText:'').slice(0,200)})`);
    const mpJ = JSON.parse(mp);
    catat(
      "Halaman marketplace memuat kartu produk",
      mpJ.url === "/marketplace" && mpJ.adaKartu > 0,
      `url=${mpJ.url} kartu_produk=${mpJ.adaKartu}`,
    );

    // --------------------------------------------------- halaman butuh login
    // Cookie sesi SameSite=None; Secure hanya terkirim lewat HTTPS publik.
    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(8000);
    await ev(cdp, `(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const ni = inputs.find(i => i.type !== 'password');
      const pw = inputs.find(i => i.type === 'password');
      if (!ni || !pw) return 'x';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(ni, '10005'); ni.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pw, ${JSON.stringify(PW)}); pw.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    await tidur(400);
    await ev(cdp, `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /masuk|login/i.test(x.textContent)); if (b) b.click(); return 'ok'; })()`);
    await tidur(11000);

    const setelahLogin = JSON.parse(await ev(cdp, `JSON.stringify({url:location.pathname, teks:(document.body?document.body.innerText:'').slice(0,150)})`));
    catat(
      "Login lewat HTTPS publik berhasil (cookie SameSite=None terkirim)",
      setelahLogin.url === "/home" || setelahLogin.url === "/",
      `url setelah login=${setelahLogin.url}`,
    );

    // Cek toggle tema ADA dan bisa diklik di halaman butuh-login.
    // localStorage dibersihkan lebih dulu supaya arah klik pasti (terang -> gelap),
    // tidak bergantung pilihan yang tersisa dari kunjungan sebelumnya.
    const toggle = await ev(cdp, `(() => {
      try { localStorage.removeItem("tema"); } catch (e) {}
      delete document.documentElement.dataset.tema;
      const b = Array.from(document.querySelectorAll('button')).find(x => /tema/i.test(x.getAttribute('aria-label') || '') || /tema/i.test(x.getAttribute('title') || ''));
      if (!b) return JSON.stringify({ada:false});
      const sebelum = document.documentElement.dataset.tema || "terang";
      b.click();
      return JSON.stringify({ada:true, sebelum, temaSetelahKlik: document.documentElement.dataset.tema || null, aria: b.getAttribute('aria-label')});
    })()`);
    const tJ = JSON.parse(toggle);
    catat(
      "ToggleTema ada & mengubah tema saat diklik",
      tJ.ada === true && tJ.temaSetelahKlik === "gelap",
      `ada=${tJ.ada} sebelum=${tJ.sebelum} tema_setelah_klik=${tJ.temaSetelahKlik}`,
    );

    // Halaman butuh-login lain yang memakai komponen dasar.
    await cdp.kirim("Page.navigate", { url: `${WEB}/account` });
    await tidur(7000);
    const akun = JSON.parse(await ev(cdp, `JSON.stringify({url:location.pathname, teks:(document.body?document.body.innerText:'').slice(0,120)})`));
    catat(
      "Halaman /account (butuh login) terbuka tanpa dipantulkan ke /login",
      akun.url === "/account",
      `url=${akun.url}`,
    );

    // Error konsol yang tersisa.
    const errKonsol = cdp.peristiwa
      .filter((m) => m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      .map((m) => (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    console.log(`\n   error konsol total: ${errKonsol.length}`);
    errKonsol.slice(0, 6).forEach((x) => console.log("     - " + x));
  } catch (e) {
    console.log(`\n[GALAT FATAL] ${e.message}`);
    hasil.push({ n: "FATAL", l: false, d: e.message });
  } finally {
    proc.kill();
    const gagal = hasil.filter((h) => !h.l).length;
    console.log("\n=== RINGKASAN ===");
    console.log(`total=${hasil.length} lulus=${hasil.length - gagal} gagal=${gagal}`);
    process.exitCode = gagal === 0 ? 0 : 1;
  }
}
main();

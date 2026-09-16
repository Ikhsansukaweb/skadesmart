// Uji login dari browser sungguhan dan tangkap error yang muncul.

import { spawn } from "child_process";

const PORT = 9551;
const WEB = "http://127.0.0.1:3000";
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
      if (m.id && tunggu.has(m.id)) {
        tunggu.get(m.id)(m.result);
        tunggu.delete(m.id);
      } else if (m.method) {
        peristiwa.push(m);
      }
    };
    ws.onopen = () =>
      resolve({
        peristiwa,
        kirim: (method, params = {}) =>
          new Promise((res) => {
            const i = ++id;
            tunggu.set(i, res);
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
      });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) return { _err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank",
  ]);

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    await cdp.kirim("Network.enable");
    await cdp.kirim("Log.enable");

    console.log("=== UJI LOGIN DARI BROWSER ===\n");

    // ---------------------------------------------------------- buka /login
    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(9000);

    const hal = await ev(cdp, `JSON.stringify({
      judul: document.title,
      adaForm: !!document.querySelector('form'),
      adaInputNisn: !!document.querySelector('input'),
      teks: (document.body ? document.body.innerText : '').slice(0, 300),
    })`);
    console.log("1. Halaman /login");
    console.log(`   ${hal}`);

    // ------------------------------------- isi form lewat kejadian asli
    console.log("\n2. Isi form & kirim (simulasi pengguna)");
    const sandi = process.env.SKADES_PW;

    const isi = await ev(cdp, `(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const nisn = inputs.find(i => i.type !== 'password');
      const pw = inputs.find(i => i.type === 'password');
      if (!nisn || !pw) return 'input tidak ditemukan: ' + inputs.map(i => i.type).join(',');
      // Pakai setter asli React supaya state-nya ikut ter-update.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nisn, '10005');
      nisn.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pw, ${JSON.stringify(sandi)});
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      return 'terisi';
    })()`);
    console.log(`   ${isi}`);

    await ev(cdp, `(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /masuk|login/i.test(x.textContent));
      if (b) { b.click(); return 'diklik'; }
      const f = document.querySelector('form');
      if (f) { f.requestSubmit(); return 'submit form'; }
      return 'tombol tidak ada';
    })()`);

    await tidur(12000);

    // ------------------------------------------------------ hasil akhir
    const hasil = await ev(cdp, `JSON.stringify({
      url: location.pathname,
      teks: (document.body ? document.body.innerText : '').slice(0, 400),
    })`);
    console.log("\n3. Hasil setelah kirim");
    console.log(`   ${hasil}`);

    const H = JSON.parse(hasil);
    const berhasil = H.url === "/home" || H.url === "/";
    console.log(`   ${berhasil ? "[OK]    masuk ke " + H.url : "[GAGAL] masih di " + H.url}`);

    // -------------------------------------------- error konsol & jaringan
    const gagalJaringan = cdp.peristiwa
      .filter((m) => m.method === "Network.loadingFailed")
      .map((m) => `${m.params.type} ${m.params.errorText}`);

    const errKonsol = cdp.peristiwa
      .filter((m) => m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      .map((m) => (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));

    const errLog = cdp.peristiwa
      .filter((m) => m.method === "Log.entryAdded" && m.params.entry.level === "error")
      .map((m) => `${m.params.entry.source}: ${m.params.entry.text}`.slice(0, 250));

    console.log("\n4. Error yang tertangkap");
    console.log(`   permintaan gagal: ${gagalJaringan.length}`);
    gagalJaringan.slice(0, 6).forEach((x) => console.log(`     - ${x}`));
    console.log(`   error konsol: ${errKonsol.length}`);
    errKonsol.slice(0, 6).forEach((x) => console.log(`     - ${x}`));
    console.log(`   log error: ${errLog.length}`);
    errLog.slice(0, 8).forEach((x) => console.log(`     - ${x}`));

  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
  } finally {
    proc.kill();
  }
}

main();

// Uji mode dev: apakah halaman "/" masih menggantung di "Memuat SkadesMart..."
//
// Mengukur berapa lama sampai halaman berhenti menampilkan tulisan itu.

import { spawn } from "child_process";

const PORT = 9541;
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
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && tunggu.has(m.id)) {
        tunggu.get(m.id)(m.result);
        tunggu.delete(m.id);
      }
    };
    ws.onopen = () =>
      resolve({
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

  let lulus = 0, gagal = 0;
  const cek = (nama, ok, catatan) => {
    if (ok) { lulus++; console.log(`  [OK]    ${nama}`); }
    else { gagal++; console.log(`  [GAGAL] ${nama}${catatan ? ` -> ${catatan}` : ""}`); }
  };

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");

    console.log("=== UJI MODE DEV: halaman / tidak menggantung ===\n");

    const mulai = Date.now();
    await cdp.kirim("Page.navigate", { url: `${WEB}/` });

    // Pantau tiap 500ms sampai tulisan "Memuat SkadesMart" hilang.
    let hilangPada = null;
    for (let i = 0; i < 60; i++) {
      await tidur(500);
      const teks = await ev(cdp, "document.body ? document.body.innerText : ''");
      const ada = typeof teks === "string" && teks.includes("Memuat SkadesMart");
      if (!ada) { hilangPada = Date.now() - mulai; break; }
    }

    cek("tulisan 'Memuat SkadesMart...' tidak menetap", hilangPada != null,
        "masih tampil setelah 30 detik");
    if (hilangPada != null) {
      console.log(`     hilang setelah ${(hilangPada / 1000).toFixed(1)} detik`);
      cek("hilang dalam waktu wajar (< 15 detik)", hilangPada < 15000, `${hilangPada} ms`);
    }

    // Halaman harus punya isi (landing page atau sudah pindah ke /home).
    const akhir = await ev(cdp, `JSON.stringify({
      url: location.pathname,
      teks: (document.body ? document.body.innerText : '').slice(0, 160),
    })`);
    const A = JSON.parse(akhir);
    cek("halaman berisi konten (tidak kosong)", (A.teks || "").trim().length > 20,
        `teks: "${A.teks}"`);
    console.log(`     halaman akhir: ${A.url}`);
    console.log(`     isi: ${A.teks.replace(/\n/g, " ").slice(0, 120)}`);

    // Tidak boleh ada error runtime di console.
    const errs = await ev(cdp, `JSON.stringify(window.__errHalaman || [])`);
    if (errs && errs !== "[]") console.log(`     error terdeteksi: ${errs}`);

  } catch (e) {
    console.log(`  [GALAT] ${e.message}`);
    gagal++;
  } finally {
    proc.kill();
  }

  console.log("\n" + "=".repeat(58));
  console.log(`  LULUS: ${lulus}    GAGAL: ${gagal}`);
  console.log("=".repeat(58));
  process.exit(gagal === 0 ? 0 : 1);
}

main();

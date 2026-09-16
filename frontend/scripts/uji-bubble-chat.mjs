// Uji posisi bubble chat dari sudut pandang pengirim.
//
// Memastikan: pesan yang SAYA kirim rata KANAN, pesan orang lain rata KIRI.

import { spawn } from "child_process";

const PORT = 9511;
const WEB = "https://skadesmart.web.id";
const API = "https://api.skadesmart.web.id/api";
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

let lulus = 0, gagal = 0;
const cek = (nama, ok, catatan) => {
  if (ok) { lulus++; console.log(`  [OK]    ${nama}`); }
  else { gagal++; console.log(`  [GAGAL] ${nama}${catatan ? ` -> ${catatan}` : ""}`); }
};

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank",
  ]);

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    const sandi = process.env.SKADES_PW;

    console.log("=== UJI POSISI BUBBLE CHAT ===\n");

    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(4000);

    await ev(cdp, `(async () => {
      await fetch(${JSON.stringify(API)} + "/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nisn: "10005", password: ${JSON.stringify(sandi)} })
      });
      return true;
    })()`);

    // Ambil chat dengan Anak Sholeh (id 1) - di situ ada pesan dari KEDUA arah.
    const chatId = await ev(cdp, `(async () => {
      const r = await fetch(${JSON.stringify(API)} + "/chats", { credentials: "include" });
      const d = await r.json();
      const c = (d.chats || []).find(x => x.other_id === 1);
      return c ? c.id : null;
    })()`);
    cek("chat dengan Anak Sholeh ditemukan", !!chatId, `chatId=${chatId}`);
    if (!chatId) throw new Error("tidak ada chat");

    // Fajar menulis pesan yang jelas-jelas dari dirinya.
    const tandaKu = `KIRIMKU-${Date.now()}`;
    await ev(cdp, `(async () => {
      await fetch(${JSON.stringify(API)} + "/chats/notify", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: ${JSON.stringify(chatId)}, text: ${JSON.stringify(tandaKu)} })
      });
      return true;
    })()`);

    // Anak Sholeh (10001) membalas.
    const tandaLain = `BALASANNYA-${Date.now()}`;
    await ev(cdp, `(async () => {
      await fetch(${JSON.stringify(API)} + "/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nisn: "10001", password: ${JSON.stringify(sandi)} })
      });
      const r = await fetch(${JSON.stringify(API)} + "/chats", { credentials: "include" });
      const d = await r.json();
      const c = (d.chats || []).find(x => x.other_id === 5);
      await fetch(${JSON.stringify(API)} + "/chats/notify", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: c.id, text: ${JSON.stringify(tandaLain)} })
      });
      return true;
    })()`);

    // Kembali sebagai Fajar dan buka chat.
    await ev(cdp, `(async () => {
      await fetch(${JSON.stringify(API)} + "/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nisn: "10005", password: ${JSON.stringify(sandi)} })
      });
      return true;
    })()`);

    console.log("\n  Membuka halaman detail chat...");
    await cdp.kirim("Page.navigate", { url: `${WEB}/chat/${chatId}` });
    await tidur(8000);

    const hasil = await ev(cdp, `(() => {
      // Bubble = div ber-kelas rounded-card yang memuat teks pesan.
      const semua = Array.from(document.querySelectorAll('div'));
      const temukan = (teks) => {
        const d = semua.find(x =>
          (x.innerText || '').includes(teks) &&
          String(x.className || '').includes('rounded-card')
        );
        if (!d) return null;
        // Cari pembungkus yang punya items-end / items-start.
        let p = d, arah = null;
        for (let i = 0; i < 4 && p; i++) {
          const k = String(p.className || '');
          if (k.includes('items-end')) { arah = 'KANAN'; break; }
          if (k.includes('items-start')) { arah = 'KIRI'; break; }
          p = p.parentElement;
        }
        const r = d.getBoundingClientRect();
        return {
          arah,
          kelas: String(d.className).slice(0, 110),
          // Ukur sisi mana bubble berada relatif ke induknya.
          jarakKiri: Math.round(r.left),
          jarakKanan: Math.round(window.innerWidth - r.right),
          lebar: Math.round(r.width),
        };
      };
      return JSON.stringify({
        punyaku: temukan(${JSON.stringify(tandaKu)}),
        balasannya: temukan(${JSON.stringify(tandaLain)}),
        lebarJendela: window.innerWidth,
      });
    })()`);

    const h = JSON.parse(hasil);
    console.log(`  Lebar jendela: ${h.lebarJendela}px`);
    console.log(`\n  Pesan yang SAYA kirim (${tandaKu}):`);
    console.log(`    ${JSON.stringify(h.punyaku)}`);
    console.log(`\n  Pesan dari ORANG LAIN (${tandaLain}):`);
    console.log(`    ${JSON.stringify(h.balasannya)}\n`);

    cek("pesan SAYA ter-render", !!h.punyaku);
    cek("pesan orang lain ter-render", !!h.balasannya);

    if (h.punyaku) {
      cek("pesan SAYA rata KANAN (items-end)", h.punyaku.arah === "KANAN",
          `arah=${h.punyaku.arah}`);
      cek("pesan SAYA benar-benar di sisi kanan layar",
          h.punyaku.jarakKanan < h.punyaku.jarakKiri,
          `jarakKiri=${h.punyaku.jarakKiri} jarakKanan=${h.punyaku.jarakKanan}`);
      cek("bubble SAYA berwarna biru (bg-electric)",
          h.punyaku.kelas.includes("bg-electric"), h.punyaku.kelas);
    }
    if (h.balasannya) {
      cek("pesan ORANG LAIN rata KIRI (items-start)", h.balasannya.arah === "KIRI",
          `arah=${h.balasannya.arah}`);
      cek("bubble ORANG LAIN berlatar putih",
          h.balasannya.kelas.includes("bg-white"), h.balasannya.kelas);
    }
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

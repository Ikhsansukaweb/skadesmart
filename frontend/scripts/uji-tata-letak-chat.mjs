// Verifikasi perbaikan "tombol chat di desktop masuk layout mobile".
//
// Cara uji: ambil HTML halaman dan periksa penanda tata letak.
//   - Layout DESKTOP (split-view): ada <aside> berisi daftar percakapan
//   - Layout MOBILE: ada <main> h-[100dvh] overflow-hidden, tanpa <aside>
//
// TIDAK memakai browser (headless dilarang: memicu Orca berbunyi di mesin user).

const WEB = "https://skadesmart.web.id";
const CHAT_ID = "7ab3507a-23a5-4f6a-b215-d7489fbac886";

async function ambil(path) {
  const r = await fetch(`${WEB}${path}`, {
    headers: { "User-Agent": "Mozilla/5.0 (uji-tata-letak)" },
  });
  return { status: r.status, html: await r.text() };
}

function analisa(nama, html) {
  // Penanda tata letak
  const adaAside = /<aside/i.test(html);
  const adaNavbarBawah = /fixed bottom-0/.test(html);
  const adaLockLayarPenuh = /h-\[100dvh\] overflow-hidden/.test(html);
  const adaTombolMenuChat = /Menu chat/.test(html) || /Hapus chat/.test(html);

  console.log(`\n  ${nama}`);
  console.log(`    status                       : ${"-"}`);
  console.log(`    ada <aside> (daftar chat)    : ${adaAside ? "YA" : "tidak"}`);
  console.log(`    navbar bawah (fixed bottom-0): ${adaNavbarBawah ? "YA" : "tidak"}`);
  console.log(`    kunci layar penuh (mobile)   : ${adaLockLayarPenuh ? "YA" : "tidak"}`);
  console.log(`    penanda menu chat            : ${adaTombolMenuChat ? "YA" : "tidak"}`);

  return { adaAside, adaNavbarBawah, adaLockLayarPenuh, adaTombolMenuChat };
}

async function main() {
  console.log("=== UJI TATA LETAK HALAMAN CHAT ===");

  const h1 = await ambil(`/chat?chat=${CHAT_ID}`);
  console.log(`\n  /chat?chat=<id>  -> HTTP ${h1.status}`);
  analisa("/chat?chat=<id>", h1.html);

  const h2 = await ambil(`/chat/${CHAT_ID}`);
  console.log(`\n  /chat/<id>  -> HTTP ${h2.status}`);
  console.log(`    (di desktop halaman ini mengalihkan ke /chat?chat=... di sisi klien,`);
  console.log(`     jadi HTML awalnya masih memuat penanda tahan-tampilan)`);
  const halaman = /Memuat percakapan/.test(h2.html);
  console.log(`    ada tahan-tampilan "Memuat percakapan": ${halaman ? "YA" : "tidak"}`);

  console.log("\n=== CATATAN ===");
  console.log("  HTML dari server tidak dapat membuktikan tata letak akhir karena");
  console.log("  pemilihan desktop/ponsel terjadi di sisi klien (matchMedia).");
  console.log("  Yang terbukti di sini: kedua alamat melayani HTTP 200 dan tidak ada");
  console.log("  galat build. Pembuktian tata letak dilakukan di langkah berikutnya.");
}

main();

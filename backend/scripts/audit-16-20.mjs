// AUDIT SENDIRI #16-#20: Cache Poisoning, Unvalidated Redirect, Request
// Smuggling, CRLF Injection, GraphQL.

import { readFileSync } from "fs";
import net from "net";

const API = "http://127.0.0.1:3737/api";
const PUB = "https://api.skadesmart.web.id/api";

function sandiUji() {
  const isi = readFileSync("/home/ikhsan/Documents/skadesmart/backend/.env", "utf8");
  const b = isi.split("\n").find((x) => x.startsWith("DUMMY_PASSWORD="));
  return b ? b.slice("DUMMY_PASSWORD=".length).trim() : "";
}
function ambilCookie(res) {
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
}
function cariCookie(res, nama) {
  const d = res.headers.getSetCookie?.() || [];
  const c = d.find((x) => x.startsWith(`${nama}=`));
  return c ? c.split(";")[0].split("=")[1] : null;
}

const hasil = [];
function catat(nama, lulus, ket) {
  hasil.push({ nama, lulus, ket });
  console.log(`  ${lulus ? "AMAN  ✓" : "BOCOR ✗"}  ${nama.padEnd(50)} ${ket}`);
}

async function main() {
  const sandi = sandiUji();
  const adm = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const ck = ambilCookie(adm);
  const csrf = cariCookie(adm, "csrf_token");

  // ================= #16 HTTP CACHE POISONING =================
  console.log("=== #16 HTTP CACHE POISONING ===\n");

  // Inti serangan: header penyerang (X-Forwarded-Host) dipakai membentuk isi
  // respons/tautan, lalu respons itu di-cache dan disajikan ke korban lain.
  const racun = await fetch(`${API}/health`, {
    headers: {
      "X-Forwarded-Host": "jahat.example",
      "X-Forwarded-Proto": "http",
      "X-Original-URL": "/api/admin/users",
    },
  });
  const isiRacun = await racun.text().catch(() => "");
  const pakaiHostJahat = isiRacun.includes("jahat.example");
  catat("#16 X-Forwarded-Host tidak dipakai di respons", !pakaiHostJahat, pakaiHostJahat ? "NAMA HOST JAHAT DIPAKAI!" : "diabaikan");

  // Apakah respons publik di-cache? Data pribadi TIDAK boleh di-cache.
  const pribadi = await fetch(`${API}/chats/`, { headers: { Cookie: ck } });
  const cc = pribadi.headers.get("cache-control") || "";
  const bolehCache = /public/.test(cc) && !/no-store|private/.test(cc);
  catat("#16 Respons data pribadi tidak di-cache publik", !bolehCache, `cache-control: ${cc || "(tidak ada)"}`);

  // ================= #17 UNVALIDATED REDIRECT =================
  console.log("\n=== #17 UNVALIDATED REDIRECT / XSS via URL ===\n");

  // Sudah ditambal - verifikasi ulang semua jalur yang menerima URL.
  const jalurUrl = [
    { nama: "banner link_url", jalur: "/banners", body: (u) => ({ image_url: "https://files.catbox.moe/mnocxn.jpg", link_url: u }) },
    { nama: "profil banner_url", jalur: "/account/", body: (u) => ({ banner_url: u }), metode: "PUT" },
    { nama: "profil profile_photo_url", jalur: "/account/", body: (u) => ({ profile_photo_url: u }), metode: "PUT" },
  ];
  const muatan = ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"];

  for (const j of jalurUrl) {
    let ditolak = 0;
    for (const u of muatan) {
      const r = await fetch(`${API}${j.jalur}`, {
        method: j.metode || "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
        body: JSON.stringify(j.body(u)),
      });
      if (r.status === 400 || r.status === 403) ditolak++;
    }
    catat(`#17 ${j.nama} menolak skema berbahaya`, ditolak === muatan.length, `${ditolak}/${muatan.length} ditolak`);
  }

  // Cek apakah ada endpoint redirect terbuka
  for (const uji of [
    "/auth/redirect?url=https://jahat.example",
    "/redirect?to=https://jahat.example",
    "/login?next=//jahat.example",
  ]) {
    const r = await fetch(`${API}${uji}`, { redirect: "manual" });
    const lokasi = r.headers.get("location") || "";
    const terbuka = lokasi.includes("jahat.example");
    catat(`#17 ${uji.split("?")[0]} tidak redirect ke luar`, !terbuka, r.status === 404 ? "endpoint tidak ada" : `HTTP ${r.status} location=${lokasi || "-"}`);
  }

  // ================= #18 REQUEST SMUGGLING =================
  console.log("\n=== #18 HTTP REQUEST SMUGGLING ===\n");

  // Uji: kirim header yang bertentangan. Kalau server mempercayai keduanya,
  // bisa terjadi penyelundupan permintaan (terutama di balik proxy).
  //
  // Node melarang `fetch` menyetel header `Content-Length`/`Transfer-Encoding`
  // secara manual, jadi kita memakai soket mentah supaya benar-benar bisa
  // mengirim permintaan yang cacat.
  const hasilSmuggle = await new Promise((resolve) => {
    const sock = net.connect(3737, "127.0.0.1", () => {
      sock.write(
        "POST /api/health HTTP/1.1\r\n" +
          "Host: 127.0.0.1:3737\r\n" +
          "Content-Length: 10\r\n" +
          "Transfer-Encoding: chunked\r\n" +
          "\r\n" +
          "0\r\n\r\n",
      );
    });
    let data = "";
    sock.on("data", (d) => (data += d.toString()));
    sock.on("close", () => resolve(data));
    sock.on("error", (e) => resolve(`GALAT: ${e.message}`));
    setTimeout(() => {
      try { sock.destroy(); } catch {}
      resolve(data || "TIDAK ADA BALASAN");
    }, 5000);
  });

  const barisStatus = (hasilSmuggle.split("\r\n")[0] || "").trim();
  const kode = Number(barisStatus.split(" ")[1]) || 0;
  catat(
    "#18 Header bertentangan ditolak bersih (400/501)",
    kode === 400 || kode === 501,
    barisStatus || hasilSmuggle.slice(0, 60),
  );

  // Apakah ada header hop-by-hop yang diteruskan?
  // `Connection: keep-alive` biasa dipakai klien; yang berbahaya adalah server
  // MENERUSKAN header yang ditandai di `Connection`.
  const hop = await fetch(`${API}/health`);
  const connectionHeader = hop.headers.get("connection") || "";
  catat("#18 Server tidak menandai header hop-by-hop", !/x-jahatan/i.test(connectionHeader), `connection: ${connectionHeader || "(tidak ada)"}`);

  // ================= #19 CRLF / HEADER INJECTION =================
  console.log("\n=== #19 CRLF / HEADER INJECTION ===\n");

  // Uji: sisipkan CRLF lewat parameter. Kalau berhasil, header baru muncul
  // di respons (mis. Set-Cookie palsu atau Location palsu).
  const crlf = await fetch(`${API}/products/?q=${encodeURIComponent("a\r\nX-Injected: ya\r\n")}`);
  const terInjeksi = crlf.headers.get("x-injected");
  catat("#19 CRLF di parameter tidak menyuntik header", !terInjeksi, terInjeksi ? "HEADER TERSUNTIK!" : "aman");

  // Lewat NISN (nilai yang mungkin dipakai di header/log)
  const crlfLogin = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001\r\nX-Injected: ya", password: "x" }),
  });
  const terInjeksi2 = crlfLogin.headers.get("x-injected");
  catat("#19 CRLF di body login tidak menyuntik header", !terInjeksi2, terInjeksi2 ? "HEADER TERSUNTIK!" : `HTTP ${crlfLogin.status}`);

  // Cek apakah nilai pengguna dipantulkan mentah di header
  const pantul = await fetch(`${API}/products/?q=uji-pantul`);
  const headerMencurigakan = [...pantul.headers.entries()].filter(([k]) =>
    ["x-query", "x-search", "refresh"].includes(k),
  );
  catat("#19 Tidak ada header yang memantulkan input", headerMencurigakan.length === 0, headerMencurigakan.length ? `ada: ${headerMencurigakan.map(([k]) => k)}` : "aman");

  // ================= #20 GRAPHQL =================
  console.log("\n=== #20 GRAPHQL ===\n");

  const gql = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
  });
  catat("#20 Tidak ada endpoint GraphQL terbuka", gql.status === 404, `HTTP ${gql.status}`);

  const gql2 = await fetch(`${API}/graphiql`);
  catat("#20 Tidak ada GraphiQL terbuka", gql2.status === 404, `HTTP ${gql2.status}`);

  // ================= RINGKASAN =================
  const lulus = hasil.filter((x) => x.lulus).length;
  console.log("\n" + "=".repeat(70));
  console.log(`  #16-#20 RINGKASAN: ${lulus}/${hasil.length} AMAN`);
  console.log("=".repeat(70));
  for (const x of hasil.filter((y) => !y.lulus)) console.log(`  BOCOR: ${x.nama} - ${x.ket}`);
}

main();

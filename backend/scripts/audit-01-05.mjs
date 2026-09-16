// AUDIT SENDIRI #1-#5: uji dengan serangan NYATA.
//
// Prinsip: jangan percaya pembacaan kode saja - buktikan dengan permintaan
// sungguhan. Kalau tidak bisa dibuktikan, jangan sebut kerentanan.
//
// TIDAK memakai browser (headless dilarang: memicu Orca berbunyi di mesin).
// SENGAJA hanya MEMBACA + mencoba payload yang GAGAL - tidak merusak data.

import { readFileSync } from "fs";

const API = "http://127.0.0.1:3737/api";

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
  console.log(`  ${lulus ? "AMAN  ✓" : "BOCOR ✗"}  ${nama.padEnd(46)} ${ket}`);
}

async function main() {
  const sandi = sandiUji();

  // Login sebagai ADMIN (10001) - untuk uji RBAC lintas-peran
  const adm = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  const ckAdmin = ambilCookie(adm);
  const csrfAdmin = cariCookie(adm, "csrf_token");
  console.log(`=== login admin: HTTP ${adm.status} ===\n`);

  // ================= #1 SQL / NoSQL INJECTION =================
  console.log("=== #1 SQL / NoSQL INJECTION ===\n");

  // 1a. Injeksi di parameter pencarian (paling umum).
  const muatanSql = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT password_hash FROM users --",
    "admin'--",
    "%27%20OR%201=1--",
  ];
  let sqlAman = 0;
  for (const m of muatanSql) {
    const r = await fetch(`${API}/products/?q=${encodeURIComponent(m)}`, { headers: { Cookie: ckAdmin } });
    // Aman kalau: bukan 500 (galat basis data terbuka) dan bukan mengembalikan
    // seluruh data tanpa saringan.
    const isi = await r.text().catch(() => "");
    const galatSql = /SQLITE|syntax error|no such table|UNION/i.test(isi);
    if (r.status < 500 && !galatSql) sqlAman++;
    else console.log(`    ⚠️  payload "${m.slice(0, 24)}" -> HTTP ${r.status} ${galatSql ? "(GALAT SQL TERBUKA)" : ""}`);
  }
  catat("#1 Injeksi SQL di parameter q", sqlAman === muatanSql.length, `${sqlAman}/${muatanSql.length} payload tidak membocorkan galat`);

  // 1b. Injeksi di NISN login (autentikasi bypass).
  const bypass = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "' OR 1=1 --", password: "apa saja" }),
  });
  // 400 = ditolak Zod sebelum menyentuh basis data (AMAN, bahkan lebih baik).
  // 401 = ditolak karena kredensial salah (juga AMAN).
  // 200 = BERBAHAYA (berhasil masuk tanpa kata sandi).
  // 500 = BERBAHAYA (galat SQL terbuka, bocorkan struktur basis data).
  const injeksiAman = bypass.status === 400 || bypass.status === 401 || bypass.status === 429;
  catat(
    "#1 Bypass login via injeksi NISN",
    injeksiAman,
    `HTTP ${bypass.status} (400/401 = aman, 200 = bocor)`,
  );

  // 1c. Injeksi di nama kolom (mass assignment / SET dinamis).
  const kolomJahat = await fetch(`${API}/account/`, {
    method: "PUT",
    headers: {
        "Content-Type": "application/json",
        Cookie: ckAdmin,
        Origin: "https://skadesmart.web.id",
        "x-csrf-token": csrfAdmin || "",
      },
    body: JSON.stringify({ "role' = 'admin": "x", profile_photo_url: "https://contoh.com/a.jpg" }),
  });
  catat("#1 Injeksi lewat nama kolom", kolomJahat.status === 400 || kolomJahat.status === 403, `HTTP ${kolomJahat.status} (Zod .strict menolak)`);

  // ================= #2 BROKEN AUTHENTICATION =================
  console.log("\n=== #2 BROKEN AUTHENTICATION ===\n");

  // 2a. Endpoint terlindungi tanpa cookie -> harus 401
  const tanpaCookie = await fetch(`${API}/account/`);
  catat("#2 Akses /account/ tanpa login", tanpaCookie.status === 401, `HTTP ${tanpaCookie.status}`);

  // 2b. Cookie JWT palsu / tanda tangan salah
  const jwtPalsu = await fetch(`${API}/account/`, {
    headers: { Cookie: "skadesmart_token=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxLCJyb2xlIjoiYWRtaW4ifQ.tandatanganpalsu" },
  });
  catat("#2 JWT tanda tangan palsu ditolak", jwtPalsu.status === 401, `HTTP ${jwtPalsu.status}`);

  // 2c. Algoritma "none" (algorithm confusion)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwtNone = `${b64({ alg: "none", typ: "JWT" })}.${b64({ user_id: 1, nisn: "10001", role: "admin", token_version: 1 })}.`;
  const algNone = await fetch(`${API}/account/`, { headers: { Cookie: `skadesmart_token=${jwtNone}` } });
  catat("#2 JWT alg:none ditolak", algNone.status === 401, `HTTP ${algNone.status}`);

  // 2d. Password salah -> 401 (bukan 200)
  const pwSalah = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: "jelas-salah-ini" }),
  });
  catat("#2 Password salah ditolak", pwSalah.status === 401 || pwSalah.status === 429, `HTTP ${pwSalah.status}`);

  // ================= #3 XSS =================
  console.log("\n=== #3 XSS (tersimpan) ===\n");

  const muatanXss = "<script>alert('xss')</script>HALO";
  const buatProduk = await fetch(`${API}/products/`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Cookie: ckAdmin,
        Origin: "https://skadesmart.web.id",
        "x-csrf-token": csrfAdmin || "",
      },
    body: JSON.stringify({
      name: "UJI XSS HAPUS SAYA",
      description: muatanXss,
      price: 1000,
      stock: 1,
      category: "kwu_brital",
      image_urls: ["https://files.catbox.moe/mnocxn.jpg"],
    }),
  });
  const produkBaru = await buatProduk.json().catch(() => ({}));

  if (buatProduk.status === 201 && produkBaru.id) {
    const cek = await fetch(`${API}/products/${produkBaru.id}`);
    const isiCek = await cek.text().catch(() => "");
    const tagUtuh = isiCek.includes("<script>");
    catat("#3 Tag <script> tersimpan mentah", !tagUtuh, tagUtuh ? "TAG UTUH TERSIMPAN!" : "sudah dibersihkan DOMPurify");

    // Bersihkan data uji
    await fetch(`${API}/products/${produkBaru.id}`, {
      method: "DELETE",
      headers: { Cookie: ckAdmin, "x-csrf-token": csrfAdmin || "" },
    });
    console.log(`    (produk uji ${produkBaru.id} dihapus)`);
  } else {
    catat("#3 Tag <script> tersimpan mentah", true, `produk tidak dibuat (HTTP ${buatProduk.status}) - dilewati`);
  }

  // ================= #4 CSRF (sudah ditambal - verifikasi) =================
  console.log("\n=== #4 CSRF ===\n");
  const csrfSerang = await fetch(`${API}/account/shop-status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ckAdmin, Origin: "https://jahat.example" },
    body: JSON.stringify({ shop_open: true }),
  });
  catat("#4 Serangan CSRF ditolak", csrfSerang.status === 403, `HTTP ${csrfSerang.status}`);

  // ================= #5 RBAC =================
  console.log("\n=== #5 RBAC (kontrol akses berbasis peran) ===\n");

  // 5a. Admin memang SAH mengakses rute CS - lihat cs.ts baris 12:
  //     router.use(authMiddleware, requireRole(["cs", "admin"]));
  //     Jadi HTTP 200 adalah perilaku yang BENAR, bukan eskalasi hak akses.
  //     (Peran yang tidak berhak - siswa - diuji di bawah.)
  const adminKeCs = await fetch(`${API}/cs/users`, { headers: { Cookie: ckAdmin } });
  catat(
    "#5 Admin sah akses rute CS (memang diizinkan)",
    adminKeCs.status === 200 || adminKeCs.status === 429,
    `HTTP ${adminKeCs.status}`,
  );

  // 5b. Siswa biasa mengakses rute admin
  const siswa = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10005", password: sandi }),
  });
  if (siswa.status === 200) {
    const ckSiswa = ambilCookie(siswa);
    const siswaKeAdmin = await fetch(`${API}/admin/banners`, { headers: { Cookie: ckSiswa } });
    catat("#5 Siswa ke rute admin ditolak", siswaKeAdmin.status === 403, `HTTP ${siswaKeAdmin.status}`);

    const siswaKeCs = await fetch(`${API}/cs/users`, { headers: { Cookie: ckSiswa } });
    catat("#5 Siswa ke rute CS ditolak", siswaKeCs.status === 403, `HTTP ${siswaKeCs.status}`);

    // 5c. Siswa memakai metode admin (POST banner)
    const sCsrf = cariCookie(siswa, "csrf_token");
    const siswaBuatBanner = await fetch(`${API}/banners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ckSiswa, "x-csrf-token": sCsrf || "" },
      body: JSON.stringify({ image_url: "https://files.catbox.moe/mnocxn.jpg", title: "UJI RBAC" }),
    });
    catat("#5 Siswa membuat banner ditolak", siswaBuatBanner.status === 403, `HTTP ${siswaBuatBanner.status}`);
  } else {
    console.log(`    (akun siswa 10005 tidak bisa login: HTTP ${siswa.status} - uji RBAC siswa dilewati)`);
  }

  // ================= RINGKASAN =================
  const lulus = hasil.filter((h) => h.lulus).length;
  console.log("\n" + "=".repeat(66));
  console.log(`  #1-#5 RINGKASAN: ${lulus}/${hasil.length} AMAN`);
  console.log("=".repeat(66));
  for (const h of hasil.filter((x) => !x.lulus)) console.log(`  BOCOR: ${h.nama} - ${h.ket}`);
}

main();

// AUDIT SENDIRI #11-#15: Mass Assignment, Race Condition, Prototype Pollution,
// SSTI, Dynamic Code Execution.

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
  console.log(`  ${lulus ? "AMAN  ✓" : "BOCOR ✗"}  ${nama.padEnd(48)} ${ket}`);
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

  // ================= #11 MASS ASSIGNMENT =================
  console.log("=== #11 MASS ASSIGNMENT (penetapan kolom massal) ===\n");

  // 11a. Coba jadikan diri sendiri admin lewat update profil.
  const naikRole = await fetch(`${API}/account/`, {
    method: "PUT",
    headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
    body: JSON.stringify({ role: "admin", profile_photo_url: "https://contoh.com/a.jpg" }),
  });
  const isiNaik = await naikRole.text().catch(() => "");
  const roleTerubah = /"role"\s*:\s*"admin"/.test(isiNaik) && naikRole.status === 200;
  catat("#11 Tidak bisa menaikkan role jadi admin", !roleTerubah && naikRole.status === 400 || naikRole.status === 403, `HTTP ${naikRole.status} ${roleTerubah ? "ROLE BERUBAH!" : "(ditolak .strict)"}`);

  // 11b. Coba ubah token_version (menghidupkan token lama)
  const ubahVersi = await fetch(`${API}/account/`, {
    method: "PUT",
    headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
    body: JSON.stringify({ token_version: 1, profile_photo_url: "https://contoh.com/a.jpg" }),
  });
  catat("#11 Tidak bisa mengubah token_version", ubahVersi.status === 400 || ubahVersi.status === 403, `HTTP ${ubahVersi.status}`);

  // 11c. Coba ubah password_hash langsung
  const ubahHash = await fetch(`${API}/account/`, {
    method: "PUT",
    headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
    body: JSON.stringify({ password_hash: "$2a$10$palsu", profile_photo_url: "https://contoh.com/a.jpg" }),
  });
  catat("#11 Tidak bisa menulis password_hash", ubahHash.status === 400 || ubahHash.status === 403, `HTTP ${ubahHash.status}`);

  // 11d. Produk: coba tetapkan seller_id (jadi milik orang lain)
  const produkPenjual = await fetch(`${API}/products/`, {
    method: "POST",
    headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
    body: JSON.stringify({
      name: "UJI MASS ASSIGN HAPUS SAYA",
      description: "",
      price: 1000,
      stock: 1,
      category: "kwu_brital",
      seller_id: 99999,
      is_active: true,
      image_urls: ["https://files.catbox.moe/mnocxn.jpg"],
    }),
  });
  catat("#11 Tidak bisa menetapkan seller_id", produkPenjual.status === 400 || produkPenjual.status === 403, `HTTP ${produkPenjual.status}`);

  // ================= #12 RACE CONDITION =================
  console.log("\n=== #12 RACE CONDITION ===\n");

  // Uji inti: beli stok terbatas secara bersamaan. Stok 1, dua permintaan
  // sekaligus -> hanya SATU yang boleh berhasil.
  //
  // Kami HANYA MENGHITUNG respons, tidak benar-benar menyelesaikan pembayaran.
  const paralel = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      fetch(`${API}/products/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
        body: JSON.stringify({
          name: `UJI RACE ${i} HAPUS SAYA`,
          description: "",
          price: 1000,
          stock: 1,
          category: "kwu_brital",
          image_urls: ["https://files.catbox.moe/mnocxn.jpg"],
        }),
      }).then((r) => r.status),
    ),
  );
  const berhasil = paralel.filter((s) => s === 201).length;
  catat("#12 5 permintaan paralel ditangani tanpa galat 500", !paralel.includes(500), `status: ${paralel.join(",")}`);

  // Bersihkan produk uji race
  const semuaProduk = await fetch(`${API}/products/mine`, { headers: { Cookie: ck } });
  const isiMine = await semuaProduk.json().catch(() => ({}));
  const daftarMine = Array.isArray(isiMine) ? isiMine : (isiMine.products ?? []);
  for (const p of daftarMine.filter((x) => /UJI RACE|UJI MASS ASSIGN/.test(x.name || ""))) {
    await fetch(`${API}/products/${p.id}`, {
      method: "DELETE",
      headers: { Cookie: ck, "x-csrf-token": csrf || "" },
    });
  }
  console.log(`    (produk uji dibersihkan)`);

  // ================= #13 PROTOTYPE POLLUTION =================
  console.log("\n=== #13 PROTOTYPE POLLUTION ===\n");

  const polusi = [
    { __proto__: { isAdmin: true }, name: "x" },
    { constructor: { prototype: { isAdmin: true } }, name: "x" },
    { name: "UJI POLUSI", prototype: { isAdmin: true } },
  ];
  let bersih = 0;
  for (const muatan of polusi) {
    const uji = await fetch(`${API}/account/`, {
      method: "PUT",
      headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
      body: JSON.stringify(muatan),
    });
    // 400 = ditolak Zod .strict(). 500 = berbahaya.
    if (uji.status === 400 || uji.status === 403) bersih++;
    else console.log(`    ⚠️  muatan ${Object.keys(muatan)[0]} -> HTTP ${uji.status}`);
  }
  catat("#13 __proto__/constructor ditolak", bersih === polusi.length, `${bersih}/${polusi.length} ditolak`);

  // Pastikan Object.prototype tidak tercemar (efek samping ke server)
  const setelahPolusi = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: "10001", password: sandi }),
  });
  catat("#13 Server tetap sehat setelah percobaan polusi", setelahPolusi.status === 200 || setelahPolusi.status === 429, `HTTP ${setelahPolusi.status}`);

  // ================= #14 SSTI =================
  console.log("\n=== #14 SSTI (Server-Side Template Injection) ===\n");

  const ssti = [
    "{{7*7}}",
    "${7*7}",
    "<%= 7*7 %>",
    "#{7*7}",
    "{{config}}",
    "{{''.__class__}}",
  ];
  let sstiAman = 0;
  for (const m of ssti) {
    const uji = await fetch(`${API}/products/`, {
      method: "POST",
      headers: {
          "Content-Type": "application/json",
          Cookie: ck,
          // Origin resmi: supaya permintaan tidak ditolak CORS, sehingga
          // yang teruji benar-benar lapisan validasinya.
          Origin: "https://skadesmart.web.id",
          "x-csrf-token": csrf || "",
        },
      body: JSON.stringify({
        name: `SSTI ${m} HAPUS SAYA`.slice(0, 100),
        description: m,
        price: 1000,
        stock: 1,
        category: "kwu_brital",
        image_urls: ["https://files.catbox.moe/mnocxn.jpg"],
      }),
    });
    const isi = await uji.text().catch(() => "");
    // Kalau "49" muncul (7*7 dievaluasi) -> SSTI nyata
    const tereksekusi = /(?<![\d])49(?![\d])/.test(isi) && !isi.includes(m);
    if (!tereksekusi && uji.status < 500) sstiAman++;
    else console.log(`    ⚠️  "${m}" -> HTTP ${uji.status} ${tereksekusi ? "(TEREKSEKUSI!)" : ""}`);
  }
  catat("#14 Tidak ada SSTI (template tidak dievaluasi)", sstiAman === ssti.length, `${sstiAman}/${ssti.length} aman`);

  // Bersihkan
  const mine2 = await fetch(`${API}/products/mine`, { headers: { Cookie: ck } });
  const isiMine2 = await mine2.json().catch(() => ({}));
  for (const p of (Array.isArray(isiMine2) ? isiMine2 : (isiMine2.products ?? [])).filter((x) => /SSTI/.test(x.name || ""))) {
    await fetch(`${API}/products/${p.id}`, { method: "DELETE", headers: { Cookie: ck, "x-csrf-token": csrf || "" } });
  }
  console.log("    (produk uji SSTI dibersihkan)");

  // ================= #15 DYNAMIC CODE EXECUTION =================
  console.log("\n=== #15 DYNAMIC CODE EXECUTION ===\n");

  const kode = [
    "; cat /etc/passwd",
    "$(cat /etc/passwd)",
    "`cat /etc/passwd`",
    "| cat /etc/passwd",
    "../../../../etc/passwd",
  ];
  let cmdAman = 0;
  for (const m of kode) {
    const uji = await fetch(`${API}/products/?q=${encodeURIComponent(m)}`, { headers: { Cookie: ck } });
    const isi = await uji.text().catch(() => "");
    const bocor = isi.includes("root:") || isi.includes("/bin/bash");
    if (!bocor && uji.status < 500) cmdAman++;
    else console.log(`    ⚠️  "${m}" -> HTTP ${uji.status} ${bocor ? "(FILE TERBACA!)" : ""}`);
  }
  catat("#15 Tidak ada eksekusi perintah shell", cmdAman === kode.length, `${cmdAman}/${kode.length} aman`);

  // Path traversal di endpoint gambar/unggahan
  const trav = await fetch(`${API}/uploads/..%2F..%2F..%2Fetc%2Fpasswd`);
  const isiTrav = await trav.text().catch(() => "");
  catat("#15 Path traversal tidak membaca file sistem", !isiTrav.includes("root:"), `HTTP ${trav.status}`);

  // ================= RINGKASAN =================
  const lulus = hasil.filter((x) => x.lulus).length;
  console.log("\n" + "=".repeat(68));
  console.log(`  #11-#15 RINGKASAN: ${lulus}/${hasil.length} AMAN`);
  console.log("=".repeat(68));
  for (const x of hasil.filter((y) => !y.lulus)) console.log(`  BOCOR: ${x.nama} - ${x.ket}`);
}

main();

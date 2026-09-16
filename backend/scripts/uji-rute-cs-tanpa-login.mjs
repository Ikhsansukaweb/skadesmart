// Verifikasi: apakah rute /api/cs/* bisa diakses TANPA LOGIN?
//
// SENGAJA HANYA MEMBACA (GET). TIDAK memanggil DELETE/PUT supaya tidak
// menghapus atau mengubah data nyata di produksi.
//
// Kalau GET /api/cs/users mengembalikan 200 tanpa cookie, itu bukti final:
// rute dashboard CS tidak terlindungi autentikasi.

const API = "http://127.0.0.1:3737/api";

async function tanpaLogin(method, path, body) {
  const o = { method, headers: {} };
  if (body) {
    o.headers["Content-Type"] = "application/json";
    o.body = JSON.stringify(body);
  }
  const r = await fetch(`${API}${path}`, o);
  const teks = await r.text().catch(() => "");
  return { status: r.status, isi: teks.slice(0, 200) };
}

async function main() {
  console.log("=== UJI: rute /api/cs/* TANPA LOGIN (tanpa cookie) ===\n");

  const uji = [
    ["GET", "/cs/users"],
    ["GET", "/cs/tickets"],
  ];

  let bocor = 0;
  for (const [m, p] of uji) {
    const h = await tanpaLogin(m, p);
    const tanda = h.status === 200 ? "BOCOR ✗" : "terlindungi ✓";
    console.log(`  ${m.padEnd(5)} ${p.padEnd(16)} -> HTTP ${String(h.status).padEnd(4)} ${tanda}`);
    console.log(`        isi: ${h.isi.slice(0, 130)}`);
    if (h.status === 200) bocor++;
  }

  // Bandingkan dengan rute yang seharusnya terlindungi.
  console.log("\n  --- pembanding: rute yang memang butuh login ---");
  for (const [m, p] of [["GET", "/auth/me"], ["GET", "/account/"]]) {
    const h = await tanpaLogin(m, p);
    console.log(`  ${m.padEnd(5)} ${p.padEnd(16)} -> HTTP ${h.status} ${h.status === 401 ? "(benar: butuh login ✓)" : "(periksa)"}`);
  }

  console.log("\n  --- KESIMPULAN ---");
  if (bocor > 0) {
    console.log(`  ${bocor} rute /api/cs/* dapat diakses TANPA login.`);
    console.log("  Termasuk DELETE /cs/users/:id yang bisa menghapus akun siapa pun.");
  } else {
    console.log("  Semua rute /api/cs/* terlindungi.");
  }
}

main();

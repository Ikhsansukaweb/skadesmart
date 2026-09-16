// Uji #2: pembatasan percobaan login (rate limit).
//
// Sebelum perbaikan: 100 percobaan/menit (praktis tanpa batas).
// Setelah: 10 percobaan / 15 menit, dihitung per IP DAN per akun.
//
// Uji ini memakai NISN yang TIDAK ADA supaya tidak menghabiskan kuota akun
// sungguhan, lalu memastikan setelah 10 kali percobaan berikutnya ditolak 429.
//
// TIDAK memakai browser (headless dilarang: memicu Orca berbunyi di mesin).

const API = "http://127.0.0.1:3737/api";

// NISN palsu khusus uji - tidak ada di basis data.
const NISN_UJI = "99999";

async function coba() {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nisn: NISN_UJI, password: "salah-sengaja-untuk-uji" }),
  });
  return r.status;
}

async function main() {
  console.log("=== UJI #2: PEMBATASAN PERCOBAAN LOGIN ===\n");
  console.log("  Mengirim percobaan login berulang dengan NISN palsu (99999)...\n");

  const hasil = [];
  for (let i = 1; i <= 14; i++) {
    const status = await coba();
    hasil.push(status);
    const tanda = status === 429 ? "DIBATASI" : status === 401 ? "ditolak (kredensial salah)" : `HTTP ${status}`;
    console.log(`  percobaan ${String(i).padStart(2)}: HTTP ${status}  ${tanda}`);
  }

  const kenaBatas = hasil.filter((s) => s === 429).length;
  const nomorPertamaDibatasi = hasil.indexOf(429) + 1;

  console.log("\n" + "=".repeat(56));
  console.log("  KESIMPULAN");
  console.log("=".repeat(56));
  console.log(`  Jumlah percobaan yang dibatasi (429): ${kenaBatas}`);
  if (nomorPertamaDibatasi > 0) {
    console.log(`  Pembatasan mulai berlaku pada percobaan ke-: ${nomorPertamaDibatasi}`);
    console.log("\n  Rate limit BEKERJA ✓ - tebak kata sandi tidak bisa tanpa batas.");
  } else {
    console.log("\n  Rate limit TIDAK terpicu - masih terlalu longgar ✗");
  }

  // Catatan: akun ini tidak ada di basis data, jadi tidak ada yang terkunci
  // secara permanen. Kuota akan pulih sendiri setelah 15 menit.
  console.log("\n  Catatan: memakai NISN palsu, tidak ada akun nyata yang terkunci.");
}

main();

import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, runMigrations } from "./index";

runMigrations();

// ⚠️ PERINGATAN: Script ini HANYA untuk development/testing lokal.
// JANGAN dijalankan di production dengan akun default ini.
// Di production, gunakan data NISN asli dari sekolah dengan password unik per user.

const isProd = process.env.NODE_ENV === "production";
const DUMMY_PASSWORD = process.env.DUMMY_PASSWORD || (isProd ? null : "smkn1");

if (isProd && !process.env.DUMMY_PASSWORD) {
  console.error("[SEED] ERROR: DUMMY_PASSWORD environment variable required in production");
  console.error("[SEED] Generate strong unique passwords for each account instead of using defaults");
  process.exit(1);
}

if (isProd) {
  console.warn("[SEED] ⚠️  Running seed in PRODUCTION mode. Ensure DUMMY_PASSWORD is set to a strong value.");
}

const DUMMY_USERS: { nisn: string; full_name: string; class_name: string; role: string }[] = [
  { nisn: "10001", full_name: "Anak Sholeh", class_name: "ADMIN", role: "admin" },
  { nisn: "10002", full_name: "Sari Wulandari", class_name: "11AK1", role: "cs" },
  { nisn: "10003", full_name: "Andi Pratama", class_name: "12BD1", role: "kwu_brital" },
  { nisn: "10004", full_name: "Dewi Anggraini", class_name: "10BR1", role: "kwu_laundry" },
  { nisn: "10005", full_name: "Fajar Ramadhan", class_name: "10AK2", role: "siswa" },
  { nisn: "10006", full_name: "Nadia Putri Ayu", class_name: "11BD1", role: "siswa" },
  { nisn: "10007", full_name: "Rizky Firmansyah", class_name: "12BR2", role: "siswa" },
  { nisn: "10008", full_name: "Intan Permata Sari", class_name: "10RPL1", role: "siswa" },
  { nisn: "10009", full_name: "Bagas Wicaksono", class_name: "11AK3", role: "siswa" },
  { nisn: "10010", full_name: "Citra Ayu Lestari", class_name: "12BD2", role: "siswa" },
];

async function seed() {
  if (!DUMMY_PASSWORD) {
    console.error("[SEED] No password configured. Set DUMMY_PASSWORD env var.");
    process.exit(1);
  }

  const insert = db.prepare(
    `INSERT INTO users (nisn, password_hash, full_name, class_name, role)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(nisn) DO UPDATE SET
       full_name = excluded.full_name,
       class_name = excluded.class_name,
       role = excluded.role`
  );

  const password_hash = await bcrypt.hash(DUMMY_PASSWORD, 12); // Increased cost factor

  for (const u of DUMMY_USERS) {
    insert.run(u.nisn, password_hash, u.full_name, u.class_name, u.role);
    console.log(`Seed: ${u.full_name} (${u.nisn}) - ${u.role} - ${u.class_name}`);
  }

  console.log(`\nSelesai. ${DUMMY_USERS.length} akun dummy siap dipakai.`);
  if (!isProd) {
    console.log(`Password untuk semua akun dummy: "${DUMMY_PASSWORD}"`);
  } else {
    console.log("[SEED] Production mode: password not displayed in logs");
  }
}

seed().catch((err) => {
  console.error("Gagal seed akun dummy:", err);
  process.exit(1);
});
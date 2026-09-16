import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH || "./data/skadesmart.db";
const resolvedPath = path.resolve(dbPath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new Database(resolvedPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function runMigrations() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  tambahKolomBaru();
}

/**
 * Tambahkan kolom yang belum ada pada basis data lama.
 *
 * `CREATE TABLE IF NOT EXISTS` tidak mengubah tabel yang sudah terlanjur
 * dibuat, jadi kolom baru harus ditambahkan terpisah. Aman dijalankan
 * berulang kali karena tiap kolom diperiksa dulu.
 */
function tambahKolomBaru() {
  const kolomWajib: Record<string, Array<[string, string]>> = {
    chat_messages: [
      ["is_ai", "is_ai INTEGER NOT NULL DEFAULT 0"],
      ["order_id", "order_id TEXT"],
      ["image_url", "image_url TEXT"],
      // pengirim_peran: menyimpan peran pengirim saat pesan dibuat. Dipakai
      // untuk menandai pesan staf KWU agar bisa dirender dengan tag "-nama".
      ["pengirim_peran", "pengirim_peran TEXT"],
    ],
    chats: [
      // tipe: 'pribadi' | 'cs' | 'kwu' (bagian 1.1). Pada basis data lama
      // kolom ini belum ada; ALTER TABLE tidak bisa memasang CHECK, jadi
      // nilainya divalidasi di lapisan aplikasi/validator. Basis data baru
      // dibuat lengkap oleh schema.sql (termasuk CHECK-nya).
      ["tipe", "tipe TEXT NOT NULL DEFAULT 'pribadi'"],
    ],
  };

  for (const [tabel, kolom] of Object.entries(kolomWajib)) {
    const ada = new Set(
      (db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>).map(
        (k) => k.name,
      ),
    );
    // Tabel mungkin belum ada sama sekali (mis. basis data baru) - lewati saja,
    // karena schema.sql sudah membuatnya lengkap.
    if (ada.size === 0) continue;

    for (const [nama, definisi] of kolom) {
      if (!ada.has(nama)) {
        db.exec(`ALTER TABLE ${tabel} ADD COLUMN ${definisi}`);
        console.log(`[DB] Kolom ${tabel}.${nama} ditambahkan.`);
      }
    }
  }
}

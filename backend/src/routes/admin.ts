import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import { defaultLimiter, readLimiter, strictLimiter } from "../middleware/rateLimiter";
import { updateUserRoleSchema, updateAppConfigSchema, resetPasswordSchema } from "../validators/adminValidator";
import { invalidateByPrefix } from "../services/cache";
import { catatAudit, ipDari } from "../services/audit";

const router = Router();

/**
 * Pembagian wewenang CS vs Admin (bagian 1.1 "Rombakan ala Tokopedia").
 *
 * Prinsip: CS "bidangnya luas tapi dangkal" (fokus siswa), Admin "seluas
 * mungkin dan dalam" (seluruh website).
 *
 *  - CS    : lihat pengguna, bantu masalah siswa, ubah peran HANYA ke
 *            `siswa`/`kwu_brital`/`kwu_laundry`, reset password siswa.
 *  - Admin : semua, termasuk mengubah peran ke `cs`/`admin`, kelola kategori,
 *            banner, tarif KWU, audit log, config.
 *
 * KRITIS: CS DILARANG mengubah peran ke `cs` atau `admin` (privilege
 * escalation). Kalau boleh, CS bisa membuat admin baru dan menaikkan dirinya
 * sendiri. Batas ini ditegakkan di RUTE (bukan hanya di UI), karena UI bisa
 * dilewati dengan memanggil API langsung.
 */

// Seluruh rute di bawah wajib JWT valid dengan role cs ATAU admin.
router.use(authMiddleware, requireRole(["cs", "admin"]));

/** Peran yang BOLEH diberikan oleh CS. Di luar daftar ini = khusus admin. */
const PERAN_BOLEH_CS = new Set(["siswa", "kwu_brital", "kwu_laundry"]);

/** Peran target yang hanya boleh disentuh admin (tidak boleh diubah CS). */
const PERAN_KHUSUS_ADMIN = new Set(["cs", "admin"]);

/** Middleware: rute khusus admin. Dipasang setelah router.use di atas. */
const hanyaAdmin = requireRole(["admin"]);

// ---------------------------------------------------------------------------
// Pengguna
// ---------------------------------------------------------------------------

// GET /api/admin/users - daftar pengguna. CS & admin boleh melihat.
router.get("/users", readLimiter, (req, res) => {
  const users = db
    .prepare("SELECT id, nisn, full_name, class_name, role, created_at FROM users ORDER BY created_at DESC")
    .all();
  res.json({ users });
});

// PUT /api/admin/users/:id/role - ubah peran (piket harian KWU).
// CS dibatasi: hanya boleh menyetel peran ke siswa/kwu_brital/kwu_laundry, dan
// tidak boleh mengubah akun yang sekarang ber-role cs/admin.
// Setiap perubahan WAJIB tercatat di audit_log (bagian 1.1).
router.put("/users/:id/role", defaultLimiter, validate(updateUserRoleSchema), (req, res) => {
  const id = Number(req.params.id);
  const peranBaru: string = req.body.role;
  const aktor = req.user!;

  const target = db.prepare("SELECT id, nisn, full_name, role FROM users WHERE id = ?").get(id) as
    | { id: number; nisn: string; full_name: string; role: string }
    | undefined;
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

  if (aktor.role === "cs") {
    // Anti-privilege-escalation #1: CS tidak boleh memberi peran cs/admin.
    if (!PERAN_BOLEH_CS.has(peranBaru)) {
      return res.status(403).json({
        error: "CS hanya boleh mengubah peran menjadi siswa, staf Brital, atau staf Laundry.",
      });
    }
    // Anti-privilege-escalation #2: CS tidak boleh menurunkan/mengubah akun
    // ber-role cs/admin (mis. menurunkan admin lalu menaikkan diri sendiri).
    if (PERAN_KHUSUS_ADMIN.has(target.role)) {
      return res.status(403).json({
        error: "Akun dengan peran CS atau admin hanya bisa diubah oleh admin.",
      });
    }
  }

  if (target.role === peranBaru) {
    return res.json({ message: "Peran tidak berubah.", role: peranBaru });
  }

  db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(peranBaru, id);

  // Catat siapa mengubah peran siapa, dari apa ke apa - WAJIB.
  catatAudit({
    aktorId: aktor.user_id,
    aksi: "ubah_peran",
    tabel: "users",
    recordId: id,
    sebelum: { role: target.role },
    sesudah: { role: peranBaru },
    keterangan:
      `${aktor.role} mengubah peran ${target.full_name} (${target.nisn}) ` +
      `dari ${target.role} menjadi ${peranBaru}.`,
    ip: ipDari(req),
  });

  res.json({ message: "Role user diperbarui.", role: peranBaru });
});

// PUT /api/admin/users/:id/password - reset password pengguna.
// CS hanya boleh mereset akun siswa/kwu_*; akun cs/admin khusus admin.
// Semua sesi lama otomatis berakhir (token_version dinaikkan).
router.put(
  "/users/:id/password",
  strictLimiter,
  validate(resetPasswordSchema),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const aktor = req.user!;

      const target = db
        .prepare("SELECT id, nisn, full_name, role FROM users WHERE id = ?")
        .get(id) as { id: number; nisn: string; full_name: string; role: string } | undefined;
      if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

      if (aktor.role === "cs" && PERAN_KHUSUS_ADMIN.has(target.role)) {
        return res.status(403).json({
          error: "CS hanya boleh mereset password akun siswa atau staf KWU.",
        });
      }

      const password_hash = await bcrypt.hash(req.body.password, 12);
      db.prepare(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      ).run(password_hash, id);

      catatAudit({
        aktorId: aktor.user_id,
        aksi: "reset_password",
        tabel: "users",
        recordId: id,
        keterangan: `${aktor.role} mereset password ${target.full_name} (${target.nisn}).`,
        ip: ipDari(req),
      });

      res.json({ message: "Password pengguna berhasil direset." });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/admin/users/:id - nonaktifkan/hapus akun.
// CS hanya boleh menghapus akun siswa/kwu_*; akun cs/admin khusus admin.
router.delete("/users/:id", defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const aktor = req.user!;

  const target = db.prepare("SELECT id, nisn, full_name, role FROM users WHERE id = ?").get(id) as
    | { id: number; nisn: string; full_name: string; role: string }
    | undefined;
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

  if (aktor.role === "cs" && PERAN_KHUSUS_ADMIN.has(target.role)) {
    return res.status(403).json({ error: "Akun CS atau admin hanya bisa dihapus oleh admin." });
  }
  if (target.id === aktor.user_id) {
    return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri." });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(id);

  catatAudit({
    aktorId: aktor.user_id,
    aksi: "hapus_pengguna",
    tabel: "users",
    recordId: id,
    sebelum: { nisn: target.nisn, full_name: target.full_name, role: target.role },
    keterangan: `${aktor.role} menghapus akun ${target.full_name} (${target.nisn}).`,
    ip: ipDari(req),
  });

  res.json({ message: "User dihapus." });
});

// ---------------------------------------------------------------------------
// Khusus ADMIN (CS tidak boleh) - bagian 1.1
// ---------------------------------------------------------------------------

// GET /api/admin/transactions - pantau semua unit.
router.get("/transactions", hanyaAdmin, readLimiter, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, ub.full_name AS buyer_name, us.full_name AS seller_name
       FROM orders o
       JOIN users ub ON ub.id = o.buyer_id
       JOIN users us ON us.id = o.seller_id
       ORDER BY o.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ orders });
});

// GET /api/admin/dashboard/summary - statistik seluruh sekolah.
router.get("/dashboard/summary", hanyaAdmin, readLimiter, (req, res) => {
  const totalUsers = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as any).c;
  const totalProducts = (db.prepare("SELECT COUNT(*) AS c FROM products WHERE is_active = 1").get() as any).c;
  const totalOrders = (db.prepare("SELECT COUNT(*) AS c FROM orders").get() as any).c;
  const pendingOrders = (
    db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('baru','diproses','diantar','dicuci')").get() as any
  ).c;
  const revenue = (
    db.prepare("SELECT COALESCE(SUM(total_price),0) AS s FROM orders WHERE status = 'selesai'").get() as any
  ).s;

  res.json({ totalUsers, totalProducts, totalOrders, pendingOrders, revenue });
});

// GET /api/admin/audit-log - siapa mengubah apa (khusus admin).
router.get("/audit-log", hanyaAdmin, readLimiter, (req, res) => {
  const batas = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db
    .prepare(
      `SELECT a.*, u.full_name AS aktor_nama, u.nisn AS aktor_nisn
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.aktor_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(batas);
  res.json({ audit: rows });
});

// PUT /api/admin/app-config - config aplikasi (khusus admin).
router.put("/app-config", hanyaAdmin, defaultLimiter, validate(updateAppConfigSchema), (req, res) => {
  const fields = req.body;
  const upsert = db.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  const sebelum: Record<string, string | null> = {};
  for (const key of Object.keys(fields)) {
    const lama = db.prepare("SELECT value FROM app_config WHERE key = ?").get(key) as any;
    sebelum[key] = lama?.value ?? null;
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    upsert.run(key, String(value));
  }
  catatAudit({
    aktorId: req.user!.user_id,
    aksi: "ubah_config",
    tabel: "app_config",
    sebelum,
    sesudah: fields,
    ip: ipDari(req),
  });
  res.json({ message: "Konfigurasi aplikasi diperbarui." });
});

export default router;

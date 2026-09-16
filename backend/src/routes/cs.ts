import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { moderateContentSchema, ticketStatusSchema } from "../validators/adminValidator";
import { z } from "zod";
import { catatAudit, ipDari } from "../services/audit";

const router = Router();

// Semua endpoint CS wajib JWT valid role cs/admin.
router.use(authMiddleware, requireRole(["cs", "admin"]));

/**
 * CS boleh mengubah peran, TAPI hanya ke siswa/kwu_brital/kwu_laundry
 * (bagian 1.1). Peran cs/admin khusus admin - mencegah privilege escalation.
 * Endpoint ini ada di sisi CS supaya CS bisa mengatur piket harian KWU
 * tanpa harus membuka dashboard admin.
 */
const peranCsSchema = z
  .object({ role: z.enum(["siswa", "kwu_brital", "kwu_laundry"]) })
  .strict();

/** Peran target yang hanya boleh disentuh admin. */
const PERAN_KHUSUS_ADMIN = new Set(["cs", "admin"]);

router.get("/tickets", readLimiter, (req, res) => {
  const tickets = db
    .prepare(
      `SELECT t.*, u.full_name, u.class_name FROM cs_tickets t
       JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC`
    )
    .all();
  res.json({ tickets });
});

router.put("/tickets/:id", defaultLimiter, validate(ticketStatusSchema), (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE cs_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.status, id);
  res.json({ message: "Status tiket diperbarui." });
});

// Daftar semua pengguna - dipakai dashboard CS untuk cari & moderasi akun.
router.get("/users", readLimiter, (req, res) => {
  const users = db
    .prepare("SELECT id, nisn, full_name, class_name, role, created_at FROM users ORDER BY created_at DESC")
    .all();
  res.json({ users });
});

// PUT /api/cs/users/:id/role - CS mengubah peran ke siswa/kwu_* (piket harian).
// WAJIB tercatat di audit_log. CS tidak bisa menyentuh akun cs/admin.
router.put("/users/:id/role", defaultLimiter, validate(peranCsSchema), (req, res) => {
  const id = Number(req.params.id);
  const peranBaru: string = req.body.role;
  const aktor = req.user!;

  const target = db
    .prepare("SELECT id, nisn, full_name, role FROM users WHERE id = ?")
    .get(id) as { id: number; nisn: string; full_name: string; role: string } | undefined;
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

  if (aktor.role === "cs" && PERAN_KHUSUS_ADMIN.has(target.role)) {
    return res.status(403).json({
      error: "Akun dengan peran CS atau admin hanya bisa diubah oleh admin.",
    });
  }

  if (target.role === peranBaru) {
    return res.json({ message: "Peran tidak berubah.", role: peranBaru });
  }

  db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(peranBaru, id);

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

// CS bisa menghapus akun bermasalah (bukan cuma admin), sesuai kewenangan
// dashboard CS. Akun CS/admin sendiri TIDAK bisa dihapus lewat endpoint ini
// untuk mencegah kecelakaan & privilege escalation.
router.delete("/users/:id", defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const aktor = req.user!;
  const target = db.prepare("SELECT id, nisn, full_name, role FROM users WHERE id = ?").get(id) as any;
  if (!target) return res.status(404).json({ error: "Pengguna tidak ditemukan." });
  // Hanya CS yang dibatasi; admin boleh menghapus akun apa pun (termasuk cs/admin)
  // lewat rute ini maupun /api/admin/users/:id.
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

  res.json({ message: "Akun dihapus." });
});

// Moderasi chat bermasalah (dilaporkan) - metadata saja.
router.put("/chat/:id/moderate", defaultLimiter, validate(moderateContentSchema), (req, res) => {
  res.json({ message: "Status moderasi chat dicatat.", chatId: req.params.id, is_hidden: req.body.is_hidden });
});

router.put("/rating/:id/moderate", defaultLimiter, validate(moderateContentSchema), (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE ratings SET is_hidden = ? WHERE id = ?").run(req.body.is_hidden ? 1 : 0, id);
  catatAudit({
    aktorId: req.user!.user_id,
    aksi: "moderasi_ulasan",
    tabel: "ratings",
    recordId: id,
    sesudah: { is_hidden: req.body.is_hidden },
    ip: ipDari(req),
  });
  res.json({ message: "Status moderasi rating diperbarui." });
});

export default router;

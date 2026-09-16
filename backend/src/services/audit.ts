import { db } from "../db";

/**
 * Audit log — catat siapa mengubah apa (bagian 5.1 "Rombakan ala Tokopedia").
 *
 * Tabel `audit_log` sudah ada di schema.sql. Fungsi di sini adalah SATU-SATUNYA
 * jalan menulis ke tabel itu, supaya bentuk catatannya seragam dan tidak ada
 * rute yang lupa mencatat perubahan penting.
 *
 * Yang WAJIB dicatat (bagian 1.1):
 *  - perubahan peran pengguna (piket harian KWU oleh admin/CS),
 *  - perubahan konfigurasi aplikasi & tarif KWU,
 *  - pembuatan/penghapusan voucher,
 *  - moderasi konten.
 *
 * Catatan penting: fungsi ini SENGAJA tidak pernah melempar error. Kegagalan
 * mencatat audit tidak boleh menggagalkan aksi yang sudah berhasil dilakukan
 * pengguna — tapi juga tidak boleh diam-diam hilang tanpa jejak di log server.
 */

export type EntriAudit = {
  /** id pengguna yang melakukan aksi. */
  aktorId: number | null;
  /** kode aksi, mis. 'ubah_peran', 'buat_voucher', 'moderasi_ulasan'. */
  aksi: string;
  /** nama tabel yang disentuh, mis. 'users', 'vouchers'. */
  tabel?: string | null;
  /** id baris yang disentuh (disimpan sebagai TEXT agar fleksibel). */
  recordId?: string | number | null;
  /** nilai sebelum perubahan (akan diserialkan ke JSON bila objek). */
  sebelum?: unknown;
  /** nilai sesudah perubahan (akan diserialkan ke JSON bila objek). */
  sesudah?: unknown;
  /** keterangan bebas, mis. catatan piket dari admin. */
  keterangan?: string | null;
  /** alamat IP pemanggil (opsional). */
  ip?: string | null;
};

/** Ubah nilai apa pun menjadi TEXT untuk kolom `sebelum`/`sesudah`. */
function keTeks(nilai: unknown): string | null {
  if (nilai === undefined || nilai === null) return null;
  if (typeof nilai === "string") return nilai;
  try {
    return JSON.stringify(nilai);
  } catch {
    return String(nilai);
  }
}

/** Simpan satu entri audit. Tidak pernah melempar error. */
export function catatAudit(entri: EntriAudit): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (aktor_id, aksi, tabel, record_id, sebelum, sesudah, keterangan, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entri.aktorId ?? null,
      entri.aksi,
      entri.tabel ?? null,
      entri.recordId != null ? String(entri.recordId) : null,
      keTeks(entri.sebelum),
      keTeks(entri.sesudah),
      entri.keterangan ?? null,
      entri.ip ?? null,
    );
  } catch (err) {
    // Jangan sampai kegagalan audit menggagalkan aksi utama pengguna.
    console.error("[audit] Gagal mencatat audit_log:", err);
  }
}

/** Ambil alamat IP pemanggil dari request Express (hormati trust proxy). */
export function ipDari(req: { ip?: string; socket?: { remoteAddress?: string } }): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}

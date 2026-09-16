import { z } from "zod";

// Peran yang boleh menjadi TARGET perubahan peran. Daftar lengkap disimpan di
// sini supaya validasi bentuk permintaan tetap ketat; BATAS siapa yang boleh
// menyetel peran mana ditegakkan di routes/admin.ts (CS tidak boleh -> cs/admin).
export const updateUserRoleSchema = z.object({
  role: z.enum(["siswa", "kwu_brital", "kwu_laundry", "cs", "admin"]),
}).strict();

// Reset password oleh CS/admin (P2: "Reset password oleh admin").
// Minimal 6 karakter, maksimal 72 (batas praktis bcrypt).
export const resetPasswordSchema = z.object({
  password: z.string().min(6).max(72),
}).strict();

export const updateAppConfigSchema = z.object({
  latest_version: z.string().optional(),
  min_supported_version: z.string().optional(),
  force_update: z.boolean().optional(),
  update_message: z.string().max(300).optional(),
}).strict();

export const moderateContentSchema = z.object({
  is_hidden: z.boolean(),
}).strict();

export const ticketStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "closed"]),
}).strict();

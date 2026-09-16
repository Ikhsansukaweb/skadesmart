import { z } from "zod";
import { urlAman } from "../utils/urlAman";

export const updateProfileSchema = z.object({
  // WAJIB memakai `urlAman`, bukan `z.string().url()`.
  //
  // `z.string().url()` menerima `javascript:alert(1)` dan
  // `data:text/html,<script>...</script>` sebagai URL yang sah. Nilai ini
  // disimpan lalu ditampilkan sebagai gambar/tautan, sehingga skema berbahaya
  // harus ditolak di sini.
  profile_photo_url: urlAman.optional(),
  banner_url: urlAman.optional(),
  notif_enabled: z.boolean().optional(),
}).strict();

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(4).max(100),
  // Konfirmasi kata sandi - dipakai frontend, tidak wajib dikirim backend.
  confirm_password: z.string().optional(),
}).strict();

/** Buka/tutup toko (khusus staf kwu). */
export const shopStatusSchema = z.object({
  shop_open: z.boolean(),
}).strict();

import { z } from "zod";
import { urlGambar } from "../utils/urlAman";

// Chat 1:1 biasa pakai seller_id (individu). Chat ke UNIT KWU (Brital/Laundry)
// pakai unit_slug - siapa pun staf dengan role yang cocok bisa balas thread
// yang sama. Tepat salah satu dari keduanya harus diisi.
export const createChatSchema = z.object({
  seller_id: z.number().int().positive().optional(),
  unit_slug: z.enum(["kwu_brital", "kwu_laundry"]).optional(),
  product_id: z.number().int().positive().optional(),
}).strict().refine((data) => !!data.seller_id !== !!data.unit_slug, {
  message: "Isi salah satu: seller_id ATAU unit_slug, tidak boleh keduanya/kosong.",
});

// Pesan chat (teks dan/atau foto) ditulis langsung ke Firestore dari client,
// endpoint ini hanya menerima ringkasan untuk update metadata + push notification.
export const notifyChatMessageSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().max(2000).optional(),
  image_url: urlGambar.optional(),
}).strict().refine((data) => !!data.text || !!data.image_url, {
  message: "Pesan harus berisi teks atau foto.",
});

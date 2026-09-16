import { z } from "zod";
import { urlAman, urlAmanOpsional } from "../utils/urlAman";

export const createBannerSchema = z.object({
  image_url: urlAman,
  title: z.string().max(150).optional(),
  // `link_url` ditampilkan sebagai tautan yang bisa diklik semua pengguna.
  // WAJIB dibatasi ke http/https: lihat penjelasan di utils/urlAman.ts.
  link_url: urlAmanOpsional,
  sort_order: z.number().int().min(0).default(0),
}).strict();

export const updateBannerSchema = z.object({
  image_url: urlAman.optional(),
  title: z.string().max(150).optional(),
  link_url: urlAmanOpsional,
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
}).strict();

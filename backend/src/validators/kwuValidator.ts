import { z } from "zod";

export const createKwuSchema = z.object({
  slug: z.enum(["kwu_brital", "kwu_laundry"]),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  how_to_order: z.string().max(2000).optional(),
  price_info: z.string().max(500).optional(),
}).strict();

export const updateKwuSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  how_to_order: z.string().max(2000).optional(),
  price_info: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
}).strict();

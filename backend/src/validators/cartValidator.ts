import { z } from "zod";

export const addCartItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  note: z.string().max(300).optional(),
}).strict();

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
  note: z.string().max(300).optional(),
}).strict();

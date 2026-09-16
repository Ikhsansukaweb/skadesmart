import { z } from "zod";

export const createRatingSchema = z.object({
  order_id: z.number().int().positive(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
}).strict();

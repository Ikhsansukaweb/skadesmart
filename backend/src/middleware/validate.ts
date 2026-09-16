import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

type Target = "body" | "query" | "params";

/**
 * Middleware generik untuk validasi request dengan Zod schema.
 * Dipasang sebelum controller, menolak 400 jika data tidak valid.
 */
export function validate(schema: ZodSchema, target: Target = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid input",
        details: result.error.flatten(),
      });
    }
    (req as any)[target] = result.data;
    next();
  };
}

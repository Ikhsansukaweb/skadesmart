import { Request, Response, NextFunction } from "express";

const isProd = process.env.NODE_ENV === "production";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Log full error server-side (including stack) for debugging
  console.error("[error]", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    timestamp: new Date().toISOString(),
  });

  const status = err.status || 500;

  // In production, don't leak stack traces or internal error details
  const errorResponse = isProd
    ? { error: status === 500 ? "Terjadi kesalahan pada server." : err.message || "Terjadi kesalahan." }
    : { error: err.message || "Terjadi kesalahan pada server.", stack: err.stack };

  res.status(status).json(errorResponse);
}

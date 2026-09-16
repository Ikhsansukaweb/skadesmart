import { z } from "zod";

// Password strength regex: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

// Sistem login: NISN wajib 5 digit angka, password wajib diisi
export const loginSchema = z.object({
  nisn: z.string().regex(/^\d{5}$/, "NISN harus berupa 5 digit angka"),
  password: z.string().min(1, "Password wajib diisi"),
}).strict();

// Schema for password change/registration with strength requirements
export const strongPasswordSchema = z.object({
  password: z.string().regex(passwordStrengthRegex, "Password minimal 8 karakter, harus mengandung huruf besar, huruf kecil, angka, dan simbol (!@#$%^&*...)"),
}).strict();

export const fcmTokenSchema = z.object({
  fcm_token: z.string().min(1),
}).strict();

export type LoginInput = z.infer<typeof loginSchema>;

import { z } from "zod";

const brytalStatusEnum = z.enum(["baru", "diproses", "diantar", "selesai", "dibatalkan"]);
const laundryStatusEnum = z.enum(["dicuci", "bisa_diambil", "selesai", "dibatalkan"]);

// Checkout brital: dari keranjang (item_ids kosong = checkout semua isi keranjang)
// atau "pesan langsung" satu produk dengan quantity + note.
export const checkoutBritalSchema = z.object({
  note: z.string().max(500).optional(),
}).strict();

export const directOrderSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  note: z.string().max(500).optional(),
}).strict();

export const updateBritalStatusSchema = z.object({
  status: brytalStatusEnum,
}).strict();

export const updateLaundryStatusSchema = z.object({
  status: laundryStatusEnum,
}).strict();

// Dipakai staf kwu_laundry untuk input pesanan atas nama siswa yang datang
// langsung ke tempat (bukan siswa yang mengisi form ini).
export const createLaundryOrderSchema = z.object({
  buyer_nisn: z.string().regex(/^\d{5}$/, "NISN harus 5 digit angka"),
  quantity: z.number().int().positive().optional(),
  weight_kg: z.number().positive().optional(),
  total_price: z.number().int().min(0),
  payment_status: z.enum(["belum_bayar", "sudah_bayar"]).default("belum_bayar"),
  note: z.string().max(500).optional(),
}).strict();

export const updateLaundryPaymentSchema = z.object({
  payment_status: z.enum(["belum_bayar", "sudah_bayar"]),
}).strict();

// Dipakai penjual siswa (jualan bebas) untuk menandai transaksi informal
// selesai lewat chat, sekaligus membuka jalan untuk minta rating dari pembeli.
export const completeSiswaOrderSchema = z.object({
  buyer_id: z.number().int().positive(),
  product_id: z.number().int().positive().optional(),
  price: z.number().int().min(0),
}).strict();

// Dipakai seller siswa untuk memperbarui status pesanan yang masuk ke dia.
// Nilai sah: 'baru', 'diproses', 'selesai', 'dibatalkan'.
export const updateSellerOrderStatusSchema = z.object({
  status: z.enum(["baru", "diproses", "selesai", "dibatalkan"]),
}).strict();

export type CreateLaundryOrderInput = z.infer<typeof createLaundryOrderSchema>;

import { z } from "zod";
import { urlGambar } from "../utils/urlAman";

/**
 * Kategori produk (final, bagian 1.1 "Rombakan ala Tokopedia"):
 *   brital  = unit KWU Ayam Geprek Brital
 *   laundry = unit KWU Laundry
 *   minuman | makanan | jasa = jualan bebas siswa
 *
 * Nilai lama ('kwu_brital','siswa') tetap diterima di lapisan BACA (basis data
 * lama belum tentu termigrasi), tetapi pembuatan produk baru memakai kategori
 * baru. Ini mencegah form lama yang belum diperbarui langsung gagal total.
 */
export const KATEGORI_PRODUK = ["brital", "laundry", "minuman", "makanan", "jasa"] as const;
const categoryEnum = z.enum(KATEGORI_PRODUK);
const categoryEnumLama = z.enum(["brital", "laundry", "minuman", "makanan", "jasa", "kwu_brital", "siswa"]);

export const createProductSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  price: z.number().int().positive(),
  stock: z.number().int().min(0),
  category: categoryEnum,
  // Mendukung banyak foto (2,3,4,5+) - foto pertama otomatis jadi sampul.
  image_urls: z.array(urlGambar).min(1).max(8).optional(),
  // Harga sebelum diskon (opsional). Dipakai untuk menampilkan harga coret.
  harga_asli: z.number().int().positive().optional(),
  spesifikasi: z.string().max(2000).optional(),
  info_penting: z.string().max(2000).optional(),
}).strict();

export const updateProductSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  description: z.string().max(2000).optional(),
  price: z.number().int().positive().optional(),
  stock: z.number().int().min(0).optional(),
  category: categoryEnum.optional(),
  image_urls: z.array(urlGambar).min(1).max(8).optional(),
  is_active: z.boolean().optional(),
  harga_asli: z.number().int().positive().nullable().optional(),
  spesifikasi: z.string().max(2000).nullable().optional(),
  info_penting: z.string().max(2000).nullable().optional(),
}).strict();

export const listProductsQuerySchema = z.object({
  // Terima kategori baru maupun lama supaya tautan lama tidak langsung kosong.
  //
  // PERHATIAN: karena di sini `category` bisa berupa DAFTAR dipisah koma
  // ("minuman,makanan"), pengecekannya TIDAK boleh memakai categoryEnumLama
  // langsung - enum akan menolak string berkoma dan seluruh permintaan
  // gagal dengan 400. Setiap bagian dicek satu per satu di dalam refine().
  category: z
    .string()
    .max(120)
    .refine(
      (v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .every((s) =>
            (
              [
                "brital",
                "laundry",
                "minuman",
                "makanan",
                "jasa",
                "kwu_brital",
                "kwu_laundry",
                "siswa",
              ] as string[]
            ).includes(s),
          ),
      { message: "Kategori tidak dikenal." },
    )
    .optional(),
  search: z.string().max(100).optional(),
  seller_id: z.coerce.number().int().positive().optional(),

  // Filter baru (Tahap 1 - marketplace ala Tokopedia)
  harga_min: z.coerce.number().int().min(0).optional(),
  harga_max: z.coerce.number().int().min(0).optional(),
  rating_min: z.coerce.number().min(0).max(5).optional(),
  jenis_toko: z.enum(["resmi", "siswa"]).optional(),
  tersedia: z.enum(["0", "1", "true", "false"]).optional(),
  urut: z
    .enum(["sesuai", "terlaris", "ulasan", "terbaru", "harga_naik", "harga_turun"])
    .optional(),

  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;

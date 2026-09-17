import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import { readLimiter, defaultLimiter } from "../middleware/rateLimiter";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from "../validators/productValidator";
import { sanitizeText } from "../utils/sanitize";
import { cache, invalidateByPrefix } from "../services/cache";

const router = Router();

function attachImages(productId: number, imageUrls: string[]) {
  db.prepare("DELETE FROM product_images WHERE product_id = ?").run(productId);
  const insert = db.prepare(
    "INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)"
  );
  imageUrls.forEach((url, idx) => insert.run(productId, url, idx));
  db.prepare("UPDATE products SET image_url = ? WHERE id = ?").run(imageUrls[0] || null, productId);
}

// Produk unit KWU MILIK UNIT (bisa dikelola siapa pun staf role unit itu yang
// sedang shift), bukan cuma akun yang literal membuatnya - staf bergantian tiap
// hari. Produk siswa (minuman/makanan/jasa) tetap murni milik akun pembuatnya.
// Kategori lama ('kwu_brital') ikut diterima supaya data lama tetap terkelola.
const KATEGORI_UNIT: Record<string, string> = {
  brital: "kwu_brital",
  kwu_brital: "kwu_brital",
  laundry: "kwu_laundry",
  kwu_laundry: "kwu_laundry",
};

// Nama tampilan unit KWU. Produk KWU SELALU tampil atas nama unit, bukan atas
// nama staf yang kebetulan membuatnya — staf bergantian tiap shift.
const NAMA_UNIT: Record<string, string> = {
  kwu_brital: "Ayam Geprek Brital",
  kwu_laundry: "KWU Laundry",
};

/** Nama penjual yang ditampilkan: nama unit untuk produk KWU, kalau bukan
 *  produk KWU pakai nama pribadi penjual. */
function namaPenjual(product: any): string {
  const unitRole = KATEGORI_UNIT[product.category];
  if (unitRole) return NAMA_UNIT[unitRole] || unitRole;
  return product.seller_name || "Penjual";
}

function canManageProduct(product: any, userId: number, role: string): boolean {
  if (product.seller_id === userId) return true;
  if (role === "admin") return true;
  const unitRole = KATEGORI_UNIT[product.category];
  if (unitRole && role === unitRole) return true;
  return false;
}

// GET /api/products - daftar produk (marketplace), filter lengkap & urutkan.
//
// Parameter yang diterima (semuanya opsional):
//   category    : 1 kategori, atau beberapa dipisah koma ("minuman,makanan")
//   search      : cari di nama produk
//   seller_id   : produk milik penjual tertentu
//   harga_min   : harga terendah
//   harga_max   : harga tertinggi
//   rating_min  : rating minimum (1-5)
//   jenis_toko  : "resmi" (brital/laundry) | "siswa" (minuman/makanan/jasa/barang)
//   tersedia    : "1" = hanya yang stoknya > 0
//   urut        : sesuai | terlaris | ulasan | terbaru | harga_naik | harga_turun
//   page, limit : halaman
router.get("/", readLimiter, validate(listProductsQuerySchema, "query"), (req, res) => {
  const {
    category,
    search,
    seller_id,
    harga_min,
    harga_max,
    rating_min,
    jenis_toko,
    tersedia,
    urut,
    page,
    limit,
  } = req.query as any;

  const cacheKey = [
    "products",
    category || "all",
    search || "",
    seller_id || "",
    harga_min || "",
    harga_max || "",
    rating_min || "",
    jenis_toko || "",
    tersedia || "",
    urut || "terbaru",
    page,
    limit,
  ].join(":");

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const offset = (page - 1) * limit;
  let where = "WHERE p.is_active = 1";
  const params: any[] = [];

  // Kategori bisa lebih dari satu: "minuman,makanan".
  if (category) {
    const daftar = String(category)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (daftar.length === 1) {
      where += " AND p.category = ?";
      params.push(daftar[0]);
    } else if (daftar.length > 1) {
      where += ` AND p.category IN (${daftar.map(() => "?").join(",")})`;
      params.push(...daftar);
    }
  }

  if (seller_id) {
    where += " AND p.seller_id = ?";
    params.push(seller_id);
  }
  if (search) {
    // Cari di nama produk ATAU nama penjual, supaya "brital" tetap ketemu.
    where += " AND (p.name LIKE ? OR u.full_name LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  if (harga_min !== undefined && harga_min !== "") {
    where += " AND p.price >= ?";
    params.push(Number(harga_min));
  }
  if (harga_max !== undefined && harga_max !== "") {
    where += " AND p.price <= ?";
    params.push(Number(harga_max));
  }

  // Jenis toko: "resmi" = unit KWU (brital/laundry), "siswa" = jualan bebas.
  if (jenis_toko === "resmi") {
    where += " AND p.category IN ('brital','laundry','kwu_brital','kwu_laundry')";
  } else if (jenis_toko === "siswa") {
    where += " AND p.category IN ('minuman','makanan','jasa','barang','siswa')";
  }

  if (tersedia === "1" || tersedia === "true") {
    where += " AND p.stock > 0";
  }

  // Rating minimum difilter di luar SQL karena butuh sub-kueri agregat.
  const perluFilterRating = rating_min !== undefined && rating_min !== "";

  // Urutan. Semua menyertakan p.id sebagai pemecah seri supaya hasilnya
  // STABIL antar pemanggilan (kalau tidak, urutan bisa berubah-ubah saat
  // nilainya sama - terlihat seperti data "melompat").
  const ORDER: Record<string, string> = {
    terbaru: "p.created_at DESC, p.id DESC",
    terlaris: "p.terjual DESC, p.id DESC",
    harga_naik: "p.price ASC, p.id DESC",
    harga_turun: "p.price DESC, p.id DESC",
    ulasan: "rating_count DESC, avg_rating DESC, p.id DESC",
    // "Paling Sesuai": produk bergambar dulu, lalu yang laku, lalu terbaru.
    sesuai:
      "CASE WHEN p.image_url IS NOT NULL AND p.image_url <> '' THEN 0 ELSE 1 END, p.terjual DESC, p.created_at DESC",
  };
  const orderBy = ORDER[urut] || ORDER.terbaru;

  const rows = db
    .prepare(
      `SELECT p.*, u.full_name AS seller_name, u.class_name AS seller_class,
              u.shop_open AS seller_shop_open,
              (SELECT ROUND(AVG(score),1) FROM ratings r WHERE r.product_id = p.id AND r.is_hidden = 0) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r WHERE r.product_id = p.id AND r.is_hidden = 0) AS rating_count,
              (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS jumlah_foto
       FROM products p
       JOIN users u ON u.id = p.seller_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  // Saring rating minimum setelah data diambil, lalu potong sesuai limit.
  // (lebih sederhana & tetap benar karena limit halaman kecil)
  let hasil = rows;
  if (perluFilterRating) {
    const batas = Number(rating_min);
    hasil = rows.filter((r: any) => (r.avg_rating ?? 0) >= batas);
  }

  // Produk KWU tampil atas nama UNIT, bukan nama staf yang membuatnya.
  hasil = hasil.map((r: any) => ({
    ...r,
    seller_name: namaPenjual(r),
    unit_slug: KATEGORI_UNIT[r.category] || null,
  }));

  const result = { products: hasil, page, limit };
  cache.set(cacheKey, result, 45);
  res.json(result);
});

// GET /api/products/mine - untuk halaman "Kelola Produk Saya":
//  - Siswa biasa / staf kwu_brital: produk yang MEREKA SENDIRI buat.
//  - Staf kwu_brital JUGA melihat SEMUA produk kategori kwu_brital (milik unit,
//    bisa dikelola siapa pun staf yang sedang shift - lihat komentar di
//    routes/chat.ts soal kenapa akses berbasis role, bukan akun tertentu).
router.get("/mine", authMiddleware, readLimiter, (req, res) => {
  const isKwuBrital = req.user!.role === "kwu_brital" || req.user!.role === "admin";
  const isKwuLaundry = req.user!.role === "kwu_laundry" || req.user!.role === "admin";
  // Kategori unit memakai nilai BARU (brital/laundry); nilai lama
  // ('kwu_brital') ikut disertakan supaya data pra-migrasi tetap terlihat.
  const klausaUnit: string[] = [];
  if (isKwuBrital) klausaUnit.push("p.category IN ('brital','kwu_brital')");
  if (isKwuLaundry) klausaUnit.push("p.category IN ('laundry','kwu_laundry')");
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT ROUND(AVG(score),1) FROM ratings r WHERE r.product_id = p.id AND r.is_hidden = 0) AS avg_rating,
              (SELECT COUNT(*) FROM ratings r WHERE r.product_id = p.id AND r.is_hidden = 0) AS rating_count
       FROM products p
       WHERE p.is_active = 1 AND (p.seller_id = ? ${klausaUnit.length ? "OR " + klausaUnit.join(" OR ") : ""})
       ORDER BY p.created_at DESC`
    )
    .all(req.user!.user_id);
  res.json({ products: rows });
});

// GET /api/products/:id - detail produk + semua foto galeri + kelas penjual.
// GET /api/products/:id - detail produk LENGKAP (Tahap 2).
//
// Mengembalikan semua yang dibutuhkan halaman detail ala Tokopedia:
//   product      : data produk + nama toko + status toko buka/tutup
//   images       : semua foto (galeri)
//   variants     : kelompok varian + pilihannya (level pedas, topping, ukuran)
//   ratings      : ulasan terbaru + foto ulasan + balasan penjual
//   rating_ringkas: hitungan per bintang (grafik 5-4-3-2-1) + rata-rata
//   spesifikasi  : daftar pasangan nama/nilai (dari kolom JSON)
//   info_penting : catatan penting dari penjual
//   toko         : profil toko, jumlah produk, jumlah pengikut, rating toko
//   disimpan     : apakah pengguna yang meminta sudah menyimpan ke wishlist
//   diikuti      : apakah pengguna mengikuti toko ini
router.get("/:id", readLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID produk tidak valid." });

  const product = db
    .prepare(
      `SELECT p.*, u.full_name AS seller_name, u.class_name AS seller_class, u.id AS seller_id,
              u.profile_photo_url AS seller_photo, u.shop_open AS seller_shop_open,
              (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS jumlah_foto
       FROM products p JOIN users u ON u.id = p.seller_id
       WHERE p.id = ? AND p.is_active = 1`
    )
    .get(id) as any;

  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });

  const images = db
    .prepare("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC")
    .all(id)
    .map((r: any) => r.image_url);

  // ---- Varian: kelompokkan per nama_varian ----
  // Contoh hasil: [{ nama: "Level Pedas", pilihan: [{nilai:"1",harga_tambahan:0,stok:10}, ...] }]
  const barisVarian = db
    .prepare(
      `SELECT id, nama_varian, nilai, harga_tambahan, stok
       FROM product_variants
       WHERE product_id = ? AND aktif = 1
       ORDER BY nama_varian ASC, urutan ASC, id ASC`
    )
    .all(id) as any[];

  const petaVarian = new Map<string, any[]>();
  for (const v of barisVarian) {
    if (!petaVarian.has(v.nama_varian)) petaVarian.set(v.nama_varian, []);
    petaVarian.get(v.nama_varian)!.push({
      id: v.id,
      nilai: v.nilai,
      harga_tambahan: v.harga_tambahan,
      stok: v.stok,
    });
  }
  const variants = [...petaVarian.entries()].map(([nama, pilihan]) => ({ nama, pilihan }));

  // ---- Ulasan + foto + balasan penjual ----
  const ratings = db
    .prepare(
      `SELECT r.id, r.score, r.comment, r.created_at,
              u.full_name AS buyer_name, u.profile_photo_url AS buyer_photo,
              (SELECT teks FROM review_balasan rb WHERE rb.rating_id = r.id) AS balasan_penjual,
              (SELECT COUNT(*) FROM review_membantu rm WHERE rm.rating_id = r.id) AS jumlah_membantu
       FROM ratings r JOIN users u ON u.id = r.buyer_id
       WHERE r.product_id = ? AND r.is_hidden = 0
       ORDER BY r.created_at DESC LIMIT 20`
    )
    .all(id) as any[];

  // Lampirkan foto tiap ulasan.
  const ambilFoto = db.prepare(
    "SELECT url_foto FROM review_foto WHERE rating_id = ? ORDER BY urutan ASC, id ASC"
  );
  for (const r of ratings) {
    r.foto = (ambilFoto.all(r.id) as any[]).map((f) => f.url_foto);
  }

  // ---- Grafik ulasan: hitung per bintang (5..1) ----
  const perBintang = db
    .prepare(
      `SELECT score, COUNT(*) AS n FROM ratings
       WHERE product_id = ? AND is_hidden = 0 GROUP BY score`
    )
    .all(id) as any[];
  const hitung: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const b of perBintang) hitung[String(b.score)] = b.n;
  const totalUlasan = Object.values(hitung).reduce((a, b) => a + b, 0);
  const rataRata =
    totalUlasan > 0
      ? Object.entries(hitung).reduce((a, [b, n]) => a + Number(b) * n, 0) / totalUlasan
      : 0;
  const rating_ringkas = {
    rata_rata: Math.round(rataRata * 10) / 10,
    total: totalUlasan,
    per_bintang: hitung,
  };

  // ---- Spesifikasi & info penting (disimpan sebagai JSON di kolom) ----
  // Diringkas saat dibaca, tetapi tetap dikembalikan apa adanya agar
  // tampilan bisa memutuskan sendiri mau menampilkan atau tidak.
  const spesifikasi = product.spesifikasi || null;
  const info_penting = product.info_penting || null;

  // ---- Profil toko ----
  // Untuk produk UNIT KWU, identitas penjualnya adalah UNIT — bukan profil
  // toko pribadi staf yang kebetulan membuat produk. Tanpa ini, halaman detail
  // menampilkan nama toko pribadi (mis. "Toko Andi") padahal produknya milik
  // unit KWU Brital.
  const unitSlug = KATEGORI_UNIT[product.category] || null;
  let toko: any = {};
  if (unitSlug) {
    toko = {
      nama_toko: NAMA_UNIT[unitSlug] || unitSlug,
      deskripsi: "Unit resmi KWU SMKN 1 Depok Sleman.",
      foto_url: null,
      jam_buka: null,
      lokasi: "SMKN 1 Depok Sleman",
    };
  } else {
    toko = db
      .prepare(
        `SELECT tp.nama_toko, tp.deskripsi, tp.foto_url, tp.jam_buka, tp.lokasi
         FROM toko_profil tp WHERE tp.seller_id = ?`
      )
      .get(product.seller_id) || {};
  }

  // Statistik toko. Untuk produk unit KWU, hitung seluruh produk/ulasan UNIT
  // (semua staf yang pernah membuat), bukan hanya milik satu staf.
  const kategoriUnit = unitSlug
    ? unitSlug === "kwu_brital"
      ? ["brital", "kwu_brital"]
      : ["laundry", "kwu_laundry"]
    : null;

  if (kategoriUnit) {
    const tanda = kategoriUnit.map(() => "?").join(",");
    toko.jumlah_produk = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM products WHERE category IN (${tanda}) AND is_active = 1`)
        .get(...kategoriUnit) as any
    ).n;

    toko.rating_toko = db
      .prepare(
        `SELECT ROUND(AVG(r.score),1) AS rata, COUNT(*) AS n
         FROM ratings r JOIN products p ON p.id = r.product_id
         WHERE p.category IN (${tanda}) AND r.is_hidden = 0`
      )
      .get(...kategoriUnit) as any;
  } else {
    toko.jumlah_produk = (
      db
        .prepare("SELECT COUNT(*) AS n FROM products WHERE seller_id = ? AND is_active = 1")
        .get(product.seller_id) as any
    ).n;

    toko.rating_toko = db
      .prepare(
        `SELECT ROUND(AVG(r.score),1) AS rata, COUNT(*) AS n
         FROM ratings r JOIN products p ON p.id = r.product_id
         WHERE p.seller_id = ? AND r.is_hidden = 0`
      )
      .get(product.seller_id) as any;
  }

  toko.jumlah_pengikut = (
    db
      .prepare("SELECT COUNT(*) AS n FROM toko_follow WHERE seller_id = ?")
      .get(product.seller_id) as any
  ).n;

  // ---- Status pengguna (opsional - tidak wajib login) ----
  // Sengaja TIDAK memakai authMiddleware: halaman detail produk harus bisa
  // dibuka tanpa login (pengunjung). Kalau ada cookie sesi, authMiddleware
  // yang lembut (opsional) dipakai untuk mengisi disimpan/diikuti.
  let disimpan = false;
  let diikuti = false;
  try {
    const pengguna: any = (req as any).user;
    if (pengguna?.id) {
      disimpan = Boolean(
        db
          .prepare("SELECT 1 FROM wishlist WHERE user_id = ? AND product_id = ?")
          .get(pengguna.id, id)
      );
      diikuti = Boolean(
        db
          .prepare("SELECT 1 FROM toko_follow WHERE follower_id = ? AND seller_id = ?")
          .get(pengguna.id, product.seller_id)
      );
    }
  } catch {
    // Belum login -> biarkan false. Bukan kesalahan.
  }

  res.json({
    product: {
      ...product,
      // Produk KWU tampil atas nama UNIT, bukan nama staf pembuatnya.
      seller_name: namaPenjual(product),
      unit_slug: KATEGORI_UNIT[product.category] || null,
      images: images.length ? images : product.image_url ? [product.image_url] : [],
    },
    variants,
    ratings,
    rating_ringkas,
    spesifikasi,
    info_penting,
    toko,
    disimpan,
    diikuti,
  });
});

// POST /api/products - siswa (atau staf unit KWU) menambahkan produk.
router.post("/", authMiddleware, defaultLimiter, validate(createProductSchema), (req, res) => {
  const { name, description, price, stock, category, image_urls, harga_asli, spesifikasi, info_penting } = req.body;

  // Produk kategori unit (brital/laundry) hanya boleh dibuat staf unit itu/admin.
  const unitRole = KATEGORI_UNIT[category];
  if (unitRole && ![unitRole, "admin"].includes(req.user!.role)) {
    return res.status(403).json({
      error: "Hanya staf unit KWU terkait yang bisa menambahkan produk untuk kategori ini.",
    });
  }

  const info = db
    .prepare(
      `INSERT INTO products (seller_id, category, name, description, price, stock, image_url, harga_asli, spesifikasi, info_penting)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user!.user_id,
      category,
      name,
      sanitizeText(description || ""),
      price,
      stock,
      image_urls?.[0] || null,
      harga_asli ?? null,
      spesifikasi ? sanitizeText(spesifikasi) : null,
      info_penting ? sanitizeText(info_penting) : null,
    );

  const productId = Number(info.lastInsertRowid);
  if (image_urls?.length) attachImages(productId, image_urls);

  invalidateByPrefix("products:");
  res.status(201).json({ id: productId });
});

// PUT /api/products/:id - hanya pemilik produk (atau admin) yang boleh edit,
// termasuk mengurangi/menambah stok dan mengubah harga.
router.put("/:id", authMiddleware, defaultLimiter, validate(updateProductSchema), (req, res) => {
  const id = Number(req.params.id);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  if (!canManageProduct(product, req.user!.user_id, req.user!.role)) {
    return res.status(403).json({ error: "Kamu tidak punya akses untuk mengelola produk ini." });
  }

  const { image_urls, ...fields } = req.body;
  const setClauses: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(key === "description" ? sanitizeText(String(value)) : typeof value === "boolean" ? (value ? 1 : 0) : value);
  }

  if (setClauses.length > 0) {
    values.push(id);
    db.prepare(`UPDATE products SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  }
  if (image_urls?.length) attachImages(id, image_urls);

  invalidateByPrefix("products:");
  res.json({ message: "Produk diperbarui." });
});

// DELETE /api/products/:id - soft delete (is_active = 0), pemilik SENDIRI atau
// admin. Siswa/kwu_brital bisa hapus jualannya sendiri kapan saja.
router.delete("/:id", authMiddleware, defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  if (!canManageProduct(product, req.user!.user_id, req.user!.role)) {
    return res.status(403).json({ error: "Kamu tidak punya akses untuk mengelola produk ini." });
  }
  db.prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  invalidateByPrefix("products:");
  res.json({ message: "Produk dihapus." });
});

export default router;

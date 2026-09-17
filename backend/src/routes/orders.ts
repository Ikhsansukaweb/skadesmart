import { Router } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import {
  checkoutBritalSchema,
  directOrderSchema,
  updateBritalStatusSchema,
  updateLaundryStatusSchema,
  createLaundryOrderSchema,
  updateLaundryPaymentSchema,
  completeSiswaOrderSchema,
  updateSellerOrderStatusSchema,
} from "../validators/orderValidator";
import {
  beritahuPesananBaru,
  beritahuStatusPesanan,
  kirimNotif,
  mirrorNewOrder,
  mirrorOrderStatus,
} from "../services/pesananLokal";
import { sanitizeText } from "../utils/sanitize";

const router = Router();

const BRITAL_STATUS_LABEL: Record<string, string> = {
  baru: "Pesanan baru",
  diproses: "Sedang diproses",
  diantar: "Sedang diantar",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

const LAUNDRY_STATUS_LABEL: Record<string, string> = {
  dicuci: "Sedang dicuci",
  bisa_diambil: "Bisa diambil",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

// ---------------------------------------------------------------------------
// KWU BRITAL - checkout dari keranjang (multi-item) atau pesan langsung 1 item.
// Semua item dalam satu keranjang harus dari penjual (seller_id) yang sama,
// supaya satu order = satu tujuan dapur/dashboard KWU.
// ---------------------------------------------------------------------------

// POST /api/orders/brital/checkout - checkout SELURUH isi keranjang siswa.
router.post("/brital/checkout", authMiddleware, defaultLimiter, validate(checkoutBritalSchema), async (req, res) => {
  const { note } = req.body;

  const items = db
    .prepare(
      `SELECT c.product_id, c.quantity, c.note AS item_note, p.name, p.price, p.stock, p.seller_id, p.is_active
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?`
    )
    .all(req.user!.user_id) as any[];

  if (items.length === 0) return res.status(400).json({ error: "Keranjang kosong." });

  const inactiveItem = items.find((it) => !it.is_active);
  if (inactiveItem) return res.status(400).json({ error: `Produk "${inactiveItem.name}" sudah tidak tersedia.` });

  const sellerIds = new Set(items.map((it) => it.seller_id));
  if (sellerIds.size > 1) {
    return res.status(400).json({
      error: "Item di keranjang berasal dari penjual berbeda. Checkout terpisah per penjual.",
    });
  }

  const seller = db.prepare("SELECT shop_open FROM users WHERE id = ?").get(items[0].seller_id) as any;
  if (!seller?.shop_open) {
    return res.status(400).json({ error: "Toko sedang tutup, tidak bisa checkout sekarang." });
  }

  for (const it of items) {
    if (it.stock < it.quantity) {
      return res.status(400).json({ error: `Stok "${it.name}" tidak mencukupi.` });
    }
  }

  const sellerId = items[0].seller_id;
  const totalPrice = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const orderInfo = db
    .prepare(
      `INSERT INTO orders (buyer_id, seller_id, kwu_unit, status, note, total_price)
       VALUES (?, ?, 'kwu_brital', 'baru', ?, ?)`
    )
    .run(req.user!.user_id, sellerId, note ? sanitizeText(note) : null, totalPrice);

  const orderId = Number(orderInfo.lastInsertRowid);

  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const decrementStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

  for (const it of items) {
    insertItem.run(orderId, it.product_id, it.name, it.price, it.quantity, it.item_note ? sanitizeText(it.item_note) : null);
    decrementStock.run(it.quantity, it.product_id);
  }

  db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.user!.user_id);

  await mirrorNewOrder("kwu_brital", orderId);

  res.status(201).json({ id: orderId, total_price: totalPrice, status: "baru" });
});

// POST /api/orders/brital/direct - "Pesan Langsung" 1 produk tanpa lewat keranjang.
router.post("/brital/direct", authMiddleware, defaultLimiter, validate(directOrderSchema), async (req, res) => {
  const { product_id, quantity, note } = req.body;

  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND is_active = 1 AND category IN ('brital','kwu_brital')")
    .get(product_id) as any;

  if (!product) return res.status(404).json({ error: "Produk tidak ditemukan." });
  if (product.stock < quantity) return res.status(400).json({ error: "Stok tidak mencukupi." });

  const seller = db.prepare("SELECT shop_open FROM users WHERE id = ?").get(product.seller_id) as any;
  if (!seller?.shop_open) {
    return res.status(400).json({ error: "Toko sedang tutup, tidak bisa memesan sekarang." });
  }

  const totalPrice = product.price * quantity;

  const orderInfo = db
    .prepare(
      `INSERT INTO orders (buyer_id, seller_id, kwu_unit, status, note, total_price)
       VALUES (?, ?, 'kwu_brital', 'baru', ?, ?)`
    )
    .run(req.user!.user_id, product.seller_id, note ? sanitizeText(note) : null, totalPrice);

  const orderId = Number(orderInfo.lastInsertRowid);

  db.prepare(
    `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
     VALUES (?, ?, ?, ?, ?)`
  ).run(orderId, product.id, product.name, product.price, quantity);

  db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(quantity, product.id);

  await mirrorNewOrder("kwu_brital", orderId);

  res.status(201).json({ id: orderId, total_price: totalPrice, status: "baru" });
});

// PUT /api/orders/:id/brital-status - hanya penjual KWU Brital pemilik order.
// Saat status berubah ke 'diantar', siswa dapat notifikasi berisi total harga
// yang harus disiapkan (COD - bayar saat pesanan sampai).
router.put(
  "/:id/brital-status",
  authMiddleware,
  requireRole(["kwu_brital", "admin"]),
  defaultLimiter,
  validate(updateBritalStatusSchema),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      const order = db.prepare("SELECT * FROM orders WHERE id = ? AND kwu_unit = 'kwu_brital'").get(id) as any;
      if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
      // Akses berbasis ROLE (bukan seller_id tertentu) - siapa pun staf yang
      // sedang bertugas kwu_brital hari ini boleh proses pesanan ini.

      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      await mirrorOrderStatus(id, { buyerId: order.buyer_id, sellerId: order.seller_id, status });

      // Notifikasi lokal (Web Push) - menggantikan FCM. Teks untuk "diantar"
        // dibuat khusus karena pembeli perlu tahu harus menyiapkan uang.
        const buyer = db.prepare("SELECT notif_enabled FROM users WHERE id = ?").get(order.buyer_id) as any;
        if (buyer?.notif_enabled) {
          const body =
            status === "diantar"
              ? `Pesananmu sedang diantar. Siapkan uang ${rupiah(order.total_price)} untuk membayar pesananmu.`
              : `Status pesananmu sekarang: ${BRITAL_STATUS_LABEL[status] || status}`;
          await kirimNotif(order.buyer_id, "Status pesanan diperbarui", body, "/orders/status");
        }

      res.json({ message: "Status pesanan diperbarui.", status });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// KWU LAUNDRY - dibuat LANGSUNG oleh staf (siswa datang fisik ke tempat),
// bukan siswa yang order dari aplikasi.
// ---------------------------------------------------------------------------

// POST /api/orders/laundry - staf input pesanan atas nama siswa (cari via NISN).
router.post(
  "/laundry",
  authMiddleware,
  requireRole(["kwu_laundry", "admin"]),
  defaultLimiter,
  validate(createLaundryOrderSchema),
  async (req, res, next) => {
    try {
      const { buyer_nisn, quantity, weight_kg, total_price, payment_status, note } = req.body;

      const buyer = db.prepare("SELECT id, fcm_token, notif_enabled FROM users WHERE nisn = ?").get(buyer_nisn) as any;
      if (!buyer) {
        return res.status(404).json({ error: "Siswa dengan NISN tersebut belum terdaftar. Minta siswa login dulu sekali." });
      }

      // Order laundry langsung berstatus 'dicuci' karena baju sudah diserahkan
      // fisik saat staf menginput data ini (tidak ada tahap "baru" menunggu).
      const info = db
        .prepare(
          `INSERT INTO orders (buyer_id, seller_id, kwu_unit, status, payment_status, note, quantity, weight_kg, total_price)
           VALUES (?, ?, 'kwu_laundry', 'dicuci', ?, ?, ?, ?, ?)`
        )
        .run(
          buyer.id,
          req.user!.user_id,
          payment_status,
          note ? sanitizeText(note) : null,
          quantity ?? null,
          weight_kg ?? null,
          total_price
        );

      const orderId = Number(info.lastInsertRowid);
      await mirrorOrderStatus(orderId, { buyerId: buyer.id, sellerId: req.user!.user_id, status: "dicuci", kwuUnit: "kwu_laundry" });

      if (buyer.notif_enabled) {
        await kirimNotif(
          buyer.id,
          "Pesanan laundry diterima",
          `Laundry-mu${quantity ? ` (${quantity} potong)` : ""} sedang dicuci. Total: ${rupiah(total_price)}.`,
          "/orders/status"
        );
      }

      res.status(201).json({ id: orderId, status: "dicuci" });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/orders/:id/laundry-status
router.put(
  "/:id/laundry-status",
  authMiddleware,
  requireRole(["kwu_laundry", "admin"]),
  defaultLimiter,
  validate(updateLaundryStatusSchema),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      const order = db.prepare("SELECT * FROM orders WHERE id = ? AND kwu_unit = 'kwu_laundry'").get(id) as any;
      if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
      // Akses berbasis ROLE, bukan seller_id tertentu (lihat komentar di
      // handler brital-status di atas).

      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      await mirrorOrderStatus(id, { buyerId: order.buyer_id, sellerId: order.seller_id, status });

      const buyer = db.prepare("SELECT notif_enabled FROM users WHERE id = ?").get(order.buyer_id) as any;
      if (buyer?.notif_enabled) {
        await kirimNotif(
          order.buyer_id,
          "Status laundry diperbarui",
          `Laundry-mu sekarang: ${LAUNDRY_STATUS_LABEL[status] || status}`,
          "/orders/status"
        );
      }

      res.json({ message: "Status laundry diperbarui.", status });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/orders/:id/payment - tandai lunas/belum (khusus laundry).
router.put(
  "/:id/payment",
  authMiddleware,
  requireRole(["kwu_laundry", "admin"]),
  defaultLimiter,
  validate(updateLaundryPaymentSchema),
  (req, res) => {
    const id = Number(req.params.id);
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND kwu_unit = 'kwu_laundry'").get(id) as any;
    if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
    // Akses berbasis ROLE, bukan seller_id tertentu.
    db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(
      req.body.payment_status,
      id
    );
    res.json({ message: "Status pembayaran diperbarui." });
  }
);

// ---------------------------------------------------------------------------
// Umum (kedua unit)
// ---------------------------------------------------------------------------

// GET /api/orders/mine - riwayat pesanan siswa (sebagai pembeli), termasuk item brital.
router.get("/mine", authMiddleware, readLimiter, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.full_name AS seller_name, u.id AS seller_id
       FROM orders o JOIN users u ON u.id = o.seller_id
       WHERE o.buyer_id = ? ORDER BY o.created_at DESC`
    )
    .all(req.user!.user_id) as any[];

  const itemsStmt = db.prepare(
    `SELECT oi.product_id, oi.product_name, oi.unit_price, oi.quantity, oi.note, p.image_url
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  );
  const withItems = orders.map((o) => ({
    ...o,
    items: o.kwu_unit === "kwu_brital" ? itemsStmt.all(o.id) : [],
  }));

  res.json({ orders: withItems });
});

// GET /api/orders/incoming - dashboard KWU: SEMUA pesanan milik unit sesuai
// role staf yang login (bukan cuma yang dia sendiri terima) - staf bergantian
// tiap hari jadi siapa pun dengan role yang cocok harus bisa lihat & proses.
router.get("/incoming", authMiddleware, requireRole(["kwu_brital", "kwu_laundry", "admin"]), readLimiter, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.full_name AS buyer_name, u.class_name AS buyer_class, u.nisn AS buyer_nisn
       FROM orders o JOIN users u ON u.id = o.buyer_id
       WHERE o.kwu_unit = ? ORDER BY o.created_at DESC`
    )
    .all(req.user!.role) as any[];

  const itemsStmt = db.prepare("SELECT product_id, product_name, unit_price, quantity, note FROM order_items WHERE order_id = ?");
  const withItems = orders.map((o) => ({
    ...o,
    items: o.kwu_unit === "kwu_brital" ? itemsStmt.all(o.id) : [],
  }));

  res.json({ orders: withItems });
});

// GET /api/orders/stats - jumlah pesanan SELESAI per hari (7 hari terakhir)
// untuk SELURUH unit (bukan cuma staf tertentu), dipakai chart dashboard KWU.
router.get("/stats", authMiddleware, requireRole(["kwu_brital", "kwu_laundry", "admin"]), readLimiter, (req, res) => {
  const rows = db
    .prepare(
      `SELECT date(updated_at) AS day, COUNT(*) AS count, COALESCE(SUM(total_price),0) AS revenue
       FROM orders
       WHERE kwu_unit = ? AND status = 'selesai' AND date(updated_at) >= date('now', '-6 days')
       GROUP BY date(updated_at)`
    )
    .all(req.user!.role) as { day: string; count: number; revenue: number }[];

  // Lengkapi 7 hari terakhir walau tidak ada transaksi (supaya chart tidak bolong).
  const days: { day: string; count: number; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = rows.find((r) => r.day === key);
    days.push({ day: key, count: found?.count || 0, revenue: found?.revenue || 0 });
  }

  res.json({ days });
});

// DELETE /api/orders/:id - "Hapus Riwayat": hanya untuk pesanan yang sudah
// selesai/dibatalkan, oleh penjual pemilik pesanan atau admin. Mencegah
// riwayat pesanan aktif terhapus tidak sengaja.
router.delete("/:id", authMiddleware, requireRole(["kwu_brital", "kwu_laundry", "admin"]), defaultLimiter, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (req.user!.role !== "admin" && order.kwu_unit !== req.user!.role) {
    return res.status(403).json({ error: "Pesanan ini bukan milik unitmu." });
  }
  if (!["selesai", "dibatalkan"].includes(order.status)) {
    return res.status(400).json({ error: "Hanya pesanan selesai/dibatalkan yang bisa dihapus dari riwayat." });
  }
  db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  res.json({ message: "Riwayat pesanan dihapus." });
});

// ---------------------------------------------------------------------------
// JUALAN SISWA (informal) - tidak ada checkout formal di app (nego lewat
// chat), jadi penjual sendiri yang menandai transaksi selesai supaya pembeli
// bisa dikirimi kartu rating. Order langsung berstatus 'selesai'.
// ---------------------------------------------------------------------------

// POST /api/orders/siswa/complete
router.post(
  "/siswa/complete",
  authMiddleware,
  defaultLimiter,
  validate(completeSiswaOrderSchema),
  (req, res) => {
    const { buyer_id, product_id, price } = req.body;

    if (buyer_id === req.user!.user_id) {
      return res.status(400).json({ error: "Tidak bisa membuat transaksi dengan diri sendiri." });
    }

    if (product_id) {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id) as any;
      // Produk siswa = kategori non-unit (minuman/makanan/jasa/barang) atau 'siswa' lama.
      const kategoriSiswa = ["minuman", "makanan", "jasa", "barang", "siswa"];
      if (!product || product.seller_id !== req.user!.user_id || !kategoriSiswa.includes(product.category)) {
        return res.status(403).json({ error: "Produk tidak valid atau bukan milikmu." });
      }
    }

    const info = db
      .prepare(
        `INSERT INTO orders (buyer_id, seller_id, kwu_unit, status, payment_status, total_price)
         VALUES (?, ?, 'siswa', 'selesai', 'sudah_bayar', ?)`
      )
      .run(buyer_id, req.user!.user_id, price);

    const orderId = Number(info.lastInsertRowid);

    if (product_id) {
      db.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
         SELECT ?, id, name, ?, 1 FROM products WHERE id = ?`
      ).run(orderId, price, product_id);
    }

    res.status(201).json({ id: orderId });
  }
);

// ---------------------------------------------------------------------------
// DASHBOARD SELLER SISWA - pesanan masuk ke penjual, update status, statistik
// pendapatan. Penjual siswa jualan kategori minuman/makanan/jasa/barang.
// ---------------------------------------------------------------------------

const SELLER_STATUS_LABEL: Record<string, string> = {
  baru: "Pesanan baru",
  diproses: "Sedang diproses",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

// GET /api/orders/sold - pesanan masuk sebagai PENJUAL (siswa yang jualan).
// Mengembalikan semua order di mana seller_id = user login, beserta itemnya.
router.get("/sold", authMiddleware, readLimiter, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.full_name AS buyer_name, u.class_name AS buyer_class, u.nisn AS buyer_nisn
       FROM orders o JOIN users u ON u.id = o.buyer_id
       WHERE o.seller_id = ? ORDER BY o.created_at DESC`
    )
    .all(req.user!.user_id) as any[];

  const itemsStmt = db.prepare(
    `SELECT oi.product_id, oi.product_name, oi.unit_price, oi.quantity, oi.note
     FROM order_items oi WHERE oi.order_id = ?`
  );
  const withItems = orders.map((o) => ({
    ...o,
    items: itemsStmt.all(o.id),
  }));

  res.json({ orders: withItems });
});

// PUT /api/orders/:id/seller-status - seller siswa update status pesanan
// miliknya. Hanya pemilik (seller_id = user login) yang boleh.
router.put(
  "/:id/seller-status",
  authMiddleware,
  defaultLimiter,
  validate(updateSellerOrderStatusSchema),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
      if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
      if (order.seller_id !== req.user!.user_id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Pesanan ini bukan milikmu." });
      }

      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      await mirrorOrderStatus(id, { buyerId: order.buyer_id, sellerId: order.seller_id, status });

      // Notifikasi ke pembeli
      const buyer = db.prepare("SELECT notif_enabled FROM users WHERE id = ?").get(order.buyer_id) as any;
      if (buyer?.notif_enabled) {
        await kirimNotif(
          order.buyer_id,
          "Status pesanan diperbarui",
          `Status pesananmu sekarang: ${SELLER_STATUS_LABEL[status] || status}`,
          "/orders/status"
        );
      }

      res.json({ message: "Status pesanan diperbarui.", status });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/orders/seller-stats - ringkasan pendapatan + statistik 7 hari
// terakhir untuk dashboard seller siswa.
router.get("/seller-stats", authMiddleware, readLimiter, (req, res) => {
  const sellerId = req.user!.user_id;

  // Ringkasan total
  const ringkas = db
    .prepare(
      `SELECT
         COUNT(*) AS total_pesanan,
         COALESCE(SUM(CASE WHEN status = 'selesai' THEN total_price ELSE 0 END), 0) AS total_pendapatan,
         COUNT(CASE WHEN status IN ('baru','diproses') THEN 1 END) AS pesanan_aktif,
         COUNT(CASE WHEN status = 'selesai' THEN 1 END) AS pesanan_selesai
       FROM orders WHERE seller_id = ?`
    )
    .get(sellerId) as any;

  // Statistik 7 hari terakhir (pesanan selesai per hari)
  const rows = db
    .prepare(
      `SELECT date(created_at) AS day,
              COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN status = 'selesai' THEN total_price ELSE 0 END), 0) AS revenue
       FROM orders
       WHERE seller_id = ? AND date(created_at) >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all(sellerId) as { day: string; count: number; revenue: number }[];

  // Lengkapi 7 hari walau tidak ada transaksi
  const days: { day: string; count: number; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = rows.find((r) => r.day === key);
    days.push({ day: key, count: found?.count || 0, revenue: found?.revenue || 0 });
  }

  // Produk terlaris (top 5 berdasarkan jumlah terjual dari order_items seller)
  const terlaris = db
    .prepare(
      `SELECT oi.product_id, oi.product_name,
              SUM(oi.quantity) AS terjual,
              SUM(oi.quantity * oi.unit_price) AS pendapatan
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.seller_id = ? AND o.status = 'selesai'
       GROUP BY oi.product_id
       ORDER BY terjual DESC
       LIMIT 5`
    )
    .all(sellerId) as any[];

  res.json({
    ringkas: {
      total_pesanan: ringkas?.total_pesanan || 0,
      total_pendapatan: ringkas?.total_pendapatan || 0,
      pesanan_aktif: ringkas?.pesanan_aktif || 0,
      pesanan_selesai: ringkas?.pesanan_selesai || 0,
    },
    days,
    terlaris,
  });
});

export default router;

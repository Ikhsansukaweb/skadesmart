import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../db";
import { authMiddleware } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import { defaultLimiter, readLimiter } from "../middleware/rateLimiter";
import { createChatSchema, notifyChatMessageSchema } from "../validators/chatValidator";
import {
  jumlahBelumDibaca,
  kirimPesanChat,
  kirimPesanSistem,
  pesanChat,
  tandaiSudahDibaca,
  totalBelumDibaca,
} from "../services/chatLokal";
import { sanitizeText } from "../utils/sanitize";
import { askCsAi } from "../services/aiChat";
import { buatUrlAman } from "../utils/urlAman";
import {
  hapusLangganan,
  kunciPublik,
  simpanLangganan,
} from "../services/webPush";

const router = Router();

const muteSchema = z.object({ muted: z.boolean() }).strict();

const UNIT_NAME: Record<string, string> = {
  kwu_brital: "Ayam Geprek Brital",
  kwu_laundry: "Laundry",
};

// Cooldown 2 detik per chat sebelum AI CS boleh dipanggil lagi, supaya siswa
// tidak bisa spam request ke AI gateway.
const lastAiTriggerAt = new Map<string, number>();
const AI_COOLDOWN_MS = 2000;

function isKwuRole(role: string): role is "kwu_brital" | "kwu_laundry" {
  return role === "kwu_brital" || role === "kwu_laundry";
}

// Cek apakah user berhak akses baris chat tertentu: partisipan langsung
// (buyer/seller individu), ATAU staf dengan role yang cocok kalau chat ini
// milik unit KWU (bukan individu). Admin & CS ikut boleh membalas chat KWU.
function canAccessChat(chat: any, userId: number, role: string): boolean {
  if (chat.buyer_id === userId || chat.seller_id === userId) return true;
  if (chat.unit_slug && (chat.unit_slug === role || role === "admin" || role === "cs")) return true;
  return false;
}

// POST /api/chats - buat/ambil chat room. Dua mode:
//  1) seller_id diisi -> chat 1:1 biasa (jualan siswa, chat ke profil orang).
//     SATU chat room per PASANGAN orang (dicek dua arah), bukan per produk.
//  2) unit_slug diisi -> chat MILIK UNIT KWU. SATU chat room per (siswa, unit),
//     dibalas siapa pun staf yang sedang punya role itu.
router.post("/", authMiddleware, defaultLimiter, validate(createChatSchema), async (req, res) => {
  const { seller_id, unit_slug, product_id } = req.body;
  const myId = req.user!.user_id;

  if (unit_slug) {
    const existing = db
      .prepare("SELECT * FROM chats WHERE buyer_id = ? AND unit_slug = ?")
      .get(myId, unit_slug) as any;

    if (existing) {
      if (!existing.product_id && product_id) {
        db.prepare("UPDATE chats SET product_id = ? WHERE id = ?").run(product_id, existing.id);
        existing.product_id = product_id;
      }
      return res.json({ chat: existing });
    }

    const chatId = crypto.randomUUID();
    // tipe='kwu': SATU ruang per (siswa, unit), dibalas siapa pun staf unit itu.
    db.prepare(
      `INSERT INTO chats (id, buyer_id, unit_slug, product_id, tipe) VALUES (?, ?, ?, ?, 'kwu')`
    ).run(chatId, myId, unit_slug, product_id || null);
    const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId);
    return res.status(201).json({ chat });
  }

  // Mode 1:1 biasa
  if (seller_id === myId) {
    return res.status(400).json({ error: "Tidak bisa membuat chat dengan diri sendiri." });
  }

  const existing = db
    .prepare(
      `SELECT * FROM chats
       WHERE (buyer_id = ? AND seller_id = ?) OR (buyer_id = ? AND seller_id = ?)`
    )
    .get(myId, seller_id, seller_id, myId) as any;

  if (existing) {
    if (!existing.product_id && product_id) {
      db.prepare("UPDATE chats SET product_id = ? WHERE id = ?").run(product_id, existing.id);
      existing.product_id = product_id;
    }
    return res.json({ chat: existing });
  }

  // tipe='cs' bila lawan bicaranya akun CS, selain itu 'pribadi'.
  const lawanRole = (db.prepare("SELECT role FROM users WHERE id = ?").get(seller_id) as any)?.role;
  const tipe = lawanRole === "cs" ? "cs" : "pribadi";

  const chatId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO chats (id, buyer_id, seller_id, product_id, tipe) VALUES (?, ?, ?, ?, ?)`
  ).run(chatId, myId, seller_id, product_id || null, tipe);

  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId);
  res.status(201).json({ chat });
});

// GET /api/chats - daftar chat milik user: partisipan langsung + (kalau role
// kwu_brital/kwu_laundry) semua chat milik unit itu juga.
//
// PENTING: chat KWU (kolom unit_slug terisi) SENGAJA tidak dimasukkan ke daftar
// ini untuk staf KWU. Chat unit hanya dikelola lewat halaman /dashboard/<unit>/chat.
// Kalau ikut dimasukkan, chat unit muncul dua kali (di chat pribadi DAN di
// dashboard) sehingga membingungkan.
router.get("/", authMiddleware, readLimiter, (req, res) => {
  const myId = req.user!.user_id;
  const myRole = req.user!.role;

  let rows: any[];
  if (isKwuRole(myRole)) {
    // Staf KWU: chat PRIBADI miliknya saja di sini.
    // (Chat unit lihat di dashboard unit; pesan dari unit lain tidak terlihat
    //  di sini supaya fokus dashboard tetap jelas.)
    rows = db
      .prepare(
        `SELECT c.*,
                CASE WHEN c.buyer_id = ? THEN us.full_name ELSE ub.full_name END AS other_name,
                CASE WHEN c.buyer_id = ? THEN us.id ELSE ub.id END AS other_id,
                CASE WHEN c.buyer_id = ? THEN us.profile_photo_url ELSE ub.profile_photo_url END AS other_photo
         FROM chats c
         JOIN users ub ON ub.id = c.buyer_id
         LEFT JOIN users us ON us.id = c.seller_id
         WHERE (c.buyer_id = ? OR c.seller_id = ?) AND c.unit_slug IS NULL
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
      )
      .all(myId, myId, myId, myId, myId) as any[];
  } else if (myRole === "admin" || myRole === "cs") {
    // Admin & CS: lihat chat sendiri + SEMUA chat KWU (untuk membantu membalas).
    // Chat KWU hanya muncul di sini lewat "chat unit", bukan sebagai chat pribadi.
    rows = db
      .prepare(
        `SELECT c.*,
                CASE WHEN c.buyer_id = ? THEN us.full_name ELSE ub.full_name END AS other_name,
                CASE WHEN c.buyer_id = ? THEN us.id ELSE ub.id END AS other_id,
                CASE WHEN c.buyer_id = ? THEN us.profile_photo_url ELSE ub.profile_photo_url END AS other_photo
         FROM chats c
         JOIN users ub ON ub.id = c.buyer_id
         LEFT JOIN users us ON us.id = c.seller_id
         WHERE c.buyer_id = ? OR c.seller_id = ? OR c.unit_slug IS NOT NULL
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
      )
      .all(myId, myId, myId, myId, myId) as any[];
  } else {
    // Siswa: chat pribadi + chat unit yang dia mulai sendiri (sebagai pembeli).
    // Chat unit tetap muncul di sini untuk pembeli karena merekalah yang perlu
    // melihat balasan unit; halaman chat biasa adalah satu-satunya tempat bagi
    // siswa untuk membacanya.
    rows = db
      .prepare(
        `SELECT c.*,
                CASE WHEN c.buyer_id = ? THEN us.full_name ELSE ub.full_name END AS other_name,
                CASE WHEN c.buyer_id = ? THEN us.id ELSE ub.id END AS other_id,
                CASE WHEN c.buyer_id = ? THEN us.profile_photo_url ELSE ub.profile_photo_url END AS other_photo
         FROM chats c
         JOIN users ub ON ub.id = c.buyer_id
         LEFT JOIN users us ON us.id = c.seller_id
         WHERE c.buyer_id = ? OR c.seller_id = ?
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
      )
      .all(myId, myId, myId, myId, myId) as any[];
  }

  // Untuk chat unit (seller_id NULL): kalau AKU siswa (buyer), lawan bicara
  // ditampilkan sebagai NAMA UNIT (bukan staf tertentu, karena bisa siapa
  // saja yang balas). Kalau AKU staf unit itu, lawan bicara ya si pembeli.
  const result = rows.map((r) => {
    if (r.unit_slug && r.buyer_id === myId) {
      return { ...r, other_id: null, other_name: UNIT_NAME[r.unit_slug] || r.unit_slug, other_photo: null, is_unit: true };
    }
    return { ...r, is_unit: false };
  });

  res.json({ chats: result });
});

/**
 * GET /api/chats/unit/:slug - SEMUA chat milik satu unit KWU.
 *
 * Dipakai halaman /dashboard/<unit>/chat. Berbeda dari GET /chats (yang hanya
 * mengembalikan chat pribadi staf), endpoint ini mengembalikan SETIAP percakapan
 * unit itu dari semua pembeli - jadi staf mana pun yang sedang bertugas bisa
 * melihat dan membalas seluruh antrean, bukan cuma chat yang dia mulai sendiri.
 *
 * Hanya boleh diakses oleh staf unit yang bersangkutan (plus admin & CS).
 */
router.get("/unit/:slug", authMiddleware, readLimiter, (req, res) => {
  const slug = String(req.params.slug);
  const myRole = req.user!.role;

  if (slug !== "kwu_brital" && slug !== "kwu_laundry") {
    return res.status(400).json({ error: "Unit tidak dikenal." });
  }
  // Staf unit yang bersangkutan, atau admin/CS yang memang boleh membantu.
  if (myRole !== slug && myRole !== "admin" && myRole !== "cs") {
    return res.status(403).json({ error: "Kamu bukan staf unit ini." });
  }

  const rows = db
    .prepare(
      `SELECT c.*,
              ub.full_name AS other_name,
              ub.id AS other_id,
              ub.profile_photo_url AS other_photo
       FROM chats c
       JOIN users ub ON ub.id = c.buyer_id
       WHERE c.unit_slug = ?
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(slug) as any[];

  // Lawan bicara bagi staf unit selalu PEMBELI (bukan nama unit).
  const result = rows.map((r) => ({ ...r, is_unit: false }));
  res.json({ chats: result });
});

// ---------------------------------------------------------------------------
// PENTING: rute dengan path TETAP harus didaftarkan SEBELUM "/:id".
// Express mencocokkan rute sesuai urutan pendaftaran, jadi "/:id" akan
// menangkap "/belum-dibaca" sebagai id chat kalau ditaruh lebih dulu.
// ---------------------------------------------------------------------------

/** GET /api/chats/belum-dibaca - total pesan belum dibaca (untuk lencana). */
router.get("/belum-dibaca", authMiddleware, readLimiter, (req, res) => {
  res.json({ total: totalBelumDibaca(req.user!.user_id, req.user!.role) });
});

// GET /api/chats/:id - metadata satu chat + profil lawan bicara + info produk.
router.get("/:id", authMiddleware, readLimiter, (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(req.params.id) as any;
  if (!chat) return res.status(404).json({ error: "Chat tidak ditemukan." });
  if (!canAccessChat(chat, req.user!.user_id, req.user!.role)) {
    return res.status(403).json({ error: "Kamu bukan partisipan chat ini." });
  }

  let other: any;
  if (chat.unit_slug && chat.buyer_id === req.user!.user_id) {
    other = { id: null, full_name: UNIT_NAME[chat.unit_slug] || chat.unit_slug, profile_photo_url: null, role: chat.unit_slug, is_unit: true };
  } else if (chat.unit_slug) {
    // Aku staf unit ini, lawan bicara = pembeli.
    other = db.prepare("SELECT id, full_name, profile_photo_url, role FROM users WHERE id = ?").get(chat.buyer_id);
    other = { ...other, is_unit: false };
  } else {
    const otherId = chat.buyer_id === req.user!.user_id ? chat.seller_id : chat.buyer_id;
    other = db.prepare("SELECT id, full_name, profile_photo_url, role FROM users WHERE id = ?").get(otherId);
    other = { ...other, is_unit: false };
  }

  const product = chat.product_id
    ? db.prepare("SELECT id, name, price, category, seller_id FROM products WHERE id = ?").get(chat.product_id)
    : null;

  res.json({ chat, other, product });
});

// PUT /api/chats/:id/mute
router.put("/:id/mute", authMiddleware, defaultLimiter, validate(muteSchema), (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(req.params.id) as any;
  if (!chat) return res.status(404).json({ error: "Chat tidak ditemukan." });
  if (!canAccessChat(chat, req.user!.user_id, req.user!.role)) {
    return res.status(403).json({ error: "Kamu bukan partisipan chat ini." });
  }
  const column = chat.buyer_id === req.user!.user_id ? "muted_by_buyer" : "muted_by_seller";
  db.prepare(`UPDATE chats SET ${column} = ? WHERE id = ?`).run(req.body.muted ? 1 : 0, req.params.id);
  res.json({ message: "Status senyapkan diperbarui." });
});

// DELETE /api/chats/:id
router.delete("/:id", authMiddleware, defaultLimiter, async (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(req.params.id) as any;
  if (chat) {
    if (!canAccessChat(chat, req.user!.user_id, req.user!.role)) {
      return res.status(403).json({ error: "Kamu bukan partisipan chat ini." });
    }
    db.prepare("DELETE FROM chats WHERE id = ?").run(req.params.id);
  }
  res.json({ message: "Chat dihapus." });
});

// POST /api/chats/notify - update metadata + mirror + push notification +
// (kalau relevan) balasan AI CS.
router.post("/notify", authMiddleware, defaultLimiter, validate(notifyChatMessageSchema), async (req, res, next) => {
  try {
    const { chat_id, text, image_url } = req.body;
    const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chat_id) as any;
    if (!chat) return res.status(404).json({ error: "Chat tidak ditemukan." });
    if (!canAccessChat(chat, req.user!.user_id, req.user!.role)) {
      return res.status(403).json({ error: "Kamu bukan partisipan chat ini." });
    }

    const cleanText = text ? sanitizeText(text) : "";
    const previewText = cleanText || "Mengirim foto";

    // ---------------------------------------------------------------------
    // PENTING: `muted_by_buyer` / `muted_by_seller` adalah setelan SENYAP
    // (mute) notifikasi push — BUKAN izin menerima pesan real-time.
    //
    // JANGAN memakainya untuk memfilter `penerima`. Kalau dipakai, pengguna
    // yang mematikan notifikasi tidak akan pernah menerima pesan lewat
    // WebSocket: pesan baru hanya muncul setelah halaman dimuat ulang.
    // Karena biasanya hanya SATU pihak yang mematikan notifikasi, gejalanya
    // terlihat sebagai "realtime jalan satu arah saja" — persis keluhan yang
    // berulang. Penyaringan mute dilakukan di kirimPesanChat() saat memutuskan
    // kirim notifikasi push atau tidak, bukan di sini.
    // ---------------------------------------------------------------------
    const penerima: number[] = [];
    let judulNotif = "Pesan baru";

    if (chat.unit_slug) {
      if (chat.buyer_id === req.user!.user_id) {
        // Siswa mengirim ke unit -> beri tahu SEMUA staf unit itu.
        // Tidak disaring `muted_by_seller`: pesan tetap harus sampai
        // real-time meski staf mematikan notifikasi.
        const staff = db.prepare("SELECT id FROM users WHERE role = ?").all(chat.unit_slug) as any[];
        const sender = db
          .prepare("SELECT full_name FROM users WHERE id = ?")
          .get(req.user!.user_id) as any;
        judulNotif = `Pesan baru dari ${sender?.full_name || "siswa"}`;
        for (const s of staff) {
          // Pengirim tidak perlu menerima pesannya sendiri.
          if (Number(s.id) !== req.user!.user_id) penerima.push(Number(s.id));
        }
      } else {
        // Staf membalas -> beri tahu siswa pembeli.
        judulNotif = `Balasan dari ${UNIT_NAME[chat.unit_slug] || chat.unit_slug}`;
        const buyer = db.prepare("SELECT id FROM users WHERE id = ?").get(chat.buyer_id) as any;
        if (buyer && Number(buyer.id) !== req.user!.user_id) penerima.push(Number(buyer.id));
      }
    } else {
      const recipientId = chat.buyer_id === req.user!.user_id ? chat.seller_id : chat.buyer_id;
      const sender = db
        .prepare("SELECT full_name FROM users WHERE id = ?")
        .get(req.user!.user_id) as any;
      judulNotif = `Pesan baru dari ${sender?.full_name || "pengguna"}`;
      if (recipientId && Number(recipientId) !== req.user!.user_id) {
        penerima.push(Number(recipientId));
      }
    }

    // Simpan pesan (SQLite), sebarkan real-time (WebSocket), dan kirim
    // notifikasi push (Web Push) — semuanya tanpa Firebase.
    const hasil = await kirimPesanChat({
      chat,
      pengirimId: req.user!.user_id,
      isi: previewText,
      penerima,
      judulNotif,
      unitNama: UNIT_NAME,
      // WAJIB diteruskan - tanpa ini foto yang di-upload tidak pernah
      // tersimpan dan di layar hanya muncul kotak putih.
      imageUrl: image_url ?? null,
      // Peran pengirim disimpan supaya tag "-nama" chat KWU bisa dirender
      // otomatis (bagian 1.1).
      pengirimPeran: req.user!.role,
    });

    // Sertakan hasil penyebaran supaya frontend bisa menampilkan status
    // "terkirim" dan halaman uji bisa memverifikasi.
    res.json({
      ok: true,
      pesan: hasil.pesan,
      terkirimWs: hasil.terkirimWs,
      terkirimPush: hasil.terkirimPush,
    });

    // --- AI CS Bot (chat 1:1 ke akun role 'cs' saja, bukan chat unit) ---
    if (!chat.unit_slug) {
      const buyerRole = (db.prepare("SELECT role FROM users WHERE id = ?").get(chat.buyer_id) as any)?.role;
      const sellerRole = chat.seller_id
        ? (db.prepare("SELECT role FROM users WHERE id = ?").get(chat.seller_id) as any)?.role
        : null;
      const csUserId = buyerRole === "cs" ? chat.buyer_id : sellerRole === "cs" ? chat.seller_id : null;
      const iAmTheCsAccount = csUserId === req.user!.user_id;

      if (csUserId && !iAmTheCsAccount && chat.cs_mode === "ai" && cleanText) {
        if (cleanText.trim() === "1") {
          db.prepare("UPDATE chats SET cs_mode = 'human' WHERE id = ?").run(chat_id);
          await kirimPesanSistem(
            chat_id,
            csUserId,
            "Oke, kamu sekarang terhubung dengan tim CS manusia kami. Mohon tunggu balasan ya.",
            { isAi: true, penerima: [req.user!.user_id, ...penerima] }
          );
        } else {
          const lastTrigger = lastAiTriggerAt.get(chat_id) || 0;
          if (Date.now() - lastTrigger >= AI_COOLDOWN_MS) {
            lastAiTriggerAt.set(chat_id, Date.now());
            askCsAi(cleanText)
              .then((reply) =>
                kirimPesanSistem(chat_id, csUserId, reply, {
                  isAi: true,
                  penerima: [req.user!.user_id, ...penerima],
                }),
              )
              .catch((err) => console.error("[chat] Gagal membalas via AI CS:", err));
          }
        }
      }
    }

    // Balasan sudah dikirim di atas (berisi pesan + jumlah pengiriman).
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// Pesan chat - pengganti Firestore chats/{chatId}/messages
// ===========================================================================

/**
 * GET /api/chats/:id/pesan - ambil riwayat pesan.
 *
 * Sekaligus menandai pesan sebagai sudah dibaca, karena membuka daftar pesan
 * berarti pengguna sudah melihatnya.
 */
router.get("/:id/pesan", authMiddleware, readLimiter, (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(req.params.id) as any;
  if (!chat) return res.status(404).json({ error: "Chat tidak ditemukan." });
  if (!canAccessChat(chat, req.user!.user_id, req.user!.role)) {
    return res.status(403).json({ error: "Kamu bukan partisipan chat ini." });
  }

  const sebelum = typeof req.query.sebelum === "string" ? req.query.sebelum : undefined;
  const batas = Number(req.query.batas) || 100;
  const pesan = pesanChat(chat.id, { batas, sebelum });

  // Menandai sudah dibaca hanya kalau ini permintaan halaman terakhir
  // (tanpa `sebelum`), supaya memuat riwayat lama tidak menghapus lencana
  // pesan baru yang belum sempat dilihat.
  if (!sebelum) tandaiSudahDibaca(chat.id, req.user!.user_id);

  res.json({
    pesan,
    jumlahBelumDibaca: jumlahBelumDibaca(chat.id, req.user!.user_id),
  });
});

/**
 * PATCH /api/chats/:id/dibaca - tandai semua pesan sudah dibaca.
 * Dipakai saat pengguna membuka chat, termasuk pesan yang masuk sementara
 * layarnya sedang terbuka.
 */
router.patch("/:id/dibaca", authMiddleware, defaultLimiter, (req, res) => {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(req.params.id) as any;
  if (!chat) return res.status(404).json({ error: "Chat tidak ditemukan." });
  if (!canAccessChat(chat, req.user!.user_id, req.user!.role)) {
    return res.status(403).json({ error: "Kamu bukan partisipan chat ini." });
  }
  const jumlah = tandaiSudahDibaca(chat.id, req.user!.user_id);
  res.json({ ok: true, ditandai: jumlah });
});

// ===========================================================================
// Web Push - pengganti Firebase Cloud Messaging
// ===========================================================================

/** GET /api/chats/push/kunci - kunci publik VAPID untuk frontend. */
router.get("/push/kunci", (_req, res) => {
  const publik = kunciPublik();
  if (!publik) {
    return res.status(503).json({
      error: "Notifikasi push belum disiapkan di server (VAPID belum diset).",
    });
  }
  res.json({ kunci: publik });
});

const pushSchema = z
  .object({
    endpoint: buatUrlAman(1000),
    keys: z.object({
      p256dh: z.string().min(10).max(300),
      auth: z.string().min(4).max(300),
    }),
  })
  .strict();

/** POST /api/chats/push/langganan - daftarkan perangkat ini. */
router.post(
  "/push/langganan",
  authMiddleware,
  defaultLimiter,
  validate(pushSchema),
  (req, res) => {
    const { endpoint, keys } = req.body;
    simpanLangganan(req.user!.user_id, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    res.json({ ok: true });
  }
);

/** DELETE /api/chats/push/langganan - berhenti berlangganan (mis. keluar akun). */
router.delete("/push/langganan", authMiddleware, defaultLimiter, (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (endpoint) hapusLangganan(endpoint);
  res.json({ ok: true });
});

// ===========================================================================
// Permintaan penilaian — pengganti dokumen Firestore `rating_requests`
// ===========================================================================

const ratingSchema = z
  .object({
    dari: z.number().int().positive(),
    ke: z.number().int().positive(),
    order_id: z.union([z.number().int().positive(), z.string().min(1).max(64)]),
  })
  .strict();

/**
 * POST /api/chats/rating — minta pembeli menilai pesanan yang selesai.
 *
 * Membuat (atau memakai ulang) chat 1:1 lalu mengirim pesan sistem berisi
 * ajakan menilai. Pengganti penulisan dokumen ke Firestore.
 */
router.post("/rating", authMiddleware, defaultLimiter, validate(ratingSchema), async (req, res, next) => {
  try {
    const { dari, ke, order_id } = req.body;

    // Hanya boleh meminta atas nama diri sendiri.
    if (dari !== req.user!.user_id) {
      return res.status(403).json({ error: "Tidak boleh meminta penilaian atas nama orang lain." });
    }
    if (dari === ke) {
      return res.status(400).json({ error: "Tidak bisa menilai diri sendiri." });
    }

    const penerima = db.prepare("SELECT id, full_name FROM users WHERE id = ?").get(ke) as any;
    if (!penerima) return res.status(404).json({ error: "Pengguna tujuan tidak ditemukan." });

    // Pakai chat yang sudah ada kalau ada, supaya tidak menumpuk percakapan.
    let chat = db
      .prepare(
        `SELECT * FROM chats
         WHERE (buyer_id = ? AND seller_id = ?) OR (buyer_id = ? AND seller_id = ?)`,
      )
      .get(dari, ke, ke, dari) as any;

    if (!chat) {
      const info = db
        .prepare("INSERT INTO chats (buyer_id, seller_id) VALUES (?, ?)")
        .run(dari, ke);
      chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(info.lastInsertRowid) as any;
    }

    // Pesan sistem: pengirim NULL supaya tidak tampak sebagai pesan pribadi
    // salah satu pihak.
    await kirimPesanSistem(
      chat.id,
      null,
      `Pesanan #${order_id} sudah selesai. Yuk beri penilaian untuk transaksi ini.`,
      {
        isAi: false,
        orderId: String(order_id),
        ajakanMenilai: true,
        // Hanya pembeli & penjual chat ini yang menerimanya.
        penerima: [chat.buyer_id, chat.seller_id].filter(
          (x: number | null): x is number => x != null,
        ),
      },
    );

    res.json({ ok: true, chat_id: chat.id });
  } catch (err) {
    next(err);
  }
});

export default router;

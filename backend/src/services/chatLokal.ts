// Pesan chat + notifikasi — pengganti firebaseAdmin.ts.
//
// Sebelumnya berkas ini memakai Firestore (simpan pesan) dan FCM (kirim
// notifikasi) dari Google. Sekarang semuanya lokal:
//
//   simpan pesan      -> SQLite (tabel chat_messages)
//   kirim real-time   -> WebSocket (services/wsHub)
//   notifikasi push   -> Web Push VAPID (services/webPush)
//
// Nama fungsi sengaja dipertahankan semirip mungkin dengan versi Firebase
// supaya rute-rute yang memanggilnya tidak perlu banyak diubah.

import crypto from "crypto";

import { db } from "../db";
import { hub } from "./wsHub";
import { kirimKeBanyak, kirimKePengguna } from "./webPush";

/**
 * Apakah pengguna ini masih ingin menerima notifikasi PUSH?
 *
 * Dipakai HANYA untuk menyaring notifikasi push. Jangan pernah memakai ini
 * untuk menentukan siapa yang menerima pesan lewat WebSocket: pengguna yang
 * mematikan notifikasi tetap harus melihat pesan baru secara real-time saat
 * aplikasinya sedang dibuka.
 *
 * Ada singgahan singkat supaya tidak menanyakan database berulang kali saat
 * satu pesan disebar ke banyak penerima.
 */
const singgahanPush = new Map<number, { nilai: boolean; sampai: number }>();
const MASA_SINGGAHAN_MS = 10_000;

export function bolehDapatPush(userId: number): boolean {
  const sekarang = Date.now();
  const tersimpan = singgahanPush.get(userId);
  if (tersimpan && tersimpan.sampai > sekarang) return tersimpan.nilai;

  const baris = db
    .prepare("SELECT notif_enabled FROM users WHERE id = ?")
    .get(userId) as { notif_enabled: number } | undefined;

  // Baris tidak ditemukan: jangan blokir, biarkan lapisan push yang memutuskan.
  const nilai = baris ? Boolean(baris.notif_enabled) : true;
  singgahanPush.set(userId, { nilai, sampai: sekarang + MASA_SINGGAHAN_MS });
  return nilai;
}

/** Satu pesan chat seperti yang dikirim ke frontend. */
export type PesanChat = {
  id: string;
  chat_id: string;
  sender_id: number | null;
  jenis: string;
  /** 1 kalau pesan ini dihasilkan Bot CS - dipakai untuk label "Bot". */
  is_ai: number;
  /** Diisi hanya untuk kartu ajakan menilai (menyimpan id pesanan). */
  order_id: string | null;
  /** Tautan foto Catbox; NULL kalau pesan teks biasa. */
  image_url: string | null;
  isi: string;
  created_at: string;
  /** ada di beberapa respons agar cocok dengan bentuk Firestore lama */
  text?: string;
  createdAt?: string;
};

// ---------------------------------------------------------------------------
// Penyimpanan pesan (pengganti Firestore)
// ---------------------------------------------------------------------------

/**
 * Buat id pesan.
 *
 * Memakai format waktu + angka acak supaya pesan tetap berurutan secara
 * leksikografis (dipakai untuk pengurutan) dan tidak bentrok.
 */
function buatIdPesan(): string {
  const waktu = Date.now().toString(36).padStart(9, "0");
  const acak = crypto.randomBytes(6).toString("hex");
  return `${waktu}-${acak}`;
}

/**
 * Ubah baris basis data menjadi bentuk yang dipakai klien.
 *
 * `is_ai` disimpan sebagai angka 0/1 di SQLite, tapi frontend membacanya
 * sebagai boolean `isAi`. `orderId` dipakai kartu ajakan menilai.
 */
function keBentukKlien(p: PesanChat) {
  return {
    ...p,
    text: p.isi,
    createdAt: p.created_at,
    isAi: p.is_ai === 1,
    orderId: p.order_id,
    // Frontend membaca `image_url`; alias `imageUrl` disertakan agar kode
    // versi lama tetap jalan.
    imageUrl: p.image_url,
    // Tag "-nama" pada chat KWU dirender dari pengirim_nama. Diambil dari
    // users.full_name saat pesan disimpan agar tetap ada walau akun diubah.
    pengirimNama: (p as any).pengirim_nama ?? null,
  };
}

/** Simpan satu pesan ke basis data dan kembalikan bentuk lengkapnya. */
export function simpanPesan(input: {
  chat_id: string;
  sender_id: number | null;
  isi: string;
  jenis?: "teks" | "sistem";
  /** true kalau pesan ini dari Bot CS - disimpan agar label "Bot" muncul. */
  isAi?: boolean;
  /** id pesanan untuk kartu ajakan menilai. */
  orderId?: string | number | null;
  /** tautan foto (hasil upload Catbox) yang dikirim bersama pesan ini. */
  imageUrl?: string | null;
  /**
   * Peran pengirim saat pesan dibuat ('kwu_brital'/'kwu_laundry'/dst).
   * Dipakai pada chat KWU: pesan staf disimpan dengan pengirim_id ASLI,
   * sehingga tag "-nama" bisa dirender otomatis dari users.full_name dan
   * staf lain tahu siapa yang sudah menjawab (bagian 1.1).
   */
  pengirimPeran?: string | null;
}): PesanChat {
  const id = buatIdPesan();
  db.prepare(
    `INSERT INTO chat_messages (id, chat_id, sender_id, jenis, is_ai, order_id, image_url, isi, pengirim_peran)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.chat_id,
    input.sender_id,
    input.jenis ?? "teks",
    input.isAi ? 1 : 0,
    input.orderId != null ? String(input.orderId) : null,
    input.imageUrl ?? null,
    input.isi,
    input.pengirimPeran ?? null,
  );

  // Catat juga di tabel chats supaya daftar percakapan bisa diurutkan tanpa
  // harus menyentuh tabel pesan.
  db.prepare(
    `UPDATE chats SET last_message = ?, last_sender_id = ?, last_message_at = datetime('now')
     WHERE id = ?`,
  ).run(input.isi.slice(0, 200), input.sender_id, input.chat_id);

  const baris = db
    .prepare(
      `SELECT m.*, u.full_name AS pengirim_nama, u.role AS pengirim_role
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?`,
    )
    .get(id) as PesanChat;

  // Sertakan alias agar frontend versi lama tetap bisa membaca, plus field
  // tambahan yang dibutuhkan render (label Bot, kartu rating).
  return keBentukKlien(baris);
}

/** Ambil pesan sebuah chat, terlama lebih dulu. */
export function pesanChat(
  chatId: string,
  opsi: { batas?: number; sebelum?: string } = {},
): PesanChat[] {
  const batas = Math.min(Math.max(opsi.batas ?? 100, 1), 500);
  // JOIN users: chat KWU menampilkan tag "-nama" dari pengirim_nama, yang
  // diambil dari users.full_name. Tanpa JOIN, tag itu selalu kosong.
  const pilihKolom = `m.*, u.full_name AS pengirim_nama, u.role AS pengirim_role`;
  const dari = `FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id`;
  let baris: PesanChat[];
  if (opsi.sebelum) {
    baris = db
      .prepare(
        `SELECT ${pilihKolom} ${dari} WHERE m.chat_id = ? AND m.id < ?
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(chatId, opsi.sebelum, batas) as PesanChat[];
  } else {
    baris = db
      .prepare(
        `SELECT ${pilihKolom} ${dari} WHERE m.chat_id = ?
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(chatId, batas) as PesanChat[];
  }
  // Query mengambil dari yang terbaru agar LIMIT tepat; balikkan agar
  // terlama lebih dulu di layar.
  return baris.reverse().map(keBentukKlien);
}

/** Hitung pesan yang belum dibaca untuk seorang pengguna di sebuah chat. */
export function jumlahBelumDibaca(chatId: string, userId: number): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages
       WHERE chat_id = ? AND sudah_dibaca = 0
         AND (sender_id IS NULL OR sender_id != ?)`,
    )
    .get(chatId, userId) as { n: number };
  return r?.n ?? 0;
}

/** Tandai semua pesan di sebuah chat sudah dibaca oleh pengguna ini. */
export function tandaiSudahDibaca(chatId: string, userId: number): number {
  const r = db
    .prepare(
      `UPDATE chat_messages SET sudah_dibaca = 1
       WHERE chat_id = ? AND sudah_dibaca = 0
         AND (sender_id IS NULL OR sender_id != ?)`,
    )
    .run(chatId, userId);
  return r.changes;
}

/**
 * Jumlah pesan belum dibaca di seluruh chat milik pengguna.
 * Dipakai untuk lencana di bilah navigasi.
 */
export function totalBelumDibaca(userId: number, role: string): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM chat_messages m
       JOIN chats c ON c.id = m.chat_id
       WHERE m.sudah_dibaca = 0
         AND (m.sender_id IS NULL OR m.sender_id != ?)
         AND (c.buyer_id = ? OR c.seller_id = ? OR c.unit_slug = ?)`,
    )
    .get(userId, userId, userId, role) as { n: number };
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Kirim pesan + sebar luaskan
// ---------------------------------------------------------------------------

export type HasilKirim = {
  pesan: PesanChat;
  /** berapa koneksi WebSocket yang menerima */
  terkirimWs: number;
  /** berapa perangkat yang menerima notifikasi push */
  terkirimPush: number;
  /** apakah penerima sedang membuka chat ini (jadi tidak perlu dibunyikan) */
  sedangDibuka: boolean;
};

/**
 * Simpan pesan lalu sebar ke WebSocket dan notifikasi push.
 *
 * Ini pengganti gabungan mirrorChatMessage + sendPushNotification:
 * satu panggilan menangani penyimpanan, real-time, dan notifikasi.
 */
export async function kirimPesanChat(input: {
  chat: {
    id: string;
    buyer_id: number;
    seller_id: number | null;
    unit_slug: string | null;
    muted_by_buyer: number;
    muted_by_seller: number;
  };
  pengirimId: number;
  isi: string;
  /** daftar id penerima notifikasi push (selain pengirim) */
  penerima: number[];
  judulNotif: string;
  jenis?: "teks" | "sistem";
  unitNama?: Record<string, string>;
  /** tautan foto yang menyertai pesan ini. */
  imageUrl?: string | null;
  /** peran pengirim saat pesan dibuat (untuk tag "-nama" di chat KWU). */
  pengirimPeran?: string | null;
}): Promise<HasilKirim> {
  const pesan = simpanPesan({
    chat_id: input.chat.id,
    sender_id: input.pengirimId,
    isi: input.isi,
    jenis: input.jenis,
    imageUrl: input.imageUrl,
    pengirimPeran: input.pengirimPeran,
  });

  // ---------------------------------------------------------- WebSocket
  // Semua yang terlibat langsung di chat ini. Untuk chat milik unit KWU,
  // seluruh staf yang sedang membuka aplikasi juga ikut menerima — itu
  // sudah ditangani di sisi klien berdasarkan peran.
  const terkirimWs = hub.keChat(
    input.chat.id,
    {
      type: "chat:pesan",
      chatId: input.chat.id,
      pesan,
      // Ringkasan untuk daftar percakapan.
      lastMessage: pesan.isi.slice(0, 200),
      lastSenderId: input.pengirimId,
      lastMessageAt: pesan.created_at,
    },
    {
      kecuali: input.pengirimId,
      tandaiDibuka: true,
      // Hanya peserta chat ini (pengirim + penerima) yang boleh menerima
      // isi pesannya.
      penerima: [input.pengirimId, ...input.penerima],
    },
  );

  // Apakah ada perangkat penerima yang sedang membuka chat ini? Kalau ya,
  // jangan bunyikan notifikasi di perangkat itu.
  const penerimaSedangBuka = input.penerima.some((id) =>
    hub.sedangBukaChat(id, input.chat.id),
  );
  hub.keChat(
    input.chat.id,
    {
      type: "chat:sedang-dibuka",
      chatId: input.chat.id,
      olehPenerima: penerimaSedangBuka,
    },
    {
      kecuali: input.pengirimId,
      // WAJIB dibatasi ke peserta chat ini.
      //
      // Tanpa `penerima`, siaran ini pergi ke SEMUA klien yang sedang
      // tersambung - termasuk pengguna yang sama sekali tidak terlibat di
      // percakapan ini. Akibatnya lencana pesan belum dibaca dan bunyi
      // notifikasi orang lain ikut terpengaruh oleh aktivitas chat yang
      // bukan miliknya.
      penerima: input.penerima,
    },
  );

  // ------------------------------------------------------- Notifikasi push
  // Push hanya untuk yang belum membuka chat; kalau sudah terbuka, notifikasi
  // hanya akan mengganggu.
  //
  // Di sini `notif_enabled` BARU boleh dipakai. Ini setelan khusus notifikasi
  // push: pengguna yang mematikannya tidak ingin dibunyikan, tetapi tetap
  // berhak menerima pesan secara real-time lewat WebSocket saat aplikasinya
  // sedang dibuka (lihat penyebaran WebSocket di atas).
  let terkirimPush = 0;
  const perluPush = input.penerima.filter(
    (id) => !hub.sedangBukaChat(id, input.chat.id) && bolehDapatPush(id),
  );
  if (perluPush.length > 0) {
    terkirimPush = await kirimKeBanyak(perluPush, {
      judul: input.judulNotif,
      isi: input.isi.slice(0, 120),
      url: `/chat/${input.chat.id}`,
      tag: `chat-${input.chat.id}`,
      jenis: "chat",
    });
  }

  // Beri tahu lencana belum-dibaca ke penerima yang lain.
  for (const id of input.penerima) {
    hub.kePengguna(id, {
      type: "chat:belum-dibaca",
      chatId: input.chat.id,
    });
  }

  return { pesan, terkirimWs, terkirimPush, sedangDibuka: penerimaSedangBuka };
}

/**
 * Kirim pesan sistem (dari bot CS / pemberitahuan otomatis).
 * Pengganti sendSystemChatMessage.
 *
 * `pengirimId` boleh null: pesan seperti ajakan menilai tidak berasal dari
 * salah satu pihak, jadi ditandai sebagai pesan sistem murni.
 */
export async function kirimPesanSistem(
  chatId: string,
  _pengirimId: number | null,
  isi: string,
  opsi: {
    isAi?: boolean;
    orderId?: string | number;
    ajakanMenilai?: boolean;
    /**
     * Siapa saja yang boleh menerima pesan sistem ini (biasanya id pembeli dan
     * penjual di chat tersebut). Bila kosong, pesan TIDAK disiarkan ke siapa
     * pun lewat WebSocket - lebih baik tidak terkirim daripada bocor ke semua
     * pengguna yang sedang online.
     */
    penerima?: number[];
  } = {},
): Promise<PesanChat> {
  const pesan = simpanPesan({
    chat_id: chatId,
    // Pesan sistem tidak punya pengirim manusia.
    sender_id: null,
    isi,
    jenis: "sistem",
    // Teruskan penanda bot & id pesanan. Sebelumnya nilai ini dibuang,
    // sehingga label "Bot" tidak pernah muncul dan kartu ajakan menilai
    // kehilangan tautan pesanannya setiap kali halaman dimuat ulang.
    isAi: opsi.isAi,
    orderId: opsi.orderId,
  });

  hub.keChat(
    chatId,
    {
      type: "chat:pesan",
      chatId,
      pesan,
      lastMessage: isi.slice(0, 200),
      lastSenderId: null,
      lastMessageAt: pesan.created_at,
    },
    // HANYA kirim kalau daftar penerimanya diketahui.
    //
    // Kalau `penerima` dibiarkan undefined, wsHub menganggapnya "tanpa
    // batasan" (`boleh = null`) sehingga pesan sistem - yang berisi isi
    // percakapan dan kadang id pesanan - terkirim ke SEMUA klien yang sedang
    // tersambung. Itu kebocoran data lintas pengguna. Karena pesan sistem
    // tidak punya pengirim manusia (`sender_id: null`), tidak ada pula
    // pengecualian yang menyaringnya.
    { penerima: opsi.penerima ?? [] },
  );

  return pesan;
}

// ---------------------------------------------------------------------------
// Fungsi lama yang dipertahankan agar rute tidak perlu diubah besar-besaran
// ---------------------------------------------------------------------------

/**
 * Dulu menulis dokumen chat ke Firestore. Sekarang tidak perlu apa-apa:
 * dokumen chat sudah ada di tabel `chats` sejak awal. Dibiarkan sebagai
 * fungsi kosong supaya kode pemanggil tetap jalan.
 */
export async function createFirestoreChatDoc(
  _chatId: string,
  _buyerId: number,
  _sellerId: number | null,
  _unitSlug: string | null,
): Promise<void> {
  // Tidak ada yang perlu dilakukan — data sudah ada di SQLite.
}

/** Dulu menghapus dokumen chat di Firestore. Sekarang cukup di basis data. */
export async function deleteFirestoreChatDoc(_chatId: string): Promise<void> {
  // Ikut terhapus otomatis lewat ON DELETE CASCADE saat baris `chats` dihapus.
}

/**
 * Dulu mencerminkan pesan ke Firestore. Sekarang tidak diperlukan —
 * penyimpanan sudah dilakukan oleh kirimPesanChat().
 */
export async function mirrorChatMessage(
  _chatId: string,
  _data: { lastMessage?: string; lastSenderId?: number },
): Promise<void> {
  // Penyimpanan ditangani di kirimPesanChat().
}

/**
 * Dulu mengirim push lewat FCM berdasarkan token perangkat.
 * Sekarang lewat Web Push berdasarkan userId.
 *
 * Versi lama menerima `fcm_token`; parameter itu diabaikan kalau bukan angka,
 * supaya kode lama tidak error saat dipanggil.
 */
export async function sendPushNotification(
  kepada: number | string | null,
  judul: string,
  isi: string,
  data: { link?: string; chatId?: string } = {},
): Promise<boolean> {
  const userId = Number(kepada);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  const jumlah = await kirimKePengguna(userId, {
    judul,
    isi,
    url: data.link ?? (data.chatId ? `/chat/${data.chatId}` : "/"),
    jenis: "chat",
    tag: data.chatId ? `chat-${data.chatId}` : undefined,
  });
  return jumlah > 0;
}

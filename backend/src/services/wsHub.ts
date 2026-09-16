// Hub WebSocket — pengganti Firestore real-time.
//
// Semua kejadian (pesan chat baru, perubahan status pesanan, notifikasi) dikirim
// lewat satu koneksi WebSocket per pengguna. Tidak ada pihak ketiga: server ini
// sendiri yang memegang koneksi.
//
// Cara pakai dari route lain:
//   import { hub } from "../services/wsHub";
//   hub.keChat(chatId, { type: "chat:pesan", ... });
//   hub.kePengguna(userId, { type: "order:status", ... });

import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";

import { asalDiizinkan } from "../config/origins";
import { verifyToken } from "../utils/jwt";

/** Satu koneksi yang sedang terbuka. */
type Klien = {
  ws: WebSocket;
  userId: number;
  role: string;
  /** nomor meja kasir, untuk kwu_brital */
  unitSlug: string | null;
  /** chat yang sedang dibuka di layar pengguna */
  chatDibuka: Set<string>;
  hidup: boolean;
  terakhirPing: number;
};

const klienById = new Map<number, Set<Klien>>();

let wss: WebSocketServer | null = null;

/**
 * Pasang penangan upgrade ke server HTTP.
 *
 * Dipisah dari createServer supaya server.ts tetap rapi: cukup panggil
 * pasangWebSocket(server) setelah server dibuat.
 */
export function pasangWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  // Upgrade hanya diterima di jalur /ws. Jalur lain dibiarkan (mis. HMR Next).
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let jalur = "/";
    try {
      jalur = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      jalur = "/";
    }
    if (jalur !== "/ws") {
      // Bukan untuk kita — biarkan koneksi ditutup rapi.
      socket.destroy();
      return;
    }

    // ------------------------------------------------ Cegah CSWSH (Origin)
    // WebSocket di browser TIDAK tunduk pada Same-Origin Policy seperti fetch:
    // skrip di situs mana pun boleh membuka koneksi ke sini, dan cookie korban
    // ikut terkirim. Kalau Origin tidak diperiksa, halaman penyerang bisa
    // membuka WebSocket atas nama korban yang sedang login lalu membaca seluruh
    // percakapan atau mengirim pesan sebagai korban (Cross-Site WebSocket
    // Hijacking).
    //
    // Karena itu hanya Origin yang dikenal yang diizinkan. Permintaan TANPA
    // header Origin (skrip Node, aplikasi Android/Flutter, health check) tetap
    // dilayani karena tidak berasal dari browser - dan tetap wajib membawa
    // token yang sah pada pemeriksaan di bawah.
    const asal = req.headers["origin"] as string | undefined;
    if (asal && !asalDiizinkan(asal)) {
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // ---------------------------------------------------------- Autentikasi
    // Token dikirim lewat query (?token=...) karena WebSocket di browser
    // tidak bisa memasang header khusus. Ini tetap aman selama dipakai di
    // https:// — tapi tetap kita verifikasi tanda tangannya.
    let userId: number | null = null;
    let role = "pembeli";
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const token = url.searchParams.get("token");
      if (token) {
        // verifyToken melempar kalau tanda tangan tidak sah — bukan
        // mengembalikan null, jadi harus dibungkus try/catch.
        const isi = verifyToken(token);
        if (isi?.user_id) {
          userId = Number(isi.user_id);
          role = String(isi.role ?? "pembeli");
        }
      }
    } catch {
      userId = null;
    }

    if (userId === null) {
      ws.send(JSON.stringify({ type: "galat", pesan: "Token tidak sah." }));
      ws.close(4401, "Tidak terautentikasi");
      return;
    }

    const klien: Klien = {
      ws,
      userId,
      role,
      unitSlug: null,
      chatDibuka: new Set(),
      hidup: true,
      terakhirPing: Date.now(),
    };
    tambahKlien(klien);

    ws.send(JSON.stringify({ type: "siap", userId, role }));

    // ------------------------------------------------------------- Pesan masuk
    ws.on("message", (mentah) => {
      klien.terakhirPing = Date.now();
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(mentah.toString());
      } catch {
        return;
      }

      switch (m.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
          break;

        // Pengguna menyatakan sedang membuka chat tertentu — dipakai untuk
        // menandai pesan sudah dibaca dan mematikan bunyi notifikasi.
        case "chat:buka":
          if (typeof m.chatId === "string") klien.chatDibuka.add(m.chatId);
          break;

        case "chat:tutup":
          if (typeof m.chatId === "string") klien.chatDibuka.delete(m.chatId);
          break;

        case "unit": {
          // kwu_brital memilih meja kasir yang sedang dijaga.
          klien.unitSlug = typeof m.slug === "string" ? m.slug : null;
          break;
        }

        default:
          break;
      }
    });

    ws.on("close", () => hapusKlien(klien));
    ws.on("error", () => hapusKlien(klien));
  });

  // Buang koneksi yang sudah mati (laptop ditutup, jaringan putus).
  const pembersih = setInterval(() => {
    const batas = Date.now() - 90_000;
    for (const klien of semuaKlien()) {
      if (klien.terakhirPing < batas) {
        try {
          klien.ws.terminate();
        } catch {
          /* sudah mati */
        }
        hapusKlien(klien);
      }
    }
  }, 30_000);
  pembersih.unref?.();

  return wss;
}

function tambahKlien(k: Klien) {
  let kumpulan = klienById.get(k.userId);
  if (!kumpulan) {
    kumpulan = new Set();
    klienById.set(k.userId, kumpulan);
  }
  kumpulan.add(k);
}

function hapusKlien(k: Klien) {
  k.hidup = false;
  const kumpulan = klienById.get(k.userId);
  if (!kumpulan) return;
  kumpulan.delete(k);
  if (kumpulan.size === 0) klienById.delete(k.userId);
}

function* semuaKlien(): Generator<Klien> {
  for (const kumpulan of klienById.values()) {
    for (const k of kumpulan) yield k;
  }
}

function kirim(k: Klien, muatan: unknown): boolean {
  if (!k.hidup || k.ws.readyState !== WebSocket.OPEN) return false;
  try {
    k.ws.send(JSON.stringify(muatan));
    return true;
  } catch {
    hapusKlien(k);
    return false;
  }
}

/** Berapa koneksi hidup untuk satu pengguna — dipakai untuk uji. */
export function jumlahKoneksi(userId: number): number {
  return klienById.get(userId)?.size ?? 0;
}

/** Jumlah seluruh koneksi hidup. */
export function jumlahSemua(): number {
  return [...semuaKlien()].length;
}

export const hub = {
  /** Kirim ke semua perangkat milik satu pengguna. */
  kePengguna(userId: number | string, muatan: Record<string, unknown>): number {
    const kumpulan = klienById.get(Number(userId));
    if (!kumpulan) return 0;
    let terkirim = 0;
    for (const k of kumpulan) if (kirim(k, muatan)) terkirim++;
    return terkirim;
  },

  /** Kirim ke semua orang yang terlibat dalam sebuah chat. */
  keChat(
    chatId: string,
    muatan: Record<string, unknown>,
    opsi: {
      kecuali?: number | number[];
      tandaiDibuka?: boolean;
      /**
       * Daftar pengguna yang berhak menerima pesan chat ini (buyer, seller,
       * atau staf unit KWU yang bersangkutan).
       *
       * WAJIB diisi untuk pesan yang berisi isi percakapan. Sebelumnya opsi ini
       * tidak ada, sehingga SETIAP klien yang sedang tersambung menerima isi
       * pesan chat orang lain - kebocoran privasi, dan juga membuat bubble
       * muncul ganda di layar pengirim.
       */
      penerima?: number[];
    } = {},
  ): number {
    const kecuali = new Set(
      opsi.kecuali === undefined
        ? []
        : Array.isArray(opsi.kecuali)
          ? opsi.kecuali.map(Number)
          : [Number(opsi.kecuali)],
    );
    // Kalau daftar penerima diberikan, hanya mereka yang dilayani.
    const boleh =
      opsi.penerima === undefined ? null : new Set(opsi.penerima.map(Number));

    // Pengaman: muatan yang memuat ISI PERCAKAPAN tidak boleh disiarkan tanpa
    // batasan penerima.
    //
    // Sebelumnya kelalaian ini sudah dua kali terjadi (pesan sistem dan
    // penanda "sedang dibuka" sama-sama dikirim tanpa `penerima`), dan
    // akibatnya isi chat orang lain terkirim ke seluruh klien. Daripada
    // bergantung pada setiap pemanggil mengingat, permintaan seperti itu
    // ditolak di sini supaya kegagalannya terlihat - bukan diam-diam bocor.
    if (boleh === null && (muatan.type === "chat:pesan" || muatan.type === "chat:sedang-dibuka")) {
      console.warn(
        `[wsHub] DITOLAK: ${String(muatan.type)} untuk chat ${chatId} tanpa daftar penerima. ` +
          "Isi percakapan tidak boleh disiarkan ke semua klien.",
      );
      return 0;
    }

    let terkirim = 0;
    for (const k of semuaKlien()) {
      if (kecuali.has(k.userId)) continue;
      if (boleh && !boleh.has(k.userId)) continue;
      // Sertakan penanda apakah layar pengguna sedang membuka chat ini -
      // frontend memakainya untuk memutuskan bunyi notifikasi.
      const dibuka = opsi.tandaiDibuka ? k.chatDibuka.has(chatId) : undefined;
      if (kirim(k, dibuka === undefined ? muatan : { ...muatan, sedangDibuka: dibuka })) {
        terkirim++;
      }
    }
    return terkirim;
  },

  /** Kirim ke seluruh pengguna dengan peran tertentu. */
  kePeran(role: string, muatan: Record<string, unknown>): number {
    let terkirim = 0;
    for (const k of semuaKlien()) if (k.role === role && kirim(k, muatan)) terkirim++;
    return terkirim;
  },

  /** Kirim ke semua penghuni meja kasir (kwu_brital) tertentu. */
  keUnit(unitSlug: string, muatan: Record<string, unknown>): number {
    let terkirim = 0;
    for (const k of semuaKlien()) {
      if (k.unitSlug === unitSlug && kirim(k, muatan)) terkirim++;
    }
    return terkirim;
  },

  /** Kirim ke semua koneksi hidup — untuk pengumuman sistem. */
  keSemua(muatan: Record<string, unknown>): number {
    let terkirim = 0;
    for (const k of semuaKlien()) if (kirim(k, muatan)) terkirim++;
    return terkirim;
  },

  /** Apakah pengguna ini sedang membuka chat tersebut di perangkat mana pun. */
  sedangBukaChat(userId: number | string, chatId: string): boolean {
    const kumpulan = klienById.get(Number(userId));
    if (!kumpulan) return false;
    for (const k of kumpulan) if (k.chatDibuka.has(chatId)) return true;
    return false;
  },
};

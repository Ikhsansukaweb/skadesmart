// Web Push tanpa pihak ketiga — pengganti Firebase Cloud Messaging.
//
// Cara kerjanya: browser membuat "langganan" (endpoint + kunci) lewat
// Service Worker, lalu server mengirim notifikasi langsung ke endpoint itu
// memakai protokol Web Push (VAPID). Tidak ada akun, tidak ada kuota, tidak
// ada tagihan — kuncinya dibuat sendiri dan disimpan di .env.
//
// Kenapa ini tetap jalan saat tab ditutup: Service Worker hidup di latar
// belakang browser, jadi pesan tetap diterima (dan dibunyikan) walau
// halaman web sudah ditutup — selama browsernya masih jalan.

import webpush from "web-push";

import { db } from "../db";

/** Satu langganan milik satu pengguna (satu perangkat). */
export type Langganan = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let siap = false;

/**
 * Siapkan kunci VAPID.
 *
 * Kalau kunci belum ada di .env, kita buatkan otomatis pada saat pertama
 * dijalankan dan tuliskan ke .env supaya kunci tidak berubah tiap restart
 * (kalau berubah, semua langganan lama jadi tidak sah).
 */
export function siapkanWebPush(): { publik: string; privat: string } | null {
  let publik = process.env.VAPID_PUBLIC_KEY;
  let privat = process.env.VAPID_PRIVATE_KEY;
  const kontak = process.env.VAPID_CONTACT || "mailto:admin@skadesmart.web.id";

  if (!publik || !privat) {
    const baru = webpush.generateVAPIDKeys();
    publik = baru.publicKey;
    privat = baru.privateKey;
    console.log("[webpush] Kunci VAPID baru dibuat:");
    console.log(`[webpush]   VAPID_PUBLIC_KEY=${publik}`);
    console.log(`[webpush]   VAPID_PRIVATE_KEY=${privat}`);
    console.log("[webpush] Simpan dua baris di atas ke backend/.env lalu jalankan ulang.");
    console.warn("[webpush] Notifikasi push NONAKTIF sampai kunci disimpan ke .env.");
    // Tetap set di proses supaya kunci publik bisa dibaca frontend pada sesi ini.
    process.env.VAPID_PUBLIC_KEY = publik;
    process.env.VAPID_PRIVATE_KEY = privat;
    siap = false;
    return { publik, privat };
  }

  try {
    webpush.setVapidDetails(kontak, publik, privat);
    siap = true;
    console.log("[webpush] Siap. Notifikasi akan tetap sampai walau tab ditutup.");
  } catch (err) {
    console.error("[webpush] Kunci VAPID tidak sah:", err);
    siap = false;
  }
  return { publik, privat };
}

/** Kunci publik untuk diberikan ke frontend. */
export function kunciPublik(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Apakah push benar-benar siap dikirim? */
export function siapKirim(): boolean {
  return siap;
}

/** Simpan langganan baru, atau perbarui yang sudah ada. */
export function simpanLangganan(
  userId: number,
  l: { endpoint: string; p256dh: string; auth: string },
): void {
  // better-sqlite3 bersifat sinkron. Endpoint itu unik; kalau pengguna yang
  // sama mendaftar ulang, cukup perbarui kuncinya (browser kadang mengubah
  // kunci tanpa mengganti endpoint).
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh  = excluded.p256dh,
       auth    = excluded.auth`,
  ).run(userId, l.endpoint, l.p256dh, l.auth);
}

/** Hapus langganan yang sudah tidak berlaku. */
export function hapusLangganan(endpoint: string): void {
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

/** Semua langganan milik satu pengguna. */
export function langgananPengguna(userId: number): Langganan[] {
  return db
    .prepare(
      `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`,
    )
    .all(userId) as Langganan[];
}

export type MuatanNotif = {
  judul: string;
  isi: string;
  /** alamat yang dibuka saat notifikasi diklik */
  url?: string;
  /** penanda agar frontend tidak menampilkan dua kali */
  tag?: string;
  /** 'chat' | 'pesanan' | 'sistem' */
  jenis?: string;
};

/**
 * Kirim notifikasi ke seluruh perangkat milik satu pengguna.
 *
 * Mengembalikan jumlah yang berhasil dikirim. Langganan yang sudah mati
 * (browser dihapus, izin dicabut) langsung dibuang dari basis data supaya
 * tidak dicoba terus-menerus.
 */
export async function kirimKePengguna(
  userId: number,
  muatan: MuatanNotif,
): Promise<number> {
  if (!siap) return 0;

  const daftar = langgananPengguna(userId);
  if (daftar.length === 0) return 0;

  const isi = JSON.stringify(muatan);
  let berhasil = 0;

  await Promise.all(
    daftar.map(async (l) => {
      try {
        await webpush.sendNotification(
          { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
          isi,
          { TTL: 60 * 60 * 24 },
        );
        berhasil++;
      } catch (err: unknown) {
        const kode = (err as { statusCode?: number }).statusCode;
        // 404/410 = langganan sudah tidak ada. Bersihkan.
        if (kode === 404 || kode === 410) {
          hapusLangganan(l.endpoint);
        } else {
          console.error(`[webpush] Gagal kirim ke ${l.endpoint.slice(0, 40)}…:`, kode ?? err);
        }
      }
    }),
  );

  return berhasil;
}

/** Kirim ke banyak pengguna sekaligus. */
export async function kirimKeBanyak(
  userIds: number[],
  muatan: MuatanNotif,
): Promise<number> {
  if (!siap || userIds.length === 0) return 0;
  const unik = [...new Set(userIds.map(Number))].filter((n) => Number.isFinite(n));
  const hasil = await Promise.all(unik.map((id) => kirimKePengguna(id, muatan)));
  return hasil.reduce((a, b) => a + b, 0);
}

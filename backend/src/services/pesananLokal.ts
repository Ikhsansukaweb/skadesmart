// Status pesanan - pengganti mirrorOrderStatus/mirrorNewOrder/mirrorNewOrder
// dan sendPushNotification versi Firebase.
//
// Sebelumnya: status pesanan dicerminkan ke Firestore supaya halaman Status
// Pesanan bisa mendengarkannya dengan onSnapshot(), dan notifikasi dikirim
// lewat FCM.
//
// Sekarang: status dikirim lewat WebSocket (real-time) dan notifikasi lewat
// Web Push. Tidak ada pihak ketiga, tidak ada kuota.

import { db } from "../db";
import { hub } from "./wsHub";
import { kirimKeBanyak, kirimKePengguna } from "./webPush";
// `bolehDapatPush` menyaring notifikasi push berdasarkan setelan pengguna.
// Sengaja dipakai bersama agar aturannya konsisten di seluruh aplikasi:
// real-time selalu dikirim, notifikasi push mengikuti `notif_enabled`.
import { bolehDapatPush } from "./chatLokal";

export type StatusPesanan = string;

/** Teks yang enak dibaca untuk setiap status. */
const TEKS_STATUS: Record<string, string> = {
  menunggu: "Pesananmu sedang menunggu konfirmasi penjual.",
  diproses: "Pesananmu sedang diproses.",
  siap: "Pesananmu sudah siap diambil.",
  dicuci: "Cucianmu sedang dikerjakan.",
  selesai: "Cucianmu sudah selesai dan bisa diambil.",
  siap_diambil: "Pesananmu sudah siap diambil.",
  dibatalkan: "Pesananmu dibatalkan.",
  diambil: "Pesanan sudah diambil. Terima kasih!",
};

export function teksStatus(status: StatusPesanan): string {
  return TEKS_STATUS[status] ?? `Status pesanan berubah menjadi ${status}.`;
}

/**
 * Beri tahu perubahan status pesanan ke pembeli.
 *
 * Menggantikan gabungan mirrorOrderStatus() + sendPushNotification():
 * satu panggilan mengurus real-time (WebSocket) dan notifikasi (Web Push).
 */
export async function beritahuStatusPesanan(
  orderId: number | string,
  info: {
    buyerId: number;
    sellerId?: number | null;
    status: StatusPesanan;
    /** untuk laundry: kirim juga ke seluruh staf unit */
    kwuUnit?: string | null;
    /** kode unik pesanan, untuk ditampilkan di notifikasi */
    kodeUnik?: string | null;
  },
): Promise<{ terkirimWs: number; terkirimPush: number }> {
  const isi = teksStatus(info.status);
  const muatan = {
    type: "order:status",
    orderId: String(orderId),
    status: info.status,
    teks: isi,
    updatedAt: new Date().toISOString(),
  };

  // ---------------------------------------------------------- WebSocket
  let terkirimWs = hub.kePengguna(info.buyerId, muatan);

  // Penjual juga perlu tahu (mis. pesanan dibatalkan pembeli).
  if (info.sellerId) terkirimWs += hub.kePengguna(info.sellerId, muatan);

  // Staf unit KWU yang sedang membuka aplikasi ikut diperbarui daftarnya.
  if (info.kwuUnit) terkirimWs += hub.keUnit(info.kwuUnit, muatan);

  // ------------------------------------------------------ Notifikasi push
  const penerima = [info.buyerId];
  const judul = info.kodeUnik
    ? `Pesanan ${info.kodeUnik} diperbarui`
    : "Status pesanan diperbarui";

  const terkirimPush = await kirimKeBanyak(penerima, {
    judul,
    isi,
    url: "/orders/status",
    tag: `order-${orderId}`,
    jenis: "pesanan",
  });

  return { terkirimWs, terkirimPush };
}

/**
 * Pesanan baru masuk - beri tahu penjual atau staf unit.
 * Pengganti mirrorNewOrder() + notifikasi FCM.
 */
export async function beritahuPesananBaru(
  orderId: number | string,
  info: {
    /** untuk pesanan siswa ke siswa */
    sellerId?: number | null;
    /** untuk pesanan ke unit KWU: 'kwu_brital' | 'kwu_laundry' */
    kwuUnit?: string | null;
    /** nama pembeli, ditampilkan di notifikasi */
    pembeli?: string | null;
    total?: number | null;
  },
): Promise<{ terkirimWs: number; terkirimPush: number }> {
  const isi = info.pembeli
    ? `Pesanan baru dari ${info.pembeli}.`
    : "Ada pesanan baru masuk.";

  const muatan = {
    type: "order:baru",
    orderId: String(orderId),
    teks: isi,
    total: info.total ?? null,
    createdAt: new Date().toISOString(),
  };

  let terkirimWs = 0;
  const penerima: number[] = [];

  if (info.sellerId) {
    terkirimWs += hub.kePengguna(info.sellerId, muatan);
    penerima.push(info.sellerId);
  }

  if (info.kwuUnit) {
    terkirimWs += hub.keUnit(info.kwuUnit, muatan);
    // Untuk unit, ambil semua stafnya dari basis data.
    //
    // Catatan: penyebaran WebSocket di atas TIDAK disaring `notif_enabled`
    // (memang harus begitu). Penyaringan di sini hanya berlaku untuk daftar
    // penerima notifikasi push di bawah.
    const staf = db
      .prepare("SELECT id FROM users WHERE role = ?")
      .all(info.kwuUnit) as { id: number }[];
    for (const s of staf) penerima.push(s.id);
  }

  const terkirimPush = await kirimKeBanyak(
    // `notif_enabled` menentukan siapa yang dibunyikan, bukan siapa yang
    // menerima pembaruan real-time.
    penerima.filter((id) => bolehDapatPush(id)),
    {
      judul: "Pesanan baru",
      isi,
      url: info.kwuUnit ? "/kwu" : "/orders/status",
      tag: `order-baru-${orderId}`,
      jenis: "pesanan",
    },
  );

  return { terkirimWs, terkirimPush };
}

/**
 * Nama-nama lama dipertahankan agar rute tidak perlu diubah.
 * Fungsi-fungsi ini kini hanya memanggil versi baru di atas.
 */
export async function mirrorOrderStatus(
  orderId: number | string,
  info: {
    buyerId: number;
    sellerId?: number | null;
    status: StatusPesanan;
    kwuUnit?: string | null;
  },
): Promise<void> {
  await beritahuStatusPesanan(orderId, info);
}

export async function mirrorNewOrder(
  kwuUnit: string,
  orderId: number | string,
): Promise<void> {
  await beritahuPesananBaru(orderId, { kwuUnit });
}

/** Kirim notifikasi langsung ke satu pengguna (pengganti FCM). */
export async function kirimNotif(
  userId: number,
  judul: string,
  isi: string,
  url = "/",
): Promise<number> {
  return kirimKePengguna(userId, { judul, isi, url, jenis: "sistem" });
}

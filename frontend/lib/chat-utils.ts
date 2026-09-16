// Chat — pengganti chat-utils.ts yang dulu menulis ke Firestore.
//
// Sekarang satu permintaan HTTP ke backend: server menyimpan pesan ke SQLite,
// menyebarkannya lewat WebSocket, dan mengirim notifikasi push. Frontend tidak
// perlu lagi menyentuh basis data langsung.

import { api } from "./api";

export type PesanChat = {
  id: string;
  chat_id: string;
  sender_id: number | null;
  jenis: string;
  isi: string;
  created_at: string;
  /** alias untuk kompatibilitas dengan bentuk Firestore lama */
  text?: string;
  createdAt?: string;
};

// Sama seperti lib/api.ts: nilai ini SUDAH berakhiran "/api", jadi pemanggilan
// fetch di bawah memakai path tanpa "/api" lagi.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/** Kirim pesan ke sebuah chat. */
export async function kirimPesan(
  chatId: string,
  isi: string,
): Promise<PesanChat> {
  // WAJIB lewat api(): fetch() langsung tidak menyertakan header
  // `x-csrf-token`, sehingga server menolak dengan 403 (CSRF_MISSING).
  const data = await api<{ pesan: PesanChat }>("/chats/notify", {
    method: "POST",
    json: { chat_id: chatId, text: isi },
  });
  return data.pesan as PesanChat;
}

/** Ambil riwayat pesan sebuah chat. */
export async function ambilPesan(
  chatId: string,
  opsi: { batas?: number; sebelum?: string } = {},
): Promise<{ pesan: PesanChat[]; jumlahBelumDibaca: number }> {
  const q = new URLSearchParams();
  if (opsi.batas) q.set("batas", String(opsi.batas));
  if (opsi.sebelum) q.set("sebelum", opsi.sebelum);

  const data = await api<{ pesan: PesanChat[]; jumlahBelumDibaca?: number }>(
    `/chats/${chatId}/pesan?${q}`,
  );
  return {
    pesan: (data.pesan ?? []) as PesanChat[],
    jumlahBelumDibaca: data.jumlahBelumDibaca ?? 0,
  };
}

/** Tandai semua pesan di chat ini sudah dibaca. */
export async function tandaiDibaca(chatId: string): Promise<void> {
  await api(`/chats/${chatId}/dibaca`, { method: "PATCH" });
}

/** Total pesan belum dibaca (untuk lencana di bilah navigasi). */
export async function totalBelumDibaca(): Promise<number> {
  try {
    const data = await api<{ total?: number }>("/chats/belum-dibaca");
    return Number(data.total) || 0;
  } catch {
    return 0;
  }
}

/** Tampilkan waktu pesan dengan singkat. */
export function waktuSingkat(nilai: string | undefined): string {
  if (!nilai) return "";
  // SQLite menyimpan "YYYY-MM-DD HH:MM:SS" dalam UTC; tambahkan penanda Z
  // supaya Date membacanya sebagai UTC, bukan waktu lokal.
  const iso = nilai.includes("T") ? nilai : nilai.replace(" ", "T") + "Z";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";

  const selisih = Date.now() - t.getTime();
  const menit = Math.floor(selisih / 60000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;

  return t.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Minta penilaian setelah pesanan selesai.
 *
 * Dulu fungsi ini menulis dokumen ke Firestore koleksi `rating_requests`.
 * Sekarang cukup memberi tahu server lewat API — server yang menyimpan dan
 * menyebarkannya ke chat terkait.
 */
export async function sendRatingRequest(
  dariUserId: number,
  keUserId: number,
  orderId: number | string,
): Promise<void> {
  try {
    await api("/chats/rating", {
      method: "POST",
      json: {
        dari: dariUserId,
        ke: keUserId,
        order_id: orderId,
      },
    });
  } catch (err) {
    // Permintaan penilaian bersifat tambahan: kalau gagal, jangan sampai
    // mengganggu alur utama (menyelesaikan pesanan tetap berhasil).
    console.warn("[rating] gagal meminta penilaian:", err);
  }
}

// Notifikasi push di sisi browser — pengganti Firebase Messaging.
//
// Alur:
//   1. Minta izin notifikasi ke pengguna.
//   2. Daftarkan Service Worker (/sw.js).
//   3. Ambil kunci publik VAPID dari server.
//   4. Buat langganan push, kirim ke server untuk disimpan.
//
// Service Worker inilah yang membuat notifikasi tetap diterima walau tab
// sudah ditutup — dia hidup di latar belakang browser, bukan di halaman.

// Sama seperti lib/api.ts: nilai ini SUDAH berakhiran "/api", jadi pemanggilan
// fetch di bawah memakai path tanpa "/api" lagi.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

import { api } from "./api";

export type HasilNotif =
  | { ok: true; pesan: string }
  | { ok: false; pesan: string; alasan: "tidak-didukung" | "ditolak" | "gagal" };

function didukung(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Ubah kunci VAPID base64url menjadi Uint8Array (yang diminta PushManager). */
function keUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const mentah = atob(b64);
  const arr = new Uint8Array(mentah.length);
  for (let i = 0; i < mentah.length; i++) arr[i] = mentah.charCodeAt(i);
  return arr;
}

/**
 * Nyalakan notifikasi push untuk perangkat ini.
 *
 * Dipanggil dari tombol di halaman Akun, bukan otomatis saat halaman dibuka —
 * browser modern memblokir permintaan izin yang tidak dipicu klik pengguna.
 */
export async function nyalakanNotifikasi(): Promise<HasilNotif> {
  if (!didukung()) {
    return {
      ok: false,
      pesan: "Browser ini tidak mendukung notifikasi push (butuh Chrome/Edge/Firefox terbaru, dan harus lewat HTTPS).",
      alasan: "tidak-didukung",
    };
  }

  // 1. Izin
  let izin = Notification.permission;
  if (izin === "default") izin = await Notification.requestPermission();
  if (izin !== "granted") {
    return {
      ok: false,
      pesan: "Izin notifikasi ditolak. Nyalakan lewat pengaturan situs di browser.",
      alasan: "ditolak",
    };
  }

  try {
    // 2. Service Worker
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    // 3. Kunci publik dari server
    let kunci: string;
    try {
      const hasilKunci = await api<{ kunci: string }>("/chats/push/kunci");
      kunci = hasilKunci.kunci;
    } catch {
      return {
        ok: false,
        pesan:
          "Server belum menyiapkan notifikasi push (kunci VAPID belum diset).",
        alasan: "gagal",
      };
    }

    // 4. Langganan
    const langganan =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keUint8(kunci) as unknown as BufferSource,
      }));

    const data = langganan.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!data.endpoint || !data.keys?.p256dh || !data.keys?.auth) {
      return { ok: false, pesan: "Langganan push tidak lengkap.", alasan: "gagal" };
    }

    // 5. Simpan ke server
    try {
      await api("/chats/push/langganan", {
        method: "POST",
        json: {
          endpoint: data.endpoint,
          keys: { p256dh: data.keys.p256dh, auth: data.keys.auth },
        },
      });
    } catch {
      return { ok: false, pesan: "Gagal menyimpan langganan di server.", alasan: "gagal" };
    }

    return {
      ok: true,
      pesan:
        "Notifikasi aktif. Kamu akan tetap menerima pemberitahuan walau tab ini ditutup.",
    };
  } catch (err) {
    console.error("[push] gagal mengaktifkan:", err);
    return {
      ok: false,
      pesan: err instanceof Error ? err.message : "Gagal mengaktifkan notifikasi.",
      alasan: "gagal",
    };
  }
}

/** Matikan notifikasi untuk perangkat ini. */
export async function matikanNotifikasi(): Promise<void> {
  if (!didukung()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const langganan = await reg?.pushManager.getSubscription();
    if (!langganan) return;
    const endpoint = langganan.endpoint;
    await langganan.unsubscribe();
    await api("/chats/push/langganan", {
      method: "DELETE",
      json: { endpoint },
    });
  } catch (err) {
    console.error("[push] gagal mematikan:", err);
  }
}

/** Apakah notifikasi sudah aktif di perangkat ini? */
export async function notifikasiAktif(): Promise<boolean> {
  if (!didukung()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Tampilkan notifikasi lokal (tanpa lewat server).
 *
 * Dipakai saat tab sedang terbuka: lebih cepat daripada menunggu push
 * kembali dari server, dan bisa diklik langsung tanpa membuka tab baru.
 */
export function notifLokal(judul: string, isi: string, url = "/") {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(judul, {
      body: isi,
      icon: "/icon-192.png",
      tag: url,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
      n.close();
    };
  } catch {
    // Beberapa browser menolak Notification langsung dari halaman (butuh
    // Service Worker). Kalau begitu, biarkan notifikasi dari server yang
    // menanganinya.
  }
}

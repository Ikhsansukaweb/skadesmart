"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { ambilTokenCsrfDariServer, lupakanTokenCsrf, simpanTokenCsrf, api } from "./api";
import { realtime } from "./realtime";
import { nyalakanNotifikasi, notifikasiAktif } from "./notifPush";

export type Role = "siswa" | "kwu_brital" | "kwu_laundry" | "cs" | "admin";

export interface AppUser {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: Role;
  profile_photo_url?: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  /**
   * Dulu berarti "Firebase Auth sudah siap". Sekarang berarti "koneksi
   * real-time sudah siap" — halaman yang menampilkan chat/status pesanan
   * menunggu flag ini supaya tidak query sebelum koneksi hidup.
   */
  siap: boolean;
  /** Nama lama, dipertahankan supaya halaman yang belum diubah tetap jalan. */
  firebaseReady: boolean;
  realtimeSiap: boolean;
  login: (nisn: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  registerPushToken: () => Promise<{ ok: boolean; reason?: string }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeSiap, setRealtimeSiap] = useState(false);
  const router = useRouter();

  // Pantau status koneksi WebSocket supaya halaman tahu kapan boleh menampilkan
  // data real-time.
  useEffect(() => {
    const lepas = realtime.langgananStatus((s) => setRealtimeSiap(s === "siap"));
    return () => lepas();
  }, []);

  /**
   * Buka koneksi WebSocket dengan JWT milik sesi ini.
   *
   * Dulu fungsi ini me-login ulang ke Firebase (signInWithCustomToken) tiap
   * kali halaman dimuat, karena sesi Firebase di browser sering tidak pulih
   * setelah refresh. Sekarang cukup mengambil token dari cookie httpOnly —
   * jauh lebih ringan dan tidak ada sesi yang bisa "basi".
   */
  const sambungkanRealtime = useCallback(async () => {
    try {
      const data = await api<{ token: string }>("/auth/ws-token");
      realtime.sambung(data.token);
    } catch (err) {
      console.warn("[realtime] Gagal mengambil token WebSocket:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      // Ambil token CSRF lebih dulu. Setiap kali halaman dimuat ulang, memori
      // JavaScript kosong - termasuk token CSRF - sehingga tanpa langkah ini
      // permintaan pertama yang mengubah data akan ditolak 403.
      await ambilTokenCsrfDariServer();

      const data = await api<{ user: AppUser }>("/auth/me");
      setUser(data.user);
      // Koneksi real-time disambungkan SETELAH `loading` selesai - lihat
      // penjelasan di blok `finally`. Jangan di-await di sini.
      void sambungkanRealtime();
    } catch {
      // Belum login / sesi kedaluwarsa. Ini keadaan NORMAL saat pengunjung
      // membuka halaman publik seperti /login, jadi tidak perlu dilaporkan
      // sebagai error.
      setUser(null);
      realtime.putus();
    } finally {
      // `loading` selesai begitu data user diketahui. WebSocket tidak ikut
      // ditunggu: kalau ditunggu, seluruh halaman (termasuk yang tidak butuh
      // real-time) tertahan sampai koneksi hidup, dan di mode dev itu terasa
      // seperti halaman tidak pernah selesai dimuat.
      setLoading(false);
    }
  }, [sambungkanRealtime]);

  useEffect(() => {
    // .catch() ditambahkan sebagai jaring pengaman: tanpa ini, kegagalan
    // tak terduga di dalam refresh() muncul sebagai "unhandledRejection"
    // di konsol browser dan bisa mematikan bagian lain aplikasi.
    refresh().catch(() => {});
  }, [refresh]);

  // Tutup koneksi rapi saat tab ditutup.
  useEffect(() => {
    const tutup = () => realtime.putus();
    window.addEventListener("pagehide", tutup);
    return () => window.removeEventListener("pagehide", tutup);
  }, []);

  const registerPushToken = useCallback(
    async (): Promise<{ ok: boolean; reason?: string }> => {
      const hasil = await nyalakanNotifikasi();
      if (hasil.ok) return { ok: true };
      return { ok: false, reason: hasil.pesan };
    },
    [],
  );

  const login = useCallback(
    async (nisn: string, password: string) => {
      const data = await api<{ user: AppUser; token: string; csrf_token?: string }>(
        "/auth/login",
        {
          method: "POST",
          json: { nisn, password },
        },
      );
      // Simpan token CSRF dari body respons.
      //
      // Tidak bisa dibaca dari cookie: cookie-nya tersimpan di domain API
      // (`api.skadesmart.web.id`) sedangkan halaman ini di
      // `skadesmart.web.id`, dan JavaScript hanya bisa membaca cookie
      // domainnya sendiri. Lihat penjelasan di lib/api.ts.
      simpanTokenCsrf(data.csrf_token);
      setUser(data.user);

      // Langsung sambungkan real-time dengan token dari respons login —
      // tidak perlu satu permintaan tambahan.
      realtime.sambung(data.token);

      // Nyalakan notifikasi hanya kalau izinnya sudah pernah diberikan.
      // Kalau belum, jangan minta izin otomatis: browser memblokir permintaan
      // izin yang tidak dipicu klik pengguna, dan itu terasa mengganggu.
      notifikasiAktif().then((aktif) => {
        if (!aktif) return;
        registerPushToken().then((r) => {
          if (!r.ok) console.warn("[push] Notifikasi tidak aktif:", r.reason);
        });
      });

      router.push("/home");
    },
    [router, registerPushToken],
  );

  const logout = useCallback(async () => {
    // Lupakan token CSRF SETELAH permintaan logout terkirim (logout butuh
    // token itu sendiri, karena termasuk permintaan yang mengubah data).
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    lupakanTokenCsrf();
    realtime.putus();
    setUser(null);
    setRealtimeSiap(false);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        siap: realtimeSiap,
        firebaseReady: realtimeSiap,
        realtimeSiap,
        login,
        logout,
        refresh,
        registerPushToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}

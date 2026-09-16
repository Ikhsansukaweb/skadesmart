// Klien WebSocket — pengganti Firestore onSnapshot.
//
// Satu koneksi dipakai bersama seluruh aplikasi (chat, status pesanan,
// lencana belum dibaca). Koneksi hidup terus selama tab terbuka, dan
// menyambung ulang sendiri kalau terputus.
//
// Dipakai lewat hook `useRealtime()` yang mengembalikan:
//   - siap       : koneksi sudah terbuka
//   - terakhir   : kejadian terakhir yang diterima
//   - status     : 'menyambung' | 'siap' | 'terputus'
//
// Contoh:
//   const { siap, pesanBaru, orderBaru } = useRealtime();
//
// Semua halaman yang berlangganan akan ikut terbarui — itulah kenapa chat
// terasa real-time di mana pun pengguna berada.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type KejadianRealtime =
  | { type: "siap"; userId: number; role: string }
  | {
      type: "chat:pesan";
      chatId: string;
      pesan: {
        id: string;
        chat_id: string;
        sender_id: number | null;
        jenis: string;
        isi: string;
        created_at: string;
      };
      lastMessage?: string;
      lastSenderId?: number | null;
      lastMessageAt?: string;
      /** true kalau perangkat ini sedang membuka chat tersebut */
      sedangDibuka?: boolean;
    }
  | { type: "chat:belum-dibaca"; chatId: string }
  | { type: "chat:sedang-dibuka"; chatId: string; olehPenerima: boolean }
  | {
      type: "order:status";
      orderId: string;
      status: string;
      teks: string;
      updatedAt: string;
    }
  | { type: "order:baru"; orderId: string; teks: string; total: number | null }
  | { type: "pong"; t: number }
  | { type: "galat"; pesan: string };

export type StatusKoneksi = "menyambung" | "siap" | "terputus";

/** Alamat WebSocket, dihitung dari alamat API yang dipakai aplikasi. */
function alamatWs(): string {
  // Di browser, sedapat mungkin pakai host yang sama supaya cookie & TLS
  // cocok. API ada di subdomain sendiri, jadi alamatnya bisa diatur lewat
  // NEXT_PUBLIC_WS_URL kalau perlu.
  const eksplisit = process.env.NEXT_PUBLIC_WS_URL;
  if (eksplisit) return eksplisit;

  // NEXT_PUBLIC_API_URL berbentuk "https://api.skadesmart.web.id/api", jadi
  // host-nya diambil lewat URL() supaya bagian "/api" tidak ikut terbawa.
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  try {
    const u = new URL(api);
    const protokol = u.protocol === "https:" ? "wss:" : "ws:";
    return `${protokol}//${u.host}/ws`;
  } catch {
    return "ws://localhost:4000/ws";
  }
}

type Pendengar = (k: KejadianRealtime) => void;

/**
 * Pengelola koneksi tunggal.
 *
 * Sengaja bukan hook: koneksinya harus bertahan lintas halaman (Next.js
 * menukar komponen saat navigasi), jadi disimpan di tingkat modul.
 */
class PengelolaRealtime {
  private ws: WebSocket | null = null;
  private pendengar = new Set<Pendengar>();
  private statusPendengar = new Set<(s: StatusKoneksi) => void>();
  private percobaanUlang = 0;
  private timerSambung: ReturnType<typeof setTimeout> | null = null;
  private timerPing: ReturnType<typeof setInterval> | null = null;
  private berhenti = false;
  private tokenSekarang: string | null = null;
  /** chat yang sedang dibuka di layar, dikabarkan ke server */
  private chatDibuka = new Set<string>();

  status: StatusKoneksi = "terputus";

  /** Buka koneksi (aman dipanggil berkali-kali). */
  sambung(token: string) {
    if (typeof window === "undefined") return;
    this.tokenSekarang = token;

    // Sudah tersambung atau sedang menyambung -> JANGAN buat koneksi baru.
    //
    // PENTING: jangan membandingkan TOKEN untuk memutuskan ini.
    // `/auth/ws-token` menerbitkan token BARU setiap kali dipanggil, dan token
    // itu ikut ditulis di URL koneksi (`?token=...`). Kalau token dipakai
    // sebagai pembanding, setiap pemanggilan berikutnya akan dianggap
    // "token berbeda" lalu MENUTUP koneksi yang sudah sehat dan membuka yang
    // baru. Karena `refresh()` bisa terpanggil beberapa kali beruntun (mis.
    // saat keranjang berubah), koneksi saling membunuh dan salah satu
    // perangkat berakhir tanpa realtime - pesan baru hanya muncul setelah
    // pindah halaman atau muat ulang.
    //
    // Yang penting hanyalah: koneksi ini hidup dan milik sesi yang sama.
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.berhenti = false;
    this.tutup();
    this.ubahStatus("menyambung");

    const url = `${alamatWs()}?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.jadwalkanSambungUlang();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.percobaanUlang = 0;
      this.ubahStatus("siap");
      // Beritahu server chat mana yang sedang terbuka, supaya notifikasi
      // tidak dibunyikan untuk chat yang memang sedang dilihat.
      for (const id of this.chatDibuka) this.kirim({ type: "chat:buka", chatId: id });
      this.mulaiPing();
    };

    ws.onmessage = (ev) => {
      let k: KejadianRealtime;
      try {
        k = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (k.type === "pong") return;
      if (k.type === "galat") {
        console.warn("[realtime]", k.pesan);
        return;
      }
      for (const p of this.pendengar) {
        try {
          p(k);
        } catch (err) {
          console.error("[realtime] pendengar gagal:", err);
        }
      }
    };

    ws.onclose = () => {
      this.hentikanPing();
      if (!this.berhenti) {
        this.ubahStatus("terputus");
        this.jadwalkanSambungUlang();
      }
    };

    ws.onerror = () => {
      // onclose akan menyusul dan menangani penyambungan ulang.
    };
  }

  /** Tutup koneksi (mis. saat keluar akun). */
  putus() {
    this.berhenti = true;
    this.tokenSekarang = null;
    this.hentikanPing();
    this.tutup();
    this.ubahStatus("terputus");
    if (this.timerSambung) {
      clearTimeout(this.timerSambung);
      this.timerSambung = null;
    }
  }

  private tutup() {
    if (!this.ws) return;
    try {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
    } catch {
      /* sudah tertutup */
    }
    this.ws = null;
  }

  /** Sambung ulang dengan jeda bertambah supaya tidak membanjiri server. */
  private jadwalkanSambungUlang() {
    if (this.berhenti || !this.tokenSekarang) return;
    if (this.timerSambung) clearTimeout(this.timerSambung);
    this.percobaanUlang++;
    // 1s, 2s, 4s, 8s, maksimal 20s.
    const jeda = Math.min(1000 * 2 ** (this.percobaanUlang - 1), 20000);
    this.timerSambung = setTimeout(() => {
      if (this.tokenSekarang) this.sambung(this.tokenSekarang);
    }, jeda);
  }

  private mulaiPing() {
    this.hentikanPing();
    // Ping tiap 25 detik supaya koneksi tidak diputus proxy/tunnel karena
    // dianggap menganggur.
    this.timerPing = setInterval(() => this.kirim({ type: "ping" }), 25000);
  }

  private hentikanPing() {
    if (this.timerPing) {
      clearInterval(this.timerPing);
      this.timerPing = null;
    }
  }

  /** Kirim data ke server. Mengembalikan false kalau belum tersambung. */
  kirim(data: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** Berlangganan kejadian. Mengembalikan fungsi untuk berhenti. */
  langganan(p: Pendengar): () => void {
    this.pendengar.add(p);
    return () => this.pendengar.delete(p);
  }

  /** Berlangganan perubahan status koneksi. */
  langgananStatus(p: (s: StatusKoneksi) => void): () => void {
    this.statusPendengar.add(p);
    return () => this.statusPendengar.delete(p);
  }

  private ubahStatus(s: StatusKoneksi) {
    this.status = s;
    for (const p of this.statusPendengar) {
      try {
        p(s);
      } catch {
        /* abaikan */
      }
    }
  }

  /**
   * Nyatakan chat sedang dibuka / ditutup.
   * Server memakai ini untuk memutuskan perlu tidaknya notifikasi berbunyi.
   */
  setChatDibuka(chatId: string | null) {
    if (chatId) {
      this.chatDibuka.add(chatId);
      this.kirim({ type: "chat:buka", chatId });
    } else {
      const daftar = [...this.chatDibuka];
      this.chatDibuka.clear();
      for (const id of daftar) this.kirim({ type: "chat:tutup", chatId: id });
    }
  }

  /** Kabarkan meja kasir yang sedang dijaga (khusus kwu_brital). */
  setUnit(slug: string | null) {
    this.kirim({ type: "unit", slug });
  }
}

export const realtime = new PengelolaRealtime();

// ---------------------------------------------------------------------------
// Hook React
// ---------------------------------------------------------------------------

export function useRealtime() {
  const [siap, setSiap] = useState(realtime.status === "siap");
  const [status, setStatus] = useState<StatusKoneksi>(realtime.status);
  const [terakhir, setTerakhir] = useState<KejadianRealtime | null>(null);
  const pendengarRef = useRef<((k: KejadianRealtime) => void) | null>(null);

  useEffect(() => {
    const lepasStatus = realtime.langgananStatus((s) => {
      setStatus(s);
      setSiap(s === "siap");
    });
    const lepas = realtime.langganan((k) => {
      setTerakhir(k);
      pendengarRef.current?.(k);
    });
    return () => {
      lepasStatus();
      lepas();
    };
  }, []);

  /**
   * Daftarkan penangan khusus untuk kejadian tertentu.
   * Dipakai halaman chat supaya tidak perlu memilah `terakhir` sendiri.
   */
  const pada = useCallback((penangan: (k: KejadianRealtime) => void) => {
    pendengarRef.current = penangan;
  }, []);

  return { siap, status, terakhir, pada, kirim: realtime.kirim.bind(realtime) };
}

/** Jalan pintas: langganan satu jenis kejadian. */
export function useKejadian<T extends KejadianRealtime["type"]>(
  tipe: T,
  penangan: (k: Extract<KejadianRealtime, { type: T }>) => void,
) {
  const penanganRef = useRef(penangan);
  penanganRef.current = penangan;

  useEffect(() => {
    return realtime.langganan((k) => {
      if (k.type === tipe) penanganRef.current(k as Extract<KejadianRealtime, { type: T }>);
    });
  }, [tipe]);
}

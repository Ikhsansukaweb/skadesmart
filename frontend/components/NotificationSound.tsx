"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { playNotificationSound, primeNotificationSound } from "@/lib/sound";
import { realtime, type KejadianRealtime } from "@/lib/realtime";
import { notifLokal } from "@/lib/notifPush";

/**
 * Notifikasi suara + banner di layar. Dipasang sekali di root layout.
 *
 * Menggantikan versi Firestore yang dulu memakai onSnapshot. Sekarang semua
 * kejadian datang dari satu koneksi WebSocket:
 *
 *  1. Pesan chat baru -> bunyi + banner, kecuali kalau pengguna sedang
 *     membuka chat itu (server sudah menandainya lewat `sedangDibuka`).
 *  2. Pesanan baru masuk -> bunyi + banner (staf KWU dan penjual).
 *  3. Status pesanan berubah -> bunyi + banner (pembeli).
 *
 * Banner ditampilkan di layar supaya pengguna yang tidak mengaktifkan izin
 * notifikasi browser tetap bisa melihat pemberitahuan.
 */

export type Banner = {
  id: number;
  judul: string;
  isi: string;
  url: string;
  jenis: string;
};

export default function NotificationSound() {
  const { user } = useAuth();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [banner, setBanner] = useState<Banner | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bunyi harus "dipanaskan" dulu lewat interaksi pengguna, karena browser
  // memblokir audio yang diputar otomatis tanpa interaksi.
  useEffect(() => {
    primeNotificationSound();
    const panaskan = () => primeNotificationSound();
    window.addEventListener("pointerdown", panaskan, { once: true });
    window.addEventListener("keydown", panaskan, { once: true });
    return () => {
      window.removeEventListener("pointerdown", panaskan);
      window.removeEventListener("keydown", panaskan);
    };
  }, []);

  // Kabarkan ke server chat mana yang sedang dibuka, supaya server tidak
  // mengirim notifikasi push untuk chat yang memang sedang dilihat.
  useEffect(() => {
    const cocok = pathname.match(/^\/chat\/([^/]+)/);
    realtime.setChatDibuka(cocok ? cocok[1] : null);
  }, [pathname]);

  // Kabarkan meja kasir yang sedang dijaga (khusus staf KWU Brital).
  useEffect(() => {
    if (!user) return;
    realtime.setUnit(user.role === "kwu_brital" ? "kwu_brital" : null);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const tampilkan = (judul: string, isi: string, url: string, jenis: string) => {
      idRef.current += 1;
      setBanner({ id: idRef.current, judul, isi, url, jenis });

      // Hilang sendiri setelah 6 detik.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setBanner(null), 6000);
    };

    const tangani = (k: KejadianRealtime) => {
      // ------------------------------------------------------- Pesan chat
      if (k.type === "chat:pesan") {
        // Pesan sendiri tidak perlu dibunyikan.
        // Disamakan dengan pembanding di halaman chat: bandingkan sebagai teks
      // supaya id bertipe string/angka sama-sama dikenali.
      if (k.pesan.sender_id != null && String(k.pesan.sender_id) === String(user.id)) return;
        // Server menandai kalau perangkat ini sedang membuka chat tersebut.
        if (k.sedangDibuka) return;
        // Cadangan: cek juga dari alamat halaman saat ini.
        if (pathnameRef.current === `/chat/${k.chatId}`) return;

        const isi = k.pesan.isi.slice(0, 140);
        playNotificationSound();
        notifLokal("Pesan baru", isi, `/chat/${k.chatId}`);
        tampilkan(
          k.pesan.jenis === "sistem" ? "Pesan sistem" : "Pesan baru",
          isi,
          `/chat/${k.chatId}`,
          "chat",
        );
        return;
      }

      // ------------------------------------------------------ Pesanan baru
      if (k.type === "order:baru") {
        // Penjual/staf saja yang perlu bunyi untuk pesanan baru.
        if (user.role !== "kwu_brital" && user.role !== "kwu_laundry") return;
        playNotificationSound();
        notifLokal("Pesanan baru", k.teks, "/kwu");
        tampilkan("Pesanan baru", k.teks, "/kwu", "pesanan");
        return;
      }

      // ------------------------------------------------ Status pesanan
      if (k.type === "order:status") {
        playNotificationSound();
        notifLokal("Status pesanan", k.teks, "/orders/status");
        tampilkan("Status pesanan", k.teks, "/orders/status", "pesanan");
        return;
      }
    };

    const lepas = realtime.langganan(tangani);
    return () => {
      lepas();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user]);

  if (!banner) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => {
        setBanner(null);
        window.location.href = banner.url;
      }}
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "min(92vw, 420px)",
        cursor: "pointer",
        background: "rgba(28, 25, 23, 0.96)",
        color: "#FAF9F7",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        backdropFilter: "blur(8px)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          marginTop: 6,
          flexShrink: 0,
          background: banner.jenis === "pesanan" ? "#F0B27A" : "#8FD5B0",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: "block", fontSize: 13, marginBottom: 2 }}>
          {banner.judul}
        </strong>
        <span style={{ display: "block", fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
          {banner.isi}
        </span>
      </span>
    </div>
  );
}

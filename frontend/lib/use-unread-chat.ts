// Lencana pesan belum dibaca — pengganti use-unread-chat.ts yang dulu
// memakai Firestore onSnapshot.
//
// Sekarang: angka awal diambil lewat HTTP, lalu diperbarui seketika lewat
// WebSocket. Jadi lencana berubah real-time di halaman mana pun.

"use client";

import { useEffect, useState } from "react";

import { useAuth } from "./auth-context";
import { totalBelumDibaca } from "./chat-utils";
import { useKejadian, useRealtime } from "./realtime";

export function useUnreadChat() {
  const { user, siap } = useAuth();
  const [total, setTotal] = useState(0);
  const { siap: wsSiap } = useRealtime();

  // Angka awal lewat HTTP (sumber kebenaran), lalu dijaga tetap segar
  // oleh kejadian WebSocket di bawah.
  const muatUlang = () =>
    void totalBelumDibaca().then((n) => setTotal(n)).catch(() => {});

  useEffect(() => {
    if (!user || !siap) {
      setTotal(0);
      return;
    }
    muatUlang();
    // Cadangan kalau WebSocket kebetulan sedang terputus.
    const t = setInterval(muatUlang, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, siap]);

  // Begitu tersambung kembali, segera selaraskan angka.
  useEffect(() => {
    if (user && siap && wsSiap) muatUlang();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSiap, user, siap]);

  // Pesan baru masuk ke chat mana pun -> tambah lencana.
  useKejadian("chat:pesan", (k) => {
    if (!user) return;
    // Pesan sendiri tidak menambah lencana.
    // Disamakan dengan pembanding di halaman chat: bandingkan sebagai teks
      // supaya id bertipe string/angka sama-sama dikenali.
      if (k.pesan.sender_id != null && String(k.pesan.sender_id) === String(user.id)) return;
    // Kalau chat itu sedang dibuka, server menandainya dan kita tidak
    // menambah lencana.
    if (k.sedangDibuka) return;
    setTotal((n) => n + 1);
  });

  // Pengguna membuka sebuah chat -> kurangi lencana untuk chat itu.
  useKejadian("chat:belum-dibaca", () => {
    muatUlang();
  });

  return { total, muatUlang };
}

/**
 * Nama lama: mengembalikan angkanya saja.
 * Dipertahankan supaya komponen yang sudah ada tidak perlu diubah.
 */
export function useUnreadChatCount(): number {
  return useUnreadChat().total;
}

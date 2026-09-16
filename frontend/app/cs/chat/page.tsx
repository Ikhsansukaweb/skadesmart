"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

// Halaman pintas: cari staf CS yang tersedia, buat/ambil chat room dengannya,
// lalu langsung redirect ke halaman chat detail-nya.
export default function ChatCsPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    async function start() {
      try {
        const { cs } = await api<{ cs: { id: number } }>("/users/staff/cs");
        const { chat } = await api<{ chat: { id: string } }>("/chats", {
          method: "POST",
          json: { seller_id: cs.id },
        });
        router.replace(`/chat/${chat.id}`);
      } catch (err: any) {
        setError(err.message || "Belum ada staf CS yang tersedia.");
      }
    }
    start();
  }, [router]);

  return (
    <main className="min-h-screen">
      <Navbar />
      <p className="text-center py-10 text-fog font-body">
        {error || "Menghubungkan ke CS..."}
      </p>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Trash2, Star } from "lucide-react";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { sendRatingRequest } from "@/lib/chat-utils";

interface OrderItem {
  product_name: string;
  quantity: number;
}

interface HistoryOrder {
  id: number;
  buyer_id: number;
  buyer_name: string;
  buyer_class: string;
  total_price: number;
  status: string;
  items: OrderItem[];
  created_at: string;
}

const DONE_STATUSES = ["selesai", "dibatalkan"];

// Riwayat: pesanan yang sudah selesai/dibatalkan, terpisah dari Pesanan Aktif.
// Bisa hapus riwayat, atau kirim kartu permintaan rating ke chat pembeli.
export default function BritalHistoryPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    api<{ orders: HistoryOrder[] }>("/orders/incoming")
      .then((d) => setOrders(d.orders.filter((o) => DONE_STATUSES.includes(o.status))))
      .catch(() => {});
  }

  useEffect(load, []);

  async function handleDelete(id: number) {
    if (!confirm("Hapus riwayat pesanan ini?")) return;
    setBusyId(id);
    try {
      await api(`/orders/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestRating(order: HistoryOrder) {
    if (!user) return;
    setBusyId(order.id);
    try {
      await sendRatingRequest(user.id, order.buyer_id, order.id);
      alert("Permintaan rating terkirim ke chat pembeli.");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (user && user.role !== "kwu_brital" && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus staf KWU Brital.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Link href="/dashboard/brital" className="inline-flex items-center gap-2 text-sm text-brand-600 font-sub">
          <ArrowLeft size={16} aria-hidden="true" /> Kembali ke Dashboard
        </Link>
        <h1 className="text-2xl text-brand-700">Riwayat Pesanan</h1>

        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-sub font-medium">{o.buyer_name}</h3>
                  <p className="text-sm text-steel font-body">{o.buyer_class}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <ul className="text-sm font-body text-steel space-y-0.5">
                {o.items.map((it, idx) => <li key={idx}>{it.product_name} x{it.quantity}</li>)}
              </ul>
              <p className="font-heading text-brand-700">Rp{o.total_price.toLocaleString("id-ID")}</p>

              <div className="flex gap-2 pt-1 flex-wrap">
                {o.status === "selesai" && (
                  <button
                    onClick={() => handleRequestRating(o)}
                    disabled={busyId === o.id}
                    className="btn-secondary text-sm flex items-center gap-2"
                  >
                    {busyId === o.id ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Star size={14} aria-hidden="true" />}
                    Minta Rating
                  </button>
                )}
                <button
                  onClick={() => handleDelete(o.id)}
                  disabled={busyId === o.id}
                  className="text-sm text-ember-600 flex items-center gap-2 px-3 py-2"
                >
                  <Trash2 size={14} aria-hidden="true" /> Hapus Riwayat
                </button>
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-fog font-body text-sm">Belum ada riwayat.</p>}
        </div>
      </div>
    </main>
  );
}

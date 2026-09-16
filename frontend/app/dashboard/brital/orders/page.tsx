"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface OrderItem {
  product_name: string;
  unit_price: number;
  quantity: number;
  note: string | null;
}

interface IncomingOrder {
  id: number;
  buyer_name: string;
  buyer_class: string;
  total_price: number;
  status: string;
  note: string | null;
  items: OrderItem[];
  created_at: string;
}

const NEXT_STATUS: Record<string, string[]> = {
  baru: ["diproses", "dibatalkan"],
  diproses: ["diantar", "dibatalkan"],
  diantar: ["selesai"],
};

const STATUS_LABEL: Record<string, string> = {
  diproses: "Proses Pesanan",
  diantar: "Antar Pesanan",
  selesai: "Tandai Selesai",
  dibatalkan: "Batalkan",
};

const ACTIVE_STATUSES = ["baru", "diproses", "diantar"];

// Pesanan Aktif - hanya yang sedang berjalan (baru/diproses/diantar).
// Yang sudah selesai/dibatalkan otomatis pindah ke halaman Riwayat.
export default function BritalOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  function load() {
    api<{ orders: IncomingOrder[] }>("/orders/incoming")
      .then((d) => setOrders(d.orders.filter((o) => ACTIVE_STATUSES.includes(o.status))))
      .catch(() => {});
  }

  useEffect(load, []);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await api(`/orders/${id}/brital-status`, { method: "PUT", json: { status } });
      load();
    } finally {
      setUpdatingId(null);
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
        <h1 className="text-2xl text-brand-700">Pesanan Aktif</h1>

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
                {o.items.map((it, idx) => (
                  <li key={idx}>
                    {it.product_name} x{it.quantity}
                    {it.note && <span className="text-fog italic"> - {it.note}</span>}
                  </li>
                ))}
              </ul>
              {o.note && <p className="text-sm text-steel font-body italic">Catatan pesanan: {o.note}</p>}

              <p className="font-heading text-brand-700">Rp{o.total_price.toLocaleString("id-ID")}</p>

              {NEXT_STATUS[o.status]?.length > 0 && (
                <div className="flex gap-2 pt-1 flex-wrap">
                  {NEXT_STATUS[o.status].map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(o.id, s)}
                      disabled={updatingId === o.id}
                      className={s === "dibatalkan" ? "btn-secondary text-sm flex items-center gap-2" : "btn-primary text-sm flex items-center gap-2"}
                    >
                      {updatingId === o.id && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {orders.length === 0 && <p className="text-fog font-body text-sm">Tidak ada pesanan aktif saat ini.</p>}
        </div>
      </div>
    </main>
  );
}

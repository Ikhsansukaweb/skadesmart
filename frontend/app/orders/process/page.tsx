"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";

interface IncomingOrder {
  id: number;
  product_name: string;
  buyer_name: string;
  buyer_class: string;
  quantity: number;
  total_price: number;
  status: string;
  note: string | null;
  created_at: string;
}

const NEXT_STATUS: Record<string, string[]> = {
  baru: ["diproses", "dibatalkan"],
  diproses: ["selesai", "diambil", "dibatalkan"],
  selesai: [],
  diambil: [],
  dibatalkan: [],
};

const STATUS_LABEL: Record<string, string> = {
  diproses: "Proses",
  selesai: "Selesai",
  diambil: "Sudah Diambil",
  dibatalkan: "Batalkan",
};

// Halaman khusus penjual unit KWU (Brital & Laundry) untuk melihat & mengubah
// status pesanan masuk (bagian 4, halaman #6).
export default function ProcessOrdersPage() {
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  function load() {
    api<{ orders: IncomingOrder[] }>("/orders/incoming").then((d) => setOrders(d.orders)).catch(() => {});
  }

  useEffect(load, []);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await api(`/orders/${id}/status`, { method: "PUT", json: { status } });
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl text-brand-700">Proses Pesanan</h1>
        <p className="text-sm text-steel font-body">
          Ubah status pesanan yang masuk. Siswa pemesan akan menerima notifikasi otomatis setiap perubahan status.
        </p>

        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-sub font-medium">{o.product_name} x{o.quantity}</h3>
                  <p className="text-sm text-steel font-body">
                    {o.buyer_name} - {o.buyer_class}
                  </p>
                  {o.note && <p className="text-sm text-steel font-body italic">Catatan: {o.note}</p>}
                </div>
                <StatusBadge status={o.status} />
              </div>
              <p className="font-heading text-brand-700">Rp{o.total_price.toLocaleString("id-ID")}</p>

              {NEXT_STATUS[o.status]?.length > 0 && (
                <div className="flex gap-2 pt-1">
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
          {orders.length === 0 && <p className="text-fog font-body text-sm">Belum ada pesanan masuk.</p>}
        </div>
      </div>
    </main>
  );
}

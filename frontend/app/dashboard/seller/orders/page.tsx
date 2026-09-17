"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  ShoppingBag,
  Loader2,
  Check,
  Clock,
  Package,
  X,
  ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";

interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  note?: string;
}
interface Pesanan {
  id: number;
  buyer_id: number;
  buyer_name: string;
  buyer_class: string;
  buyer_nisn: string;
  kwu_unit: string;
  status: string;
  payment_status: string;
  total_price: number;
  note: string | null;
  created_at: string;
  items: OrderItem[];
}

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  baru: {
    label: "Baru",
    color: "bg-peran-aksi-lembut text-peran-aksi",
    icon: Clock,
  },
  diproses: {
    label: "Diproses",
    color: "bg-peran-peringatan-lembut text-peran-peringatan",
    icon: Package,
  },
  selesai: {
    label: "Selesai",
    color: "bg-peran-naik-lembut text-peran-naik",
    icon: Check,
  },
  dibatalkan: {
    label: "Dibatalkan",
    color: "bg-peran-aksen-lembut text-peran-aksen",
    icon: X,
  },
};

function formatTanggal(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SellerOrdersPage() {
  const [pesanan, setPesanan] = useState<Pesanan[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [filter, setFilter] = useState<string>("semua");
  const [updateId, setUpdateId] = useState<number | null>(null);
  const [sedangUpdate, setSedangUpdate] = useState(false);
  const [expandId, setExpandId] = useState<number | null>(null);

  function muat() {
    setMemuat(true);
    api<{ orders: Pesanan[] }>("/orders/sold")
      .then((d) => setPesanan(d.orders || []))
      .catch(() => setPesanan([]))
      .finally(() => setMemuat(false));
  }

  useEffect(() => {
    muat();
  }, []);

  async function updateStatus(id: number, status: string) {
    setSedangUpdate(true);
    try {
      await api(`/orders/${id}/seller-status`, {
        method: "PUT",
        json: { status },
      });
      setPesanan((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
      setUpdateId(null);
    } catch (e: any) {
      alert(e.message || "Gagal memperbarui status.");
    } finally {
      setSedangUpdate(false);
    }
  }

  const filtered =
    filter === "semua"
      ? pesanan
      : filter === "aktif"
        ? pesanan.filter((p) => ["baru", "diproses"].includes(p.status))
        : pesanan.filter((p) => p.status === filter);

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-6">
      {/* ---------- Header ---------- */}
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-heading text-peran-utama sm:text-2xl">
          Pesanan Masuk
        </h1>
        <p className="mt-0.5 text-sm text-peran-kedua">
          Pesanan dari pembeli ke tokomu. Update status untuk memberi tahu pembeli.
        </p>
      </div>

      {/* ---------- Filter ---------- */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { v: "semua", l: "Semua" },
          { v: "aktif", l: "Aktif" },
          { v: "baru", l: "Baru" },
          { v: "diproses", l: "Diproses" },
          { v: "selesai", l: "Selesai" },
          { v: "dibatalkan", l: "Dibatalkan" },
        ].map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-sub font-semibold transition-colors ${
              filter === f.v
                ? "bg-peran-aksi text-peran-terang"
                : "bg-peran-kartu text-peran-kedua border border-peran-garis hover:bg-peran-sorot"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* ---------- Daftar pesanan ---------- */}
      {memuat ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-peran-aksi" aria-hidden="true" />
          <span className="ml-2 text-peran-kedua">Memuat pesanan...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-peran-lembut flex items-center justify-center text-peran-samar">
            <ShoppingBag size={28} aria-hidden="true" />
          </div>
          <div>
            <p className="font-sub font-semibold text-peran-utama">
              Belum ada pesanan
            </p>
            <p className="text-sm text-peran-kedua mt-1">
              Pesanan dari pembeli akan muncul di sini.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.baru;
            const StatusIcon = sc.icon;
            const isExpanded = expandId === p.id;
            return (
              <div key={p.id} className="card overflow-hidden">
                {/* Header baris */}
                <button
                  type="button"
                  onClick={() => setExpandId(isExpanded ? null : p.id)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-peran-sorot transition-colors"
                  aria-expanded={isExpanded}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${sc.color}`}
                  >
                    <StatusIcon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-sub font-semibold text-peran-utama">
                        #{p.id} - {p.buyer_name}
                      </p>
                      <span
                        className={`text-[11px] font-sub px-2 py-0.5 rounded-full ${sc.color}`}
                      >
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-caption text-peran-kedua mt-0.5">
                      {p.buyer_class} - {formatTanggal(p.created_at)}
                    </p>
                    <p className="text-sm font-sub text-peran-utama mt-1">
                      {p.items.length > 0
                        ? p.items
                            .map((i) => `${i.product_name} x${i.quantity}`)
                            .join(", ")
                        : "Pesanan"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-sub font-semibold text-peran-utama">
                      {rupiah(p.total_price)}
                    </p>
                    <ChevronDown
                      size={14}
                      className={`text-peran-samar mt-1 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                </button>

                {/* Detail item + aksi */}
                {isExpanded && (
                  <div className="border-t border-peran-garis p-4 space-y-3 bg-peran-halaman">
                    {/* Item */}
                    {p.items.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">
                          Item
                        </p>
                        {p.items.map((i, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <div>
                              <span className="text-peran-utama">
                                {i.product_name}
                              </span>
                              <span className="text-peran-kedua">
                                {" "}
                                x{i.quantity}
                              </span>
                            </div>
                            <span className="text-peran-utama font-sub">
                              {rupiah(i.unit_price * i.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Catatan pembeli */}
                    {p.note && (
                      <div>
                        <p className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide mb-0.5">
                          Catatan Pembeli
                        </p>
                        <p className="text-sm text-peran-utama bg-peran-kartu rounded-badge p-2">
                          {p.note}
                        </p>
                      </div>
                    )}

                    {/* Aksi update status */}
                    {p.status !== "selesai" && p.status !== "dibatalkan" && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-peran-garis">
                        <p className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide mr-auto">
                          Update Status
                        </p>
                        {updateId === p.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => updateStatus(p.id, "diproses")}
                              disabled={sedangUpdate}
                              className="rounded-full bg-peran-peringatan px-3 py-1.5 text-xs font-sub font-semibold text-white hover:bg-peran-peringatan/80 disabled:opacity-50"
                            >
                              Proses
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStatus(p.id, "selesai")}
                              disabled={sedangUpdate}
                              className="rounded-full bg-peran-naik px-3 py-1.5 text-xs font-sub font-semibold text-white hover:bg-peran-naik/80 disabled:opacity-50"
                            >
                              Selesai
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStatus(p.id, "dibatalkan")}
                              disabled={sedangUpdate}
                              className="rounded-full bg-peran-aksen px-3 py-1.5 text-xs font-sub font-semibold text-peran-terang hover:bg-peran-aksen-hover disabled:opacity-50"
                            >
                              Batalkan
                            </button>
                            <button
                              type="button"
                              onClick={() => setUpdateId(null)}
                              className="rounded-full border border-peran-garis-tegas px-3 py-1.5 text-xs font-sub font-semibold text-peran-kedua hover:bg-peran-sorot"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setUpdateId(p.id)}
                            className="rounded-full bg-peran-aksi px-4 py-1.5 text-xs font-sub font-semibold text-peran-terang hover:bg-peran-aksi-hover"
                          >
                            Ubah Status
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

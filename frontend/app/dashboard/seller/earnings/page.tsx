"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  ShoppingBag,
  Check,
  Clock,
  Loader2,
  Download,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import SalesChart from "@/components/SalesChart";

interface Ringkas {
  total_pesanan: number;
  total_pendapatan: number;
  pesanan_aktif: number;
  pesanan_selesai: number;
}
interface DayStat {
  day: string;
  count: number;
  revenue: number;
}
interface Terlaris {
  product_id: number;
  product_name: string;
  terjual: number;
  pendapatan: number;
}
interface Pesanan {
  id: number;
  buyer_name: string;
  buyer_class: string;
  status: string;
  total_price: number;
  created_at: string;
  items: { product_name: string; quantity: number; unit_price: number }[];
}

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

export default function SellerEarningsPage() {
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [days, setDays] = useState<DayStat[]>([]);
  const [terlaris, setTerlaris] = useState<Terlaris[]>([]);
  const [pesanan, setPesanan] = useState<Pesanan[]>([]);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ ringkas: Ringkas; days: DayStat[]; terlaris: Terlaris[] }>(
        "/orders/seller-stats"
      ).catch(() => ({ ringkas: null, days: [], terlaris: [] })),
      api<{ orders: Pesanan[] }>("/orders/sold").catch(() => ({
        orders: [],
      })),
    ]).then(([a, b]) => {
      setRingkas(a.ringkas || null);
      setDays(a.days || []);
      setTerlaris(a.terlaris || []);
      setPesanan(
        (b.orders || []).filter((o) => o.status === "selesai")
      );
      setMemuat(false);
    });
  }, []);

  // Total pendapatan 7 hari terakhir
  const pendapatan7Hari = days.reduce((sum, d) => sum + d.revenue, 0);
  const pesanan7Hari = days.reduce((sum, d) => sum + d.count, 0);

  function exportCSV() {
    if (pesanan.length === 0) return;
    const rows = pesanan.map((o) => ({
      id: o.id,
      pembeli: o.buyer_name,
      kelas: o.buyer_class,
      item: o.items.map((i) => `${i.product_name} x${i.quantity}`).join(", "),
      total: o.total_price,
      tanggal: o.created_at,
    }));
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => JSON.stringify(r[h as keyof typeof r] ?? "")).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pendapatan-seller.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-6">
      {/* ---------- Header ---------- */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-heading text-peran-utama sm:text-2xl">
            Pendapatan
          </h1>
          <p className="mt-0.5 text-sm text-peran-kedua">
            Ringkasan pendapatan dari penjualanmu.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          disabled={pesanan.length === 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-peran-garis-tegas px-4 py-2 text-sm font-sub font-semibold text-peran-utama hover:bg-peran-sorot disabled:opacity-50"
        >
          <Download size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      {memuat ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-peran-aksi" aria-hidden="true" />
          <span className="ml-2 text-peran-kedua">Memuat data...</span>
        </div>
      ) : (
        <>
          {/* ---------- Kartu statistik ---------- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              icon={<TrendingUp size={20} aria-hidden="true" />}
              label="Total Pendapatan"
              value={rupiah(ringkas?.total_pendapatan ?? 0)}
              tone="positive"
            />
            <StatCard
              icon={<Check size={20} aria-hidden="true" />}
              label="Pesanan Selesai"
              value={String(ringkas?.pesanan_selesai ?? 0)}
              tone="positive"
            />
            <StatCard
              icon={<Clock size={20} aria-hidden="true" />}
              label="Pesanan Aktif"
              value={String(ringkas?.pesanan_aktif ?? 0)}
              tone="neutral"
            />
            <StatCard
              icon={<ShoppingBag size={20} aria-hidden="true" />}
              label="Total Pesanan"
              value={String(ringkas?.total_pesanan ?? 0)}
              tone="neutral"
            />
          </div>

          {/* ---------- Grafik 7 hari ---------- */}
          <div className="mb-6">
            <SalesChart days={days} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="card p-3 text-center">
                <p className="text-caption text-peran-kedua">
                  Pendapatan 7 Hari
                </p>
                <p className="text-lg font-sub font-semibold text-peran-naik">
                  {rupiah(pendapatan7Hari)}
                </p>
              </div>
              <div className="card p-3 text-center">
                <p className="text-caption text-peran-kedua">
                  Pesanan 7 Hari
                </p>
                <p className="text-lg font-sub font-semibold text-peran-utama">
                  {pesanan7Hari}
                </p>
              </div>
            </div>
          </div>

          {/* ---------- Produk terlaris ---------- */}
          <div className="card p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy size={18} className="text-peran-aksi" aria-hidden="true" />
                <h3 className="font-sub font-semibold text-sm text-peran-utama">
                  Produk Terlaris
                </h3>
              </div>
            </div>
            {terlaris.length === 0 ? (
              <p className="text-caption text-peran-samar py-4 text-center">
                Belum ada produk terjual.
              </p>
            ) : (
              <div className="divide-y divide-peran-garis">
                {terlaris.map((p, idx) => (
                  <div key={p.product_id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-peran-aksi text-peran-terang text-xs font-sub font-semibold">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-sub font-medium text-peran-utama truncate">
                        {p.product_name}
                      </p>
                      <p className="text-caption text-peran-kedua">
                        {p.terjual} terjual
                      </p>
                    </div>
                    <p className="text-sm font-sub font-semibold text-peran-naik shrink-0">
                      {rupiah(p.pendapatan)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Riwayat transaksi selesai ---------- */}
          <div className="card p-4">
            <h3 className="font-sub font-semibold text-sm text-peran-utama mb-3">
              Riwayat Transaksi Selesai
            </h3>
            {pesanan.length === 0 ? (
              <p className="text-caption text-peran-samar py-4 text-center">
                Belum ada transaksi selesai.
              </p>
            ) : (
              <div className="divide-y divide-peran-garis">
                {pesanan.slice(0, 20).map((o) => (
                  <div key={o.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-sub font-medium text-peran-utama truncate">
                          #{o.id} - {o.buyer_name}
                        </p>
                        <p className="text-caption text-peran-kedua">
                          {o.buyer_class} -{" "}
                          {new Date(o.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <p className="text-sm font-sub font-semibold text-peran-naik shrink-0">
                        {rupiah(o.total_price)}
                      </p>
                    </div>
                    {o.items.length > 0 && (
                      <p className="text-caption text-peran-samar mt-1 truncate">
                        {o.items
                          .map((i) => `${i.product_name} x${i.quantity}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "positive" | "neutral";
}) {
  const toneClass =
    tone === "positive" ? "text-peran-naik" : "text-peran-utama";
  return (
    <div className="card p-4 space-y-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
        {icon}
      </span>
      <div>
        <p className="text-caption text-peran-kedua">{label}</p>
        <p className={`text-lg font-sub font-semibold ${toneClass} truncate`}>
          {value}
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Shirt,
  PackagePlus,
  PackageCheck,
  CircleDot,
  Wallet,
  Scale,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
  Clock,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import SalesChart from "@/components/SalesChart";
import DashboardShell from "@/components/dashboard/DashboardShell";
import {
  AlertCard,
  ExportCard,
  ProfileCard,
  UnitCard,
  ListCard,
  ListRow,
} from "@/components/dashboard/DashboardWidgets";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface DayStat {
  day: string;
  count: number;
  revenue: number;
}
interface OrderItem {
  product_name: string;
  quantity: number;
}
interface IncomingOrder {
  id: number;
  buyer_name: string;
  buyer_class: string;
  total_price: number;
  status: string;
  items: OrderItem[];
  created_at: string;
  weight_kg?: number | null;
  payment_status?: string;
}

const ACTIVE_STATUSES = ["dicuci", "bisa_diambil"];
const DONE_STATUSES = ["selesai", "dibatalkan"];

const STATUS_LABEL: Record<string, string> = {
  dicuci: "Dicuci",
  bisa_diambil: "Bisa Diambil",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

// Stat card ringkas dengan ikon & nilai besar.
function QuickStatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: any;
  tone?: "positive" | "neutral" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-peran-naik"
      : tone === "warning"
        ? "text-peran-peringatan"
        : "text-peran-aksi";
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-peran-kedua font-body">{label}</p>
        <Icon size={16} className={toneClass} aria-hidden="true" />
      </div>
      <p className="font-heading font-semibold text-xl text-peran-utama">{value}</p>
    </div>
  );
}

// Progress bar untuk status pembayaran (sudah bayar vs belum bayar).
function PaymentStatusCard({ orders }: { orders: IncomingOrder[] }) {
  const paid = orders.filter((o) => o.payment_status === "sudah_bayar").length;
  const unpaid = orders.filter((o) => o.payment_status === "belum_bayar").length;
  const total = paid + unpaid;
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Status Pembayaran</h3>
      {total === 0 ? (
        <p className="text-caption text-peran-samar py-4 text-center">Belum ada data pembayaran.</p>
      ) : (
        <>
          <div className="flex h-6 rounded-full overflow-hidden">
            <div
              className="bg-peran-naik flex items-center justify-center"
              style={{ width: `${paidPct}%` }}
            >
              {paidPct >= 15 && (
                <span className="text-[10px] font-sub font-medium text-peran-terang">{paidPct}%</span>
              )}
            </div>
            <div
              className="bg-peran-peringatan flex items-center justify-center"
              style={{ width: `${100 - paidPct}%` }}
            >
              {100 - paidPct >= 15 && (
                <span className="text-[10px] font-sub font-medium text-peran-terang">{100 - paidPct}%</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-sub">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-peran-naik" aria-hidden="true" />
              <span className="text-peran-kedua">Sudah bayar</span>
              <span className="font-medium text-peran-utama">{paid}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-peran-peringatan" aria-hidden="true" />
              <span className="text-peran-kedua">Belum bayar</span>
              <span className="font-medium text-peran-utama">{unpaid}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Analytics berat cucian: total kg, rata-rata per order, distribusi berat.
function WeightAnalyticsCard({ orders }: { orders: IncomingOrder[] }) {
  const stats = useMemo(() => {
    const withWeight = orders.filter((o) => o.weight_kg && o.weight_kg > 0);
    const totalKg = withWeight.reduce((s, o) => s + (o.weight_kg || 0), 0);
    const avgKg = withWeight.length > 0 ? totalKg / withWeight.length : 0;
    const maxKg = Math.max(0, ...withWeight.map((o) => o.weight_kg || 0));
    return { totalKg: Math.round(totalKg * 10) / 10, avgKg: Math.round(avgKg * 10) / 10, maxKg: Math.round(maxKg * 10) / 10 };
  }, [orders]);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-peran-aksi" aria-hidden="true" />
        <h3 className="font-sub font-semibold text-sm text-peran-utama">Analitik Berat Cucian</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="space-y-0.5">
          <p className="font-heading font-semibold text-lg text-peran-utama">{stats.totalKg}</p>
          <p className="text-[10px] text-peran-kedua font-body">Total kg</p>
        </div>
        <div className="space-y-0.5">
          <p className="font-heading font-semibold text-lg text-peran-aksi">{stats.avgKg}</p>
          <p className="text-[10px] text-peran-kedua font-body">Rata-rata</p>
        </div>
        <div className="space-y-0.5">
          <p className="font-heading font-semibold text-lg text-peran-aksen">{stats.maxKg}</p>
          <p className="text-[10px] text-peran-kedua font-body">Tertinggi</p>
        </div>
      </div>
    </div>
  );
}

// Donut chart SVG untuk breakdown status pesanan aktif laundry.
function LaundryStatusDonut({ orders }: { orders: IncomingOrder[] }) {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [orders]);

  const total = orders.length;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  let offsetAccum = 0;
  const STATUS_COLOR: Record<string, string> = {
    dicuci: "#f59e0b",
    bisa_diambil: "#16a34a",
  };

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Status Cucian Aktif</h3>
      {total === 0 ? (
        <p className="text-caption text-peran-samar py-4 text-center">Tidak ada cucian aktif.</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--bg-lembut)" strokeWidth="10" />
            {statusCounts.map(({ status, count }) => {
              const dash = (count / total) * circumference;
              const el = (
                <circle
                  key={status}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={STATUS_COLOR[status] || "#999"}
                  strokeWidth="10"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offsetAccum}
                  transform="rotate(-90 50 50)"
                />
              );
              offsetAccum += dash;
              return el;
            })}
            <text x="50" y="48" textAnchor="middle" className="fill-peran-utama font-sub font-semibold" fontSize="18">
              {total}
            </text>
            <text x="50" y="62" textAnchor="middle" className="fill-peran-kedua font-body" fontSize="9">
              cucian
            </text>
          </svg>
          <div className="space-y-2 flex-1">
            {statusCounts.map(({ status, count }) => (
              <div key={status} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLOR[status] || "#999" }}
                />
                <span className="text-xs font-sub text-peran-kedua flex-1">
                  {STATUS_LABEL[status] || status}
                </span>
                <span className="text-xs font-sub font-medium text-peran-utama">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LaundryDashboardOverview() {
  const { user } = useAuth();
  const [days, setDays] = useState<DayStat[]>([]);
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [shopOpen, setShopOpen] = useState<number | null>(null);

  useEffect(() => {
    api<{ days: DayStat[] }>("/orders/stats").then((d) => setDays(d.days)).catch(() => {});
    api<{ orders: IncomingOrder[] }>("/orders/incoming").then((d) => setOrders(d.orders)).catch(() => {});
    api<{ user: { shop_open: number } }>("/account").then((d) => setShopOpen(d.user.shop_open)).catch(() => {});
  }, []);

  async function toggleShop() {
    if (shopOpen === null) return;
    await api("/account/shop-status", { method: "PUT", json: { shop_open: !shopOpen } });
    setShopOpen(shopOpen ? 0 : 1);
  }

  if (user && user.role !== "kwu_laundry" && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus staf KWU Laundry.</p>
      </main>
    );
  }

  const incoming = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const history = orders.filter((o) => DONE_STATUSES.includes(o.status));

  // Hitung stat ringkas
  const weekRevenue = useMemo(() => days.reduce((sum, d) => sum + d.revenue, 0), [days]);

  const totalWeight = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.weight_kg || 0), 0);
  }, [orders]);

  const avgPricePerKg = useMemo(() => {
    const withWeight = history.filter((o) => o.weight_kg && o.weight_kg > 0 && o.status === "selesai");
    if (withWeight.length === 0) return 0;
    const totalRev = withWeight.reduce((s, o) => s + o.total_price, 0);
    const totalKg = withWeight.reduce((s, o) => s + (o.weight_kg || 0), 0);
    return totalKg > 0 ? Math.round(totalRev / totalKg) : 0;
  }, [history]);

  return (
    <DashboardShell
      role="kwu_laundry"
      greetingName={user?.full_name || "Kak"}
      subtitle="Dashboard Laundry"
      rightPanel={
        <>
          <AlertCard
            active={shopOpen === 0}
            message="Layanan Laundry sedang ditandai tutup. Siswa tidak bisa titip cucian sampai kamu buka lagi."
            actionLabel="Buka Layanan Sekarang"
            onAction={toggleShop}
          />
          <ProfileCard ctaLabel="Ubah Status Toko" onCta={toggleShop} />
          <UnitCard
            unitName="KWU Laundry"
            statusLabel={shopOpen ? "Layanan sedang buka" : "Layanan sedang tutup"}
            isOpen={!!shopOpen}
          />
          <ExportCard
            label="Riwayat laundry"
            rows={history.map((o) => ({
              id: o.id,
              pelanggan: o.buyer_name,
              kelas: o.buyer_class,
              total: o.total_price,
              status: o.status,
              tanggal: o.created_at,
            }))}
          />
        </>
      }
    >
      {/* Header unit + toggle status */}
      <div className="flex items-center gap-2 mb-1">
        <Shirt size={18} className="text-peran-aksi" aria-hidden="true" />
        <span className="font-sub text-sm text-peran-kedua">KWU Laundry</span>
        {shopOpen !== null && (
          <button
            onClick={toggleShop}
            className={`ml-auto text-xs font-sub px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
              shopOpen ? "bg-peran-naik-lembut text-peran-naik" : "bg-peran-aksen-lembut text-peran-aksen"
            }`}
          >
            <CircleDot size={12} aria-hidden="true" />
            {shopOpen ? "Buka" : "Tutup"}
          </button>
        )}
        <Link
          href="/dashboard/laundry/chat"
          className="text-xs font-sub px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-peran-aksi-lembut text-peran-aksi hover:bg-peran-aksi hover:text-peran-terang transition-colors"
        >
          <MessageCircle size={12} aria-hidden="true" />
          Chat Laundry
        </Link>
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStatCard
          label="Cucian Aktif"
          value={incoming.length}
          icon={ShoppingBag}
          tone={incoming.length > 0 ? "warning" : "neutral"}
        />
        <QuickStatCard
          label="Total Berat"
          value={`${Math.round(totalWeight * 10) / 10} kg`}
          icon={Scale}
        />
        <QuickStatCard
          label="Pendapatan 7 Hari"
          value={`Rp${weekRevenue.toLocaleString("id-ID")}`}
          icon={TrendingUp}
          tone="positive"
        />
        <QuickStatCard
          label="Rata-rata/kg"
          value={avgPricePerKg > 0 ? `Rp${avgPricePerKg.toLocaleString("id-ID")}` : "-"}
          icon={Wallet}
        />
      </div>

      {/* Sales chart */}
      <SalesChart days={days} />

      {/* Status donut + payment status + weight analytics */}
      <div className="grid md:grid-cols-3 gap-4">
        <LaundryStatusDonut orders={incoming} />
        <PaymentStatusCard orders={orders} />
        <WeightAnalyticsCard orders={orders} />
      </div>

      {/* Pesanan masuk + riwayat */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard
          title="Pesanan Masuk"
          seeAllHref="/dashboard/laundry/orders"
          emptyLabel={incoming.length === 0 ? "Belum ada pesanan aktif." : undefined}
        >
          {incoming.slice(0, 5).map((o) => (
            <ListRow
              key={o.id}
              icon={<PackagePlus size={16} aria-hidden="true" />}
              title={o.weight_kg ? `${o.weight_kg} kg` : "Cucian"}
              subtitle={`${o.buyer_name} - ${o.buyer_class}`}
              value={`Rp${o.total_price.toLocaleString("id-ID")}`}
              tone="neutral"
            />
          ))}
        </ListCard>

        <ListCard
          title="Riwayat Terbaru"
          seeAllHref="/dashboard/laundry/history"
          emptyLabel={history.length === 0 ? "Belum ada riwayat." : undefined}
        >
          {history.slice(0, 5).map((o) => (
            <ListRow
              key={o.id}
              icon={<PackageCheck size={16} aria-hidden="true" />}
              title={o.weight_kg ? `${o.weight_kg} kg` : "Cucian"}
              subtitle={`${o.buyer_name} - ${o.buyer_class}`}
              value={o.status === "dibatalkan" ? "Dibatalkan" : `Rp${o.total_price.toLocaleString("id-ID")}`}
              tone={o.status === "dibatalkan" ? "negative" : "positive"}
            />
          ))}
        </ListCard>
      </div>
    </DashboardShell>
  );
}

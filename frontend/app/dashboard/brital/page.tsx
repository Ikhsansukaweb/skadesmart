"use client";

import { useEffect, useState, useMemo } from "react";
import {
  UtensilsCrossed,
  PackagePlus,
  PackageCheck,
  CircleDot,
  Clock,
  Wallet,
  TrendingUp,
  ShoppingBag,
  Flame,
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
}

const ACTIVE_STATUSES = ["baru", "diproses", "diantar"];
const DONE_STATUSES = ["selesai", "dibatalkan"];

const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  diproses: "Diproses",
  diantar: "Diantar",
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

// Donut chart SVG sederhana untuk breakdown status pesanan aktif.
function OrderStatusDonut({ orders }: { orders: IncomingOrder[] }) {
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
    baru: "#5196fe",
    diproses: "#f59e0b",
    diantar: "#16a34a",
  };

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Status Pesanan Aktif</h3>
      {total === 0 ? (
        <p className="text-caption text-peran-samar py-4 text-center">Tidak ada pesanan aktif.</p>
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
              pesanan
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

// Top products berdasarkan jumlah terjual dari riwayat pesanan.
function TopProductsCard({ orders }: { orders: IncomingOrder[] }) {
  const topProducts = useMemo(() => {
    const productCounts: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "selesai") {
        for (const item of o.items) {
          productCounts[item.product_name] = (productCounts[item.product_name] || 0) + item.quantity;
        }
      }
    }
    return Object.entries(productCounts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [orders]);

  const maxQty = Math.max(1, ...topProducts.map((p) => p.qty));

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flame size={16} className="text-peran-aksen" aria-hidden="true" />
        <h3 className="font-sub font-semibold text-sm text-peran-utama">Produk Terlaris</h3>
      </div>
      {topProducts.length === 0 ? (
        <p className="text-caption text-peran-samar py-4 text-center">Belum ada data penjualan.</p>
      ) : (
        <div className="space-y-2">
          {topProducts.map((p, i) => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="text-xs font-sub font-medium text-peran-samar w-5 shrink-0">{i + 1}.</span>
              <span className="text-xs font-body text-peran-utama flex-1 truncate">{p.name}</span>
              <div className="w-16 h-4 bg-peran-lembut rounded-full overflow-hidden">
                <div
                  className="h-full bg-peran-aksi rounded-full"
                  style={{ width: `${(p.qty / maxQty) * 100}%` }}
                />
              </div>
              <span className="text-xs font-sub font-medium text-peran-utama w-6 text-right">{p.qty}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BritalDashboardOverview() {
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

  if (user && user.role !== "kwu_brital" && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus staf KWU Brital.</p>
      </main>
    );
  }

  const incoming = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const history = orders.filter((o) => DONE_STATUSES.includes(o.status));

  // Hitung stat ringkas dari data yang tersedia
  const todayRevenue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = history.filter((o) => o.created_at?.startsWith(today) && o.status === "selesai");
    return todayOrders.reduce((sum, o) => sum + o.total_price, 0);
  }, [history]);

  const weekRevenue = useMemo(() => {
    return days.reduce((sum, d) => sum + d.revenue, 0);
  }, [days]);

  const avgOrderValue = useMemo(() => {
    const selesai = history.filter((o) => o.status === "selesai");
    if (selesai.length === 0) return 0;
    return Math.round(selesai.reduce((s, o) => s + o.total_price, 0) / selesai.length);
  }, [history]);

  return (
    <DashboardShell
      role="kwu_brital"
      greetingName={user?.full_name || "Kak"}
      subtitle="Dashboard Brital"
      rightPanel={
        <>
          <AlertCard
            active={shopOpen === 0}
            message="Toko Ayam Geprek Brital sedang ditandai tutup. Pembeli tidak bisa memesan sampai kamu buka lagi."
            actionLabel="Buka Toko Sekarang"
            onAction={toggleShop}
          />
          <ProfileCard ctaLabel="Ubah Status Toko" onCta={toggleShop} />
          <UnitCard
            unitName="Ayam Geprek Brital"
            statusLabel={shopOpen ? "Toko sedang buka" : "Toko sedang tutup"}
            isOpen={!!shopOpen}
          />
          <ExportCard
            label="Riwayat penjualan Brital"
            rows={history.map((o) => ({
              id: o.id,
              pembeli: o.buyer_name,
              kelas: o.buyer_class,
              total: o.total_price,
              status: o.status,
              tanggal: o.created_at,
            }))}
          />
        </>
      }
    >
      {/* Header unit + toggle status toko */}
      <div className="flex items-center gap-2 mb-1">
        <UtensilsCrossed size={18} className="text-peran-aksi" aria-hidden="true" />
        <span className="font-sub text-sm text-peran-kedua">Ayam Geprek Brital</span>
        {shopOpen !== null && (
          <button
            onClick={toggleShop}
            className={`ml-auto text-xs font-sub px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
              shopOpen ? "bg-peran-naik-lembut text-peran-naik" : "bg-peran-aksen-lembut text-peran-aksen"
            }`}
          >
            <CircleDot size={12} aria-hidden="true" />
            {shopOpen ? "Toko Buka" : "Toko Tutup"}
          </button>
        )}
        <Link
          href="/dashboard/brital/chat"
          className="text-xs font-sub px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-peran-aksi-lembut text-peran-aksi hover:bg-peran-aksi hover:text-peran-terang transition-colors"
        >
          <MessageCircle size={12} aria-hidden="true" />
          Chat Brital
        </Link>
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStatCard
          label="Pesanan Aktif"
          value={incoming.length}
          icon={ShoppingBag}
          tone={incoming.length > 0 ? "warning" : "neutral"}
        />
        <QuickStatCard
          label="Pendapatan Hari Ini"
          value={`Rp${todayRevenue.toLocaleString("id-ID")}`}
          icon={Wallet}
          tone="positive"
        />
        <QuickStatCard
          label="Pendapatan 7 Hari"
          value={`Rp${weekRevenue.toLocaleString("id-ID")}`}
          icon={TrendingUp}
          tone="positive"
        />
        <QuickStatCard
          label="Rata-rata Order"
          value={avgOrderValue > 0 ? `Rp${avgOrderValue.toLocaleString("id-ID")}` : "-"}
          icon={Clock}
        />
      </div>

      {/* Sales chart */}
      <SalesChart days={days} />

      {/* Status donut + top products */}
      <div className="grid md:grid-cols-2 gap-4">
        <OrderStatusDonut orders={incoming} />
        <TopProductsCard orders={history} />
      </div>

      {/* Pesanan masuk + riwayat */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard
          title="Pesanan Masuk"
          seeAllHref="/dashboard/brital/orders"
          emptyLabel={incoming.length === 0 ? "Belum ada pesanan aktif." : undefined}
        >
          {incoming.slice(0, 5).map((o) => (
            <ListRow
              key={o.id}
              icon={<PackagePlus size={16} aria-hidden="true" />}
              title={o.items.map((i) => i.product_name).join(", ") || "Pesanan"}
              subtitle={`${o.buyer_name} - ${o.buyer_class}`}
              value={`Rp${o.total_price.toLocaleString("id-ID")}`}
              tone="neutral"
            />
          ))}
        </ListCard>

        <ListCard
          title="Riwayat Terbaru"
          seeAllHref="/dashboard/brital/history"
          emptyLabel={history.length === 0 ? "Belum ada riwayat." : undefined}
        >
          {history.slice(0, 5).map((o) => (
            <ListRow
              key={o.id}
              icon={<PackageCheck size={16} aria-hidden="true" />}
              title={o.items.map((i) => i.product_name).join(", ") || "Pesanan"}
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

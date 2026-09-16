"use client";

import { useEffect, useState } from "react";
import { Shirt, PackagePlus, PackageCheck, CircleDot } from "lucide-react";
import Navbar from "@/components/Navbar";
import SalesChart from "@/components/SalesChart";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AlertCard, ExportCard, ProfileCard, UnitCard, ListCard, ListRow } from "@/components/dashboard/DashboardWidgets";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface DayStat { day: string; count: number; revenue: number }
interface OrderItem { product_name: string; quantity: number }
interface IncomingOrder {
  id: number;
  buyer_name: string;
  buyer_class: string;
  total_price: number;
  status: string;
  items: OrderItem[];
  created_at: string;
}

const ACTIVE_STATUSES = ["baru", "dicuci"];
const DONE_STATUSES = ["selesai", "bisa_diambil", "dibatalkan"];

// Overview Dashboard Laundry - layout sidebar + panel kanan (bagian 7 prompt
// redesign). Data dari endpoint yang sudah ada, tidak ada endpoint baru.
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
          <UnitCard unitName="KWU Laundry" statusLabel={shopOpen ? "Layanan sedang buka" : "Layanan sedang tutup"} isOpen={!!shopOpen} />
          <ExportCard label="Riwayat laundry" rows={history.map((o) => ({
            id: o.id, pelanggan: o.buyer_name, kelas: o.buyer_class, total: o.total_price, status: o.status, tanggal: o.created_at,
          }))} />
        </>
      }
    >
      <div className="flex items-center gap-2 mb-1">
        <Shirt size={18} className="text-electric" aria-hidden="true" />
        <span className="font-sub text-sm text-steel">KWU Laundry</span>
        {shopOpen !== null && (
          <button
            onClick={toggleShop}
            className={`ml-auto text-xs font-sub px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
              shopOpen ? "bg-emerald-100 text-emerald-700" : "bg-ember/10 text-ember-600"
            }`}
          >
            <CircleDot size={12} aria-hidden="true" />
            {shopOpen ? "Buka" : "Tutup"}
          </button>
        )}
      </div>

      <SalesChart days={days} />

      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard title="Pesanan Masuk" seeAllHref="/dashboard/laundry/orders" emptyLabel={incoming.length === 0 ? "Belum ada pesanan aktif." : undefined}>
          {incoming.slice(0, 5).map((o) => (
            <ListRow
              key={o.id}
              icon={<PackagePlus size={16} aria-hidden="true" />}
              title={o.items.map((i) => i.product_name).join(", ") || "Cucian"}
              subtitle={`${o.buyer_name} - ${o.buyer_class}`}
              value={`Rp${o.total_price.toLocaleString("id-ID")}`}
              tone="neutral"
            />
          ))}
        </ListCard>

        <ListCard title="Riwayat Terbaru" seeAllHref="/dashboard/laundry/history" emptyLabel={history.length === 0 ? "Belum ada riwayat." : undefined}>
          {history.slice(0, 5).map((o) => (
            <ListRow
              key={o.id}
              icon={<PackageCheck size={16} aria-hidden="true" />}
              title={o.items.map((i) => i.product_name).join(", ") || "Cucian"}
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

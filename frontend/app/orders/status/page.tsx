"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Truck, PackagePlus, Loader2, Droplets, PackageCheck, CheckCircle2, XCircle, UtensilsCrossed, Shirt } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useKejadian } from "@/lib/realtime";

interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  note: string | null;
  image_url?: string | null;
}

interface MyOrder {
  id: number;
  kwu_unit: "kwu_brital" | "kwu_laundry";
  status: string;
  payment_status: string;
  total_price: number;
  quantity: number | null;
  weight_kg: number | null;
  seller_name: string;
  seller_id: number;
  items: OrderItem[];
  created_at: string;
}

type StatusTab = "semua" | "belum_bayar" | "diproses" | "dikirim" | "selesai" | "dibatalkan";

const STATUS_TABS: { value: StatusTab; label: string; icon: any; activeClass: string; inactiveClass: string }[] = [
  { value: "semua", label: "Semua", icon: PackagePlus, activeClass: "bg-electric-600 text-white shadow-md active:bg-electric-700 focus:bg-electric-700 focus:ring-2 focus:ring-electric-500", inactiveClass: "bg-white border border-sand text-ink hover:bg-parchment active:bg-sand focus:bg-sand focus:ring-2 focus:ring-sand" },
  { value: "belum_bayar", label: "Belum Dibayar", icon: PackagePlus, activeClass: "bg-electric-600 text-white shadow-md active:bg-electric-700 focus:bg-electric-700 focus:ring-2 focus:ring-electric-500", inactiveClass: "bg-white border border-sand text-ink hover:bg-parchment active:bg-sand focus:bg-sand focus:ring-2 focus:ring-sand" },
  { value: "diproses", label: "Diproses", icon: Loader2, activeClass: "bg-amber-600 text-white shadow-md active:bg-amber-700 focus:bg-amber-700 focus:ring-2 focus:ring-amber-500", inactiveClass: "bg-white border border-sand text-ink hover:bg-parchment active:bg-sand focus:bg-sand focus:ring-2 focus:ring-sand" },
  { value: "dikirim", label: "Dikirim", icon: Truck, activeClass: "bg-amber-600 text-white shadow-md active:bg-amber-700 focus:bg-amber-700 focus:ring-2 focus:ring-amber-500", inactiveClass: "bg-white border border-sand text-ink hover:bg-parchment active:bg-sand focus:bg-sand focus:ring-2 focus:ring-sand" },
  { value: "selesai", label: "Selesai", icon: CheckCircle2, activeClass: "bg-emerald-600 text-white shadow-md active:bg-emerald-700 focus:bg-emerald-700 focus:ring-2 focus:ring-emerald-500", inactiveClass: "bg-white border border-sand text-ink hover:bg-parchment active:bg-sand focus:bg-sand focus:ring-2 focus:ring-sand" },
  { value: "dibatalkan", label: "Dibatalkan", icon: XCircle, activeClass: "bg-red-600 text-white shadow-md active:bg-red-700 focus:bg-red-700 focus:ring-2 focus:ring-red-500", inactiveClass: "bg-white border border-sand text-ink hover:bg-parchment active:bg-sand focus:bg-sand focus:ring-2 focus:ring-sand" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string; dot: string }> = {
  baru: { label: "Pesanan Baru", icon: PackagePlus, bg: "bg-electric-100", text: "text-electric-700", dot: "bg-electric-500" },
  diproses: { label: "Diproses", icon: Loader2, bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  diantar: { label: "Sedang Dikirim", icon: Truck, bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  dicuci: { label: "Sedang Dicuci", icon: Droplets, bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" },
  bisa_diambil: { label: "Bisa Diambil", icon: PackageCheck, bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  selesai: { label: "Selesai", icon: CheckCircle2, bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  dibatalkan: { label: "Dibatalkan", icon: XCircle, bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  sudah_bayar: { label: "Sudah Bayar", bg: "bg-emerald-100", text: "text-emerald-700" },
  belum_bayar: { label: "Belum Bayar", bg: "bg-amber-100", text: "text-amber-700" },
};

const UNIT_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string; border: string }> = {
  kwu_brital: { label: "Ayam Geprek Brital", icon: UtensilsCrossed, bg: "bg-electric-100", text: "text-electric-600", border: "border-l-electric" },
  kwu_laundry: { label: "KWU Laundry", icon: Shirt, bg: "bg-indigo-100", text: "text-indigo-600", border: "border-l-indigo-500" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function getOrderStatusGroup(order: MyOrder): StatusTab {
  if (order.status === "selesai") return "selesai";
  if (order.status === "dibatalkan") return "dibatalkan";
  if (order.status === "diantar" || order.status === "bisa_diambil") return "dikirim";
  if (order.status === "diproses" || order.status === "dicuci") return "diproses";
  if (order.payment_status === "belum_bayar") return "belum_bayar";
  return "semua";
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.baru;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-sub font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      <Icon size={12} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const config = PAYMENT_STATUS_CONFIG[status] || PAYMENT_STATUS_CONFIG.belum_bayar;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sub font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function UnitBadge({ unit }: { unit: "kwu_brital" | "kwu_laundry" }) {
  const config = UNIT_CONFIG[unit];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-sub font-medium ${config.bg} ${config.text}`}>
      <Icon size={12} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function OrderCard({ order }: { order: MyOrder }) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.baru;
  const unitConfig = UNIT_CONFIG[order.kwu_unit] || UNIT_CONFIG.kwu_brital;
  const StatusIcon = statusConfig.icon;
  const UnitIcon = unitConfig.icon;
  const isBrital = order.kwu_unit === "kwu_brital";

  return (
    <article className={`card border-l-4 ${unitConfig.border} p-4 md:p-5 space-y-4 md:space-y-5 transition-shadow hover:shadow-md`}>
      {/* Header: Unit Badge + Status */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 md:gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${unitConfig.bg} flex items-center justify-center flex-shrink-0`}>
            <UnitIcon size={20} className={unitConfig.text} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-ink text-base md:text-lg truncate font-semibold">{unitConfig.label}</h3>
            </div>
            <p className="text-xs md:text-sm text-steel font-body mt-0.5">
              {order.seller_name} • #{order.id.toString().padStart(6, "0")} • {formatDate(order.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Items */}
      <div className="border-t border-sand pt-4 md:pt-5 space-y-3 md:space-y-4">
        {isBrital ? (
          <div className="space-y-2 md:space-y-3">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 md:gap-4 p-3 bg-parchment/50 rounded-xl">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.product_name}
                    className="w-14 h-14 md:w-16 md:h-16 object-cover rounded-lg flex-shrink-0"
                                      />
                ) : (
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-electric-50 flex items-center justify-center flex-shrink-0">
                    <UtensilsCrossed size={20} className="text-electric-300" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-sub font-medium text-sm md:text-base text-ink truncate">{item.product_name}</p>
                  {item.note && (
                    <p className="font-body text-xs md:text-sm text-steel truncate mt-0.5">Catatan: {item.note}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-heading text-electric text-sm md:text-base">{formatCurrency(item.unit_price)}</p>
                  <p className="font-body text-xs md:text-sm text-steel">x{item.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-parchment/50 rounded-xl">
            <div className={`w-10 h-10 rounded-xl ${unitConfig.bg} flex items-center justify-center flex-shrink-0`}>
              <UnitIcon size={20} className={unitConfig.text} aria-hidden="true" />
            </div>
            <div>
              <p className="font-sub font-medium text-sm md:text-base text-ink">{unitConfig.label}</p>
              <p className="font-body text-xs md:text-sm text-steel">
                {order.quantity ? `${order.quantity} potong` : ""}
                {order.quantity && order.weight_kg ? " • " : ""}
                {order.weight_kg ? `${order.weight_kg} kg` : ""}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer: Total, Payment Status, Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4 pt-2 md:pt-3 border-t border-sand">
        <div className="flex items-center gap-4 md:gap-6 flex-wrap">
          <span className="font-heading text-ink text-lg md:text-xl font-semibold">{formatCurrency(order.total_price)}</span>
          <PaymentBadge status={order.payment_status} />
        </div>

        {order.status === "selesai" && (
          <Link
            href={`/rating/${order.id}`}
            className="btn-electric !py-2 md:!py-2.5 text-sm md:text-base flex items-center justify-center gap-1.5 md:gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Beri Rating
          </Link>
        )}
      </div>
    </article>
  );
}

export default function OrderStatusPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [activeTab, setActiveTab] = useState<StatusTab>("semua");
  const [searchQuery, setSearchQuery] = useState("");

  const muatPesanan = useCallback(() => {
    api<{ orders: MyOrder[] }>("/orders/mine")
      .then((d) => setOrders(d.orders))
      .catch(() => {});
  }, []);

  // Muat awal lewat HTTP. Data terbaru menyusul lewat WebSocket.
  useEffect(() => {
    muatPesanan();
  }, [muatPesanan]);

  // Pembaruan real-time lewat WebSocket — menggantikan onSnapshot Firestore.
  // Satu koneksi menangani SEMUA pesanan sekaligus, jadi tidak perlu lagi
  // satu listener per pesanan seperti cara lama.
  useKejadian("order:status", (k) => {
    setOrders((prev) =>
      prev.map((p) => (String(p.id) === k.orderId ? { ...p, status: k.status } : p)),
    );
  });

  // Pesanan baru juga langsung muncul tanpa perlu muat ulang halaman.
  useKejadian("order:baru", () => {
    muatPesanan();
  });

  // Filter orders by tab and search
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab filter
      if (activeTab !== "semua") {
        const orderGroup = getOrderStatusGroup(order);
        if (orderGroup !== activeTab) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchable = [
          order.id.toString(),
          order.seller_name.toLowerCase(),
          ...order.items.map((i) => i.product_name.toLowerCase()),
          order.kwu_unit,
          order.status,
        ].join(" ");
        if (!searchable.includes(query)) return false;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  return (
    <main className="min-h-screen pb-20 md:pb-8 bg-paper">
      <Navbar />

      {/* Header - Editorial style like Marketplace */}
      <section className="bg-ink text-white">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-6 md:py-8 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="badge-tagline bg-white/10 text-white mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sub font-medium">
                <PackagePlus size={12} aria-hidden="true" />
                Pesanan Saya
              </span>
              <h1 className="text-heading-sm md:text-heading font-heading font-semibold">Status Pesanan</h1>
              <p className="text-body-sm text-white/60 mt-1">Pantau pesanan Brital & Laundry secara real-time.</p>
            </div>
            {user && (
              <div className="flex gap-2">
                <Link href="/marketplace?category=kwu_brital" className="btn-secondary !border-white/30 !text-white hover:!bg-white hover:!text-ink flex items-center gap-2 text-sm">
                  <UtensilsCrossed size={16} aria-hidden="true" /> Pesan Brital
                </Link>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <input
              type="search"
              placeholder="Cari pesanan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-white/20 bg-white/10 rounded-input px-4 py-3 pr-10 text-white placeholder:text-white/50 focus:border-electric outline-none font-body"
              aria-label="Cari pesanan"
            />
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50" aria-hidden="true" />
          </div>
        </div>
      </section>

      <div className="max-w-page mx-auto px-4 sm:px-6 py-6 md:py-8 space-y-5 md:space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter status pesanan">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-sub whitespace-nowrap transition-colors ${
                activeTab === tab.value ? tab.activeClass : tab.inactiveClass
              }`}
            >
              <tab.icon size={16} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4 md:space-y-5">
          {filteredOrders.length > 0 ? (
            <div className="space-y-4 md:space-y-5">
              {filteredOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          ) : (
            <div className="card p-8 md:p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-sand flex items-center justify-center mx-auto mb-4">
                <PackagePlus size={32} className="text-steel" aria-hidden="true" />
              </div>
              <h3 className="font-heading text-ink text-xl md:text-2xl mb-2 font-semibold">Tidak ada pesanan</h3>
              <p className="text-steel font-body text-sm md:text-base max-w-xs mx-auto">
                {searchQuery
                  ? "Tidak ada pesanan yang cocok dengan pencarian"
                  : "Belum ada pesanan. Yuk belanja di Marketplace!"}
              </p>
              {!searchQuery && (
                <Link href="/marketplace" className="btn-electric inline-flex items-center gap-2 mt-6">
                  <UtensilsCrossed size={16} aria-hidden="true" />
                  Mulai Belanja
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
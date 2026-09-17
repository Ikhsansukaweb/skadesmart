"use client";

// ===========================================================================
// Halaman Akun SATU pintu — ala Shopee.
//
// Layout ala Shopee:
//   - Sidebar kiri (desktop, ≥lg) dengan menu vertikal:
//       Akun Saya · Pesanan Saya · Penjualan · Pengaturan
//   - Konten kanan berisi panel aktif:
//       - Pesanan Saya  → kartu pesanan ala Shopee (nama toko, varian,
//                         harga coret + diskon, total, tombol aksi)
//       - Profil        → edit foto/banner + ganti password
//       - Penjualan     → statistik penjual + link dashboard + toggle toko
//       - Pengaturan    → notifikasi browser, CS, kelola produk
//   - Mobile: tombol garis 3 (☰) membuka drawer geser dari kiri.
//
// Responsive desktop/mobile. Data real-time WebSocket tetap dipakai.
// ===========================================================================

// Selalu render ulang di server, jangan di-cache lama.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserRound,
  ImagePlus,
  BellRing,
  BellOff,
  Headset,
  IdCard,
  KeyRound,
  LoaderCircle,
  Store,
  PackageSearch,
  PackagePlus,
  Search,
  Truck,
  Loader2,
  Droplets,
  PackageCheck,
  CheckCircle2,
  Check,
  XCircle,
  UtensilsCrossed,
  Shirt,
  TrendingUp,
  ShoppingBag,
  ArrowRight,
  Settings2,
  Clock,
  Trophy,
  ChevronRight,
  LayoutDashboard,
  Menu,
  X,
  Package,
  Star,
  MessageCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { api, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useKejadian } from "@/lib/realtime";

// --------------------------------------------------------------------------- -
// Tipe Data
// ---------------------------------------------------------------------------

interface AccountData {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: string;
  profile_photo_url: string | null;
  banner_url: string | null;
  shop_open: number;
  notif_enabled: number;
}

interface HistoryOrder {
  id: number;
  kwu_unit: string;
  total_price: number;
  status: string;
  created_at: string;
}

interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  note: string | null;
  image_url?: string | null;
  // Field opsional untuk harga coret & diskon ala Shopee.
  original_price?: number | null;
  discount_percent?: number | null;
  variant_label?: string | null;
}

interface MyOrder {
  id: number;
  kwu_unit: "kwu_brital" | "kwu_laundry";
  status: string;
  payment_status: string;
  total_price: number;
  original_total?: number | null;
  quantity: number | null;
  weight_kg: number | null;
  seller_name: string;
  seller_id: number;
  items: OrderItem[];
  created_at: string;
}

interface SellerStats {
  ringkas: {
    total_pesanan: number;
    total_pendapatan: number;
    pesanan_aktif: number;
    pesanan_selesai: number;
  } | null;
  days: { day: string; count: number; revenue: number }[];
  terlaris: { product_id: number; product_name: string; terjual: number; pendapatan: number }[];
}

// ---------------------------------------------------------------------------
// Konstanta & Helper
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = {
  siswa: "Siswa",
  kwu_brital: "Staf - Ayam Geprek Brital",
  kwu_laundry: "Staf - Laundry",
  cs: "Customer Service",
  admin: "Admin",
};

type StatusTab = "semua" | "belum_bayar" | "diproses" | "dikirim" | "selesai" | "dibatalkan";

const STATUS_TABS: { value: StatusTab; label: string; icon: any; activeClass: string; inactiveClass: string }[] = [
  { value: "semua", label: "Semua", icon: PackagePlus, activeClass: "bg-peran-aksi text-peran-terang shadow-md", inactiveClass: "bg-peran-kartu border border-peran-garis text-peran-utama hover:bg-peran-sorot" },
  { value: "belum_bayar", label: "Belum Dibayar", icon: PackagePlus, activeClass: "bg-peran-aksi text-peran-terang shadow-md", inactiveClass: "bg-peran-kartu border border-peran-garis text-peran-utama hover:bg-peran-sorot" },
  { value: "diproses", label: "Diproses", icon: Loader2, activeClass: "bg-amber-600 text-white shadow-md", inactiveClass: "bg-peran-kartu border border-peran-garis text-peran-utama hover:bg-peran-sorot" },
  { value: "dikirim", label: "Dikirim", icon: Truck, activeClass: "bg-amber-600 text-white shadow-md", inactiveClass: "bg-peran-kartu border border-peran-garis text-peran-utama hover:bg-peran-sorot" },
  { value: "selesai", label: "Selesai", icon: CheckCircle2, activeClass: "bg-emerald-600 text-white shadow-md", inactiveClass: "bg-peran-kartu border border-peran-garis text-peran-utama hover:bg-peran-sorot" },
  { value: "dibatalkan", label: "Dibatalkan", icon: XCircle, activeClass: "bg-red-600 text-white shadow-md", inactiveClass: "bg-peran-kartu border border-peran-garis text-peran-utama hover:bg-peran-sorot" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string; dot: string; step: number }> = {
  baru:          { label: "Pesanan Baru",   icon: PackagePlus,  bg: "bg-peran-aksi-lembut",  text: "text-peran-aksi",  dot: "bg-peran-aksi",  step: 0 },
  diproses:      { label: "Diproses",       icon: Loader2,      bg: "bg-amber-100",          text: "text-amber-700",   dot: "bg-amber-500",   step: 1 },
  dicuci:        { label: "Sedang Dicuci",  icon: Droplets,    bg: "bg-sky-100",            text: "text-sky-700",     dot: "bg-sky-500",     step: 1 },
  diantar:       { label: "Sedang Dikirim", icon: Truck,       bg: "bg-amber-100",          text: "text-amber-700",   dot: "bg-amber-500",   step: 2 },
  bisa_diambil:  { label: "Bisa Diambil",   icon: PackageCheck, bg: "bg-emerald-100",       text: "text-emerald-700", dot: "bg-emerald-500", step: 2 },
  selesai:       { label: "Selesai",       icon: CheckCircle2, bg: "bg-emerald-100",       text: "text-emerald-700", dot: "bg-emerald-500", step: 3 },
  dibatalkan:    { label: "Dibatalkan",    icon: XCircle,      bg: "bg-red-100",            text: "text-red-700",     dot: "bg-red-500",     step: -1 },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  sudah_bayar: { label: "Sudah Bayar", bg: "bg-emerald-100", text: "text-emerald-700" },
  belum_bayar: { label: "Belum Bayar", bg: "bg-amber-100",   text: "text-amber-700" },
};

const UNIT_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string }> = {
  kwu_brital: { label: "Ayam Geprek Brital", icon: UtensilsCrossed, bg: "bg-peran-aksi-lembut", text: "text-peran-aksi" },
  kwu_laundry: { label: "KWU Laundry", icon: Shirt, bg: "bg-indigo-100", text: "text-indigo-600" },
};

// Tahapan progress bar (ala Shopee): Pesanan → Diproses → Dikirim → Selesai
const PROGRESS_STEPS = ["Pesanan", "Diproses", "Dikirim", "Selesai"];

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

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

function getOrderStatusGroup(order: MyOrder): StatusTab {
  if (order.status === "selesai") return "selesai";
  if (order.status === "dibatalkan") return "dibatalkan";
  if (order.status === "diantar" || order.status === "bisa_diambil") return "dikirim";
  if (order.status === "diproses" || order.status === "dicuci") return "diproses";
  if (order.payment_status === "belum_bayar") return "belum_bayar";
  return "semua";
}

// Hitung persen diskon dari harga coret vs harga jual.
function hitungDiskon(original: number | null | undefined, harga: number): number | null {
  if (!original || original <= 0 || original <= harga) return null;
  return Math.round(((original - harga) / original) * 100);
}

// ---------------------------------------------------------------------------
// Komponen Badge Kecil
// ---------------------------------------------------------------------------

function OrderStatusBadge({ status }: { status: string }) {
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

// ---------------------------------------------------------------------------
// Progress Bar — ala Shopee
// ---------------------------------------------------------------------------

function OrderProgressBar({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.baru;
  const isCancelled = status === "dibatalkan";
  const currentStep = config.step;

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-xs font-sub font-medium">
        <XCircle size={14} aria-hidden="true" />
        Pesanan dibatalkan
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {PROGRESS_STEPS.map((label, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={label} className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-peran-garis">
                <div
                  className={`h-full rounded-full transition-colors ${done || active ? "bg-peran-aksi" : "bg-transparent"}`}
                  style={{ width: done ? "100%" : active ? "50%" : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between">
        {PROGRESS_STEPS.map((label, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <span
              key={label}
              className={`text-[10px] font-sub font-medium ${done || active ? "text-peran-aksi" : "text-peran-samar"}`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kartu Pesanan — ala Shopee
// Header: nama toko + ikon toko + status pesanan
// Item: gambar kecil · nama produk · varian · harga coret + diskon · qty
// Footer: total pesanan + payment badge + tombol aksi
// ---------------------------------------------------------------------------

function OrderCard({ order, onHubungiPenjual }: { order: MyOrder; onHubungiPenjual: (o: MyOrder) => void }) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.baru;
  const unitConfig = UNIT_CONFIG[order.kwu_unit] || UNIT_CONFIG.kwu_brital;
  const UnitIcon = unitConfig.icon;
  const isBrital = order.kwu_unit === "kwu_brital";
  const isCancelled = order.status === "dibatalkan";
  const isSelesai = order.status === "selesai";

  // Diskon level pesanan (coret total lama vs total bayar) — ala Shopee.
  const diskonPesanan = hitungDiskon(order.original_total, order.total_price);

  return (
    <article className="card overflow-hidden transition-shadow hover:shadow-md">
      {/* ===== Header ala Shopee: nama toko + status ===== */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-peran-garis bg-peran-lembut/40">
        <div className="flex items-center gap-2 min-w-0">
          <Store size={16} className="text-peran-kedua shrink-0" aria-hidden="true" />
          <span className="font-sub font-medium text-sm text-peran-utama truncate">
            {order.seller_name}
          </span>
          <ChevronRight size={14} className="text-peran-samar shrink-0" aria-hidden="true" />
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* ===== Body: daftar item ala Shopee ===== */}
      <div className="px-4 md:px-5 py-4 space-y-4">
        {isBrital ? (
          order.items.map((item, idx) => {
            const diskon = hitungDiskon(item.original_price, item.unit_price) ?? item.discount_percent ?? null;
            const hasCoret = !!(item.original_price && item.original_price > item.unit_price);
            return (
              <div key={idx} className="flex gap-3">
                {/* Thumbnail produk ala Shopee */}
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-peran-lembut shrink-0 border border-peran-garis">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-peran-samar">
                      <UtensilsCrossed size={24} aria-hidden="true" />
                    </div>
                  )}
                </div>
                {/* Nama produk + varian + catatan */}
                <div className="flex-1 min-w-0">
                  <p className="font-sub text-sm text-peran-utama line-clamp-2 break-words">
                    {item.product_name}
                  </p>
                  {/* Varian ala Shopee: pill abu */}
                  {item.variant_label && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-peran-lembut text-peran-kedua text-[11px] font-sub">
                      {item.variant_label}
                    </span>
                  )}
                  {item.note && (
                    <p className="font-body text-xs text-peran-kedua mt-1 line-clamp-1">
                      Catatan: {item.note}
                    </p>
                  )}
                </div>
                {/* Harga ala Shopee: coret + diskon + harga jual */}
                <div className="text-right shrink-0">
                  {hasCoret && (
                    <p className="text-xs text-peran-samar line-through font-body">
                      {formatCurrency(item.original_price!)}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 justify-end">
                    {diskon && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-peran-turun-lembut text-peran-turun text-[10px] font-sub font-bold">
                        -{diskon}%
                      </span>
                    )}
                    <p className="font-sub text-sm font-medium text-peran-utama">
                      {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-body text-xs text-peran-kedua mt-0.5">x{item.quantity}</p>
                </div>
              </div>
            );
          })
        ) : (
          // Laundry: satu baris ringkas ala Shopee
          <div className="flex gap-3">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-peran-lembut shrink-0 border border-peran-garis flex items-center justify-center">
              <UnitIcon size={28} className={unitConfig.text} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sub text-sm text-peran-utama line-clamp-2">{unitConfig.label}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded bg-peran-lembut text-peran-kedua text-[11px] font-sub">
                {order.quantity ? `${order.quantity} potong` : ""}
                {order.quantity && order.weight_kg ? " · " : ""}
                {order.weight_kg ? `${order.weight_kg} kg` : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ===== Progress bar ===== */}
      <div className="px-4 md:px-5 pb-4">
        <OrderProgressBar status={order.status} />
      </div>

      {/* ===== Footer ala Shopee: total + payment + tombol aksi ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 md:px-5 py-4 border-t border-peran-garis bg-peran-lembut/30">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-peran-kedua font-body">Total Pesanan</span>
          {diskonPesanan && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-peran-turun-lembut text-peran-turun text-[10px] font-sub font-bold">
              -{diskonPesanan}%
            </span>
          )}
          <span className="font-heading text-peran-aksi text-lg md:text-xl font-semibold">
            {formatCurrency(order.total_price)}
          </span>
          {diskonPesanan && order.original_total && (
            <span className="text-xs text-peran-samar line-through font-body">
              {formatCurrency(order.original_total)}
            </span>
          )}
          <PaymentBadge status={order.payment_status} />
        </div>

        {/* Tombol aksi ala Shopee */}
        <div className="flex items-center gap-2 flex-wrap">
          {isCancelled && (
            <Link
              href={`/marketplace?category=${order.kwu_unit}`}
              className="btn-secondary !py-2 !px-4 text-sm flex items-center justify-center gap-1.5"
            >
              <Package size={15} aria-hidden="true" />
              Beli Lagi
            </Link>
          )}
          {isSelesai && (
            <>
              <Link
                href={`/rating/${order.id}`}
                className="btn-secondary !py-2 !px-4 text-sm flex items-center justify-center gap-1.5"
              >
                <Star size={15} aria-hidden="true" />
                Beri Rating
              </Link>
              <Link
                href={`/marketplace?category=${order.kwu_unit}`}
                className="btn-primary !py-2 !px-4 text-sm flex items-center justify-center gap-1.5"
              >
                <Package size={15} aria-hidden="true" />
                Beli Lagi
              </Link>
            </>
          )}
          {!isCancelled && !isSelesai && (
            <button
              type="button"
              onClick={() => onHubungiPenjual(order)}
              className="btn-secondary !py-2 !px-4 text-sm flex items-center justify-center gap-1.5"
            >
              <MessageCircle size={15} aria-hidden="true" />
              Hubungi Penjual
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Halaman Utama
// ---------------------------------------------------------------------------

export default function AccountPage() {
  const { refresh, registerPushToken, user } = useAuth();
  const router = useRouter();

  // Panel aktif (sidebar selection): pesanan | profil | penjualan | pengaturan
  const [mainTab, setMainTab] = useState("pesanan");
  // Drawer mobile (sidebar tersembunyi di mobile, dibuka via ☰)
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Buka chat dengan penjual. Pesanan KWU diarahkan ke chat UNIT KWU
  // (satu ruang per pembeli+unit, dibalas siapa pun staf unit yang berjaga),
  // bukan chat pribadi penjual.
  const hubungiPenjual = useCallback(
    async (o: MyOrder) => {
      try {
        const d = await api<{ chat: { id: string } }>("/chats", {
          method: "POST",
          json: { unit_slug: o.kwu_unit, product_id: o.items?.[0]?.product_id ?? undefined },
        });
        router.push(`/chat/${d.chat.id}`);
      } catch (e: any) {
        setMessage(e?.message || "Gagal membuka chat.");
      }
    },
    [router]
  );

  // ---- Data Akun ----
  const [account, setAccount] = useState<AccountData | null>(null);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [message, setMessage] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);

  // ---- Ganti Password ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // ---- Pesanan Saya ----
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [activeStatusTab, setActiveStatusTab] = useState<StatusTab>("semua");
  const [searchQuery, setSearchQuery] = useState("");

  // ---- Penjualan (statistik seller) ----
  const [sellerStats, setSellerStats] = useState<SellerStats | null>(null);
  const [sellerLoading, setSellerLoading] = useState(true);

  // ---- Toggle toko (optimistic) ----
  const [shopToggleBusy, setShopToggleBusy] = useState(false);

  // =========================================================================
  // Memuat Data
  // =========================================================================

  function loadAccount() {
    api<{ user: AccountData }>("/account")
      .then((d) => setAccount(d.user))
      .catch(() => setAccount(null));
    api<{ orders: HistoryOrder[] }>("/account/history")
      .then((d) => setHistory(d.orders))
      .catch(() => setHistory([]));
  }

  const muatPesanan = useCallback(() => {
    api<{ orders: MyOrder[] }>("/orders/mine")
      .then((d) => setOrders(d.orders))
      .catch(() => {});
  }, []);

  function loadSellerStats() {
    api<SellerStats>("/orders/seller-stats")
      .then((d) => setSellerStats(d))
      .catch(() => setSellerStats({ ringkas: null, days: [], terlaris: [] }))
      .finally(() => setSellerLoading(false));
  }

  useEffect(() => {
    loadAccount();
    muatPesanan();
    loadSellerStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pembaruan real-time lewat WebSocket
  useKejadian("order:status", (k) => {
    setOrders((prev) =>
      prev.map((p) => (String(p.id) === k.orderId ? { ...p, status: k.status } : p)),
    );
  });
  useKejadian("order:baru", () => {
    muatPesanan();
  });

  // Tutup drawer saat escape ditekan (aksesibilitas)
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Kunci scroll body saat drawer terbuka (mobile)
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // =========================================================================
  // Handler
  // =========================================================================

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      await api("/account", { method: "PUT", json: { profile_photo_url: url } });
      loadAccount();
      refresh();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      await api("/account", { method: "PUT", json: { banner_url: url } });
      loadAccount();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function toggleNotif() {
    if (!account) return;
    setNotifBusy(true);
    setMessage("");
    try {
      if (!account.notif_enabled) {
        const result = await registerPushToken();
        if (!result.ok) {
          setMessage(result.reason || "Gagal mengaktifkan notifikasi.");
          setNotifBusy(false);
          return;
        }
      }
      await api("/account", { method: "PUT", json: { notif_enabled: !account.notif_enabled } });
      loadAccount();
    } finally {
      setNotifBusy(false);
    }
  }

  async function toggleShop() {
    if (!account) return;
    setShopToggleBusy(true);
    // Optimistic: langsung toggle tampilan
    setAccount({ ...account, shop_open: account.shop_open ? 0 : 1 });
    try {
      await api("/account/shop-status", { method: "PUT", json: { shop_open: !account.shop_open } });
      loadAccount();
    } catch {
      // Rollback
      setAccount(account);
    } finally {
      setShopToggleBusy(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordMessage("");
    try {
      await api("/account/password", {
        method: "PUT",
        json: { current_password: currentPassword, new_password: newPassword },
      });
      setPasswordMessage("Password berhasil diganti.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordMessage(err.message);
    } finally {
      setPasswordSaving(false);
    }
  }

  // =========================================================================
  // Filter pesanan
  // =========================================================================

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (activeStatusTab !== "semua") {
        const orderGroup = getOrderStatusGroup(order);
        if (orderGroup !== activeStatusTab) return false;
      }
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
  }, [orders, activeStatusTab, searchQuery]);

  // Jumlah pesanan per tab (untuk badge)
  const tabCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = {
      semua: orders.length,
      belum_bayar: 0,
      diproses: 0,
      dikirim: 0,
      selesai: 0,
      dibatalkan: 0,
    };
    for (const o of orders) {
      const g = getOrderStatusGroup(o);
      counts[g]++;
    }
    return counts;
  }, [orders]);

  // =========================================================================
  // Definisi menu sidebar ala Shopee
  // =========================================================================

  const isKwuSeller = account?.role === "kwu_brital" || account?.role === "kwu_laundry";
  const isSellerRole = account?.role === "siswa" || account?.role === "kwu_brital";

  const SIDEBAR_NAV = useMemo(() => {
    const items = [
      { id: "profil", label: "Akun Saya", icon: UserRound },
      { id: "pesanan", label: "Pesanan Saya", icon: Package, badge: orders.length },
      ...(isSellerRole ? [{ id: "penjualan", label: "Penjualan", icon: Store }] : []),
      { id: "pengaturan", label: "Pengaturan", icon: Settings2 },
    ];
    return items;
  }, [orders.length, isSellerRole]);

  // =========================================================================
  // Render
  // =========================================================================

  if (!account) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-peran-kedua font-body">Memuat akun...</p>
      </main>
    );
  }

  const ringkas = sellerStats?.ringkas;
  const namaDepan = (user?.full_name || "Seller").split(" ")[0];

  function pilihPanel(id: string) {
    setMainTab(id);
    setDrawerOpen(false);
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />

      {/* Header hitam dihapus atas permintaan pemilik produk. */}

      {/* ===== Tombol garis 3 (mobile) — buka drawer ===== */}
      <div className="lg:hidden max-w-page mx-auto px-4 sm:px-6 pt-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka menu akun"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-peran-kartu border border-peran-garis text-peran-utama font-sub text-sm hover:bg-peran-sorot transition-colors"
        >
          <Menu size={18} aria-hidden="true" />
          Menu Akun
        </button>
      </div>

      {/* ===== Layout 2 kolom ala Shopee: sidebar + konten ===== */}
      <div className="max-w-page mx-auto px-4 sm:px-6 py-4 md:py-6">
        <div className="flex gap-6">
          {/* ---------- Sidebar kiri (desktop, ≥lg) ---------- */}
          <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0">
            <div className="card overflow-hidden sticky top-[72px]">
              {/* Header sidebar: profil mini */}
              <div className="px-4 py-4 border-b border-peran-garis bg-peran-lembut/40 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-peran-aksi-lembut overflow-hidden flex items-center justify-center shrink-0">
                  {account.profile_photo_url ? (
                    <img src={account.profile_photo_url} alt="Foto profil" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound size={22} className="text-peran-aksi" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-sub font-medium text-sm text-peran-utama truncate">{account.full_name}</p>
                  <p className="text-xs text-peran-kedua font-body truncate">{ROLE_LABEL[account.role] || account.role}</p>
                </div>
              </div>
              {/* Menu vertikal ala Shopee */}
              <nav className="p-2 space-y-0.5">
                {SIDEBAR_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = mainTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pilihPanel(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-sub text-sm transition-colors text-left ${
                        active
                          ? "bg-peran-aksi-lembut text-peran-aksi font-medium"
                          : "text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama"
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {typeof item.badge === "number" && item.badge > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-peran-aksi text-peran-terang font-sub font-medium">
                          {item.badge}
                        </span>
                      )}
                      {active && <ChevronRight size={14} className="text-peran-aksi shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </nav>
              {/* Footer sidebar: aksi cepat */}
              <div className="p-3 border-t border-peran-garis space-y-1">
                <Link href="/dashboard/seller" className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-sub text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama transition-colors">
                  <LayoutDashboard size={14} aria-hidden="true" />
                  Dashboard Seller
                </Link>
                <Link href="/cs/chat" className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-sub text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama transition-colors">
                  <Headset size={14} aria-hidden="true" />
                  Bantuan CS
                </Link>
              </div>
            </div>
          </aside>

          {/* ---------- Konten kanan ---------- */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ===== Panel: Pesanan Saya ===== */}
            {mainTab === "pesanan" && (
              <div className="space-y-5">
                {/* Pencarian */}
                <div className="relative max-w-md">
                  <input
                    type="search"
                    placeholder="Cari pesanan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full border border-peran-garis-tegas rounded-input px-4 py-3 pr-10 bg-peran-kartu text-peran-utama placeholder:text-peran-kedua focus:border-peran-aksi outline-none font-body"
                    aria-label="Cari pesanan"
                  />
                  <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-peran-samar" aria-hidden="true" />
                </div>

                {/* Filter status */}
                <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter status pesanan">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      role="tab"
                      aria-selected={activeStatusTab === tab.value}
                      onClick={() => setActiveStatusTab(tab.value)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-sub whitespace-nowrap transition-colors ${
                        activeStatusTab === tab.value ? tab.activeClass : tab.inactiveClass
                      }`}
                    >
                      <tab.icon size={16} aria-hidden="true" />
                      {tab.label}
                      {tabCounts[tab.value] > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeStatusTab === tab.value ? "bg-white/20" : "bg-peran-lembut"}`}>
                          {tabCounts[tab.value]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Daftar Pesanan */}
                {filteredOrders.length > 0 ? (
                  <div className="space-y-4">
                    {filteredOrders.map((order) => (
                      <OrderCard key={order.id} order={order} onHubungiPenjual={hubungiPenjual} />
                    ))}
                  </div>
                ) : (
                  <div className="card p-8 md:p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-peran-lembut flex items-center justify-center mx-auto mb-4">
                      <PackagePlus size={32} className="text-peran-kedua" aria-hidden="true" />
                    </div>
                    <h3 className="font-heading text-peran-utama text-xl md:text-2xl mb-2 font-semibold">Tidak ada pesanan</h3>
                    <p className="text-peran-kedua font-body text-sm md:text-base max-w-xs mx-auto">
                      {searchQuery
                        ? "Tidak ada pesanan yang cocok dengan pencarian"
                        : "Belum ada pesanan. Yuk belanja di Marketplace!"}
                    </p>
                    {!searchQuery && (
                      <Link href="/marketplace" className="btn-ember inline-flex items-center gap-2 mt-6">
                        <UtensilsCrossed size={16} aria-hidden="true" />
                        Mulai Belanja
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ===== Panel: Profil ===== */}
            {mainTab === "profil" && (
              <div className="space-y-6">
                {/* Kartu Profil dengan Banner */}
                <div className="card overflow-hidden">
                  <label className="relative block w-full h-32 bg-peran-aksi-lembut cursor-pointer group">
                    {account.banner_url && <img src={account.banner_url} alt="Banner profil" className="h-32 w-full object-cover" />}
                    <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1 opacity-90">
                      <ImagePlus size={12} aria-hidden="true" /> Ubah banner
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBannerChange} className="hidden" />
                  </label>

                  <div className="p-5 -mt-10 space-y-4">
                    <div className="flex items-end gap-4">
                      <label className="relative w-20 h-20 rounded-full bg-peran-aksi-lembut overflow-hidden cursor-pointer shrink-0 border-4 border-peran-kartu">
                        {account.profile_photo_url ? (
                          <img src={account.profile_photo_url} alt="Foto profil" className="h-full w-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-peran-aksi">
                            <UserRound size={32} aria-hidden="true" />
                          </div>
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-0.5 flex items-center justify-center gap-1">
                          <ImagePlus size={10} aria-hidden="true" /> Ubah
                        </span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="hidden" />
                      </label>
                      <div className="pb-1">
                        <p className="font-sub font-medium text-peran-utama">{account.full_name}</p>
                        <p className="text-sm text-peran-kedua font-sub">{ROLE_LABEL[account.role] || account.role}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-peran-garis">
                      <div>
                        <p className="text-xs text-peran-kedua font-body flex items-center gap-1">
                          <IdCard size={12} aria-hidden="true" /> NISN
                        </p>
                        <p className="font-sub text-sm text-peran-utama">{account.nisn}</p>
                      </div>
                      <div>
                        <p className="text-xs text-peran-kedua font-body">Kelas</p>
                        <p className="font-sub text-sm text-peran-utama">{account.class_name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-peran-kedua font-body">
                      Nama, kelas, dan NISN tidak bisa diubah karena sudah terhubung dengan data resmi sekolah. Hubungi CS kalau ada kesalahan data.
                    </p>
                    {message && <p className="text-sm font-body text-peran-aksen">{message}</p>}
                  </div>
                </div>

                {/* Ganti Password */}
                <div className="card p-5 space-y-3">
                  <h2 className="font-sub font-medium flex items-center gap-2 text-peran-utama">
                    <KeyRound size={16} aria-hidden="true" /> Ganti Password
                  </h2>
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <label htmlFor="current_password" className="block text-sm font-sub mb-1 text-peran-kedua">
                        Password saat ini
                      </label>
                      <input
                        id="current_password"
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label htmlFor="new_password" className="block text-sm font-sub mb-1 text-peran-kedua">
                        Password baru
                      </label>
                      <input
                        id="new_password"
                        type="password"
                        required
                        minLength={4}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    {passwordMessage && (
                      <p className={`text-sm font-body ${passwordMessage.includes("berhasil") ? "text-peran-naik" : "text-peran-aksen"}`}>
                        {passwordMessage}
                      </p>
                    )}
                    <button type="submit" disabled={passwordSaving} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                      {passwordSaving && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
                      Simpan Password Baru
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ===== Panel: Penjualan ===== */}
            {mainTab === "penjualan" && isSellerRole && (
              <div className="space-y-6">
                {/* Statistik Kartu */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SellerStatCard
                    icon={<ShoppingBag size={20} aria-hidden="true" />}
                    label="Total Pesanan"
                    value={String(ringkas?.total_pesanan ?? 0)}
                    href="/dashboard/seller/orders"
                  />
                  <SellerStatCard
                    icon={<TrendingUp size={20} aria-hidden="true" />}
                    label="Pendapatan"
                    value={rupiah(ringkas?.total_pendapatan ?? 0)}
                    href="/dashboard/seller/earnings"
                  />
                  <SellerStatCard
                    icon={<PackagePlus size={20} aria-hidden="true" />}
                    label="Pesanan Aktif"
                    value={String(ringkas?.pesanan_aktif ?? 0)}
                    href="/dashboard/seller/orders"
                  />
                  <SellerStatCard
                    icon={<CheckCircle2 size={20} aria-hidden="true" />}
                    label="Pesanan Selesai"
                    value={String(ringkas?.pesanan_selesai ?? 0)}
                    href="/dashboard/seller/earnings"
                  />
                </div>

                {/* Toggle Buka/Tutup Toko */}
                {isKwuSeller && (
                  <div className="card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            account.shop_open
                              ? "bg-peran-naik-lembut text-peran-naik"
                              : "bg-peran-aksen-lembut text-peran-aksen"
                          }`}
                        >
                          {account.shop_open ? <Check size={20} aria-hidden="true" /> : <Clock size={20} aria-hidden="true" />}
                        </span>
                        <div>
                          <p className="font-sub font-semibold text-peran-utama">
                            {account.shop_open ? "Toko Buka" : "Toko Tutup"}
                          </p>
                          <p className="text-caption text-peran-kedua">
                            {account.shop_open ? "Pembeli bisa memesan produkmu." : "Produkmu tidak bisa dipesan."}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={toggleShop}
                        disabled={shopToggleBusy}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                          account.shop_open ? "bg-peran-naik" : "bg-peran-garis-tegas"
                        }`}
                        aria-label={account.shop_open ? "Tutup toko" : "Buka toko"}
                        role="switch"
                        aria-checked={account.shop_open === 1}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            account.shop_open ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}

                {/* Produk Terlaris (ringkas) */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Trophy size={18} className="text-peran-aksi" aria-hidden="true" />
                      <h3 className="font-sub font-semibold text-sm text-peran-utama">Produk Terlaris</h3>
                    </div>
                    <Link href="/dashboard/seller/earnings" className="text-caption text-peran-aksi font-sub hover:underline">
                      Lihat semua
                    </Link>
                  </div>
                  {sellerLoading ? (
                    <p className="text-caption text-peran-samar py-4 text-center">Memuat...</p>
                  ) : (sellerStats?.terlaris || []).length === 0 ? (
                    <p className="text-caption text-peran-samar py-4 text-center">Belum ada produk terjual.</p>
                  ) : (
                    <div className="divide-y divide-peran-garis">
                      {(sellerStats?.terlaris || []).slice(0, 5).map((p) => (
                        <div key={p.product_id} className="flex items-center gap-3 py-2.5">
                          <div className="w-9 h-9 rounded-full bg-peran-lembut flex items-center justify-center text-peran-aksi shrink-0">
                            <TrendingUp size={16} aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-sub font-medium text-peran-utama truncate">{p.product_name}</p>
                            <p className="text-caption text-peran-kedua">{p.terjual} terjual</p>
                          </div>
                          <p className="text-sm font-sub font-semibold text-peran-naik shrink-0">{rupiah(p.pendapatan)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Link Dashboard Seller */}
                <div className="card p-4">
                  <h3 className="font-sub font-semibold text-sm text-peran-utama mb-3">Aksi Cepat</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SellerQuickAction href="/dashboard/seller" icon={<LayoutDashboard size={18} aria-hidden="true" />} label="Dashboard" />
                    <SellerQuickAction href="/dashboard/seller/products" icon={<PackageSearch size={18} aria-hidden="true" />} label="Kelola Produk" />
                    <SellerQuickAction href="/dashboard/seller/orders" icon={<ShoppingBag size={18} aria-hidden="true" />} label="Pesanan Masuk" />
                    <SellerQuickAction href="/dashboard/seller/earnings" icon={<TrendingUp size={18} aria-hidden="true" />} label="Pendapatan" />
                  </div>
                </div>
              </div>
            )}

            {/* ===== Panel: Pengaturan ===== */}
            {mainTab === "pengaturan" && (
              <div className="space-y-4">
                {/* Notifikasi Browser */}
                <div className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
                        {account.notif_enabled ? <BellRing size={20} aria-hidden="true" /> : <BellOff size={20} aria-hidden="true" />}
                      </span>
                      <div>
                        <p className="font-sub font-semibold text-peran-utama">Notifikasi Browser</p>
                        <p className="text-caption text-peran-kedua">
                          {account.notif_enabled ? "Notifikasi aktif" : "Notifikasi nonaktif"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={toggleNotif}
                      disabled={notifBusy}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                        account.notif_enabled ? "bg-peran-naik" : "bg-peran-garis-tegas"
                      }`}
                      aria-label={account.notif_enabled ? "Matikan notifikasi" : "Aktifkan notifikasi"}
                      role="switch"
                      aria-checked={account.notif_enabled === 1}
                    >
                      {notifBusy ? (
                        <LoaderCircle size={16} className="absolute left-2 text-peran-kedua animate-spin" aria-hidden="true" />
                      ) : (
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            account.notif_enabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      )}
                    </button>
                  </div>
                  {message && <p className="text-sm font-body text-peran-aksen mt-2">{message}</p>}
                </div>

                {/* Kelola Produk */}
                {isSellerRole && (
                  <Link href="/product/mine" className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-peran-lembut text-peran-kedua">
                        <PackageSearch size={20} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="font-sub font-semibold text-peran-utama">Kelola Produk Saya</p>
                        <p className="text-caption text-peran-kedua">Lihat, edit, dan hapus produkmu</p>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-peran-samar" aria-hidden="true" />
                  </Link>
                )}

                {/* Chat CS */}
                <Link href="/cs/chat" className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-peran-lembut text-peran-kedua">
                      <Headset size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-sub font-semibold text-peran-utama">Chat dengan CS</p>
                      <p className="text-caption text-peran-kedua">Butuh bantuan? Hubungi customer service</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-peran-samar" aria-hidden="true" />
                </Link>

                {/* Riwayat Singkat */}
                <div className="card p-4">
                  <h3 className="font-sub font-semibold text-sm text-peran-utama mb-3">Riwayat Pesanan Terakhir</h3>
                  <div className="space-y-2">
                    {history.slice(0, 5).map((h) => (
                      <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-peran-garis last:border-0">
                        <div>
                          <p className="font-sub text-sm font-medium text-peran-utama">
                            {h.kwu_unit === "kwu_brital" ? "Brital" : "Laundry"} - {rupiah(h.total_price)}
                          </p>
                          <p className="text-xs text-peran-kedua font-body">
                            {new Date(h.created_at).toLocaleDateString("id-ID")}
                          </p>
                        </div>
                        <OrderStatusBadge status={h.status} />
                      </div>
                    ))}
                    {history.length === 0 && (
                      <p className="text-peran-kedua font-body text-sm">Belum ada riwayat pesanan.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Mobile: drawer sidebar (geser dari kiri) ===== */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu akun"
        >
          {/* Overlay gelap di belakang */}
          <button
            type="button"
            aria-label="Tutup menu akun"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-peran-utama/50 backdrop-blur-sm"
          />
          {/* Panel drawer */}
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-peran-kartu border-r border-peran-garis flex flex-col shadow-xl animate-slide-in">
            <div className="px-5 py-4 border-b border-peran-garis flex items-center justify-between">
              <span className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">Menu Akun</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Tutup"
                className="rounded-full p-2 text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {/* Profil mini di drawer */}
            <div className="px-4 py-3 border-b border-peran-garis flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-peran-aksi-lembut overflow-hidden flex items-center justify-center shrink-0">
                {account.profile_photo_url ? (
                  <img src={account.profile_photo_url} alt="Foto profil" className="h-full w-full object-cover" />
                ) : (
                  <UserRound size={20} className="text-peran-aksi" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-sub font-medium text-sm text-peran-utama truncate">{account.full_name}</p>
                <p className="text-xs text-peran-kedua font-body truncate">{ROLE_LABEL[account.role] || account.role}</p>
              </div>
            </div>
            {/* Menu vertikal */}
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
              {SIDEBAR_NAV.map((item) => {
                const Icon = item.icon;
                const active = mainTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pilihPanel(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-sub text-sm transition-colors text-left ${
                      active
                        ? "bg-peran-aksi-lembut text-peran-aksi font-medium"
                        : "text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama"
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-peran-aksi text-peran-terang font-sub font-medium">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="mt-2 px-3 pt-2 border-t border-peran-garis">
                <Link href="/dashboard/seller" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-sub text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama transition-colors">
                  <LayoutDashboard size={14} aria-hidden="true" />
                  Dashboard Seller
                </Link>
                <Link href="/cs/chat" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-sub text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama transition-colors">
                  <Headset size={14} aria-hidden="true" />
                  Bantuan CS
                </Link>
              </div>
            </nav>
          </aside>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-komponen: Seller Stat Card
// ---------------------------------------------------------------------------

function SellerStatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="card p-4 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
          {icon}
        </span>
        <ArrowRight size={14} className="text-peran-samar" aria-hidden="true" />
      </div>
      <div>
        <p className="text-caption text-peran-kedua">{label}</p>
        <p className="text-lg font-sub font-semibold text-peran-utama truncate">{value}</p>
      </div>
    </Link>
  );
}

function SellerQuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href} className="card p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md transition-shadow">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
        {icon}
      </span>
      <span className="text-caption font-sub font-medium text-peran-utama">{label}</span>
    </Link>
  );
}

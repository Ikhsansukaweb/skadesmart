"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  PackagePlus,
  TrendingUp,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
interface ProdukSaya {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
  image_url: string | null;
  is_active: number;
  terjual: number;
}

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

const KATEGORI_LABEL: Record<string, string> = {
  minuman: "Minuman",
  makanan: "Makanan",
  jasa: "Jasa",
  barang: "Barang",
  siswa: "Siswa",
  brital: "Brital",
  laundry: "Laundry",
};

export default function SellerDashboardPage() {
  const { user } = useAuth();
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  const [days, setDays] = useState<DayStat[]>([]);
  const [terlaris, setTerlaris] = useState<Terlaris[]>([]);
  const [produkSaya, setProdukSaya] = useState<ProdukSaya[]>([]);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ ringkas: Ringkas; days: DayStat[]; terlaris: Terlaris[] }>(
        "/orders/seller-stats"
      ).catch(() => ({ ringkas: null, days: [], terlaris: [] })),
      api<{ products: ProdukSaya[] }>("/products/mine").catch(() => ({
        products: [],
      })),
    ]).then(([a, b]) => {
      setRingkas(a.ringkas || null);
      setDays(a.days || []);
      setTerlaris(a.terlaris || []);
      setProdukSaya(b.products || []);
      setMemuat(false);
    });
  }, []);

  const namaDepan = (user?.full_name || "Seller").split(" ")[0];

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-heading-sm font-semibold text-peran-utama">
            Halo, {namaDepan}!
          </h1>
          <p className="text-body-sm text-peran-kedua">
            Ringkasan toko dan penjualanmu
          </p>
        </div>
        <Link
          href="/dashboard/seller/manage"
          className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full bg-peran-aksi px-4 py-2.5 text-sm font-semibold text-peran-terang transition-colors hover:bg-peran-aksi-hover"
        >
          <PackagePlus size={16} aria-hidden="true" />
          Tambah Produk
        </Link>
      </div>

      {/* ---------- Kartu statistik ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Package size={20} aria-hidden="true" />}
          label="Total Produk"
          value={String(produkSaya.length)}
          href="/dashboard/seller/products"
        />
        <StatCard
          icon={<ShoppingBag size={20} aria-hidden="true" />}
          label="Pesanan Masuk"
          value={String(ringkas?.total_pesanan ?? 0)}
          href="/dashboard/seller/orders"
        />
        <StatCard
          icon={<TrendingUp size={20} aria-hidden="true" />}
          label="Pendapatan"
          value={rupiah(ringkas?.total_pendapatan ?? 0)}
          href="/dashboard/seller/earnings"
        />
        <StatCard
          icon={<PackagePlus size={20} aria-hidden="true" />}
          label="Pesanan Aktif"
          value={String(ringkas?.pesanan_aktif ?? 0)}
          href="/dashboard/seller/orders"
        />
      </div>

      {/* ---------- Grafik penjualan ---------- */}
      <div className="mb-6">
        <SalesChart days={days} />
      </div>

      {/* ---------- Produk terlaris + Produk saya ---------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Produk terlaris */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-sub font-semibold text-sm text-peran-utama">
              Produk Terlaris
            </h3>
            <Link
              href="/dashboard/seller/earnings"
              className="text-caption text-peran-aksi font-sub hover:underline"
            >
              Lihat semua
            </Link>
          </div>
          {memuat ? (
            <p className="text-caption text-peran-samar py-4 text-center">
              Memuat...
            </p>
          ) : terlaris.length === 0 ? (
            <p className="text-caption text-peran-samar py-4 text-center">
              Belum ada produk terjual.
            </p>
          ) : (
            <div className="divide-y divide-peran-garis">
              {terlaris.slice(0, 5).map((p) => (
                <div key={p.product_id} className="flex items-center gap-3 py-2.5">
                  <div className="w-9 h-9 rounded-full bg-peran-lembut flex items-center justify-center text-peran-aksi shrink-0">
                    <TrendingUp size={16} aria-hidden="true" />
                  </div>
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

        {/* Produk saya */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-sub font-semibold text-sm text-peran-utama">
              Produk Saya
            </h3>
            <Link
              href="/dashboard/seller/products"
              className="text-caption text-peran-aksi font-sub hover:underline"
            >
              Lihat semua
            </Link>
          </div>
          {memuat ? (
            <p className="text-caption text-peran-samar py-4 text-center">
              Memuat...
            </p>
          ) : produkSaya.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-caption text-peran-samar">
                Kamu belum punya produk.
              </p>
              <Link
                href="/dashboard/seller/manage"
                className="inline-flex items-center gap-2 rounded-full bg-peran-aksi px-4 py-2 text-sm font-semibold text-peran-terang hover:bg-peran-aksi-hover"
              >
                <PackagePlus size={14} aria-hidden="true" />
                Tambah Produk Pertama
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-peran-garis">
              {produkSaya.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-10 h-10 rounded-badge bg-peran-lembut overflow-hidden shrink-0">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-peran-samar">
                        <Package size={16} aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-sub font-medium text-peran-utama truncate">
                      {p.name}
                    </p>
                    <p className="text-caption text-peran-kedua">
                      {KATEGORI_LABEL[p.category] || p.category} - Stok: {p.stock}
                    </p>
                  </div>
                  <p className="text-sm font-sub font-semibold text-peran-utama shrink-0">
                    {rupiah(p.price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Aksi cepat ---------- */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickAction
          href="/dashboard/seller/products"
          icon={<Package size={18} aria-hidden="true" />}
          label="Kelola Produk"
        />
        <QuickAction
          href="/dashboard/seller/orders"
          icon={<ShoppingBag size={18} aria-hidden="true" />}
          label="Lihat Pesanan"
        />
        <QuickAction
          href="/dashboard/seller/earnings"
          icon={<TrendingUp size={18} aria-hidden="true" />}
          label="Pendapatan"
        />
        <QuickAction
          href="/dashboard/seller/manage"
          icon={<ArrowRight size={18} aria-hidden="true" />}
          label="Kelola Toko & Produk"
        />
      </div>
    </div>
  );
}

function StatCard({
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
    <Link
      href={href}
      className="card p-4 space-y-2 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
          {icon}
        </span>
        <ArrowRight size={14} className="text-peran-samar" aria-hidden="true" />
      </div>
      <div>
        <p className="text-caption text-peran-kedua">{label}</p>
        <p className="text-lg font-sub font-semibold text-peran-utama truncate">
          {value}
        </p>
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="card p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md transition-shadow"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
        {icon}
      </span>
      <span className="text-caption font-sub font-medium text-peran-utama">
        {label}
      </span>
    </Link>
  );
}

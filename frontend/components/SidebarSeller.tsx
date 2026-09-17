"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  PackageSearch,
  PackagePlus,
  TrendingUp,
  Settings2,
  X,
  Menu,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

const SELLER_NAV: NavItem[] = [
  { href: "/dashboard/seller", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/seller/products", label: "Produk Saya", icon: PackageSearch },
  { href: "/dashboard/seller/orders", label: "Pesanan Masuk", icon: PackagePlus },
  { href: "/dashboard/seller/earnings", label: "Pendapatan", icon: TrendingUp },
  { href: "/dashboard/seller/manage", label: "Kelola Toko & Produk", icon: Settings2 },
];

function SidebarLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: NavItem & { isActive: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-badge font-sub text-sm transition-colors border-l-2 ${
        isActive
          ? "bg-peran-aksi-lembut text-peran-aksi border-peran-aksi"
          : "text-peran-kedua border-transparent hover:bg-peran-sorot hover:text-peran-utama"
      }`}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function SidebarSeller() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tutup drawer saat route berubah
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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

  // Escape key menutup drawer (sama seperti sidebar dashboard KWU/CS/Admin)
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  const isItemActive = (href: string) =>
    href === "/dashboard/seller"
      ? pathname === "/dashboard/seller"
      : pathname.startsWith(href);

  return (
    <>
      {/* ---------- Mobile: tombol garis 3 buka drawer ----------
          Fixed di pojok kanan bawah supaya selalu terjangkau saat scroll,
          sama seperti sidebar dashboard KWU/CS/Admin. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Buka menu seller"
        className="lg:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-peran-aksi text-peran-terang shadow-md flex items-center justify-center"
      >
        <Menu size={22} aria-hidden="true" />
      </button>

      {/* ---------- Mobile: drawer geser dari kiri ---------- */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu seller"
        >
          {/* Overlay gelap di belakang */}
          <button
            type="button"
            aria-label="Tutup menu seller"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          {/* Panel drawer */}
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-peran-kartu border-r border-peran-garis flex flex-col animate-slide-in">
            <div className="px-5 py-5 border-b border-peran-garis flex items-center justify-between">
              <span className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">Dashboard Seller</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Tutup"
                className="rounded-full p-2 text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <p className="px-3 pb-1 text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">
                Dashboard Seller
              </p>
              {SELLER_NAV.map((item) => (
                <SidebarLink
                  key={item.href}
                  {...item}
                  isActive={isItemActive(item.href)}
                  onClick={() => setDrawerOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* ---------- Desktop: sidebar tetap di kiri ---------- */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r border-peran-garis min-h-[calc(100vh-57px)] sticky top-[57px]">
        <nav className="flex-1 px-3 py-4 space-y-1">
          <p className="px-3 pb-1 text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">
            Dashboard Seller
          </p>
          {SELLER_NAV.map((item) => (
            <SidebarLink
              key={item.href}
              {...item}
              isActive={isItemActive(item.href)}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Store,
  Home,
  MessageCircle,
  User,
  PackageSearch,
  LogOut,
  ShieldCheck,
  Headset,
  ShoppingCart,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import ToggleTema from "@/components/ToggleTema";
import { useUnreadChatCount } from "@/lib/use-unread-chat";
import { halamanTanpaNavbar } from "@/lib/navs";
import BrandLockup from "./BrandLockup";

const BASE_NAV = [
  { href: "/home", label: "Beranda", icon: Home },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/orders/status", label: "Pesanan", icon: PackageSearch },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/account", label: "Akun", icon: User },
];

const ROLE_EXTRA: Record<string, { href: string; label: string; icon: any }> = {
  kwu_brital: { href: "/dashboard/brital", label: "Dashboard", icon: LayoutDashboard },
  kwu_laundry: { href: "/dashboard/laundry", label: "Dashboard", icon: LayoutDashboard },
  cs: { href: "/cs", label: "CS", icon: Headset },
  admin: { href: "/admin", label: "Admin", icon: ShieldCheck },
};

export default function Navbar({ dashboardMode = false }: { dashboardMode?: boolean }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { count, open: openCart } = useCart();
  const unreadChatCount = useUnreadChatCount();

  if (!user) return null;

  // Detail chat tampil layar penuh: tanpa navbar atas maupun bawah, supaya
  // kolom pesan dan kolom ketik bisa memakai seluruh tinggi layar.
  if (halamanTanpaNavbar(pathname)) return null;

  const extra = ROLE_EXTRA[user.role];
  const mobileNav = extra ? [...BASE_NAV, extra] : BASE_NAV;

  return (
    <>
      <header className={`sticky top-0 z-30 bg-peran-kartu/90 backdrop-blur border-b border-peran-garis ${dashboardMode ? "lg:hidden" : ""}`}>
        <div className="max-w-page mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/home" className="shrink-0">
            <BrandLockup size={40} />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {BASE_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-full font-sub text-sm transition-colors ${
                  pathname === href ? "bg-peran-aksi text-peran-terang" : "text-peran-kedua hover:bg-peran-sorot"
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
                {href === "/chat" && unreadChatCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-peran-aksen shrink-0" aria-label={`${unreadChatCount} pesan belum dibaca`} />
                )}
              </Link>
            ))}
            {extra && (
              <Link
                href={extra.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-full font-sub text-sm transition-colors ${
                  pathname.startsWith(extra.href) ? "bg-peran-aksi text-peran-terang" : "text-peran-kedua hover:bg-peran-sorot"
                }`}
              >
                <extra.icon size={16} aria-hidden="true" />
                {extra.label}
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <ToggleTema />
            {count > 0 && (
              <button onClick={openCart} className="relative p-2 text-peran-utama hover:bg-peran-sorot rounded-full" aria-label="Keranjang">
                <ShoppingCart size={20} aria-hidden="true" />
                <span className="absolute -top-1 -right-1 bg-peran-aksen text-peran-terang text-[10px] font-sub w-4 h-4 rounded-full flex items-center justify-center">
                  {count > 9 ? "9+" : count}
                </span>
              </button>
            )}
            <button onClick={logout} className="btn-secondary !px-4 !py-2 flex items-center gap-2 text-sm">
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Bottom nav mobile - 5 tab + tombol tema.
          Tombol tema WAJIB ada di sini juga: header atas disembunyikan pada
          layar kecil (`hidden md:flex` di bagian nav-nya), sehingga di HP
          satu-satunya tempat tombol tema bisa dijangkau adalah navbar bawah.
          Ditemukan saat uji browser pada lebar 430px: toggle tidak ditemukan. */}
      <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-peran-kartu border-t border-peran-garis flex justify-around items-center py-2">
        {mobileNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-sub ${
              pathname.startsWith(href) ? "text-peran-aksi" : "text-peran-samar"
            }`}
          >
            <div className="relative">
              <Icon size={20} aria-hidden="true" />
              {href === "/chat" && unreadChatCount > 0 && (
                <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-peran-aksen shrink-0" aria-label={`${unreadChatCount} pesan belum dibaca`} />
              )}
            </div>
            {label}
          </Link>
        ))}
        {/* Tombol tema - bentuknya dibuat sama dengan tab lain supaya
            tidak terlihat sebagai elemen asing di baris navigasi. */}
        <ToggleTema
          varian="tab"
          className={`px-2 py-1 text-xs font-sub ${
            "text-peran-samar"
          }`}
        />
      </nav>
    </>
  );
}

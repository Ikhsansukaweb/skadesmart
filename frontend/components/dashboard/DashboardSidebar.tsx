"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackageSearch,
  History,
  PackagePlus,
  Users,
  Settings2,
  Ticket,
  UserCog,
  MessageCircle,
  Menu,
  X,
} from "lucide-react";
import BrandLockup from "@/components/BrandLockup";
import { useUnreadChatCount } from "@/lib/use-unread-chat";

export type DashboardRole = "kwu_brital" | "kwu_laundry" | "cs" | "admin";

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

const NAV_BY_ROLE: Record<DashboardRole, NavItem[]> = {
  kwu_brital: [
    { href: "/dashboard/brital", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/brital/orders", label: "Pesanan Aktif", icon: PackageSearch },
    { href: "/dashboard/brital/history", label: "Riwayat", icon: History },
    { href: "/dashboard/brital/chat", label: "Chat Brital", icon: MessageCircle },
    { href: "/product/mine", label: "Kelola Menu", icon: PackagePlus },
  ],
  kwu_laundry: [
    { href: "/dashboard/laundry", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/laundry/orders", label: "Pesanan Aktif", icon: PackageSearch },
    { href: "/dashboard/laundry/history", label: "Riwayat", icon: History },
    { href: "/dashboard/laundry/chat", label: "Chat Laundry", icon: MessageCircle },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin#kelola-pengguna", label: "Kelola Pengguna", icon: Users },
    { href: "/admin/kwu", label: "Kelola KWU", icon: Settings2 },
    { href: "/admin/banners", label: "Kelola Banner", icon: PackagePlus },
  ],
  cs: [
    { href: "/cs", label: "Overview", icon: LayoutDashboard },
    { href: "/cs#tiket", label: "Tiket", icon: Ticket },
    { href: "/cs#kelola-akun", label: "Kelola Akun", icon: UserCog },
  ],
};

const ROLE_TITLE: Record<DashboardRole, string> = {
  kwu_brital: "Dashboard Brital",
  kwu_laundry: "Dashboard Laundry",
  admin: "Dashboard Admin",
  cs: "Dashboard CS",
};

function SidebarLink({
  href,
  label,
  icon: Icon,
  isActive,
  unreadCount,
  onNavigate,
}: NavItem & { isActive: boolean; unreadCount?: number; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-badge font-sub text-sm transition-colors ${
        isActive
          ? "bg-peran-aksi-lembut text-peran-aksi font-medium"
          : "text-peran-kedua hover:bg-peran-sorot hover:text-peran-utama"
      }`}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {href === "/chat" && unreadCount && unreadCount > 0 ? (
        <span className="w-2 h-2 rounded-full bg-peran-aksen shrink-0" aria-label={`${unreadCount} pesan belum dibaca`} />
      ) : null}
      {(href === "/dashboard/brital/chat" || href === "/dashboard/laundry/chat") && unreadCount && unreadCount > 0 ? (
        <span className="w-2 h-2 rounded-full bg-peran-aksen shrink-0" aria-label={`${unreadCount} pesan belum dibaca`} />
      ) : null}
    </Link>
  );
}

/** Sidebar generik untuk semua dashboard.
 *
 * Perilaku:
 * - Desktop (lg+): sidebar fixed di kiri, lebar 256px, selalu tampil.
 * - Mobile (<lg): disembunyikan, tombol hamburger (garis 3) mengambang di
 *   pojok kanan bawah. Ditekan -> drawer slide-in dari kiri dengan overlay.
 *
 * Navbar atas tetap dirender oleh DashboardShell (tidak dihapus). Menu utama
 * (Beranda, Marketplace, Pesanan, Chat, Akun) tetap di navbar atas; sidebar
 * ini HANYAL berisi menu dashboard spesifik per role (Overview, Pesanan
 * Aktif, Riwayat, dll).
 */
export default function DashboardSidebar({ role }: { role: DashboardRole }) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role];
  const unreadChatCount = useUnreadChatCount();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Tutup drawer mobile saat route berubah
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Kunci scroll body saat drawer mobile terbuka
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Escape key menutup drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  const isItemActive = useCallback(
    (href: string) => (href.includes("#") ? pathname === href.split("#")[0] : pathname === href),
    [pathname]
  );

  return (
    <>
      {/* Tombol hamburger (garis 3) - hanya tampil di mobile (< lg).
          Diposisikan fixed agar selalu terjangkau saat scroll. */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-peran-aksi text-peran-terang shadow-md flex items-center justify-center"
        aria-label="Buka menu dashboard"
      >
        <Menu size={22} aria-hidden="true" />
      </button>

      {/* Sidebar desktop - fixed di kiri, selalu tampil mulai lg ke atas.
          Top offset menyesuaikan tinggi navbar atas (57px). */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-peran-garis bg-peran-kartu fixed top-[57px] bottom-0 left-0 overflow-y-auto">
        <div className="px-5 py-4 border-b border-peran-garis">
          <p className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">
            {ROLE_TITLE[role]}
          </p>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {items.map((item) => (
            <SidebarLink
              key={item.href}
              {...item}
              isActive={isItemActive(item.href)}
              unreadCount={unreadChatCount}
            />
          ))}
        </nav>
      </aside>

      {/* Drawer mobile - slide dari kiri dengan overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Panel drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[80vw] bg-peran-kartu border-r border-peran-garis flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-peran-garis">
              <Link href="/home" onClick={() => setMobileOpen(false)}>
                <BrandLockup size={26} />
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-full text-peran-kedua hover:bg-peran-sorot"
                aria-label="Tutup menu"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-peran-garis">
              <p className="text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">
                {ROLE_TITLE[role]}
              </p>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <SidebarLink
                  key={item.href}
                  {...item}
                  isActive={isItemActive(item.href)}
                  unreadCount={unreadChatCount}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

"use client";

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
  Home,
  Store,
  MessageCircle,
  User,
} from "lucide-react";
import BrandLockup from "@/components/BrandLockup";
import { useUnreadChatCount } from "@/lib/use-unread-chat";

export type DashboardRole = "kwu_brital" | "kwu_laundry" | "cs" | "admin";

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

const MAIN_APP_NAV: NavItem[] = [
  { href: "/home", label: "Beranda", icon: Home },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/account", label: "Akun", icon: User },
];

const NAV_BY_ROLE: Record<DashboardRole, NavItem[]> = {
  kwu_brital: [
    { href: "/dashboard/brital", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/brital/orders", label: "Pesanan Aktif", icon: PackageSearch },
    { href: "/dashboard/brital/history", label: "Riwayat", icon: History },
    { href: "/chat", label: "Chat", icon: MessageCircle },
    { href: "/product/mine", label: "Kelola Menu", icon: PackagePlus },
  ],
  kwu_laundry: [
    { href: "/dashboard/laundry", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/laundry/orders", label: "Pesanan Aktif", icon: PackageSearch },
    { href: "/dashboard/laundry/history", label: "Riwayat", icon: History },
    { href: "/chat", label: "Chat", icon: MessageCircle },
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

function SidebarLink({ href, label, icon: Icon, isActive, unreadCount }: NavItem & { isActive: boolean; unreadCount?: number }) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-badge font-sub text-sm transition-colors border-l-2 ${
        isActive
          ? "bg-peran-aksi-lembut text-peran-aksi border-peran-aksi"
          : "text-peran-kedua border-transparent hover:bg-peran-sorot hover:text-peran-utama"
      }`}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="flex-1 min-w-0 flex items-center justify-between">
        <span className="truncate">{label}</span>
        {href === "/chat" && unreadCount && unreadCount > 0 ? (
          <span className="w-2 h-2 rounded-full bg-peran-aksen shrink-0" aria-label={`${unreadCount} pesan belum dibaca`} />
        ) : null}
      </span>
    </Link>
  );
}

export default function DashboardSidebar({ role }: { role: DashboardRole }) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role];
  const unreadChatCount = useUnreadChatCount();

  const isItemActive = (href: string) => (href.includes("#") ? pathname === href.split("#")[0] : pathname === href);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r border-peran-garis min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-peran-garis">
        <Link href="/home">
          <BrandLockup size={26} />
        </Link>
      </div>

      <nav className="px-3 py-4 space-y-1">
        <p className="px-3 pb-1 text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">Menu Utama</p>
        {MAIN_APP_NAV.map((item) => (
          <SidebarLink key={item.href} {...item} isActive={isItemActive(item.href)} unreadCount={unreadChatCount} />
        ))}
      </nav>

      <nav className="flex-1 px-3 py-4 space-y-1 border-t border-peran-garis">
        <p className="px-3 pb-1 text-[11px] font-sub font-semibold text-peran-samar uppercase tracking-wide">Dashboard</p>
        {items.map((item) => (
          <SidebarLink key={item.href} {...item} isActive={isItemActive(item.href)} />
        ))}
      </nav>
    </aside>
  );
}

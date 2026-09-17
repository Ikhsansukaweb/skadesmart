"use client";

import { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import SidebarSeller from "@/components/SidebarSeller";
import { useAuth } from "@/lib/auth-context";

// Layout dashboard seller: sidebar kiri (desktop tetap, mobile = drawer garis 3)
// + Navbar atas (di mobile, untuk desktop disembunyikan lewat dashboardMode).
// Semua role bisa akses — seller siswa maupun staf KWU yang jualan.
export default function SellerDashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-peran-kedua">Memuat...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-peran-kedua">
          Silakan login untuk mengakses dashboard seller.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <Navbar />
      <div className="lg:flex">
        <SidebarSeller />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

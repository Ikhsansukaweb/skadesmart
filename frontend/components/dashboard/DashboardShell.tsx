"use client";

import { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import DashboardSidebar, { DashboardRole } from "./DashboardSidebar";

interface DashboardShellProps {
  role: DashboardRole;
  greetingName?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  searchSlot?: ReactNode;
  rightPanel?: ReactNode;
  /** Sembunyikan header "Halo, ...!" + subtitle (dipakai halaman chat). */
  polos?: boolean;
  /** Lebar penuh tanpa grid 2 kolom (dipakai halaman chat). */
  lebarPenuh?: boolean;
  children: ReactNode;
}

/** Layout dashboard generik:
 *
 * - Navbar atas: tetap dirender (menu utama: Beranda, Marketplace, Pesanan,
 *   Chat, Akun). TIDAK disembunyikan di desktop - beda dari versi lama.
 * - Sidebar kiri: fixed di desktop (lg+), drawer hamburger di mobile.
 *   Sidebar HANYAL berisi menu dashboard per role, bukan menu utama app.
 * - Konten utama: offset ke kanan sebesar lebar sidebar di desktop.
 * - Panel kanan (widget): opsional, grid 2 kolom di desktop.
 */
export default function DashboardShell({
  role,
  greetingName,
  subtitle,
  headerAction,
  searchSlot,
  rightPanel,
  polos,
  lebarPenuh,
  children,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <Navbar />
      <DashboardSidebar role={role} />

      {/* Konten utama: di desktop, offset kiri sebesar lebar sidebar (lg:w-64 = 16rem).
          Di mobile, lebar penuh (sidebar disembunyikan, pakai drawer). */}
      <div className="lg:pl-64">
        {searchSlot && (
          <div className="hidden lg:flex items-center justify-end gap-3 px-6 py-3 border-b border-peran-garis">
            {searchSlot}
          </div>
        )}

        {polos ? (
          <div className="max-w-page mx-auto px-4 sm:px-6 py-6">{children}</div>
        ) : (
          <div className="max-w-page mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h1 className="text-heading-sm font-semibold text-peran-utama">Halo, {greetingName}!</h1>
                <p className="text-body-sm text-peran-kedua">{subtitle}</p>
              </div>
              {headerAction}
            </div>

            <div className={lebarPenuh ? "" : "grid lg:grid-cols-[1fr_300px] gap-6 items-start"}>
              <div className="space-y-5 min-w-0">{children}</div>
              {rightPanel && <div className="space-y-4">{rightPanel}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

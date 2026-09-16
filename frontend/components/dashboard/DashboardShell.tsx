"use client";

import { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import DashboardSidebar, { DashboardRole } from "./DashboardSidebar";

interface DashboardShellProps {
  role: DashboardRole;
  greetingName: string;
  subtitle: string;
  headerAction?: ReactNode;
  searchSlot?: ReactNode;
  rightPanel?: ReactNode;
  children: ReactNode;
}

// Layout dashboard finansial-style: sidebar kiri (>=1024px) + konten utama +
// panel kanan (widget), lihat bagian 7 prompt redesign. Di mobile, sidebar
// disembunyikan dan navigasi kembali ke bottom-nav Navbar.tsx yang sudah ada.
export default function DashboardShell({
  role,
  greetingName,
  subtitle,
  headerAction,
  searchSlot,
  rightPanel,
  children,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <Navbar dashboardMode />
      <div className="lg:flex">
        <DashboardSidebar role={role} />

        <div className="flex-1 min-w-0">
          {searchSlot && (
            <div className="hidden lg:flex items-center justify-end gap-3 px-6 py-3 border-b border-peran-garis">
              {searchSlot}
            </div>
          )}

          <div className="max-w-page mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h1 className="text-heading-sm font-semibold text-peran-utama">Halo, {greetingName}!</h1>
                <p className="text-body-sm text-peran-kedua">{subtitle}</p>
              </div>
              {headerAction}
            </div>

            <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
              <div className="space-y-5 min-w-0">{children}</div>
              {rightPanel && <div className="space-y-4">{rightPanel}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import DashboardSidebar, { DashboardRole } from "./DashboardSidebar";

interface SubPageShellProps {
  role: DashboardRole;
  title: string;
  backHref: string;
  children: ReactNode;
}

/** Layout untuk sub-halaman dashboard (Pesanan Aktif, Riwayat, Kelola KWU,
 *  Kelola Banner). Sama seperti DashboardShell: navbar atas tetap tampil,
 *  sidebar fixed di desktop / drawer hamburger di mobile, konten offset.
 */
export default function SubPageShell({ role, title, children }: Omit<SubPageShellProps, "backHref">) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <Navbar />
      <DashboardSidebar role={role} />

      <div className="lg:pl-64">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <h1 className="text-2xl font-heading font-semibold text-peran-utama">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

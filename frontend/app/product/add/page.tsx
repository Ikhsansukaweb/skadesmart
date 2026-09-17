"use client";

// Selalu render ulang di server, jangan di-cache lama.
export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import SubPageShell from "@/components/dashboard/SubPageShell";
import type { DashboardRole } from "@/components/dashboard/DashboardSidebar";
import ProductForm from "@/components/ProductForm";
import { useAuth } from "@/lib/auth-context";

// Halaman tambah produk. Dibungkus SubPageShell supaya sidebar + navbar
// tampil (baik untuk staf KWU Brital/Laundry maupun seller siswa).
export default function AddProductPage() {
  const router = useRouter();
  const { user } = useAuth();

  const peranDashboard: DashboardRole =
    user?.role === "kwu_laundry" ? "kwu_laundry" : "kwu_brital";

  return (
    <SubPageShell role={peranDashboard} title="Tambah Produk">
      <ProductForm
        mode="add"
        onSuccess={() => router.push("/dashboard/seller/products")}
      />
    </SubPageShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Package,
  ShoppingBag,
  Clock,
  Wallet,
  Settings2,
  LoaderCircle,
  UserPlus,
  Receipt,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AlertCard, ExportCard, ProfileCard, ListCard, ListRow } from "@/components/dashboard/DashboardWidgets";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Summary {
  totalUsers: number;
  totalProducts: number;
  totalOrders: number;
  pendingOrders: number;
  revenue: number;
}

interface AdminUser {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: string;
  created_at: string;
}

interface Transaction {
  id: number;
  buyer_name: string;
  seller_name: string;
  kwu_unit: string;
  status: string;
  total_price: number;
  created_at: string;
}

const ROLE_OPTIONS = ["siswa", "kwu_brital", "kwu_laundry", "cs", "admin"];

// Admin Dashboard - layout sidebar + panel kanan (bagian 7 prompt redesign).
// "Pesanan Terbaru" memakai endpoint /admin/transactions yang sudah ada di
// backend tapi sebelumnya tidak dipakai FE sama sekali.
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  function load() {
    api<Summary>("/admin/dashboard/summary").then(setSummary).catch(() => {});
    api<{ users: AdminUser[] }>("/admin/users").then((d) => setUsers(d.users)).catch(() => {});
    api<{ orders: Transaction[] }>("/admin/transactions").then((d) => setTransactions(d.orders)).catch(() => {});
  }

  useEffect(load, []);

  async function changeRole(id: number, role: string) {
    setUpdatingId(id);
    try {
      await api(`/admin/users/${id}/role`, { method: "PUT", json: { role } });
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  if (user && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus admin.</p>
      </main>
    );
  }

  const cards = summary
    ? [
        { label: "Total Pengguna", value: summary.totalUsers, icon: Users },
        { label: "Produk Aktif", value: summary.totalProducts, icon: Package },
        { label: "Total Pesanan", value: summary.totalOrders, icon: ShoppingBag },
        { label: "Pesanan Pending", value: summary.pendingOrders, icon: Clock },
        { label: "Pendapatan", value: `Rp${summary.revenue.toLocaleString("id-ID")}`, icon: Wallet },
      ]
    : [];

  return (
    <DashboardShell
      role="admin"
      greetingName={user?.full_name || "Admin"}
      subtitle="Dashboard Admin"
      headerAction={
        <Link href="/admin/kwu" className="btn-secondary !px-4 !py-2 flex items-center gap-2 text-sm">
          <Settings2 size={16} aria-hidden="true" /> Edit KWU
        </Link>
      }
      rightPanel={
        <>
          <AlertCard
            active={!!summary && summary.pendingOrders > 0}
            message={`Ada ${summary?.pendingOrders ?? 0} pesanan yang masih berjalan di seluruh unit.`}
          />
          <ProfileCard ctaLabel="Kelola Pengguna" ctaHref="#kelola-pengguna" />
          <ExportCard label="Data pengguna" rows={users.map((u) => ({
            id: u.id, nama: u.full_name, nisn: u.nisn, kelas: u.class_name, role: u.role, terdaftar: u.created_at,
          }))} />
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-4 text-center space-y-1">
            <Icon size={20} className="mx-auto text-electric" aria-hidden="true" />
            <p className="font-heading font-semibold text-lg text-ink">{value}</p>
            <p className="text-xs text-steel font-body">{label}</p>
          </div>
        ))}
        {!summary && <p className="col-span-full text-fog font-body text-sm">Memuat ringkasan...</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard title="Pengguna Terbaru" emptyLabel={users.length === 0 ? "Belum ada pengguna." : undefined}>
          {users.slice(0, 5).map((u) => (
            <ListRow
              key={u.id}
              icon={<UserPlus size={16} aria-hidden="true" />}
              title={u.full_name}
              subtitle={`${u.class_name || u.role} - NISN ${u.nisn}`}
              value={u.role}
              tone="neutral"
            />
          ))}
        </ListCard>

        <ListCard title="Pesanan Terbaru" emptyLabel={transactions.length === 0 ? "Belum ada pesanan." : undefined}>
          {transactions.slice(0, 5).map((t) => (
            <ListRow
              key={t.id}
              icon={<Receipt size={16} aria-hidden="true" />}
              title={`${t.buyer_name} -> ${t.seller_name}`}
              subtitle={t.kwu_unit}
              value={t.status === "dibatalkan" ? "Dibatalkan" : `Rp${t.total_price.toLocaleString("id-ID")}`}
              tone={t.status === "dibatalkan" ? "negative" : t.status === "selesai" ? "positive" : "neutral"}
            />
          ))}
        </ListCard>
      </div>

      <div id="kelola-pengguna">
        <h2 className="text-subheading font-semibold mb-3 text-ink">Kelola Pengguna</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-ink font-sub">
              <tr>
                <th className="text-left px-3 py-2">Nama</th>
                <th className="text-left px-3 py-2">NISN</th>
                <th className="text-left px-3 py-2">Kelas</th>
                <th className="text-left px-3 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-sand">
                  <td className="px-3 py-2 font-body">{u.full_name}</td>
                  <td className="px-3 py-2 font-body">{u.nisn}</td>
                  <td className="px-3 py-2 font-body">{u.class_name}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        disabled={updatingId === u.id}
                        className="input-field py-1 text-xs"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      {updatingId === u.id && <LoaderCircle size={14} className="animate-spin text-electric" aria-hidden="true" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="p-4 text-fog font-body text-sm">Belum ada pengguna.</p>}
        </div>
      </div>
    </DashboardShell>
  );
}

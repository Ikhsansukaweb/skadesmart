"use client";

import { useEffect, useState, useMemo } from "react";
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
  TrendingUp,
  TrendingDown,
  Search,
  ChevronLeft,
  ChevronRight,
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

const ROLE_LABELS: Record<string, string> = {
  siswa: "Siswa",
  kwu_brital: "KWU Brital",
  kwu_laundry: "KWU Laundry",
  cs: "CS",
  admin: "Admin",
};

const ROLE_COLORS: Record<string, string> = {
  siswa: "#5196fe",
  kwu_brital: "#f9754e",
  kwu_laundry: "#16a34a",
  cs: "#f59e0b",
  admin: "#1b1d20",
};

const USERS_PER_PAGE = 8;

// Bar chart sederhana berbasis SVG untuk distribusi role pengguna.
function RoleDistributionChart({ users }: { users: AdminUser[] }) {
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      counts[u.role] = (counts[u.role] || 0) + 1;
    }
    return ROLE_OPTIONS.map((r) => ({ role: r, count: counts[r] || 0 }));
  }, [users]);

  const maxCount = Math.max(1, ...roleCounts.map((r) => r.count));

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Distribusi Role Pengguna</h3>
      <div className="space-y-2">
        {roleCounts.map(({ role, count }) => (
          <div key={role} className="flex items-center gap-3">
            <span className="text-xs font-sub text-peran-kedua w-24 shrink-0">{ROLE_LABELS[role]}</span>
            <div className="flex-1 h-6 bg-peran-lembut rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${(count / maxCount) * 100}%`,
                  backgroundColor: ROLE_COLORS[role],
                  minWidth: count > 0 ? "24px" : "0",
                }}
              >
                {count > 0 && (
                  <span className="text-[10px] font-sub font-medium text-peran-terang">{count}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Bar chart untuk pendapatan per KWU unit.
function RevenueByUnitChart({ transactions }: { transactions: Transaction[] }) {
  const unitRevenue = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const t of transactions) {
      if (t.status !== "dibatalkan") {
        sums[t.kwu_unit] = (sums[t.kwu_unit] || 0) + t.total_price;
      }
    }
    const entries = Object.entries(sums).map(([unit, total]) => ({ unit, total }));
    return entries.sort((a, b) => b.total - a.total);
  }, [transactions]);

  const maxRevenue = Math.max(1, ...unitRevenue.map((u) => u.total));

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Pendapatan per Unit KWU</h3>
      {unitRevenue.length === 0 ? (
        <p className="text-caption text-peran-samar py-4 text-center">Belum ada data transaksi.</p>
      ) : (
        <div className="space-y-2">
          {unitRevenue.map(({ unit, total }) => (
            <div key={unit} className="flex items-center gap-3">
              <span className="text-xs font-sub text-peran-kedua w-28 shrink-0 truncate">
                {ROLE_LABELS[unit] || unit}
              </span>
              <div className="flex-1 h-6 bg-peran-lembut rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-peran-aksi transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${(total / maxRevenue) * 100}%`, minWidth: "30px" }}
                >
                  <span className="text-[10px] font-sub font-medium text-peran-terang">
                    Rp{total.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Stat card dengan indikator trend.
function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon: any;
  trend?: { value: string; isPositive: boolean };
}) {
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-full bg-peran-aksi-lembut flex items-center justify-center text-peran-aksi">
          <Icon size={18} aria-hidden="true" />
        </div>
        {trend && (
          <span
            className={`text-[11px] font-sub flex items-center gap-0.5 ${
              trend.isPositive ? "text-peran-naik" : "text-peran-turun"
            }`}
          >
            {trend.isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="font-heading font-semibold text-lg text-peran-utama">{value}</p>
      <p className="text-xs text-peran-kedua font-body">{label}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Filter & search untuk tabel pengguna
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

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

  // Filter & pagination untuk tabel pengguna
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.full_name.toLowerCase().includes(search.toLowerCase()) || u.nisn.includes(search);
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);

  // Reset ke halaman 1 saat filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter]);

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
          <ExportCard
            label="Data pengguna"
            rows={users.map((u) => ({
              id: u.id,
              nama: u.full_name,
              nisn: u.nisn,
              kelas: u.class_name,
              role: u.role,
              terdaftar: u.created_at,
            }))}
          />
        </>
      }
    >
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {summary ? (
          <>
            <StatCard label="Total Pengguna" value={summary.totalUsers} icon={Users} />
            <StatCard label="Produk Aktif" value={summary.totalProducts} icon={Package} />
            <StatCard label="Total Pesanan" value={summary.totalOrders} icon={ShoppingBag} />
            <StatCard label="Pesanan Pending" value={summary.pendingOrders} icon={Clock} />
            <StatCard
              label="Pendapatan"
              value={`Rp${summary.revenue.toLocaleString("id-ID")}`}
              icon={Wallet}
            />
          </>
        ) : (
          <p className="col-span-full text-fog font-body text-sm">Memuat ringkasan...</p>
        )}
      </div>

      {/* Charts: distribusi role + pendapatan per unit */}
      <div className="grid md:grid-cols-2 gap-4">
        <RoleDistributionChart users={users} />
        <RevenueByUnitChart transactions={transactions} />
      </div>

      {/* List cards: pengguna terbaru + pesanan terbaru */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard
          title="Pengguna Terbaru"
          emptyLabel={users.length === 0 ? "Belum ada pengguna." : undefined}
        >
          {users.slice(0, 5).map((u) => (
            <ListRow
              key={u.id}
              icon={<UserPlus size={16} aria-hidden="true" />}
              title={u.full_name}
              subtitle={`${u.class_name || u.role} - NISN ${u.nisn}`}
              value={ROLE_LABELS[u.role] || u.role}
              tone="neutral"
            />
          ))}
        </ListCard>

        <ListCard
          title="Pesanan Terbaru"
          emptyLabel={transactions.length === 0 ? "Belum ada pesanan." : undefined}
        >
          {transactions.slice(0, 5).map((t) => (
            <ListRow
              key={t.id}
              icon={<Receipt size={16} aria-hidden="true" />}
              title={`${t.buyer_name} -> ${t.seller_name}`}
              subtitle={ROLE_LABELS[t.kwu_unit] || t.kwu_unit}
              value={t.status === "dibatalkan" ? "Dibatalkan" : `Rp${t.total_price.toLocaleString("id-ID")}`}
              tone={t.status === "dibatalkan" ? "negative" : t.status === "selesai" ? "positive" : "neutral"}
            />
          ))}
        </ListCard>
      </div>

      {/* Kelola pengguna dengan search, filter role, dan pagination */}
      <div id="kelola-pengguna">
        <h2 className="text-subheading font-semibold mb-3 text-peran-utama">Kelola Pengguna</h2>

        {/* Toolbar: search + filter role */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-peran-samar"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NISN..."
              className="input-field !pl-10 !py-2 text-sm"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="input-field !py-2 text-sm sm:w-44"
          >
            <option value="all">Semua Role</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-peran-kedua font-body mb-2">
          Menampilkan {paginatedUsers.length} dari {filteredUsers.length} pengguna
        </p>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-peran-lembut text-peran-utama font-sub">
              <tr>
                <th className="text-left px-3 py-2">Nama</th>
                <th className="text-left px-3 py-2">NISN</th>
                <th className="text-left px-3 py-2">Kelas</th>
                <th className="text-left px-3 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((u) => (
                <tr key={u.id} className="border-t border-peran-garis">
                  <td className="px-3 py-2 font-body">{u.full_name}</td>
                  <td className="px-3 py-2 font-body">{u.nisn}</td>
                  <td className="px-3 py-2 font-body">{u.class_name}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        disabled={updatingId === u.id}
                        className="input-field py-1 text-xs !w-32"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      {updatingId === u.id && (
                        <LoaderCircle size={14} className="animate-spin text-peran-aksi" aria-hidden="true" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {paginatedUsers.length === 0 && (
            <p className="p-4 text-fog font-body text-sm">Tidak ada pengguna ditemukan.</p>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1 disabled:opacity-30"
            >
              <ChevronLeft size={14} aria-hidden="true" /> Sebelumnya
            </button>
            <span className="text-xs text-peran-kedua font-sub">
              Halaman {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1 disabled:opacity-30"
            >
              Berikutnya <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

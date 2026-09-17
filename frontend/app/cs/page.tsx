"use client";

// Selalu render ulang di server, jangan di-cache lama.
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import {
  LoaderCircle,
  Trash2,
  Ticket as TicketIcon,
  CheckCircle2,
  Clock,
  Search,
  Headset,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import DashboardShell from "@/components/dashboard/DashboardShell";
import {
  AlertCard,
  ExportCard,
  ProfileCard,
  ListCard,
  ListRow,
} from "@/components/dashboard/DashboardWidgets";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Ticket {
  id: number;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "closed";
  full_name: string;
  class_name: string;
  created_at: string;
}

interface CsUser {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: string;
}

const STATUS_OPTIONS: Ticket["status"][] = ["open", "in_progress", "closed"];
const STATUS_LABEL: Record<Ticket["status"], string> = {
  open: "Terbuka",
  in_progress: "Diproses",
  closed: "Selesai",
};
const STATUS_COLOR: Record<Ticket["status"], string> = {
  open: "#f9754e",
  in_progress: "#f59e0b",
  closed: "#16a34a",
};

// Stat card ringkas untuk dashboard CS.
function TicketStatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: any;
  tone?: "positive" | "neutral" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-peran-naik"
      : tone === "warning"
        ? "text-peran-peringatan"
        : tone === "danger"
          ? "text-peran-aksen"
          : "text-peran-aksi";
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-peran-kedua font-body">{label}</p>
        <Icon size={16} className={toneClass} aria-hidden="true" />
      </div>
      <p className="font-heading font-semibold text-xl text-peran-utama">{value}</p>
    </div>
  );
}

// Donut chart untuk distribusi status tiket.
function TicketStatusDonut({ tickets }: { tickets: Ticket[] }) {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return STATUS_OPTIONS.map((s) => ({ status: s, count: counts[s] || 0 }));
  }, [tickets]);

  const total = tickets.length;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  let offsetAccum = 0;

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Distribusi Tiket</h3>
      {total === 0 ? (
        <p className="text-caption text-peran-samar py-4 text-center">Belum ada tiket.</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--bg-lembut)" strokeWidth="10" />
            {statusCounts.map(({ status, count }) => {
              const dash = (count / total) * circumference;
              const el = (
                <circle
                  key={status}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={STATUS_COLOR[status]}
                  strokeWidth="10"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offsetAccum}
                  transform="rotate(-90 50 50)"
                />
              );
              offsetAccum += dash;
              return el;
            })}
            <text x="50" y="48" textAnchor="middle" className="fill-peran-utama font-sub font-semibold" fontSize="18">
              {total}
            </text>
            <text x="50" y="62" textAnchor="middle" className="fill-peran-kedua font-body" fontSize="9">
              tiket
            </text>
          </svg>
          <div className="space-y-2 flex-1">
            {statusCounts.map(({ status, count }) => (
              <div key={status} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                />
                <span className="text-xs font-sub text-peran-kedua flex-1">
                  {STATUS_LABEL[status]}
                </span>
                <span className="text-xs font-sub font-medium text-peran-utama">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Statistik waktu respons berdasarkan umur tiket yang masih terbuka.
function ResponseTimeCard({ tickets }: { tickets: Ticket[] }) {
  const avgAge = useMemo(() => {
    const open = tickets.filter((t) => t.status !== "closed");
    if (open.length === 0) return null;
    const now = Date.now();
    const totalHours = open.reduce((sum, t) => {
      const age = (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
      return sum + age;
    }, 0);
    return totalHours / open.length;
  }, [tickets]);

  const oldestTicket = useMemo(() => {
    const open = tickets.filter((t) => t.status !== "closed");
    if (open.length === 0) return null;
    return open.reduce((oldest, t) =>
      new Date(t.created_at) < new Date(oldest.created_at) ? t : oldest
    );
  }, [tickets]);

  function formatAge(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)} menit`;
    if (hours < 24) return `${Math.round(hours)} jam`;
    return `${Math.round(hours / 24)} hari`;
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-peran-peringatan" aria-hidden="true" />
        <h3 className="font-sub font-semibold text-sm text-peran-utama">Waktu Respons</h3>
      </div>
      {avgAge === null ? (
        <p className="text-caption text-peran-samar py-4 text-center">Semua tiket sudah selesai.</p>
      ) : (
        <div className="space-y-2">
          <div>
            <p className="text-xs text-peran-kedua font-body">Rata-rata umur tiket terbuka</p>
            <p className="font-heading font-semibold text-lg text-peran-utama">{formatAge(avgAge)}</p>
          </div>
          {oldestTicket && (
            <div className="pt-2 border-t border-peran-garis">
              <p className="text-xs text-peran-kedua font-body">Tiket tertua</p>
              <p className="text-xs font-sub text-peran-aksen truncate">{oldestTicket.subject}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<CsUser[]>([]);
  const [search, setSearch] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function load() {
    api<{ tickets: Ticket[] }>("/cs/tickets")
      .then((d) => setTickets(d.tickets))
      .catch((err) => setError(err.message));
    api<{ users: CsUser[] }>("/cs/users").then((d) => setUsers(d.users)).catch(() => {});
  }

  useEffect(load, []);

  async function updateStatus(id: number, status: Ticket["status"]) {
    setUpdatingId(id);
    try {
      await api(`/cs/tickets/${id}`, { method: "PUT", json: { status } });
      load();
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteUser(id: number, name: string) {
    if (!confirm(`Hapus akun "${name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingId(id);
    try {
      await api(`/cs/users/${id}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (user && user.role !== "cs" && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus tim CS.</p>
      </main>
    );
  }

  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
  const closedTickets = tickets.filter((t) => t.status === "closed");

  const filteredUsers = users.filter(
    (u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.nisn.includes(search)
  );

  // Filter tiket berdasarkan search & status
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch =
        t.subject.toLowerCase().includes(ticketSearch.toLowerCase()) ||
        t.message.toLowerCase().includes(ticketSearch.toLowerCase()) ||
        t.full_name.toLowerCase().includes(ticketSearch.toLowerCase());
      const matchesStatus = ticketStatusFilter === "all" || t.status === ticketStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tickets, ticketSearch, ticketStatusFilter]);

  return (
    <DashboardShell
      role="cs"
      greetingName={user?.full_name || "Kak"}
      subtitle="Dashboard CS"
      rightPanel={
        <>
          <AlertCard
            active={openTickets.length > 0}
            message={`Ada ${openTickets.length} tiket yang masih menunggu ditangani.`}
          />
          <ProfileCard ctaLabel="Kelola Tiket" ctaHref="#tiket" />
          <ExportCard
            label="Data tiket bantuan"
            rows={tickets.map((t) => ({
              id: t.id,
              subjek: t.subject,
              status: t.status,
              pengirim: t.full_name,
              kelas: t.class_name,
              tanggal: t.created_at,
            }))}
          />
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-peran-aksen font-body">
          {error}
        </p>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TicketStatCard
          label="Tiket Terbuka"
          value={tickets.filter((t) => t.status === "open").length}
          icon={AlertCircle}
          tone="danger"
        />
        <TicketStatCard
          label="Sedang Diproses"
          value={tickets.filter((t) => t.status === "in_progress").length}
          icon={LoaderCircle}
          tone="warning"
        />
        <TicketStatCard
          label="Tiket Selesai"
          value={closedTickets.length}
          icon={CheckCircle2}
          tone="positive"
        />
        <TicketStatCard
          label="Total Tiket"
          value={tickets.length}
          icon={TrendingUp}
        />
      </div>

      {/* Charts: donut + response time */}
      <div className="grid md:grid-cols-2 gap-4">
        <TicketStatusDonut tickets={tickets} />
        <ResponseTimeCard tickets={tickets} />
      </div>

      {/* List cards: tiket terbuka + selesai */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard
          title="Tiket Terbuka"
          seeAllHref="#tiket"
          emptyLabel={openTickets.length === 0 ? "Tidak ada tiket terbuka." : undefined}
        >
          {openTickets.slice(0, 5).map((t) => (
            <ListRow
              key={t.id}
              icon={<TicketIcon size={16} aria-hidden="true" />}
              title={t.subject}
              subtitle={`${t.full_name} - ${t.class_name}`}
              value={STATUS_LABEL[t.status]}
              tone="neutral"
            />
          ))}
        </ListCard>

        <ListCard
          title="Tiket Selesai"
          seeAllHref="#tiket"
          emptyLabel={closedTickets.length === 0 ? "Belum ada tiket selesai." : undefined}
        >
          {closedTickets.slice(0, 5).map((t) => (
            <ListRow
              key={t.id}
              icon={<CheckCircle2 size={16} aria-hidden="true" />}
              title={t.subject}
              subtitle={`${t.full_name} - ${t.class_name}`}
              value="Selesai"
              tone="positive"
            />
          ))}
        </ListCard>
      </div>

      {/* Tiket bantuan dengan search & filter */}
      <section id="tiket">
        <h2 className="text-subheading font-semibold mb-3 text-peran-utama">Tiket Bantuan</h2>

        {/* Toolbar: search + filter status */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-peran-samar"
              aria-hidden="true"
            />
            <input
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Cari subjek, pesan, atau nama..."
              className="input-field !pl-10 !py-2 text-sm"
            />
          </div>
          <select
            value={ticketStatusFilter}
            onChange={(e) => setTicketStatusFilter(e.target.value)}
            className="input-field !py-2 text-sm sm:w-40"
          >
            <option value="all">Semua Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {filteredTickets.map((t) => (
            <div key={t.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-sub font-medium text-peran-utama">{t.subject}</h3>
                  <p className="text-xs text-peran-kedua font-body">
                    {t.full_name} - {t.class_name}
                  </p>
                </div>
                <span
                  className="text-xs font-sub px-2 py-1 rounded-full shrink-0"
                  style={{
                    backgroundColor: `${STATUS_COLOR[t.status]}20`,
                    color: STATUS_COLOR[t.status],
                  }}
                >
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
              <p className="text-sm text-peran-kedua font-body">{t.message}</p>
              <div className="flex gap-2 pt-1 flex-wrap">
                {STATUS_OPTIONS.filter((s) => s !== t.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(t.id, s)}
                    disabled={updatingId === t.id}
                    className="btn-secondary !px-3 !py-1.5 text-xs flex items-center gap-1"
                  >
                    {updatingId === t.id && (
                      <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                    )}
                    Tandai {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredTickets.length === 0 && !error && (
            <p className="text-peran-samar font-body text-sm">
              {tickets.length === 0
                ? "Tidak ada tiket bantuan saat ini."
                : "Tidak ada tiket yang cocok dengan filter."}
            </p>
          )}
        </div>
      </section>

      {/* Kelola akun */}
      <section id="kelola-akun">
        <h2 className="text-subheading font-semibold mb-3 text-peran-utama">Kelola Akun</h2>
        <div className="relative mb-3">
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
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-peran-lembut text-peran-utama font-sub">
              <tr>
                <th className="text-left px-3 py-2">Nama</th>
                <th className="text-left px-3 py-2">NISN</th>
                <th className="text-left px-3 py-2">Kelas</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-t border-peran-garis">
                  <td className="px-3 py-2 font-body">{u.full_name}</td>
                  <td className="px-3 py-2 font-body">{u.nisn}</td>
                  <td className="px-3 py-2 font-body">{u.class_name}</td>
                  <td className="px-3 py-2 font-body">{u.role}</td>
                  <td className="px-3 py-2">
                    {u.role !== "admin" && (
                      <button
                        onClick={() => deleteUser(u.id, u.full_name)}
                        disabled={deletingId === u.id}
                        className="text-peran-aksen p-1.5 hover:bg-peran-aksen-lembut rounded-full"
                        aria-label={`Hapus akun ${u.full_name}`}
                      >
                        {deletingId === u.id ? (
                          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 size={16} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <p className="p-4 text-peran-samar font-body text-sm">Tidak ada akun ditemukan.</p>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}

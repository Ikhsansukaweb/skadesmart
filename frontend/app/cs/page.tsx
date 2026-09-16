"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { LoaderCircle, Trash2, Ticket as TicketIcon, CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AlertCard, ExportCard, ProfileCard, ListCard, ListRow } from "@/components/dashboard/DashboardWidgets";
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

// CS Dashboard - layout sidebar + panel kanan (bagian 7 prompt redesign).
// Data dari endpoint yang sudah ada (/cs/tickets, /cs/users).
export default function CsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<CsUser[]>([]);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function load() {
    api<{ tickets: Ticket[] }>("/cs/tickets").then((d) => setTickets(d.tickets)).catch((err) => setError(err.message));
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
          <ExportCard label="Data tiket bantuan" rows={tickets.map((t) => ({
            id: t.id, subjek: t.subject, status: t.status, pengirim: t.full_name, kelas: t.class_name, tanggal: t.created_at,
          }))} />
        </>
      }
    >
      {error && <p role="alert" className="text-sm text-ember-600 font-body">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <ListCard title="Tiket Terbuka" seeAllHref="#tiket" emptyLabel={openTickets.length === 0 ? "Tidak ada tiket terbuka." : undefined}>
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

        <ListCard title="Tiket Selesai" seeAllHref="#tiket" emptyLabel={closedTickets.length === 0 ? "Belum ada tiket selesai." : undefined}>
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

      <section id="tiket">
        <h2 className="text-subheading font-semibold mb-3 text-ink">Tiket Bantuan</h2>
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-sub font-medium text-ink">{t.subject}</h3>
                  <p className="text-xs text-fog font-body">{t.full_name} - {t.class_name}</p>
                </div>
                <span className="text-xs font-sub px-2 py-1 rounded-full bg-electric-100 text-electric-600 shrink-0">
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
              <p className="text-sm text-steel font-body">{t.message}</p>
              <div className="flex gap-2 pt-1 flex-wrap">
                {STATUS_OPTIONS.filter((s) => s !== t.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(t.id, s)}
                    disabled={updatingId === t.id}
                    className="btn-secondary !px-3 !py-1.5 text-xs flex items-center gap-1"
                  >
                    {updatingId === t.id && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
                    Tandai {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {tickets.length === 0 && !error && (
            <p className="text-fog font-body text-sm">Tidak ada tiket bantuan saat ini.</p>
          )}
        </div>
      </section>

      <section id="kelola-akun">
        <h2 className="text-subheading font-semibold mb-3 text-ink">Kelola Akun</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau NISN..."
          className="input-field mb-3"
        />
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-ink font-sub">
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
                <tr key={u.id} className="border-t border-sand">
                  <td className="px-3 py-2 font-body">{u.full_name}</td>
                  <td className="px-3 py-2 font-body">{u.nisn}</td>
                  <td className="px-3 py-2 font-body">{u.class_name}</td>
                  <td className="px-3 py-2 font-body">{u.role}</td>
                  <td className="px-3 py-2">
                    {u.role !== "admin" && (
                      <button
                        onClick={() => deleteUser(u.id, u.full_name)}
                        disabled={deletingId === u.id}
                        className="text-ember-600 p-1.5"
                        aria-label={`Hapus akun ${u.full_name}`}
                      >
                        {deletingId === u.id ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && <p className="p-4 text-fog font-body text-sm">Tidak ada akun ditemukan.</p>}
        </div>
      </section>
    </DashboardShell>
  );
}

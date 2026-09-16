"use client";

import { ReactNode } from "react";
import { AlertTriangle, Download, Pencil, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/** Kartu alert Ember - untuk status penting yang butuh perhatian (toko tutup,
 * tiket menumpuk, dsb). Kalau `active` false, tidak dirender sama sekali -
 * daripada memaksakan slot kosong. */
export function AlertCard({ message, actionLabel, onAction, active = true }: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  active?: boolean;
}) {
  if (!active) return null;
  return (
    <div className="rounded-card bg-peran-aksen-lembut border border-peran-aksen/30 p-4 space-y-2">
      <div className="flex items-center gap-2 text-peran-aksen">
        <AlertTriangle size={18} aria-hidden="true" />
        <span className="font-sub font-semibold text-sm">Perlu perhatian</span>
      </div>
      <p className="text-body-sm text-peran-utama">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-ember !px-4 !py-2 text-xs w-full">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Kartu ekspor data generik - export CSV dari data yang sudah ada di state
 * halaman (client-side), tanpa perlu endpoint backend baru. */
export function ExportCard({ label, rows }: { label: string; rows: Record<string, any>[] }) {
  function handleExport() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-sub font-semibold text-sm text-peran-utama">Ekspor Data</h3>
      <p className="text-caption text-peran-kedua">{label}</p>
      <button onClick={handleExport} disabled={rows.length === 0} className="btn-primary !px-4 !py-2 text-xs w-full flex items-center justify-center gap-2">
        <Download size={14} aria-hidden="true" />
        Export Semua Data
      </button>
    </div>
  );
}

/** Kartu profil - foto placeholder (mudah diganti lewat prop `photoUrl`),
 * nama, role/kelas, tombol edit + logout, dan satu CTA sesuai konteks role. */
export function ProfileCard({ ctaLabel, ctaHref, onCta }: {
  ctaLabel: string;
  ctaHref?: string;
  onCta?: () => void;
}) {
  const { user, logout } = useAuth();
  if (!user) return null;

  // Placeholder otomatis dari nama - gampang diganti nanti kalau user sudah
  // punya foto profil asli (tinggal isi user.profile_photo_url dari backend).
  const photoUrl =
    user.profile_photo_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&background=5196fe&color=fff`;

  return (
    <div className="card p-4 space-y-3 text-center">
      <img src={photoUrl} alt={user.full_name} className="w-16 h-16 rounded-full mx-auto object-cover" />
      <div>
        <p className="font-sub font-semibold text-sm text-peran-utama">{user.full_name}</p>
        <p className="text-caption text-peran-kedua">{user.class_name || user.role}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <a href="/account" aria-label="Edit profil" className="w-8 h-8 rounded-full border border-peran-garis flex items-center justify-center text-peran-kedua hover:text-peran-aksi hover:border-peran-aksi">
          <Pencil size={14} aria-hidden="true" />
        </a>
        <button onClick={logout} aria-label="Keluar" className="w-8 h-8 rounded-full border border-peran-garis flex items-center justify-center text-peran-kedua hover:text-peran-aksen hover:border-peran-aksen">
          <LogOut size={14} aria-hidden="true" />
        </button>
      </div>
      {ctaHref ? (
        <a href={ctaHref} className="btn-primary !px-4 !py-2 text-xs w-full block">{ctaLabel}</a>
      ) : (
        <button onClick={onCta} className="btn-primary !px-4 !py-2 text-xs w-full">{ctaLabel}</button>
      )}
    </div>
  );
}

/** Kartu unit KWU - dekoratif, gaya "Credit Card Product Visual" (Ink +
 * gradient Electric->Ember). Opsional, dilewati untuk dashboard yang tidak
 * relevan (CS/Admin - lihat DashboardShell caller). */
export function UnitCard({ unitName, statusLabel, isOpen }: { unitName: string; statusLabel: string; isOpen: boolean }) {
  return (
    <div
      className="rounded-card p-5 text-white space-y-6"
      style={{ background: "linear-gradient(135deg, #1b1d20 0%, #101828 55%, #5196fe 100%)" }}
    >
      <p className="text-caption text-white/70">Kartu Unit</p>
      <div>
        <p className="font-heading font-semibold text-lg">{unitName}</p>
        <p className={`text-caption mt-1 ${isOpen ? "text-emerald-300" : "text-white/60"}`}>{statusLabel}</p>
      </div>
    </div>
  );
}

/** Baris list untuk pola "Deposit/Withdraw" - ikon + judul/sub-judul + nilai
 * kanan berwarna semantik (hijau/ember). */
export function ListRow({ icon, title, subtitle, value, tone = "neutral" }: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass = tone === "positive" ? "text-peran-naik" : tone === "negative" ? "text-peran-aksen" : "text-peran-utama";
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="w-9 h-9 rounded-full bg-peran-lembut flex items-center justify-center text-peran-aksi shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-sub font-medium text-peran-utama truncate">{title}</p>
        <p className="text-caption text-peran-kedua truncate">{subtitle}</p>
      </div>
      <p className={`text-sm font-sub font-semibold shrink-0 ${toneClass}`}>{value}</p>
    </div>
  );
}

/** Card pembungkus untuk sepasang list (kiri/kanan) dengan link "Lihat semua". */
export function ListCard({ title, seeAllHref, children, emptyLabel }: {
  title: string;
  seeAllHref?: string;
  children: ReactNode;
  emptyLabel?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-sub font-semibold text-sm text-peran-utama">{title}</h3>
        {seeAllHref && (
          <a href={seeAllHref} className="text-caption text-peran-aksi font-sub hover:underline">
            Lihat semua
          </a>
        )}
      </div>
      <div className="divide-y divide-peran-garis">{children}</div>
      {emptyLabel && <p className="text-caption text-peran-samar py-4 text-center">{emptyLabel}</p>}
    </div>
  );
}

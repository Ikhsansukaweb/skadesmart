import { PackagePlus, Loader2, Truck, Droplets, CheckCircle2, PackageCheck, XCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  // Alur KWU Brital
  baru: { label: "Pesanan baru", icon: PackagePlus, className: "bg-electric-100 text-brand-700" },
  diproses: { label: "Diproses", icon: Loader2, className: "bg-amber-100 text-amber-700" },
  diantar: { label: "Sedang diantar", icon: Truck, className: "bg-amber-100 text-amber-700" },
  // Alur KWU Laundry
  dicuci: { label: "Sedang dicuci", icon: Droplets, className: "bg-sky-100 text-sky-700" },
  bisa_diambil: { label: "Bisa diambil", icon: PackageCheck, className: "bg-emerald-100 text-emerald-700" },
  // Umum
  selesai: { label: "Selesai", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  dibatalkan: { label: "Dibatalkan", icon: XCircle, className: "bg-red-100 text-red-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.baru;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sub font-medium ${config.className}`}>
      <Icon size={14} aria-hidden="true" />
      {config.label}
    </span>
  );
}

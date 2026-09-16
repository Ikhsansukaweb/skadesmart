import type { ReactNode } from "react";

/**
 * Badge - label kecil untuk status & penanda produk (ala Tokopedia).
 *
 * Semua penanda yang ada di Tokopedia dan relevan untuk SkadesMart:
 *   diskon    : "-30%"              merah, sudut kartu
 *   habis     : "Stok Habis"        abu, menutupi seluruh kartu
 *   preorder  : "PreOrder"          oranye
 *   terlaris  : "Terlaris"          oranye
 *   resmi     : "Unit Resmi"        biru  (Brital & Laundry)
 *   baru      : "Baru"              biru muda
 *   naik      : "Selesai"           hijau
 *   turun     : "Dibatalkan"        merah
 *   peringatan: "Stok Menipis"      kuning
 *
 * CATATAN PENTING: badge TIDAK memakai emoji - hanya teks dan SVG.
 */

export type WarnaBadge =
  | "diskon"
  | "habis"
  | "preorder"
  | "terlaris"
  | "resmi"
  | "baru"
  | "naik"
  | "turun"
  | "peringatan"
  | "netral";

const GAYA: Record<WarnaBadge, string> = {
  diskon: "bg-peran-turun text-peran-terang",
  habis: "bg-peran-samar text-peran-terang",
  preorder: "bg-peran-aksen text-peran-terang",
  terlaris: "bg-peran-aksen-lembut text-peran-aksen",
  resmi: "bg-peran-aksi-lembut text-peran-aksi",
  baru: "bg-peran-aksi-lembut text-peran-aksi",
  naik: "bg-peran-naik-lembut text-peran-naik",
  turun: "bg-peran-turun-lembut text-peran-turun",
  peringatan: "bg-peran-peringatan-lembut text-peran-peringatan",
  netral: "bg-peran-lembut text-peran-kedua",
};

const UKURAN = {
  kecil: "text-[11px] px-1.5 py-0.5 rounded",
  sedang: "text-xs px-2 py-0.5 rounded-badge",
  besar: "text-sm px-2.5 py-1 rounded-badge",
} as const;

export default function Badge({
  anak,
  children,
  warna = "netral",
  ukuran = "sedang",
  className = "",
  ikon,
}: {
  /** Isi badge. Bisa lewat `anak` (gaya lama) atau `children`. */
  anak?: ReactNode;
  children?: ReactNode;
  warna?: WarnaBadge;
  ukuran?: keyof typeof UKURAN;
  className?: string;
  ikon?: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 font-semibold leading-none whitespace-nowrap",
        GAYA[warna],
        UKURAN[ukuran],
        className,
      ].join(" ")}
    >
      {ikon}
      {anak ?? children}
    </span>
  );
}

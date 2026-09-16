"use client";

/**
 * Breadcrumb - navigasi bertingkat (bagian 5.2).
 *
 * Contoh: Home › Makanan › Ayam Geprek
 * Item terakhir dianggap halaman aktif (tanpa tautan).
 * Pemisah memakai ikon SVG (chevron), bukan emoji/karakter ">".
 */

import Link from "next/link";

export type ItemBreadcrumb = {
  label: string;
  /** Bila kosong, item ini dianggap halaman aktif (tidak bisa diklik). */
  href?: string;
};

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-peran-samar"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default function Breadcrumb({
  items,
  className = "",
}: {
  items: ItemBreadcrumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((it, i) => {
          const terakhir = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <Chevron />}
              {terakhir || !it.href ? (
                <span className="truncate font-medium text-peran-utama" aria-current={terakhir ? "page" : undefined}>
                  {it.label}
                </span>
              ) : (
                <Link href={it.href} className="truncate text-peran-kedua transition-colors hover:text-peran-aksi">
                  {it.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

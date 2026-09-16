"use client";

/**
 * Dialog - konfirmasi / modal (bagian 5.2).
 *
 * Contoh:
 *   <Dialog
 *     terbuka={tanyaHapus}
 *     judul="Hapus produk?"
 *     pesan="Tindakan ini tidak bisa dibatalkan."
 *     tombolUtama={{ label: "Hapus", saatKlik: hapus, warna: "bahaya" }}
 *     saatTutup={() => setTanyaHapus(false)}
 *   />
 *
 * Aksesibilitas: role="dialog", aria-modal, tombol Escape menutup, klik latar
 * menutup. Ikon SVG inline - TANPA emoji.
 */

import { useEffect, useRef, type ReactNode } from "react";

export type AksiDialog = {
  label: string;
  saatKlik: () => void;
  /** "aksi" = biru (default) · "bahaya" = merah · "netral" = abu */
  warna?: "aksi" | "bahaya" | "netral";
  /** Nonaktifkan tombol (mis. saat proses berjalan). */
  nonaktif?: boolean;
};

export default function Dialog({
  terbuka,
  judul,
  pesan,
  anak,
  tombolUtama,
  tombolKedua,
  saatTutup,
  lebar = "sedang",
}: {
  terbuka: boolean;
  judul: string;
  /** Teks isi singkat. Bisa diganti dengan `anak` untuk isi bebas. */
  pesan?: string;
  /** Isi bebas (mis. form). Bila ada, `pesan` diabaikan. */
  anak?: ReactNode;
  tombolUtama?: AksiDialog;
  /** Tombol sekunder (mis. "Batal"). Default menutup dialog. */
  tombolKedua?: AksiDialog;
  saatTutup: () => void;
  lebar?: "kecil" | "sedang";
}) {
  const refDialog = useRef<HTMLDivElement>(null);

  // Tutup dengan tombol Escape.
  useEffect(() => {
    if (!terbuka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") saatTutup();
    };
    document.addEventListener("keydown", onKey);
    // Fokuskan dialog agar pembaca layar & tombol Tab langsung masuk ke sini.
    const t = setTimeout(() => refDialog.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [terbuka, saatTutup]);

  if (!terbuka) return null;

  const gayaTombol = (warna: AksiDialog["warna"]) => {
    if (warna === "bahaya") {
      return "bg-peran-turun text-peran-terang hover:opacity-90";
    }
    if (warna === "netral") {
      return "bg-peran-lembut text-peran-utama hover:bg-peran-garis";
    }
    return "bg-peran-aksi text-peran-terang hover:bg-peran-aksi-hover";
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Latar gelap - klik untuk menutup */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={saatTutup}
        aria-hidden="true"
      />

      <div
        ref={refDialog}
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        tabIndex={-1}
        className={[
          "relative w-full rounded-card border border-peran-garis bg-peran-kartu p-5 shadow-[var(--bayangan-naik)] outline-none",
          lebar === "kecil" ? "max-w-sm" : "max-w-md",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-peran-utama">{judul}</h2>
          <button
            type="button"
            onClick={saatTutup}
            aria-label="Tutup dialog"
            className="rounded-full p-1 text-peran-samar transition-colors hover:bg-peran-lembut hover:text-peran-utama"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {anak ? (
          <div className="mt-3">{anak}</div>
        ) : (
          pesan && <p className="mt-2 text-sm text-peran-kedua">{pesan}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={tombolKedua ? tombolKedua.saatKlik : saatTutup}
            disabled={tombolKedua?.nonaktif}
            className="rounded-input border border-peran-garis px-4 py-2 text-sm font-semibold text-peran-utama transition-colors hover:bg-peran-lembut disabled:opacity-50"
          >
            {tombolKedua?.label ?? "Batal"}
          </button>
          {tombolUtama && (
            <button
              type="button"
              onClick={tombolUtama.saatKlik}
              disabled={tombolUtama.nonaktif}
              className={[
                "rounded-input px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                gayaTombol(tombolUtama.warna),
              ].join(" ")}
            >
              {tombolUtama.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

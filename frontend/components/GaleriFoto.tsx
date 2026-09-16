"use client";

/**
 * GaleriFoto - galeri foto produk ala Tokopedia.
 *
 * Tata letak:
 *   HP      : satu foto besar, bisa digeser (scroll-snap), titik penunjuk
 *   Desktop : deretan foto kecil di sisi kiri + foto besar di kanan
 *
 * Semua foto dari Catbox. Sengaja pakai <img> biasa (bukan next/image)
 * karena sumbernya domain luar dan ukurannya sudah dibatasi saat diunggah.
 */

import { useState } from "react";

export default function GaleriFoto({
  daftar,
  nama,
  /** Penanda di sudut foto, mis. "-30%" atau "PreOrder". */
  penanda,
}: {
  daftar: string[];
  nama: string;
  penanda?: { teks: string; warna: "diskon" | "aksen" } | null;
}) {
  const foto = daftar.filter(Boolean);
  const [aktif, setAktif] = useState(0);

  const kosong = foto.length === 0;
  const sekarang = foto[aktif] || foto[0];

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* ---- Foto kecil (desktop) ---- */}
      {foto.length > 1 && (
        <div className="order-2 hidden w-16 shrink-0 flex-col gap-2 lg:order-1 lg:flex">
          {foto.slice(0, 6).map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAktif(i)}
              aria-label={`Foto ${i + 1}`}
              aria-current={i === aktif}
              className={[
                "relative aspect-square overflow-hidden rounded-input border-2 transition-colors",
                i === aktif ? "border-peran-aksi" : "border-peran-garis hover:border-peran-garis-tegas",
              ].join(" ")}
            >
              <img src={f} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
          {foto.length > 6 && (
            <span className="text-center text-[11px] text-peran-kedua">+{foto.length - 6}</span>
          )}
        </div>
      )}

      {/* ---- Foto besar ---- */}
      <div className="order-1 min-w-0 flex-1 lg:order-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-card border border-peran-garis bg-peran-lembut">
          {kosong ? (
            <div className="flex h-full w-full items-center justify-center text-peran-samar">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          ) : (
            <img
              src={sekarang}
              alt={nama}
              className="h-full w-full object-contain"
              // object-contain (bukan cover) supaya produk tidak terpotong -
              // untuk makanan kemasan, bagian yang terpotong bikin ragu membeli.
            />
          )}

          {penanda && (
            <span
              className={[
                "absolute left-0 top-0 rounded-br-badge px-2.5 py-1.5 text-sm font-bold text-peran-terang",
                penanda.warna === "diskon" ? "bg-peran-turun" : "bg-peran-aksen",
              ].join(" ")}
            >
              {penanda.teks}
            </span>
          )}
        </div>

        {/* ---- Titik penunjuk (HP) ---- */}
        {foto.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5 lg:hidden">
            {foto.slice(0, 8).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAktif(i)}
                aria-label={`Ke foto ${i + 1}`}
                className={[
                  "h-1.5 rounded-full transition-all",
                  i === aktif ? "w-4 bg-peran-aksi" : "w-1.5 bg-peran-garis-tegas",
                ].join(" ")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

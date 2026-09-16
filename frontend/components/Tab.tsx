"use client";

/**
 * Tab - pemilih bagian halaman (ala Tokopedia: Detail Produk | Ulasan | Rekomendasi).
 *
 * Dipakai sebagai tab yang DIKENDALIKAN dari luar:
 *   const [tab, setTab] = useState("detail");
 *   <Tab nilai={tab} saatGanti={setTab} daftar={[{id:"detail", label:"Detail Produk"}, ...]} />
 *   {tab === "detail" && <DetailProduk />}
 *
 * Aksesibilitas: memakai role="tablist"/"tab", bisa dipindah dengan
 * panah kiri/kanan, dan tab terpilih ditandai aria-selected.
 */

import { useRef } from "react";

export type ItemTab = {
  id: string;
  label: string;
  /** Angka kecil di samping label, mis. jumlah ulasan. */
  hitung?: number;
};

export default function Tab({
  daftar,
  nilai,
  saatGanti,
  className = "",
  /** "garis" = garis bawah (default Tokopedia) · "pil" = tombol bulat */
  gaya = "garis",
}: {
  daftar: ItemTab[];
  nilai: string;
  saatGanti: (id: string) => void;
  className?: string;
  gaya?: "garis" | "pil";
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  /** Pindah tab pakai panah kiri/kanan, sesuai pola WAI-ARIA. */
  function tombolPapanTik(arah: 1 | -1) {
    const i = daftar.findIndex((t) => t.id === nilai);
    if (i < 0) return;
    const berikut = (i + arah + daftar.length) % daftar.length;
    saatGanti(daftar[berikut].id);
    refs.current[berikut]?.focus();
  }

  if (gaya === "pil") {
    return (
      <div role="tablist" className={["flex flex-wrap gap-2", className].join(" ")}>
        {daftar.map((t, i) => {
          const aktif = t.id === nilai;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              aria-selected={aktif}
              tabIndex={aktif ? 0 : -1}
              onClick={() => saatGanti(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") tombolPapanTik(1);
                if (e.key === "ArrowLeft") tombolPapanTik(-1);
              }}
              className={[
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                aktif
                  ? "bg-peran-aksi text-peran-terang"
                  : "bg-peran-lembut text-peran-kedua hover:text-peran-utama",
              ].join(" ")}
            >
              {t.label}
              {typeof t.hitung === "number" && (
                <span className="ml-1.5 opacity-70">({t.hitung})</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={["flex gap-6 overflow-x-auto border-b border-peran-garis", className].join(" ")}
    >
      {daftar.map((t, i) => {
        const aktif = t.id === nilai;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={aktif}
            tabIndex={aktif ? 0 : -1}
            onClick={() => saatGanti(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") tombolPapanTik(1);
              if (e.key === "ArrowLeft") tombolPapanTik(-1);
            }}
            className={[
              "relative whitespace-nowrap pb-3 text-sm font-semibold transition-colors",
              aktif ? "text-peran-aksi" : "text-peran-kedua hover:text-peran-utama",
            ].join(" ")}
          >
            {t.label}
            {typeof t.hitung === "number" && (
              <span className="ml-1.5 text-peran-samar">({t.hitung})</span>
            )}
            {/* Garis bawah penanda tab aktif */}
            <span
              className={[
                "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-opacity",
                aktif ? "bg-peran-aksi opacity-100" : "opacity-0",
              ].join(" ")}
            />
          </button>
        );
      })}
    </div>
  );
}

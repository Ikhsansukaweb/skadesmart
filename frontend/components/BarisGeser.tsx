"use client";

/**
 * BarisGeser - deretan kartu yang bisa digeser ke KANAN (ala Tokopedia).
 *
 * Cara kerja:
 *   - Di HP: cukup diusap (swipe) dengan jari, kartu "nyangkut" di posisi
 *     rapi berkat scroll-snap.
 *   - Di desktop: tombol panah kiri/kanan muncul saat kursor mendekat.
 *
 * Kenapa pakai overflow-x bawaan browser, bukan pustaka geser?
 *   - Ringan, tidak menambah dependensi.
 *   - Dukungan keyboard & pembaca layar tetap jalan (bisa di-Tab).
 *   - Scroll-snap membuat posisi berhenti selalu rapi.
 *
 * Penting: jangan menaruh kartu di dalam elemen yang membuat halaman ikut
 * melebar. Karena itu pembungkusnya memakai overflow-x-auto dan lebar anak
 * (basis) ditentukan tetap (mis. 150px), bukan persentase.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  /** Lebar satu kartu di HP (px). Boleh berupa kelas Tailwind. */
  lebarKartu?: string;
  /** Label untuk pembaca layar. */
  label?: string;
};

export default function BarisGeser({
  children,
  lebarKartu = "w-[150px] sm:w-[170px]",
  label = "Daftar produk",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [bisaKiri, setBisaKiri] = useState(false);
  const [bisaKanan, setBisaKanan] = useState(false);

  /** Perbarui keadaan tombol panah sesuai posisi geser sekarang. */
  const perbarui = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Toleransi 4px supaya pembulatan piksel tidak membuat tombol berkedip.
    setBisaKiri(el.scrollLeft > 4);
    setBisaKanan(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    perbarui();
    el.addEventListener("scroll", perbarui, { passive: true });

    // Ukuran berubah (mis. layar diputar) -> hitung ulang.
    const pengamat = new ResizeObserver(perbarui);
    pengamat.observe(el);
    // Isi berubah (kartu bertambah) -> hitung ulang juga.
    const pengamatIsi = new MutationObserver(perbarui);
    pengamatIsi.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener("scroll", perbarui);
      pengamat.disconnect();
      pengamatIsi.disconnect();
    };
  }, [perbarui, children]);

  /** Geser satu "halaman" (selebar area terlihat). */
  const geser = (arah: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: arah * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="group/geser relative">
      <div
        ref={ref}
        aria-label={label}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Setiap anak dibungkus supaya lebarnya tetap dan tidak menyusut */}
        {Array.isArray(children)
          ? children.map((anak, i) => (
              <div key={i} className={`shrink-0 snap-start ${lebarKartu}`}>
                {anak}
              </div>
            ))
          : <div className={`shrink-0 snap-start ${lebarKartu}`}>{children}</div>}
      </div>

      {/* Tombol panah - hanya tampil kalau memang masih bisa digeser */}
      {bisaKiri && (
        <button
          type="button"
          onClick={() => geser(-1)}
          aria-label="Geser ke kiri"
          className="absolute left-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-sand bg-paper text-ink shadow-sm transition-opacity hover:border-electric md:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {bisaKanan && (
        <button
          type="button"
          onClick={() => geser(1)}
          aria-label="Geser ke kanan"
          className="absolute right-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-sand bg-paper text-ink shadow-sm transition-opacity hover:border-electric md:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

"use client";

/**
 * KerangkaTabel - tabel dengan filter, urut, dan halaman (bagian 5.2).
 *
 * Dibuat generik supaya dipakai ulang oleh banyak dashboard (Pengguna,
 * Pesanan, Voucher, Audit Log). Bukan tabel "pintar" yang mengambil data
 * sendiri: pemanggil yang menentukan data, kolom, dan cara memfilter. Tugas
 * komponen ini hanya menyediakan:
 *   - kotak cari (bila `cari` diberikan),
 *   - header kolom yang bisa diklik untuk mengurutkan (`bisaUrut`),
 *   - kontrol halaman (`ukuranHalaman`).
 *
 * Semua ikon SVG inline - TANPA emoji.
 */

import { useMemo, useState, type ReactNode } from "react";

export type KolomTabel<T> = {
  /** kunci unik kolom */
  id: string;
  label: string;
  /** nilai mentah untuk pengurutan; kosong = kolom tidak bisa diurut */
  nilai?: (baris: T) => string | number | null | undefined;
  /** cara menampilkan sel */
  sel: (baris: T) => ReactNode;
  /** rata teks: kiri (default) atau kanan */
  rata?: "kiri" | "kanan" | "tengah";
  className?: string;
};

function ChevronUrut({ arah }: { arah: "naik" | "turun" | null }) {
  return (
    <span className="inline-flex flex-col leading-none" aria-hidden="true">
      <svg width="9" height="9" viewBox="0 0 24 24" fill={arah === "naik" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 15l6-6 6 6" />
      </svg>
      <svg width="9" height="9" viewBox="0 0 24 24" fill={arah === "turun" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

export default function KerangkaTabel<T>({
  data,
  kolom,
  kunciBaris,
  cari,
  ukuranHalaman = 10,
  kosong = "Tidak ada data.",
  aksi,
}: {
  data: T[];
  kolom: KolomTabel<T>[];
  /** fungsi yang menghasilkan kunci unik tiap baris */
  kunciBaris: (baris: T) => string | number;
  /** bila diisi, tampilkan kotak cari & filter pakai fungsi ini */
  cari?: {
    placeholder?: string;
    /** kembalikan true bila baris cocok dengan kata kunci */
    cocok: (baris: T, kataKunci: string) => boolean;
  };
  /** jumlah baris per halaman; 0 = tampilkan semua tanpa halaman. */
  ukuranHalaman?: number;
  /** teks saat data kosong */
  kosong?: string;
  /** tombol/aksi tambahan di kanan atas */
  aksi?: ReactNode;
}) {
  const [kataKunci, setKataKunci] = useState("");
  const [urutKolom, setUrutKolom] = useState<string | null>(null);
  const [arah, setArah] = useState<"naik" | "turun">("naik");
  const [halaman, setHalaman] = useState(1);

  const tersaring = useMemo(() => {
    let hasil = data;
    if (cari && kataKunci.trim()) {
      const k = kataKunci.trim().toLowerCase();
      hasil = hasil.filter((b) => cari.cocok(b, k));
    }
    if (urutKolom) {
      const kol = kolom.find((c) => c.id === urutKolom);
      if (kol?.nilai) {
        hasil = [...hasil].sort((a, b) => {
          const va = kol.nilai!(a);
          const vb = kol.nilai!(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") {
            return arah === "naik" ? va - vb : vb - va;
          }
          const sa = String(va);
          const sb = String(vb);
          return arah === "naik" ? sa.localeCompare(sb, "id") : sb.localeCompare(sa, "id");
        });
      }
    }
    return hasil;
  }, [data, cari, kataKunci, urutKolom, arah, kolom]);

  const perHalaman = ukuranHalaman > 0 ? ukuranHalaman : tersaring.length || 1;
  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / perHalaman));
  const halamanAman = Math.min(halaman, totalHalaman);
  const potongan = tersaring.slice((halamanAman - 1) * perHalaman, halamanAman * perHalaman);

  function gantiUrut(id: string) {
    if (urutKolom === id) {
      setArah((a) => (a === "naik" ? "turun" : "naik"));
    } else {
      setUrutKolom(id);
      setArah("naik");
    }
    setHalaman(1);
  }

  const rataKelas = (rata?: "kiri" | "kanan" | "tengah") =>
    rata === "kanan" ? "text-right" : rata === "tengah" ? "text-center" : "text-left";

  return (
    <div className="space-y-3">
      {(cari || aksi) && (
        <div className="flex flex-wrap items-center gap-2">
          {cari && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <input
                value={kataKunci}
                onChange={(e) => {
                  setKataKunci(e.target.value);
                  setHalaman(1);
                }}
                placeholder={cari.placeholder ?? "Cari..."}
                className="input-field !py-2 pr-9 text-sm"
                aria-label="Cari"
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-peran-samar"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </div>
          )}
          {aksi && <div className="ml-auto flex items-center gap-2">{aksi}</div>}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-peran-garis bg-peran-kartu">
        <table className="w-full text-sm">
          <thead className="bg-peran-lembut text-peran-kedua">
            <tr>
              {kolom.map((k) => {
                const bisaUrut = Boolean(k.nilai);
                const aktif = urutKolom === k.id;
                return (
                  <th
                    key={k.id}
                    scope="col"
                    className={["whitespace-nowrap px-3 py-2.5 font-semibold", rataKelas(k.rata), k.className].join(" ")}
                  >
                    {bisaUrut ? (
                      <button
                        type="button"
                        onClick={() => gantiUrut(k.id)}
                        className="inline-flex items-center gap-1 transition-colors hover:text-peran-utama"
                        aria-label={`Urutkan menurut ${k.label}`}
                      >
                        {k.label}
                        <ChevronUrut arah={aktif ? arah : null} />
                      </button>
                    ) : (
                      k.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {potongan.map((baris) => (
              <tr key={kunciBaris(baris)} className="border-t border-peran-garis hover:bg-peran-lembut/60">
                {kolom.map((k) => (
                  <td key={k.id} className={["px-3 py-2.5 align-middle text-peran-utama", rataKelas(k.rata)].join(" ")}>
                    {k.sel(baris)}
                  </td>
                ))}
              </tr>
            ))}
            {potongan.length === 0 && (
              <tr>
                <td colSpan={kolom.length} className="px-3 py-8 text-center text-peran-kedua">
                  {kosong}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ukuranHalaman > 0 && totalHalaman > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-peran-kedua">
            {(halamanAman - 1) * perHalaman + 1}-{Math.min(halamanAman * perHalaman, tersaring.length)} dari {tersaring.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setHalaman((h) => Math.max(1, h - 1))}
              disabled={halamanAman <= 1}
              className="rounded-input border border-peran-garis px-3 py-1.5 transition-colors hover:bg-peran-lembut disabled:opacity-40"
              aria-label="Halaman sebelumnya"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="px-2 text-peran-kedua">
              {halamanAman} / {totalHalaman}
            </span>
            <button
              type="button"
              onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
              disabled={halamanAman >= totalHalaman}
              className="rounded-input border border-peran-garis px-3 py-1.5 transition-colors hover:bg-peran-lembut disabled:opacity-40"
              aria-label="Halaman berikutnya"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

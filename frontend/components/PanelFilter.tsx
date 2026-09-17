"use client";

/**
 * PanelFilter - panel filter di sisi kiri marketplace (ala Tokopedia).
 *
 * Isi filter disusun dari hasil bedah halaman pencarian Tokopedia:
 *   Kategori · Rentang Harga · Lokasi/Kantin · Jenis Toko · Rating · Kondisi
 *
 * Semua filter disimpan di URL (query string), BUKAN hanya di state React.
 * Alasannya: dengan begitu tautan bisa dibagikan, tombol "kembali" browser
 * bekerja benar, dan hasil filter bertahan setelah halaman dimuat ulang.
 */

import { useState } from "react";

export type NilaiFilter = {
  kategori: string[];
  hargaMin: string;
  hargaMax: string;
  lokasi: string[];
  jenisToko: string[];
  ratingMin: string;
  /** "tersedia" = hanya yang stoknya ada */
  ketersediaan: string[];
};

export const FILTER_KOSONG: NilaiFilter = {
  kategori: [],
  hargaMin: "",
  hargaMax: "",
  lokasi: [],
  jenisToko: [],
  ratingMin: "",
  ketersediaan: [],
};

/**
 * Kategori final sesuai keputusan pemilik produk.
 * Brital & Laundry = unit KWU resmi. Minuman/Makanan/Jasa = jualan siswa.
 * "Jualan Siswa" yang lama DIHAPUS dan diganti tiga kategori ini.
 */
export const KATEGORI = [
  { id: "brital", label: "Brital (Ayam Geprek)", grup: "Unit Resmi" },
  { id: "laundry", label: "Laundry", grup: "Unit Resmi" },
  { id: "minuman", label: "Minuman", grup: "Jualan Siswa" },
  { id: "makanan", label: "Makanan", grup: "Jualan Siswa" },
  { id: "jasa", label: "Jasa", grup: "Jualan Siswa" },
  { id: "barang", label: "Barang", grup: "Jualan Siswa" },
] as const;

/** Pilihan lokasi - diisi dari kantin/tempat di sekolah. */
const LOKASI = [
  "Kantin Brital",
  "Kantin Belakang",
  "Depan Lab TKJ",
  "Depan Perpustakaan",
  "Lapangan Upacara",
];

type Bagian = {
  id: keyof NilaiFilter;
  judul: string;
  pilihan?: { nilai: string; label: string }[];
  jenis?: "centang" | "harga" | "tunggal";
};

const BAGIAN: Bagian[] = [
  {
    id: "kategori",
    judul: "Kategori",
    jenis: "centang",
    pilihan: KATEGORI.map((k) => ({ nilai: k.id, label: k.label })),
  },
  { id: "hargaMin", judul: "Rentang Harga", jenis: "harga" },
  {
    id: "jenisToko",
    judul: "Jenis Toko",
    jenis: "centang",
    pilihan: [
      { nilai: "resmi", label: "Unit Resmi (KWU)" },
      { nilai: "siswa", label: "Siswa" },
    ],
  },
  {
    id: "lokasi",
    judul: "Lokasi",
    jenis: "centang",
    pilihan: LOKASI.map((l) => ({ nilai: l, label: l })),
  },
  {
    id: "ratingMin",
    judul: "Rating",
    jenis: "tunggal",
    pilihan: [
      { nilai: "4", label: "4 bintang ke atas" },
      { nilai: "3", label: "3 bintang ke atas" },
    ],
  },
  {
    id: "ketersediaan",
    judul: "Ketersediaan",
    jenis: "centang",
    pilihan: [{ nilai: "tersedia", label: "Stok tersedia saja" }],
  },
];

/** Bintang kecil untuk label rating - SVG, bukan emoji. */
function BintangKecil({ jumlah }: { jumlah: number }) {
  return (
    <span className="inline-flex" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24">
          <path
            d="M12 2.5l2.9 6.06 6.6.86-4.83 4.62 1.2 6.56L12 17.5l-5.87 3.1 1.2-6.56L2.5 9.42l6.6-.86z"
            fill={i < jumlah ? "var(--peringatan)" : "var(--garis-tegas)"}
          />
        </svg>
      ))}
    </span>
  );
}

export default function PanelFilter({
  nilai,
  saatUbah,
  /** Jumlah hasil untuk tiap kategori - opsional, dipakai untuk angka di samping label. */
  jumlahKategori,
  className = "",
}: {
  nilai: NilaiFilter;
  saatUbah: (baru: NilaiFilter) => void;
  jumlahKategori?: Record<string, number>;
  className?: string;
}) {
  const [terbuka, setTerbuka] = useState<string[]>(["kategori", "hargaMin"]);

  function alihkanBagian(id: string) {
    setTerbuka((lama) =>
      lama.includes(id) ? lama.filter((x) => x !== id) : [...lama, id]
    );
  }

  /** Tambah/hapus satu nilai pada filter bertipe daftar (kategori, lokasi, dll). */
  function kedipCentang(kunci: keyof NilaiFilter, v: string) {
    const lama = nilai[kunci];
    const baru = Array.isArray(lama)
      ? lama.includes(v)
        ? lama.filter((x) => x !== v)
        : [...lama, v]
      : [v];
    saatUbah({ ...nilai, [kunci]: baru });
  }

  const adaFilter =
    nilai.kategori.length +
      nilai.lokasi.length +
      nilai.jenisToko.length +
      nilai.ketersediaan.length >
      0 || nilai.hargaMin || nilai.hargaMax || nilai.ratingMin;

  return (
    <aside
      className={[
        "rounded-card border border-peran-garis bg-peran-kartu p-4",
        className,
      ].join(" ")}
      aria-label="Filter produk"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-peran-utama">Filter</h2>
        {adaFilter ? (
          <button
            type="button"
            onClick={() => saatUbah(FILTER_KOSONG)}
            className="text-xs font-semibold text-peran-aksi hover:underline"
          >
            Hapus semua
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-peran-garis">
        {BAGIAN.map((b) => {
          const buka = terbuka.includes(b.id);
          return (
            <div key={b.id} className="py-3">
              {/* Judul bagian - bisa dibuka/tutup */}
              <button
                type="button"
                onClick={() => alihkanBagian(b.id)}
                aria-expanded={buka}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-semibold text-peran-utama">{b.judul}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className={[
                    "text-peran-kedua transition-transform",
                    buka ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {buka && b.jenis === "harga" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="Rp Terendah"
                    value={nilai.hargaMin}
                    onChange={(e) => saatUbah({ ...nilai, hargaMin: e.target.value })}
                    className="w-full rounded-input border border-peran-garis bg-peran-kartu px-2.5 py-2 text-sm text-peran-utama placeholder:text-peran-samar focus:border-peran-aksi focus:outline-none"
                  />
                  <span className="text-peran-samar">—</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="Rp Tertinggi"
                    value={nilai.hargaMax}
                    onChange={(e) => saatUbah({ ...nilai, hargaMax: e.target.value })}
                    className="w-full rounded-input border border-peran-garis bg-peran-kartu px-2.5 py-2 text-sm text-peran-utama placeholder:text-peran-samar focus:border-peran-aksi focus:outline-none"
                  />
                </div>
              )}

              {buka && b.jenis === "centang" && b.pilihan && (
                <ul className="mt-3 space-y-2">
                  {b.pilihan.map((p) => {
                    const daftar = nilai[b.id];
                    const dipilih = Array.isArray(daftar) && daftar.includes(p.nilai);
                    const jml = jumlahKategori?.[p.nilai];
                    return (
                      <li key={p.nilai}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-peran-kedua hover:text-peran-utama">
                          <input
                            type="checkbox"
                            checked={dipilih}
                            onChange={() => kedipCentang(b.id, p.nilai)}
                            className="h-4 w-4 shrink-0 rounded border-peran-garis-tegas accent-[var(--aksi)]"
                          />
                          <span className="flex-1">{p.label}</span>
                          {typeof jml === "number" && (
                            <span className="text-xs text-peran-samar">{jml}</span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {buka && b.jenis === "tunggal" && b.pilihan && (
                <ul className="mt-3 space-y-2">
                  {b.pilihan.map((p) => {
                    const dipilih = nilai[b.id] === p.nilai;
                    return (
                      <li key={p.nilai}>
                        <button
                          type="button"
                          onClick={() =>
                            saatUbah({
                              ...nilai,
                              [b.id]: dipilih ? "" : p.nilai,
                            })
                          }
                          className={[
                            "flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-sm transition-colors",
                            dipilih
                              ? "bg-peran-aksi-lembut text-peran-aksi"
                              : "text-peran-kedua hover:bg-peran-lembut hover:text-peran-utama",
                          ].join(" ")}
                        >
                          {b.id === "ratingMin" && <BintangKecil jumlah={Number(p.nilai)} />}
                          <span>{b.id === "ratingMin" ? "ke atas" : p.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

"use client";

/**
 * BilahUrut - pemilih urutan hasil, disalin dari halaman pencarian Tokopedia:
 *   "Urutkan: Paling Sesuai · Ulasan · Terbaru · Harga Tertinggi · Harga Terendah"
 *
 * Ditambah dua yang penting untuk sekolah:
 *   "Terlaris"     - pakai kolom products.terjual
 *   "Stok Terbanyak" - supaya pembeli tahu mana yang pasti tersedia
 *
 * Di layar HP, bilah ini menempel di bawah supaya mudah dijangkau jempol.
 */

export type KunciUrut =
  | "sesuai"
  | "terlaris"
  | "ulasan"
  | "terbaru"
  | "harga_naik"
  | "harga_turun";

const PILIHAN: { kunci: KunciUrut; label: string }[] = [
  { kunci: "sesuai", label: "Paling Sesuai" },
  { kunci: "terlaris", label: "Terlaris" },
  { kunci: "ulasan", label: "Ulasan" },
  { kunci: "terbaru", label: "Terbaru" },
  { kunci: "harga_naik", label: "Harga Terendah" },
  { kunci: "harga_turun", label: "Harga Tertinggi" },
];

export default function BilahUrut({
  nilai,
  saatGanti,
  jumlah,
  /** Buka panel filter di layar HP. */
  saatBukaFilter,
  jumlahFilterAktif = 0,
}: {
  nilai: KunciUrut;
  saatGanti: (k: KunciUrut) => void;
  jumlah?: number;
  saatBukaFilter?: () => void;
  jumlahFilterAktif?: number;
}) {
  return (
    <div className="rounded-card border border-peran-garis bg-peran-kartu px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="mr-1 text-sm font-semibold text-peran-utama">Urutkan</span>

        {/* Tombol filter - hanya tampil di layar kecil, filter jadi laci */}
        {saatBukaFilter && (
          <button
            type="button"
            onClick={saatBukaFilter}
            className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-peran-garis px-3 py-1.5 text-sm font-semibold text-peran-utama lg:hidden"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M7 12h10M11 18h4" />
            </svg>
            Filter
            {jumlahFilterAktif > 0 && (
              <span className="rounded-full bg-peran-aksi px-1.5 text-[11px] text-peran-terang">
                {jumlahFilterAktif}
              </span>
            )}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {PILIHAN.map((p) => {
            const aktif = p.kunci === nilai;
            return (
              <button
                key={p.kunci}
                type="button"
                onClick={() => saatGanti(p.kunci)}
                aria-pressed={aktif}
                className={[
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  aktif
                    ? "bg-peran-aksi font-semibold text-peran-terang"
                    : "text-peran-kedua hover:bg-peran-lembut hover:text-peran-utama",
                ].join(" ")}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {typeof jumlah === "number" && (
          <span className="ml-auto hidden text-sm text-peran-kedua sm:block">
            <span className="font-semibold text-peran-utama">{jumlah.toLocaleString("id-ID")}</span> produk
          </span>
        )}
      </div>
    </div>
  );
}

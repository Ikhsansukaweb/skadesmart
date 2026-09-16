"use client";

/**
 * PemilihVarian - pemilih varian produk (level pedas, ukuran, topping).
 *
 * Penjual menambah varian sendiri dari dashboard; di sini pembeli memilihnya.
 * Varian yang stoknya habis ditampilkan TERPOTONG dengan garis miring
 * (seperti Tokopedia) dan tidak bisa diklik - supaya pembeli tidak
 * memesan sesuatu yang tidak ada.
 */

export type KelompokVarian = {
  nama: string;
  pilihan: { id: number; nilai: string; harga_tambahan: number; stok: number }[];
};

/** Format rupiah ringkas untuk tambahan harga. */
function rupiah(n: number) {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export default function PemilihVarian({
  daftar,
  terpilih,
  saatPilih,
}: {
  daftar: KelompokVarian[];
  /** { "Level Pedas": 12 }  (id pilihan yang dipilih per kelompok) */
  terpilih: Record<string, number | null>;
  saatPilih: (namaVarian: string, id: number | null) => void;
}) {
  if (!daftar.length) return null;

  return (
    <div className="space-y-4">
      {daftar.map((k) => {
        const dipilih = terpilih[k.nama] ?? null;
        return (
          <div key={k.nama}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-peran-utama">{k.nama}</span>
              {dipilih === null && (
                <span className="text-xs text-peran-turun">Wajib dipilih</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {k.pilihan.map((p) => {
                const habis = p.stok <= 0;
                const aktif = dipilih === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={habis}
                    onClick={() => saatPilih(k.nama, aktif ? null : p.id)}
                    aria-pressed={aktif}
                    title={habis ? "Stok pilihan ini habis" : undefined}
                    className={[
                      "relative overflow-hidden rounded-input border px-3 py-2 text-sm transition-colors",
                      habis
                        ? "cursor-not-allowed border-peran-garis bg-peran-lembut text-peran-samar"
                        : aktif
                          ? "border-peran-aksi bg-peran-aksi-lembut font-semibold text-peran-aksi"
                          : "border-peran-garis-tegas text-peran-utama hover:border-peran-aksi",
                    ].join(" ")}
                  >
                    <span className="relative z-10">
                      {p.nilai}
                      {p.harga_tambahan > 0 && (
                        <span className="ml-1.5 text-xs opacity-80">
                          +{rupiah(p.harga_tambahan)}
                        </span>
                      )}
                    </span>

                    {/* Garis miring untuk pilihan habis - pola Tokopedia.
                        Dibuat dengan SVG, BUKAN emoji. */}
                    {habis && (
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full text-peran-garis-tegas"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 100"
                        aria-hidden="true"
                      >
                        <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

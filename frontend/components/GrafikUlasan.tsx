"use client";

/**
 * GrafikUlasan - ringkasan rating ala Tokopedia di halaman detail produk.
 *
 * Menampilkan:
 *   - angka besar rata-rata (mis. 4.9)
 *   - bintang visual
 *   - jumlah ulasan
 *   - grafik batang 5★ sampai 1★ beserta jumlahnya
 *
 * Perhatikan: kalau BELUM ada ulasan sama sekali, jangan menampilkan
 * "0.0" - itu terlihat seperti produk buruk. Tampilkan ajakan memberi
 * ulasan pertama. Ini detail kecil yang penting.
 */

export type RingkasUlasan = {
  rata_rata: number;
  total: number;
  per_bintang: Record<string, number>;
};

/** Satu baris bintang (bisa setengah) - SVG, bukan emoji. */
export function Bintang({ nilai, ukuran = 14 }: { nilai: number; ukuran?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const sisa = nilai - i;
        const penuh = sisa >= 0.75;
        const separuh = sisa >= 0.25 && sisa < 0.75;
        const id = `bnt-${ukuran}-${i}-${Math.round(nilai * 100)}`;
        return (
          <svg key={i} width={ukuran} height={ukuran} viewBox="0 0 24 24">
            {separuh && (
              <defs>
                <linearGradient id={id}>
                  <stop offset="50%" stopColor="var(--peringatan)" />
                  <stop offset="50%" stopColor="var(--garis-tegas)" />
                </linearGradient>
              </defs>
            )}
            <path
              d="M12 2.5l2.9 6.06 6.6.86-4.83 4.62 1.2 6.56L12 17.5l-5.87 3.1 1.2-6.56L2.5 9.42l6.6-.86z"
              fill={penuh ? "var(--peringatan)" : separuh ? `url(#${id})` : "var(--garis-tegas)"}
            />
          </svg>
        );
      })}
    </span>
  );
}

export default function GrafikUlasan({ ringkas }: { ringkas: RingkasUlasan }) {
  const total = ringkas.total || 0;

  // Belum ada ulasan - jangan tampilkan angka nol yang menyesatkan.
  if (total === 0) {
    return (
      <div className="rounded-card border border-peran-garis bg-peran-kartu p-4">
        <h3 className="text-sm font-bold text-peran-utama">Ulasan Pembeli</h3>
        <p className="mt-2 text-sm text-peran-kedua">
          Belum ada ulasan. Jadilah yang pertama memberi penilaian setelah pesananmu selesai.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-peran-garis bg-peran-kartu p-4">
      <h3 className="mb-3 text-sm font-bold text-peran-utama">Ulasan Pembeli</h3>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Rata-rata besar */}
        <div className="flex shrink-0 items-baseline gap-2 sm:flex-col sm:items-center sm:gap-0.5">
          <span className="text-3xl font-bold text-peran-utama">
            {ringkas.rata_rata.toFixed(1)}
          </span>
          <span className="text-xs text-peran-samar">dari 5</span>
        </div>

        {/* Grafik batang per bintang */}
        <div className="min-w-0 flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((b) => {
            const n = ringkas.per_bintang[String(b)] || 0;
            const persen = total > 0 ? (n / total) * 100 : 0;
            return (
              <div key={b} className="flex items-center gap-2">
                <span className="flex w-8 shrink-0 items-center gap-0.5 text-xs text-peran-kedua">
                  {b}
                  <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2.5l2.9 6.06 6.6.86-4.83 4.62 1.2 6.56L12 17.5l-5.87 3.1 1.2-6.56L2.5 9.42l6.6-.86z"
                      fill="var(--peringatan)"
                    />
                  </svg>
                </span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-peran-lembut">
                  <span
                    className="block h-full rounded-full bg-peran-peringatan transition-[width] duration-300"
                    style={{ width: `${persen}%` }}
                  />
                </span>
                <span className="w-7 shrink-0 text-right text-xs text-peran-kedua">{n}</span>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 text-sm text-peran-kedua sm:border-l sm:border-peran-garis sm:pl-4">
          <span className="font-semibold text-peran-utama">{total}</span> ulasan
        </div>
      </div>
    </div>
  );
}

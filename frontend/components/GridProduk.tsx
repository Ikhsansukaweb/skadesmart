import KartuProduk, { type ProdukKartu } from "./KartuProduk";

/**
 * GridProduk - daftar produk berbentuk grid, dipakai di beranda & marketplace.
 *
 * Catatan penting soal kolom:
 *   Tokopedia memakai 6 kolom di desktop lebar, 2 kolom di HP.
 *   Untuk SkadesMart (dipakai di HP dulu), kami pakai:
 *     HP  : 2 kolom   (seperti Tokopedia mobile)
 *     tablet : 3 kolom
 *     desktop: 5-6 kolom
 *   Kartu diberi `grid` sehingga tinggi antar kolom tetap sejajar.
 */

/** Kerangka kartu saat data masih dimuat - supaya tidak ada lompatan tata letak. */
export function KerangkaKartu({ jumlah = 10 }: { jumlah?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
      aria-hidden="true"
    >
      {Array.from({ length: jumlah }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-card border border-peran-garis bg-peran-kartu"
        >
          <div className="aspect-square w-full animate-pulse bg-peran-lembut" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-full animate-pulse rounded bg-peran-lembut" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-peran-lembut" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-peran-lembut" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Keadaan kosong - dipakai bila filter tidak menghasilkan apa pun. */
export function GridKosong({
  judul = "Produk tidak ditemukan",
  pesan = "Coba ubah atau hapus filter yang dipilih.",
  aksi,
}: {
  judul?: string;
  pesan?: string;
  aksi?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-peran-garis bg-peran-kartu px-6 py-16 text-center">
      {/* Ikon SVG - bukan emoji, sesuai aturan tampilan */}
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="mb-4 text-peran-samar"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
        <path d="M8.5 11h5" />
      </svg>
      <h3 className="text-base font-bold text-peran-utama">{judul}</h3>
      <p className="mt-1 max-w-sm text-sm text-peran-kedua">{pesan}</p>
      {aksi && <div className="mt-4">{aksi}</div>}
    </div>
  );
}

export default function GridProduk({
  daftar,
  /** Tampilkan kerangka saat memuat. */
  memuat = false,
  jumlahKerangka = 10,
}: {
  daftar: ProdukKartu[];
  memuat?: boolean;
  jumlahKerangka?: number;
}) {
  if (memuat) return <KerangkaKartu jumlah={jumlahKerangka} />;
  if (!daftar.length) return <GridKosong />;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {daftar.map((p) => (
        <KartuProduk key={p.id} produk={p} />
      ))}
    </div>
  );
}

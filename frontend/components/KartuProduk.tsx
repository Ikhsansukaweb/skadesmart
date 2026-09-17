"use client";

/**
 * KartuProduk - kartu produk untuk grid marketplace & halaman toko.
 *
 * Meniru kartu produk Tokopedia, berisi:
 *   - foto (dengan badge diskon di sudut)
 *   - nama produk (maks 2 baris, dipotong rapi)
 *   - harga jual + harga coret + persentase diskon
 *   - rating bintang + jumlah terjual
 *   - nama toko + lokasi
 *   - penanda: PreOrder / Stok Habis / Terlaris / Unit Resmi
 *
 * Semua ikon SVG inline - TANPA emoji.
 */

import Link from "next/link";
import Badge from "./Badge";

export type ProdukKartu = {
  id: number | string;
  name: string;
  price: number;
  /** Harga sebelum diskon. Bila ada & lebih besar dari price, ditampilkan coret. */
  harga_asli?: number | null;
  image_url?: string | null;
  /** Stok saat ini. 0 = habis (kartu diredupkan). */
  stock?: number;
  /** Jumlah terjual (kolom baru `products.terjual`). */
  terjual?: number | null;
  /** Rata-rata rating 1-5. */
  rating?: number | null;
  jumlah_ulasan?: number | null;
  /** 'brital' | 'laundry' | 'minuman' | 'makanan' | 'jasa' */
  category?: string | null;
  /** Nama toko penjual. */
  nama_toko?: string | null;
  /** Lokasi/kantin penjual. */
  lokasi?: string | null;
  /** Produk pesanan (bukan stok siap). */
  preorder?: boolean;
  /** Toko sedang tutup -> tidak bisa dipesan. */
  toko_tutup?: boolean;
  /** Diinginkan pembeli (wishlist). */
  disimpan?: boolean;
};

const NAMA_KATEGORI: Record<string, string> = {
  brital: "Brital",
  laundry: "Laundry",
  minuman: "Minuman",
  makanan: "Makanan",
  jasa: "Jasa",
  barang: "Barang",
};

/** Format rupiah tanpa desimal: 12500 -> "Rp12.500" */
export function rupiah(nilai: number): string {
  return "Rp" + Math.round(nilai).toLocaleString("id-ID");
}

/** Ringkas jumlah besar ala Tokopedia: 1250 -> "1,2 rb" · 1200000 -> "1,2 jt" */
export function ringkas(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " jt";
  if (n >= 1_000) {
    const rb = n / 1_000;
    return (rb >= 10 ? Math.round(rb).toString() : rb.toFixed(1).replace(".", ",")) + " rb";
  }
  return String(n);
}

/** Ikon bintang - penuh, separuh, atau kosong. */
function Bintang({ nilai }: { nilai: number }) {
  const penuh = Math.floor(nilai);
  const adaSeparuh = nilai - penuh >= 0.25 && nilai - penuh < 0.75;
  const bintangPenuh = nilai - penuh >= 0.75 ? penuh + 1 : penuh;

  return (
    <span className="inline-flex items-center gap-px" aria-label={`Rating ${nilai.toFixed(1)} dari 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const isi = i < bintangPenuh ? 1 : i === bintangPenuh && adaSeparuh ? 0.5 : 0;
        return (
          <svg key={i} width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={`bnt-${i}-${Math.round(nilai * 100)}`}>
                <stop offset={`${isi * 100}%`} stopColor="var(--peringatan)" />
                <stop offset={`${isi * 100}%`} stopColor="var(--garis-tegas)" />
              </linearGradient>
            </defs>
            <path
              d="M12 2.5l2.9 6.06 6.6.86-4.83 4.62 1.2 6.56L12 17.5l-5.87 3.1 1.2-6.56L2.5 9.42l6.6-.86z"
              fill={isi === 1 ? "var(--peringatan)" : `url(#bnt-${i}-${Math.round(nilai * 100)})`}
            />
          </svg>
        );
      })}
    </span>
  );
}

export default function KartuProduk({ produk }: { produk: ProdukKartu }) {
  const habis = produk.stock !== undefined && produk.stock <= 0;
  const tutup = produk.toko_tutup === true;
  const takBisaDipesan = habis || tutup;

  const diskon =
    produk.harga_asli && produk.harga_asli > produk.price
      ? Math.round(((produk.harga_asli - produk.price) / produk.harga_asli) * 100)
      : 0;

  const rating = produk.rating ?? 0;
  const terjual = produk.terjual ?? 0;

  return (
    <Link
      href={`/product/${produk.id}`}
      className={[
        "group relative flex flex-col overflow-hidden rounded-card border border-peran-garis",
        "bg-peran-kartu shadow-[var(--bayangan-kartu)] transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[var(--bayangan-naik)]",
        takBisaDipesan ? "opacity-70" : "",
      ].join(" ")}
    >
      {/* ---------------- Foto ---------------- */}
      <div className="relative aspect-square w-full overflow-hidden bg-peran-lembut">
        {produk.image_url ? (
          // Sengaja pakai <img> bukan next/image: foto berasal dari Catbox
          // (domain luar) dan sudah dibatasi ukurannya saat diunggah.
          <img
            src={produk.image_url}
            alt={produk.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          // Placeholder bila produk belum punya foto - ikon SVG, bukan emoji.
          <div className="flex h-full w-full items-center justify-center text-peran-samar">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* Badge diskon - sudut kiri atas, seperti Tokopedia */}
        {diskon > 0 && !takBisaDipesan && (
          <span className="absolute left-0 top-0 rounded-br-badge bg-peran-turun px-2 py-1 text-xs font-bold text-peran-terang">
            -{diskon}%
          </span>
        )}

        {/* Penanda PreOrder - sudut kanan atas */}
        {produk.preorder && !takBisaDipesan && (
          <span className="absolute right-0 top-0 rounded-bl-badge bg-peran-aksen px-2 py-1 text-[11px] font-bold text-peran-terang">
            PreOrder
          </span>
        )}

        {/* Menutupi kartu bila habis / toko tutup */}
        {takBisaDipesan && (
          <div className="absolute inset-0 flex items-center justify-center bg-peran-kartu/70 backdrop-blur-[1px]">
            <span className="rounded-badge bg-peran-samar px-3 py-1.5 text-xs font-bold text-peran-terang">
              {tutup && !habis ? "Toko Tutup" : "Stok Habis"}
            </span>
          </div>
        )}

        {/* Tanda wishlist - hanya penanda visual di kartu */}
        {produk.disimpan && (
          <span className="absolute bottom-2 right-2 rounded-full bg-peran-kartu/90 p-1.5 text-peran-aksen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-9.6-9A5.7 5.7 0 0 1 12 5.6 5.7 5.7 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z" />
            </svg>
          </span>
        )}
      </div>

      {/* ---------------- Keterangan ---------------- */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-peran-utama">
          {produk.name}
        </h3>

        {/* Harga */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-peran-utama">{rupiah(produk.price)}</span>
          {diskon > 0 && produk.harga_asli && (
            <span className="text-xs text-peran-samar line-through">
              {rupiah(produk.harga_asli)}
            </span>
          )}
        </div>

        {/* Rating & terjual */}
        <div className="flex items-center gap-1.5 text-xs text-peran-kedua">
          {rating > 0 ? (
            <>
              <Bintang nilai={rating} />
              <span className="font-medium text-peran-utama">{rating.toFixed(1)}</span>
            </>
          ) : (
            <span className="text-peran-samar">Belum ada ulasan</span>
          )}
          {terjual > 0 && (
            <>
              <span className="text-peran-samar">·</span>
              <span>{ringkas(terjual)}+ terjual</span>
            </>
          )}
        </div>

        {/* Toko + lokasi + kategori */}
        <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-[11px] text-peran-kedua">
          {produk.category === "brital" || produk.category === "laundry" ? (
            <Badge anak="Unit Resmi" warna="resmi" ukuran="kecil" />
          ) : (
            produk.category && (
              <Badge
                anak={NAMA_KATEGORI[produk.category] ?? produk.category}
                warna="netral"
                ukuran="kecil"
              />
            )
          )}
          {produk.nama_toko && (
            <span className="truncate font-medium text-peran-kedua">{produk.nama_toko}</span>
          )}
          {produk.lokasi && <span className="truncate text-peran-samar">· {produk.lokasi}</span>}
        </div>
      </div>
    </Link>
  );
}

"use client";

/**
 * BannerBento - tata letak banner ala "bento" (1 besar + 2 kecil).
 *
 * SUSUNAN:
 *   ┌─────────────────────┬────────────┐
 *   │                     │  B2  │ B3  │
 *   │    BANNER BESAR     ├──────┴─────┤
 *   │      (kiri)         │            │
 *   └─────────────────────┴────────────┘
 *
 *   - Kiri  : 1 banner, lebar 2 satuan, tinggi 2 satuan
 *   - Kanan : 2 banner, masing-masing lebar 1 satuan, tinggi 1 satuan
 *   - Karena itu lebar 1 banner kiri = 2 banner kanan.
 *
 * Cara mengisi banner:
 *   Admin menambah banner di Dashboard > Kelola Banner.
 *   - Banner ke-1 (paling awal) -> kotak BESAR di kiri
 *   - Banner ke-2 dan ke-3      -> kotak kecil di kanan
 *   - Kalau lebih dari 3, sisanya ikut diputar otomatis (rotasi) supaya
 *     semua banner kebagian tampil.
 *
 * Kalau banner kurang dari 3, kotak yang kosong tidak ditampilkan dan
 * kotak besar otomatis melebar memenuhi ruangnya (tidak ada lubang kosong).
 *
 * Di HP: tata letak bertumpuk (banner besar di atas, dua kecil di bawah)
 * supaya tetap enak dilihat dan tidak kekecilan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";

interface AdminBanner {
  id: number;
  image_url: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
}

/**
 * Gambar bawaan untuk kotak BESAR di kiri (banner utama).
 * Dipakai kalau admin belum mengunggah banner sama sekali, supaya beranda
 * tidak kosong melompong. Foto ini hanya untuk banner utama.
 */
const GAMBAR_UTAMA_BAWAAN = "https://files.catbox.moe/4q4wzz.jpg";

/** Satu kotak banner - gambar + judul (kalau ada) + tautan (kalau ada). */
function KotakBanner({
  banner,
  kelas,
  prioritas,
  isUtama,
  onClick,
}: {
  banner: AdminBanner | null;
  kelas?: string;
  prioritas?: boolean;
  /** true = kotak besar di kiri: gambar diganti gambar bawaan + diberi logo. */
  isUtama?: boolean;
  onClick?: () => void;
}) {
  if (!banner) {
    // Tidak ada banner untuk kotak ini: tampilkan alas warna tema supaya
    // susunan tetap rapi (dipakai hanya kalau jumlah banner kurang).
    return <div className={`border border-sand bg-sand/40 ${kelas}`} aria-hidden="true" />;
  }

  const isi = (
    <div className={`relative h-full w-full overflow-hidden bg-ink ${kelas}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isUtama ? GAMBAR_UTAMA_BAWAAN : banner.image_url}
        alt={banner.title || "Banner"}
        loading={prioritas ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {isUtama && (
        /* Logo di atas gambar: logo SMKN 1 Depok Sleman + logo SkadesMart,
           sama seperti identitas resmi di footer. Ditumpuk di atas gambar
           dengan lapisan gelap supaya selalu terbaca di foto apa pun. */
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-3 bg-ink/45 px-5 py-3 backdrop-blur-[2px]">
            <img
              src="/logo-smkn1.png"
              alt="Logo SMK Negeri 1 Depok Sleman"
              width={64}
              height={64}
              className="h-12 w-12 shrink-0 object-contain sm:h-16 sm:w-16"
            />
            <span className="text-white font-body text-lg" aria-hidden="true">
              x
            </span>
            {/* Logo SkadesMart dibuat lebih besar dari logo sekolah supaya
                jadi titik perhatian dan tulisannya tetap terbaca. */}
            <img
              src="/logo-skadesmart.png"
              alt="Logo SkadesMart"
              width={96}
              height={96}
              className="h-16 w-16 shrink-0 object-contain sm:h-24 sm:w-24"
            />
          </span>
        </div>
      )}

      {/* Tulisan "SkadesMart" di bagian BAWAH DALAM foto, hanya pada banner
          utama. Dipisah dari blok logo supaya tidak mendorong susunan logo,
          dan dibuat besar agar terbaca dari jauh. */}
      {isUtama && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3 sm:pb-5">
          <span className="font-heading text-lg font-semibold tracking-tight text-white sm:text-3xl">
            SkadesMart
          </span>
        </div>
      )}

      {banner.title && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent p-3 sm:p-4">
          <p className="line-clamp-2 font-heading text-sm font-semibold text-white sm:text-base">
            {banner.title}
          </p>
        </div>
      )}
    </div>
  );

  if (banner.link_url) {
    return (
      <Link href={banner.link_url} onClick={onClick} className="block h-full w-full">
        {isi}
      </Link>
    );
  }
  return isi;
}

export default function BannerBento() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [geser, setGeser] = useState(0); // jumlah putaran untuk rotasi otomatis
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let batal = false;
    api<{ banners: AdminBanner[] }>("/banners")
      .then((d) => {
        if (batal) return;
        const urut = [...(d.banners || [])].sort((a, b) => a.sort_order - b.sort_order);
        setBanners(urut);
      })
      .catch(() => {
        if (!batal) setBanners([]);
      });
    return () => {
      batal = true;
    };
  }, []);

  // Rotasi otomatis: berguna kalau banner lebih dari 3 supaya semuanya
  // kebagian tampil. Kalau hanya 3 atau kurang, tidak ada gunanya berputar.
  const jumlah = banners.length;
  useEffect(() => {
    if (jumlah <= 3) return;
    timerRef.current = setInterval(() => setGeser((g) => g + 1), 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [jumlah]);

  /** Ambil banner ke-i dengan pembungkusan (wrap) supaya aman kalau habis. */
  const ambil = useCallback(
    (i: number): AdminBanner | null => {
      if (jumlah === 0) return null;
      return banners[(i + geser) % jumlah];
    },
    [banners, geser, jumlah],
  );

  const tiga = useMemo(
    () => [ambil(0), ambil(1), ambil(2)],
    [ambil],
  );

  if (jumlah === 0) return null; // tidak ada banner aktif -> tidak ada ruang kosong

  const [besar, kiri, kanan] = tiga;
  const adaKanan = Boolean(kiri || kanan);

  return (
    <section aria-label="Banner promosi">
      {/* ---------- Tampilan HP: geser ke kanan ----------
          Di layar kecil, tiga banner ini ditata sebagai baris yang bisa
          diusap (swipe) - bukan ditumpuk - supaya beranda tidak memanjang
          ke bawah dan terasa seperti aplikasi. Susunan desktop (bento)
          tetap dipakai di layar lebar. */}
      <div className="sm:hidden">
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="w-[85%] shrink-0 snap-start">
            <KotakBanner banner={besar} prioritas isUtama kelas="aspect-[16/9] w-full" />
          </div>
          {adaKanan && (
            <>
              <div className="w-[85%] shrink-0 snap-start">
                <KotakBanner banner={kiri} kelas="aspect-[16/9] w-full" />
              </div>
              <div className="w-[85%] shrink-0 snap-start">
                <KotakBanner banner={kanan} kelas="aspect-[16/9] w-full" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Tampilan besar: bento (1 kiri + 2 kanan) ---------- */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-3 sm:grid-rows-2">
        {/* Banner besar: 2 kolom x 2 baris */}
        <div className={adaKanan ? "col-span-2 row-span-2" : "col-span-3 row-span-2"}>
          <KotakBanner banner={besar} prioritas isUtama kelas="h-[260px] md:h-[320px]" />
        </div>

        {/* Dua banner kecil: masing-masing 1 kolom x 1 baris */}
        {adaKanan && (
          <>
            <KotakBanner banner={kiri} kelas="h-[126px] md:h-[156px]" />
            <KotakBanner banner={kanan} kelas="h-[126px] md:h-[156px]" />
          </>
        )}
      </div>
    </section>
  );
}

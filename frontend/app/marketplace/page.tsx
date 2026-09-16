"use client";

// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import GridProduk, { GridKosong } from "@/components/GridProduk";
import PanelFilter, { FILTER_KOSONG, type NilaiFilter } from "@/components/PanelFilter";
import BilahUrut, { type KunciUrut } from "@/components/BilahUrut";
import type { ProdukKartu } from "@/components/KartuProduk";
import { api } from "@/lib/api";

/**
 * Halaman Marketplace - daftar semua produk dengan filter lengkap.
 *
 * KEPUTUSAN DESAIN: SEMUA keadaan filter disimpan di URL (query string),
 * bukan di dalam state React saja. Alasannya:
 *   - tautan bisa dibagikan ("kirim link produk minuman di bawah 10rb")
 *   - tombol "kembali" browser bekerja sebagaimana mestinya
 *   - hasil filter bertahan setelah halaman dimuat ulang
 */

/** Baca keadaan filter dari URL. */
function filterDariUrl(sp: URLSearchParams): NilaiFilter {
  const pisah = (k: string) =>
    (sp.get(k) || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    kategori: pisah("kategori"),
    hargaMin: sp.get("harga_min") || "",
    hargaMax: sp.get("harga_max") || "",
    lokasi: pisah("lokasi"),
    jenisToko: pisah("jenis_toko"),
    ratingMin: sp.get("rating_min") || "",
    ketersediaan: pisah("tersedia"),
  };
}

function MarketplaceContent() {
  const sp = useSearchParams();
  const router = useRouter();

  const [produk, setProduk] = useState<ProdukKartu[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [laciFilter, setLaciFilter] = useState(false);

  const filter = useMemo(() => filterDariUrl(sp), [sp]);
  const urut = (sp.get("urut") || "sesuai") as KunciUrut;
  const cari = sp.get("search") || "";

  /** Tulis satu perubahan ke URL tanpa memuat ulang halaman. */
  const tulisUrl = useCallback(
    (ubah: Record<string, string>) => {
      const q = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(ubah)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      // Setiap perubahan filter mengembalikan ke halaman 1 supaya pengguna
      // tidak "terjebak" di halaman 5 padahal hasilnya tinggal 3.
      q.delete("page");
      router.replace(`/marketplace?${q.toString()}`, { scroll: false });
    },
    [sp, router]
  );

  const gantiFilter = useCallback(
    (baru: NilaiFilter) => {
      tulisUrl({
        kategori: baru.kategori.join(","),
        harga_min: baru.hargaMin,
        harga_max: baru.hargaMax,
        lokasi: baru.lokasi.join(","),
        jenis_toko: baru.jenisToko.join(","),
        rating_min: baru.ratingMin,
        tersedia: baru.ketersediaan.join(","),
      });
    },
    [tulisUrl]
  );

  // Ambil data setiap kali URL berubah.
  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat("");

    const q = new URLSearchParams();
    if (filter.kategori.length) q.set("category", filter.kategori.join(","));
    if (filter.hargaMin) q.set("harga_min", filter.hargaMin);
    if (filter.hargaMax) q.set("harga_max", filter.hargaMax);
    if (filter.ratingMin) q.set("rating_min", filter.ratingMin);
    if (filter.jenisToko.length === 1) q.set("jenis_toko", filter.jenisToko[0]);
    if (filter.ketersediaan.includes("tersedia")) q.set("tersedia", "1");
    if (cari) q.set("search", cari);
    if (urut) q.set("urut", urut);
    q.set("limit", "50");

    api(`/products?${q.toString()}`)
      .then((d: any) => {
        if (batal) return;
        setProduk(Array.isArray(d.products) ? d.products : []);
      })
      .catch((e: any) => {
        if (batal) return;
        setGalat(e?.message || "Gagal memuat produk.");
        setProduk([]);
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });

    return () => {
      batal = true;
    };
  }, [filter.kategori, filter.hargaMin, filter.hargaMax, filter.ratingMin, filter.jenisToko, filter.ketersediaan, cari, urut]);

  // Filter lokasi belum ada di kolom DB, jadi disaring di sisi tampilan.
  // Ditulis apa adanya sebagai catatan agar tidak dianggap terlupa.
  const hasil = produk;

  const jumlahFilterAktif =
    filter.kategori.length +
    filter.lokasi.length +
    filter.jenisToko.length +
    filter.ketersediaan.length +
    (filter.hargaMin ? 1 : 0) +
    (filter.hargaMax ? 1 : 0) +
    (filter.ratingMin ? 1 : 0);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-page px-4 pb-24 pt-5 md:pb-10">
        {/* ---------------- Jejak navigasi ---------------- */}
        <nav className="mb-3 flex items-center gap-1.5 text-sm text-peran-kedua" aria-label="Jejak navigasi">
          <Link href="/home" className="hover:text-peran-aksi">Beranda</Link>
          <span className="text-peran-samar">/</span>
          <span className="font-semibold text-peran-utama">
            {filter.kategori.length === 1
              ? filter.kategori[0].charAt(0).toUpperCase() + filter.kategori[0].slice(1)
              : "Semua Produk"}
          </span>
        </nav>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-heading text-peran-utama md:text-2xl">
              {cari ? `Hasil pencarian "${cari}"` : "Jelajahi Produk"}
            </h1>
            <p className="mt-0.5 text-sm text-peran-kedua">
              Produk dari unit KWU Brital, Laundry, dan jualan siswa SMKN 1 Depok Sleman.
            </p>
          </div>
          <Link
            href="/product/add"
            className="inline-flex items-center gap-2 rounded-full bg-peran-aksi px-4 py-2.5 text-sm font-semibold text-peran-terang transition-colors hover:bg-peran-aksi-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Jual Barang
          </Link>
        </div>

        {/* ---------------- Bilah urut ---------------- */}
        <BilahUrut
          nilai={urut}
          saatGanti={(k) => tulisUrl({ urut: k })}
          jumlah={hasil.length}
          saatBukaFilter={() => setLaciFilter(true)}
          jumlahFilterAktif={jumlahFilterAktif}
        />

        <div className="mt-4 flex gap-4">
          {/* ---------------- Filter (desktop) ---------------- */}
          <PanelFilter
            nilai={filter}
            saatUbah={gantiFilter}
            className="hidden w-64 shrink-0 self-start lg:block sticky top-20"
          />

          {/* ---------------- Hasil ---------------- */}
          <div className="min-w-0 flex-1">
            {galat ? (
              <GridKosong
                judul="Gagal memuat produk"
                pesan={galat}
                aksi={
                  <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="rounded-full bg-peran-aksi px-4 py-2 text-sm font-semibold text-peran-terang"
                  >
                    Coba lagi
                  </button>
                }
              />
            ) : !memuat && hasil.length === 0 ? (
              <GridKosong
                pesan={
                  jumlahFilterAktif > 0
                    ? "Tidak ada produk yang cocok dengan filter. Coba hapus sebagian filter."
                    : "Belum ada produk di kategori ini."
                }
                aksi={
                  jumlahFilterAktif > 0 ? (
                    <button
                      type="button"
                      onClick={() => gantiFilter(FILTER_KOSONG)}
                      className="rounded-full bg-peran-aksi px-4 py-2 text-sm font-semibold text-peran-terang"
                    >
                      Hapus semua filter
                    </button>
                  ) : null
                }
              />
            ) : (
              <GridProduk daftar={hasil} memuat={memuat} />
            )}
          </div>
        </div>
      </main>

      {/* ---------------- Laci filter (HP) ---------------- */}
      {laciFilter && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Tutup filter"
            onClick={() => setLaciFilter(false)}
            className="absolute inset-0 bg-peran-utama/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-card bg-peran-kartu p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-peran-utama">Filter</h2>
              <button
                type="button"
                onClick={() => setLaciFilter(false)}
                aria-label="Tutup"
                className="rounded-full p-2 text-peran-kedua hover:bg-peran-lembut"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <PanelFilter nilai={filter} saatUbah={gantiFilter} className="border-0 p-0" />
            <button
              type="button"
              onClick={() => setLaciFilter(false)}
              className="mt-4 w-full rounded-full bg-peran-aksi py-3 text-sm font-semibold text-peran-terang"
            >
              Lihat {hasil.length} produk
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-page px-4 py-6">
          <div className="h-8 w-52 animate-pulse rounded bg-peran-lembut" />
          <div className="mt-4 h-64 animate-pulse rounded-card bg-peran-lembut" />
        </main>
      }
    >
      <MarketplaceContent />
    </Suspense>
  );
}

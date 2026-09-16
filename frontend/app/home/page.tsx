"use client";

/**
 * Beranda (setelah masuk).
 *
 * Halaman ini SENGAJA dibuat sederhana - mengikuti gaya landing page:
 *   - kepala halaman yang tenang (sapaan + pencarian)
 *   - pintasan kategori (5 kategori, ikon SVG)
 *   - daftar produk yang rapi
 *
 * Tidak ada banner promo bertumpuk, tidak ada judul besar di sana-sini.
 * Kalau ingin menjelajah lebih lanjut, arahkan ke /marketplace yang
 * punya panel filter lengkap.
 *
 * Selalu dirender ulang (force-dynamic) supaya daftar produk tidak
 * di-cache lama oleh browser/CDN.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import GridProduk from "@/components/GridProduk";
import type { ProdukKartu } from "@/components/KartuProduk";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Kategori = "brital" | "laundry" | "minuman" | "makanan" | "jasa";

const KATEGORI: { kunci: Kategori; nama: string; warna: string; ikon: JSX.Element }[] = [
  {
    kunci: "makanan",
    nama: "Makanan",
    warna: "bg-ember-100 text-ember",
    ikon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11h18a9 9 0 0 1-18 0z" />
        <path d="M12 11V7a2 2 0 0 1 2-2" />
        <path d="M3 11V7a2 2 0 0 1 2-2h3" />
        <path d="M5 20h14" />
      </svg>
    ),
  },
  {
    kunci: "minuman",
    nama: "Minuman",
    warna: "bg-electric-100 text-electric",
    ikon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3h8l-1 7a3 3 0 0 1-3 3 3 3 0 0 1-3-3z" />
        <path d="M12 13v6" />
        <path d="M8 21h8" />
        <path d="M18 4h2.5a1.5 1.5 0 0 1 0 3H18" />
      </svg>
    ),
  },
  {
    kunci: "brital",
    nama: "Brital",
    warna: "bg-ember-100 text-ember",
    ikon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2c1.5 3.5 5 4.8 5 9a5 5 0 0 1-10 0c0-1.6.6-2.8 1.4-3.8" />
        <path d="M12 22v-5" />
      </svg>
    ),
  },
  {
    kunci: "laundry",
    nama: "Laundry",
    warna: "bg-electric-100 text-electric",
    ikon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <circle cx="12" cy="14" r="4.5" />
        <circle cx="9" cy="5.5" r="1" />
      </svg>
    ),
  },
  {
    kunci: "jasa",
    nama: "Jasa",
    warna: "bg-sand text-ink",
    ikon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a4 4 0 0 0 5.2 5.2L21 21H3l8.5-8.5a4 4 0 0 1 0-5.6z" />
         <circle cx="7" cy="7" r="2.5" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const [semua, setSemua] = useState<ProdukKartu[]>([]);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    let batal = false;
    setMemuat(true);
    api<{ products: ProdukKartu[] }>("/products?limit=60&urut=terbaru")
      .then((d) => {
        if (!batal) setSemua(d.products || []);
      })
      .catch(() => {
        if (!batal) setSemua([]);
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });
    return () => {
      batal = true;
    };
  }, []);

  // Barang terlaris: urutkan dari yang paling banyak terjual.
  // Dihitung di sini (bukan minta ke server lagi) supaya hemat satu request.
  const terlaris = useMemo(
    () => [...semua].sort((a, b) => (b.terjual || 0) - (a.terjual || 0)).slice(0, 6),
    [semua]
  );

  const produkPerKategori = useMemo(() => {
    const hitung: Record<string, number> = {};
    for (const p of semua) {
      // `category` bisa kosong pada data lama - jangan sampai jadi kunci "null".
      const k = p.category || "lainnya";
      hitung[k] = (hitung[k] || 0) + 1;
    }
    return hitung;
  }, [semua]);

  const namaDepan = (user?.full_name || "").split(" ")[0];

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-parchment pb-24 md:pb-10">
        {/* ---------- Kepala halaman: sapaan + pencarian ---------- */}
        <section className="border-b border-sand bg-paper">
          <div className="mx-auto max-w-page px-4 py-6 sm:px-6 sm:py-8">
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">
              {namaDepan ? (
                <>
                  Halo, <span className="font-serif italic font-normal">{namaDepan}</span>
                </>
              ) : (
                "Selamat datang"
              )}
            </h1>
            <p className="mt-1 text-sm text-steel">
              Mau cari apa hari ini? Semua jualan anak Skadesta ada di sini.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const el = e.currentTarget.elements.namedItem("q");
                const q = el instanceof HTMLInputElement ? el.value.trim() : "";
                window.location.href = `/marketplace${q ? `?q=${encodeURIComponent(q)}` : ""}`;
              }}
              className="mt-4 flex max-w-xl items-center gap-2"
            >
              <div className="relative min-w-0 flex-1">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
                <input
                  name="q"
                  type="search"
                  placeholder="Cari produk atau penjual..."
                  className="w-full rounded-full border border-sand bg-paper py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-steel focus:border-electric focus:outline-none"
                />
              </div>
              <button type="submit" className="btn-primary !px-5 !py-2.5 text-sm">
                Cari
              </button>
            </form>
          </div>
        </section>

        <div className="mx-auto max-w-page px-4 py-6 sm:px-6 sm:py-8">
          {/* ---------- Kategori ---------- */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-sub text-sm font-semibold text-ink sm:text-base">Kategori</h2>
              <Link href="/marketplace" className="text-sm font-medium text-electric hover:underline">
                Semua produk
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {KATEGORI.map((k) => (
                <Link
                  key={k.kunci}
                  href={`/marketplace?kategori=${k.kunci}`}
                  className="group flex flex-col items-center gap-2 rounded-card border border-sand bg-paper px-2 py-4 transition-colors hover:border-electric"
                >
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${k.warna}`}>
                    {k.ikon}
                  </span>
                  <span className="text-center text-xs font-medium text-ink sm:text-sm">{k.nama}</span>
                  <span className="text-[11px] text-steel">
                    {produkPerKategori[k.kunci] || 0} produk
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ---------- Dua unit resmi KWU ---------- */}
          <section className="mt-8">
            <h2 className="mb-3 font-sub text-sm font-semibold text-ink sm:text-base">
              Unit Resmi Sekolah
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  href: "/marketplace?kategori=brital",
                  judul: "KWU Brital",
                  ket: "Ayam geprek & makanan kantin",
                },
                {
                  href: "/marketplace?kategori=laundry",
                  judul: "KWU Laundry",
                  ket: "Titip cucian, diambil di sekolah",
                },
              ].map((u) => (
                <Link
                  key={u.href}
                  href={u.href}
                  className="flex items-center justify-between gap-3 rounded-card border border-sand bg-paper px-4 py-4 transition-colors hover:border-electric"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{u.judul}</span>
                    <span className="mt-0.5 block text-xs text-steel">{u.ket}</span>
                  </span>
                  <span className="shrink-0 rounded-badge bg-electric-100 px-2.5 py-1 text-[11px] font-semibold text-electric">
                    Resmi
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ---------- Produk terlaris ---------- */}
          {terlaris.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="font-sub text-sm font-semibold text-ink sm:text-base">
                  Paling Banyak Dipesan
                </h2>
                <Link
                  href="/marketplace?urut=terlaris"
                  className="text-sm font-medium text-electric hover:underline"
                >
                  Lihat semua
                </Link>
              </div>
              <GridProduk daftar={terlaris} />
            </section>
          )}

          {/* ---------- Semua produk ---------- */}
          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-sub text-sm font-semibold text-ink sm:text-base">Semua Produk</h2>
              <Link
                href="/marketplace"
                className="text-sm font-medium text-electric hover:underline"
              >
                Filter &amp; urutkan
              </Link>
            </div>

            {memuat ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse overflow-hidden rounded-card border border-sand bg-paper"
                  >
                    <div className="aspect-square w-full bg-sand" />
                    <div className="space-y-2 p-3">
                      <div className="h-3 w-4/5 rounded bg-sand" />
                      <div className="h-4 w-2/5 rounded bg-sand" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <GridProduk daftar={semua} />
            )}
          </section>

          {/* ---------- Ajakan jualan ---------- */}
          <section className="mt-8 rounded-card border border-sand bg-paper px-4 py-6 text-center">
            <h2 className="font-sub text-base font-semibold text-ink">
              Punya barang atau jasa yang mau dijual?
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-steel">
              Buka lapakmu sendiri dan mulai jualan ke teman satu sekolah. Gratis, tanpa ribet.
            </p>
            <Link href="/product/add" className="btn-ember mt-4 inline-block">
              Buka Lapak
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}

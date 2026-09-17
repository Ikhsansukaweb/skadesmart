"use client";

/**
 * Beranda (setelah masuk).
 *
 * Halaman ini SENGAJA dibuat sederhana - mengikuti gaya landing page:
 *   - kepala halaman yang tenang (sapaan + pencarian)
 *   - pintasan kategori (Brital, Laundry, Minuman, Makanan, Jasa)
 *   - daftar produk yang rapi
 *
 * Tidak ada banner promo bertumpuk, tidak ada judul besar berulang.
 * Untuk menjelajah lebih lanjut (filter harga/lokasi/urutkan), gunakan
 * halaman /marketplace.
 *
 * Selalu dirender ulang (force-dynamic) supaya daftar produk tidak
 * di-cache lama oleh browser/CDN.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import BannerBento from "@/components/BannerBento";
import BarisGeser from "@/components/BarisGeser";
import KartuProduk from "@/components/KartuProduk";
import type { ProdukKartu } from "@/components/KartuProduk";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/** Kategori tetap: Brital & Laundry (unit resmi) + Minuman, Makanan, Jasa, Barang. */
const KATEGORI: { kunci: string; nama: string; warna: string; ikon: React.ReactNode }[] = [
  {
    kunci: "brital",
    nama: "Brital",
    warna: "bg-ember-100 text-ember",
    // Ikon: paha ayam (drumstick) - menu andalan unit Brital.
    ikon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* daging paha: bulat besar */}
        <path d="M8.5 15.5a4.5 4.5 0 1 1 6.4-6.4 4.5 4.5 0 0 1-6.4 6.4z" />
        {/* tulang paha */}
        <path d="M9.5 14.5L4.8 19.2" />
        {/* ujung tulang (dua bulatan kecil) */}
        <circle cx="4.1" cy="19.9" r="1.3" />
        <circle cx="3.4" cy="18.6" r="1.1" />
      </svg>
    ),
  },
  // Kategori "Laundry" sengaja TIDAK ditampilkan di beranda atas permintaan
  // pemilik produk. Produk laundry tetap ada di database dan tetap bisa
  // ditemukan lewat /marketplace (filter kategori masih memuat Laundry).
  {
    kunci: "minuman",
    nama: "Minuman",
    warna: "bg-electric-100 text-electric",
    ikon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3h8l-1 7a3 3 0 0 1-6 0z" />
        <path d="M12 13v6" />
        <path d="M8.5 21h7" />
        <path d="M18 4h2.5a1.5 1.5 0 0 1 0 3H18" />
      </svg>
    ),
  },
  {
    kunci: "makanan",
    nama: "Makanan",
    warna: "bg-ember-100 text-ember",
    ikon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11h18a9 9 0 0 1-18 0z" />
        <path d="M12 11V6a2 2 0 0 1 2-2" />
        <path d="M5 20h14" />
      </svg>
    ),
  },
  {
    kunci: "jasa",
    nama: "Jasa",
    warna: "bg-sand text-ink",
    // Ikon: orang sedang mengangkat kardus paket.
    ikon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* kepala */}
        <circle cx="12" cy="3.6" r="1.9" />
        {/* badan + tangan menopang kardus */}
        <path d="M12 5.5v4.5" />
        <path d="M9.2 7.8l2.8 1.4 2.8-1.4" />
        {/* kardus yang diangkat */}
        <rect x="7" y="10.2" width="10" height="6.2" rx="0.6" />
        {/* garis perekat kardus */}
        <path d="M12 10.2v6.2" />
        <path d="M7 12.4h10" />
        {/* kaki */}
        <path d="M10.4 16.4v3.4" />
        <path d="M13.6 16.4v3.4" />
      </svg>
    ),
  },
  {
    kunci: "barang",
    nama: "Barang",
    warna: "bg-sand text-ink",
    ikon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5" />
        <path d="M12 13v8" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const [semua, setSemua] = useState<ProdukKartu[]>([]);

  useEffect(() => {
    let batal = false;
    // PENTING: `limit` maksimal 50 (batas dari API). Dulu di sini tertulis 60
    // sehingga server MENOLAK dengan 400 "Number must be less than or equal
    // to 50", daftar produk selalu kosong, dan SEMUA bagian produk di beranda
    // (Terlaris, Baru Ditambahkan, per kategori) tidak pernah tampil.
    api<{ products: ProdukKartu[] }>("/products?limit=50&urut=terbaru")
      .then((d) => {
        if (!batal) setSemua(d.products || []);
      })
      .catch(() => {
        if (!batal) setSemua([]);
      });
    return () => {
      batal = true;
    };
  }, []);

  // Terlaris dihitung di sisi tampilan supaya hemat satu permintaan ke server.
  const terlaris = useMemo(
    () => [...semua].sort((a, b) => (b.terjual || 0) - (a.terjual || 0)).slice(0, 6),
    [semua]
  );

  // Jumlah produk per kategori. `category` bisa kosong pada data lama,
  // jadi jangan sampai menghasilkan kunci "null".
  const perKategori = useMemo(() => {
    const hitung: Record<string, number> = {};
    for (const p of semua) {
      const k = p.category || "lainnya";
      hitung[k] = (hitung[k] || 0) + 1;
    }
    return hitung;
  }, [semua]);

  // Daftar produk yang sudah dikelompokkan per kategori - dipakai untuk
  // membuat satu bagian ("section") bagi tiap kategori di beranda.
  const perKategoriDaftar = useMemo(() => {
    const peta: Record<string, ProdukKartu[]> = {};
    for (const p of semua) {
      const k = p.category || "lainnya";
      if (!peta[k]) peta[k] = [];
      peta[k].push(p);
    }
    return peta;
  }, [semua]);

  const namaDepan = (user?.full_name || "").split(" ")[0];

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-parchment pb-24 md:pb-10">
        {/* ================= Banner (tata letak bento) =================
            Admin mengisi banner di Dashboard > Kelola Banner.
              - banner ke-1 -> kotak BESAR di kiri
              - banner ke-2 & ke-3 -> dua kotak kecil di kanan
              - kalau lebih dari 3, sisanya diputar otomatis
            Komponen mengambil sendiri data lewat GET /api/banners. */}
        <div className="mx-auto max-w-page px-4 pt-4 sm:px-6 sm:pt-5">
          <BannerBento />
        </div>

        {/* Kotak pencarian dihapus atas permintaan pemilik produk; pencarian
            produk/penjual tetap tersedia di /marketplace. */}

        <div className="mx-auto max-w-page px-4 pt-3 sm:px-6 sm:pt-5">
          {/* ================= Kategori =================
              Di HP: kartu dikecilkan supaya 5 kategori sejajar dalam satu
              baris (grid-cols-5) dan rapi. Judul "Kategori" serta tautan
              "Semua produk" sengaja dihapus agar langsung menempel di bawah
              banner. Padding atas juga dikecilkan (pt-3) supaya makin nempel. */}
          <section>
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:mt-0 sm:gap-2.5">
              {KATEGORI.map((k) => (
                <Link
                  key={k.kunci}
                  href={`/marketplace?kategori=${k.kunci}`}
                  className="group flex flex-col items-center gap-1 rounded-card border border-sand bg-paper px-1 py-2 transition-colors hover:border-electric sm:gap-2 sm:px-2 sm:py-4"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full sm:h-11 sm:w-11 ${k.warna}`}>
                    {k.ikon}
                  </span>
                  <span className="text-center text-[10px] font-medium leading-tight text-ink sm:text-sm">{k.nama}</span>
                  <span className="hidden text-[11px] text-steel sm:block">
                    {perKategori[k.kunci] || 0} produk
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Bagian "Unit Resmi Sekolah" (kartu KWU Brital & Laundry) dihapus
              atas permintaan. Kedua unit itu tetap bisa dicari lewat kartu
              kategori "Brital" dan "Laundry" di bagian atas. */}

          {/* ================= Terlaris ================= */}
          {terlaris.length > 0 && (
            <section className="mt-7">
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
              <BarisGeser label="Produk paling banyak dipesan">
                {terlaris.map((p) => (
                  <KartuProduk key={p.id} produk={p} />
                ))}
              </BarisGeser>
            </section>
          )}

          {/* ================= Produk terbaru (geser ke kanan) =================
              Satu baris kartu yang bisa digeser ke kanan. Isinya produk
              paling baru supaya pembeli langsung melihat barang anyar. */}
          {semua.length > 0 && (
            <section className="mt-7">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="font-sub text-sm font-semibold text-ink sm:text-base">
                  Baru Ditambahkan
                </h2>
                <Link
                  href="/marketplace?urut=terbaru"
                  className="text-sm font-medium text-electric hover:underline"
                >
                  Lihat semua
                </Link>
              </div>
              <BarisGeser label="Produk baru ditambahkan">
                {semua.slice(0, 12).map((p) => (
                  <KartuProduk key={p.id} produk={p} />
                ))}
              </BarisGeser>
            </section>
          )}

          {/* ================= Produk per kategori (geser ke kanan) =================
              Tiap kategori jadi satu baris yang bisa digeser ke kanan.
              Kategori tanpa produk tidak ditampilkan sama sekali. */}
          {KATEGORI.map((k) => {
            const daftar = perKategoriDaftar[k.kunci] || [];
            if (daftar.length === 0) return null;
            return (
              <section key={k.kunci} className="mt-7">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 className="font-sub text-sm font-semibold text-ink sm:text-base">
                    {k.nama}
                    <span className="ml-2 text-xs font-normal text-steel">
                      {daftar.length} produk
                    </span>
                  </h2>
                  <Link
                    href={`/marketplace?kategori=${k.kunci}`}
                    className="text-sm font-medium text-electric hover:underline"
                  >
                    Lihat semua
                  </Link>
                </div>
                <BarisGeser label={`Produk kategori ${k.nama}`}>
                  {daftar.map((p) => (
                    <KartuProduk key={p.id} produk={p} />
                  ))}
                </BarisGeser>
              </section>
            );
          })}

          {/* ================= Ajakan jualan ================= */}
          <section className="mt-7 rounded-card border border-sand bg-paper px-4 py-6 text-center">
            <h2 className="font-sub text-base font-semibold text-ink">
              Punya barang atau jasa yang mau dijual?
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-steel">
              Buka lapakmu sendiri dan mulai jualan ke teman satu sekolah. Gratis, tanpa ribet.
            </p>
            <Link href="/dashboard/seller" className="btn-ember mt-4 inline-block">
              Dashboard Seller
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}

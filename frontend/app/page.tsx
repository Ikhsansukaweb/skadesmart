"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, ShoppingBag, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import BrandLockup from "@/components/BrandLockup";

// Foto asli gedung SMK Negeri 1 Depok Sleman (taruh di /public/gedung-skades.jpg).
const HERO_IMAGE_SRC = "/smkn1depok.jpeg";

const FEATURES = [
  {
    icon: UtensilsCrossed,
    title: "Ayam Geprek Brital & Laundry KWU",
    body: "Pesan makanan dari unit KWU Ayam Geprek Brital atau titip cucian ke KWU Laundry, langsung dari HP.",
  },
  {
    icon: ShoppingBag,
    title: "Jualan bebas antar siswa",
    body: "Siswa bisa buka lapak sendiri dan jualan apa saja ke teman satu sekolah, tanpa ribet.",
  },
  {
    icon: MessageCircle,
    title: "Chat & tracking real-time",
    body: "Chat langsung dengan penjual dan pantau status pesanan dari baru masuk sampai selesai, semua real-time.",
  },
];

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // User yang sudah login langsung diarahkan ke /home, tidak melihat landing
  // page ini sama sekali.
  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  // PENTING - jangan mengembalikan `null` dan jangan membuat cabang yang
  // berbeda antara server dan klien.
  //
  // Di server, `user` selalu null dan `loading` selalu true (belum ada sesi).
  // Kalau render di klien menghasilkan struktur berbeda (null, atau tombol
  // yang muncul/hilang), React melaporkan "Hydration failed" karena HTML
  // server tidak sama dengan hasil render klien.
  //
  // Karena itu landing page SELALU dirender dengan bentuk yang persis sama.
  // Pengalihan ke /home ditangani useEffect di atas, dan tombol Masuk selalu
  // ada (kalau ternyata sudah login, halaman segera dialihkan sehingga
  // tombolnya tidak sempat terlihat).
  return (
    <main className="bg-peran-halaman text-peran-utama">
      {/* Sticky nav publik - beda dari Navbar.tsx yang dipakai user login */}
      <header className="sticky top-0 z-30 bg-peran-kartu/90 backdrop-blur border-b border-peran-garis">
        <div className="max-w-page mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <BrandLockup size={32} />
          <Link href="/login" className="btn-secondary !px-5 !py-2.5 text-sm">
            Masuk
          </Link>
        </div>
      </header>

      {/* Hero - foto gedung dipakai sebagai background full-bleed + overlay gelap,
          karena aspect ratio aslinya landscape-pendek (lebih pas dibanding
          dipaksa jadi kartu portrait). */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={HERO_IMAGE_SRC}
            alt="Gedung SMK Negeri 1 Depok Sleman"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-ink/75" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/30" />
        </div>

        <div className="relative max-w-page mx-auto px-4 sm:px-6 py-16 sm:py-28">
          <div className="max-w-xl space-y-6">
            {/* Badge kecil di atas headline. PENTING: memakai kelas
                `!text-[#ffffff]` (putih MUTLAK), BUKAN `!text-white`.
                Sebab `text-white` di proyek ini menunjuk token merek
                `--teks-terang` (tailwind.config.ts baris 101) yang bisa
                berubah jadi GELAP - dulu dipakai mode gelap, dan sesudah
                mode gelap dimatikan tokennya membuat teks di atas foto gelap
                jadi tak terbaca. Teks di atas FOTO harus selalu putih mutlak. */}
            <span className="badge-tagline bg-ink/70 !text-[#ffffff] backdrop-blur-sm">Marketplace Internal Sekolah</span>
            {/* Semua teks di atas FOTO memakai `!text-[#ffffff]` (putih
                MUTLAK), BUKAN `text-white`. Sebab `text-white` di proyek ini
                menunjuk token merek `--teks-terang` yang nilainya bisa
                berubah jadi GELAP (dulu dipakai mode gelap). Akibatnya teks
                di atas foto jadi hitam dan tidak terbaca. */}
            <h1 className="text-heading-sm sm:text-heading !text-[#ffffff] font-semibold">
              Satu marketplace untuk semua kebutuhan{" "}
              <span className="font-serif italic font-normal">anak Skadesta</span>
            </h1>
            <p className="text-body-sm sm:text-body !text-[#ffffff]/80 max-w-md">
              SkadesMart adalah marketplace internal SMK Negeri 1 Depok Sleman -
              tempat pesan Ayam Geprek Brital, titip cucian ke KWU Laundry, dan
              jualan bebas antar siswa, semua dalam satu aplikasi.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-ember">
                Masuk ke SkadesMart
              </Link>
            </div>
            <p className="text-caption !text-[#ffffff]/60">SMK Negeri 1 Depok Sleman</p>
          </div>
        </div>
      </section>

      {/* Feature section - Dark/Colored Section Panel, full-bleed Electric Blue */}
      <section className="bg-electric">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-heading-sm !text-[#ffffff] font-semibold mb-10 max-w-lg">
            Kenapa pakai SkadesMart?
          </h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-6 space-y-3">
                <div className="w-11 h-11 rounded-badge bg-peran-aksi-lembut flex items-center justify-center text-peran-aksi">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3 className="font-sub font-semibold text-peran-utama">{title}</h3>
                <p className="text-body-sm text-peran-kedua">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stat block - highlight non-angka karena tidak ada data publik tanpa auth */}
      <section className="max-w-page mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-peran-garis">
          <div className="py-4 sm:py-0 sm:px-6 text-center sm:text-left">
            <p className="text-heading-sm font-semibold text-peran-utama">2 Unit KWU</p>
            <p className="text-caption text-peran-kedua mt-1">Ayam Geprek Brital & Laundry</p>
          </div>
          <div className="py-4 sm:py-0 sm:px-6 text-center sm:text-left">
            <p className="text-heading-sm font-semibold text-peran-utama">Jualan Bebas</p>
            <p className="text-caption text-peran-kedua mt-1">Terbuka untuk semua siswa</p>
          </div>
          <div className="py-4 sm:py-0 sm:px-6 text-center sm:text-left">
            <p className="text-heading-sm font-semibold text-peran-utama">Real-time</p>
            <p className="text-caption text-peran-kedua mt-1">Chat & tracking status pesanan</p>
          </div>
        </div>
      </section>

      {/* CTA penutup - latar HITAM sungguhan, jadi teksnya memakai putih
          MUTLAK (`!text-[#ffffff]`), bukan `text-peran-terang` atau
          `text-white` yang mengikuti token tema dan bisa jadi gelap. */}
      <section className="bg-[#1b1d20]">
        <div className="max-w-page mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center space-y-6">
          <h2 className="text-heading-sm !text-[#ffffff] font-semibold">
            Yuk mulai belanja di SkadesMart
          </h2>
          <div className="flex flex-wrap justify-center items-center gap-4">
            <Link href="/login" className="btn-primary">
              Masuk sekarang
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

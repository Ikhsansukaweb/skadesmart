"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProductCard, { ProductCardData } from "@/components/ProductCard";
import RatingStars from "@/components/RatingStars";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Store, ClipboardList, MessageCircle, LoaderCircle } from "lucide-react";

/**
 * Halaman publik UNIT KWU - sekilas setara halaman toko siswa (/profile/:id),
 * tetapi identitasnya adalah UNIT, bukan orang. Dipakai oleh tombol "Lihat Unit"
 * pada halaman detail produk unit.
 *
 * Isinya: identitas unit, statistik (produk/pengikut/rating/cabang), daftar
 * produk unit, dan tombol untuk membuka chat unit.
 */

interface TokoUnit {
  nama_toko: string;
  deskripsi: string | null;
  lokasi: string | null;
  jam_buka: string | null;
  jumlah_produk: number;
  jumlah_pengikut: number;
  rating_toko: { rata: number | null; n: number } | null;
}

const INFO_UNIT: Record<string, { judul: string; ikon: "brital" | "laundry"; howToOrder: string }> = {
  kwu_brital: {
    judul: "Ayam Geprek Brital",
    ikon: "brital",
    howToOrder:
      "Pilih produk, tentukan varian dan jumlah, lalu pesan lewat keranjang. Pesanan diambil di kantin Brital setelah status berubah menjadi siap.",
  },
  kwu_laundry: {
    judul: "KWU Laundry",
    ikon: "laundry",
    howToOrder:
      "Antar pakaian ke unit Laundry, lalu staf akan mencatat pesanan atas namamu. Status pencucian bisa dipantau di halaman Akun.",
  },
};

function IkonUnit({ jenis, ukuran = 40 }: { jenis: "brital" | "laundry"; ukuran?: number }) {
  const umum = {
    width: ukuran,
    height: ukuran,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (jenis === "brital") {
    return (
      <svg {...umum}>
        <path d="M4 10h16l-1.2 10H5.2L4 10Z" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }
  return (
    <svg {...umum}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M7 6h2" />
    </svg>
  );
}

export default function HalamanUnit() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [toko, setToko] = useState<TokoUnit | null>(null);
  const [produk, setProduk] = useState<ProductCardData[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [sedangChat, setSedangChat] = useState(false);

  const info = INFO_UNIT[slug] || null;

  useEffect(() => {
    if (!info) {
      setGalat("Unit tidak ditemukan.");
      setMemuat(false);
      return;
    }
    // Produk unit diambil lewat kategori (brital/laundry), bukan seller_id,
    // karena produk unit bisa dibuat staf mana pun yang sedang bertugas.
    const kategori = slug === "kwu_brital" ? "brital" : "laundry";
    api<{ products: ProductCardData[] }>(`/products?category=${kategori}&limit=50`)
      .then((d) => setProduk(d.products || []))
      .catch((e: any) => setGalat(e?.message || "Gagal memuat produk unit."))
      .finally(() => setMemuat(false));
  }, [slug, info]);

  // Ambil statistik unit dari produk pertama yang punya info toko.
  useEffect(() => {
    if (produk.length === 0) return;
    const pertama = produk[0] as any;
    api<{ toko: TokoUnit }>(`/products/${pertama.id}`)
      .then((d) => setToko(d.toko || null))
      .catch(() => {});
  }, [produk]);

  async function bukaChatUnit() {
    if (!user) return router.push("/login");
    setSedangChat(true);
    try {
      const d = await api<{ chat: { id: string } }>("/chats", {
        method: "POST",
        json: { unit_slug: slug },
      });
      router.push(`/chat/${d.chat.id}`);
    } catch (e: any) {
      setGalat(e?.message || "Gagal membuka chat unit.");
    } finally {
      setSedangChat(false);
    }
  }

  if (!info) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-page px-4 py-16 text-center">
          <p className="text-peran-kedua">Unit tidak ditemukan.</p>
        </main>
      </>
    );
  }

  const rata = toko?.rating_toko?.rata ?? 0;
  const jumlahUlasan = toko?.rating_toko?.n ?? 0;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-page px-4 pb-24 pt-5 md:pb-10">
        {/* ---------- Jejak navigasi ---------- */}
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-peran-kedua" aria-label="Jejak navigasi">
          <span className="cursor-pointer hover:text-peran-aksi" onClick={() => router.push("/home")}>
            Beranda
          </span>
          <span className="text-peran-samar">/</span>
          <span className="max-w-[16rem] truncate font-semibold text-peran-utama">{info.judul}</span>
        </nav>

        {/* ---------- Kartu identitas unit ---------- */}
        <section className="rounded-card border border-peran-garis bg-peran-kartu p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-peran-aksi-lembut text-peran-aksi">
              <IkonUnit jenis={info.ikon} ukuran={32} />
            </span>

            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-xl font-semibold text-peran-utama md:text-2xl">
                {toko?.nama_toko || info.judul}
              </h1>
              <p className="mt-0.5 text-[11px] font-sub font-semibold uppercase tracking-wide text-peran-aksi">
                Unit Resmi Sekolah
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-peran-kedua">
                {jumlahUlasan > 0 ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <RatingStars value={Number(rata)} size={12} />
                      <span className="font-semibold text-peran-utama">{Number(rata).toFixed(1)}</span>
                    </span>
                    <span className="text-peran-samar">·</span>
                  </>
                ) : (
                  <>
                    <span>Belum ada ulasan</span>
                    <span className="text-peran-samar">·</span>
                  </>
                )}
                <span>{toko?.jumlah_produk ?? produk.length} produk</span>
                <span className="text-peran-samar">·</span>
                <span>{toko?.jumlah_pengikut ?? 0} pengikut</span>
                {toko?.lokasi && (
                  <>
                    <span className="text-peran-samar">·</span>
                    <span>{toko.lokasi}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Deskripsi & cara pesan */}
          <div className="mt-4 space-y-3 border-t border-peran-garis pt-4">
            <p className="text-sm text-peran-kedua">
              {toko?.deskripsi || "Unit resmi KWU SMKN 1 Depok Sleman."}
            </p>
            <div className="flex items-start gap-2 rounded-badge bg-peran-lembut p-3">
              <ClipboardList size={16} className="mt-0.5 shrink-0 text-peran-aksi" aria-hidden="true" />
              <p className="text-xs text-peran-kedua">
                <span className="font-semibold text-peran-utama">Cara pesan: </span>
                {info.howToOrder}
              </p>
            </div>
          </div>

          {/* Tombol aksi */}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={bukaChatUnit}
              disabled={sedangChat}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-peran-aksi px-5 py-3 text-sm font-semibold text-peran-terang transition-colors hover:bg-peran-aksi-hover disabled:opacity-50"
            >
              {sedangChat ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <MessageCircle size={16} aria-hidden="true" />
              )}
              Chat Unit
            </button>
          </div>
        </section>

        {/* ---------- Daftar produk unit ---------- */}
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold text-peran-utama">
            <Store size={18} aria-hidden="true" />
            Produk Unit
          </h2>

          {memuat ? (
            <p className="py-10 text-center text-peran-samar">Memuat produk...</p>
          ) : galat ? (
            <p className="py-10 text-center text-peran-turun">{galat}</p>
          ) : produk.length === 0 ? (
            <p className="py-10 text-center text-peran-samar">Belum ada produk di unit ini.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {produk.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  PackagePlus,
  Pencil,
  Trash2,
  Search,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface ProdukSaya {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url: string | null;
  is_active: number;
  terjual: number;
  avg_rating: number | null;
  rating_count: number;
}

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

const KATEGORI_LABEL: Record<string, string> = {
  minuman: "Minuman",
  makanan: "Makanan",
  jasa: "Jasa",
  barang: "Barang",
  siswa: "Siswa",
  brital: "Brital",
  laundry: "Laundry",
};

export default function SellerProductsPage() {
  const { user } = useAuth();
  const [produk, setProduk] = useState<ProdukSaya[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [cari, setCari] = useState("");
  const [hapusId, setHapusId] = useState<number | null>(null);
  const [sedangHapus, setSedangHapus] = useState(false);

  function muat() {
    setMemuat(true);
    api<{ products: ProdukSaya[] }>("/products/mine")
      .then((d) => setProduk(d.products || []))
      .catch(() => setProduk([]))
      .finally(() => setMemuat(false));
  }

  useEffect(() => {
    muat();
  }, []);

  async function hapusProduk(id: number) {
    setSedangHapus(true);
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      setProduk((prev) => prev.filter((p) => p.id !== id));
      setHapusId(null);
    } catch (e: any) {
      alert(e.message || "Gagal menghapus produk.");
    } finally {
      setSedangHapus(false);
    }
  }

  const hasil = cari
    ? produk.filter((p) => p.name.toLowerCase().includes(cari.toLowerCase()))
    : produk;

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-heading text-peran-utama sm:text-2xl">
            Produk Saya
          </h1>
          <p className="mt-0.5 text-sm text-peran-kedua">
            Kelola produk jualanmu - edit, hapus, atau lihat stok.
          </p>
        </div>
        <Link
          href="/product/add"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-peran-aksi px-4 py-2.5 text-sm font-semibold text-peran-terang transition-colors hover:bg-peran-aksi-hover"
        >
          <PackagePlus size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Tambah Produk</span>
        </Link>
      </div>

      {/* ---------- Pencarian ---------- */}
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-full border border-peran-garis bg-peran-kartu p-1.5 pl-4 transition-colors focus-within:border-peran-aksi">
          <Search size={16} className="shrink-0 text-peran-samar" aria-hidden="true" />
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari produkmu..."
            aria-label="Cari produk"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-peran-utama placeholder:text-peran-samar focus:outline-none"
          />
        </div>
      </div>

      {/* ---------- Daftar produk ---------- */}
      {memuat ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-peran-aksi" aria-hidden="true" />
          <span className="ml-2 text-peran-kedua">Memuat produk...</span>
        </div>
      ) : hasil.length === 0 ? (
        <div className="card p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-peran-lembut flex items-center justify-center text-peran-samar">
            <Package size={28} aria-hidden="true" />
          </div>
          <div>
            <p className="font-sub font-semibold text-peran-utama">
              {produk.length === 0 ? "Belum ada produk" : "Tidak ditemukan"}
            </p>
            <p className="text-sm text-peran-kedua mt-1">
              {produk.length === 0
                ? "Mulai jualan dengan menambahkan produk pertamamu."
                : "Coba kata kunci lain."}
            </p>
          </div>
          {produk.length === 0 && (
            <Link
              href="/product/add"
              className="inline-flex items-center gap-2 rounded-full bg-peran-aksi px-4 py-2 text-sm font-semibold text-peran-terang hover:bg-peran-aksi-hover"
            >
              <PackagePlus size={14} aria-hidden="true" />
              Tambah Produk
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {hasil.map((p) => (
            <div
              key={p.id}
              className="card overflow-hidden flex flex-col"
            >
              {/* Gambar */}
              <Link
                href={`/product/${p.id}`}
                className="block aspect-[4/3] bg-peran-lembut overflow-hidden"
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-peran-samar">
                    <Package size={32} aria-hidden="true" />
                  </div>
                )}
              </Link>

              {/* Konten */}
              <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                <div>
                  <Link
                    href={`/product/${p.id}`}
                    className="text-sm font-sub font-medium text-peran-utama line-clamp-2 hover:text-peran-aksi"
                  >
                    {p.name}
                  </Link>
                  <p className="text-caption text-peran-kedua mt-0.5">
                    {KATEGORI_LABEL[p.category] || p.category}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm font-sub font-semibold text-peran-utama">
                    {rupiah(p.price)}
                  </p>
                  <span
                    className={`text-[11px] font-sub px-2 py-0.5 rounded-full ${
                      p.stock > 0
                        ? "bg-peran-naik-lembut text-peran-naik"
                        : "bg-peran-aksen-lembut text-peran-aksen"
                    }`}
                  >
                    {p.stock > 0 ? `Stok: ${p.stock}` : "Habis"}
                  </span>
                </div>

                {p.terjual > 0 && (
                  <p className="text-[11px] text-peran-samar">
                    {p.terjual} terjual
                  </p>
                )}

                {/* Aksi */}
                <div className="flex items-center gap-2 mt-1">
                  <Link
                    href={`/product/${p.id}/edit`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-peran-garis-tegas py-2 text-xs font-sub font-semibold text-peran-utama transition-colors hover:bg-peran-sorot"
                  >
                    <Pencil size={12} aria-hidden="true" />
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => setHapusId(p.id)}
                    aria-label={`Hapus ${p.name}`}
                    className="inline-flex items-center justify-center rounded-full border border-peran-garis-tegas p-2 text-peran-aksen transition-colors hover:bg-peran-aksen-lembut"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Dialog konfirmasi hapus ---------- */}
      {hapusId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi hapus produk"
        >
          <button
            type="button"
            aria-label="Batal"
            onClick={() => setHapusId(null)}
            className="absolute inset-0 bg-peran-utama/50"
          />
          <div className="relative card p-5 max-w-sm w-full space-y-4 bg-peran-kartu">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-peran-aksen-lembut text-peran-aksen">
                <Trash2 size={20} aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-sub font-semibold text-peran-utama">
                  Hapus produk?
                </h3>
                <p className="text-sm text-peran-kedua mt-1">
                  Produk akan disembunyikan dari marketplace. Aksi ini tidak bisa dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHapusId(null)}
                className="flex-1 rounded-full border border-peran-garis-tegas py-2 text-sm font-sub font-semibold text-peran-utama hover:bg-peran-sorot"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => hapusProduk(hapusId)}
                disabled={sedangHapus}
                className="flex-1 rounded-full bg-peran-aksen py-2 text-sm font-sub font-semibold text-peran-terang hover:bg-peran-aksen-hover disabled:opacity-50"
              >
                {sedangHapus ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

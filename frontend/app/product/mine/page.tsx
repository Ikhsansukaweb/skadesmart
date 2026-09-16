"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Pencil, Trash2, Plus, Minus, PackagePlus, LoaderCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

interface MyProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  category: string;
  is_active: number;
}

// Halaman "Kelola Produk Saya": siswa & staf KWU Brital bisa lihat semua
// jualannya, ubah stok cepat (+/-), edit, atau hapus.
export default function MyProductsPage() {
  const [products, setProducts] = useState<MyProduct[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    api<{ products: MyProduct[] }>("/products/mine").then((d) => setProducts(d.products)).catch(() => {});
  }

  useEffect(load, []);

  async function adjustStock(id: number, delta: number, current: number) {
    const next = Math.max(0, current + delta);
    setBusyId(id);
    try {
      await api(`/products/${id}`, { method: "PUT", json: { stock: next } });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Hapus "${name}" dari jualanmu?`)) return;
    setBusyId(id);
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-brand-700">Produk Saya</h1>
          <Link href="/product/add" className="btn-primary flex items-center gap-2 text-sm">
            <PackagePlus size={16} aria-hidden="true" /> Tambah
          </Link>
        </div>

        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="card p-3 flex gap-3">
              <div className="relative w-16 h-16 rounded-badge overflow-hidden bg-electric-100 shrink-0">
                {p.image_url && <img src={p.image_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <h3 className="font-sub font-medium text-sm line-clamp-1">{p.name}</h3>
                <p className="text-sm text-brand-700 font-heading">Rp{p.price.toLocaleString("id-ID")}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-steel font-body">Stok:</span>
                  <button
                    onClick={() => adjustStock(p.id, -1, p.stock)}
                    disabled={busyId === p.id || p.stock <= 0}
                    className="w-6 h-6 rounded-lg border border-sand flex items-center justify-center text-brand-600 disabled:opacity-30"
                    aria-label="Kurangi stok"
                  >
                    <Minus size={12} aria-hidden="true" />
                  </button>
                  <span className="text-sm font-sub w-6 text-center">
                    {busyId === p.id ? <LoaderCircle size={12} className="animate-spin mx-auto" aria-hidden="true" /> : p.stock}
                  </span>
                  <button
                    onClick={() => adjustStock(p.id, 1, p.stock)}
                    disabled={busyId === p.id}
                    className="w-6 h-6 rounded-lg border border-sand flex items-center justify-center text-brand-600 disabled:opacity-30"
                    aria-label="Tambah stok"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2 justify-center">
                <Link href={`/product/edit/${p.id}`} className="p-2 text-brand-600 hover:bg-parchment rounded-lg" aria-label={`Edit ${p.name}`}>
                  <Pencil size={16} aria-hidden="true" />
                </Link>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  disabled={busyId === p.id}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  aria-label={`Hapus ${p.name}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="text-fog font-body text-sm">Kamu belum punya produk. Yuk tambah jualan pertamamu.</p>}
        </div>
      </div>
    </main>
  );
}

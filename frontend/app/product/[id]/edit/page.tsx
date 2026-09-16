"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProductForm from "@/components/ProductForm";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { LoaderCircle, Trash2 } from "lucide-react";

interface ProductDetail {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: "siswa" | "kwu_brital";
  seller_id: number;
  image_url: string | null;
  images: string[];
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<{ product: ProductDetail }>(`/products/${id}`)
      .then((d) => {
        setProduct(d.product)
        if (d.product.seller_id !== user?.id && user?.role !== "admin") {
          router.replace("/marketplace");
        }
      })
      .catch(() => router.replace("/marketplace"))
      .finally(() => setLoading(false));
  }, [id, user, router]);

  async function handleDelete() {
    if (!confirm("Yakin ingin menghapus produk ini? Ini tidak bisa dibatalkan.")) return;
    setDeleting(true);
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      router.push("/marketplace");
    } catch (err: any) {
      alert(err.message || "Gagal menghapus produk.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !product) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Memuat produk...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl text-brand-700">Edit Produk</h1>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-secondary flex items-center gap-2 text-sm text-ember-600"
          >
            {deleting && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
            <Trash2 size={14} aria-hidden="true" /> Hapus
          </button>
        </div>
        <ProductForm
          mode="edit"
          productId={product.id}
          initial={{
            name: product.name,
            description: product.description,
            price: product.price,
            stock: product.stock,
            category: product.category,
            image_urls: product.images.length ? product.images : product.image_url ? [product.image_url] : [],
          }}
          onSuccess={() => router.push(`/product/${product.id}`)}
        />
      </div>
    </main>
  );
}

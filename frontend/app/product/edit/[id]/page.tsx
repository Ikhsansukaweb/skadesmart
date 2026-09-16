"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api, uploadImages } from "@/lib/api";

const MAX_PHOTOS = 8;

interface ProductDetail {
  id: number;
  seller_id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
}

// Halaman Edit Produk - dipakai dari "Produk Saya" untuk ubah nama, harga,
// stok, deskripsi, atau ganti foto. Kategori tidak bisa diubah setelah dibuat.
export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ product: ProductDetail }>(`/products/${id}`)
      .then((d) => {
        setName(d.product.name)
        setDescription(d.product.description);
        setPrice(String(d.product.price));
        setStock(String(d.product.stock));
        setExistingImages(d.product.images || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function removeExisting(idx: number) {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleNewFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const totalSlots = MAX_PHOTOS - existingImages.length;
    const combined = [...newFiles, ...selected].slice(0, Math.max(0, totalSlots));
    setNewFiles(combined);
    setNewPreviews(combined.map((f) => URL.createObjectURL(f)));
    e.target.value = "";
  }

  function removeNew(idx: number) {
    const next = newFiles.filter((_, i) => i !== idx);
    setNewFiles(next);
    setNewPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let uploadedUrls: string[] = [];
      if (newFiles.length > 0) uploadedUrls = await uploadImages(newFiles);
      const image_urls = [...existingImages, ...uploadedUrls];

      await api(`/products/${id}`, {
        method: "PUT",
        json: {
          name,
          description,
          price: Number(price),
          stock: Number(stock),
          ...(image_urls.length ? { image_urls } : {}),
        },
      });
      router.push("/product/mine");
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan perubahan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Memuat produk...</p>
      </main>
    );
  }

  const totalPhotos = existingImages.length + newPreviews.length;

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl text-brand-700 mb-4">Edit Produk</h1>
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div>
            <label className="block text-sm font-sub mb-1 text-steel">Foto produk ({totalPhotos}/{MAX_PHOTOS})</label>
            <div className="grid grid-cols-3 gap-2">
              {existingImages.map((src, idx) => (
                <div key={`old-${idx}`} className="relative aspect-square rounded-badge overflow-hidden bg-electric-100">
                  <img src={src} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeExisting(idx)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1" aria-label="Hapus foto">
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {newPreviews.map((src, idx) => (
                <div key={`new-${idx}`} className="relative aspect-square rounded-badge overflow-hidden bg-electric-100">
                  <img src={src} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeNew(idx)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1" aria-label="Hapus foto">
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {totalPhotos < MAX_PHOTOS && (
                <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-sand rounded-badge aspect-square cursor-pointer bg-parchment">
                  <ImagePlus size={22} className="text-brand-400" aria-hidden="true" />
                  <span className="text-[10px] text-brand-500 font-body text-center px-1">Tambah foto</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleNewFiles} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-sub mb-1 text-steel">Nama produk</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-sub mb-1 text-steel">Deskripsi</label>
            <textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="price" className="block text-sm font-sub mb-1 text-steel">Harga (Rp)</label>
              <input id="price" type="number" min={0} required value={price} onChange={(e) => setPrice(e.target.value)} className="input-field" />
            </div>
            <div>
              <label htmlFor="stock" className="block text-sm font-sub mb-1 text-steel">Stok</label>
              <input id="stock" type="number" min={0} required value={stock} onChange={(e) => setStock(e.target.value)} className="input-field" />
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-red-600 font-body">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            Simpan Perubahan
          </button>
        </form>
      </div>
    </main>
  );
}

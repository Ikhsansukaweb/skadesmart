"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api, uploadImages } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const CATEGORY_OPTIONS = [
  { value: "siswa", label: "Jualan Pribadi (bebas)" },
  { value: "kwu_brital", label: "Unit KWU - Ayam Geprek Brital" },
];

const MAX_PHOTOS = 8;

export default function AddProductPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("siswa");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const combined = [...files, ...selected].slice(0, MAX_PHOTOS);
    setFiles(combined);
    setPreviews(combined.map((f) => URL.createObjectURL(f)));
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let image_urls: string[] | undefined;
      if (files.length > 0) image_urls = await uploadImages(files);

      await api("/products", {
        method: "POST",
        json: {
          name,
          description,
          price: Number(price),
          stock: Number(stock),
          category,
          ...(image_urls ? { image_urls } : {}),
        },
      });
      router.push("/marketplace");
    } catch (err: any) {
      setError(err.message || "Gagal menambahkan produk.");
    } finally {
      setSubmitting(false);
    }
  }

  const categoryOptions = CATEGORY_OPTIONS.filter(
    (opt) => opt.value === "siswa" || opt.value === user?.role || user?.role === "admin"
  );

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl text-brand-700 mb-4">Tambah Produk</h1>
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div>
            <label className="block text-sm font-sub mb-1 text-steel">
              Foto produk ({previews.length}/{MAX_PHOTOS})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {previews.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-badge overflow-hidden bg-electric-100">
                  <img src={src} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                    aria-label={`Hapus foto ${idx + 1}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {previews.length < MAX_PHOTOS && (
                <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-sand rounded-badge aspect-square cursor-pointer bg-parchment">
                  <ImagePlus size={22} className="text-brand-400" aria-hidden="true" />
                  <span className="text-[10px] text-brand-500 font-body text-center px-1">Tambah foto</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} className="hidden" />
                </label>
              )}
            </div>
            <p className="text-xs text-fog font-body mt-1">Bisa unggah lebih dari 1 foto, maksimal 5MB per foto.</p>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-sub mb-1 text-steel">Kategori</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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
            Simpan Produk
          </button>
        </form>
      </div>
    </main>
  );
}

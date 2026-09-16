"use client";

import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import { ImagePlus, LoaderCircle, X, Trash2, Save } from "lucide-react";
import { api, uploadImages } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export interface ProductFormProps {
  productId?: number;
  initial?: {
    name: string;
    description: string;
    price: number;
    stock: number;
    category: "siswa" | "kwu_brital";
    image_urls: string[];
  };
  mode: "add" | "edit";
  onSuccess?: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "siswa", label: "Jualan Pribadi (bebas)" },
  { value: "kwu_brital", label: "Unit KWU - Ayam Geprek Brital" },
];

const MAX_PHOTOS = 8;

export default function ProductForm({ productId, initial, mode, onSuccess }: ProductFormProps) {
  const { user } = useAuth();
  const router = useAuth(); // placeholder, use useRouter below
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [stock, setStock] = useState(initial?.stock ? String(initial.stock) : "");
  const [category, setCategory] = useState(initial?.category || "siswa");
  const [existingImages, setExistingImages] = useState<string[]>(initial?.image_urls || []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = CATEGORY_OPTIONS.filter(
    (opt) => opt.value === "siswa" || opt.value === user?.role || user?.role === "admin"
  );

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const incomingFiles = Array.from(e.target.files || []);
    const remainingSlots = MAX_PHOTOS - existingImages.length;
    const nextFiles = [...newFiles, ...incomingFiles].slice(0, remainingSlots);

    setNewFiles(nextFiles);

    const previews = nextFiles.map((file) => URL.createObjectURL(file));
    setNewPreviews(previews);
  }

  function removeExistingImage(idx: number) {
    const next = [...existingImages];
    next.splice(idx, 1);
    setExistingImages(next);
  }

  function removeNewFile(idx: number) {
    const next = [...newFiles];
    next.splice(idx, 1);
    setNewFiles(next);
    const nextPreviews = [...newPreviews];
    nextPreviews.splice(idx, 1);
    setNewPreviews(nextPreviews);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let allImageUrls = [...existingImages];

      if (newFiles.length > 0) {
        const uploaded = await uploadImages(newFiles);
        allImageUrls = [...existingImages, ...uploaded];
      }

      const payload: any = {
        name,
        description,
        price: Number(price),
        stock: Number(stock),
        category,
        image_urls: allImageUrls.length > 0 ? allImageUrls : undefined,
      };

      if (mode === "edit" && productId) {
        await api(`/products/${productId}`, { method: "PUT", json: payload });
      } else {
        await api("/products", { method: "POST", json: payload });
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan produk.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <div>
        <label className="block text-sm font-sub mb-1 text-steel">
          Foto produk ({existingImages.length + newFiles.length}/{MAX_PHOTOS})
        </label>
        <div className="grid grid-cols-3 gap-2">
          {existingImages.map((src, idx) => (
            <div key={`existing-${idx}`} className="relative aspect-square rounded-badge overflow-hidden bg-brand-100">
              <img src={src} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeExistingImage(idx)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                aria-label={`Hapus foto ${idx + 1}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
          {newPreviews.map((src, idx) => (
            <div key={`new-${idx}`} className="relative aspect-square rounded-badge overflow-hidden bg-brand-100">
              <img src={src} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeNewFile(idx)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                aria-label={`Hapus foto ${idx + 1}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
          {existingImages.length + newFiles.length < MAX_PHOTOS && (
            <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-brand-200 rounded-badge aspect-square cursor-pointer bg-brand-50">
              <ImagePlus size={22} className="text-brand-400" aria-hidden="true" />
              <span className="text-[10px] text-brand-500 font-body text-center px-1">Tambah foto</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFiles}
                className="hidden"
              />
            </label>
          )}
        </div>
        <p className="text-xs text-fog font-body mt-1">Bisa unggah lebih dari 1 foto, maksimal 5MB per foto.</p>
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-sub mb-1 text-steel">Kategori</label>
        <select id="category" value={category} onChange={(e) => setCategory(e.target.value as any)} className="input-field">
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

      {error && <p role="alert" className="text-sm text-ember-600 font-body">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
        {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
        {mode === "edit" ? "Simpan Perubahan" : "Simpan Produk"}
      </button>
    </form>
  );
}

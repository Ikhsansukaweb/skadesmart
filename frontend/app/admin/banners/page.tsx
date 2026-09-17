"use client";

import { useEffect, useState, FormEvent } from "react";
import Image from "next/image";
import { ImagePlus, LoaderCircle, Trash2, GripVertical, Eye, EyeOff } from "lucide-react";
import SubPageShell from "@/components/dashboard/SubPageShell";
import { api, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Banner {
  id: number;
  image_url: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  is_active: number;
}

export default function AdminBannersPage() {
  const { user } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    api<{ banners: Banner[] }>("/banners/all").then((d) => setBanners(d.banners)).catch(() => {});
  }

  useEffect(load, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Pilih gambar dulu.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const image_url = await uploadImage(file);
      await api("/banners", {
        method: "POST",
        json: {
          image_url,
          title: title || undefined,
          link_url: linkUrl || undefined,
          sort_order: banners.length,
        },
      });
      setFile(null);
      setPreview(null);
      setTitle("");
      setLinkUrl("");
      load();
    } catch (err: any) {
      setError(err.message || "Gagal menambah banner.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(banner: Banner) {
    setBusyId(banner.id);
    try {
      await api(`/banners/${banner.id}`, {
        method: "PUT",
        json: { is_active: !banner.is_active },
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus banner ini?")) return;
    setBusyId(id);
    try {
      await api(`/banners/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function moveOrder(banner: Banner, direction: -1 | 1) {
    const sorted = [...banners].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((b) => b.id === banner.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    setBusyId(banner.id);
    try {
      await Promise.all([
        api(`/banners/${banner.id}`, {
          method: "PUT",
          json: { sort_order: swapWith.sort_order },
        }),
        api(`/banners/${swapWith.id}`, {
          method: "PUT",
          json: { sort_order: banner.sort_order },
        }),
      ]);
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (user && user.role !== "admin") {
    return (
      <main className="min-h-screen">
        <p className="text-center py-10 text-fog font-body">Halaman ini khusus admin.</p>
      </main>
    );
  }

  const sorted = [...banners].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <SubPageShell role="admin" title="Kelola Banner">
      <p className="text-sm text-peran-kedua font-body">
        Banner ini tampil sebagai carousel geser di Home Page, urut dari atas ke bawah di daftar ini.
      </p>

      <form onSubmit={handleSubmit} className="card p-5 space-y-3">
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-peran-garis rounded-card aspect-[21/7] cursor-pointer bg-peran-lembut relative overflow-hidden">
          {preview ? (
            <img
              src={preview}
              alt="Pratinjau banner"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <ImagePlus size={28} className="text-peran-samar" aria-hidden="true" />
              <span className="text-sm text-peran-kedua font-body">
                Unggah gambar banner (rasio lebar disarankan)
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
          />
        </label>

        <div>
          <label htmlFor="banner_title" className="block text-sm font-sub mb-1 text-peran-kedua">
            Judul (opsional, tampil di atas banner)
          </label>
          <input
            id="banner_title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="banner_link" className="block text-sm font-sub mb-1 text-peran-kedua">
            Link tujuan saat diklik (opsional)
          </label>
          <input
            id="banner_link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="/marketplace?category=kwu_brital"
            className="input-field"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-peran-aksen font-body">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          Tambah Banner
        </button>
      </form>

      <div className="space-y-3">
        {sorted.map((b, idx) => (
          <div key={b.id} className="card p-3 flex gap-3">
            <div className="relative w-24 h-16 rounded-badge overflow-hidden bg-peran-lembut shrink-0">
              <img
                src={b.image_url}
                alt="Gambar"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-sub font-medium text-sm truncate text-peran-utama">
                {b.title || "(tanpa judul)"}
              </p>
              {b.link_url && (
                <p className="text-xs text-peran-kedua font-body truncate">{b.link_url}</p>
              )}
              <div className="flex items-center gap-1 pt-1">
                <button
                  onClick={() => moveOrder(b, -1)}
                  disabled={idx === 0 || busyId === b.id}
                  className="p-1 text-peran-kedua disabled:opacity-30"
                  aria-label="Naikkan urutan"
                >
                  <GripVertical size={14} aria-hidden="true" />
                </button>
                <button
                  onClick={() => toggleActive(b)}
                  disabled={busyId === b.id}
                  className={`text-xs font-sub px-2 py-1 rounded-full flex items-center gap-1 ${
                    b.is_active
                      ? "bg-peran-naik-lembut text-peran-naik"
                      : "bg-peran-lembut text-peran-kedua"
                  }`}
                >
                  {b.is_active ? (
                    <Eye size={12} aria-hidden="true" />
                  ) : (
                    <EyeOff size={12} aria-hidden="true" />
                  )}
                  {b.is_active ? "Aktif" : "Nonaktif"}
                </button>
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={busyId === b.id}
                  className="ml-auto p-1.5 text-peran-aksen hover:bg-peran-aksen-lembut rounded-full"
                  aria-label="Hapus banner"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-peran-samar font-body text-sm">Belum ada banner.</p>
        )}
      </div>
    </SubPageShell>
  );
}

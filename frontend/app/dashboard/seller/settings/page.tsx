"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Store,
  Save,
  Loader2,
  Check,
  Clock,
  ImagePlus,
  X,
} from "lucide-react";
import { api, uploadImages } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface TokoProfil {
  nama_toko: string | null;
  deskripsi: string | null;
  foto_url: string | null;
  jam_buka: string | null;
  lokasi: string | null;
}

export default function SellerSettingsPage() {
  const { user } = useAuth();
  const [namaToko, setNamaToko] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jamBuka, setJamBuka] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fileFoto, setFileFoto] = useState<File | null>(null);
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);

  const [shopOpen, setShopOpen] = useState<boolean | null>(null);

  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "err"; teks: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ profil: TokoProfil | null }>("/etalase/saya").catch(() => ({
        profil: null,
      })),
      api<{ user: { shop_open: number } }>("/account").catch(() => ({
        user: null,
      })),
    ]).then(([a, b]) => {
      if (a.profil) {
        setNamaToko(a.profil.nama_toko || "");
        setDeskripsi(a.profil.deskripsi || "");
        setJamBuka(a.profil.jam_buka || "");
        setLokasi(a.profil.lokasi || "");
        setFotoUrl(a.profil.foto_url || null);
      } else if (user) {
        // Default nama toko = nama user
        setNamaToko(`Toko ${user.full_name.split(" ")[0]}`);
      }
      if (b.user) {
        setShopOpen(Boolean(b.user.shop_open));
      }
      setMemuat(false);
    });
  }, [user]);

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileFoto(file);
    setPreviewFoto(URL.createObjectURL(file));
    e.target.value = "";
  }

  function hapusFoto() {
    setFileFoto(null);
    setPreviewFoto(null);
  }

  async function toggleShop() {
    if (shopOpen === null) return;
    const baru = !shopOpen;
    setShopOpen(baru);
    try {
      await api("/account/shop-status", {
        method: "PUT",
        json: { shop_open: baru },
      });
      setPesan({
        jenis: "ok",
        teks: baru ? "Toko dibuka." : "Toko ditutup.",
      });
    } catch (e: any) {
      setShopOpen(!baru); // rollback
      setPesan({ jenis: "err", teks: e.message || "Gagal mengubah status." });
    }
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setMenyimpan(true);
    setPesan(null);
    try {
      let foto_url: string | undefined;
      if (fileFoto) {
        const urls = await uploadImages([fileFoto]);
        foto_url = urls[0];
      }

      await api("/etalase", {
        method: "PUT",
        json: {
          nama_toko: namaToko.trim() || null,
          deskripsi: deskripsi.trim() || null,
          jam_buka: jamBuka.trim() || null,
          lokasi: lokasi.trim() || null,
          ...(foto_url ? { foto_url } : {}),
        },
      });

      if (foto_url) setFotoUrl(foto_url);
      setFileFoto(null);
      setPreviewFoto(null);
      setPesan({ jenis: "ok", teks: "Pengaturan toko disimpan." });
    } catch (e: any) {
      setPesan({ jenis: "err", teks: e.message || "Gagal menyimpan." });
    } finally {
      setMenyimpan(false);
    }
  }

  if (memuat) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-peran-aksi" aria-hidden="true" />
        <span className="ml-2 text-peran-kedua">Memuat pengaturan...</span>
      </div>
    );
  }

  const fotoTampil = previewFoto || fotoUrl;

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
      {/* ---------- Header ---------- */}
      <div className="mb-5 flex items-center gap-2">
        <Store size={22} className="text-peran-aksi" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-bold tracking-heading text-peran-utama sm:text-2xl">
            Pengaturan Toko
          </h1>
          <p className="mt-0.5 text-sm text-peran-kedua">
            Atur identitas dan status tokomu.
          </p>
        </div>
      </div>

      {/* ---------- Status toko (buka/tutup) ---------- */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                shopOpen
                  ? "bg-peran-naik-lembut text-peran-naik"
                  : "bg-peran-aksen-lembut text-peran-aksen"
              }`}
            >
              {shopOpen ? (
                <Check size={20} aria-hidden="true" />
              ) : (
                <Clock size={20} aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="font-sub font-semibold text-peran-utama">
                {shopOpen ? "Toko Buka" : "Toko Tutup"}
              </p>
              <p className="text-caption text-peran-kedua">
                {shopOpen
                  ? "Pembeli bisa memesan produkmu."
                  : "Produkmu tidak bisa dipesan."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleShop}
            disabled={shopOpen === null}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              shopOpen ? "bg-peran-naik" : "bg-peran-garis-tegas"
            }`}
            aria-label={shopOpen ? "Tutup toko" : "Buka toko"}
            role="switch"
            aria-checked={shopOpen === true}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                shopOpen ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ---------- Form profil toko ---------- */}
      <form onSubmit={simpan} className="card p-5 space-y-4">
        {/* Foto toko */}
        <div>
          <label className="block text-sm font-sub mb-2 text-peran-kedua">
            Foto Toko
          </label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-card overflow-hidden bg-peran-lembut shrink-0 flex items-center justify-center">
              {fotoTampil ? (
                <img
                  src={fotoTampil}
                  alt="Foto toko"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store size={28} className="text-peran-samar" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="inline-flex items-center gap-2 rounded-full border border-peran-garis-tegas px-3 py-1.5 text-sm font-sub font-semibold text-peran-utama hover:bg-peran-sorot cursor-pointer">
                <ImagePlus size={14} aria-hidden="true" />
                Ganti Foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFoto}
                  className="hidden"
                />
              </label>
              {fileFoto && (
                <button
                  type="button"
                  onClick={hapusFoto}
                  className="inline-flex items-center gap-1 text-xs text-peran-aksen hover:underline"
                >
                  <X size={12} aria-hidden="true" />
                  Batal ganti
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Nama toko */}
        <div>
          <label
            htmlFor="nama_toko"
            className="block text-sm font-sub mb-1 text-peran-kedua"
          >
            Nama Toko
          </label>
          <input
            id="nama_toko"
            type="text"
            value={namaToko}
            onChange={(e) => setNamaToko(e.target.value)}
            maxLength={60}
            placeholder="Toko Isan"
            className="input-field"
          />
        </div>

        {/* Deskripsi */}
        <div>
          <label
            htmlFor="deskripsi"
            className="block text-sm font-sub mb-1 text-peran-kedua"
          >
            Deskripsi Toko
          </label>
          <textarea
            id="deskripsi"
            rows={3}
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            maxLength={400}
            placeholder="Ceritakan tentang tokomu..."
            className="input-field"
          />
          <p className="text-xs text-peran-samar mt-1">
            {deskripsi.length}/400 karakter
          </p>
        </div>

        {/* Jam buka */}
        <div>
          <label
            htmlFor="jam_buka"
            className="block text-sm font-sub mb-1 text-peran-kedua"
          >
            Jam Buka
          </label>
          <input
            id="jam_buka"
            type="text"
            value={jamBuka}
            onChange={(e) => setJamBuka(e.target.value)}
            maxLength={40}
            placeholder="Senin-Jumat 07:00-14:00"
            className="input-field"
          />
        </div>

        {/* Lokasi */}
        <div>
          <label
            htmlFor="lokasi"
            className="block text-sm font-sub mb-1 text-peran-kedua"
          >
            Lokasi
          </label>
          <input
            id="lokasi"
            type="text"
            value={lokasi}
            onChange={(e) => setLokasi(e.target.value)}
            maxLength={60}
            placeholder="Kantin SMKN 1 Depok, lantai 1"
            className="input-field"
          />
        </div>

        {/* Pesan */}
        {pesan && (
          <p
            role={pesan.jenis === "err" ? "alert" : "status"}
            className={`text-sm font-body ${
              pesan.jenis === "err" ? "text-peran-aksen" : "text-peran-naik"
            }`}
          >
            {pesan.teks}
          </p>
        )}

        {/* Tombol simpan */}
        <button
          type="submit"
          disabled={menyimpan}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {menyimpan ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Save size={16} aria-hidden="true" />
          )}
          Simpan Pengaturan
        </button>
      </form>
    </div>
  );
}

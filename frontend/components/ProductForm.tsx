"use client";

// =============================================================================
// ProductForm — form tambah/edit produk ala pusat penjual Tokopedia/Shopee.
//
// SEKSI:
//   1. Foto           — multiple upload (maks 8), preview, hapus, urutkan.
//   2. Informasi dasar — nama, kategori, deskripsi.
//   3. Harga & stok   — harga jual, harga coret (diskon), stok + preview hemat.
//   4. Spesifikasi    — pasangan nama/nilai dinamis, disimpan sebagai JSON.
//   5. Info penting    — catatan penjual.
//   6. Varian          — kelompok varian (level pedas, ukuran, topping).
//   7. Preview         — ringkasan singkat sebelum simpan.
//   8. Tombol simpan   — loading + error handling.
//
// CATATAN VARIAN:
//   Saat ini belum ada endpoint CRUD varian terpisah, jadi varian dikirim
//   sebagai bagian dari field `spesifikasi` (JSON string) dengan struktur:
//     { "varian": [{ "nama": "Level Pedas", "pilihan": [...] }] }
//   TODO(nanti): pindahkan varian ke endpoint terpisah (POST /products/:id/variants,
//   dst.) begitu tabel product_variants sudah punya API manajemennya sendiri.
//   Saat itu, seksi varian di sini cukup memanggil endpoint itu dan tidak lagi
//   memboncong spesifikasi.
// =============================================================================

import { useState, useMemo, useEffect, FormEvent } from "react";
import { ImagePlus, LoaderCircle, X, Trash2, Save, Plus, GripVertical, ImageIcon, Tag, Info, Boxes, ShoppingCart, Eye } from "lucide-react";
import { api, uploadImages } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// --- tipe data -------------------------------------------------------------

/** Satu pasangan spesifikasi (mis. "Berat" = "500g"). */
interface SpecRow {
  label: string;
  nilai: string;
}

/** Satu pilihan di dalam sebuah kelompok varian. */
interface VarianPilihan {
  nilai: string;
  harga_tambahan: number;
  stok: number;
}

/** Satu kelompok varian (mis. "Level Pedas" dengan beberapa pilihan). */
interface VarianKelompok {
  nama: string;
  pilihan: VarianPilihan[];
}

export interface ProductFormProps {
  productId?: number;
  initial?: {
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    image_urls: string[];
    // Field baru (opsional supaya pemanggil lama tetap kompatibel):
    harga_asli?: number | null;
    spesifikasi?: string | null;
    info_penting?: string | null;
  };
  mode: "add" | "edit";
  onSuccess?: () => void;
}

// --- opsi kategori ----------------------------------------------------------

const CATEGORY_OPTIONS = [
  // Kategori baru (Tahap 0 rombakan). Staf unit KWU tetap memakai kategori
  // brital/laundry supaya produk unit resmi tidak tercampur dengan jualan
  // siswa. Siswa memilih di antara 4 kategori jualan bebas.
  { value: "makanan", label: "Makanan" },
  { value: "minuman", label: "Minuman" },
  { value: "jasa", label: "Jasa" },
  { value: "barang", label: "Barang" },
  { value: "brital", label: "Unit KWU - Brital (Ayam Geprek)" },
  { value: "laundry", label: "Unit KWU - Laundry" },
];

const MAX_PHOTOS = 8;

// --- util format ------------------------------------------------------------

function rupiah(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return "Rp " + n.toLocaleString("id-ID");
}

/**
 * Baca spesifikasi lama (JSON string atau objek) menjadi pasangan label/nilai.
 * Kompatibel dengan format yang ditulis form ini DAN dengan reader di halaman
 * detail (bacaSpesifikasi) yang menerima array {label,nilai} atau {nama,value}.
 */
function parseSpecRows(mentah: any): SpecRow[] {
  if (!mentah) return [];
  try {
    const d = typeof mentah === "string" ? JSON.parse(mentah) : mentah;
    if (Array.isArray(d)) {
      return d
        .filter((x) => x && typeof x === "object" && (x.label || x.nama))
        .map((x) => ({ label: String(x.label ?? x.nama ?? ""), nilai: String(x.nilai ?? x.value ?? "") }));
    }
    if (d && typeof d === "object" && !Array.isArray(d.varian)) {
      // Object biasa (bukan punya .varian) -> pasangan key/value.
      return Object.entries(d).map(([label, nilai]) => ({ label, nilai: String(nilai) }));
    }
  } catch {
    // bukan JSON -> fallback satu baris
    return [{ label: "Keterangan", nilai: String(mentah) }];
  }
  return [];
}

/**
 * Baca varian lama dari JSON spesifikasi. Struktur:
 *   { "varian": [{ "nama": "...", "pilihan": [{ "nilai": "...", "harga_tambahan": 0, "stok": 0 }] }] }
 */
function parseVarian(mentah: unknown): VarianKelompok[] {
  if (!mentah) return [];
  try {
    const d: any = typeof mentah === "string" ? JSON.parse(mentah) : mentah;
    if (d && Array.isArray(d.varian)) {
      return (d.varian as any[])
        .filter((v: any) => v && v.nama)
        .map((v: any) => ({
          nama: String(v.nama),
          pilihan: Array.isArray(v.pilihan)
            ? (v.pilihan as any[])
                .filter((p: any) => p && (p.nilai !== undefined || p.value !== undefined))
                .map((p: any) => ({
                  nilai: String(p.nilai ?? p.value ?? ""),
                  harga_tambahan: Number(p.harga_tambahan ?? 0) || 0,
                  stok: Number(p.stok ?? 0) || 0,
                }))
            : [],
        }))
        .filter((v) => v.pilihan.length > 0 || v.nama);
    }
  } catch {
    // abaikan
  }
  return [];
}

// --- komponen ===============================================================

export default function ProductForm({ productId, initial, mode, onSuccess }: ProductFormProps) {
  const { user } = useAuth();

  // Seksi 1 — foto
  const [existingImages, setExistingImages] = useState<string[]>(initial?.image_urls || []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [dragSrc, setDragSrc] = useState<number | null>(null); // index pada foto gabungan
  const [dragKind, setDragKind] = useState<"existing" | "new" | null>(null);

  // Seksi 2 — info dasar
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "makanan");
  const [description, setDescription] = useState(initial?.description || "");

  // Seksi 3 — harga & stok
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [hargaAsli, setHargaAsli] = useState(
    initial?.harga_asli ? String(initial.harga_asli) : "",
  );
  const [stock, setStock] = useState(initial?.stock ? String(initial.stock) : "");

  // Seksi 4 — spesifikasi
  const [specs, setSpecs] = useState<SpecRow[]>(() => parseSpecRows(initial?.spesifikasi));

  // Seksi 5 — info penting
  const [infoPenting, setInfoPenting] = useState(initial?.info_penting || "");

  // Seksi 6 — varian
  const [varian, setVarian] = useState<VarianKelompok[]>(() => parseVarian(initial?.spesifikasi));

  // Status
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Opsi kategori.
  //
  // Catatan: nilai opsi adalah "brital" / "laundry" (tanpa awalan "kwu_"),
  // sedangkan role user adalah "kwu_brital" / "kwu_laundry". Karena itu
  // pencocokan role harus dinormalkan — dulu perbandingan mentah membuat
  // dropdown hanya berisi satu pilihan (default "makanan").
  const roleKwu =
    user?.role === "kwu_brital"
      ? "brital"
      : user?.role === "kwu_laundry"
        ? "laundry"
        : null;

  const KATEGORI_BEBAS = ["makanan", "minuman", "jasa", "barang"];

  const categoryOptions = CATEGORY_OPTIONS.filter((opt) => {
    // Admin & CS: lihat semua kategori.
    if (user?.role === "admin" || user?.role === "cs") return true;
    // Staf KWU: bebas pilih kategori jualan (makanan/minuman/jasa/barang)
    // PLUS kategori unitnya sendiri (brital/laundry).
    if (roleKwu) return KATEGORI_BEBAS.includes(opt.value) || opt.value === roleKwu;
    // Siswa: hanya kategori jualan bebas.
    return KATEGORI_BEBAS.includes(opt.value);
  });

  const totalFoto = existingImages.length + newFiles.length;

  // Pastikan kategori terpilih selalu ada di daftar opsi untuk role ini.
  // Tanpa ini, staf KWU bisa terjebak pada nilai default "makanan" (atau nilai
  // lama yang tidak valid) sehingga dropdown tampak hanya punya satu pilihan.
  useEffect(() => {
    if (initial?.category) return; // saat edit, hormati kategori produk
    if (categoryOptions.length === 0) return;
    if (categoryOptions.some((o) => o.value === category)) return;
    // Default untuk staf KWU: kategori unitnya sendiri.
    const utamakan = roleKwu
      ? categoryOptions.find((o) => o.value === roleKwu) || categoryOptions[0]
      : categoryOptions[0];
    setCategory(utamakan.value);
  }, [categoryOptions, category, initial?.category, roleKwu]);

  // Preview hemat (diskon)
  const hargaJualNum = Number(price) || 0;
  const hargaAsliNum = Number(hargaAsli) || 0;
  const hemat = useMemo(() => {
    if (hargaAsliNum > hargaJualNum && hargaJualNum > 0) {
      const selisih = hargaAsliNum - hargaJualNum;
      const persen = Math.round((selisih / hargaAsliNum) * 100);
      return { selisih, persen };
    }
    return null;
  }, [hargaAsliNum, hargaJualNum]);

  // --- helper aksi foto -----------------------------------------------------

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files || []);
    if (incoming.length === 0) return;
    const remaining = MAX_PHOTOS - totalFoto;
    const ambil = incoming.slice(0, Math.max(0, remaining));
    if (ambil.length === 0) {
      setError(`Maksimal ${MAX_PHOTOS} foto.`);
      return;
    }
    setError("");
    setNewFiles((prev) => [...prev, ...ambil]);
    setNewPreviews((prev) => [...prev, ...ambil.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
  }

  function removeExisting(idx: number) {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function removeNew(idx: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewPreviews((prev) => {
      // lepas object URL yang dibuang
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  /**
   * Drag-to-reorder sederhana. Foto gabungan dianggap satu daftar: existing
   * dulu (index 0..n-1) lalu new (index n..). Drag hanya memindah posisi
   * di dalam kelompoknya sendiri (existing<->existing, new<->new) supaya
   * tidak ada object URL yang hilang lintas jenis.
   */
  function onDropPhoto(targetIdx: number, targetKind: "existing" | "new") {
    if (dragSrc === null || dragKind === null) return;
    if (dragKind !== targetKind) {
      setDragSrc(null);
      setDragKind(null);
      return;
    }
    if (dragSrc === targetIdx) {
      setDragSrc(null);
      setDragKind(null);
      return;
    }
    if (targetKind === "existing") {
      setExistingImages((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragSrc, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
    } else {
      const nextFiles = [...newFiles];
      const nextPreviews = [...newPreviews];
      const [mf] = nextFiles.splice(dragSrc, 1);
      const [mp] = nextPreviews.splice(dragSrc, 1);
      nextFiles.splice(targetIdx, 0, mf);
      nextPreviews.splice(targetIdx, 0, mp);
      setNewFiles(nextFiles);
      setNewPreviews(nextPreviews);
    }
    setDragSrc(null);
    setDragKind(null);
  }

  // --- helper aksi spesifikasi ---------------------------------------------

  function addSpec() {
    setSpecs((prev) => [...prev, { label: "", nilai: "" }]);
  }
  function updateSpec(i: number, field: keyof SpecRow, val: string) {
    setSpecs((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  }
  function removeSpec(i: number) {
    setSpecs((prev) => prev.filter((_, idx) => idx !== i));
  }

  // --- helper aksi varian ---------------------------------------------------

  function addVarianGroup() {
    setVarian((prev) => [...prev, { nama: "", pilihan: [{ nilai: "", harga_tambahan: 0, stok: 0 }] }]);
  }
  function updateVarianNama(g: number, nama: string) {
    setVarian((prev) => prev.map((v, i) => (i === g ? { ...v, nama } : v)));
  }
  function addVarianPilihan(g: number) {
    setVarian((prev) => prev.map((v, i) => (i === g ? { ...v, pilihan: [...v.pilihan, { nilai: "", harga_tambahan: 0, stok: 0 }] } : v)));
  }
  function updateVarianPilihan(g: number, p: number, field: keyof VarianPilihan, val: string) {
    setVarian((prev) =>
      prev.map((v, i) => {
        if (i !== g) return v;
        const pilihan = v.pilihan.map((pil, j) =>
          j === p ? { ...pil, [field]: field === "nilai" ? val : Number(val) || 0 } : pil,
        );
        return { ...v, pilihan };
      }),
    );
  }
  function removeVarianPilihan(g: number, p: number) {
    setVarian((prev) =>
      prev.map((v, i) =>
        i === g ? { ...v, pilihan: v.pilihan.filter((_, j) => j !== p) } : v,
      ),
    );
  }
  function removeVarianGroup(g: number) {
    setVarian((prev) => prev.filter((_, i) => i !== g));
  }

  // --- bangun payload -------------------------------------------------------

  /**
   * Susun JSON spesifikasi: daftar pasangan label/nilai + (opsional) varian.
   * Struktur:
   *   [ {label, nilai}, ... ]   kalau ada spec tapi tidak ada varian
   *   { varian: [...], list: [ {label,nilai}, ... ] }  kalau ada varian
   *
   * Detail page membaca ini via bacaSpesifikasi() yang menerima array
   * {label,nilai}; field `varian` diabaikan reader itu (karena bukan array
   * murni) — nanti dibaca oleh seksi varian terpisah setelah endpoint ada.
   *
   * TODO(varian): begitu endpoint varian terpisah ada, kirim varian ke sana
   * dan hapus field `varian` dari JSON spesifikasi ini.
   */
  function buildSpesifikasiJSON(): string | undefined {
    const specBersih = specs.filter((s) => s.label.trim() || s.nilai.trim());
    const varianBersih = varian
      .map((v) => ({
        nama: v.nama.trim(),
        pilihan: v.pilihan.filter((p) => p.nilai.trim() !== "").map((p) => ({
          nilai: p.nilai.trim(),
          harga_tambahan: Number(p.harga_tambahan) || 0,
          stok: Number(p.stok) || 0,
        })),
      }))
      .filter((v) => v.nama && v.pilihan.length > 0);

    const adaSpec = specBersih.length > 0;
    const adaVarian = varianBersih.length > 0;

    if (!adaSpec && !adaVarian) return undefined;

    if (adaVarian) {
      // Objek dengan dua key: list (array pasangan) + varian.
      const obj: { list: SpecRow[]; varian: typeof varianBersih } = {
        list: specBersih,
        varian: varianBersih,
      };
      return JSON.stringify(obj);
    }

    // Hanya spec -> kirim array murni (paling kompatibel dengan reader lama).
    return JSON.stringify(specBersih);
  }

  // --- submit ---------------------------------------------------------------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Validasi ringan
    const pNum = Number(price);
    const sNum = Number(stock);
    if (!name.trim()) return setError("Nama produk wajib diisi.");
    if (!Number.isFinite(pNum) || pNum <= 0) return setError("Harga jual harus angka > 0.");
    if (!Number.isFinite(sNum) || sNum < 0) return setError("Stok harus angka >= 0.");
    const haNum = hargaAsli ? Number(hargaAsli) : 0;
    if (haNum && haNum <= pNum) {
      return setError("Harga asli/coret harus lebih besar dari harga jual (supaya ada diskon).");
    }

    setSubmitting(true);
    try {
      let allImageUrls = [...existingImages];
      if (newFiles.length > 0) {
        const uploaded = await uploadImages(newFiles);
        allImageUrls = [...existingImages, ...uploaded];
      }

      const spesifikasiJSON = buildSpesifikasiJSON();

      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        price: pNum,
        stock: sNum,
        category,
        info_penting: infoPenting.trim() || undefined,
        spesifikasi: spesifikasiJSON,
        harga_asli: haNum > 0 ? haNum : undefined,
        image_urls: allImageUrls.length > 0 ? allImageUrls : undefined,
      };

      if (mode === "edit" && productId) {
        await api(`/products/${productId}`, { method: "PUT", json: payload });
      } else {
        await api("/products", { method: "POST", json: payload });
      }

      // lepas object URL preview
      newPreviews.forEach((u) => URL.revokeObjectURL(u));

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan produk.");
    } finally {
      setSubmitting(false);
    }
  }

  // --- render seksi ---------------------------------------------------------

  const fotoGabungan = [
    ...existingImages.map((src) => ({ src, kind: "existing" as const, idx: 0 /* diisi di map */ })),
    ...newPreviews.map((src) => ({ src, kind: "new" as const, idx: 0 })),
  ].map((x, i) => ({ ...x, idx: i }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ===== 1. Seksi Foto ===== */}
      <section className="card p-5 space-y-3">
        <header className="flex items-center gap-2">
          <ImageIcon size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Foto Produk</h2>
          <span className="text-xs text-peran-samar font-body ml-auto">
            {totalFoto}/{MAX_PHOTOS}
          </span>
        </header>

        <div className="grid grid-cols-3 gap-2">
          {fotoGabungan.map((f, i) => {
            const realIdx =
              f.kind === "existing"
                ? fotoGabungan.slice(0, i).filter((g) => g.kind === "existing").length
                : fotoGabungan.slice(0, i).filter((g) => g.kind === "new").length;
            const isCover = i === 0;
            return (
              <div
                key={`${f.kind}-${realIdx}`}
                draggable
                onDragStart={() => {
                  setDragSrc(realIdx);
                  setDragKind(f.kind);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropPhoto(realIdx, f.kind)}
                className="relative aspect-square rounded-badge overflow-hidden bg-peran-lembut border border-peran-garis cursor-move group"
              >
                <img src={f.src} alt={isCover ? "Sampul" : "Gambar"} decoding="async" className="h-full w-full object-cover" />
                {isCover && (
                  <span className="absolute bottom-1 left-1 bg-peran-aksi text-peran-terang text-[10px] font-sub px-1.5 py-0.5 rounded-badge">
                    Sampul
                  </span>
                )}
                <span className="absolute top-1 left-1 text-peran-samar opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical size={14} aria-hidden="true" />
                </span>
                <button
                  type="button"
                  onClick={() => (f.kind === "existing" ? removeExisting(realIdx) : removeNew(realIdx))}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                  aria-label={`Hapus foto ${i + 1}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}

          {totalFoto < MAX_PHOTOS && (
            <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-peran-garis-tegas rounded-badge aspect-square cursor-pointer bg-peran-sorot hover:bg-peran-lembut transition-colors">
              <ImagePlus size={22} className="text-peran-aksi" aria-hidden="true" />
              <span className="text-[10px] text-peran-kedua font-body text-center px-1">Tambah foto</span>
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
        <p className="text-xs text-peran-samar font-body">
          Maksimal {MAX_PHOTOS} foto, 5MB/foto. Seret foto untuk mengatur urutan — foto pertama jadi sampul.
        </p>
      </section>

      {/* ===== 2. Seksi Informasi Dasar ===== */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <Tag size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Informasi Dasar</h2>
        </header>

        <div>
          <label htmlFor="name" className="block text-sm font-sub mb-1 text-peran-kedua">
            Nama produk
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="Mis. Ayam Geprek Sambal Mata"
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-sub mb-1 text-peran-kedua">
            Kategori
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field"
          >
            {categoryOptions.length === 0 ? (
              <option value={category}>{category}</option>
            ) : (
              categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-sub mb-1 text-peran-kedua">
            Deskripsi
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
            placeholder="Ceritakan produk Anda — bahan, rasa, cara pesan, dll."
          />
        </div>
      </section>

      {/* ===== 3. Seksi Harga & Stok ===== */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Harga &amp; Stok</h2>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="price" className="block text-sm font-sub mb-1 text-peran-kedua">
              Harga jual (Rp)
            </label>
            <input
              id="price"
              type="number"
              min={0}
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input-field"
              placeholder="15000"
            />
          </div>
          <div>
            <label htmlFor="stock" className="block text-sm font-sub mb-1 text-peran-kedua">
              Stok
            </label>
            <input
              id="stock"
              type="number"
              min={0}
              required
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="input-field"
              placeholder="20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="harga_asli" className="block text-sm font-sub mb-1 text-peran-kedua">
            Harga asli / coret (opsional)
          </label>
          <input
            id="harga_asli"
            type="number"
            min={0}
            value={hargaAsli}
            onChange={(e) => setHargaAsli(e.target.value)}
            className="input-field"
            placeholder="20000 — tampil sebagai harga dicoret"
          />
          <p className="text-xs text-peran-samar font-body mt-1">
            Isi jika ada diskon. Harus lebih besar dari harga jual.
          </p>
        </div>

        {/* Preview diskon */}
        {hemat && (
          <div className="flex items-center gap-2 bg-peran-naik-lembut text-peran-naik rounded-input px-3 py-2 text-sm font-body">
            <Tag size={14} aria-hidden="true" />
            <span>
              Pembeli hemat <strong>{rupiah(hemat.selisih)}</strong> ({hemat.persen}%)
            </span>
          </div>
        )}
      </section>

      {/* ===== 4. Seksi Spesifikasi ===== */}
      <section className="card p-5 space-y-3">
        <header className="flex items-center gap-2">
          <Boxes size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Spesifikasi</h2>
        </header>

        {specs.length === 0 && (
          <p className="text-sm text-peran-samar font-body">
            Belum ada spesifikasi. Tambahkan mis. “Berat” = “500g”.
          </p>
        )}

        <div className="space-y-2">
          {specs.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={s.label}
                onChange={(e) => updateSpec(i, "label", e.target.value)}
                className="input-field"
                placeholder="Nama (mis. Berat)"
              />
              <input
                value={s.nilai}
                onChange={(e) => updateSpec(i, "nilai", e.target.value)}
                className="input-field"
                placeholder="Nilai (mis. 500g)"
              />
              <button
                type="button"
                onClick={() => removeSpec(i)}
                className="text-peran-turun hover:bg-peran-turun-lembut rounded-full p-2"
                aria-label={`Hapus spesifikasi ${i + 1}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSpec}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus size={14} aria-hidden="true" /> Tambah Spesifikasi
        </button>
      </section>

      {/* ===== 5. Seksi Info Penting ===== */}
      <section className="card p-5 space-y-3">
        <header className="flex items-center gap-2">
          <Info size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Info Penting</h2>
        </header>
        <textarea
          rows={3}
          value={infoPenting}
          onChange={(e) => setInfoPenting(e.target.value)}
          className="input-field"
          placeholder="Catatan penting dari penjual. Mis. “Dimasak saat pesanan, habis jam 3 sore.”"
        />
        <p className="text-xs text-peran-samar font-body">
          Tampil menonjol di detail produk supaya pembeli tidak melewatkan.
        </p>
      </section>

      {/* ===== 6. Seksi Varian ===== */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <Boxes size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Varian Produk</h2>
          <span className="text-xs text-peran-samar font-body ml-auto">opsional</span>
        </header>
        <p className="text-xs text-peran-samar font-body -mt-2">
          Mis. “Level Pedas” dengan pilihan 1–5, atau “Ukuran” S/M/L.
          {" "}
          {/* TODO(varian): saat ini varian ikut disimpan di field spesifikasi.
              Nanti dipindah ke endpoint CRUD varian terpisah. */}
          Saat ini varian disimpan bersama spesifikasi.
        </p>

        {varian.length === 0 && (
          <p className="text-sm text-peran-samar font-body">
            Belum ada kelompok varian.
          </p>
        )}

        <div className="space-y-4">
          {varian.map((g, gi) => (
            <div key={gi} className="border border-peran-garis rounded-input p-3 space-y-3 bg-peran-sorot/40">
              <div className="flex items-center gap-2">
                <input
                  value={g.nama}
                  onChange={(e) => updateVarianNama(gi, e.target.value)}
                  className="input-field"
                  placeholder="Nama kelompok (mis. Level Pedas)"
                />
                <button
                  type="button"
                  onClick={() => removeVarianGroup(gi)}
                  className="text-peran-turun hover:bg-peran-turun-lembut rounded-full p-2"
                  aria-label={`Hapus kelompok varian ${gi + 1}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-2">
                {g.pilihan.map((p, pi) => (
                  <div key={pi} className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center">
                    <input
                      value={p.nilai}
                      onChange={(e) => updateVarianPilihan(gi, pi, "nilai", e.target.value)}
                      className="input-field"
                      placeholder="Pilihan (mis. 1)"
                    />
                    <input
                      type="number"
                      min={0}
                      value={p.harga_tambahan || ""}
                      onChange={(e) => updateVarianPilihan(gi, pi, "harga_tambahan", e.target.value)}
                      className="input-field"
                      placeholder="+ Harga"
                      title="Tambahan harga (Rp)"
                    />
                    <input
                      type="number"
                      min={0}
                      value={p.stok || ""}
                      onChange={(e) => updateVarianPilihan(gi, pi, "stok", e.target.value)}
                      className="input-field"
                      placeholder="Stok"
                      title="Stok pilihan"
                    />
                    <button
                      type="button"
                      onClick={() => removeVarianPilihan(gi, pi)}
                      className="text-peran-turun hover:bg-peran-turun-lembut rounded-full p-2"
                      aria-label={`Hapus pilihan ${pi + 1}`}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addVarianPilihan(gi)}
                className="text-sm text-peran-aksi hover:underline flex items-center gap-1"
              >
                <Plus size={14} aria-hidden="true" /> Tambah pilihan
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addVarianGroup}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus size={14} aria-hidden="true" /> Tambah Kelompok Varian
        </button>
      </section>

      {/* ===== 7. Seksi Preview ===== */}
      <section className="card p-5 space-y-3">
        <header className="flex items-center gap-2">
          <Eye size={18} className="text-peran-aksi" aria-hidden="true" />
          <h2 className="font-sub font-medium text-peran-utama">Preview</h2>
        </header>
        <div className="flex gap-3">
          <div className="w-20 h-20 rounded-badge overflow-hidden bg-peran-lembut border border-peran-garis flex-shrink-0">
            {fotoGabungan[0] ? (
              <img src={fotoGabungan[0].src} alt="Sampul" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={20} className="text-peran-samar" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-sub font-medium text-peran-utama truncate">
              {name || "Nama produk…"}
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-peran-aksi font-sub font-medium">
                {rupiah(hargaJualNum)}
              </span>
              {hemat && (
                <span className="text-xs text-peran-samar line-through">
                  {rupiah(hargaAsliNum)}
                </span>
              )}
            </div>
            <p className="text-xs text-peran-samar font-body mt-1">
              Stok: {Number(stock) || 0} · Kategori: {category}
              {specs.length > 0 && ` · ${specs.length} spesifikasi`}
              {varian.length > 0 && ` · ${varian.length} varian`}
            </p>
          </div>
        </div>
      </section>

      {/* ===== 8. Tombol Simpan ===== */}
      {error && (
        <p role="alert" className="text-sm text-peran-turun font-body bg-peran-turun-lembut rounded-input px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {submitting ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Save size={16} aria-hidden="true" />
        )}
        {mode === "edit" ? "Simpan Perubahan" : "Simpan Produk"}
      </button>
    </form>
  );
}

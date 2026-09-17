"use client";

/**
 * Halaman Detail Produk - versi LENGKAP ala Tokopedia (Tahap 2).
 *
 * Susunan (dari hasil bedah langsung halaman Tokopedia):
 *   1.  Jejak navigasi (Beranda / Kategori / Nama produk)
 *   2.  Galeri foto (foto kecil + foto besar, titik penunjuk di HP)
 *   3.  Panel kanan: judul · terjual · rating · harga · diskon
 *   4.  Varian (dipilih pembeli, ditambah penjual dari dashboard)
 *   5.  Pengatur jumlah + catatan untuk penjual
 *   6.  Tombol: + Keranjang · Beli Langsung · Chat · Simpan · Bagikan
 *   7.  Kotak toko: nama · rating · jumlah produk · Ikuti · Lihat Semua
 *   8.  Tab: Detail Produk | Spesifikasi | Info Penting
 *   9.  Grafik ulasan 5★..1★
 *   10. Daftar ulasan (foto pembeli + balasan penjual + tombol Membantu)
 *   11. Produk lain dari toko ini
 *   12. Produk serupa (kategori sama)
 *   13. Laporkan produk
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import GaleriFoto from "@/components/GaleriFoto";
import GrafikUlasan, { Bintang, type RingkasUlasan } from "@/components/GrafikUlasan";
import GridProduk from "@/components/GridProduk";
import PemilihVarian, { type KelompokVarian } from "@/components/PemilihVarian";
import PengaturJumlah from "@/components/PengaturJumlah";
import Badge from "@/components/Badge";
import Tab, { type ItemTab } from "@/components/Tab";
import type { ProdukKartu } from "@/components/KartuProduk";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { kirimPesan } from "@/lib/chat-utils";

type Ulasan = {
  id: number;
  score: number;
  comment: string | null;
  created_at: string;
  buyer_name: string;
  buyer_photo: string | null;
  balasan_penjual: string | null;
  jumlah_membantu: number;
  foto: string[];
};

const NAMA_KATEGORI: Record<string, string> = {
  brital: "Brital",
  laundry: "Laundry",
  minuman: "Minuman",
  makanan: "Makanan",
  jasa: "Jasa",
  kwu_brital: "Brital",
  siswa: "Jualan Siswa",
};

function rupiah(n: number) {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

/** Ubah tanggal ISO jadi "3 hari lalu" - lebih ramah daripada tanggal mentah. */
function waktuLalu(iso: string) {
  const t = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso.replace(" ", "T") + "Z");
  const detik = Math.floor((Date.now() - t.getTime()) / 1000);
  if (detik < 60) return "baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  if (detik < 2592000) return `${Math.floor(detik / 86400)} hari lalu`;
  return t.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Baca spesifikasi yang disimpan sebagai JSON atau teks bebas. */
function bacaSpesifikasi(mentah: any): { label: string; nilai: string }[] {
  if (!mentah) return [];
  try {
    const d = typeof mentah === "string" ? JSON.parse(mentah) : mentah;
    if (Array.isArray(d)) {
      return d
        .filter((x) => x && (x.label || x.nama))
        .map((x) => ({ label: String(x.label ?? x.nama), nilai: String(x.nilai ?? x.value ?? "") }));
    }
    if (d && typeof d === "object") {
      return Object.entries(d).map(([label, nilai]) => ({ label, nilai: String(nilai) }));
    }
  } catch {
    // Bukan JSON -> tampilkan sebagai satu baris teks.
  }
  return [{ label: "Keterangan", nilai: String(mentah) }];
}

export default function DetailProdukPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");
  const { user } = useAuth();
  const { tambah } = useCart();

  const [data, setData] = useState<any>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [tab, setTab] = useState("detail");
  const [jumlah, setJumlah] = useState(1);
  const [catatan, setCatatan] = useState("");
  const [varianTerpilih, setVarianTerpilih] = useState<Record<string, number | null>>({});
  const [disimpan, setDisimpan] = useState(false);
  const [diikuti, setDiikuti] = useState(false);
  const [sedang, setSedang] = useState<string | null>(null);
  const [pesan, setPesan] = useState("");
  const [salin, setSalin] = useState(false);
  const [tokoLain, setTokoLain] = useState<ProdukKartu[]>([]);
  const [serupa, setSerupa] = useState<ProdukKartu[]>([]);

  // ---------------- Ambil data ----------------
  useEffect(() => {
    if (!id) return;
    let batal = false;
    setMemuat(true);
    setGalat("");

    api(`/products/${id}`)
      .then((d: any) => {
        if (batal) return;
        setData(d);
        setDisimpan(Boolean(d.disimpan));
        setDiikuti(Boolean(d.diikuti));
        setJumlah(1);
        setVarianTerpilih({});

        const kat = d?.product?.category;
        const sellerId = d?.product?.seller_id;

        // Produk lain dari toko yang sama
        if (sellerId) {
          api(`/products?seller_id=${sellerId}&limit=6`)
            .then((r: any) => {
              if (batal) return;
              setTokoLain(
                (r.products || []).filter((p: any) => String(p.id) !== String(id)).slice(0, 6)
              );
            })
            .catch(() => {});
        }

        // Produk serupa (kategori sama)
        if (kat) {
          api(`/products?category=${kat}&limit=7`)
            .then((r: any) => {
              if (batal) return;
              setSerupa(
                (r.products || []).filter((p: any) => String(p.id) !== String(id)).slice(0, 6)
              );
            })
            .catch(() => {});
        }
      })
      .catch((e: any) => {
        if (batal) return;
        setGalat(e?.message || "Produk tidak ditemukan.");
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });

    return () => {
      batal = true;
    };
  }, [id]);

  const produk = data?.product;
  const varian: KelompokVarian[] = data?.variants || [];
  const ringkas: RingkasUlasan = data?.rating_ringkas || {
    rata_rata: 0,
    total: 0,
    per_bintang: {},
  };
  const ulasan: Ulasan[] = data?.ratings || [];
  const toko = data?.toko || {};

  const milikSendiri = user && produk && Number((user as any).id) === Number(produk.seller_id);
  const stok = Number(produk?.stock ?? 0);
  const tutup = produk?.seller_shop_open === 0;

  // Produk UNIT KWU (brital/laundry): dibeli lewat keranjang/beli langsung, dan
  // chat-nya masuk ke ruang unit (bukan ke pribadi staf yang membuat produk).
  // Produk siswa (makanan/minuman/jasa/barang) tetap pakai chat 1:1 ke penjual.
  const unitSlugProduk =
    produk?.unit_slug ||
    (produk?.category === "brital" || produk?.category === "kwu_brital"
      ? "kwu_brital"
      : produk?.category === "laundry" || produk?.category === "kwu_laundry"
        ? "kwu_laundry"
        : null);
  const isProdukUnit = Boolean(unitSlugProduk);

  const diskon = useMemo(() => {
    if (!produk?.harga_asli || produk.harga_asli <= produk.price) return 0;
    return Math.round(((produk.harga_asli - produk.price) / produk.harga_asli) * 100);
  }, [produk]);

  /** Harga akhir = harga dasar + tambahan varian yang dipilih. */
  const hargaAkhir = useMemo(() => {
    if (!produk) return 0;
    let t = Number(produk.price);
    for (const k of varian) {
      const pid = varianTerpilih[k.nama];
      const p = k.pilihan.find((x) => x.id === pid);
      if (p) t += p.harga_tambahan;
    }
    return t;
  }, [produk, varian, varianTerpilih]);

  const varianLengkap = varian.every((k) => varianTerpilih[k.nama]);

  const spesifikasi = useMemo(() => bacaSpesifikasi(data?.spesifikasi), [data?.spesifikasi]);

  // ---------------- Aksi ----------------
  const simpan = useCallback(async () => {
    if (!user) return router.push("/login");
    setSedang("simpan");
    try {
      if (disimpan) {
        await api(`/wishlist/${id}`, { method: "DELETE" });
        setDisimpan(false);
      } else {
        await api(`/wishlist/${id}`, { method: "POST" });
        setDisimpan(true);
      }
    } catch (e: any) {
      setPesan(e?.message || "Gagal menyimpan.");
    } finally {
      setSedang(null);
    }
  }, [user, disimpan, id, router]);

  const ikuti = useCallback(async () => {
    if (!user) return router.push("/login");
    if (!produk) return;
    setSedang("ikuti");
    try {
      if (diikuti) {
        await api(`/follow/${produk.seller_id}`, { method: "DELETE" });
        setDiikuti(false);
      } else {
        await api(`/follow/${produk.seller_id}`, { method: "POST" });
        setDiikuti(true);
      }
    } catch (e: any) {
      setPesan(e?.message || "Gagal mengikuti toko.");
    } finally {
      setSedang(null);
    }
  }, [user, diikuti, produk, router]);

  async function tambahKeranjang() {
    if (!user) return router.push("/login");
    if (!varianLengkap) {
      setPesan("Pilih dulu semua varian produk.");
      return;
    }
    setSedang("keranjang");
    setPesan("");
    try {
      const vTerpilih = varian
        .map((k) => {
          const p = k.pilihan.find((x) => x.id === varianTerpilih[k.nama]);
          return p ? `${k.nama}: ${p.nilai}` : null;
        })
        .filter(Boolean)
        .join(", ");

      await tambah({
        productId: Number(id),
        quantity: jumlah,
        note: [vTerpilih ? `Varian - ${vTerpilih}` : "", catatan].filter(Boolean).join(" | "),
      } as any);
      setPesan("Ditambahkan ke keranjang.");
    } catch (e: any) {
      setPesan(e?.message || "Gagal menambah ke keranjang.");
    } finally {
      setSedang(null);
    }
  }

  async function beliLangsung() {
    if (!user) return router.push("/login");
    if (!varianLengkap) {
      setPesan("Pilih dulu semua varian produk.");
      return;
    }
    await tambahKeranjang();
    router.push("/cart");
  }

  async function chatPenjual() {
    if (!user) return router.push("/login");
    setSedang("chat");
    try {
      // Produk KWU (brital/laundry) HARUS masuk ke chat unit KWU, bukan chat
      // pribadi staf yang membuat produk — supaya siapa pun staf unit yang
      // berjaga bisa membalas. Produk siswa tetap chat 1:1 ke penjual.
      const body = unitSlugProduk
        ? { unit_slug: unitSlugProduk, product_id: Number(id) }
        : { seller_id: produk.seller_id, product_id: Number(id) };
      const d = await api<{ chat: { id: string } }>("/chats", {
        method: "POST",
        json: body,
      });
      router.push(`/chat/${d.chat.id}`);
    } catch (e: any) {
      setPesan(e?.message || "Gagal membuka chat.");
    } finally {
      setSedang(null);
    }
  }

  async function hubungiUntukPesan() {
    if (!user) return router.push("/login");
    setSedang("chat");
    try {
      const body = unitSlugProduk
        ? { unit_slug: unitSlugProduk, product_id: Number(id) }
        : { seller_id: produk.seller_id, product_id: Number(id) };
      const d = await api<{ chat: { id: string } }>("/chats", {
        method: "POST",
        json: body,
      });
      const baris = [
        `Halo, saya mau pesan *${produk.name}*`,
        varianLengkap
          ? "Varian - " +
            varian
              .map((k) => {
                const p = k.pilihan.find((x) => x.id === varianTerpilih[k.nama]);
                return p ? `${k.nama}: ${p.nilai}` : "";
              })
              .filter(Boolean)
              .join(", ")
          : "",
        `Jumlah: ${jumlah}`,
        catatan ? `Catatan: ${catatan}` : "",
      ].filter(Boolean);
      await kirimPesan(d.chat.id, baris.join("\n"));
      router.push(`/chat/${d.chat.id}`);
    } catch (e: any) {
      setPesan(e?.message || "Gagal mengirim pesan.");
    } finally {
      setSedang(null);
    }
  }

  async function bagikan() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: produk?.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSalin(true);
      setTimeout(() => setSalin(false), 2000);
    } catch {
      // Pengguna membatalkan - bukan kesalahan.
    }
  }

  // ---------------- Tampilan keadaan khusus ----------------
  if (memuat) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-page px-4 py-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="aspect-square w-full animate-pulse rounded-card bg-peran-lembut" />
            <div className="space-y-3">
              <div className="h-6 w-3/4 animate-pulse rounded bg-peran-lembut" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-peran-lembut" />
              <div className="h-9 w-2/5 animate-pulse rounded bg-peran-lembut" />
              <div className="h-24 w-full animate-pulse rounded-card bg-peran-lembut" />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (galat || !produk) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-page px-4 py-16">
          <div className="mx-auto max-w-md rounded-card border border-peran-garis bg-peran-kartu p-8 text-center">
            <h1 className="text-lg font-bold text-peran-utama">Produk tidak ditemukan</h1>
            <p className="mt-2 text-sm text-peran-kedua">
              {galat || "Produk ini mungkin sudah dihapus atau tidak aktif."}
            </p>
            <Link
              href="/marketplace"
              className="mt-4 inline-block rounded-full bg-peran-aksi px-5 py-2.5 text-sm font-semibold text-peran-terang"
            >
              Kembali ke Marketplace
            </Link>
          </div>
        </main>
      </>
    );
  }

  const tabDaftar: ItemTab[] = [
    { id: "detail", label: "Detail Produk" },
    { id: "spesifikasi", label: "Spesifikasi" },
    { id: "info", label: "Info Penting" },
    { id: "ulasan", label: "Ulasan", hitung: ringkas.total },
  ];

  // Nama penjual yang ditampilkan. Untuk produk UNIT KWU, WAJIB nama unit —
  // jangan pakai nama_toko pribadi staf (mis. "Toko Andi") karena produk unit
  // bukan milik orang tertentu. Produk siswa tetap pakai nama toko pribadinya.
  const namaToko = isProdukUnit
    ? produk.seller_name || (unitSlugProduk === "kwu_brital" ? "Ayam Geprek Brital" : "KWU Laundry")
    : toko?.nama_toko || produk.seller_name;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-page px-4 pb-24 pt-5 md:pb-10">
        {/* ---------- 1. Jejak navigasi ---------- */}
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-peran-kedua" aria-label="Jejak navigasi">
          <Link href="/home" className="hover:text-peran-aksi">Beranda</Link>
          <span className="text-peran-samar">/</span>
          <Link href={`/marketplace?kategori=${produk.category}`} className="hover:text-peran-aksi">
            {NAMA_KATEGORI[produk.category] || produk.category}
          </Link>
          <span className="text-peran-samar">/</span>
          <span className="max-w-[16rem] truncate font-semibold text-peran-utama">{produk.name}</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* ---------- 2. Galeri ---------- */}
          <GaleriFoto
            daftar={produk.images || []}
            nama={produk.name}
            penanda={
              diskon > 0
                ? { teks: `-${diskon}%`, warna: "diskon" }
                : produk.stok <= 0
                  ? { teks: "Stok Habis", warna: "aksen" }
                  : null
            }
          />

          {/* ---------- 3. Panel kanan ---------- */}
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {produk.category === "brital" || produk.category === "laundry" ? (
                <Badge anak="Unit Resmi" warna="resmi" ukuran="kecil" />
              ) : (
                <Badge anak={NAMA_KATEGORI[produk.category] || produk.category} warna="netral" ukuran="kecil" />
              )}
              {produk.terjual > 0 && (
                <span className="text-xs text-peran-kedua">{produk.terjual}+ terjual</span>
              )}
              {tutup && <Badge anak="Toko Tutup" warna="turun" ukuran="kecil" />}
            </div>

            <h1 className="text-xl font-bold leading-snug tracking-heading text-peran-utama md:text-2xl">
              {produk.name}
            </h1>

            <div className="mt-2 flex items-center gap-2 text-sm text-peran-kedua">
              {ringkas.total > 0 ? (
                <>
                  <Bintang nilai={ringkas.rata_rata} />
                  <span className="font-semibold text-peran-utama">{ringkas.rata_rata.toFixed(1)}</span>
                  <span className="text-peran-samar">·</span>
                  <button
                    type="button"
                    onClick={() => setTab("ulasan")}
                    className="hover:text-peran-aksi hover:underline"
                  >
                    {ringkas.total} ulasan
                  </button>
                </>
              ) : (
                <span className="text-peran-samar">Belum ada ulasan</span>
              )}
            </div>

            {/* Harga */}
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold text-peran-utama md:text-3xl">
                {rupiah(hargaAkhir)}
              </span>
              {diskon > 0 && produk.harga_asli && (
                <>
                  <span className="text-sm text-peran-samar line-through">
                    {rupiah(produk.harga_asli)}
                  </span>
                  <Badge anak={`-${diskon}%`} warna="diskon" ukuran="kecil" />
                </>
              )}
            </div>

            {/* Stok */}
            <p className="mt-1.5 text-sm text-peran-kedua">
              Stok:{" "}
              <span className={stok > 0 ? "font-semibold text-peran-utama" : "font-semibold text-peran-turun"}>
                {stok}
              </span>
              {stok > 0 && stok <= 5 && (
                <span className="ml-2 text-xs font-semibold text-peran-peringatan">
                  Hampir habis
                </span>
              )}
            </p>

            {/* ---------- 4. Varian ---------- */}
            {varian.length > 0 && (
              <div className="mt-4 border-t border-peran-garis pt-4">
                <PemilihVarian
                  daftar={varian}
                  terpilih={varianTerpilih}
                  saatPilih={(nama, idp) =>
                    setVarianTerpilih((lama) => ({ ...lama, [nama]: idp }))
                  }
                />
              </div>
            )}

            {/* ---------- 5. Jumlah + catatan ---------- */}
            {!milikSendiri && (
              <div className="mt-4 space-y-3 border-t border-peran-garis pt-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-peran-utama">Jumlah</span>
                  <PengaturJumlah
                    nilai={jumlah}
                    saatUbah={setJumlah}
                    maks={Math.max(1, stok)}
                    nonaktif={stok <= 0 || tutup}
                  />
                </div>

                <div>
                  <label htmlFor="catatan" className="mb-1 block text-sm font-semibold text-peran-utama">
                    Catatan untuk penjual <span className="font-normal text-peran-samar">(opsional)</span>
                  </label>
                  <textarea
                    id="catatan"
                    rows={2}
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Misal: tanpa sambal, tambah kerupuk, dll"
                    className="w-full rounded-input border border-peran-garis bg-peran-kartu px-3 py-2 text-sm text-peran-utama placeholder:text-peran-samar focus:border-peran-aksi focus:outline-none"
                  />
                </div>
              </div>
            )}

            {pesan && (
              <p role="status" className="mt-3 rounded-input bg-peran-aksi-lembut px-3 py-2 text-sm text-peran-aksi">
                {pesan}
              </p>
            )}

            {/* ---------- 6. Tombol aksi ---------- */}
            {!milikSendiri ? (
              <div className="mt-4 space-y-2">
                {isProdukUnit ? (
                  // Produk unit KWU (brital/laundry): bisa langsung dibeli
                  // lewat keranjang / beli langsung.
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={beliLangsung}
                      disabled={sedang !== null || stok <= 0 || tutup}
                      className="flex-1 rounded-full bg-peran-aksi px-5 py-3 text-sm font-semibold text-peran-terang transition-colors hover:bg-peran-aksi-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Beli Langsung
                    </button>
                    <button
                      type="button"
                      onClick={tambahKeranjang}
                      disabled={sedang !== null || stok <= 0 || tutup}
                      className="rounded-full border border-peran-aksi px-5 py-3 text-sm font-semibold text-peran-aksi transition-colors hover:bg-peran-aksi-lembut disabled:opacity-50"
                    >
                      {sedang === "keranjang" ? "Menambah..." : "+ Keranjang"}
                    </button>
                  </div>
                ) : (
                  // Jualan siswa (makanan/minuman/jasa/barang): hubungi dulu
                  // supaya penjual bisa memastikan stok & waktu. Keranjang tidak
                  // berlaku untuk produk siswa.
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={hubungiUntukPesan}
                      disabled={sedang !== null || stok <= 0 || tutup}
                      className="flex-1 rounded-full bg-peran-aksi px-5 py-3 text-sm font-semibold text-peran-terang transition-colors hover:bg-peran-aksi-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sedang === "chat" ? "Membuka chat..." : "Hubungi untuk Pesan"}
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={chatPenjual}
                    disabled={sedang === "chat"}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-peran-garis-tegas px-4 py-2.5 text-sm font-semibold text-peran-utama transition-colors hover:bg-peran-sorot"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.5 9.5 0 01-2.9-.4L4 21l1.4-4.2A8.4 8.4 0 013 11.5 8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" />
                    </svg>
                    Chat
                  </button>

                  <button
                    type="button"
                    onClick={simpan}
                    aria-pressed={disimpan}
                    className={[
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                      disimpan
                        ? "border-peran-aksen bg-peran-aksen-lembut text-peran-aksen"
                        : "border-peran-garis-tegas text-peran-utama hover:bg-peran-sorot",
                    ].join(" ")}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill={disimpan ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 21s-7.5-4.6-9.6-9A5.7 5.7 0 0 1 12 5.6 5.7 5.7 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z" />
                    </svg>
                    {disimpan ? "Tersimpan" : "Simpan"}
                  </button>

                  <button
                    type="button"
                    onClick={bagikan}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-peran-garis-tegas px-4 py-2.5 text-sm font-semibold text-peran-utama transition-colors hover:bg-peran-sorot"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                    </svg>
                    {salin ? "Tersalin" : "Bagikan"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2 rounded-card border border-peran-garis bg-peran-lembut p-4">
                <p className="text-sm text-peran-kedua">Ini produk milikmu.</p>
                <Link
                  href={`/product/edit/${produk.id}`}
                  className="inline-block rounded-full bg-peran-aksi px-5 py-2.5 text-sm font-semibold text-peran-terang"
                >
                  Ubah Produk
                </Link>
              </div>
            )}

            {/* ---------- 7. Kotak toko ---------- */}
            <div className="mt-5 rounded-card border border-peran-garis bg-peran-kartu p-4">
              <div className="flex items-start gap-3">
                {isProdukUnit ? (
                  // Produk unit KWU: pakai lencana unit, bukan foto profil staf
                  // (staf bergantian tiap shift, produk bukan milik pribadi).
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
                    {unitSlugProduk === "kwu_brital" ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 10h16l-1.2 10H5.2L4 10Z" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="4" y="3" width="16" height="18" rx="2" />
                        <circle cx="12" cy="13" r="4" />
                        <path d="M7 6h2" />
                      </svg>
                    )}
                  </span>
                ) : toko?.foto_url || produk.seller_photo ? (
                  <img
                    src={toko?.foto_url || produk.seller_photo}
                    alt={namaToko}
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-peran-aksi-lembut text-peran-aksi">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18" />
                      <path d="M9 13h6" />
                    </svg>
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-bold text-peran-utama">{namaToko}</h2>
                  {isProdukUnit && (
                    <p className="text-[11px] font-sub font-semibold uppercase tracking-wide text-peran-aksi">
                      Unit Resmi Sekolah
                    </p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-peran-kedua">
                    {toko?.rating_toko?.rata ? (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <Bintang nilai={Number(toko.rating_toko.rata)} ukuran={12} />
                          <span className="font-semibold text-peran-utama">
                            {Number(toko.rating_toko.rata).toFixed(1)}
                          </span>
                        </span>
                        <span className="text-peran-samar">·</span>
                      </>
                    ) : null}
                    <span>{toko?.jumlah_produk ?? 0} produk</span>
                    <span className="text-peran-samar">·</span>
                    <span>{toko?.jumlah_pengikut ?? 0} pengikut</span>
                    {toko?.lokasi && (
                      <>
                        <span className="text-peran-samar">·</span>
                        <span>{toko.lokasi}</span>
                      </>
                    )}
                  </div>
                  {toko?.deskripsi && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-peran-kedua">{toko.deskripsi}</p>
                  )}
                  {toko?.jam_buka && (
                    <p className="mt-1 text-xs text-peran-samar">Buka: {toko.jam_buka}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                {!milikSendiri && (
                  <button
                    type="button"
                    onClick={ikuti}
                    disabled={sedang === "ikuti"}
                    className={[
                      "flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                      diikuti
                        ? "border-peran-aksi bg-peran-aksi-lembut text-peran-aksi"
                        : "border-peran-garis-tegas text-peran-utama hover:bg-peran-sorot",
                    ].join(" ")}
                  >
                    {diikuti ? "Mengikuti" : "Ikuti Toko"}
                  </button>
                )}
                <Link
                  href={isProdukUnit ? `/unit/${unitSlugProduk}` : `/profile/${produk.seller_id}`}
                  className="flex-1 rounded-full border border-peran-garis-tegas px-4 py-2 text-center text-sm font-semibold text-peran-utama transition-colors hover:bg-peran-sorot"
                >
                  {isProdukUnit ? "Lihat Unit" : "Lihat Toko"}
                </Link>
              </div>
            </div>

            {/* ---------- 13. Laporkan ---------- */}
            <div className="mt-3 text-right">
              <Link
                href={`/cs/chat?laporkan=${produk.id}`}
                className="inline-flex items-center gap-1.5 text-xs text-peran-kedua hover:text-peran-turun"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 15V4a1 1 0 011-1h11l-2 4 2 4H5" />
                  <path d="M4 21v-6" />
                </svg>
                Laporkan produk ini
              </Link>
            </div>
          </div>
        </div>

        {/* ---------- 8-10. Tab, spesifikasi, ulasan ---------- */}
        <div className="mt-8">
          <Tab daftar={tabDaftar} nilai={tab} saatGanti={setTab} />

          <div className="mt-5 space-y-5">
            {tab === "detail" && (
              <section className="rounded-card border border-peran-garis bg-peran-kartu p-4">
                <h2 className="mb-2 text-sm font-bold text-peran-utama">Deskripsi Produk</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-peran-kedua">
                  {produk.description?.trim() || "Penjual belum menuliskan deskripsi produk ini."}
                </p>
                {produk.category === "brital" && (
                  <p className="mt-3 rounded-input bg-peran-lembut px-3 py-2 text-xs text-peran-kedua">
                    Pesanan Brital diambil di kantin Brital setelah status pesanan berubah
                    menjadi &ldquo;Siap Diambil&rdquo;.
                  </p>
                )}
                {produk.category === "laundry" && (
                  <p className="mt-3 rounded-input bg-peran-lembut px-3 py-2 text-xs text-peran-kedua">
                    Layanan laundry: antar pakaian ke pos laundry, lalu pantau statusnya di
                    halaman Pesanan.
                  </p>
                )}
                {produk.category === "jasa" && (
                  <p className="mt-3 rounded-input bg-peran-lembut px-3 py-2 text-xs text-peran-kedua">
                    Produk jasa: hubungi penjual lebih dulu untuk menyepakati waktu dan hasil
                    pekerjaan sebelum memesan.
                  </p>
                )}
              </section>
            )}

            {tab === "spesifikasi" && (
              <section className="rounded-card border border-peran-garis bg-peran-kartu p-4">
                <h2 className="mb-3 text-sm font-bold text-peran-utama">Spesifikasi</h2>
                {spesifikasi.length > 0 ? (
                  <dl className="divide-y divide-peran-garis">
                    {spesifikasi.map((s, i) => (
                      <div key={i} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="text-sm text-peran-kedua">{s.label}</dt>
                        <dd className="break-words text-sm font-medium text-peran-utama">{s.nilai}</dd>
                      </div>
                    ))}
                    {/* Spesifikasi otomatis dari data produk - selalu ada. */}
                    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5">
                      <dt className="text-sm text-peran-kedua">Kategori</dt>
                      <dd className="text-sm font-medium text-peran-utama">
                        {NAMA_KATEGORI[produk.category] || produk.category}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5">
                      <dt className="text-sm text-peran-kedua">Stok</dt>
                      <dd className="text-sm font-medium text-peran-utama">{produk.stock}</dd>
                    </div>
                    {produk.terjual > 0 && (
                      <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="text-sm text-peran-kedua">Terjual</dt>
                        <dd className="text-sm font-medium text-peran-utama">{produk.terjual}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-sm text-peran-kedua">
                    Penjual belum mengisi spesifikasi. Keterangan di atas diambil otomatis dari
                    data produk.
                  </p>
                )}
              </section>
            )}

            {tab === "info" && (
              <section className="rounded-card border border-peran-garis bg-peran-kartu p-4">
                <h2 className="mb-2 text-sm font-bold text-peran-utama">Info Penting</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-peran-kedua">
                  {data?.info_penting?.trim?.() ||
                    "Belum ada info penting dari penjual. Silakan tanyakan langsung lewat chat bila ada yang perlu dipastikan."}
                </p>
              </section>
            )}

            {tab === "ulasan" && (
              <div className="space-y-4">
                <GrafikUlasan ringkas={ringkas} />

                {ulasan.length === 0 ? (
                  <p className="rounded-card border border-peran-garis bg-peran-kartu px-4 py-8 text-center text-sm text-peran-kedua">
                    Belum ada ulasan untuk produk ini.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {ulasan.map((u) => (
                      <article
                        key={u.id}
                        className="rounded-card border border-peran-garis bg-peran-kartu p-4"
                      >
                        <div className="flex items-start gap-3">
                          {u.buyer_photo ? (
                            <img
                              src={u.buyer_photo}
                              alt={u.buyer_name}
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-peran-lembut text-xs font-bold text-peran-kedua">
                              {String(u.buyer_name || "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-peran-utama">
                                {u.buyer_name}
                              </span>
                              <span className="text-xs text-peran-samar">
                                {waktuLalu(u.created_at)}
                              </span>
                            </div>
                            <div className="mt-1">
                              <Bintang nilai={u.score} ukuran={13} />
                            </div>
                            {u.comment && (
                              <p className="mt-2 whitespace-pre-line text-sm text-peran-kedua">
                                {u.comment}
                              </p>
                            )}

                            {/* Foto ulasan */}
                            {u.foto?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {u.foto.map((f, i) => (
                                  <img
                                    key={i}
                                    src={f}
                                    alt={`Foto ulasan ${i + 1}`}
                                    className="h-16 w-16 rounded-input border border-peran-garis object-cover"
                                  />
                                ))}
                              </div>
                            )}

                            {/* Balasan penjual */}
                            {u.balasan_penjual && (
                              <div className="mt-3 rounded-input border-l-2 border-peran-aksi bg-peran-lembut px-3 py-2">
                                <p className="text-xs font-semibold text-peran-aksi">
                                  Balasan {namaToko}
                                </p>
                                <p className="mt-0.5 text-sm text-peran-kedua">
                                  {u.balasan_penjual}
                                </p>
                              </div>
                            )}

                            {u.jumlah_membantu > 0 && (
                              <p className="mt-2 text-xs text-peran-samar">
                                {u.jumlah_membantu} orang merasa ulasan ini membantu
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------- 11. Produk lain dari toko ---------- */}
        {tokoLain.length > 0 && (
          <section className="mt-9">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-lg font-bold tracking-heading text-peran-utama">
                Lainnya di {namaToko}
              </h2>
              <Link
                href={`/profile/${produk.seller_id}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-peran-aksi hover:underline"
              >
                Lihat semua
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
            <GridProduk daftar={tokoLain} />
          </section>
        )}

        {/* ---------- 12. Produk serupa ---------- */}
        {serupa.length > 0 && (
          <section className="mt-9">
            <h2 className="mb-3 text-lg font-bold tracking-heading text-peran-utama">
              Produk Serupa
            </h2>
            <GridProduk daftar={serupa} />
          </section>
        )}
      </main>
    </>
  );
}

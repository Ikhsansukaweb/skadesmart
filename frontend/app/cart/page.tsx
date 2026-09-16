"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Minus, Plus, Trash2, LoaderCircle, ShoppingBasket } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart-context";

interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
  note: string | null;
  name: string;
  price: number;
  image_url: string | null;
  stock: number;
}

// Keranjang KWU Brital: edit jumlah/hapus item per baris, lalu checkout
// sekaligus dengan catatan tambahan untuk keseluruhan pesanan.
export default function CartPage() {
  const router = useRouter();
  const { refresh: refreshCartBadge } = useCart();

  const [items, setItems] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [orderNote, setOrderNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api<{ items: CartItem[]; total: number }>("/cart")
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      })
      // Keranjang gagal dimuat (mis. sesi kedaluwarsa) tidak boleh membuat
      // promise ditolak tanpa penanganan - tampilkan saja sebagai kosong.
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateQuantity(productId: number, quantity: number) {
    if (quantity < 1) return;
    await api(`/cart/${productId}`, { method: "PUT", json: { quantity } });
    load();
    refreshCartBadge();
  }

  async function removeItem(productId: number) {
    await api(`/cart/${productId}`, { method: "DELETE" });
    load();
    refreshCartBadge();
  }

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    setCheckingOut(true);
    setError("");
    try {
      await api("/orders/brital/checkout", { method: "POST", json: { note: orderNote || undefined } });
      refreshCartBadge();
      router.push("/orders/status");
    } catch (err: any) {
      setError(err.message || "Checkout gagal.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl text-brand-700 flex items-center gap-2">
          <ShoppingBasket size={22} aria-hidden="true" /> Keranjang
        </h1>

        {loading && <p className="text-fog font-body text-sm">Memuat keranjang...</p>}

        {!loading && items.length === 0 && (
          <p className="text-fog font-body text-sm">Keranjang kosong. Yuk pilih menu di Marketplace.</p>
        )}

        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="card p-3 flex gap-3">
              <div className="relative w-16 h-16 rounded-badge overflow-hidden bg-brand-100 shrink-0">
                {it.image_url && <img src={it.image_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-sub font-medium text-sm">{it.name}</h3>
                <p className="text-sm text-brand-700 font-heading">Rp{it.price.toLocaleString("id-ID")}</p>
                {it.note && <p className="text-xs text-fog font-body italic">Catatan: {it.note}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => updateQuantity(it.product_id, it.quantity - 1)}
                    disabled={it.quantity <= 1}
                    className="w-7 h-7 rounded-badge border border-brand-200 flex items-center justify-center text-brand-600 disabled:opacity-30"
                    aria-label="Kurangi jumlah"
                  >
                    <Minus size={14} aria-hidden="true" />
                  </button>
                  <span className="text-sm font-sub w-6 text-center">{it.quantity}</span>
                  <button
                    onClick={() => updateQuantity(it.product_id, it.quantity + 1)}
                    disabled={it.quantity >= it.stock}
                    className="w-7 h-7 rounded-badge border border-brand-200 flex items-center justify-center text-brand-600 disabled:opacity-30"
                    aria-label="Tambah jumlah"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => removeItem(it.product_id)}
                    className="ml-auto text-ember-600 p-1.5"
                    aria-label={`Hapus ${it.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <form onSubmit={handleCheckout} className="card p-4 space-y-3">
            <div>
              <label htmlFor="order_note" className="block text-sm font-sub mb-1 text-steel">
                Catatan untuk pesanan ini (opsional)
              </label>
              <textarea
                id="order_note"
                rows={2}
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                className="input-field"
                placeholder="Misal: tolong dipisah kemasannya"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-sub text-steel">Total</span>
              <span className="font-heading text-xl text-brand-700">Rp{total.toLocaleString("id-ID")}</span>
            </div>
            {error && <p role="alert" className="text-sm text-ember-600 font-body">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/marketplace?category=kwu_brital")}
                className="btn-secondary flex-1"
              >
                Batal
              </button>
              <button type="submit" disabled={checkingOut} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {checkingOut && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                Pesan Sekarang
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

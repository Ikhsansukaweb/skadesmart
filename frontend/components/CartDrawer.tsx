"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X, Minus, Plus, Trash2, LoaderCircle, ShoppingBasket } from "lucide-react";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart-context";

// Panel keranjang sebagai popup/drawer (bukan halaman penuh) - muncul dari
// kanan layar saat tombol keranjang di Navbar ditekan.
export default function CartDrawer() {
  const router = useRouter();
  const { items, total, isOpen, close, refresh } = useCart();
  const [orderNote, setOrderNote] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function updateQuantity(productId: number, quantity: number) {
    if (quantity < 1) return;
    await api(`/cart/${productId}`, { method: "PUT", json: { quantity } });
    refresh();
  }

  async function removeItem(productId: number) {
    await api(`/cart/${productId}`, { method: "DELETE" });
    refresh();
  }

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    setCheckingOut(true);
    setError("");
    try {
      await api("/orders/brital/checkout", { method: "POST", json: { note: orderNote || undefined } });
      refresh();
      close();
      router.push("/orders/status");
    } catch (err: any) {
      setError(err.message || "Checkout gagal.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
      <div className="relative w-full max-w-sm h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-sand">
          <h2 className="font-sub font-medium flex items-center gap-2 text-brand-700">
            <ShoppingBasket size={18} aria-hidden="true" /> Keranjang
          </h2>
          <button onClick={close} className="p-1.5 text-steel hover:bg-parchment rounded-lg" aria-label="Tutup keranjang">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0 && <p className="text-fog font-body text-sm text-center py-8">Keranjang kosong.</p>}
          {items.map((it) => (
            <div key={it.id} className="card p-3 flex gap-3">
              <div className="relative w-14 h-14 rounded-badge overflow-hidden bg-electric-100 shrink-0">
                {it.image_url && <img src={it.image_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <h3 className="font-sub font-medium text-sm line-clamp-1">{it.name}</h3>
                <p className="text-sm text-brand-700 font-heading">Rp{it.price.toLocaleString("id-ID")}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(it.product_id, it.quantity - 1)}
                    disabled={it.quantity <= 1}
                    className="w-6 h-6 rounded-lg border border-sand flex items-center justify-center text-brand-600 disabled:opacity-30"
                    aria-label="Kurangi jumlah"
                  >
                    <Minus size={12} aria-hidden="true" />
                  </button>
                  <span className="text-sm font-sub w-5 text-center">{it.quantity}</span>
                  <button
                    onClick={() => updateQuantity(it.product_id, it.quantity + 1)}
                    disabled={it.quantity >= it.stock}
                    className="w-6 h-6 rounded-lg border border-sand flex items-center justify-center text-brand-600 disabled:opacity-30"
                    aria-label="Tambah jumlah"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                  <button onClick={() => removeItem(it.product_id)} className="ml-auto text-red-500 p-1" aria-label={`Hapus ${it.name}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <form onSubmit={handleCheckout} className="border-t border-sand p-4 space-y-3">
            <textarea
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              rows={2}
              placeholder="Catatan untuk pesanan (opsional)"
              className="input-field text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="font-sub text-sm text-steel">Total</span>
              <span className="font-heading text-lg text-brand-700">Rp{total.toLocaleString("id-ID")}</span>
            </div>
            {error && <p role="alert" className="text-xs text-red-600 font-body">{error}</p>}
            <button type="submit" disabled={checkingOut} className="btn-primary w-full flex items-center justify-center gap-2">
              {checkingOut && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
              Pesan Sekarang
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth-context";

export interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
  note: string | null;
  name: string;
  price: number;
  image_url: string | null;
  stock: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  total: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  refresh: () => void;
  /** Tambah produk ke keranjang dari halaman detail produk. */
  tambah: (p: { productId: number; quantity: number; note?: string }) => Promise<void>;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  count: 0,
  total: 0,
  isOpen: false,
  open: () => {},
  close: () => {},
  refresh: () => {},
  tambah: async () => {},
});

// Keranjang sekarang berupa popup/drawer, bukan halaman penuh - tombol
// keranjang di Navbar cuma muncul kalau ada isinya, klik membuka drawer ini.
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!user) {
      setItems([]);
      return;
    }
    api<{ items: CartItem[] }>("/cart")
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, [user]);

  useEffect(refresh, [refresh]);

  /**
   * Tambah ke keranjang dari halaman detail produk.
   * Setelah berhasil, daftar keranjang di navbar langsung diperbarui
   * supaya angka jumlahnya tidak ketinggalan.
   */
  const tambah = useCallback(
    async (p: { productId: number; quantity: number; note?: string }) => {
      await api("/cart", {
        method: "POST",
        json: {
          product_id: p.productId,
          quantity: p.quantity,
          ...(p.note ? { note: p.note } : {}),
        },
      });
      refresh();
    },
    [refresh]
  );

  const count = items.reduce((sum, it) => sum + it.quantity, 0);
  const total = items.reduce((sum, it) => sum + it.quantity * it.price, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        count,
        total,
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        refresh,
        tambah,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

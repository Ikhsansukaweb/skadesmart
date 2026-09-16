import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart-context";
import CartDrawer from "@/components/CartDrawer";
import Footer from "@/components/Footer";
import NotificationSound from "@/components/NotificationSound";
import { SKRIP_TEMA } from "@/components/ToggleTema";
import { ConditionalFooter } from "./ConditionalFooter";

// Font di-load via <link> biasa (fetch di browser saat runtime), BUKAN
// next/font/google, supaya proses `next build` tidak butuh akses internet
// ke fonts.googleapis.com (server VPS/CI sekolah bisa saja membatasi
// koneksi keluar). Nama family didaftarkan langsung di tailwind.config.ts
// lewat CSS variable di globals.css.
//
// Design system baru: Inter untuk 95% UI, "Source Serif 4" italic sebagai
// pengganti Gambetta (tidak tersedia di Google Fonts) - dipakai maksimal
// 1 kata/frasa per halaman di headline hero (lihat landing page `/`).
export const metadata: Metadata = {
  title: "SkadesMart - Marketplace Internal SMKN 1 Depok Sleman",
  description:
    "Marketplace internal sekolah untuk unit KWU (Ayam Geprek Brital, Laundry) dan jualan bebas siswa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital@1&display=swap"
        />
        {/*
          Skrip tema harus jalan SEBELUM halaman digambar. Kalau ditunda sampai
          React memuat, pengguna mode gelap akan melihat kedipan putih dulu
          (satu gambar penuh berwarna terang, baru berubah gelap).
          Karena itu ditulis inline di <head>, bukan di dalam komponen.
        */}
        <script dangerouslySetInnerHTML={{ __html: SKRIP_TEMA }} />
      </head>
      <body>
        <AuthProvider>
          <CartProvider>
            {children}
            <CartDrawer />
            <ConditionalFooter />
            <NotificationSound />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
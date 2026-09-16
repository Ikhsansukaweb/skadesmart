"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, Headset, Instagram, Music2 } from "lucide-react";
import BrandLockup from "./BrandLockup";

// Link kontak & sosial media masih placeholder (#) sampai akun resminya siap -
// tinggal ganti href di sini kalau sudah ada.
export default function Footer() {
  const pathname = usePathname();

  // Halaman detail chat (/chat/[chatId]) punya layout full-height sendiri
  // (daftar pesan + input di bawah) - footer di sini bikin sesak & tumpang
  // tindih dengan input pesan. Halaman daftar chat (/chat) tetap tampilkan
  // footer seperti biasa.
  const isChatDetail = /^\/chat\/[^/]+$/.test(pathname || "");
  if (isChatDetail) return null;

  return (
    <footer className="mt-10 border-t border-peran-garis bg-peran-kartu pb-20 md:pb-0">
      <div className="max-w-page mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm">
        <div className="space-y-3">
          {/* Identitas resmi: logo SMKN1 x logo SkadesMart berdampingan -
              KHUSUS di footer, beda dari logo tunggal di Navbar/Home/Landing. */}
          <BrandLockup size={36} showText={false} variant="dual" />
          <p className="text-peran-kedua font-body">
            Marketplace internal SMK Negeri 1 Depok Sleman untuk unit KWU (Ayam Geprek Brital,
            Laundry) dan jualan bebas antar siswa.
          </p>
        </div>

        <div>
          <h4 className="font-sub font-semibold text-peran-utama mb-2">Kontak</h4>
          <ul className="space-y-1.5 text-peran-kedua font-body">
            <li>
              <Link href="#" className="flex items-center gap-2 hover:text-peran-aksi">
                <MessageCircle size={14} aria-hidden="true" /> WhatsApp
              </Link>
            </li>
            <li>
              <Link href="#" className="flex items-center gap-2 hover:text-peran-aksi">
                <Send size={14} aria-hidden="true" /> Telegram
              </Link>
            </li>
            <li>
              <Link href="/cs/chat" className="flex items-center gap-2 hover:text-peran-aksi">
                <Headset size={14} aria-hidden="true" /> Customer Service
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-sub font-semibold text-peran-utama mb-2">Media Sosial</h4>
          <div className="flex gap-3">
            <Link href="#" aria-label="Instagram" className="w-9 h-9 rounded-badge bg-peran-lembut flex items-center justify-center text-peran-aksi hover:bg-peran-garis">
              <Instagram size={18} aria-hidden="true" />
            </Link>
            <Link href="#" aria-label="TikTok" className="w-9 h-9 rounded-badge bg-peran-lembut flex items-center justify-center text-peran-aksi hover:bg-peran-garis">
              <Music2 size={18} aria-hidden="true" />
            </Link>
          </div>
          <Link href="#" className="block mt-4 text-peran-samar hover:text-peran-aksi font-body text-xs">
            Kebijakan Privasi
          </Link>
        </div>
      </div>

      <div className="border-t border-peran-garis py-4 text-center text-xs text-peran-samar font-body">
        Made by Anak Sholeh Team
      </div>
    </footer>
  );
}

"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  UserRound,
  ImagePlus,
  BellRing,
  BellOff,
  History,
  Headset,
  IdCard,
  KeyRound,
  LoaderCircle,
  Store,
  PackageSearch,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import { api, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface AccountData {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: string;
  profile_photo_url: string | null;
  banner_url: string | null;
  shop_open: number;
  notif_enabled: number;
}

interface HistoryOrder {
  id: number;
  kwu_unit: string;
  total_price: number;
  status: string;
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  siswa: "Siswa",
  kwu_brital: "Staf - Ayam Geprek Brital",
  kwu_laundry: "Staf - Laundry",
  cs: "Customer Service",
  admin: "Admin",
};

export default function AccountPage() {
  const { refresh, registerPushToken } = useAuth();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [message, setMessage] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  function load() {
    // Kedua permintaan ini WAJIB punya .catch(). Tanpa itu, kegagalan
    // (mis. sesi kedaluwarsa saat halaman dibuka langsung) menjadi promise
    // yang ditolak tanpa penanganan dan muncul sebagai unhandledRejection
    // di konsol browser.
    api<{ user: AccountData }>("/account")
      .then((d) => setAccount(d.user))
      .catch(() => setAccount(null));
    api<{ orders: HistoryOrder[] }>("/account/history")
      .then((d) => setHistory(d.orders))
      .catch(() => setHistory([]));
  }

  useEffect(load, []);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      await api("/account", { method: "PUT", json: { profile_photo_url: url } });
      load();
      refresh();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      await api("/account", { method: "PUT", json: { banner_url: url } });
      load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function toggleNotif() {
    if (!account) return;
    setNotifBusy(true);
    setMessage("");
    try {
      if (!account.notif_enabled) {
        // Mengaktifkan: benar-benar minta izin browser & daftarkan token FCM,
        // bukan cuma nyalain flag di database (bug sebelumnya).
        const result = await registerPushToken();
        if (!result.ok) {
          setMessage(result.reason || "Gagal mengaktifkan notifikasi.");
          setNotifBusy(false);
          return;
        }
      }
      await api("/account", { method: "PUT", json: { notif_enabled: !account.notif_enabled } });
      load();
    } finally {
      setNotifBusy(false);
    }
  }

  async function toggleShop() {
    if (!account) return;
    await api("/account/shop-status", { method: "PUT", json: { shop_open: !account.shop_open } });
    load();
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordMessage("");
    try {
      await api("/account/password", {
        method: "PUT",
        json: { current_password: currentPassword, new_password: newPassword },
      });
      setPasswordMessage("Password berhasil diganti.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordMessage(err.message);
    } finally {
      setPasswordSaving(false);
    }
  }

  if (!account) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Memuat akun...</p>
      </main>
    );
  }

  const isKwuSeller = account.role === "kwu_brital" || account.role === "kwu_laundry";
  const isSellerRole = account.role === "siswa" || account.role === "kwu_brital";

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl text-brand-700">Akun Saya</h1>

        <div className="card overflow-hidden">
          <label className="relative block w-full h-32 bg-electric-100 cursor-pointer group">
            {account.banner_url && <img src={account.banner_url} alt="Banner profil" decoding="async" className="h-32 w-full object-cover" />}
            <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1 opacity-90">
              <ImagePlus size={12} aria-hidden="true" /> Ubah banner
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBannerChange} className="hidden" />
          </label>

          <div className="p-5 -mt-10 space-y-4">
            <div className="flex items-end gap-4">
              <label className="relative w-20 h-20 rounded-full bg-electric-100 overflow-hidden cursor-pointer shrink-0 border-4 border-white">
                {account.profile_photo_url ? (
                  <img src={account.profile_photo_url} alt="Foto profil" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-brand-400">
                    <UserRound size={32} aria-hidden="true" />
                  </div>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-0.5 flex items-center justify-center gap-1">
                  <ImagePlus size={10} aria-hidden="true" /> Ubah
                </span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="hidden" />
              </label>
              <div className="pb-1">
                <p className="font-sub font-medium">{account.full_name}</p>
                <p className="text-sm text-brand-600 font-sub">{ROLE_LABEL[account.role] || account.role}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-sand">
              <div>
                <p className="text-xs text-fog font-body flex items-center gap-1"><IdCard size={12} aria-hidden="true" /> NISN</p>
                <p className="font-sub text-sm">{account.nisn}</p>
              </div>
              <div>
                <p className="text-xs text-fog font-body">Kelas</p>
                <p className="font-sub text-sm">{account.class_name}</p>
              </div>
            </div>
            <p className="text-xs text-fog font-body">
              Nama, kelas, dan NISN tidak bisa diubah karena sudah terhubung dengan data resmi sekolah. Hubungi CS kalau ada kesalahan data.
            </p>

            {message && <p className="text-sm font-body text-red-600">{message}</p>}

            <div className="grid grid-cols-1 gap-2 pt-2">
              {isKwuSeller && (
                <button onClick={toggleShop} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                  <Store size={16} aria-hidden="true" />
                  Toko: {account.shop_open ? "Buka" : "Tutup"} (klik untuk {account.shop_open ? "tutup" : "buka"})
                </button>
              )}
              {isSellerRole && (
                <Link href="/product/mine" className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                  <PackageSearch size={16} aria-hidden="true" /> Kelola Produk Saya
                </Link>
              )}
              <button onClick={toggleNotif} disabled={notifBusy} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                {notifBusy ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : account.notif_enabled ? (
                  <BellRing size={16} aria-hidden="true" />
                ) : (
                  <BellOff size={16} aria-hidden="true" />
                )}
                Notifikasi browser: {account.notif_enabled ? "Aktif" : "Nonaktif"}
              </button>
              <Link href="/cs/chat" className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                <Headset size={16} aria-hidden="true" /> Chat dengan CS
              </Link>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="font-sub font-medium flex items-center gap-2 text-brand-700">
            <KeyRound size={16} aria-hidden="true" /> Ganti Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label htmlFor="current_password" className="block text-sm font-sub mb-1 text-steel">Password saat ini</label>
              <input id="current_password" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" />
            </div>
            <div>
              <label htmlFor="new_password" className="block text-sm font-sub mb-1 text-steel">Password baru</label>
              <input id="new_password" type="password" required minLength={4} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" />
            </div>
            {passwordMessage && <p className="text-sm font-body text-brand-600">{passwordMessage}</p>}
            <button type="submit" disabled={passwordSaving} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
              {passwordSaving && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
              Simpan Password Baru
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-xl mb-3 text-brand-700 flex items-center gap-2">
            <History size={18} aria-hidden="true" /> Riwayat Pesanan
          </h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="card p-3 flex items-center justify-between">
                <div>
                  <p className="font-sub text-sm font-medium">
                    {h.kwu_unit === "kwu_brital" ? "Ayam Geprek Brital" : "Laundry"} - Rp{h.total_price.toLocaleString("id-ID")}
                  </p>
                  <p className="text-xs text-fog font-body">{new Date(h.created_at).toLocaleDateString("id-ID")}</p>
                </div>
                <StatusBadge status={h.status} />
              </div>
            ))}
            {history.length === 0 && <p className="text-fog font-body text-sm">Belum ada riwayat pesanan.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

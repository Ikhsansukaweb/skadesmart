"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { LoaderCircle, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const [nisn, setNisn] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotFound(false);
    setSubmitting(true);
    try {
      await login(nisn, password);
    } catch (err: any) {
      setError(err.message || "Login gagal. Coba lagi.");
      setNotFound(err.code === "NISN_NOT_FOUND" || /belum terdaftar/i.test(err.message || ""));
    } finally {
      setSubmitting(false);
    }
  }

  const errorAlert = error && (
    <p role="alert" className="text-red-600 text-sm font-medium flex items-center gap-1">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {error}
    </p>
  );

  return (
    <main className="h-screen w-screen flex overflow-hidden bg-gray-50">
      {/* Panel Kiri - Branding (Desktop only) */}
      <div className="hidden lg:flex lg:w-[45%] flex-col relative overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/smkn1depok.jpeg')" }} />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/60 to-black/50" />
        {/* Decorative circles */}
        <div className="absolute top-[-120px] right-[-120px] w-[300px] h-[300px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-200px] right-[-200px] w-[450px] h-[450px] rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-[-80px] w-[200px] h-[200px] rounded-full bg-white/5" />

        {/* Content wrapper - fills height with proper spacing */}
        <div className="relative z-10 flex flex-col h-full min-h-0 p-8 lg:p-12 xl:p-16">
          {/* Top - Logo & Eyebrow */}
          <div className="flex-shrink-0 flex flex-col items-start">
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/logo-skadesmart.png"
                alt="SkadesMart Logo"
                width={40}
                height={40}
                className="object-cover"
              />
              {/* Teks di atas FOTO memakai putih MUTLAK (!text-[#ffffff]),
                  BUKAN `text-white`. Sebab `text-white` di proyek ini menunjuk
                  token merek `--teks-terang` (tailwind.config.ts baris 101)
                  yang nilainya bisa berubah jadi GELAP - akibatnya tulisan di
                  atas foto jadi hitam dan tidak terbaca. */}
              <span className="!text-[#ffffff] font-bold text-lg lg:text-xl tracking-tight">SkadesMart</span>
            </div>
            <p className="!text-[#ffffff]/70 text-xs uppercase tracking-widest font-medium">
              MARKETPLACE INTERNAL SEKOLAH
            </p>
          </div>

          {/* Center - Headline (flex-1 to push to middle) */}
          <div className="flex-1 flex flex-col justify-center items-start min-h-0 overflow-hidden">
            <h1 className="!text-[#ffffff] font-extrabold leading-[1.05] text-3xl lg:text-4xl xl:text-5xl max-w-xl">
              Satu marketplace untuk
              <br />
              semua kebutuhan
              <br />
              <span className="text-yellow-500">anak Skadesta</span>
            </h1>
            <p className="!text-[#ffffff]/80 text-sm lg:text-base mt-3 max-w-md font-normal leading-relaxed">
              Pesan Ayam Geprek Brital, titip cucian ke KWU Laundry, dan jualan bebas antar siswa — semua dalam satu aplikasi.
            </p>
          </div>

          {/* Bottom - Decorative anchor */}
          <div className="flex-shrink-0 flex items-end pt-6">
            <div className="w-16 h-16 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1E3FCC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Panel Kanan - Form */}
      <div className="flex w-full lg:w-[55%] flex-col items-center justify-center overflow-hidden p-4 lg:p-0">
        {/* ===== MOBILE: satu card berisi semua ===== */}
        <div className="lg:hidden w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 px-6 py-7">
          {/* Branding inside card */}
          <div className="text-center mb-5">
            <Image
              src="/logo-skadesmart.png"
              alt="SkadesMart Logo"
              width={52}
              height={52}
              className="object-cover mx-auto mb-3"
            />
            <p className="text-gray-400 text-[10px] uppercase tracking-widest font-medium mb-3">
              MARKETPLACE INTERNAL SEKOLAH
            </p>
            <h1 className="text-gray-900 font-extrabold leading-tight text-2xl">
              Selamat datang kembali
            </h1>
            <p className="text-gray-600 text-sm mt-1.5">
              Masukkan NISN dan password untuk mengakses <span className="font-semibold text-[#2F5CFF]">SkadesMart</span>.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="nisn-m" className="block text-gray-900 font-medium text-sm mb-1.5">
                NISN
              </label>
              <input
                id="nisn-m"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                required
                value={nisn}
                onChange={(e) => setNisn(e.target.value.replace(/\D/g, ""))}
                placeholder="5 digit angka"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-base
                  focus:outline-none focus:border-[#2F5CFF] focus:ring-2 focus:ring-[#2F5CFF]/20
                  transition-colors duration-200"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password-m" className="block text-gray-900 font-medium text-sm mb-1.5">
                Password
              </label>
              <input
                id="password-m"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-base
                  focus:outline-none focus:border-[#2F5CFF] focus:ring-2 focus:ring-[#2F5CFF]/20
                  transition-colors duration-200"
                autoComplete="current-password"
              />
            </div>

            {errorAlert}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#2F5CFF] text-white font-semibold text-base py-3.5 rounded-xl
                flex items-center justify-center gap-2
                hover:bg-[#1E3FCC] disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200"
            >
              {submitting && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
              {!submitting && "Masuk"}
              {!submitting && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>

          <p className="text-gray-500 text-xs text-center mt-5">
            Akun disediakan oleh sekolah. Hubungi admin jika NISN tidak terdaftar.
          </p>
        </div>

        {/* ===== DESKTOP: form tanpa card ===== */}
        <div className="hidden lg:block w-full max-w-md">
          <p className="text-gray-500 text-xs uppercase tracking-widest font-medium mb-3">
            Masuk ke akun Anda
          </p>
          <h2 className="text-gray-900 font-bold text-2xl lg:text-3xl mb-1">
            Selamat datang kembali
          </h2>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            Masukkan NISN dan password untuk mengakses SkadesMart.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="nisn" className="block text-gray-900 font-medium text-sm mb-1.5">
                NISN
              </label>
              <input
                id="nisn"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                required
                value={nisn}
                onChange={(e) => setNisn(e.target.value.replace(/\D/g, ""))}
                placeholder="5 digit angka"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm
                  focus:outline-none focus:border-[#2F5CFF] focus:ring-2 focus:ring-[#2F5CFF]/20
                  transition-colors duration-200"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-gray-900 font-medium text-sm mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm
                  focus:outline-none focus:border-[#2F5CFF] focus:ring-2 focus:ring-[#2F5CFF]/20
                  transition-colors duration-200"
                autoComplete="current-password"
              />
            </div>

            {errorAlert}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#2F5CFF] text-white font-semibold text-sm py-3 rounded-xl
                flex items-center justify-center gap-2
                hover:bg-[#1E3FCC] disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200"
            >
              {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
              {!submitting && "Masuk"}
              {!submitting && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

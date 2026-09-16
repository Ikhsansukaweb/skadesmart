"use client";

/**
 * ToggleTema - tombol pengalih terang/gelap.
 *
 * Cara kerja:
 *  - Menulis `data-tema="gelap"` pada <html>, yang membuat CSS di
 *    globals.css menimpa seluruh variabel warna.
 *  - Pilihan disimpan di localStorage["tema"] supaya diingat.
 *  - Bila pengguna BELUM pernah memilih, ikut setelan sistem
 *    (prefers-color-scheme) dan terus mengikutinya saat berubah.
 *
 * Catatan: nilai awal dipasang oleh skrip kecil di layout.tsx SEBELUM
 * halaman digambar, supaya tidak ada kedipan putih saat tema gelap.
 * Skrip itu sengaja ditulis inline (bukan di sini) karena harus jalan
 * sebelum React sempat memuat.
 */

import { useCallback, useEffect, useState } from "react";

type Tema = "terang" | "gelap";

const KUNCI = "tema";

function temaSistem(): Tema {
  if (typeof window === "undefined") return "terang";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "gelap" : "terang";
}

/** Baca pilihan tersimpan; kalau belum ada, pakai setelan sistem. */
function temaTersimpan(): Tema | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KUNCI);
  return v === "gelap" || v === "terang" ? v : null;
}

function pasang(t: Tema) {
  const akar = document.documentElement;
  if (t === "gelap") akar.dataset.tema = "gelap";
  else delete akar.dataset.tema;
}

export default function ToggleTema({
  className = "",
  tampilLabel = false,
  varian = "ikon",
}: {
  className?: string;
  tampilLabel?: boolean;
  /**
   * "ikon" = tombol bulat 40x40 untuk header atas (default)
   * "tab"  = tampil sebagai tab navbar bawah di HP: ikon di atas label
   */
  varian?: "ikon" | "tab";
}) {
  // Nilai awal sengaja "terang" agar render server & klien cocok (menghindari
  // peringatan hidrasi). Nilai sebenarnya dipasang di useEffect di bawah.
  const [tema, setTema] = useState<Tema>("terang");
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    const awal = temaTersimpan() ?? temaSistem();
    setTema(awal);
    setSiap(true);

    // Ikuti perubahan setelan sistem, tapi HANYA bila pengguna belum memilih.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const ubah = (e: MediaQueryListEvent) => {
      if (temaTersimpan()) return; // pengguna sudah memilih - jangan diubah
      const baru: Tema = e.matches ? "gelap" : "terang";
      setTema(baru);
      pasang(baru);
    };
    mq.addEventListener("change", ubah);
    return () => mq.removeEventListener("change", ubah);
  }, []);

  const alihkan = useCallback(() => {
    setTema((lama) => {
      const baru: Tema = lama === "gelap" ? "terang" : "gelap";
      pasang(baru);
      try {
        window.localStorage.setItem(KUNCI, baru);
      } catch {
        // localStorage bisa diblokir (mode privat). Tema tetap berganti
        // untuk sesi ini, hanya tidak diingat. Tidak perlu mengganggu pengguna.
      }
      return baru;
    });
  }, []);

  const gelap = tema === "gelap";

  const label = gelap ? "Terang" : "Gelap";

  if (varian === "tab") {
    return (
      <button
        type="button"
        onClick={alihkan}
        aria-label={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
        title={gelap ? "Tema terang" : "Tema gelap"}
        aria-pressed={gelap}
        className={[
          "flex flex-col items-center gap-0.5 rounded-none border-0 bg-transparent",
          className,
        ].join(" ")}
        style={siap ? undefined : { visibility: "hidden" }}
      >
        {gelap ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={alihkan}
      aria-label={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
      title={gelap ? "Tema terang" : "Tema gelap"}
      aria-pressed={gelap}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-input border transition-colors",
        "border-peran-garis text-peran-kedua hover:text-peran-utama hover:bg-peran-lembut",
        tampilLabel ? "px-3 py-2" : "h-10 w-10",
        className,
      ].join(" ")}
      // Sebelum tema asli terbaca, tombol disembunyikan supaya ikonnya tidak
      // "berkedip" salah (matahari padahal temanya gelap).
      style={siap ? undefined : { visibility: "hidden" }}
    >
      {gelap ? (
        // Ikon matahari: klik untuk kembali ke terang
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Ikon bulan: klik untuk masuk mode gelap
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      {tampilLabel && <span className="text-sm">{gelap ? "Terang" : "Gelap"}</span>}
    </button>
  );
}

/**
 * Skrip kecil untuk ditempel di <head> (layout.tsx) sebagai <script>
 * dangerouslySetInnerHTML. Tugasnya memasang tema SEBELUM halaman digambar
 * sehingga tidak ada kedipan putih pada pengguna mode gelap.
 */
export const SKRIP_TEMA = `(function(){try{var t=localStorage.getItem("tema");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"gelap":"terang";}if(t==="gelap"){document.documentElement.dataset.tema="gelap";}}catch(e){}})();`;

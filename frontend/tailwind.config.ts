import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Aktifkan dark mode berbasis atribut `data-tema="gelap"` pada <html>.
  //
  // Sebagian besar tema di SkadesMart dikerjakan lewat CSS variable (lihat
  // `peran` di bawah + globals.css), sehingga TIDAK butuh varian `dark:`.
  // Selector ini disediakan supaya komponen yang benar-benar perlu berbeda
  // struktur/ikon antar tema bisa memakai `dark:...` secara langsung.
  darkMode: ["selector", '[data-tema="gelap"]'],
  theme: {
    extend: {
      colors: {
        // ====================================================================
        // WARNA PERAN (v3) - dipakai komponen baru supaya otomatis ikut
        // dark mode. Nilainya adalah `var(--...)` dari globals.css, jadi
        // cukup menimpa variabel di [data-tema="gelap"] untuk mengubah
        // seluruh halaman tanpa menyentuh satu komponen pun.
        //
        // Contoh pakai:  bg-peran-kartu  text-peran-utama  border-peran-garis
        // ====================================================================
        peran: {
          halaman: "var(--bg-halaman)",
          kartu: "var(--bg-kartu)",
          sorot: "var(--bg-sorot)",
          lembut: "var(--bg-lembut)",
          utama: "var(--teks-utama)",
          kedua: "var(--teks-kedua)",
          samar: "var(--teks-samar)",
          terang: "var(--teks-terang)",
          garis: "var(--garis)",
          "garis-tegas": "var(--garis-tegas)",
          aksi: "var(--aksi)",
          "aksi-hover": "var(--aksi-hover)",
          "aksi-lembut": "var(--aksi-lembut)",
          aksen: "var(--aksen)",
          "aksen-hover": "var(--aksen-hover)",
          "aksen-lembut": "var(--aksen-lembut)",
          naik: "var(--naik)",
          "naik-lembut": "var(--naik-lembut)",
          turun: "var(--turun)",
          "turun-lembut": "var(--turun-lembut)",
          peringatan: "var(--peringatan)",
          "peringatan-lembut": "var(--peringatan-lembut)",
          info: "var(--info)",
          "info-lembut": "var(--info-lembut)",
        },
        // Design system baru ("Join Parker" adaptation) - lihat bagian 3 prompt redesign.
        // `brand` tetap dipakai sebagai scale (dipakai luas di seluruh app lewat
        // class brand-50..brand-700), sekarang diturunkan dari Electric Blue
        // supaya seluruh halaman otomatis ikut tema baru tanpa perlu di-rename
        // satu per satu. Token flat baru (electric, ember, ink, dst) dipakai
        // langsung di komponen baru (landing page, dashboard sidebar, dll).
        brand: {
          50: "#eef5ff",
          100: "#dce9ff",
          200: "#b9d5ff",
          300: "#8fbdff",
          400: "#6ea8ff",
          500: "#5196fe", // = electric-blue
          600: "#3a7ce0",
          700: "#2b5fb0",
        },
        electric: {
          DEFAULT: "#5196fe",
          50: "#eef5ff",
          100: "#dce9ff",
          600: "#3a7ce0",
        },
        ember: {
          DEFAULT: "#f9754e",
          600: "#e35f39",
        },
        // ====================================================================
        // WARNA DASAR - sekarang menunjuk ke VARIABEL TEMA, bukan kode tetap.
        //
        // ALASAN: diuji di browser, dark mode gagal karena `bg-paper`
        // menghasilkan `#ffffff` tetap. Penyebabnya class seperti `bg-paper`
        // dan `bg-parchment` dipakai di 26 berkas (36x bg-parchment, 46x
        // border-sand). Menggantinya satu per satu berisiko besar dan tidak
        // perlu.
        //
        // Dengan menunjuk ke var(), SELURUH class lama (`bg-paper`,
        // `bg-parchment`, `border-sand`, `text-ink`, dst) OTOMATIS ikut
        // berubah saat dark mode aktif - tanpa mengubah satu baris pun di
        // 26 berkas itu.
        //
        // Nilai cadangan (#ffffff, #f2f1ec, ...) ditulis di dalam var() supaya
        // browser lama yang tidak mendukung custom property tetap tampil benar.
        // ====================================================================
        ink: "var(--teks-utama, #1b1d20)",
        midnight: "var(--bg-halaman, #101828)",
        paper: "var(--bg-kartu, #ffffff)",
        parchment: "var(--bg-halaman, #f2f1ec)",
        sand: "var(--garis, #e1dfd8)",
        graphite: "var(--garis-tegas, #27272a)",
        steel: "var(--teks-kedua, #6e6e6e)",
        ash: "var(--teks-kedua, #797876)",
        fog: "var(--teks-samar, #a3a3a3)",
        white: "var(--teks-terang, #ffffff)",
      },
      fontFamily: {
        // Inter jadi font utama (95% UI). Alias lama (heading/sub/body)
        // dipertahankan supaya class existing di seluruh halaman otomatis
        // ikut berubah tanpa perlu diganti satu-satu.
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        heading: ["var(--font-inter)", "Inter", "sans-serif"],
        sub: ["var(--font-inter)", "Inter", "sans-serif"],
        body: ["var(--font-inter)", "Inter", "sans-serif"],
        // Serif italic aksen - dipakai maksimal 1 kata/frasa per halaman
        // (pengganti Gambetta, lihat catatan font di layout.tsx).
        serif: ["var(--font-accent-serif)", "Source Serif 4", "serif"],
      },
      borderRadius: {
        card: "24px",
        input: "12.8px",
        badge: "12.8px",
      },
      boxShadow: {
        md: "0 2px 10px rgba(0,0,0,0.1)",
      },
      maxWidth: {
        page: "1200px",
      },
      letterSpacing: {
        heading: "-0.06em",
        display: "-0.10em",
      },
      fontSize: {
        caption: ["14px", { lineHeight: "1.4" }],
        "body-sm": ["16px", { lineHeight: "1.5" }],
        body: ["18px", { lineHeight: "1.6" }],
        subheading: ["20px", { lineHeight: "1.4" }],
        "heading-sm": ["32px", { lineHeight: "1.15", letterSpacing: "-0.06em" }],
        heading: ["48px", { lineHeight: "1.1", letterSpacing: "-0.06em" }],
        display: ["64px", { lineHeight: "1.05", letterSpacing: "-0.10em" }],
      },
    },
  },
  plugins: [],
};

export default config;

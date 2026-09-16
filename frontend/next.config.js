/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Origin yang boleh mengakses server pengembangan.
  //
  // Mulai Next.js 16, permintaan ke server dev dari origin yang tidak
  // terdaftar di sini DITOLAK (403). Akibatnya chunk JavaScript tidak
  // dimuat, React tidak pernah menghidrasi, dan halaman tampak "mati":
  // form terlihat tapi tombol Masuk tidak melakukan apa pun.
  //
  // `localhost` dan `127.0.0.1` dianggap origin BERBEDA oleh browser,
  // jadi keduanya harus terdaftar. Domain publik ikut didaftarkan supaya
  // pengujian lewat tunnel juga tidak terblokir.
  allowedDevOrigins: [
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
    "skadesmart.web.id",
    "www.skadesmart.web.id",
  ],

  images: {
    // Foto produk/profil di-upload ke Catbox, izinkan domain hostingnya.
    // Disable Next.js image optimization for external images to avoid 404/502 errors
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "files.catbox.moe" },
    ],
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    // CSP directives - Next.js + Tailwind needs unsafe-inline for styles/scripts
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com"  // Dev needs these for HMR + Cloudflare
      : "'self' 'unsafe-inline' https://static.cloudflareinsights.com";  // Production: Cloudflare + Next.js inline scripts
    const styleSrc = "'self' 'unsafe-inline' https://fonts.googleapis.com";  // Both: Tailwind + Google Fonts (needs unsafe-inline)
    const fontSrc = "'self' data: https://fonts.gstatic.com";  // Google Fonts files
    // connect-src: ke mana halaman boleh membuka koneksi.
    //
    // Domain Firebase (firebaseio.com / googleapis.com) sudah dibuang karena
    // real-time sekarang lewat WebSocket ke server sendiri. Yang WAJIB ada:
    //   - https://api.skadesmart.web.id -> panggilan REST
    //   - wss://api.skadesmart.web.id   -> koneksi real-time (chat, pesanan)
    // Tanpa entri wss:// di atas, browser memblokir WebSocket meski HTTPS-nya
    // diizinkan, dan aplikasi akan tampak "tidak bisa kirim chat".
    const connectSrc =
      "'self' https://api.isanim.web.id https://api.skadesmart.web.id wss://api.skadesmart.web.id" +
      (isDev ? " ws://localhost:3737 ws://localhost:4000 http://localhost:3737" : "");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              `style-src ${styleSrc}`,
              "img-src 'self' data: https://files.catbox.moe blob:",
              `font-src ${fontSrc}`,
              `connect-src ${connectSrc}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "frame-src 'none'",
              "worker-src 'self' blob:",
            ].join("; "),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          // Cross-Origin-Resource-Policy HARUS 'cross-origin'.
          //
          // Nilai 'same-origin' membuat browser MENOLAK memuat gambar dari
          // domain lain - termasuk foto yang diunggah ke files.catbox.moe.
          // Akibatnya gambar tampil kosong/putih TANPA permintaan jaringan
          // sama sekali (naturalWidth = 0). Ini penyebab utama foto putih.
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
      // HTML tidak boleh di-cache lama.
      //
      // Next.js 16 memberi halaman statis `cache-control: s-maxage=31536000`
      // (1 TAHUN). Akibatnya browser menyajikan HTML basi dan perubahan
      // tampilan tidak terlihat sampai pengguna menghapus cache manual.
      // Aturan ini hanya berlaku untuk dokumen HTML, bukan aset ber-hash.
      {
        source: "/:path((?!_next/static|_next/image|favicon|logo-|api).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      // Aset ber-hash aman di-cache selamanya (namanya berubah tiap build).
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

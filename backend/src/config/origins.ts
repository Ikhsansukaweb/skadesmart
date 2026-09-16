/**
 * Daftar origin (asal) yang diizinkan mengakses backend.
 *
 * Dipakai DUA tempat yang wajib sinkron:
 *   1. CORS di `server.ts` — untuk permintaan HTTP biasa (fetch)
 *   2. Pemeriksaan Origin saat handshake WebSocket di `services/wsHub.ts` —
 *      mencegah Cross-Site WebSocket Hijacking (CSWSH)
 *
 * Kalau daftar ini berbeda antara keduanya, akan muncul bug yang sulit dilacak:
 * halaman bisa memuat data lewat HTTP tetapi koneksi real-time-nya ditolak
 * (atau sebaliknya). Karena itu sumbernya disatukan di berkas ini.
 *
 * CATATAN: origin HARUS ditulis lengkap dengan skema dan TANPA garis miring di
 * akhir, karena browser membandingkannya persis dengan header `Origin`.
 */
export const allowedOrigins: string[] = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
  // 127.0.0.1 dan localhost adalah alamat yang SAMA bagi server, tetapi
  // browser memperlakukannya sebagai origin BERBEDA. Kalau salah satu tidak
  // terdaftar, membuka situs lewat alamat itu membuat SEMUA permintaan API
  // diblokir CORS - gejalanya: tombol Masuk diklik tapi tidak terjadi apa-apa.
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  // Domain produksi SkadesMart (frontend) - wajib ada, kalau tidak semua
  // permintaan dari situs ini diblokir browser dengan error CORS.
  "https://skadesmart.web.id",
  "https://www.skadesmart.web.id",
  "https://isanim.web.id",
].filter(Boolean) as string[];

/** Apakah `asal` termasuk origin yang diizinkan? */
export function asalDiizinkan(asal: string): boolean {
  return allowedOrigins.includes(asal);
}

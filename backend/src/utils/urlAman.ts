import { z } from "zod";

/**
 * Skema URL yang AMAN untuk disimpan lalu ditampilkan ke pengguna.
 *
 * MASALAH YANG DICEGAH:
 * `z.string().url()` saja TIDAK CUKUP. Validasi bawaan Zod memakai konstruktor
 * `URL` JavaScript, yang menganggap `javascript:alert(1)`, `data:text/html,...`,
 * dan `vbscript:msgbox(1)` sebagai URL yang SAH - karena skemanya dianggap
 * "protokol". Akibatnya tautan berbahaya bisa tersimpan di basis data lalu
 * disajikan ke semua pengguna; begitu diklik, kode JavaScript-nya berjalan di
 * browser korban (setara stored XSS).
 *
 * Karena itu skema dibatasi hanya `http` dan `https`.
 *
 * CATATAN PEMAKAIAN: karena fungsi ini mengembalikan `ZodEffects` (hasil
 * `.refine()`), metode seperti `.max()` TIDAK BISA dirantai setelahnya. Batas
 * panjang karena itu dimasukkan lewat parameter `maksPanjang`.
 */
export function buatUrlAman(maksPanjang = 2000) {
  return z
    .string()
    .max(maksPanjang, { message: `Tautan terlalu panjang (maks ${maksPanjang} karakter)` })
    .url()
    .refine(
      (nilai) => {
        try {
          const u = new URL(nilai);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Tautan harus diawali http:// atau https://" },
    );
}

/** URL aman dengan batas panjang bawaan (2000 karakter). */
export const urlAman = buatUrlAman();

/** Sama seperti `urlAman`, tetapi boleh juga berupa teks kosong (tidak diisi). */
export const urlAmanOpsional = urlAman.optional().or(z.literal(""));

/**
 * Domain yang boleh dipakai untuk URL GAMBAR.
 *
 * MENGAPA DIBATASI:
 * Sebelumnya URL gambar boleh menunjuk ke domain mana pun, sehingga
 * `https://contoh.com/shell.php` DITERIMA dan tersimpan di basis data.
 * Karena PHP terpasang di server ini (`/usr/bin/php`) dan folder publik bisa
 * ditulisi, menerima URL berakhiran `.php` membuka jalur menuju eksekusi kode
 * jarak jauh (RCE) begitu ada mekanisme yang menyajikan berkas unggahan.
 *
 * Sampai sekarang semua gambar berasal dari Catbox (lihat CATBOX_USERHASH di
 * .env), jadi daftar putih ini tidak mengubah perilaku normal aplikasi - tetapi
 * menutup jalur unggah berkas yang berbahaya.
 *
 * TAMBAHKAN domain di sini kalau nanti memakai layanan gambar lain (mis.
 * Cloudinary atau penyimpanan sendiri).
 */
export const DOMAIN_GAMBAR_DIIZINKAN = [
  "files.catbox.moe",
  "catbox.moe",
];

/**
 * URL gambar: wajib http/https DAN domainnya termasuk daftar putih.
 *
 * Dipakai untuk `image_urls` produk dan lampiran gambar chat.
 */
export function buatUrlGambar(maksPanjang = 2000) {
  return buatUrlAman(maksPanjang)
    .refine(
      (nilai) => {
        try {
          const u = new URL(nilai);
          return DOMAIN_GAMBAR_DIIZINKAN.includes(u.hostname.toLowerCase());
        } catch {
          return false;
        }
      },
      {
        message: `Gambar harus diunggah lewat layanan resmi (${DOMAIN_GAMBAR_DIIZINKAN.join(", ")})`,
      },
    )
    .refine(
      (nilai) => {
        try {
          const u = new URL(nilai);
          // Hanya terima berkas gambar. Ini mencegah URL berakhiran .php/.svg
          // yang bisa menjadi jalur eksekusi kode atau penyisipan skrip.
          return /\.(jpe?g|png|webp|gif|avif)$/i.test(u.pathname);
        } catch {
          return false;
        }
      },
      { message: "Berkas gambar harus berakhiran .jpg, .jpeg, .png, .webp, .gif, atau .avif" },
    );
}

/** URL gambar dengan batas panjang bawaan. */
export const urlGambar = buatUrlGambar();

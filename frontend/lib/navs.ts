"use client";

/**
 * Apakah halaman ini adalah DETAIL chat?
 *
 * Detail chat punya aturan tampilan sendiri: tidak ada navbar sama sekali
 * (atas maupun bawah), tidak ada scroll di halaman, dan yang menggulir hanya
 * daftar pesannya. Navbar dipakai bersama oleh banyak halaman, jadi
 * pengecualiannya dikumpulkan di satu tempat ini agar mudah ditinjau.
 */
export function halamanTanpaNavbar(pathname: string | null): boolean {
  if (!pathname) return false;
  // /chat          -> daftar percakapan (navbar tetap ada)
  // /chat/<id>     -> detail chat      (navbar disembunyikan)
  return /^\/chat\/.+/.test(pathname);
}

import DOMPurify from "isomorphic-dompurify";

/**
 * Strip semua HTML/script dari input teks bebas user (deskripsi produk,
 * pesan chat, komentar rating) sebelum disimpan ke database.
 */
export function sanitizeText(input: string): string {
  const clean = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return clean.trim();
}

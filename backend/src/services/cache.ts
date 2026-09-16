import NodeCache = require("node-cache");

/**
 * Cache in-memory untuk data yang jarang berubah: daftar produk, unit KWU,
 * rating agregat. TTL default 45 detik (di antara 30-60 detik sesuai spek).
 * Untuk scaling ke banyak instance, ganti dengan Redis dengan interface yang sama.
 */
export const cache = new NodeCache({ stdTTL: 45, checkperiod: 60 });

export function invalidateByPrefix(prefix: string) {
  const keys = cache.keys().filter((k) => k.startsWith(prefix));
  cache.del(keys);
}

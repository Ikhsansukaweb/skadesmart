"use client";

/**
 * PengaturJumlah - tombol "− 1 +" dengan batas stok, plus peringatan
 * bila pembeli meminta lebih dari stok yang ada.
 *
 * Catatan penting: keranjang LAMA tidak memeriksa stok sama sekali
 * (bisa memasukkan 500 untuk stok 5). Batas di sini adalah pertahanan
 * di sisi tampilan; server TETAP memeriksa ulang saat checkout.
 */

export default function PengaturJumlah({
  nilai,
  saatUbah,
  maks = 99,
  min = 1,
  nonaktif = false,
}: {
  nilai: number;
  saatUbah: (n: number) => void;
  maks?: number;
  min?: number;
  nonaktif?: boolean;
}) {
  const kurang = () => saatUbah(Math.max(min, nilai - 1));
  const tambah = () => saatUbah(Math.min(maks, nilai + 1));
  const lebih = nilai > maks;

  return (
    <div>
      <div className="inline-flex items-center overflow-hidden rounded-input border border-peran-garis-tegas">
        <button
          type="button"
          onClick={kurang}
          disabled={nonaktif || nilai <= min}
          aria-label="Kurangi jumlah"
          className="flex h-9 w-9 items-center justify-center text-peran-utama transition-colors hover:bg-peran-lembut disabled:cursor-not-allowed disabled:text-peran-samar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>

        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={maks}
          value={nilai}
          disabled={nonaktif}
          onChange={(e) => {
            const v = Number(e.target.value);
            saatUbah(Number.isFinite(v) ? Math.max(min, Math.trunc(v)) : min);
          }}
          aria-label="Jumlah"
          className="h-9 w-14 border-x border-peran-garis bg-peran-kartu text-center text-sm font-semibold text-peran-utama focus:outline-none disabled:opacity-60"
        />

        <button
          type="button"
          onClick={tambah}
          disabled={nonaktif || nilai >= maks}
          aria-label="Tambah jumlah"
          className="flex h-9 w-9 items-center justify-center text-peran-utama transition-colors hover:bg-peran-lembut disabled:cursor-not-allowed disabled:text-peran-samar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {lebih && (
        <p role="alert" className="mt-1.5 text-xs text-peran-turun">
          Stok hanya {maks}. Jumlah sudah dikurangi otomatis saat checkout.
        </p>
      )}
    </div>
  );
}

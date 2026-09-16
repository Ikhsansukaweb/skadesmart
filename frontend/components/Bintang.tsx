/**
 * Bintang - tampilan rating bintang (bagian 5.2).
 *
 * Menampilkan nilai 0-5 dengan dukungan setengah bintang, opsional jumlah
 * ulasan di sampingnya. Semua ikon SVG inline - TANPA emoji.
 *
 * Kenapa SVG sendiri, bukan lucide-react: bintang perlu dukungan "setengah"
 * yang presisi (gradien), dan ini komponen kecil yang sering dirender di
 * daftar panjang - lebih ringan tanpa dependensi.
 */

export default function Bintang({
  nilai,
  ukuran = 14,
  jumlah,
  tampilAngka = false,
  className = "",
}: {
  /** Nilai rating 0-5. */
  nilai: number;
  /** Ukuran tiap bintang (px). */
  ukuran?: number;
  /** Jumlah ulasan; bila diisi ditampilkan "(n)" setelah bintang. */
  jumlah?: number;
  /** Tampilkan angka nilai (mis. "4.9") sebelum jumlah ulasan. */
  tampilAngka?: boolean;
  className?: string;
}) {
  const aman = Math.max(0, Math.min(5, Number.isFinite(nilai) ? nilai : 0));
  const penuh = Math.floor(aman);
  const sisa = aman - penuh;
  // Setengah bintang dipakai bila sisa antara 0,25 dan 0,75.
  const adaSeparuh = sisa >= 0.25 && sisa < 0.75;
  const bintangPenuh = sisa >= 0.75 ? penuh + 1 : penuh;

  return (
    <span className={["inline-flex items-center gap-1", className].join(" ")}>
      <span
        className="inline-flex items-center gap-px"
        aria-label={`Rating ${aman.toFixed(1)} dari 5`}
        role="img"
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const isi = i < bintangPenuh ? 1 : i === bintangPenuh && adaSeparuh ? 0.5 : 0;
          const idGradien = `bintang-${i}-${Math.round(aman * 100)}-${ukuran}`;
          return (
            <svg key={i} width={ukuran} height={ukuran} viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id={idGradien}>
                  <stop offset={`${isi * 100}%`} stopColor="var(--peringatan)" />
                  <stop offset={`${isi * 100}%`} stopColor="var(--garis-tegas)" />
                </linearGradient>
              </defs>
              <path
                d="M12 2.5l2.9 6.06 6.6.86-4.83 4.62 1.2 6.56L12 17.5l-5.87 3.1 1.2-6.56L2.5 9.42l6.6-.86z"
                fill={isi === 1 ? "var(--peringatan)" : `url(#${idGradien})`}
              />
            </svg>
          );
        })}
      </span>
      {tampilAngka && (
        <span className="text-sm font-semibold text-peran-utama">{aman.toFixed(1)}</span>
      )}
      {typeof jumlah === "number" && (
        <span className="text-xs text-peran-kedua">({jumlah})</span>
      )}
    </span>
  );
}

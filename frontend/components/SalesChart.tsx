"use client";

interface DayStat {
  day: string; // ISO date yyyy-mm-dd
  count: number;
  revenue: number;
}

const DAY_LABEL = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Chart area/line halus (SVG manual, tanpa dependency tambahan) - jumlah
// pesanan selesai per hari. Data yang tersedia dari endpoint /orders/stats
// saat ini selalu 7 hari terakhir, jadi filter periode di bawah baru
// benar-benar aktif untuk "7 Hari"; "30/90 Hari" ditandai non-aktif sampai
// endpoint backend mendukung rentang lain (bukan diubah sepihak dari FE).
export default function SalesChart({ days }: { days: DayStat[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const w = 100;
  const h = 40;
  const stepX = days.length > 1 ? w / (days.length - 1) : 0;

  const points = days.map((d, i) => {
    const x = i * stepX;
    const y = h - (d.count / max) * (h - 6) - 2;
    return { x, y, d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? 0},${h} L0,${h} Z`;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sub font-semibold text-sm text-peran-utama">Pesanan selesai</h3>
        <div className="flex gap-1 text-xs font-sub">
          <span className="px-2.5 py-1 rounded-full bg-peran-aksi text-peran-terang">7 Hari</span>
          <span className="px-2.5 py-1 rounded-full text-peran-samar cursor-not-allowed" title="Perlu dukungan rentang tanggal di backend">
            30 Hari
          </span>
          <span className="px-2.5 py-1 rounded-full text-peran-samar cursor-not-allowed" title="Perlu dukungan rentang tanggal di backend">
            90 Hari
          </span>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-caption text-peran-samar py-8 text-center">Belum ada data.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5196fe" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#5196fe" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#salesFill)" stroke="none" />
            <path d={linePath} fill="none" stroke="#5196fe" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="1.4" fill="#5196fe" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="flex justify-between mt-1">
            {days.map((d) => {
              const date = new Date(d.day + "T00:00:00");
              return (
                <span key={d.day} className="text-[10px] text-peran-samar font-body flex-1 text-center">
                  {DAY_LABEL[date.getDay()]}
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

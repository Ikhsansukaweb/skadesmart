"use client";

/**
 * Toast - notifikasi ringan di sudut layar (bagian 5.2).
 *
 * Dua cara pakai:
 *  1. Terkendali: <Toast tampil pesan tipe="sukses" saatTutup={...} />
 *  2. Provider + hook: bungkus aplikasi dengan <PenyediaToast>, lalu
 *     `const { tampilkan } = useToast(); tampilkan("Tersimpan", "sukses");`
 *
 * Ikon SVG inline - TANPA emoji.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type TipeToast = "sukses" | "galat" | "info" | "peringatan";

const GAYA: Record<TipeToast, { bg: string; teks: string; ikon: ReactNode }> = {
  sukses: {
    bg: "bg-peran-naik-lembut",
    teks: "text-peran-naik",
    ikon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
  },
  galat: {
    bg: "bg-peran-turun-lembut",
    teks: "text-peran-turun",
    ikon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
  },
  info: {
    bg: "bg-peran-info-lembut",
    teks: "text-peran-info",
    ikon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    ),
  },
  peringatan: {
    bg: "bg-peran-peringatan-lembut",
    teks: "text-peran-peringatan",
    ikon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l9.5 16.5H2.5z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
    ),
  },
};

/** Kotak toast (tanpa posisi). Dipakai Toast & PenyediaToast. */
function KotakToast({
  pesan,
  judul,
  tipe,
  saatTutup,
}: {
  pesan: string;
  judul?: string;
  tipe: TipeToast;
  saatTutup?: () => void;
}) {
  const gaya = GAYA[tipe];
  return (
    <div className="flex w-full items-start gap-3 rounded-input border border-peran-garis bg-peran-kartu p-3 shadow-[var(--bayangan-naik)]">
      <span className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-full", gaya.bg, gaya.teks].join(" ")}>
        {gaya.ikon}
      </span>
      <div className="min-w-0 flex-1">
        {judul && <p className="text-sm font-semibold text-peran-utama">{judul}</p>}
        <p className="text-sm text-peran-kedua">{pesan}</p>
      </div>
      {saatTutup && (
        <button
          type="button"
          onClick={saatTutup}
          aria-label="Tutup notifikasi"
          className="shrink-0 rounded-full p-1 text-peran-samar transition-colors hover:bg-peran-lembut hover:text-peran-utama"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Toast terkendali: tampil di sudut layar, tertutup otomatis setelah `durasi`. */
export default function Toast({
  tampil,
  pesan,
  judul,
  tipe = "info",
  durasi = 3500,
  saatTutup,
  className = "",
}: {
  tampil: boolean;
  pesan: string;
  judul?: string;
  tipe?: TipeToast;
  /** milidetik sebelum otomatis tertutup; 0 = tidak otomatis. */
  durasi?: number;
  saatTutup?: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!tampil || durasi <= 0 || !saatTutup) return;
    const t = setTimeout(saatTutup, durasi);
    return () => clearTimeout(t);
  }, [tampil, durasi, saatTutup]);

  if (!tampil) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed bottom-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2",
        "md:bottom-6 md:left-auto md:right-6 md:translate-x-0",
        className,
      ].join(" ")}
    >
      <KotakToast pesan={pesan} judul={judul} tipe={tipe} saatTutup={saatTutup} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider + hook (opsional)
// ---------------------------------------------------------------------------

type IsiToast = { id: number; pesan: string; judul?: string; tipe: TipeToast; durasi: number };

type NilaiKonteksToast = {
  /** Tampilkan satu toast. */
  tampilkan: (pesan: string, tipe?: TipeToast, opsi?: { judul?: string; durasi?: number }) => void;
};

const KonteksToast = createContext<NilaiKonteksToast | undefined>(undefined);

export function PenyediaToast({ children }: { children: ReactNode }) {
  const [daftar, setDaftar] = useState<IsiToast[]>([]);
  const idRef = useRef(0);

  const hapus = useCallback((id: number) => {
    setDaftar((d) => d.filter((t) => t.id !== id));
  }, []);

  const tampilkan = useCallback<NilaiKonteksToast["tampilkan"]>(
    (pesan, tipe = "info", opsi) => {
      const id = ++idRef.current;
      setDaftar((d) => [...d, { id, pesan, tipe, judul: opsi?.judul, durasi: opsi?.durasi ?? 3500 }]);
    },
    [],
  );

  const nilai = useMemo(() => ({ tampilkan }), [tampilkan]);

  return (
    <KonteksToast.Provider value={nilai}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 p-4 md:bottom-6 md:items-end">
        {daftar.map((t) => (
          <ItemToast key={t.id} item={t} saatTutup={() => hapus(t.id)} />
        ))}
      </div>
    </KonteksToast.Provider>
  );
}

/** Item toast milik provider: punya timer sendiri. */
function ItemToast({ item, saatTutup }: { item: IsiToast; saatTutup: () => void }) {
  useEffect(() => {
    if (item.durasi <= 0) return;
    const t = setTimeout(saatTutup, item.durasi);
    return () => clearTimeout(t);
  }, [item.durasi, saatTutup]);

  return (
    <div className="pointer-events-auto w-full max-w-sm" role="status" aria-live="polite">
      <KotakToast pesan={item.pesan} judul={item.judul} tipe={item.tipe} saatTutup={saatTutup} />
    </div>
  );
}

export function useToast(): NilaiKonteksToast {
  const ctx = useContext(KonteksToast);
  if (!ctx) {
    throw new Error("useToast harus dipakai di dalam <PenyediaToast>");
  }
  return ctx;
}

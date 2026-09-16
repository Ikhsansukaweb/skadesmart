"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { api } from "@/lib/api";

interface StudentResult {
  id: number;
  nisn: string;
  full_name: string;
  class_name: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  siswa: "Siswa",
  kwu_brital: "Staf Brital",
  kwu_laundry: "Staf Laundry",
  cs: "CS",
  admin: "Admin",
};

interface Props {
  onSelect: (student: StudentResult) => void;
  selected: StudentResult | null;
  onClear: () => void;
}

// Input pencarian siswa by NAMA (bukan NISN mentah) - ketik nama, muncul
// rekomendasi dengan detail NISN & kelas dari database, klik untuk pilih.
export default function StudentSearchInput({ onSelect, selected, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api<{ users: StudentResult[] }>(`/users/search?query=${encodeURIComponent(query)}`)
        .then((d) => {
          setResults(d.users)
          setOpen(true);
        })
        // Tanpa .catch(), pencarian yang gagal (mis. jaringan terputus)
        // menjadi promise yang ditolak tanpa penanganan.
        .catch(() => setResults([]));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between input-field">
        <div className="flex items-center gap-2 min-w-0">
          <UserRound size={16} className="text-brand-500 shrink-0" aria-hidden="true" />
          <span className="text-sm font-sub truncate">{selected.full_name} - {selected.class_name} - {selected.nisn}</span>
        </div>
        <button type="button" onClick={onClear} className="text-xs text-brand-600 font-sub shrink-0 ml-2">Ganti</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Ketik nama siswa..."
        className="input-field pr-9"
      />
      <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-fog" aria-hidden="true" />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-sand rounded-badge shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect(r);
                setQuery("");
                setResults([]);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm font-body hover:bg-parchment flex items-center justify-between"
            >
              <span>{r.full_name}</span>
              <span className="text-xs text-fog">{r.class_name} - {ROLE_LABEL[r.role] || r.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

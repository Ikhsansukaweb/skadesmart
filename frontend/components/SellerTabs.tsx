"use client";

import { useState, ReactNode } from "react";

interface TabSwitcherProps {
  tabs: { id: string; label: string; icon?: ReactNode }[];
  defaultTab?: string;
  children: (activeTab: string) => ReactNode;
}

/**
 * Tab switcher sederhana untuk halaman gabungan produk + toko.
 * Responsive: di desktop tab horizontal, di mobile bisa scroll horizontal.
 */
export default function TabSwitcher({ tabs, defaultTab, children }: TabSwitcherProps) {
  const [active, setActive] = useState(defaultTab || tabs[0].id);

  return (
    <div>
      {/* Bar tab */}
      <div className="flex gap-1 p-1 bg-peran-lembut rounded-card mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-badge text-sm font-sub font-medium whitespace-nowrap transition-colors ${
              active === t.id
                ? "bg-peran-kartu text-peran-aksi shadow-sm"
                : "text-peran-kedua hover:text-peran-utama"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {children(active)}
    </div>
  );
}

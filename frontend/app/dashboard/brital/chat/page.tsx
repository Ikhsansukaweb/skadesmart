"use client";

export const dynamic = "force-dynamic";

import KwuChatPanel from "@/components/KwuChatPanel";
import DashboardShell from "@/components/dashboard/DashboardShell";

// Halaman chat KWU terpisah untuk unit Brital.
// Dibungkus DashboardShell (polos: tanpa header "Halo, ...!") supaya
// sidebar + navbar tampil tanpa tulisan sapaan.
export default function BritalChatPage() {
  return (
    <DashboardShell role="kwu_brital" polos>
      <KwuChatPanel
        unitSlug="kwu_brital"
        unitName="Ayam Geprek Brital"
      />
    </DashboardShell>
  );
}

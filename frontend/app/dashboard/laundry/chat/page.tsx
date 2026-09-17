"use client";

export const dynamic = "force-dynamic";

import KwuChatPanel from "@/components/KwuChatPanel";
import DashboardShell from "@/components/dashboard/DashboardShell";

// Halaman chat KWU terpisah untuk unit Laundry.
// Dibungkus DashboardShell (polos: tanpa header "Halo, ...!") supaya
// sidebar + navbar tampil tanpa tulisan sapaan.
export default function LaundryChatPage() {
  return (
    <DashboardShell role="kwu_laundry" polos>
      <KwuChatPanel
        unitSlug="kwu_laundry"
        unitName="KWU Laundry"
      />
    </DashboardShell>
  );
}

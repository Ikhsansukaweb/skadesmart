"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

export function ConditionalFooter() {
  const pathname = usePathname();
  const showFooter = pathname !== "/login" && !pathname.startsWith("/chat");

  if (!showFooter) return null;

  return <Footer />;
}
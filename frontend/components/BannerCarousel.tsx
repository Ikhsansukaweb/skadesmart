"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

interface AdminBanner {
  id: number;
  image_url: string;
  title: string | null;
  link_url: string | null;
}

type Slide =
  | { type: "hero"; key: string }
  | { type: "image"; key: string; image_url: string; title: string | null; link_url: string | null };

const AUTO_SLIDE_MS = 5000;

export default function BannerCarousel({ userName }: { userName?: string }) {
  const [adminBanners, setAdminBanners] = useState<AdminBanner[]>([]);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<{ banners: AdminBanner[] }>("/banners").then((d) => setAdminBanners(d.banners)).catch(() => {});
  }, []);

  const slides: Slide[] = [
    { type: "hero", key: "hero" },
    ...adminBanners.map((b) => ({ type: "image" as const, key: `b${b.id}`, image_url: b.image_url, title: b.title, link_url: b.link_url })),
  ];

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_SLIDE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length]);

  function goTo(i: number) {
    setIndex((i + slides.length) % slides.length);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const current = slides[index];

  const SLIDE_CONTAINER_CLASS = "relative w-full h-[240px] sm:h-[280px] md:h-[320px] overflow-hidden bg-ink border-b border-sand/10";

  const slideContent =
    current.type === "hero" ? (
      <div className={`${SLIDE_CONTAINER_CLASS} text-white flex flex-col justify-center`}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-electric/25 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute -right-6 bottom-0 w-48 h-48 rounded-full bg-ember/20 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="max-w-page mx-auto w-full px-4 sm:px-6 relative space-y-2 sm:space-y-3">
          {/* Label "Halo, {nama}" dihapus atas permintaan - banner langsung
              menampilkan judulnya saja. */}
          <h1 className="text-heading-sm sm:text-heading font-heading font-semibold max-w-3xl line-clamp-2">
          Platform Dimana Seluruh Siswa<span className="underline decoration-2 underline-offset-2"> Dengan Mudah Berwirausaha</span>
          </h1>
          <div className="mt-6 sm:mt-10">
            <Link href="/marketplace" className="btn-ember inline-flex items-center gap-2 !px-4 sm:!px-5 !py-2 sm:!py-2.5 text-xs sm:text-sm">
              Marketplace <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    ) : (
      <div className={SLIDE_CONTAINER_CLASS}>
        <img src={current.image_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
        {current.title && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent p-4 sm:p-6">
            <div className="max-w-page mx-auto px-4 sm:px-6">
              <p className="text-white font-heading font-semibold text-lg sm:text-2xl drop-shadow-md">{current.title}</p>
            </div>
          </div>
        )}
      </div>
    );

  return (
    <section className="relative group bg-ink">
      {current.type === "image" && current.link_url ? <Link href={current.link_url}>{slideContent}</Link> : slideContent}

      {slides.length > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-ink rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
            aria-label="Slide sebelumnya"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-ink rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
            aria-label="Slide selanjutnya"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-10">
            {slides.map((s, i) => (
              <button
                key={s.key}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "bg-white w-6" : "bg-white/40 w-2"}`}
                aria-label={`Ke slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { UserRound, MessageCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import ProductCard, { ProductCardData } from "@/components/ProductCard";
import RatingStars from "@/components/RatingStars";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

interface PublicUser {
  id: number;
  full_name: string;
  class_name: string;
  role: string;
  profile_photo_url: string | null;
  banner_url: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  siswa: "Siswa",
  kwu_brital: "Staf - Ayam Geprek Brital",
  kwu_laundry: "Staf - Laundry",
  cs: "Customer Service",
  admin: "Admin",
};

// Profil publik siswa lain: foto, banner, kelas, role, produk yang dijual,
// dan rating agregat sebagai penjual.
export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user: me } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [rating, setRating] = useState({ avg_rating: 0, rating_count: 0 });

  useEffect(() => {
    api<{ user: PublicUser; products: ProductCardData[]; rating: typeof rating }>(`/users/${userId}`)
      .then((d) => {
        setProfile(d.user);
        setProducts(d.products);
        setRating(d.rating);
      })
      .catch(() => setProfile(null));
  }, [userId]);

  async function handleChat() {
    if (!profile) return;
    const { chat } = await api<{ chat: { id: string } }>("/chats", {
      method: "POST",
      json: { seller_id: profile.id },
    });
    router.push(`/chat/${chat.id}`);
  }

  if (!profile) {
    return (
      <main className="min-h-screen">
        <Navbar />
        <p className="text-center py-10 text-fog font-body">Memuat profil...</p>
      </main>
    );
  }

  const isMe = me?.id === profile.id;

  return (
    <main className="min-h-screen pb-20 md:pb-8 bg-paper">
      <Navbar />
      <div className="max-w-page mx-auto">
        <div className="relative w-full h-28 sm:h-36 bg-gradient-to-br from-electric to-ink overflow-hidden">
          {profile.banner_url && <img src={profile.banner_url} alt="Banner" decoding="async" className="h-full w-full object-cover" />}
        </div>

        <div className="px-4 sm:px-6 -mt-9 pb-4">
          <div className="relative w-20 h-20 rounded-full bg-electric-100 overflow-hidden border-4 border-paper shrink-0">
            {profile.profile_photo_url ? (
              <img src={profile.profile_photo_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-electric">
                <UserRound size={32} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <h1 className="text-heading-sm font-heading font-semibold text-ink truncate">{profile.full_name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge-tagline bg-parchment text-ink !py-1">{ROLE_LABEL[profile.role] || profile.role}</span>
                <span className="text-sm text-steel font-body">{profile.class_name}</span>
              </div>
              {rating.rating_count > 0 && <RatingStars value={rating.avg_rating} count={rating.rating_count} />}
            </div>
            {!isMe && (
              <button onClick={handleChat} className="btn-primary !px-5 !py-2.5 flex items-center gap-2 text-sm shrink-0">
                <MessageCircle size={16} aria-hidden="true" /> Chat
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pb-8">
          <h2 className="text-heading-sm font-heading font-semibold mb-3 text-ink">Produk yang dijual</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
            {products.length === 0 && <p className="col-span-full text-fog font-body text-sm">Belum ada produk yang dijual.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

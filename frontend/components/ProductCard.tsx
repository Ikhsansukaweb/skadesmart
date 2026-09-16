import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed, ShoppingBag, PackageX, Lock } from "lucide-react";
import RatingStars from "./RatingStars";

const CATEGORY_META: Record<string, { label: string; icon: any }> = {
  kwu_brital: { label: "Ayam Geprek Brital", icon: UtensilsCrossed },
  siswa: { label: "Jualan Siswa", icon: ShoppingBag },
};

export interface ProductCardData {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  category: string;
  stock: number;
  seller_shop_open?: number | boolean | null;
  avg_rating?: number | null;
  rating_count?: number | null;
}

export default function ProductCard({ product }: { product: ProductCardData }) {
  const meta = CATEGORY_META[product.category] || CATEGORY_META.siswa;
  const Icon = meta.icon;
  const isClosed = product.category === "kwu_brital" && product.seller_shop_open !== undefined && !product.seller_shop_open;

  return (
    <Link
      href={`/product/${product.id}`}
      className="card overflow-hidden hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-electric"
    >
      <div className="relative w-full aspect-square bg-parchment">
        {product.image_url ? (
          <img src={product.image_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fog">
            <Icon size={40} aria-hidden="true" />
          </div>
        )}
        {isClosed ? (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 text-white font-sub text-sm">
            <Lock size={16} aria-hidden="true" /> Toko tutup
          </div>
        ) : product.stock === 0 ? (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2 text-white font-sub text-sm">
            <PackageX size={16} aria-hidden="true" /> Stok habis
          </div>
        ) : null}
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-1 text-xs text-electric font-sub">
          <Icon size={12} aria-hidden="true" />
          {meta.label}
        </div>
        <h3 className="font-sub font-medium text-sm line-clamp-2">{product.name}</h3>
        <p className="font-heading text-ink">Rp{product.price.toLocaleString("id-ID")}</p>
        {product.avg_rating ? (
          <RatingStars value={product.avg_rating} count={product.rating_count || 0} size={12} />
        ) : (
          <span className="text-xs text-fog font-body">Belum ada rating</span>
        )}
      </div>
    </Link>
  );
}

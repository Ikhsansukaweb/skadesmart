import { Star } from "lucide-react";

export default function RatingStars({
  value,
  count,
  size = 16,
}: {
  value: number;
  count?: number;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1" aria-label={`Rating ${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden="true"
          className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-300"}
        />
      ))}
      {typeof count === "number" && (
        <span className="text-xs text-steel font-body ml-1">({count})</span>
      )}
    </div>
  );
}

"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star, LoaderCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

// Rating Page: siswa memberi rating/ulasan setelah pesanan (Brital atau
// Laundry) berstatus selesai. Terikat langsung ke order_id.
export default function RatingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();

  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api("/ratings", {
        method: "POST",
        json: { order_id: Number(orderId), score, comment: comment || undefined },
      });
      router.push("/orders/status");
    } catch (err: any) {
      setError(err.message || "Gagal mengirim rating.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-6">
        <h1 className="text-2xl text-brand-700 mb-1">Beri Rating</h1>
        <p className="text-sm text-steel font-body mb-4">Bagaimana pengalamanmu dengan pesanan ini?</p>

        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div className="flex justify-center gap-2" role="radiogroup" aria-label="Skor rating">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={score === s}
                onClick={() => setScore(s)}
                className="p-1"
              >
                <Star size={32} className={s <= score ? "fill-amber-400 text-amber-400" : "text-slate-300"} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="comment" className="block text-sm font-sub mb-1 text-steel">Ulasan (opsional)</label>
            <textarea id="comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} className="input-field" />
          </div>

          {error && <p role="alert" className="text-sm text-red-600 font-body">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            Kirim Rating
          </button>
        </form>
      </div>
    </main>
  );
}

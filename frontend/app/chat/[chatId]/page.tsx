"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Send,
  Image as ImageIcon,
  UserRound,
  LoaderCircle,
  ArrowLeft,
  MoreVertical,
  BellOff,
  Bell,
  Trash2,
  Star,
  Bot,
  CheckCircle2,
  X,
  Store,
} from "lucide-react";
import { api, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ambilPesan, kirimPesan, sendRatingRequest, tandaiDibaca } from "@/lib/chat-utils";
import { useKejadian } from "@/lib/realtime";

interface ChatMeta {
  id: string;
  buyer_id: number;
  seller_id: number | null;
  unit_slug: string | null;
  cs_mode: "ai" | "human";
}

interface OtherUser {
  id: number | null;
  full_name: string;
  profile_photo_url: string | null;
  role: string;
  is_unit: boolean;
}

interface ChatProduct {
  id: number;
  name: string;
  price: number;
  category: string;
  seller_id: number;
}

interface Message {
  id: string;
  /** dari server (SQLite): angka pengirim, null untuk pesan sistem */
  sender_id?: number | null;
  /** gaya lama (Firestore) - masih dibaca kalau ada */
  senderId?: string;
  /** isi pesan dari server; `text` adalah nama lama */
  isi?: string;
  text?: string;
  imageUrl?: string;
  type?: "rating_request";
  orderId?: number;
  isAi?: boolean;
  /** dari server: "YYYY-MM-DD HH:MM:SS" (UTC) */
  created_at?: string;
  createdAt?: any;
  /** penanda sementara saat pesan sedang dikirim */
  _mengirim?: boolean;
  /** penanda sementara saat pengiriman gagal */
  _gagal?: boolean;
}

const SEND_COOLDOWN_MS = 2000;

// Chat Page (detail) - mirip WhatsApp: header dengan tombol kembali + menu
// titik-tiga, bubble teks/foto, kartu permintaan rating, balasan AI CS
// bertanda "Bot", dan tombol "Tandai Selesai" untuk jualan siswa.
export default function ChatDetailPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // Apakah layar kecil (ponsel). Sama seperti di /chat: perangkat sentuh
  // berukuran kecil diperlakukan sebagai ponsel, dan perubahannya diikuti.
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const tanya = window.matchMedia("(max-width: 1023px) and (pointer: coarse)");
    const hitung = () => setIsMobile(tanya.matches || window.innerWidth < 768);
    hitung();
    tanya.addEventListener("change", hitung);
    window.addEventListener("resize", hitung);
    return () => {
      tanya.removeEventListener("change", hitung);
      window.removeEventListener("resize", hitung);
    };
  }, []);

  // Di desktop, tata letak layar-penuh di berkas ini salah tempat: halaman ini
  // dirancang untuk ponsel (tanpa navbar, terkunci setinggi layar). Desktop
  // punya tampilan pecah-dua di /chat yang menampilkan daftar percakapan
  // sekaligus isinya.
  //
  // Karena itu di desktop kita alihkan ke sana sambil membawa id percakapan,
  // sehingga tombol "Chat" di detail produk / profil / halaman CS tetap mendarat
  // di tempat yang benar. Di ponsel, halaman ini tetap dipakai apa adanya.
  useEffect(() => {
    if (isMobile === false && chatId) {
      router.replace(`/chat?chat=${encodeURIComponent(String(chatId))}`);
    }
  }, [isMobile, chatId, router]);

  // Sambil menunggu ukuran layar diketahui (atau saat dialihkan di desktop),
  // jangan gambar isi percakapan supaya tidak berkedip dari tata letak ponsel
  // ke desktop.
  //
  // PENTING: pemisahan ini dilakukan dengan `tampilkanIsi`, BUKAN `return`
  // lebih awal. `return` sebelum pemanggilan hook berikutnya akan melanggar
  // aturan Hooks React (urutan hook harus sama pada setiap render).
  const tampilkanIsi = isMobile === true;

  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [other, setOther] = useState<OtherUser | null>(null);
  const [product, setProduct] = useState<ChatProduct | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ chat: ChatMeta; other: OtherUser; product: ChatProduct | null }>(`/chats/${chatId}`)
      .then((d) => {
        setMeta(d.chat);
        setOther(d.other);
        setProduct(d.product);
      })
      .catch(() => {});
  }, [chatId]);

  // Muat riwayat pesan lewat HTTP (server juga menandainya sudah dibaca).
  const muatPesan = useCallback(async () => {
    try {
      const d = await ambilPesan(chatId);
      setMessages(d.pesan as unknown as Message[]);
    } catch {
      /* biarkan daftar kosong dulu */
    }
  }, [chatId]);

  useEffect(() => {
    muatPesan();
  }, [muatPesan]);

  // Pesan baru dari WebSocket — menggantikan onSnapshot Firestore.
  // Cukup satu koneksi untuk semua chat, bukan satu listener per chat.
  useKejadian("chat:pesan", (k) => {
    if (k.chatId !== chatId) return;
    setMessages((prev) => {
      // Hindari duplikat: pesan yang kita kirim sendiri sudah ditambahkan
      // optimistis saat pengiriman, dan sekarang datang lagi dari server.
      if (prev.some((m) => m.id === k.pesan.id)) return prev;
      return [...prev, k.pesan as unknown as Message];
    });
    // Chat sedang terbuka -> langsung tandai dibaca di server supaya lencana
    // ikut turun.
    void tandaiDibaca(chatId);
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const isCsChat = other?.role === "cs";

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || cooldown) return;
    const cleanText = text.trim();
    setText("");

    // Tampilkan pesan dulu di layar supaya terasa langsung — jangan tunggu
    // balasan server. Kalau gagal, pesannya ditandai.
    const sementaraId = `sementara-${Date.now()}`;
    const sementara = {
      id: sementaraId,
      sender_id: user.id,
      text: cleanText,
      isi: cleanText,
      created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      _mengirim: true,
    } as unknown as Message;
    setMessages((prev) => [...prev, sementara]);

    try {
      // Satu permintaan: server menyimpan, menyebar real-time, dan
      // mengirim notifikasi. Dulu butuh addDoc + satu panggilan API lagi.
      const tersimpan = await kirimPesan(chatId, cleanText);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sementaraId ? (tersimpan as unknown as Message) : m,
        ),
      );
    } catch {
      // Tandai gagal, dan kembalikan teksnya supaya bisa dikirim ulang.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sementaraId ? ({ ...m, _gagal: true } as unknown as Message) : m,
        ),
      );
    }

    // Cooldown 2 detik khusus chat CS (AI) supaya tidak spam ke AI gateway.
    if (isCsChat && meta?.cs_mode === "ai") {
      setCooldown(true);
      setTimeout(() => setCooldown(false), SEND_COOLDOWN_MS);
    }
  }

  async function handleSendImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    setSendingImage(true);
    try {
      const imageUrl = await uploadImage(file);
      // Foto dikirim lewat jalur yang sama dengan teks: server menyimpannya
      // dan menyebarkannya lewat WebSocket.
      // WAJIB lewat api(): fetch() langsung tidak menyertakan header
      // `x-csrf-token`, sehingga server menolak dengan 403.
      await api("/chats/notify", {
        method: "POST",
        json: { chat_id: chatId, image_url: imageUrl },
      });
    } catch (err: any) {
      alert(err.message || "Gagal mengirim foto.");
    } finally {
      setSendingImage(false);
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMenuOpen(false);
    await api(`/chats/${chatId}/mute`, { method: "PUT", json: { muted: next } }).catch(() => {});
  }

  async function handleDeleteChat() {
    if (!confirm("Hapus chat ini dari daftarmu?")) return;
    await api(`/chats/${chatId}`, { method: "DELETE" }).catch(() => {});
    router.push("/chat");
  }

  // Penjual jualan siswa bisa menandai transaksi informal ini selesai,
  // sekaligus langsung kirim kartu permintaan rating ke pembeli. Tidak
  // relevan untuk chat unit KWU (yang punya alur order/status formal sendiri).
  const canCompleteSale = !!(
    user && product && product.seller_id === user.id && product.category === "siswa" && other && other.id && !other.is_unit
  );

  async function handleCompleteSale(price: number) {
    if (!user || !other || !other.id) return;
    try {
      const { id: orderId } = await api<{ id: number }>("/orders/siswa/complete", {
        method: "POST",
        json: { buyer_id: other.id, product_id: product?.id, price },
      });
      await sendRatingRequest(user.id, other.id, orderId);
      setCompleteModalOpen(false);
      setMenuOpen(false);
    } catch (err: any) {
      alert(err.message || "Gagal menandai transaksi selesai.");
    }
  }

  // Ukuran layar belum diketahui, atau ini desktop dan kita sedang mengalihkan
  // ke /chat. Tahan tampilan supaya tidak ada kedipan tata letak.
  if (!tampilkanIsi) {
    return (
      <main className="h-[100dvh] flex items-center justify-center bg-parchment/30">
        <p className="text-sm font-body text-steel">Memuat percakapan...</p>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] overflow-hidden flex flex-col">
      <div className="shrink-0 z-20 bg-white border-b border-sand px-2 py-2 flex items-center gap-2 max-w-2xl w-full mx-auto">
        <button onClick={() => router.push("/chat")} className="p-2 text-ink" aria-label="Kembali">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        {other && (
          <ChatHeaderIdentity other={other} isCsChat={isCsChat} csMode={meta?.cs_mode} />
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-2 text-ink" aria-label="Menu chat">
            <MoreVertical size={20} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 bg-white border border-sand rounded-badge shadow-lg py-1 w-64 z-30">
              {canCompleteSale && (
                <button
                  onClick={() => { setCompleteModalOpen(true); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-body text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Tandai Selesai & Minta Rating
                </button>
              )}
              <button onClick={toggleMute} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-body text-ink hover:bg-parchment">
                {muted ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
                {muted ? "Aktifkan notifikasi" : "Senyapkan notifikasi"}
              </button>
              <button onClick={handleDeleteChat} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-body text-red-600 hover:bg-red-50">
                <Trash2 size={16} aria-hidden="true" />
                Hapus chat
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col px-4 py-4">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pb-4">
          {messages.map((m) => {
            // Server mengirim `sender_id` (angka); kode lama memakai `senderId`
            // (string) dari Firestore. Keduanya dibaca supaya pesan lama yang
            // masih di memori tetap tampil benar.
            const pengirim = m.sender_id ?? m.senderId;
            const mine = pengirim != null && String(pengirim) === String(user?.id);
            // Server menamai isi pesan `isi`; kode lama `text`. Ambil yang ada.
            const teks = m.isi ?? m.text ?? "";
            const foto = m.imageUrl ?? (m as { image_url?: string }).image_url;
            const sedangKirim = m._mengirim === true;
            const gagalKirim = m._gagal === true;

            if (m.type === "rating_request") {
              return (
                <div key={m.id} className="flex justify-center py-2">
                  <Link href={`/rating/${m.orderId}`} className="card p-3 flex items-center gap-2 text-sm font-sub text-ink hover:shadow-md">
                    <Star size={16} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                    {m.text || "Pesananmu selesai! Beri rating sekarang"}
                  </Link>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {m.isAi && !mine && (
                  <span className="flex items-center gap-1 text-[10px] text-fog font-sub mb-0.5 ml-1">
                    <Bot size={10} aria-hidden="true" /> Bot
                  </span>
                )}
                {foto ? (
                  <div className="max-w-[75%] space-y-1">
                    <div className={`relative w-48 h-48 rounded-card overflow-hidden ${mine ? "rounded-br-sm ml-auto" : "rounded-bl-sm"}`}>
                      <img src={foto} alt="Foto terkirim" decoding="async" className="h-full w-full object-cover" />
                    </div>
                    {teks && (
                      <div className={`px-3 py-1.5 rounded-badge text-sm font-body ${mine ? "bg-electric text-white ml-auto w-fit" : "bg-white border border-sand w-fit"}`}>
                        {teks}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-card text-sm font-body whitespace-pre-line ${
                      mine ? "bg-electric text-white rounded-br-sm" : "bg-white border border-sand rounded-bl-sm"
                    } ${sedangKirim ? "opacity-60" : ""} ${gagalKirim ? "border-red-400" : ""}`}
                  >
                    {teks}
                    {gagalKirim && (
                      <span className="block text-[10px] mt-0.5 text-red-200">
                        Gagal terkirim
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {messages.length === 0 && (
            <p className="text-center text-fog font-body text-sm py-8">
              {isCsChat ? "Tanya apa saja ke asisten CS kami, atau ketik 1 untuk bicara dengan manusia." : "Mulai percakapan..."}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSend}
          className="shrink-0 flex gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-paper"
        >
          <label className="btn-secondary flex items-center justify-center px-3 cursor-pointer">
            {sendingImage ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <ImageIcon size={18} aria-hidden="true" />}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleSendImage} className="hidden" disabled={sendingImage} />
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={cooldown ? "Tunggu sebentar..." : "Tulis pesan..."}
            className="input-field flex-1"
            aria-label="Tulis pesan"
            maxLength={2000}
            disabled={cooldown}
          />
          <button type="submit" disabled={cooldown} className="btn-primary flex items-center justify-center px-4 disabled:opacity-50">
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      </div>

      {completeModalOpen && product && (
        <CompleteSaleModal
          productName={product.name}
          defaultPrice={product.price}
          onClose={() => setCompleteModalOpen(false)}
          onConfirm={handleCompleteSale}
        />
      )}
    </main>
  );
}

function ChatHeaderIdentity({
  other,
  isCsChat,
  csMode,
}: {
  other: OtherUser;
  isCsChat: boolean;
  csMode?: "ai" | "human";
}) {
  const content = (
    <>
      <div className="relative w-9 h-9 rounded-full bg-electric-100 overflow-hidden shrink-0">
        {other.is_unit ? (
          <div className="w-full h-full flex items-center justify-center text-electric">
            <Store size={16} aria-hidden="true" />
          </div>
        ) : other.profile_photo_url ? (
          <img src={other.profile_photo_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-electric">
            <UserRound size={16} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <span className="font-sub font-medium text-sm truncate block">{other.full_name}</span>
        {isCsChat && (
          <span className="text-xs text-fog font-body">
            {csMode === "human" ? "Terhubung dengan CS manusia" : "Dibalas otomatis oleh bot"}
          </span>
        )}
        {other.is_unit && (
          <span className="text-xs text-fog font-body">Dibalas staf yang sedang bertugas</span>
        )}
      </div>
    </>
  );

  // Chat milik unit KWU tidak punya halaman profil individu untuk dituju.
  if (other.is_unit || !other.id) {
    return <div className="flex items-center gap-3 flex-1 min-w-0">{content}</div>;
  }

  return (
    <Link href={`/profile/${other.id}`} className="flex items-center gap-3 flex-1 min-w-0">
      {content}
    </Link>
  );
}

function CompleteSaleModal({
  productName,
  defaultPrice,
  onClose,
  onConfirm,
}: {
  productName: string;
  defaultPrice: number;
  onClose: () => void;
  onConfirm: (price: number) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(defaultPrice));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onConfirm(Number(price));
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <form onSubmit={handleSubmit} className="relative card p-5 w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-sub font-medium text-ink">Tandai Transaksi Selesai</h2>
          <button type="button" onClick={onClose} className="p-1 text-fog" aria-label="Tutup">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-steel font-body">{productName}</p>
        <div>
          <label htmlFor="sale_price" className="block text-sm font-sub mb-1 text-steel">Harga transaksi (Rp)</label>
          <input id="sale_price" type="number" min={0} required value={price} onChange={(e) => setPrice(e.target.value)} className="input-field" />
        </div>
        <p className="text-xs text-fog font-body">
          Pembeli akan langsung dikirimi kartu untuk memberi rating & ulasan di chat ini.
        </p>
        <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
          {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          Konfirmasi Selesai
        </button>
      </form>
    </div>
  );
}

"use client";

// =============================================================================
// KwuChatPanel — panel chat KWU terpisah untuk dashboard brital/laundry.
//
// Berbeda dari /chat (yang menampilkan SEMUA chat: 1:1, CS, dan unit),
// panel ini HANYA menampilkan chat milik satu unit KWU tertentu
// (kwu_brital atau kwu_laundry).
//
// Semua role bisa membuka panel ini dan membalas — backend sudah menangani
// akses via canAccessChat() yang memeriksa unit_slug vs role pengirim.
// Real-time: WebSocket lewat realtime.langganan (chat:pesan).
//
// Layout:
//   Desktop: split-view (daftar kiri, detail kanan).
//   Mobile: daftar, lalu detail layar penuh saat chat dipilih.
// =============================================================================

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  MessageCircleOff,
  UserRound,
  Store,
  Trash2,
  Send,
  Image as ImageIcon,
  LoaderCircle,
  ArrowLeft,
} from "lucide-react";
import { api, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ambilPesan, kirimPesan, tandaiDibaca } from "@/lib/chat-utils";
import { realtime, useKejadian } from "@/lib/realtime";

// --- tipe data -------------------------------------------------------------

interface ChatMetaRow {
  id: string;
  other_id: number | null;
  other_name: string;
  other_photo: string | null;
  is_unit: boolean;
  last_message?: string;
  last_message_at?: string;
  last_sender_id?: number | null;
  unit_slug?: string | null;
  buyer_id?: number;
  seller_id?: number | null;
}

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

interface Message {
  id: string;
  sender_id?: number | null;
  senderId?: string;
  isi?: string;
  text?: string;
  imageUrl?: string;
  image_url?: string;
  created_at?: string;
  createdAt?: string;
  _mengirim?: boolean;
  _gagal?: boolean;
}

// --- props -----------------------------------------------------------------

interface KwuChatPanelProps {
  /** Slug unit KWU: "kwu_brital" atau "kwu_laundry". */
  unitSlug: string;
  /** Nama tampilan unit, mis. "Ayam Geprek Brital". */
  unitName: string;
}

// --- komponen utama --------------------------------------------------------

export default function KwuChatPanel({
  unitSlug,
  unitName,
}: KwuChatPanelProps) {
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sendingImage, setSendingImage] = useState(false);

  // Daftar chat
  const [metaMap, setMetaMap] = useState<Record<string, ChatMetaRow>>({});
  const [liveChats, setLiveChats] = useState<Record<string, { lastMessage: string; lastMessageAt: number; lastSenderId?: string | number }>>({});
  const [memuat, setMemuat] = useState(true);
  const metaMapRef = useRef<Record<string, ChatMetaRow>>({});
  const metaFetchInFlight = useRef(false);

  // Ambil SEMUA chat milik unit ini (bukan cuma chat pribadi staf).
  // Endpoint khusus ini penting: kalau memakai /chats biasa, staf hanya melihat
  // percakapan yang dia sendiri mulai, sehingga chat pembeli yang dibalas staf
  // lain (shift berbeda) tidak kelihatan.
  const fetchMeta = useCallback(async () => {
    if (!user || metaFetchInFlight.current) return;
    metaFetchInFlight.current = true;
    try {
      const data = await api<{ chats: ChatMetaRow[] }>(`/chats/unit/${unitSlug}`);
      const map: Record<string, ChatMetaRow> = {};
      data.chats.forEach((c) => {
        map[c.id] = c;
      });
      metaMapRef.current = map;
      setMetaMap(map);
    } catch (err) {
      console.error("[KwuChat] Gagal memuat daftar chat unit:", err);
    } finally {
      metaFetchInFlight.current = false;
      setMemuat(false);
    }
  }, [user, unitSlug]);

  // Deteksi mobile.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Muat daftar chat saat halaman dibuka.
  useEffect(() => {
    if (user) fetchMeta();
  }, [user, fetchMeta]);

  // Real-time: pesan baru -> perbarui daftar + detail jika sedang dibuka.
  useEffect(() => {
    if (!user) return;

    const updateChat = (chatId: string, patch: Partial<{ lastMessage: string; lastMessageAt: number; lastSenderId: string | number }>) => {
      setLiveChats((prev) => ({
        ...prev,
        [chatId]: { ...prev[chatId], ...patch },
      }));
    };

    const unsubscribe = realtime.langganan((k) => {
      if (k.type === "chat:pesan") {
        // Hanya chat yang ada di daftar unit ini.
        if (!metaMapRef.current[k.chatId]) return;
        updateChat(k.chatId, {
          lastMessage: k.lastMessage ?? k.pesan.isi,
          lastSenderId: k.lastSenderId ?? k.pesan.sender_id ?? undefined,
          lastMessageAt: k.lastMessageAt
            ? new Date(k.lastMessageAt.replace(" ", "T") + "Z").getTime()
            : Date.now(),
        });
        return;
      }
      if (k.type === "chat:belum-dibaca") {
        if (metaMapRef.current[k.chatId]) fetchMeta();
      }
    });

    return () => unsubscribe();
  }, [user, fetchMeta]);

  // Pesan masuk untuk chat yang sedang dibuka -> tambahkan ke daftar.
  useKejadian("chat:pesan", (k) => {
    if (k.chatId !== selectedChatId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === k.pesan.id)) return prev;
      return [...prev, k.pesan as unknown as Message];
    });
    void tandaiDibaca(k.chatId);
  });

  // Gabungkan daftar dari meta (HTTP) + live (WebSocket).
  const merged = useMemo(() => {
    const allIds = new Set<string>([
      ...Object.keys(metaMap),
      ...Object.keys(liveChats),
    ]);
    return Array.from(allIds)
      .map((id) => {
        const meta = metaMap[id];
        const lc = liveChats[id] ?? { lastMessage: "", lastMessageAt: 0 };
        const waktuMeta = meta?.last_message_at
          ? new Date(meta.last_message_at).getTime()
          : 0;
        const lastMessageAt = Math.max(lc.lastMessageAt || 0, waktuMeta);
        const lastMsgText =
          waktuMeta > 0 && waktuMeta >= (lc.lastMessageAt || 0)
            ? meta?.last_message || lc.lastMessage
            : lc.lastMessage || meta?.last_message || "";
        const lastSenderId = lc.lastSenderId ?? meta?.last_sender_id;
        const dariSaya =
          lastSenderId != null && String(lastSenderId) === String(user?.id);
        const unread = !!lastMsgText && !dariSaya && lastMessageAt > 0;
        return {
          id,
          other_id: meta?.other_id ?? null,
          other_name: meta?.other_name || "Pembeli",
          other_photo: meta?.other_photo || null,
          is_unit: meta?.is_unit ?? false,
          lastMessage: lastMsgText || "Belum ada pesan",
          lastMessageAt,
          unread,
        };
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [metaMap, liveChats, user]);

  // Tandai sudah dibaca.
  useEffect(() => {
    if (!user || merged.length === 0) return;
    merged.filter((c) => c.unread).forEach((c) => void tandaiDibaca(c.id));
  }, [user, merged]);

  useEffect(() => {
    if (!selectedChatId) return;
    // Kabari server bahwa chat ini sedang dibuka (supaya tidak bunyi notifikasi).
    realtime.setChatDibuka(selectedChatId);
    return () => {
      realtime.setChatDibuka(null);
    };
  }, [selectedChatId]);

  // Muat detail chat terpilih.
  const muatPesan = useCallback(async (id: string) => {
    try {
      const d = await ambilPesan(id);
      setMessages(d.pesan as unknown as Message[]);
    } catch {
      /* biarkan daftar lama */
    }
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    api<{ chat: ChatMeta; other: OtherUser }>(`/chats/${selectedChatId}`)
      .then((d) => {
        setChatMeta(d.chat);
        setOtherUser(d.other);
      })
      .catch(() => {
        setChatMeta(null);
        setOtherUser(null);
      });
    setMessages([]);
    void muatPesan(selectedChatId);
  }, [selectedChatId, muatPesan]);

  // Auto-scroll.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // --- aksi ---

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || !selectedChatId) return;
    const cleanText = text.trim();
    setText("");
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: user.id,
        text: cleanText,
        isi: cleanText,
        created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        _mengirim: true,
      } as unknown as Message,
    ]);
    setLiveChats((prev) => ({
      ...prev,
      [selectedChatId]: {
        lastMessage: cleanText,
        lastSenderId: String(user.id),
        lastMessageAt: Date.now(),
      },
    }));
    try {
      const saved = await kirimPesan(selectedChatId, cleanText);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (saved as unknown as Message) : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? ({ ...m, _gagal: true, _mengirim: false } as unknown as Message) : m,
        ),
      );
    }
  }

  async function handleSendImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedChatId) return;
    e.target.value = "";
    setSendingImage(true);
    try {
      const imageUrl = await uploadImage(file);
      await api("/chats/notify", {
        method: "POST",
        json: { chat_id: selectedChatId, image_url: imageUrl },
      });
      setLiveChats((prev) => ({
        ...prev,
        [selectedChatId]: {
          lastMessage: "Mengirim foto",
          lastSenderId: String(user.id),
          lastMessageAt: Date.now(),
        },
      }));
    } catch (err: any) {
      alert(err.message || "Gagal mengirim foto.");
    } finally {
      setSendingImage(false);
    }
  }

  async function handleDeleteChat() {
    if (!selectedChatId || !confirm("Hapus chat ini dari daftar?")) return;
    const deleted = selectedChatId;
    await api(`/chats/${deleted}`, { method: "DELETE" }).catch(() => {});
    setMetaMap((prev) => {
      const next = { ...prev };
      delete next[deleted];
      metaMapRef.current = next;
      return next;
    });
    setLiveChats((prev) => {
      const next = { ...prev };
      delete next[deleted];
      return next;
    });
    setSelectedChatId(null);
    setChatMeta(null);
    setOtherUser(null);
    setMessages([]);
  }

  // --- render ---

  if (isMobile === null) {
    return (
      <main className="h-[100dvh] flex items-center justify-center bg-peran-halaman">
        <p className="font-body text-sm text-peran-kedua">Memuat…</p>
      </main>
    );
  }

  // Mobile: daftar atau detail.
  if (isMobile) {
    return (
      <main className="h-[100dvh] overflow-hidden flex flex-col bg-peran-halaman">
        {selectedChatId ? (
          <KwuChatDetail
            unitName={unitName}
            other={otherUser}
            messages={messages}
            text={text}
            setText={setText}
            sendingImage={sendingImage}
            handleSend={handleSend}
            handleSendImage={handleSendImage}
            handleDeleteChat={handleDeleteChat}
            bottomRef={bottomRef}
            onBack={() => setSelectedChatId(null)}
            user={user}
          />
        ) : (
          <KwuChatList
            unitName={unitName}
            merged={merged}
            memuat={memuat}
            onSelectChat={(id) => setSelectedChatId(id)}
          />
        )}
      </main>
    );
  }

  // Desktop: split view.
  return (
    <main className="h-[calc(100dvh-57px)] overflow-hidden bg-peran-halaman">
      <div className="flex h-full max-w-[1600px] mx-auto">
        {/* Daftar chat */}
        <aside className="w-96 flex-shrink-0 border-r border-peran-garis bg-peran-kartu flex flex-col">
          <KwuChatList
            unitName={unitName}
            merged={merged}
            memuat={memuat}
            selectedId={selectedChatId}
            onSelectChat={(id) => setSelectedChatId(id)}
          />
        </aside>

        {/* Detail chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedChatId ? (
            <KwuChatDetail
              unitName={unitName}
              other={otherUser}
              messages={messages}
              text={text}
              setText={setText}
              sendingImage={sendingImage}
              handleSend={handleSend}
              handleSendImage={handleSendImage}
              handleDeleteChat={handleDeleteChat}
              bottomRef={bottomRef}
              user={user}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <MessageCircleOff size={48} className="mx-auto text-peran-samar/50 mb-4" aria-hidden="true" />
                <h2 className="font-sub text-xl font-semibold text-peran-utama mb-2">
                  Pilih percakapan
                </h2>
                <p className="font-body text-sm text-peran-kedua">
                  Klik chat di daftar sebelah kiri untuk membalas
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// --- sub-komponen: daftar chat --------------------------------------------

function KwuChatList({
  unitName,
  merged,
  memuat,
  selectedId,
  onSelectChat,
}: {
  unitName: string;
  merged: { id: string; other_name: string; other_photo: string | null; lastMessage: string; lastMessageAt: number; unread: boolean }[];
  memuat: boolean;
  selectedId?: string | null;
  onSelectChat: (id: string) => void;
}) {
  return (
    <>
      <div className="p-4 border-b border-peran-garis flex items-center gap-2">
        <div>
          <h1 className="text-heading-sm font-sub font-semibold text-peran-utama">
            Chat {unitName}
          </h1>
          <p className="text-caption text-peran-kedua">
            Percakapan dengan pembeli unit
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
        {memuat ? (
          <div className="flex items-center justify-center py-12">
            <LoaderCircle size={20} className="animate-spin text-peran-aksi" aria-hidden="true" />
          </div>
        ) : merged.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 px-4 text-peran-samar">
            <MessageCircleOff size={32} aria-hidden="true" />
            <p className="font-body text-sm">Belum ada percakapan</p>
            <p className="font-body text-xs text-center">
              Pembeli yang chat ke {unitName} akan muncul di sini
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {merged.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className={`w-full card p-3 flex items-center gap-3 text-left transition-colors ${
                  selectedId === c.id
                    ? "bg-peran-sorot border-peran-aksi"
                    : "hover:bg-peran-lembut border-transparent"
                }`}
              >
                <div className="relative w-11 h-11 rounded-full bg-peran-aksi-lembut overflow-hidden shrink-0">
                  {c.other_photo ? (
                    <img
                      src={c.other_photo}
                      alt="Foto"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-peran-aksi">
                      <UserRound size={20} aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-sub truncate block ${
                        c.unread
                          ? "font-semibold text-peran-utama"
                          : "font-medium text-peran-utama"
                      }`}
                    >
                      {c.other_name}
                    </span>
                    <span className="text-[11px] text-peran-samar font-body whitespace-nowrap shrink-0">
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-body line-clamp-1 block ${
                      c.unread ? "text-peran-utama font-medium" : "text-peran-kedua"
                    }`}
                  >
                    {c.lastMessage}
                  </span>
                </div>
                {c.unread && (
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-peran-aksen shrink-0"
                    aria-label="Belum dibaca"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// --- sub-komponen: detail chat --------------------------------------------

function KwuChatDetail({
  unitName,
  other,
  messages,
  text,
  setText,
  sendingImage,
  handleSend,
  handleSendImage,
  handleDeleteChat,
  bottomRef,
  onBack,
  user,
}: {
  unitName: string;
  other: OtherUser | null;
  messages: Message[];
  text: string;
  setText: (t: string) => void;
  sendingImage: boolean;
  handleSend: (e: React.FormEvent) => Promise<void>;
  handleSendImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDeleteChat: () => Promise<void>;
  bottomRef: React.RefObject<HTMLDivElement>;
  onBack?: () => void;
  user: { id: number | string } | null | undefined;
}) {
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full bg-peran-kartu">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-peran-kartu border-b border-peran-garis px-4 py-3 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 text-peran-utama lg:hidden"
            aria-label="Kembali"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        )}
        {other && (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative w-10 h-10 rounded-full bg-peran-aksi-lembut overflow-hidden shrink-0">
              {other.profile_photo_url ? (
                <img
                  src={other.profile_photo_url}
                  alt="Foto"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-peran-aksi">
                  <UserRound size={18} aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="font-sub font-medium text-sm truncate block text-peran-utama">
                {other.full_name}
              </span>
              <span className="text-xs text-peran-kedua font-body">
                Chat {unitName}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={handleDeleteChat}
          className="p-2 text-peran-turun hover:bg-peran-turun-lembut rounded-full"
          aria-label="Hapus chat"
        >
          <Trash2 size={20} aria-hidden="true" />
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 px-4 py-4">
        {messages.map((m) => {
          const pengirim = m.sender_id ?? m.senderId;
          const mine = pengirim != null && String(pengirim) === String(user?.id);
          const teks = m.isi ?? m.text ?? "";
          const foto = m.imageUrl ?? m.image_url;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
            >
              {m._mengirim && (
                <span className="text-[10px] text-peran-samar font-body mb-0.5 mr-1">
                  Mengirim...
                </span>
              )}
              {m._gagal && (
                <span className="text-[10px] text-peran-turun font-body mb-0.5 mr-1">
                  Gagal kirim
                </span>
              )}
              {foto ? (
                <div className="max-w-[75%] space-y-1">
                  <div
                    className={`relative w-48 h-48 rounded-card overflow-hidden ${
                      mine ? "rounded-br-sm ml-auto" : "rounded-bl-sm"
                    }`}
                  >
                    <img
                      src={foto}
                      alt="Foto terkirim"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {teks && (
                    <div
                      className={`px-3 py-1.5 rounded-badge text-sm font-body ${
                        mine
                          ? "bg-peran-aksi text-peran-terang ml-auto w-fit"
                          : "bg-peran-kartu border border-peran-garis w-fit"
                      }`}
                    >
                      {teks}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-card text-sm font-body whitespace-pre-line ${
                    mine
                      ? "bg-peran-aksi text-peran-terang rounded-br-sm"
                      : "bg-peran-kartu border border-peran-garis rounded-bl-sm"
                  }`}
                >
                  {teks}
                </div>
              )}
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-center text-peran-samar font-body text-sm py-8">
            Mulai percakapan...
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-peran-garis px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-6 flex gap-2 bg-peran-kartu"
      >
        <label className="btn-secondary flex items-center justify-center px-3 cursor-pointer">
          {sendingImage ? (
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <ImageIcon size={18} aria-hidden="true" />
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSendImage}
            className="hidden"
            disabled={sendingImage}
          />
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tulis pesan..."
          className="input-field flex-1"
          aria-label="Tulis pesan"
          maxLength={2000}
        />
        <button
          type="submit"
          className="btn-primary flex items-center justify-center px-4"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

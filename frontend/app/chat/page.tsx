"use client";


// Selalu render ulang di server, jangan di-cache lama.
//
// Tanpa ini Next.js 16 menganggap halaman ini statis dan mengirim
// `cache-control: s-maxage=31536000`, sehingga browser/CDN menyajikan
// HTML lama sampai berhari-hari - perubahan tampilan tidak terlihat.
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageCircleOff,
  UserRound,
  Headset,
  Store,
  Trash2,
  Send,
  Image as ImageIcon,
  LoaderCircle,
  MoreVertical,
  BellOff,
  Bell,
  CheckCircle2,
  X,
  Star,
  Bot,
  ArrowLeft,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { api, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ambilPesan, kirimPesan, tandaiDibaca } from "@/lib/chat-utils";
import { realtime, useKejadian } from "@/lib/realtime";
import { sendRatingRequest } from "@/lib/chat-utils";

interface ChatMetaRow {
  id: string;
  other_id: number | null;
  other_name: string;
  other_photo: string | null;
  is_unit: boolean;
  // Kolom dari tabel `chats` (c.*) - dipakai untuk daftar percakapan.
  last_message?: string;
  last_message_at?: string;
  last_sender_id?: number | null;
  unit_slug?: string | null;
  buyer_id?: number;
  seller_id?: number | null;
}

interface LiveChat {
  id: string;
  lastMessage?: string;
  lastMessageAt?: any;
  lastSenderId?: string | number;
  lastReadAt?: Record<string, any>;
  otherName?: string;
  otherPhoto?: string;
  other_id?: number | null;
  otherId?: number | null;
  isUnit?: boolean;
  unitSlug?: string;
  unit_slug?: string;
}

interface MergedChat {
  id: string;
  other_id: number | null;
  other_name: string;
  other_photo: string | null;
  is_unit: boolean;
  lastMessage: string;
  lastMessageAt: number;
  unread: boolean;
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

const isKwuRole = (role?: string) => role === "kwu_brital" || role === "kwu_laundry";
const isCsRole = (role?: string) => role === "cs" || role === "admin";

/**
 * Pembungkus halaman /chat.
 *
 * `useSearchParams()` wajib berada di dalam batas <Suspense>; kalau tidak,
 * build produksi Next.js gagal dengan galat
 * "useSearchParams() should be wrapped in a suspense boundary".
 * Sebabnya: pembacaan query string membuat halaman ini dirender di sisi klien
 * (client-side bailout), jadi Next butuh tempat menahan tampilan sementara.
 */
export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[60vh] flex items-center justify-center">
          <p className="text-sm font-body text-steel">Memuat percakapan...</p>
        </main>
      }
    >
      <ChatPageDalam />
    </Suspense>
  );
}

function ChatPageDalam() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Percakapan yang diminta lewat alamat, mis. /chat?chat=<id>.
  //
  // Dipakai oleh tombol "Chat" di detail produk, halaman profil, dan halaman
  // CS. Dulu tautan-tautan itu mengarah ke /chat/<id> yang punya tata letak
  // layar-penuh sendiri (dirancang untuk ponsel), sehingga di desktop terbuka
  // seperti tampilan ponsel tanpa navbar. Sekarang /chat/<id> mengalihkan ke
  // sini supaya tetap memakai tampilan pecah-dua (daftar + isi) di desktop.
  const chatDariAlamat = searchParams.get("chat");
  // `null` = belum diketahui (masih menghitung saat pertama dirender).
  //
  // Sengaja bukan `false`: kalau dimulai dari `false`, halaman sempat
  // menggambar layout desktop lebih dulu, lalu berubah menjadi mobile di
  // perangkat ponsel (terlihat berkedip). Dengan `null` kita bisa menahan
  // tampilan satu saat sampai ukuran layar diketahui.
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(chatDariAlamat);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [chatProduct, setChatProduct] = useState<ChatProduct | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Chat list state
  const [metaMap, setMetaMap] = useState<Record<string, ChatMetaRow>>({});
  // Percakapan yang gagal dimuat (mis. sudah dihapus). Dipakai untuk
  // menampilkan penjelasan, bukan layar kosong "Mulai percakapan...".
  const [chatTidakAda, setChatTidakAda] = useState(false);
  const metaMapRef = useRef<Record<string, ChatMetaRow>>({});
  const [liveChats, setLiveChats] = useState<Record<string, LiveChat>>({});
  const metaFetchInFlightRef = useRef(false);
  const metaFetchAttemptedRef = useRef(false);

  const fetchMeta = useCallback(async () => {
    if (!user || metaFetchInFlightRef.current) return;
    metaFetchInFlightRef.current = true;
    metaFetchAttemptedRef.current = true;
    try {
      const data = await api<{ chats: ChatMetaRow[] }>("/chats");
      const map: Record<string, ChatMetaRow> = {};
      data.chats.forEach((c) => (map[c.id] = c));
      metaMapRef.current = map;
      setMetaMap(map);
    } catch (err) {
      console.error("[ChatList] Gagal memuat metadata chat:", err);
    } finally {
      metaFetchInFlightRef.current = false;
    }
  }, [user]);

  // Apakah layar kecil (mobile). Ditentukan dari lebar jendela + apakah
  // perangkatnya benar-benar sentuh.
  //
  // JANGAN hanya memakai lebar jendela: di desktop pengguna sering memakai
  // jendela yang tidak maksimal atau membuka DevTools sehingga lebarnya
  // menyusut di bawah 1024px - kalau hanya lebar yang dipakai, desktop ikut
  // memakai layout mobile (mis. tombol pesan di menu langsung masuk ke
  // tampilan ponsel).
  //
  // `matchMedia` juga mengikuti perubahan ukuran secara otomatis, jadi tidak
  // perlu memasang pendengar `resize` manual.
  useEffect(() => {
    const tanya = window.matchMedia("(max-width: 1023px)");
    const perbarui = () => setIsMobile(tanya.matches);
    perbarui();
    tanya.addEventListener("change", perbarui);
    return () => tanya.removeEventListener("change", perbarui);
  }, []);

  // Load chat list metadata
  useEffect(() => {
    if (!user || metaFetchAttemptedRef.current) return;
    fetchMeta();
  }, [user, fetchMeta]);

  // Daftar chat datang dari server lewat HTTP; perubahan menyusul lewat
  // WebSocket. Dulu perlu 2-3 listener Firestore (participants, unitSlug) yang
  // digabung manual — sekarang cukup satu sumber.
  useEffect(() => {
    if (!user) return;
    fetchMeta();
  }, [user, fetchMeta]);

  // Perubahan chat (pesan baru, belum dibaca) dari WebSocket.
  useEffect(() => {
    if (!user) return;

    const perbaruiChat = (chatId: string, tambalan: Partial<LiveChat>) => {
      setLiveChats((prev) => {
        const lama = prev[chatId] ?? ({ id: chatId } as LiveChat);
        return { ...prev, [chatId]: { ...lama, ...tambalan } };
      });
    };

    const lepas = realtime.langganan((k) => {
      if (k.type === "chat:pesan") {
        perbaruiChat(k.chatId, {
          id: k.chatId,
          lastMessage: k.lastMessage ?? k.pesan.isi,
          lastSenderId: k.lastSenderId ?? k.pesan.sender_id ?? undefined,
          // Simpan sebagai objek Date supaya bagian tampilan yang membaca
          // .toMillis()/.seconds tetap bekerja seperti versi Firestore.
          lastMessageAt: k.lastMessageAt
            ? ({ toMillis: () => new Date(k.lastMessageAt!.replace(" ", "T") + "Z").getTime() } as any)
            : undefined,
        } as Partial<LiveChat>);
        // Chat baru yang belum ada di daftar meta -> muat ulang daftarnya.
        if (!metaMapRef.current[k.chatId]) fetchMeta();
        return;
      }

      if (k.type === "chat:belum-dibaca") {
        perbaruiChat(k.chatId, { id: k.chatId } as Partial<LiveChat>);
      }
    });

    return () => lepas();
  }, [user, fetchMeta]);

  // Build merged chat list
  //
  // PENTING: sumber utamanya adalah `metaMap` (daftar chat dari server), bukan
  // `liveChats`. Sebelumnya kode ini hanya menelusuri `liveChats`, yang isinya
  // baru terisi saat ada kejadian WebSocket - jadi saat halaman pertama dibuka
  // daftarnya SELALU kosong ("Belum ada percakapan") meskipun server
  // mengembalikan banyak chat. `liveChats` sekarang hanya menimpa/menambah.
  const merged = useMemo((): MergedChat[] => {
    // Gabungkan kunci dari kedua sumber.
    const semuaId = new Set<string>([
      ...Object.keys(metaMap),
      ...Object.keys(liveChats),
    ]);

    return Array.from(semuaId)
      .map((id) => {
        const meta = metaMap[id];
        // `liveChats` boleh belum ada; pakai objek kosong sebagai gantinya.
        const lc: LiveChat = liveChats[id] ?? { id };
        const unitKey = lc.unitSlug || lc.unit_slug || meta?.unit_slug || "";
        const unitLabel =
          unitKey === "kwu_brital"
            ? "Ayam Geprek Brital"
            : unitKey === "kwu_laundry"
            ? "KWU Laundry"
            : "Unit KWU";

        // Waktu pesan terakhir: pakai yang paling baru di antara kedua sumber.
        const waktuLc = lc.lastMessageAt?.toMillis
          ? lc.lastMessageAt.toMillis()
          : lc.lastMessageAt?.seconds
          ? lc.lastMessageAt.seconds * 1000
          : 0;
        const waktuMeta = meta?.last_message_at
          ? new Date(meta.last_message_at).getTime()
          : 0;
        const lastMessageAt = Math.max(waktuLc, waktuMeta);

        const lastReadAt = lc.lastReadAt?.[String(user?.id)];
        const lastReadMillis = lastReadAt?.toMillis
          ? lastReadAt.toMillis()
          : lastReadAt?.seconds
          ? lastReadAt.seconds * 1000
          : 0;

        // Teks pesan terakhir: ambil yang paling baru supaya pesan yang baru
        // dikirim langsung terlihat di daftar.
        let lastMsgText = "";
        if (waktuLc > 0 && waktuLc >= waktuMeta) {
          lastMsgText = lc.lastMessage || meta?.last_message || "";
        } else {
          lastMsgText = meta?.last_message || lc.lastMessage || "";
        }

        const pengirimTerakhir = lc.lastSenderId ?? meta?.last_sender_id;
        // Pesan sistem punya sender_id NULL (mis. balasan Bot CS atau kartu
        // ajakan menilai). NULL BUKAN pesan saya, tapi juga bukan pesan yang
        // perlu dihitung "belum dibaca" - backend (jumlahBelumDibaca) pun
        // memperlakukan NULL sebagai bukan pesan saya. Tanpa pengecualian ini,
        // chat yang terakhir berisi pesan sistem selalu berlencah.
        const dariSaya =
          pengirimTerakhir != null && String(pengirimTerakhir) === String(user?.id);
        const dariSistem = pengirimTerakhir == null;
        const unread =
          !!lastMsgText &&
          !dariSaya &&
          !dariSistem &&
          (lastReadMillis === 0 || lastMessageAt > lastReadMillis);

        return {
          id,
          other_id: meta?.other_id ?? lc.other_id ?? lc.otherId ?? null,
          other_name:
            meta?.other_name ||
            lc.otherName ||
            (lc.isUnit || unitKey ? unitLabel : "Chat"),
          other_photo: meta?.other_photo || lc.otherPhoto || null,
          is_unit: meta?.is_unit ?? lc.isUnit ?? !!unitKey,
          lastMessage: lastMsgText || "Belum ada pesan",
          lastMessageAt,
          unread,
        };
      })
      .filter((c) => {
        // Buang baris kosong: harus punya lawan bicara, nama, atau isi pesan.
        return (
          c.other_id != null ||
          !!c.other_name && c.other_name !== "Chat" ||
          c.lastMessage !== "Belum ada pesan"
        );
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [liveChats, metaMap, user]);

  // Tandai chat yang belum dibaca jadi sudah dibaca.
  // Dulu satu updateDoc per chat ke Firestore; sekarang satu permintaan batch
  // ke backend sendiri.
  useEffect(() => {
    if (!user || merged.length === 0) return;
    const unreadIds = merged.filter((chat) => chat.unread).map((chat) => chat.id);
    if (unreadIds.length === 0) return;
    unreadIds.forEach((id) => void tandaiDibaca(id));
  }, [user, merged]);

  // Muat detail chat yang dipilih: meta lewat HTTP, pesan lewat HTTP lalu
  // dijaga segar oleh WebSocket.
  const muatPesanTerpilih = useCallback(async (id: string) => {
    try {
      const d = await ambilPesan(id);
      setMessages(d.pesan as unknown as Message[]);
    } catch {
      /* biarkan daftar lama */
    }
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    // Fetch meta
    api<{ chat: ChatMeta; other: OtherUser; product: ChatProduct | null }>(`/chats/${selectedChatId}`)
      .then((d) => {
        setChatMeta(d.chat);
        setOtherUser(d.other);
        setChatProduct(d.product);
        setChatTidakAda(false);
      })
      .catch((e) => {
        // Percakapan gagal dimuat - biasanya karena sudah dihapus (404) atau
        // sesi bermasalah (401). Tanpa penanganan ini halaman hanya diam
        // menampilkan "Mulai percakapan..." dan pesan tidak bisa dikirim,
        // seolah aplikasinya rusak.
        const pesan = e instanceof Error ? e.message : String(e);
        setChatTidakAda(true);
        setChatMeta(null);
        setOtherUser(null);
        setChatProduct(null);
        console.warn(`[chat] gagal memuat percakapan ${selectedChatId}: ${pesan}`);
      });

    setMessages([]);
    void muatPesanTerpilih(selectedChatId);
  }, [selectedChatId, muatPesanTerpilih]);

  // Pesan masuk untuk chat yang sedang dibuka -> tambahkan langsung.
  useKejadian("chat:pesan", (k) => {
    if (k.chatId !== selectedChatId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === k.pesan.id)) return prev;
      return [...prev, k.pesan as unknown as Message];
    });
    void tandaiDibaca(k.chatId);
  });

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const isCsChat = otherUser?.role === "cs";
  const canCompleteSale = !!(
    user && chatProduct && chatProduct.seller_id === user.id && chatProduct.category === "siswa" && otherUser && otherUser.id && !otherUser.is_unit
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || cooldown || !selectedChatId) return;
    const cleanText = text.trim();
    setText("");

    // Tampilkan lebih dulu di layar, jangan tunggu server.
    const sementaraId = `sementara-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: sementaraId,
        sender_id: user.id,
        text: cleanText,
        isi: cleanText,
        created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      } as unknown as Message,
    ]);

    // Optimistically update liveChats for immediate preview update
    setLiveChats((prev) => {
      const existing = prev[selectedChatId];
      if (!existing) return prev;
      return {
        ...prev,
        [selectedChatId]: {
          ...existing,
          lastMessage: cleanText,
          lastSenderId: String(user.id),
          lastMessageAt: Date.now(),
        },
      };
    });

    try {
      // Satu permintaan: server menyimpan, menyebar, dan memberi notifikasi.
      const tersimpan = await kirimPesan(selectedChatId, cleanText);
      setMessages((prev) =>
        prev.map((m) => (m.id === sementaraId ? (tersimpan as unknown as Message) : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sementaraId ? ({ ...m, _gagal: true } as unknown as Message) : m,
        ),
      );
    }

    if (isCsChat && chatMeta?.cs_mode === "ai") {
      setCooldown(true);
      setTimeout(() => setCooldown(false), SEND_COOLDOWN_MS);
    }
  }

  async function handleSendImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedChatId) return;
    e.target.value = "";
    setSendingImage(true);
    try {
      const imageUrl = await uploadImage(file);
      // Foto lewat jalur yang sama: server menyimpan dan menyebarkan.
      // WAJIB lewat api(): fetch() langsung tidak menyertakan header
      // `x-csrf-token`, sehingga server menolak dengan 403.
      await api("/chats/notify", {
        method: "POST",
        json: { chat_id: selectedChatId, image_url: imageUrl },
      });

      // Optimistically update liveChats for immediate preview update
      setLiveChats((prev) => {
        const existing = prev[selectedChatId];
        if (!existing) return prev;
        return {
          ...prev,
          [selectedChatId]: {
            ...existing,
            lastMessage: "Mengirim foto",
            lastSenderId: String(user.id),
            lastMessageAt: Date.now(),
          },
        };
      });

      api("/chats/notify", { method: "POST", json: { chat_id: selectedChatId, image_url: imageUrl } }).catch(() => {});
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
    if (selectedChatId) await api(`/chats/${selectedChatId}/mute`, { method: "PUT", json: { muted: next } }).catch(() => {});
  }

  async function handleDeleteChat() {
    if (!selectedChatId || !confirm("Hapus chat ini dari daftarmu?")) return;

    const dihapus = selectedChatId;
    await api(`/chats/${dihapus}`, { method: "DELETE" }).catch(() => {});

    // Buang percakapan ini dari daftar lokal SEKARANG, jangan menunggu
    // permintaan ulang ke server.
    //
    // Tanpa ini, percakapan yang sudah dihapus tetap tampil di sidebar; kalau
    // diklik lagi server menjawab "tidak ada", halaman menampilkan
    // "Mulai percakapan..." dan pesan tidak bisa dikirim.
    setMetaMap((sebelum) => {
      const baru = { ...sebelum };
      delete baru[dihapus];
      metaMapRef.current = baru;
      return baru;
    });
    setLiveChats((sebelum) => {
      const baru = { ...sebelum };
      delete baru[dihapus];
      return baru;
    });

    // Bersihkan tampilan percakapan yang sedang dibuka.
    setSelectedChatId(null);
    setChatMeta(null);
    setOtherUser(null);
    setChatProduct(null);
    setMessages([]);

    if (isMobile) {
      // Di mobile, /chat menampilkan daftar ATAU detail tergantung
      // `selectedChatId` - bukan berdasarkan alamat. Karena itu kita cukup
      // mengosongkan pilihan; router.push("/chat") tidak ada gunanya (sudah
      // di /chat) dan tidak memaksa React menggambar ulang daftar.
      router.replace("/chat");
    }

    // Lalu selaraskan dengan server (kalau ada perubahan dari perangkat lain).
    fetchMeta();
  }

  async function handleCompleteSale(price: number) {
    if (!user || !otherUser || !otherUser.id || !selectedChatId) return;
    try {
      const { id: orderId } = await api<{ id: number }>("/orders/siswa/complete", {
        method: "POST",
        json: { buyer_id: otherUser.id, product_id: chatProduct?.id, price },
      });
      await sendRatingRequest(user.id, otherUser.id, orderId);
      setCompleteModalOpen(false);
      setMenuOpen(false);
    } catch (err: any) {
      alert(err.message || "Gagal menandai transaksi selesai.");
    }
  }

  const selectedChat = merged.find((c) => c.id === selectedChatId);

  // Ukuran layar belum diketahui (baru beberapa milidetik). Tahan tampilan
  // supaya tidak berkedip dari desktop ke mobile atau sebaliknya.
  if (isMobile === null) {
    return (
      <main className="h-[100dvh] flex items-center justify-center bg-paper">
        <p className="font-body text-sm text-steel">Memuat…</p>
      </main>
    );
  }

  // Mobile: daftar saat belum ada chat terpilih, detail saat sudah dipilih.
  if (isMobile) {
    return (
      // PENTING: saat sebuah percakapan sedang dibuka, halaman ini menampilkan
      // DETAIL chat secara langsung (bukan pindah ke /chat/<id>). Karena
      // alamatnya tetap "/chat", Navbar tidak tahu bahwa ini halaman detail
      // dan tetap dirender. Itulah sebabnya navbar muncul kembali di detail
      // chat versi mobile - maka penyembunyiannya dilakukan di sini.
      <main className="h-[100dvh] overflow-hidden flex flex-col bg-paper">
        {!selectedChatId && <Navbar />}
        {selectedChatId ? (
          <ChatDetailView
            chatId={selectedChatId}
            meta={chatMeta}
            other={otherUser}
            product={chatProduct}
            messages={messages}
            text={text}
            setText={setText}
            sendingImage={sendingImage}
            setSendingImage={setSendingImage}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            muted={muted}
            setMuted={setMuted}
            cooldown={cooldown}
            isCsChat={isCsChat}
            csMode={chatMeta?.cs_mode}
            canCompleteSale={canCompleteSale}
            completeModalOpen={completeModalOpen}
            setCompleteModalOpen={setCompleteModalOpen}
            handleSend={handleSend}
            handleSendImage={handleSendImage}
            toggleMute={toggleMute}
            handleDeleteChat={handleDeleteChat}
            handleCompleteSale={handleCompleteSale}
            bottomRef={bottomRef}
            onBack={() => setSelectedChatId(null)}
            isMobile={isMobile}
            user={user}
          />
        ) : (
          <ChatListView
            merged={merged}
            onSelectChat={(id) => {
              setChatTidakAda(false);
              setSelectedChatId(id);
            }}
            fetchMeta={fetchMeta}
          />
        )}
      </main>
    );
  }

  // Desktop: split view
  return (
    // Sama seperti versi mobile: halaman tidak boleh menggulir, hanya daftar
    // pesan di dalam panel kanan yang menggulir.
    <main className="h-[100dvh] overflow-hidden bg-paper">
      {/* Navbar SELALU tampil di desktop.
          Berbeda dari mobile, di desktop /chat adalah split-view: daftar
          percakapan di kiri dan isi percakapan di kanan, keduanya dalam satu
          layar sekaligus. Jadi "sedang membuka percakapan" BUKAN alasan untuk
          menyembunyikan navbar - kalau ikut disembunyikan, navbar hilang terus
          karena percakapan pertama otomatis terpilih. */}
      <Navbar />
      <div className="flex h-[calc(100dvh-4rem)] max-w-[1600px] mx-auto">
        {/* Sidebar - Chat List */}
        <aside className="w-96 flex-shrink-0 border-r border-sand bg-white flex flex-col">
          <div className="p-4 border-b border-sand flex items-center justify-between">
            <h1 className="text-heading-sm font-heading font-semibold text-ink">Chat</h1>
            {user?.role !== "cs" && (
              <Link href="/cs/chat" className="btn-secondary !px-4 !py-2 flex items-center gap-2 text-sm">
                <Headset size={16} aria-hidden="true" /> CS
              </Link>
            )}
          </div>
          <ChatListView
            merged={merged}
            selectedId={selectedChatId}
            onSelectChat={(id) => setSelectedChatId(id)}
            fetchMeta={fetchMeta}
          />
        </aside>

        {/* Main - Chat Detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedChatId ? (
            <ChatDetailView
              chatId={selectedChatId}
              meta={chatMeta}
              other={otherUser}
              product={chatProduct}
              messages={messages}
              text={text}
              setText={setText}
              sendingImage={sendingImage}
              setSendingImage={setSendingImage}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              muted={muted}
              setMuted={setMuted}
              cooldown={cooldown}
              isCsChat={isCsChat}
              csMode={chatMeta?.cs_mode}
              canCompleteSale={canCompleteSale}
              completeModalOpen={completeModalOpen}
              setCompleteModalOpen={setCompleteModalOpen}
              handleSend={handleSend}
              handleSendImage={handleSendImage}
              toggleMute={toggleMute}
              handleDeleteChat={handleDeleteChat}
              handleCompleteSale={handleCompleteSale}
              bottomRef={bottomRef}
              onBack={() => setSelectedChatId(null)}
              isMobile={isMobile}
              user={user}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-parchment/30">
              <div className="text-center px-6">
                {chatTidakAda ? (
                  <>
                    {/* Percakapan yang dipilih sudah tidak ada lagi (mis. baru
                        dihapus). Jelaskan supaya pengguna tidak bingung dan
                        beri jalan keluar. */}
                    <MessageCircleOff size={48} className="mx-auto text-ember mb-4" aria-hidden="true" />
                    <h2 className="font-heading text-xl text-ink font-semibold mb-2">
                      Percakapan tidak ditemukan
                    </h2>
                    <p className="font-body text-sm text-steel mb-5">
                      Percakapan ini mungkin sudah dihapus. Pilih percakapan lain
                      di daftar sebelah kiri.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setChatTidakAda(false);
                        setSelectedChatId(null);
                      }}
                      className="btn-secondary !px-5 !py-2.5 text-sm"
                    >
                      Kembali ke daftar
                    </button>
                  </>
                ) : (
                  <>
                    <MessageCircleOff size={48} className="mx-auto text-steel/50 mb-4" aria-hidden="true" />
                    <h2 className="font-heading text-xl text-ink font-semibold mb-2">Pilih percakapan</h2>
                    <p className="font-body text-steel">Klik chat di sidebar untuk memulai mengobrol</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ============================================
// Chat List View (shared by mobile + desktop)
// ============================================
function ChatListView({
  merged,
  selectedId,
  onSelectChat,
  fetchMeta,
}: {
  merged: MergedChat[];
  selectedId?: string | null;
  onSelectChat: (id: string) => void;
  fetchMeta: () => void;
}) {
  return (
    // Ruang bawah di mobile: navbar mobile dipasang `fixed bottom-0`, jadi
    // tanpa tambahan padding item percakapan terakhir TERTUTUP navbar dan
    // tidak bisa diklik. Di desktop navbar ada di atas (sticky), sehingga
    // padding tambahan tidak diperlukan.
    <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
      <div className="lg:hidden px-4 pt-5 pb-3">
        <h1 className="text-heading-sm font-heading font-semibold text-ink">Chat</h1>
      </div>
      {merged.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 px-4 text-fog">
          <MessageCircleOff size={32} aria-hidden="true" />
          <p className="font-body text-sm">Belum ada percakapan</p>
          <p className="font-body text-xs text-center">Mulai chat dari halaman produk</p>
        </div>
      ) : (
        <div className="p-2 space-y-1">
          {merged.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectChat(c.id)}
              className={`w-full card p-3 flex items-center gap-3 text-left transition-colors ${
                selectedId === c.id
                  ? "bg-electric-50 border-electric-200 ring-1 ring-electric-300"
                  : "hover:bg-parchment/50 border-transparent"
              }`}
            >
              <div className="relative w-11 h-11 rounded-full bg-electric-100 overflow-hidden shrink-0">
                {c.is_unit ? (
                  <div className="w-full h-full flex items-center justify-center text-electric">
                    <Store size={20} aria-hidden="true" />
                  </div>
                ) : c.other_photo ? (
                  <img src={c.other_photo} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-electric">
                    <UserRound size={20} aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-sub truncate block ${c.unread ? "font-semibold text-ink" : "font-medium text-ink"}`}>
                    {c.other_name}
                  </span>
                  <span className="text-[11px] text-fog font-body whitespace-nowrap shrink-0">
                    {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
                <span className={`text-sm font-body line-clamp-1 block ${c.unread ? "text-ink font-medium" : "text-steel"}`}>
                  {c.lastMessage}
                </span>
              </div>
              {c.unread && <span className="w-2.5 h-2.5 rounded-full bg-ember shrink-0" aria-label="Belum dibaca" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Chat Detail View
// ============================================
function ChatDetailView({
  chatId,
  meta,
  other,
  product,
  messages,
  text,
  setText,
  sendingImage,
  setSendingImage,
  menuOpen,
  setMenuOpen,
  muted,
  setMuted,
  cooldown,
  isCsChat,
  csMode,
  canCompleteSale,
  completeModalOpen,
  setCompleteModalOpen,
  handleSend,
  handleSendImage,
  toggleMute,
  handleDeleteChat,
  handleCompleteSale,
  bottomRef,
  onBack,
  isMobile,
  user,
}: {
  chatId: string;
  meta: ChatMeta | null;
  other: OtherUser | null;
  product: ChatProduct | null;
  messages: Message[];
  text: string;
  setText: (t: string) => void;
  sendingImage: boolean;
  setSendingImage: (v: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  muted: boolean;
  setMuted: (v: boolean) => void;
  cooldown: boolean;
  isCsChat: boolean;
  csMode?: "ai" | "human";
  canCompleteSale: boolean;
  completeModalOpen: boolean;
  setCompleteModalOpen: (v: boolean) => void;
  handleSend: (e: React.FormEvent) => Promise<void>;
  handleSendImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  toggleMute: () => Promise<void>;
  handleDeleteChat: () => Promise<void>;
  handleCompleteSale: (price: number) => Promise<void>;
  bottomRef: React.RefObject<HTMLDivElement>;
  onBack: () => void;
  isMobile: boolean | null;
  user: { id: number | string } | null | undefined;
}) {
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-sand px-4 py-3 flex items-center gap-3">
        {isMobile === true && (
          <button onClick={onBack} className="p-2 text-ink lg:hidden" aria-label="Kembali">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        )}
        {other && (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative w-10 h-10 rounded-full bg-electric-100 overflow-hidden shrink-0">
              {other.is_unit ? (
                <div className="w-full h-full flex items-center justify-center text-electric">
                  <Store size={18} aria-hidden="true" />
                </div>
              ) : other.profile_photo_url ? (
                <img src={other.profile_photo_url} alt="Gambar" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-electric">
                  <UserRound size={18} aria-hidden="true" />
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
              {other.is_unit && !isCsChat && (
                <span className="text-xs text-fog font-body">Dibalas staf yang sedang bertugas</span>
              )}
            </div>
          </div>
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-2 text-ink hover:bg-parchment rounded-full" aria-label="Menu chat">
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
      </header>

      {/* Messages */}
      {/* `min-h-0` wajib: tanpa itu flexbox memaksa tinggi anak mengikuti
          isinya sehingga area ini tidak bisa menggulir sendiri dan kolom
          ketik terdorong ke atas saat pesannya sedikit. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 px-4 py-4">
        {messages.map((m) => {
          // Server mengirim `sender_id` (angka); `senderId` adalah nama lama
          // dari Firestore. Keduanya dibaca.
          const pengirim = m.sender_id ?? m.senderId;
          const mine = pengirim != null && String(pengirim) === String(user?.id);
          const teks = m.isi ?? m.text ?? "";
          const foto = m.imageUrl ?? (m as { image_url?: string }).image_url;

          if (m.type === "rating_request") {
            return (
              <div key={m.id} className="flex justify-center py-2">
                <Link
                  href={`/rating/${m.orderId}`}
                  className="card p-3 flex items-center gap-2 text-sm font-sub text-ink hover:shadow-md"
                >
                  <Star size={16} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                  {teks || "Pesananmu selesai! Beri rating sekarang"}
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
                  }`}
                >
                  {teks}
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

      {/* Input */}
      {/* `shrink-0` menjaga kolom ketik tetap di bawah dan tidak tertekan
          oleh area pesan di atasnya. Ruang aman bawah dipakai supaya tidak
          tertutup bilah gestur ponsel. */}
      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-sand px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-6 flex gap-2 bg-white"
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

      {completeModalOpen && product && (
        <CompleteSaleModal
          productName={product.name}
          defaultPrice={product.price}
          onClose={() => setCompleteModalOpen(false)}
          onConfirm={handleCompleteSale}
        />
      )}
    </div>
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

  async function handleSubmit(e: React.FormEvent) {
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


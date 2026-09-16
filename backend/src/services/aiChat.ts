import fetch from "node-fetch";
import { db } from "../db";
import { sanitizeText } from "../utils/sanitize";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const HUMAN_HANDOFF_LINE = "\n\nKetik *1* untuk terhubung dengan tim CS manusia.";

interface RelevantProduct {
  id: number;
  name: string;
  price: number;
  category: string;
}

/**
 * Sanitize user input to prevent prompt injection
 * - Remove potential instruction overrides
 * - Limit length
 * - Escape special characters
 */
function sanitizeUserInput(input: string): string {
  if (!input) return "";
  // Limit length to prevent token exhaustion
  const limited = input.slice(0, 2000);
  // Remove potential prompt injection patterns
  const sanitized = limited
    .replace(/ignore\s+(previous|above|all)\s+(instructions?|prompts?|rules?)/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/assistant\s*:\s*/gi, "")
    .replace(/user\s*:\s*/gi, "")
    .replace(/\[INST\]|\[\/INST\]/gi, "")
    .replace(/<\|.*?\|>/g, "") // Remove special tokens
    .trim();
  // Use DOMPurify to strip any HTML/script
  return sanitizeText(sanitized);
}

/**
 * Cari produk yang relevan dengan pesan siswa (pencarian kata kunci sederhana
 * terhadap nama produk), supaya AI bisa merekomendasikan produk BESERTA
 * link-nya secara akurat - bukan mengarang nama/harga produk.
 */
function searchRelevantProducts(message: string): RelevantProduct[] {
  // Sanitize message before using in SQL
  const sanitizedMessage = sanitizeUserInput(message);

  const words = sanitizedMessage
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  if (words.length === 0) return [];

  const conditions = words.map(() => "p.name LIKE ?").join(" OR ");
  const params = words.map((w) => `%${w}%`);

  return db
    .prepare(
      `SELECT p.id, p.name, p.price, p.category FROM products p
       WHERE p.is_active = 1 AND (${conditions})
       ORDER BY p.created_at DESC LIMIT 5`
    )
    .all(...params) as RelevantProduct[];
}

function buildSystemPrompt(products: RelevantProduct[]): string {
  const productLines = products.length
    ? products
        .map(
          (p) =>
            `- ${p.name} (${p.category === "kwu_brital" ? "Ayam Geprek Brital" : "Jualan Siswa"}) - Rp${p.price.toLocaleString(
              "id-ID"
            )} - link: ${FRONTEND_URL}/product/${p.id}`
        )
        .join("\n")
    : "(tidak ada produk yang cocok dengan pertanyaan ini)";

  return `Kamu adalah asisten Customer Service otomatis untuk SkadesMart, marketplace internal SMKN 1 Depok Sleman.

TENTANG SKADESMART:
- Marketplace internal sekolah dengan 3 jenis "toko": unit KWU Ayam Geprek Brital (jual makanan via Marketplace), unit KWU Laundry (JASA cuci pakaian, TIDAK ada listing produk - siswa harus datang LANGSUNG ke tempat laundry sekolah, petugas akan mencatat pesanan di sistem), dan Jualan Bebas Siswa (siswa jual barang pribadi ke siswa lain).
- Cara pesan Ayam Geprek Brital: buka Marketplace, pilih menu, bisa "Pesan Langsung" atau masukkan ke Keranjang dulu untuk pesan beberapa menu sekaligus, lalu checkout. Status pesanan: baru -> diproses -> diantar -> selesai. Bisa dipantau di halaman Status Pesanan.
- Cara pesan Laundry: datang langsung ke tempat laundry sekolah, serahkan pakaian ke petugas, petugas akan mencatat pesanan (berat dalam kg, harga, status bayar). Status: dicuci -> bisa diambil -> selesai. Bisa dipantau di halaman Status Pesanan siswa.
- Jualan Bebas Siswa: siswa bisa menambahkan produk sendiri lewat tombol "Jual Produk" di Marketplace (kategori "Jualan Pribadi"). Pembeli klik "Hubungi untuk Pesan" di halaman produk untuk chat langsung dengan penjual, transaksi dan pembayaran dilakukan sendiri di luar sistem (informal, seperti COD/nego langsung).
- Fitur lain: Chat (bisa kirim teks & foto, ada badge belum dibaca), Keranjang (popup, bukan halaman terpisah), Rating & ulasan (muncul di halaman produk dan bisa diminta penjual lewat chat setelah pesanan selesai), Profil publik (bisa lihat produk & rating siswa lain), Notifikasi push (harus diaktifkan manual di halaman Akun), Ganti password di halaman Akun, Riwayat pesanan di halaman Akun.
- Role pengguna: siswa (default), staf KWU Brital, staf KWU Laundry, CS, dan Admin. Untuk jadi staf/CS, siswa harus dihubungi admin (role tidak bisa diubah sendiri).

PRODUK YANG MUNGKIN RELEVAN DENGAN PERTANYAAN INI:
${productLines}

ATURAN JAWABAN:
- Jawab singkat, ramah, dan jelas dalam Bahasa Indonesia sehari-hari (bukan kaku/formal).
- Kalau ada produk relevan di atas, rekomendasikan dengan menyebut nama, harga, dan link-nya persis seperti tertulis. JANGAN mengarang produk/harga/link yang tidak ada di daftar.
- Kalau pertanyaan di luar kemampuanmu, atau siswa terlihat butuh bantuan manusia (komplain, masalah pembayaran, laporan penyalahgunaan, dsb), sarankan langsung ketik "1".
- Jangan pernah mengaku sebagai manusia. Kamu adalah bot otomatis.`;
}

/**
 * Panggil AI CS (endpoint OpenAI-compatible, misal LiteLLM/Ollama gateway
 * lokal). Selalu menambahkan baris "ketik 1 untuk manusia" di akhir balasan.
 */
export async function askCsAi(userMessage: string): Promise<string> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "isan";

  if (!baseUrl || !apiKey) {
    console.warn("[aiChat] AI_BASE_URL/AI_API_KEY belum dikonfigurasi.");
    return `Maaf, asisten otomatis sedang tidak tersedia.${HUMAN_HANDOFF_LINE}`;
  }

  // Sanitize user input to prevent prompt injection
  const sanitizedMessage = sanitizeUserInput(userMessage);
  const products = searchRelevantProducts(sanitizedMessage);
  const systemPrompt = buildSystemPrompt(products);

  const controller = new AbortController();
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "45000", 10);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.4,
        stream: false,
      }),
      signal: controller.signal as any,
    });

    if (!res.ok) {
      const bodyText = await res.text();
      console.error(`[aiChat] AI gateway error HTTP ${res.status}: ${bodyText}`);
      return `Maaf, asisten otomatis lagi ada gangguan.${HUMAN_HANDOFF_LINE}`;
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Gateway lokal mungkin menempelkan 'data: [DONE]' atau teks ekstra di akhir respon JSON
      const cleanText = rawText.replace(/data:\s*\[DONE\]\s*$/i, "").trim();
      try {
        data = JSON.parse(cleanText);
      } catch {
        const jsonMatch = rawText.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error(`Gagal memparsing JSON dari AI gateway. Raw: ${rawText.slice(0, 100)}`);
        }
      }
    }

    const choice = data.choices?.[0]?.message;
    const reply = (choice?.content || choice?.reasoning_content || "")?.trim();
    if (!reply) return `Maaf, aku belum bisa jawab itu.${HUMAN_HANDOFF_LINE}`;

    return reply.includes("Ketik") || reply.includes("ketik 1") ? reply : `${reply}${HUMAN_HANDOFF_LINE}`;
  } catch (err: any) {
    console.error("[aiChat] Gagal memanggil AI gateway:", err.message || err);
    return `Maaf, asisten otomatis lagi tidak bisa dihubungi.${HUMAN_HANDOFF_LINE}`;
  } finally {
    clearTimeout(timeout);
  }
}

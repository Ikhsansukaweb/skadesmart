const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface ApiOptions extends RequestInit {
  json?: unknown;
}

/**
 * Token CSRF disimpan di MEMORI, bukan dibaca dari cookie.
 *
 * KENAPA BUKAN COOKIE:
 * Halaman web ada di `skadesmart.web.id`, API di `api.skadesmart.web.id`.
 * Cookie apa pun yang disetel API tersimpan di domain `api.skadesmart.web.id`,
 * dan JavaScript di halaman TIDAK BISA membacanya - itu aturan Same-Origin
 * Policy browser yang tidak bisa ditembus dengan cara apa pun.
 *
 * Jadi server mengirim tokennya lewat BODY respons (`csrf_token` saat login
 * dan saat memanggil /auth/csrf). Nilainya kita pegang di variabel ini lalu
 * dipasang pada header `x-csrf-token`.
 *
 * KEAMANANNYA TETAP UTUH:
 * situs penyerang tidak bisa membaca respons API (diblokir CORS), sehingga
 * tidak bisa mengetahui tokennya dan tidak bisa menempelkan header yang benar.
 */
let tokenCsrfDiMemori: string | null = null;

/** Simpan token CSRF dari respons server (login atau /auth/csrf). */
export function simpanTokenCsrf(token: string | null | undefined): void {
  if (token) tokenCsrfDiMemori = token;
}

/** Lupakan token CSRF (dipakai saat logout). */
export function lupakanTokenCsrf(): void {
  tokenCsrfDiMemori = null;
}

/**
 * Ambil nilai token untuk header `x-csrf-token`.
 *
 * Mengembalikan token dari memori kalau ada. Sebagai cadangan, cookie tetap
 * diperiksa (berguna kalau kelak halaman dan API disatukan dalam satu domain).
 */
function ambilTokenCsrf(): string | null {
  if (tokenCsrfDiMemori) return tokenCsrfDiMemori;

  if (typeof document === "undefined") return null;
  for (const satu of document.cookie.split(";")) {
    const bersih = satu.trim();
    if (bersih.indexOf("csrf_token=") === 0) {
      const nilai = decodeURIComponent(bersih.slice("csrf_token=".length));
      if (nilai) return nilai;
    }
  }
  return null;
}

/**
 * Wrapper fetch ke backend Express. Selalu credentials: 'include' supaya
 * httpOnly cookie JWT ikut terkirim di setiap request.
 */
export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, headers, method, ...rest } = options;
  const httpMethod = (method || (json ? "POST" : "GET")).toUpperCase();

  // Permintaan yang mengubah data wajib menyertakan token CSRF, kalau tidak
  // backend membalas 403.
  const perluCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(httpMethod);
  const tokenCsrf = perluCsrf ? ambilTokenCsrf() : null;

  const requestHeaders: Record<string, string> = {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(tokenCsrf ? { "x-csrf-token": tokenCsrf } : {}),
    ...(headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: requestHeaders,
    body: json ? JSON.stringify(json) : options.body,
    method: httpMethod,
    ...rest,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    // Token CSRF hilang/kedaluwarsa (mis. sesi lama sebelum pembaruan ini):
    // ambil token baru dari server lalu minta pengguna mencoba lagi.
    if (data?.code === "CSRF_MISSING" || data?.code === "CSRF_INVALID") {
      await segarkanTokenCsrf();
    }
    const err = new Error(data?.error || `Permintaan gagal (${res.status})`) as Error & { code?: string; status?: number };
    if (data?.code) err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/**
 * Minta server menerbitkan ulang cookie CSRF.
 *
 * Dipakai kalau token hilang atau tidak cocok - misalnya karena pengguna sudah
 * login sebelum fitur ini ada, atau cookie-nya kedaluwarsa sendiri.
 */
export async function segarkanTokenCsrf(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/csrf`, { credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    // Token datang lewat BODY, bukan cookie - lihat penjelasan di atas.
    if (data?.csrf_token) {
      simpanTokenCsrf(data.csrf_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Nama lain dari segarkanTokenCsrf(), dipakai saat halaman dimuat. */
export const ambilTokenCsrfDariServer = segarkanTokenCsrf;


export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/upload/image`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Upload gambar gagal.");
  return data.url as string;
}

// Upload banyak foto sekaligus (galeri produk / jualan siswa, 2-8 foto).
export async function uploadImages(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));

  const res = await fetch(`${API_URL}/upload/images`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Upload gambar gagal.");
  return data.urls as string[];
}

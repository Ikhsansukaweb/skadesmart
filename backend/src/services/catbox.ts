import fetch from "node-fetch";
import FormData from "form-data";

/**
 * Unggah ke layanan CADANGAN ketika Catbox sedang mati.
 *
 * Catbox.moe kadang turun (502) tanpa peringatan. Tanpa cadangan, seluruh fitur
 * unggah foto ikut mati: form tambah produk tidak bisa disimpan karena foto
 * wajib.
 *
 * Urutan percobaan:
 *   1. uguu.se   — mengembalikan URL langsung sebagai teks polos (paling mirip
 *                  Catbox). Berkas bertahan ~3 jam-3 hari, cukup untuk dipakai.
 *   2. tmpfiles.org — cadangan kedua; URL balikannya perlu diubah sedikit
 *                  (lihat catatan di bawah) tapi isinya bertahan ~1 jam.
 *
 * CATATAN: 0x0.st pernah dipakai sebagai cadangan, tetapi sekarang MENOLAK
 * semua unggahan (HTTP 503 "uploads disabled") sehingga dibuang.
 */
async function uploadCadangan(fileBuffer: Buffer, filename: string): Promise<string | null> {
  const ua = "SkadesMart/1.0 (+https://smkn1depoksleman.sch.id)";

  // ---- 1) uguu.se ----
  try {
    const form = new FormData();
    form.append("files[]", fileBuffer, { filename, contentType: "application/octet-stream" });

    const res = await fetch("https://uguu.se/upload?output=text", {
      method: "POST",
      body: form as any,
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(25000) as any,
    });
    const teks = (await res.text()).trim();
    if (res.ok && teks.startsWith("http")) {
      console.log(`[upload-cadangan] Berhasil lewat uguu.se: ${teks}`);
      return teks;
    }
    console.error(`[upload-cadangan] uguu.se gagal - HTTP ${res.status}. Respons: ${teks.slice(0, 200)}`);
  } catch (err: any) {
    console.error("[upload-cadangan] uguu.se error:", err?.message || err);
  }

  // ---- 2) tmpfiles.org ----
  try {
    const form = new FormData();
    form.append("file", fileBuffer, { filename, contentType: "application/octet-stream" });

    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: form as any,
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(25000) as any,
    });
    const teks = (await res.text()).trim();
    const data = JSON.parse(teks);
    const urlHalaman: string = data?.data?.url || "";
    // tmpfiles memberi URL halaman (tmpfiles.org/ID/nama.png). Untuk dipakai
    // sebagai <img src>, harus jadi URL berkas langsung:
    //   https://tmpfiles.org/1234/nama.png -> https://tmpfiles.org/dl/1234/nama.png
    if (urlHalaman.includes("tmpfiles.org/")) {
      const langsung = urlHalaman.replace("tmpfiles.org/", "tmpfiles.org/dl/");
      console.log(`[upload-cadangan] Berhasil lewat tmpfiles.org: ${langsung}`);
      return langsung;
    }
    console.error(`[upload-cadangan] tmpfiles.org respons tak terduga: ${teks.slice(0, 200)}`);
  } catch (err: any) {
    console.error("[upload-cadangan] tmpfiles.org error:", err?.message || err);
  }

  return null;
}

/**
 * Upload buffer file (dari multer memory storage) ke Catbox.moe.
 * CATBOX_USERHASH tidak pernah dikirim ke client — semua request ke Catbox
 * lewat backend ini saja.
 *
 * Kalau Catbox gagal (mis. sedang 502), otomatis dicoba ke layanan cadangan
 * supaya pengguna tetap bisa menyimpan produk dengan foto.
 */
export async function uploadToCatbox(fileBuffer: Buffer, filename: string): Promise<string> {
  // Catbox mengizinkan upload TANPA userhash (anonim), hanya saja berkasnya
  // tidak muncul di akun kita dan bisa kedaluwarsa. Sebelumnya fungsi ini
  // MENOLAK jalan kalau userhash kosong, sehingga SEMUA upload foto gagal -
  // itulah penyebab "foto jadi putih semua": tidak pernah ada berkas terunggah,
  // jadi yang tersimpan hanya tautan kosong.
  //
  // Sekarang userhash bersifat OPSIONAL: dikirim kalau ada, dilewati kalau tidak.
  const userhash = process.env.CATBOX_USERHASH?.trim();

  const form = new FormData();
  form.append("reqtype", "fileupload");
  if (userhash) form.append("userhash", userhash);
  form.append("fileToUpload", fileBuffer, filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form as any,
      // Beberapa provider (termasuk Catbox) menolak request tanpa User-Agent
      // yang wajar, jadi kita set eksplisit alih-alih dibiarkan kosong.
      headers: {
        "User-Agent": "SkadesMart/1.0 (+https://smkn1depoksleman.sch.id)",
      },
      signal: controller.signal as any,
    });

    const bodyText = (await res.text()).trim();

    if (!res.ok) {
      // Log detail asli supaya kelihatan di console backend, bukan cuma
      // pesan generik "Upload ke Catbox gagal" yang dikirim ke client.
      console.error(`[catbox] Upload gagal - HTTP ${res.status} ${res.statusText}. Respons: ${bodyText}`);
      // Catbox sedang bermasalah -> coba layanan cadangan sebelum menyerah.
      const cadangan = await uploadCadangan(fileBuffer, filename);
      if (cadangan) return cadangan;
      throw Object.assign(
        new Error(`Upload ke Catbox gagal (HTTP ${res.status}). ${bodyText || res.statusText}`),
        { status: 502 }
      );
    }

    if (!bodyText.startsWith("http")) {
      console.error(`[catbox] Respons tidak valid: ${bodyText}`);
      const cadangan = await uploadCadangan(fileBuffer, filename);
      if (cadangan) return cadangan;
      throw Object.assign(new Error(`Respons Catbox tidak valid: ${bodyText}`), { status: 502 });
    }

    // Verify the URL is accessible
    try {
      const verifyRes = await fetch(bodyText, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (!verifyRes.ok) {
        console.warn(`[catbox] Uploaded URL returned ${verifyRes.status}: ${bodyText}`);
      }
    } catch (verifyErr) {
      console.warn(`[catbox] Could not verify uploaded URL: ${bodyText}`, verifyErr);
    }

    return bodyText;
  } catch (err: any) {
    if (err.name === "AbortError") {
      // Timeout Catbox -> cadangan masih punya kesempatan.
      const cadangan = await uploadCadangan(fileBuffer, filename);
      if (cadangan) return cadangan;
      throw Object.assign(new Error("Upload ke Catbox timeout (20 detik)."), { status: 502 });
    }
    if (err.status) throw err;
    console.error("[catbox] Error tak terduga:", err);
    const cadangan = await uploadCadangan(fileBuffer, filename);
    if (cadangan) return cadangan;
    throw Object.assign(new Error(`Upload ke Catbox gagal: ${err.message || err}`), { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

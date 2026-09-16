import fetch from "node-fetch";
import FormData from "form-data";

/**
 * Upload buffer file (dari multer memory storage) ke Catbox.moe.
 * CATBOX_USERHASH tidak pernah dikirim ke client — semua request ke Catbox
 * lewat backend ini saja.
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
      throw Object.assign(
        new Error(`Upload ke Catbox gagal (HTTP ${res.status}). ${bodyText || res.statusText}`),
        { status: 502 }
      );
    }

    if (!bodyText.startsWith("http")) {
      console.error(`[catbox] Respons tidak valid: ${bodyText}`);
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
      throw Object.assign(new Error("Upload ke Catbox timeout (20 detik)."), { status: 502 });
    }
    if (err.status) throw err;
    console.error("[catbox] Error tak terduga:", err);
    throw Object.assign(new Error(`Upload ke Catbox gagal: ${err.message || err}`), { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

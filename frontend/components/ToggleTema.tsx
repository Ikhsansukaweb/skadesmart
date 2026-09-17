/**
 * ToggleTema - DIHAPUS SEMENTARA (mode gelap dimatikan).
 *
 * Mode gelap dimatikan atas permintaan pemilik produk. Selama mode gelap mati,
 * `SKRIP_TEMA` dibuat KOSONG supaya atribut `data-tema="gelap"` TIDAK PERNAH
 * dipasang. Kalau atribut itu tidak pernah ada, blok `[data-tema="gelap"]` di
 * globals.css tidak pernah aktif, sehingga seluruh situs selalu tampil terang.
 *
 * KENAPA INI PERLU, BUKAN CUMA MENGHAPUS TOMBOLNYA:
 *   Pemakai yang pernah menekan tombol mode gelap masih menyimpan
 *   localStorage["tema"] = "gelap". Kalau skrip tema dibiarkan jalan, halaman
 *   mereka akan TERUS tampil gelap walau tombolnya sudah hilang - dan tidak ada
 *   cara mengembalikannya ke terang. Karena itu skrip ini juga MEMBERSIHKAN
 *   nilai lama di localStorage.
 *
 * UNTUK MENGHIDUPKAN LAGI MODE GELAP:
 *   1. Kembalikan SKRIP_TEMA menjadi skrip yang memasang data-tema="gelap"
 *      bila pengguna memilih gelap:
 *
 *        export const SKRIP_TEMA = `(function(){try{
 *          var t = localStorage.getItem("tema");
 *          if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "gelap" : "terang";
 *          if (t === "gelap") document.documentElement.dataset.tema = "gelap";
 *        }catch(e){}})();`;
 *
 *   2. Pasang kembali tombolnya di Navbar.tsx:
 *        import ToggleTema from "@/components/ToggleTema";
 *        <ToggleTema />                    // versi ikon
 *        <ToggleTema varian="tab" />       // versi tab dengan label
 *
 *   3. Blok `[data-tema="gelap"]` di app/globals.css TIDAK perlu diubah -
 *      CSS-nya masih utuh dan siap dipakai.
 */

/** Skrip kosong: tidak memasang data-tema, sekaligus membersihkan sisa lama. */
export const SKRIP_TEMA = `(function(){try{localStorage.removeItem("tema");document.documentElement.removeAttribute("data-tema");}catch(e){}})();`;

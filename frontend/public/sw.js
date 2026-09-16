// Service Worker — pengganti firebase-messaging-sw.js
//
// Berkas ini hidup di latar belakang browser, terpisah dari halaman web.
// Karena itu notifikasi tetap diterima dan berbunyi walau semua tab
// SkadesMart sudah ditutup — selama browsernya masih berjalan.

/* eslint-disable no-undef */

// Ambil alih segera supaya versi baru langsung dipakai tanpa menunggu
// semua tab lama ditutup.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Notifikasi masuk dari server (Web Push).
 *
 * Data yang dikirim server berbentuk:
 *   { judul, isi, url, tag, jenis }
 */
self.addEventListener("push", (event) => {
  let muatan = {
    judul: "SkadesMart",
    isi: "Ada pemberitahuan baru.",
    url: "/",
    tag: undefined,
    jenis: "sistem",
  };

  try {
    if (event.data) {
      const d = event.data.json();
      muatan = {
        judul: d.judul || muatan.judul,
        isi: d.isi || muatan.isi,
        url: d.url || muatan.url,
        tag: d.tag,
        jenis: d.jenis || muatan.jenis,
      };
    }
  } catch {
    // Kalau bukan JSON, pakai teks apa adanya.
    try {
      if (event.data) muatan.isi = event.data.text();
    } catch {
      /* biarkan default */
    }
  }

  const opsi = {
    body: muatan.isi,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // tag yang sama = notifikasi lama untuk topik yang sama digantikan,
    // supaya layar tidak penuh kalau pesannya beruntun.
    tag: muatan.tag,
    renotify: Boolean(muatan.tag),
    data: { url: muatan.url, jenis: muatan.jenis },
    vibrate: [200, 100, 200],
    requireInteraction: muatan.jenis === "pesanan",
  };

  event.waitUntil(self.registration.showNotification(muatan.judul, opsi));
});

/**
 * Notifikasi diklik: fokuskan tab SkadesMart yang sudah terbuka kalau ada,
 * kalau tidak ada buka tab baru. Ini mencegah tab menumpuk.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tujuan = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const klien = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const c of klien) {
        // Sudah ada tab aplikasi — pakai itu.
        if (c.url.includes(self.location.origin)) {
          await c.focus();
          // Arahkan ke halaman yang dimaksud tanpa memuat ulang seluruh app.
          if ("navigate" in c) {
            try {
              await c.navigate(tujuan);
            } catch {
              /* biarkan tab apa adanya */
            }
          }
          return;
        }
      }

      await self.clients.openWindow(tujuan);
    })(),
  );
});

/**
 * Langganan push diganti browser (mis. kunci diperbarui).
 * Beri tahu server supaya langganan lama tidak dicoba terus.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const lama = event.oldSubscription;
        if (lama) {
          await fetch("/api/chats/push/langganan", {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: lama.endpoint }),
          });
        }
      } catch {
        /* tidak fatal */
      }
    })(),
  );
});

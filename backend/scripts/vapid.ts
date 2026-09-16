// Pembangkit kunci VAPID untuk notifikasi push.
//
// Jalankan sekali saja:  npm run vapid
// lalu salin hasilnya ke .env (jangan di-commit ke git).
//
// Kunci ini setara dengan kunci server FCM: yang publik boleh diketahui
// browser, yang privat HARUS dirahasiakan. Kalau kunci privat bocor, orang
// lain bisa mengirim notifikasi palsu ke pengguna aplikasi.

import webpush from "web-push";

const kunci = webpush.generateVAPIDKeys();

console.log(`
=====================================================================
 Kunci VAPID berhasil dibuat. Salin ke berkas .env
=====================================================================

VAPID_PUBLIC_KEY=${kunci.publicKey}
VAPID_PRIVATE_KEY=${kunci.privateKey}
VAPID_SUBJECT=mailto:admin@skadesmart.web.id

---------------------------------------------------------------------
Catatan:
 - Jalankan sekali saja. Kalau kunci diganti, semua perangkat yang sudah
   berlangganan perlu mengaktifkan notifikasi ulang (karena kunci lama
   tidak lagi cocok), jadi simpan baik-baik.
 - JANGAN commit kunci privat ke git.
 - Tidak perlu menaruh apa pun di frontend: kunci publik diambil browser
   dari server lewat GET /api/chats/push/kunci.
---------------------------------------------------------------------
`);

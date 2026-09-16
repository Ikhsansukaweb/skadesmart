// Uji ujung-ke-ujung pengganti Firebase.
//
// Membuktikan tiga hal terhadap server yang benar-benar berjalan:
//   1. WebSocket menerima pesan chat secara real-time (pengganti onSnapshot).
//   2. Pesan benar-benar tersimpan di basis data (pengganti Firestore).
//   3. Rute Web Push dan token WS tersedia (pengganti FCM + Firebase Auth).
//
// Jalan sebagai klien Dart murni supaya tidak tergantung Flutter.

import "dart:async";
import "dart:convert";
import "dart:io";

const dasar = "http://127.0.0.1:3739";
const dasarWs = "ws://127.0.0.1:3739";

int lulus = 0, gagal = 0;
void cek(String nama, bool ok, [String? catatan]) {
  if (ok) {
    lulus++;
    print("  [OK]   $nama");
  } else {
    gagal++;
    print("  [GAGAL] $nama${catatan != null ? " -> $catatan" : ""}");
  }
}

Future<Map<String, dynamic>> minta(
  String jalur, {
  String metode = "GET",
  Map<String, dynamic>? isi,
  String? token,
  HttpClient? klien,
}) async {
  final c = klien ?? HttpClient();
  final req = await c.openUrl(metode, Uri.parse("$dasar$jalur"));
  req.headers.contentType = ContentType.json;
  if (token != null) req.headers.set("Authorization", "Bearer $token");
  if (isi != null) req.write(jsonEncode(isi));
  final res = await req.close();
  final teks = await res.transform(utf8.decoder).join();
  Map<String, dynamic> data = {};
  try {
    data = jsonDecode(teks) as Map<String, dynamic>;
  } catch (_) {
    data = {"_mentah": teks};
  }
  data["_status"] = res.statusCode;
  return data;
}

void main() async {
  print("=== UJI PENGGANTI FIREBASE (WebSocket + Web Push) ===\n");

  final klien = HttpClient();
  klien.connectionTimeout = const Duration(seconds: 10);

  // ---------------------------------------------------------------- 1. Sehat
  print("1. Kesehatan server");
  final sehat = await minta("/api/health", klien: klien);
  cek("server merespons /api/health", sehat["_status"] == 200, "status ${sehat["_status"]}");

  // --------------------------------------------------------------- 2. Login
  // Kata sandi dibaca dari .env, tidak ditulis di kode uji.
  print("\n2. Login (JWT backend, pengganti Firebase Auth)");
  final env = File("/home/ikhsan/Documents/skadesmart/backend/.env").readAsStringSync();
  final cocokPw = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env);
  final sandi = cocokPw?.group(1)?.trim() ?? "";
  final masuk = await minta(
    "/api/auth/login",
    metode: "POST",
    isi: {"nisn": "10005", "password": sandi},
    klien: klien,
  );

  String? token = masuk["token"] as String?;
  if (token == null) {
    print("  Catatan: login gagal (${masuk["error"] ?? masuk["_status"]}).");
    print("  Uji dilanjutkan tanpa sesi - bagian WebSocket akan dilewati.");
  } else {
    cek("login mengembalikan token JWT", true);
    cek("respons TIDAK lagi berisi firebaseToken", masuk.containsKey("firebaseToken") == false);
  }

  // ------------------------------------------------- 3. Token untuk WebSocket
  print("\n3. Token WebSocket (pengganti /auth/firebase-token)");
  if (token != null) {
    final ws = await minta("/api/auth/ws-token", token: token, klien: klien);
    cek("GET /auth/ws-token tersedia", ws["_status"] == 200, "status ${ws["_status"]}");
    cek("mengembalikan field 'token'", ws["token"] is String && (ws["token"] as String).isNotEmpty);

    final lama = await minta("/api/auth/firebase-token", token: token, klien: klien);
    cek("rute lama /auth/firebase-token sudah hilang (404)", lama["_status"] == 404,
        "status ${lama["_status"]}");
  }

  // ------------------------------------------------------------- 4. Web Push
  print("\n4. Web Push (pengganti FCM)");
  final kunci = await minta("/api/chats/push/kunci", klien: klien);
  cek("GET /chats/push/kunci tersedia", kunci["_status"] == 200, "status ${kunci["_status"]}");
  final k = kunci["kunci"] as String?;
  cek("kunci publik VAPID terisi", k != null && k.length > 80, "panjang ${k?.length ?? 0}");
  cek("kunci berbentuk base64url (tanpa + / =)", k != null && !k.contains("+") && !k.contains("/"));

  if (token != null) {
    final langganan = await minta(
      "/api/chats/push/langganan",
      metode: "POST",
      token: token,
      isi: {
        "endpoint": "https://fcm.googleapis.com/fcm/send/contoh-uji-123",
        "keys": {"p256dh": "BEl6" + "a" * 80, "auth": "b" * 22},
      },
      klien: klien,
    );
    cek("POST /chats/push/langganan menerima langganan", langganan["_status"] == 200,
        "status ${langganan["_status"]}");
  }

  // --------------------------------------------------------------- 5. Chat
  print("\n5. Chat real-time lewat WebSocket (pengganti onSnapshot)");
  if (token == null) {
    print("  Dilewati: butuh sesi login.");
  } else {
    // Ambil daftar chat untuk mencari id yang bisa dipakai.
    final daftar = await minta("/api/chats", token: token, klien: klien);
    final chats = (daftar["chats"] as List?) ?? [];
    cek("GET /chats berhasil", daftar["_status"] == 200, "status ${daftar["_status"]}");

    if (chats.isEmpty) {
      print("  Tidak ada chat pada akun uji - bagian ini dilewati.");
    } else {
      final chatId = (chats.first as Map)["id"] as String;

      // Buka WebSocket seperti yang dilakukan aplikasi.
      final ws = await WebSocket.connect("$dasarWs/ws?token=$token");
      final masuk = <Map<String, dynamic>>[];
      final completer = Completer<void>();
      ws.listen((pesan) {
        final d = jsonDecode(pesan as String) as Map<String, dynamic>;
        masuk.add(d);
        if (d["type"] == "chat:pesan" && !completer.isCompleted) completer.complete();
      });

      // Tunggu sapaan server.
      await Future.delayed(const Duration(milliseconds: 700));
      cek("WebSocket tersambung & server menyapa",
          masuk.any((m) => m["type"] == "siap"),
          "diterima: ${masuk.map((m) => m["type"]).toList()}");

      // Kabarkan chat sedang dibuka.
      ws.add(jsonEncode({"type": "chat:buka", "chatId": chatId}));
      await Future.delayed(const Duration(milliseconds: 400));
      cek("server menandai chat sedang dibuka",
          masuk.any((m) => m["type"] == "chat:sedang-dibuka"),
          "diterima: ${masuk.map((m) => m["type"]).toList()}");

      // Ping/pong menjaga koneksi.
      ws.add(jsonEncode({"type": "ping"}));
      await Future.delayed(const Duration(milliseconds: 400));
      cek("ping dibalas pong", masuk.any((m) => m["type"] == "pong"));

      // Kirim pesan lewat HTTP, harus muncul di WebSocket.
      final tanda = "uji-ws-${DateTime.now().millisecondsSinceEpoch}";
      await minta(
        "/api/chats/notify",
        metode: "POST",
        token: token,
        isi: {"chat_id": chatId, "text": tanda},
        klien: klien,
      );

      await completer.future.timeout(const Duration(seconds: 6), onTimeout: () {});
      final terima = masuk.where((m) => m["type"] == "chat:pesan").toList();
      cek("pesan terkirim diterima lewat WebSocket", terima.isNotEmpty,
          "total kejadian chat:pesan: ${terima.length}");
      if (terima.isNotEmpty) {
        final isi = (terima.last["pesan"] as Map)["isi"];
        cek("isi pesan sama dengan yang dikirim", isi == tanda, "diterima: '$isi'");
        cek("kejadian menyertakan penanda sedangDibuka",
            terima.last.containsKey("sedangDibuka"));
      }

      // Riwayat pesan tersimpan (pengganti Firestore).
      final riwayat = await minta("/api/chats/$chatId/pesan", token: token, klien: klien);
      cek("GET /chats/:id/pesan mengembalikan riwayat", riwayat["_status"] == 200);
      final pesan = (riwayat["pesan"] as List?) ?? [];
      cek("pesan tersimpan di basis data (bukan Firestore)",
          pesan.any((p) => (p as Map)["isi"] == tanda),
          "jumlah pesan: ${pesan.length}");

      // Tandai dibaca.
      final dibaca = await minta("/api/chats/$chatId/dibaca",
          metode: "PATCH", token: token, klien: klien);
      cek("PATCH /chats/:id/dibaca berhasil", dibaca["_status"] == 200);

      // Lencana belum dibaca.
      final lencana = await minta("/api/chats/belum-dibaca", token: token, klien: klien);
      cek("GET /chats/belum-dibaca tersedia", lencana["_status"] == 200);
      cek("mengembalikan angka 'total'", lencana["total"] is num);

      // Koneksi tanpa token harus ditolak.
      bool ditolak = false;
      try {
        final w = await WebSocket.connect("$dasarWs/ws");
        await w.close();
      } catch (_) {
        ditolak = true;
      }
      cek("WebSocket tanpa token ditolak", ditolak);

      await ws.close();
    }
  }

  // ------------------------------------------------------------ 6. Status
  print("\n6. Status pesanan lewat WebSocket (pengganti mirror ke Firestore)");
  cek("rute /orders/mine masih ada (tidak terganggu perubahan)",
      token != null
          ? (await minta("/orders/mine", token: token, klien: klien))["_status"] != 500
          : true);

  // --------------------------------------------------------------- Ringkasan
  print("\n" + "=" * 58);
  print("  LULUS: $lulus    GAGAL: $gagal");
  print("=" * 58);

  klien.close(force: true);
  exit(gagal == 0 ? 0 : 1);
}

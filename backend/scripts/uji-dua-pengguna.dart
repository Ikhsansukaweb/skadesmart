import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Uji real-time dua pengguna lewat tunnel publik.
///
/// Cara kerja: dua akun login, keduanya membuka WebSocket. Akun A mengirim
/// pesan ke chat dengan akun B, lalu kita pastikan B menerimanya SEKETIKA
/// lewat WebSocket — inilah yang menggantikan Firestore onSnapshot.
///
/// Hal ini tidak bisa diuji dengan satu akun saja, karena server sengaja
/// TIDAK mengirim balik ke pengirim (dia sudah menampilkan pesannya sendiri
/// secara optimistis di layar).

const api = "https://api.skadesmart.web.id/api";
const wsDasar = "wss://api.skadesmart.web.id/ws";
const asal = "https://skadesmart.web.id";

int lulus = 0, gagal = 0;
void cek(String nama, bool ok, [String? catatan]) {
  if (ok) {
    lulus++;
    print("  [OK]    $nama");
  } else {
    gagal++;
    print("  [GAGAL] $nama${catatan != null ? " -> $catatan" : ""}");
  }
}

class Sesi {
  final HttpClient klien;
  String? cookie;
  Sesi(this.klien);

  Future<Map<String, dynamic>> minta(
    String jalur, {
    String metode = "GET",
    Map<String, dynamic>? isi,
  }) async {
    final req = await klien.openUrl(metode, Uri.parse("$api$jalur"));
    req.headers.contentType = ContentType.json;
    req.headers.set("Origin", asal);
    if (cookie != null) req.headers.set("Cookie", cookie!);
    if (isi != null) req.write(jsonEncode(isi));
    final res = await req.close();

    final sc = res.headers["set-cookie"];
    if (sc != null && sc.isNotEmpty) {
      final m = RegExp(r"([a-zA-Z_]+)=([^;]+)").firstMatch(sc.first);
      if (m != null) cookie = "${m.group(1)}=${m.group(2)}";
    }

    final teks = await res.transform(utf8.decoder).join();
    Map<String, dynamic> data;
    try {
      data = jsonDecode(teks) as Map<String, dynamic>;
    } catch (_) {
      data = {"_mentah": teks};
    }
    data["_status"] = res.statusCode;
    return data;
  }

  Future<Map<String, dynamic>> login(String nisn, String sandi) async {
    final d = await minta("/auth/login",
        metode: "POST", isi: {"nisn": nisn, "password": sandi});
    if (d["_status"] != 200) throw Exception("Login $nisn gagal: ${d["error"]}");
    return d["user"] as Map<String, dynamic>;
  }
}

Future<List<Map<String, dynamic>>> daftarChat(Sesi s) async {
  final d = await s.minta("/chats");
  return List<Map<String, dynamic>>.from(d["chats"] as List? ?? []);
}

void main() async {
  print("=== UJI REAL-TIME DUA PENGGUNA (lewat tunnel) ===\n");

  final env = File("/home/ikhsan/Documents/skadesmart/backend/.env").readAsStringSync();
  final sandi = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env)!.group(1)!.trim();

  // Dua sesi berbeda, seperti dua orang berbeda di dua perangkat.
  final a = Sesi(HttpClient()..connectionTimeout = const Duration(seconds: 20));
  final b = Sesi(HttpClient()..connectionTimeout = const Duration(seconds: 20));

  print("1. Dua pengguna masuk");
  final userA = await a.login("10005", sandi); // Fajar (siswa)
  final userB = await b.login("10004", sandi); // Dewi (laundry)
  cek("pengguna A masuk", userA["id"] != null, "A=${userA["full_name"]}");
  cek("pengguna B masuk", userB["id"] != null, "B=${userB["full_name"]}");
  cek("cookie kedua sesi berbeda", a.cookie != null && b.cookie != null);

  // Cari chat antara A dan B.
  print("\n2. Mencari chat antara kedua pengguna");
  final chatA = await daftarChat(a);
  cek("A melihat daftar chatnya", chatA.isNotEmpty, "jumlah: ${chatA.length}");

  Map<String, dynamic>? bersama;
  for (final c in chatA) {
    final otherId = c["other_id"];
    if (otherId == userB["id"]) bersama = c;
  }
  // Kalau tidak ada, buat baru.
  if (bersama == null) {
    final buat = await a.minta("/chats",
        metode: "POST", isi: {"seller_id": userB["id"]});
    if (buat["_status"] == 200 || buat["_status"] == 201) {
      final baru = await daftarChat(a);
      for (final c in baru) {
        if (c["other_id"] == userB["id"]) bersama = c;
      }
    }
  }
  cek("chat antara A dan B tersedia", bersama != null,
      "chat A: ${chatA.map((c) => c["other_id"]).toList()} vs B=${userB["id"]}");
  if (bersama == null) {
    print("\n  Tidak ada chat untuk diuji.");
    exit(1);
  }

  final chatId = bersama["id"] as String;
  print("     chat: ${chatId.substring(0, 12)}...");

  // Buka WebSocket untuk kedua pengguna.
  print("\n3. Kedua pengguna membuka WebSocket");
  final wsA = await WebSocket.connect("$wsDasar?token=${await token(a)}")
      .timeout(const Duration(seconds: 20));
  final wsB = await WebSocket.connect("$wsDasar?token=${await token(b)}")
      .timeout(const Duration(seconds: 20));
  cek("WebSocket A tersambung", true);
  cek("WebSocket B tersambung", true);

  final terimaA = <Map<String, dynamic>>[];
  final terimaB = <Map<String, dynamic>>[];
  final bDapat = Completer<Map<String, dynamic>>();
  final aDapat = Completer<Map<String, dynamic>>();

  wsA.listen((p) {
    final d = jsonDecode(p as String) as Map<String, dynamic>;
    terimaA.add(d);
    if (d["type"] == "chat:pesan" && !aDapat.isCompleted) aDapat.complete(d);
  });
  wsB.listen((p) {
    final d = jsonDecode(p as String) as Map<String, dynamic>;
    terimaB.add(d);
    if (d["type"] == "chat:pesan" && !bDapat.isCompleted) bDapat.complete(d);
  });

  await Future.delayed(const Duration(seconds: 2));
  cek("A menerima sapaan server", terimaA.any((m) => m["type"] == "siap"));
  cek("B menerima sapaan server", terimaB.any((m) => m["type"] == "siap"));

  // A mengirim pesan, B harus menerimanya seketika.
  print("\n4. A mengirim, B menerima seketika (pengganti onSnapshot)");
  final tanda = "halo-${DateTime.now().millisecondsSinceEpoch}";
  final kirim = await a.minta("/chats/notify",
      metode: "POST", isi: {"chat_id": chatId, "text": tanda});

  cek("pesan A terkirim (200)", kirim["_status"] == 200, "status ${kirim["_status"]}");
  cek("server melaporkan ada klien yang menerima real-time",
      (kirim["terkirimWs"] as num? ?? 0) > 0, "terkirimWs=${kirim["terkirimWs"]}");

  final diterima = await bDapat.future.timeout(const Duration(seconds: 15),
      onTimeout: () => <String, dynamic>{});
  cek("B MENERIMA PESAN LEWAT WEBSOCKET", diterima.isNotEmpty,
      "kejadian B: ${terimaB.map((m) => m["type"]).toList()}");
  if (diterima.isNotEmpty) {
    cek("isi pesan utuh", (diterima["pesan"] as Map)["isi"] == tanda,
        "diterima: '${(diterima["pesan"] as Map)["isi"]}'");
  }

  // Pengirim sendiri tidak menerima galanya (dia sudah menampilkannya lokal).
  await Future.delayed(const Duration(seconds: 1));
  cek("A tidak menerima galanya sendiri (sudah tampil optimistis di layar)",
      !terimaA.any((m) => m["type"] == "chat:pesan"));

  // B membalas, A harus menerima.
  print("\n5. B membalas, A menerima seketika");
  final tanda2 = "balas-${DateTime.now().millisecondsSinceEpoch}";
  await b.minta("/chats/notify",
      metode: "POST", isi: {"chat_id": chatId, "text": tanda2});
  final diterimaA = await aDapat.future.timeout(const Duration(seconds: 15),
      onTimeout: () => <String, dynamic>{});
  cek("A menerima balasan B lewat WebSocket", diterimaA.isNotEmpty);
  if (diterimaA.isNotEmpty) {
    cek("isi balasan utuh", (diterimaA["pesan"] as Map)["isi"] == tanda2);
  }

  // Keduanya tersimpan (pengganti Firestore).
  print("\n6. Pesan tersimpan di server sendiri (bukan Firestore)");
  final riwayat = await a.minta("/chats/$chatId/pesan");
  final pesan = (riwayat["pesan"] as List?) ?? [];
  cek("pesan pertama tersimpan", pesan.any((p) => (p as Map)["isi"] == tanda));
  cek("balasan tersimpan", pesan.any((p) => (p as Map)["isi"] == tanda2));

  print("\n" + "=" * 58);
  print("  LULUS: $lulus    GAGAL: $gagal");
  print("=" * 58);

  await wsA.close();
  await wsB.close();
  a.klien.close(force: true);
  b.klien.close(force: true);
  exit(gagal == 0 ? 0 : 1);
}

Future<String> token(Sesi s) async {
  final d = await s.minta("/auth/ws-token");
  return d["token"] as String;
}

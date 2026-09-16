// Kirim pesan uji ke beberapa akun sasaran untuk memicu munculnya chat.
//
// Dipakai untuk memverifikasi tampilan daftar chat dari sisi akun yang
// benar-benar punya lawan bicara (bukan chat buatan yang kosong).

import "dart:convert";
import "dart:io";

const api = "https://api.skadesmart.web.id/api";
const asal = "https://skadesmart.web.id";

class Sesi {
  final HttpClient klien;
  String? cookie;
  int? userId;
  String? nama;
  Sesi(this.klien);

  Future<Map<String, dynamic>> minta(String jalur,
      {String metode = "GET", Map<String, dynamic>? isi}) async {
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
    Map<String, dynamic> d;
    try {
      d = jsonDecode(teks) as Map<String, dynamic>;
    } catch (_) {
      d = {"_mentah": teks};
    }
    d["_status"] = res.statusCode;
    return d;
  }

  Future<void> login(String nisn, String sandi) async {
    final d = await minta("/auth/login",
        metode: "POST", isi: {"nisn": nisn, "password": sandi});
    if (d["_status"] != 200) throw Exception("Login $nisn gagal: ${d["error"]}");
    final u = d["user"] as Map<String, dynamic>;
    userId = u["id"] as int?;
    nama = u["full_name"] as String?;
  }
}

void main() async {
  final env = File("/home/ikhsan/Documents/skadesmart/backend/.env").readAsStringSync();
  final sandi = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env)!.group(1)!.trim();

  // Pengirim = Fajar (10005). Sasaran = admin dan beberapa akun lain.
  final pengirim = Sesi(HttpClient()..connectionTimeout = const Duration(seconds: 20));
  await pengirim.login("10005", sandi);
  print("Pengirim: ${pengirim.nama} (id ${pengirim.userId})\n");

  // Cari tahu dulu siapa saja yang ada di basis data.
  final daftar = await pengirim.minta("/chats");
  final chats = List<Map<String, dynamic>>.from(daftar["chats"] as List? ?? []);
  print("Chat yang sudah ada (${chats.length}):");
  for (final c in chats) {
    print("  - other_id=${c["other_id"]} nama=${c["other_name"]} "
        "unit=${c["is_unit"]} pesan_terakhir='${c["last_message"]}'");
  }

  print("\n=== Mengirim pesan ke akun sasaran ===");
  for (final nisn in ["10001", "10002", "10003", "10004"]) {
    try {
      // Login sebagai sasaran supaya bisa membuat chat ke pengirim.
      final sasaran = Sesi(HttpClient()..connectionTimeout = const Duration(seconds: 20));
      await sasaran.login(nisn, sandi);

      // Cari chat antara sasaran dan pengirim; kalau tidak ada, buat baru.
      final milikSasaran = await sasaran.minta("/chats");
      final daftarSasaran = List<Map<String, dynamic>>.from(
          milikSasaran["chats"] as List? ?? []);
      var chat = daftarSasaran.firstWhere(
        (c) => c["other_id"] == pengirim.userId,
        orElse: () => <String, dynamic>{},
      );

      if (chat.isEmpty) {
        // Buat chat baru: sasaran sebagai pembeli, pengirim sebagai penjual.
        final buat = await sasaran.minta("/chats",
            metode: "POST", isi: {"seller_id": pengirim.userId});
        if (buat["_status"] != 200 && buat["_status"] != 201) {
          print("  $nisn (${sasaran.nama}): gagal buat chat -> ${buat["error"] ?? buat["_status"]}");
          continue;
        }
        final ulang = await sasaran.minta("/chats");
        final d2 = List<Map<String, dynamic>>.from(ulang["chats"] as List? ?? []);
        chat = d2.firstWhere((c) => c["other_id"] == pengirim.userId,
            orElse: () => <String, dynamic>{});
      }

      if (chat.isEmpty) {
        print("  $nisn (${sasaran.nama}): chat tetap tidak ketemu");
        continue;
      }

      final tanda = "Halo dari uji ${DateTime.now().millisecondsSinceEpoch}";
      final kirim = await sasaran.minta("/chats/notify",
          metode: "POST", isi: {"chat_id": chat["id"], "text": tanda});

      print("  $nisn (${sasaran.nama}) -> kirim: status=${kirim["_status"]} "
          "terkirimWs=${kirim["terkirimWs"]} chat=${(chat["id"] as String).substring(0, 8)}");
    } catch (e) {
      print("  $nisn: GAGAL - $e");
    }
  }

  // Lihat hasilnya dari sisi pengirim.
  print("\n=== Daftar chat pengirim setelah pengiriman ===");
  final akhir = await pengirim.minta("/chats");
  final chatsAkhir = List<Map<String, dynamic>>.from(akhir["chats"] as List? ?? []);
  print("Total: ${chatsAkhir.length}");
  for (final c in chatsAkhir) {
    print("  - ${c["other_name"]} (other_id=${c["other_id"]}) "
        "pesan='${(c["last_message"] ?? "").toString().substring(0, (c["last_message"] ?? "").toString().length.clamp(0, 40))}' "
        "waktu=${c["last_message_at"]}");
  }
}

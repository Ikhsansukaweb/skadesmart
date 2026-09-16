// Uji WebSocket lewat tunnel publik (wss://).
//
// Ini pembuktian paling penting: koneksi real-time harus tetap hidup melewati
// Cloudflare, karena di produksi semua klien menyambung lewat sana.

import "dart:async";
import "dart:convert";
import "dart:io";

const dasar = "https://api.skadesmart.web.id";
const dasarWs = "wss://api.skadesmart.web.id";

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

Future<Map<String, dynamic>> minta(
  String jalur, {
  String metode = "GET",
  Map<String, dynamic>? isi,
  String? token,
  String? cookie,
  HttpClient? klien,
}) async {
  final c = klien ?? HttpClient();
  final req = await c.openUrl(metode, Uri.parse("$dasar$jalur"));
  req.headers.contentType = ContentType.json;
  // Browser selalu mengirim Origin untuk permintaan lintas domain; cookie
  // hanya ikut kalau permintaannya dianggap berasal dari situs yang diizinkan.
  req.headers.set("Origin", "https://skadesmart.web.id");
  if (token != null) req.headers.set("Authorization", "Bearer $token");
  if (cookie != null) req.headers.set("Cookie", cookie);
  if (isi != null) req.write(jsonEncode(isi));
  final res = await req.close();
  // Header WAJIB dibaca sebelum stream dihabiskan - setelah di-join(), header
  // sudah tidak bisa diakses lagi.
  final sc = res.headers["set-cookie"];
  String? cookieDiterima;
  if (sc != null && sc.isNotEmpty) {
    final mm = RegExp(r"([a-zA-Z_]+)=([^;]+)").firstMatch(sc.first);
    if (mm != null) cookieDiterima = "${mm.group(1)}=${mm.group(2)}";
  }
  final teks = await res.transform(utf8.decoder).join();
  Map<String, dynamic> data = {};
  try {
    data = jsonDecode(teks) as Map<String, dynamic>;
  } catch (_) {
    data = {"_mentah": teks};
  }
  data["_status"] = res.statusCode;
  // Tanpa baris ini, cookie yang sudah dibaca di atas ikut terbuang dan
  // semua panggilan berikutnya berjalan tanpa sesi (selalu 401/0 chat).
  if (cookieDiterima != null) data["_cookie"] = cookieDiterima;
  return data;
}

void main() async {
  print("=== UJI LEWAT TUNNEL PUBLIK (Cloudflare) ===\n");
  final klien = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  // Biarkan HttpClient menyimpan & mengirim cookie sendiri (seperti browser).
  klien.badCertificateCallback = (_, __, ___) => false;

  print("1. Endpoint publik");
  final sehat = await minta("/api/health", klien: klien);
  cek("api.skadesmart.web.id/api/health", sehat["_status"] == 200, "status ${sehat["_status"]}");

  print("\n2. Login");
  final env = File("/home/ikhsan/Documents/skadesmart/backend/.env").readAsStringSync();
  final pw = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env)!.group(1)!.trim();
  final masuk = await minta("/api/auth/login",
      metode: "POST", isi: {"nisn": "10003", "password": pw}, klien: klien);
  final token = masuk["token"] as String?;
  cek("login lewat tunnel mengembalikan JWT", token != null, "${masuk["error"]}");

  // Simpan cookie sesi seperti yang dilakukan browser pada permintaan berikutnya.
  final cookie = masuk["_cookie"] as String?;
  cek("cookie sesi diterima", cookie != null);

  if (token == null) {
    print("\n  Tidak bisa lanjut tanpa token.");
    exit(1);
  }

  print("\n3. WebSocket lewat wss:// (inti pengganti Firestore)");
  WebSocket ws;
  try {
    ws = await WebSocket.connect("$dasarWs/ws?token=$token")
        .timeout(const Duration(seconds: 20));
    cek("koneksi wss:// berhasil melewati Cloudflare", true);
  } catch (e) {
    cek("koneksi wss:// berhasil melewati Cloudflare", false, "$e");
    print("\n  Kalau gagal, tunnel mungkin belum meneruskan upgrade WebSocket.");
    exit(1);
  }

  final masuk2 = <Map<String, dynamic>>[];
  final siap = Completer<void>();
  final pesanChat = Completer<Map<String, dynamic>>();
  ws.listen((p) {
    final d = jsonDecode(p as String) as Map<String, dynamic>;
    masuk2.add(d);
    if (d["type"] == "siap" && !siap.isCompleted) siap.complete();
    if (d["type"] == "chat:pesan" && !pesanChat.isCompleted) pesanChat.complete(d);
  });

  await siap.future.timeout(const Duration(seconds: 10), onTimeout: () {});
  cek("server menyapa lewat wss://", masuk2.any((m) => m["type"] == "siap"),
      "diterima: ${masuk2.map((m) => m["type"]).toList()}");

  ws.add(jsonEncode({"type": "ping"}));
  await Future.delayed(const Duration(seconds: 2));
  cek("ping/pong lewat wss:// (koneksi tidak diputus Cloudflare)",
      masuk2.any((m) => m["type"] == "pong"));

  print("\n4. Pesan real-time end-to-end");
  final daftar = await minta("/api/chats", token: token, cookie: cookie, klien: klien);
  final chats = (daftar["chats"] as List?) ?? [];
  cek("daftar chat terbaca", chats.isNotEmpty, "jumlah: ${chats.length}");

  if (chats.isNotEmpty) {
    final chatId = (chats.first as Map)["id"] as String;
    final tanda = "tunnel-${DateTime.now().millisecondsSinceEpoch}";

    await minta("/api/chats/notify",
        metode: "POST",
        token: token,
        cookie: cookie,
        isi: {"chat_id": chatId, "text": tanda},
        klien: klien);

    final ev = await pesanChat.future.timeout(const Duration(seconds: 15),
        onTimeout: () => <String, dynamic>{});
    cek("pesan sampai lewat WebSocket publik", ev.isNotEmpty);
    if (ev.isNotEmpty) {
      cek("isi pesan utuh", (ev["pesan"] as Map)["isi"] == tanda,
          "diterima: '${(ev["pesan"] as Map)["isi"]}'");
    }

    // Terbukti tersimpan di basis data (bukan Firestore).
    final riwayat = await minta("/api/chats/$chatId/pesan", token: token, cookie: cookie, klien: klien);
    final pesan = (riwayat["pesan"] as List?) ?? [];
    cek("pesan tersimpan di SQLite server sendiri",
        pesan.any((p) => (p as Map)["isi"] == tanda), "total: ${pesan.length}");
  }

  print("\n" + "=" * 58);
  print("  LULUS: $lulus    GAGAL: $gagal");
  print("=" * 58);

  await ws.close();
  klien.close(force: true);
  exit(gagal == 0 ? 0 : 1);
}

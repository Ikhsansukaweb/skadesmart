// Uji alur sesi lintas-domain lewat tunnel publik.
//
// Meniru cara browser bekerja: login dari "situs frontend", lalu pakai cookie
// yang diterima untuk memanggil API. Kalau cookie tidak ikut, permintaan akan
// balas 401 — inilah yang dulu membuat "tidak bisa kirim chat".

import "dart:convert";
import "dart:io";

const api = "https://api.skadesmart.web.id/api";
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

void main() async {
  print("=== UJI SESI LINTAS-DOMAIN (lewat tunnel) ===\n");

  final klien = HttpClient()..connectionTimeout = const Duration(seconds: 20);
  String? cookie;

  final env = File("/home/ikhsan/Documents/skadesmart/backend/.env").readAsStringSync();
  final pw = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env)!.group(1)!.trim();

  // ---------------------------------------------------------------- Login
  print("1. Login (meniru permintaan dari situs frontend)");
  final req = await klien.openUrl("POST", Uri.parse("$api/auth/login"));
  req.headers.contentType = ContentType.json;
  // Browser selalu mengirim header ini untuk permintaan lintas domain.
  req.headers.set("Origin", asal);
  req.write(jsonEncode({"nisn": "10003", "password": pw}));
  final res = await req.close();
  final body = await res.transform(utf8.decoder).join();
  final data = jsonDecode(body) as Map<String, dynamic>;

  cek("login berhasil", res.statusCode == 200, "status ${res.statusCode}");

  final setCookie = res.headers["set-cookie"];
  cek("server mengirim cookie sesi", setCookie != null && setCookie.isNotEmpty);
  if (setCookie != null) {
    final sc = setCookie.join("; ");
    cek("cookie diberi SameSite=None (wajib untuk lintas subdomain)",
        sc.toLowerCase().contains("samesite=none"), sc.substring(0, sc.length > 90 ? 90 : sc.length));
    cek("cookie diberi Secure (wajib bersama SameSite=None)",
        sc.toLowerCase().contains("secure"));
    final m = RegExp(r"([a-zA-Z_]+)=([^;]+)").firstMatch(setCookie.first);
    if (m != null) cookie = "${m.group(1)}=${m.group(2)}";
  }

  // ------------------------------------------------- Uji CORS + cookie
  print("\n2. Panggilan API membawa cookie (ini yang dulu gagal)");
  final req2 = await klien.openUrl("GET", Uri.parse("$api/auth/me"));
  req2.headers.set("Origin", asal);
  if (cookie != null) req2.headers.set("Cookie", cookie!);
  final res2 = await req2.close();
  final body2 = await res2.transform(utf8.decoder).join();

  cek("GET /auth/me dengan cookie -> 200 (bukan 401)",
      res2.statusCode == 200, "status ${res2.statusCode}: ${body2.length > 70 ? body2.substring(0, 70) : body2}");

  final acao = res2.headers.value("access-control-allow-origin");
  cek("CORS mengizinkan https://skadesmart.web.id", acao == asal || acao == "*",
      "header: $acao");
  final acc = res2.headers.value("access-control-allow-credentials");
  cek("CORS mengizinkan credentials (cookie)", acc == "true", "header: $acc");

  // ------------------------------------------------------- Daftar chat
  print("\n3. Chat bisa diakses (inti keluhan \"tidak bisa kirim\")");
  final req3 = await klien.openUrl("GET", Uri.parse("$api/chats"));
  req3.headers.set("Origin", asal);
  if (cookie != null) req3.headers.set("Cookie", cookie!);
  final res3 = await req3.close();
  final body3 = await res3.transform(utf8.decoder).join();
  cek("GET /chats -> 200", res3.statusCode == 200,
      "status ${res3.statusCode}: ${body3.length > 70 ? body3.substring(0, 70) : body3}");

  final chats = (jsonDecode(body3) as Map)["chats"] as List? ?? [];

  if (chats.isNotEmpty) {
    final chatId = (chats.first as Map)["id"] as String;
    final tanda = "kirim-${DateTime.now().millisecondsSinceEpoch}";

    final req4 = await klien.openUrl("POST", Uri.parse("$api/chats/notify"));
    req4.headers.contentType = ContentType.json;
    req4.headers.set("Origin", asal);
    if (cookie != null) req4.headers.set("Cookie", cookie!);
    req4.write(jsonEncode({"chat_id": chatId, "text": tanda}));
    final res4 = await req4.close();
    final body4 = await res4.transform(utf8.decoder).join();
    cek("KIRIM PESAN -> 200", res4.statusCode == 200,
        "status ${res4.statusCode}: ${body4.length > 80 ? body4.substring(0, 80) : body4}");
    if (res4.statusCode == 200) {
      final d = jsonDecode(body4) as Map;
      cek("server melaporkan pesan disebar ke klien lain", d["terkirimWs"] is num);
    }

    // Riwayat: bukan /api/api lagi.
    final req5 = await klien.openUrl("GET", Uri.parse("$api/chats/$chatId/pesan"));
    req5.headers.set("Origin", asal);
    if (cookie != null) req5.headers.set("Cookie", cookie!);
    final res5 = await req5.close();
    cek("GET /chats/:id/pesan -> 200 (bukan 404 /api/api)",
        res5.statusCode == 200, "status ${res5.statusCode}");
  }

  print("\n" + "=" * 58);
  print("  LULUS: $lulus    GAGAL: $gagal");
  print("=" * 58);

  klien.close(force: true);
  exit(gagal == 0 ? 0 : 1);
}

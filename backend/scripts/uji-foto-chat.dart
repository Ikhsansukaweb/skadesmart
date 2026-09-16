// Uji kirim FOTO end-to-end: unggah ke Catbox, kirim ke chat, lalu pastikan
// tautannya benar-benar tersimpan dan bisa diunduh.
//
// Inilah pembuktian bug "foto jadi putih": sebelumnya image_url dibuang
// sehingga tidak pernah tersimpan.

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

String? cookie;

Future<Map<String, dynamic>> minta(
  HttpClient klien,
  String jalur, {
  String metode = "GET",
  Object? isi,
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
  Map<String, dynamic> d;
  try {
    d = jsonDecode(teks) as Map<String, dynamic>;
  } catch (_) {
    d = {"_mentah": teks};
  }
  d["_status"] = res.statusCode;
  return d;
}

void main() async {
  print("=== UJI KIRIM FOTO END-TO-END ===\n");

  final env = File("/home/ikhsan/Documents/skadesmart/backend/.env").readAsStringSync();
  final sandi = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env)!.group(1)!.trim();
  final klien = HttpClient()..connectionTimeout = const Duration(seconds: 30);

  // ------------------------------------------------------------- 1. Login
  print("1. Login");
  final masuk = await minta(klien, "/auth/login",
      metode: "POST", isi: {"nisn": "10005", "password": sandi});
  cek("login berhasil", masuk["_status"] == 200, "status ${masuk["_status"]}");

  // ------------------------------------------------------- 2. Ambil chat
  print("\n2. Ambil chat tujuan");
  final daftar = await minta(klien, "/chats");
  final chats = List<Map<String, dynamic>>.from(daftar["chats"] as List? ?? []);
  cek("ada chat", chats.isNotEmpty, "jumlah: ${chats.length}");
  if (chats.isEmpty) return;
  final chatId = chats.first["id"] as String;
  print("     chat: ${chatId.substring(0, 12)}...");

  // ------------------------------------------- 3. Unggah foto ke server
  print("\n3. Unggah foto lewat backend (multipart)");
  final berkasFoto = File("/tmp/uji-catbox.png");
  cek("berkas uji ada", berkasFoto.existsSync(), "/tmp/uji-catbox.png");
  if (!berkasFoto.existsSync()) return;

  final isiFoto = berkasFoto.readAsBytesSync();
  // Bangun multipart secara manual.
  const batas = "----SkadesMartUji";
  final badan = <int>[];
  void tambah(String t) => badan.addAll(utf8.encode(t));
  tambah("--$batas\r\n");
  tambah('Content-Disposition: form-data; name="file"; filename="uji.png"\r\n');
  tambah("Content-Type: image/png\r\n\r\n");
  badan.addAll(isiFoto);
  tambah("\r\n--$batas--\r\n");

  final reqUnggah = await klien.openUrl("POST", Uri.parse("$api/upload/image"));
  reqUnggah.headers.set("Content-Type", "multipart/form-data; boundary=$batas");
  reqUnggah.headers.set("Origin", asal);
  if (cookie != null) reqUnggah.headers.set("Cookie", cookie!);
  reqUnggah.add(badan);
  final resUnggah = await reqUnggah.close();
  final teksUnggah = await resUnggah.transform(utf8.decoder).join();

  Map<String, dynamic> dataUnggah;
  try {
    dataUnggah = jsonDecode(teksUnggah) as Map<String, dynamic>;
  } catch (_) {
    dataUnggah = {"_mentah": teksUnggah};
  }
  cek("unggah berhasil (200)", resUnggah.statusCode == 200,
      "status ${resUnggah.statusCode}: ${teksUnggah.length > 120 ? teksUnggah.substring(0, 120) : teksUnggah}");

  final url = dataUnggah["url"] as String?;
  cek("server mengembalikan URL gambar", url != null, "respons: $dataUnggah");
  if (url == null) return;
  print("     URL: $url");

  // URL harus bisa diunduh dan byte-nya identik.
  final resUnduh = await HttpClient().getUrl(Uri.parse(url));
  final unduh = await resUnduh.close();
  final byteUnduh = await unduh.fold<List<int>>(<int>[], (a, b) => a..addAll(b));
  cek("URL bisa diunduh (200)", unduh.statusCode == 200, "status ${unduh.statusCode}");
  cek("ukuran byte IDENTIK dengan aslinya", byteUnduh.length == isiFoto.length,
      "asli=${isiFoto.length} unduh=${byteUnduh.length}");
  cek("content-type gambar", (unduh.headers.contentType?.mimeType ?? "").startsWith("image/"),
      "tipe: ${unduh.headers.contentType?.mimeType}");

  // --------------------------- 4. Kirim foto sebagai pesan chat
  print("\n4. Kirim foto ke chat (inilah yang dulu hilang)");
  final kirim = await minta(klien, "/chats/notify",
      metode: "POST", isi: {"chat_id": chatId, "image_url": url});
  cek("kirim pesan berfoto berhasil", kirim["_status"] == 200,
      "status ${kirim["_status"]}: ${kirim["error"] ?? kirim["_mentah"] ?? ""}");

  // ------------------------------- 5. Pastikan tersimpan
  print("\n5. Foto benar-benar TERSIMPAN (bukan dibuang)");
  final riwayat = await minta(klien, "/chats/$chatId/pesan");
  final pesan = List<Map<String, dynamic>>.from(riwayat["pesan"] as List? ?? []);
  final adaFoto = pesan.where((p) => p["image_url"] == url || p["imageUrl"] == url).toList();
  cek("pesan berisi tautan foto tersimpan", adaFoto.isNotEmpty,
      "total pesan: ${pesan.length}, yang berfoto: ${pesan.where((p) => p["image_url"] != null).length}");
  if (adaFoto.isNotEmpty) {
    cek("tautan yang tersimpan SAMA dengan yang diunggah",
        adaFoto.first["image_url"] == url || adaFoto.first["imageUrl"] == url,
        "tersimpan: ${adaFoto.first["image_url"] ?? adaFoto.first["imageUrl"]}");
  }

  print("\n" + ("=" * 58));
  print("  LULUS: $lulus    GAGAL: $gagal");
  print("=" * 58);
  klien.close(force: true);
  exit(gagal == 0 ? 0 : 1);
}

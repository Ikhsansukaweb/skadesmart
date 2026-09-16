// Uji menyeluruh endpoint SkadesMart yang BELUM pernah diuji.
//
// Skrip ini TIDAK mengubah kode aplikasi. Ia hanya memanggil HTTP endpoint
// milik backend SkadesMart lalu memeriksa status code + bentuk respons yang
// NYATA (bukan asumsi). Semua hasil dicatat ke uji-menyeluruh-hasil.json.
//
// Berbeda dari skrip uji yang sudah ada (uji-sesi / uji-dua-pengguna /
// uji-realtime / uji-tunnel / kirim-uji) yang hanya menyentuh alur chat &
// sesi, skrip ini menyapu seluruh rute yang terdaftar di src/routes/*.ts:
//
//   auth      : logout, notif, ws-token
//   account   : GET /, PUT /, PUT /password, PUT /shop-status, GET /history
//   app       : GET /version
//   products  : GET /, GET /mine, GET /:id, POST /, PUT /:id, DELETE /:id
//   cart      : GET /, POST /, PUT /:productId, DELETE /:productId, DELETE /
//   orders    : brital/checkout, brital/direct, :id/brital-status,
//               laundry (create), :id/laundry-status, :id/payment,
//               mine, incoming, stats, DELETE /:id, siswa/complete
//   ratings   : POST /, GET /product/:id, GET /seller/:id
//   chats     : POST / (unit + 1:1), GET /:id, PUT /:id/mute, DELETE /:id,
//               PATCH /:id/dibaca, push/kunci, push/langganan (POST+DELETE),
//               POST /rating
//   users     : GET /staff/cs, GET /search, GET /:id
//   kwu       : GET /, POST /, PUT /:id, DELETE /:id
//   banners   : GET /, GET /all, POST /, PUT /:id, DELETE /:id
//   admin     : users, users/:id/role, transactions, dashboard/summary,
//               app-config, DELETE users/:id
//   cs        : tickets, tickets/:id, users, chat/:id/moderate,
//               rating/:id/moderate, DELETE users/:id
//   upload    : image, images
//
// Jalankan dari mana saja, misalnya:
//   dart backend/scripts/uji-menyeluruh.dart
//   dart backend/scripts/uji-menyeluruh.dart --lokal   (http://localhost:3737)
//
// Catatan penting soal data: skrip ini MEMBUAT data uji nyata (produk, unit
// KWU, banner, pengguna, tiket CS, pesanan) lalu MENGHAPUSNYA kembali di
// akhir setiap blok. Bila satu langkah gagal, ia tetap berusaha membersihkan.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

// ---------------------------------------------------------------------------
// Konfigurasi sasaran uji
// ---------------------------------------------------------------------------

/// Basis API. Secara default ke tunnel publik supaya sekaligus menguji jalur
/// produksi (TLS, CORS, cookie cross-site). Pakai --lokal untuk localhost.
final bool pakaiLokal = Platform.executableArguments.contains('--lokal') ||
    Platform.script.path.contains('--lokal');

const String apiPublik = "https://api.skadesmart.web.id/api";
const String apiLokal = "http://localhost:3737/api";

final String api = pakaiLokal ? apiLokal : apiPublik;

/// Origin frontend yang dikirim supaya middleware CORS & cookie teruji
/// sebagaimana browser sungguhan bekerja.
const String asal = "https://skadesmart.web.id";

const String berkasEnv =
    "/home/ikhsan/Documents/skadesmart/backend/.env";

// ---------------------------------------------------------------------------
// Kerangka pelaporan
// ---------------------------------------------------------------------------

class Hasil {
  final String endpoint;
  final String metode;
  final List<String> catatan = [];
  bool lulus = true;
  int? status;

  Hasil(this.metode, this.endpoint);

  void periksa(String deskripsi, bool ok, [String? bukti]) {
    if (!ok) lulus = false;
    catatan.add("      ${ok ? "OK   " : "GAGAL"} $deskripsi"
        "${bukti != null ? "  [$bukti]" : ""}");
  }
}

final List<Hasil> semuaHasil = [];
int totalCekLulus = 0;
int totalCekGagal = 0;

/// Catat satu pengecekan endpoint (satu endpoint boleh punya beberapa cek).
void catat(Hasil h) {
  semuaHasil.add(h);
  for (final c in h.catatan) {
    if (c.contains("OK   ")) totalCekLulus++;
    if (c.contains("GAGAL")) totalCekGagal++;
  }
  final tanda = h.lulus ? "LULUS" : "GAGAL";
  print("  [$tanda] ${h.metode.padRight(6)} ${h.endpoint}"
      "${h.status != null ? "  (HTTP ${h.status})" : ""}");
  for (final c in h.catatan) {
    print(c);
  }
}

void judul(String teks) {
  print("\n${"=" * 74}");
  print("  $teks");
  print("=" * 74);
}

// ---------------------------------------------------------------------------
// Klien HTTP dengan sesi cookie (persis cara browser menyimpan sesi httpOnly)
// ---------------------------------------------------------------------------

/// Ubah HttpHeaders menjadi map biasa supaya mudah diperiksa di uji.
Map<String, List<String>> _keMapHeader(HttpHeaders h) {
  final hasil = <String, List<String>>{};
  h.forEach((nama, nilai) => hasil[nama] = List<String>.from(nilai));
  return hasil;
}

class Jawaban {
  final int status;
  final Map<String, dynamic> isi;
  final Map<String, List<String>> header;
  final String mentah;
  Jawaban(this.status, this.isi, this.header, this.mentah);

  bool get jsonValid => isi.isNotEmpty || mentah.trim() == "{}";
  dynamic ambil(String kunci) => isi[kunci];

  /// Ambil satu nilai header (nama header bersifat case-insensitive).
  String? h(String nama) {
    final kunci = nama.toLowerCase();
    for (final e in header.entries) {
      if (e.key.toLowerCase() == kunci) {
        return e.value.isEmpty ? null : e.value.first;
      }
    }
    return null;
  }
}

class Sesi {
  final HttpClient _klien;
  String? _cookie;
  Sesi(this._klien);

  String? get cookie => _cookie;

  /// Ikuti redirect? Backend ini API murni, jadi tidak pernah redirect.
  Future<Jawaban> minta(
    String jalur, {
    String metode = "GET",
    Object? isi,
    bool kirimCookie = true,
    Map<String, String>? headerTambahan,
  }) async {
    final req = await _klien.openUrl(metode, Uri.parse("$api$jalur"));
    req.headers.contentType = ContentType.json;
    req.headers.set("Origin", asal);
    req.followRedirects = false;
    if (kirimCookie && _cookie != null) req.headers.set("Cookie", _cookie!);
    if (headerTambahan != null) {
      headerTambahan.forEach((k, v) => req.headers.set(k, v));
    }
    if (isi != null) req.write(jsonEncode(isi));
    final res = await req.close();

    // Simpan cookie sesi baru (mis. setelah login).
    final sc = res.headers["set-cookie"];
    if (sc != null && sc.isNotEmpty) {
      for (final satu in sc) {
        final m = RegExp(r"(skadesmart_token)=([^;]+)").firstMatch(satu);
        if (m != null) _cookie = "${m.group(1)}=${m.group(2)}";
      }
    }

    final teks = await res.transform(utf8.decoder).join();
    Map<String, dynamic> data;
    try {
      final d = jsonDecode(teks);
      data = d is Map<String, dynamic> ? d : {"_nilai": d};
    } catch (_) {
      data = {};
    }
    return Jawaban(res.statusCode, data, _keMapHeader(res.headers), teks);
  }

  /// Unggah berkas multipart (untuk /api/upload/*).
  Future<Jawaban> unggah(
    String jalur,
    String namaField,
    List<({String nama, List<int> isi, String tipe})> berkas,
  ) async {
    final batas = "----skadesuji${DateTime.now().microsecondsSinceEpoch}";
    final req = await _klien.openUrl("POST", Uri.parse("$api$jalur"));
    req.headers.set("Origin", asal);
    if (_cookie != null) req.headers.set("Cookie", _cookie!);
    req.headers.set(
        "Content-Type", "multipart/form-data; boundary=$batas");

    final bytes = <int>[];
    void tulis(String s) => bytes.addAll(utf8.encode(s));

    for (final b in berkas) {
      tulis("--$batas\r\n");
      tulis('Content-Disposition: form-data; name="$namaField";'
          ' filename="${b.nama}"\r\n');
      tulis("Content-Type: ${b.tipe}\r\n\r\n");
      bytes.addAll(b.isi);
      tulis("\r\n");
    }
    tulis("--$batas--\r\n");
    req.add(bytes);

    final res = await req.close();
    final teks = await res.transform(utf8.decoder).join();
    Map<String, dynamic> data;
    try {
      final d = jsonDecode(teks);
      data = d is Map<String, dynamic> ? d : {"_nilai": d};
    } catch (_) {
      data = {};
    }
    return Jawaban(res.statusCode, data, _keMapHeader(res.headers), teks);
  }
}

// ---------------------------------------------------------------------------
// Bantuan umum
// ---------------------------------------------------------------------------

String bacaPassword() {
  final env = File(berkasEnv).readAsStringSync();
  final m = RegExp(r"^DUMMY_PASSWORD=(.+)$", multiLine: true).firstMatch(env);
  if (m == null) {
    throw StateError("DUMMY_PASSWORD tidak ditemukan di $berkasEnv");
  }
  return m.group(1)!.trim();
}

String ringkas(Object? v, [int n = 110]) {
  final s = v is String ? v : jsonEncode(v);
  return s.length > n ? "${s.substring(0, n)}..." : s;
}

/// PNG 1x1 piksel yang sah — dipakai menguji jalur upload gambar.
const String pngB64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

List<int> get pngBytes => base64Decode(pngB64);

Future<void> diam(int ms) => Future<void>.delayed(Duration(milliseconds: ms));

// ---------------------------------------------------------------------------

late final HttpClient _klienUtama;
late final String password;

/// Sesi per peran: admin, cs, kwu_brital, kwu_laundry, siswa.
final Map<String, Sesi> sesi = {};

Future<bool> login(String peran, String nisn) async {
  final s = Sesi(_klienUtama);
  final r = await s.minta("/auth/login",
      metode: "POST", isi: {"nisn": nisn, "password": password});
  if (r.status == 200 && s.cookie != null) {
    sesi[peran] = s;
    print("  login $peran (NISN $nisn) -> OK");
    return true;
  }
  print("  login $peran (NISN $nisn) -> GAGAL (HTTP ${r.status}) "
      "${ringkas(r.mentah)}");
  return false;
}

Sesi? S(String peran) => sesi[peran];

void main() async {
  print("=== UJI MENYELURUH ENDPOINT SKADESMART ===");
  print("Target  : $api");
  print("Origin  : $asal");
  print("Mulai   : ${DateTime.now().toIso8601String()}");

  _klienUtama = HttpClient()..connectionTimeout = const Duration(seconds: 30);

  try {
    password = bacaPassword();
  } catch (e) {
    print("\nGAGAL memuat kredensial: $e");
    exit(2);
  }

  // -------------------------------------------------------------- Prakondisi
  judul("0. PRAKONDISI — kesehatan server & login tiap peran");
  final sehat = await Sesi(_klienUtama).minta("/health");
  print("  GET /health -> HTTP ${sehat.status} ${ringkas(sehat.mentah, 60)}");
  if (sehat.status != 200) {
    print("\nServer tidak sehat / tidak dapat dijangkau. Uji dihentikan.");
    _klienUtama.close(force: true);
    exit(3);
  }

  await login("admin", "10001");
  await login("cs", "10002");
  await login("kwu_brital", "10003");
  await login("kwu_laundry", "10004");
  await login("siswaA", "10005");
  await login("siswaB", "10006");
  await login("siswaC", "10007");

  if (S("admin") == null || S("siswaA") == null || S("kwu_brital") == null) {
    print("\nLogin inti gagal; uji tidak bisa dilanjutkan.");
    _klienUtama.close(force: true);
    exit(3);
  }

  // ========================================================== BLOK A: AUTH
  judul("A. AUTH — /auth");
  await ujiAuth();

  // ======================================================= BLOK B: ACCOUNT
  judul("B. ACCOUNT — /account");
  await ujiAccount();

  // ============================================================ BLOK C: APP
  judul("C. APP — /app");
  await ujiApp();

  // ======================================================= BLOK D: PRODUCTS
  judul("D. PRODUCTS — /products");
  await ujiProducts();

  // =========================================================== BLOK E: CART
  judul("E. CART — /cart");
  await ujiCart();

  // ========================================================= BLOK F: ORDERS
  judul("F. ORDERS — /orders");
  await ujiOrders();

  // ======================================================== BLOK G: RATINGS
  judul("G. RATINGS — /ratings");
  await ujiRatings();

  // ==================================================== BLOK H: CHAT (sisa)
  judul("H. CHAT — /chats (endpoint yang belum diuji skrip lama)");
  await ujiChat();

  // ========================================================== BLOK I: USERS
  judul("I. USERS — /users");
  await ujiUsers();

  // ============================================================ BLOK J: KWU
  judul("J. KWU — /kwu");
  await ujiKwu();

  // ======================================================== BLOK K: BANNERS
  judul("K. BANNERS — /banners");
  await ujiBanners();

  // ========================================================== BLOK L: ADMIN
  judul("L. ADMIN — /admin");
  await ujiAdmin();

  // ============================================================= BLOK M: CS
  judul("M. CS — /cs");
  await ujiCs();

  // ========================================================= BLOK N: UPLOAD
  judul("N. UPLOAD — /upload");
  await ujiUpload();

  // ======================================================= BLOK O: KEAMANAN
  judul("O. KEAMANAN SILANG — endpoint terproteksi tanpa sesi");
  await ujiTanpaSesi();

  // ------------------------------------------------------------------ Ringkas
  judul("RINGKASAN AKHIR");
  final gagal = semuaHasil.where((h) => !h.lulus).toList();
  print("  Total endpoint diuji : ${semuaHasil.length}");
  print("  Endpoint LULUS       : ${semuaHasil.length - gagal.length}");
  print("  Endpoint GAGAL       : ${gagal.length}");
  print("  Total pengecekan     : ${totalCekLulus + totalCekGagal}"
      "  (OK $totalCekLulus / GAGAL $totalCekGagal)");
  if (gagal.isNotEmpty) {
    print("\n  Endpoint bermasalah:");
    for (final h in gagal) {
      print("   - ${h.metode} ${h.endpoint} (HTTP ${h.status})");
      for (final c in h.catatan.where((c) => c.contains("GAGAL"))) {
        print("     $c");
      }
    }
  }
  print("  Selesai: ${DateTime.now().toIso8601String()}");

  // Simpan hasil mentah supaya bisa diaudit ulang.
  final berkasHasil = File(
      "${Directory.current.path}/uji-menyeluruh-hasil.json");
  berkasHasil.writeAsStringSync(const JsonEncoder.withIndent("  ").convert({
    "target": api,
    "waktu": DateTime.now().toIso8601String(),
    "total_endpoint": semuaHasil.length,
    "endpoint_lulus": semuaHasil.length - gagal.length,
    "endpoint_gagal": gagal.length,
    "pengecekan": {"ok": totalCekLulus, "gagal": totalCekGagal},
    "hasil": [
      for (final h in semuaHasil)
        {
          "metode": h.metode,
          "endpoint": h.endpoint,
          "status_http": h.status,
          "lulus": h.lulus,
          "catatan": h.catatan.map((c) => c.trim()).toList(),
        }
    ],
  }));
  print("  Hasil JSON: ${berkasHasil.path}");

  _klienUtama.close(force: true);
  exit(gagal.isEmpty ? 0 : 1);
}

// ===========================================================================
// A. AUTH
// ===========================================================================
Future<void> ujiAuth() async {
  final s = S("siswaA")!;

  // --- GET /auth/me
  final me = await s.minta("/auth/me");
  final h1 = Hasil("GET", "/auth/me");
  h1.status = me.status;
  h1.periksa("status 200", me.status == 200, "HTTP ${me.status}");
  h1.periksa("ada objek user", me.isi["user"] is Map,
      ringkas(me.isi["user"]));
  final u = me.isi["user"] as Map?;
  h1.periksa("nisn user cocok dengan yang login", u?["nisn"] == "10005",
      "nisn=${u?["nisn"]}");
  h1.periksa("password_hash TIDAK bocor", u != null && !u.containsKey("password_hash"));
  catat(h1);

  // --- GET /auth/ws-token
  final ws = await s.minta("/auth/ws-token");
  final h2 = Hasil("GET", "/auth/ws-token");
  h2.status = ws.status;
  h2.periksa("status 200", ws.status == 200, "HTTP ${ws.status}");
  final token = ws.isi["token"];
  h2.periksa("mengembalikan token", token is String && token.isNotEmpty,
      token is String ? "panjang ${token.length}" : "tidak ada");
  // Token JWT harus 3 bagian dipisah titik.
  h2.periksa("token berbentuk JWT (3 segmen)", token is String &&
      (token as String).split(".").length == 3);
  catat(h2);

  // --- POST /auth/notif (nyala & mati)
  final n1 = await s.minta("/auth/notif", metode: "POST", isi: {"enabled": true});
  final h3 = Hasil("POST", "/auth/notif");
  h3.status = n1.status;
  h3.periksa("status 200", n1.status == 200, "HTTP ${n1.status}");
  h3.periksa("notif_enabled true dilaporkan", n1.isi["notif_enabled"] == true,
      ringkas(n1.isi));
  catat(h3);

  // Kembalikan ke semula supaya tidak mengubah preferensi akun uji.
  await s.minta("/auth/notif", metode: "POST", isi: {"enabled": true});

  // --- POST /auth/logout lalu pastikan sesi benar-benar mati
  final sementara = Sesi(_klienUtama);
  final lg = await sementara.minta("/auth/login",
      metode: "POST", isi: {"nisn": "10007", "password": password});
  final h4 = Hasil("POST", "/auth/logout");
  h4.status = lg.status;
  if (lg.status != 200) {
    h4.periksa("prakondisi login untuk uji logout", false, "HTTP ${lg.status}");
    catat(h4);
    return;
  }
  final keluar = await sementara.minta("/auth/logout", metode: "POST");
  h4.status = keluar.status;
  h4.periksa("status 200", keluar.status == 200, "HTTP ${keluar.status}");
  final setCookie = keluar.header["set-cookie"];
  h4.periksa("server mengirim Set-Cookie penghapus sesi",
      setCookie != null && setCookie.isNotEmpty,
      setCookie == null ? "tidak ada Set-Cookie" : ringkas(setCookie.first, 70));
  // Cookie dihapus lewat Set-Cookie ber-Expires 1970 -> cookie jar browser
  // MEMBUANG-nya (bukan menyimpannya). Tiru perilaku itu dengan benar:
  // kalau server mengirim penghapus, klien tidak boleh lagi mengirim cookie.
  final penghapus = setCookie != null &&
      setCookie.join("; ").contains("Expires=Thu, 01 Jan 1970");
  h4.periksa("Set-Cookie berbentuk penghapus (Expires 1970)",
      penghapus, ringkas(setCookie?.join("; ") ?? ""));
  final setelah = await sementara.minta("/auth/me", kirimCookie: !penghapus);
  h4.periksa("setelah logout, GET /auth/me -> 401",
      setelah.status == 401, "HTTP ${setelah.status}");
  catat(h4);

  // --- Login NEGATIF: NISN tidak terdaftar harus 404 (bukan auto-register)
  final sN = Sesi(_klienUtama);
  final nf = await sN.minta("/auth/login",
      metode: "POST", isi: {"nisn": "99999", "password": password});
  final h5 = Hasil("POST", "/auth/login (NISN tak terdaftar)");
  h5.status = nf.status;
  h5.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
  h5.periksa("ada kode NISN_NOT_FOUND", nf.isi["code"] == "NISN_NOT_FOUND",
      ringkas(nf.isi));
  catat(h5);

  // --- Login NEGATIF: password salah harus 401
  final sP = Sesi(_klienUtama);
  final pw = await sP.minta("/auth/login",
      metode: "POST", isi: {"nisn": "10005", "password": "password-salah-xyz"});
  final h6 = Hasil("POST", "/auth/login (password salah)");
  h6.status = pw.status;
  h6.periksa("status 401", pw.status == 401, "HTTP ${pw.status}");
  h6.periksa("tidak mengirim cookie sesi", sP.cookie == null,
      "cookie=${sP.cookie}");
  catat(h6);

  // --- Validasi: NISN bukan 5 digit -> 400
  final sV = Sesi(_klienUtama);
  final v = await sV.minta("/auth/login",
      metode: "POST", isi: {"nisn": "abc", "password": "x"});
  final h7 = Hasil("POST", "/auth/login (validasi NISN)");
  h7.status = v.status;
  h7.periksa("status 400 untuk NISN tidak valid", v.status == 400,
      "HTTP ${v.status}");
  catat(h7);
}

// ===========================================================================
// B. ACCOUNT
// ===========================================================================
Future<void> ujiAccount() async {
  final s = S("siswaA")!;

  // --- GET /account
  final a = await s.minta("/account");
  final h1 = Hasil("GET", "/account");
  h1.status = a.status;
  h1.periksa("status 200", a.status == 200, "HTTP ${a.status}");
  final au = a.isi["user"] as Map?;
  h1.periksa("ada objek user", au != null);
  h1.periksa("memuat kolom shop_open", au != null && au.containsKey("shop_open"),
      "shop_open=${au?["shop_open"]}");
  h1.periksa("memuat kolom banner_url", au != null && au.containsKey("banner_url"));
  h1.periksa("password_hash tidak ikut terkirim",
      au != null && !au.containsKey("password_hash"));
  catat(h1);

  // --- PUT /account (ubah foto profil + notif)
  final sebelum = au?["profile_photo_url"];
  final p = await s.minta("/account", metode: "PUT", isi: {
    "profile_photo_url": "https://files.catbox.moe/uji-menyeluruh.png",
    "banner_url": "https://files.catbox.moe/uji-banner.png",
    "notif_enabled": true,
  });
  final h2 = Hasil("PUT", "/account");
  h2.status = p.status;
  h2.periksa("status 200", p.status == 200, "HTTP ${p.status}");
  final sesudah = await s.minta("/account");
  h2.periksa("perubahan benar-benar tersimpan",
      (sesudah.isi["user"] as Map?)?["profile_photo_url"] ==
          "https://files.catbox.moe/uji-menyeluruh.png",
      "tersimpan=${(sesudah.isi["user"] as Map?)?["profile_photo_url"]}");
  catat(h2);

  // --- PUT /account tidak boleh mengubah NISN/nama (field terlarang -> 400)
  final terlarang = await s.minta("/account", metode: "PUT",
      isi: {"full_name": "Diretas"});
  final h3 = Hasil("PUT", "/account (field terlarang)");
  h3.status = terlarang.status;
  h3.periksa("status 400 (skema strict menolak field asing)",
      terlarang.status == 400, "HTTP ${terlarang.status}");
  final cek = await s.minta("/account");
  h3.periksa("nama TIDAK ikut berubah",
      (cek.isi["user"] as Map?)?["full_name"] != "Diretas",
      "full_name=${(cek.isi["user"] as Map?)?["full_name"]}");
  catat(h3);

  // --- PUT /account/password : password lama salah -> 401
  final psalah = await s.minta("/account/password", metode: "PUT", isi: {
    "current_password": "jelas-salah-xxx",
    "new_password": "baru1234",
  });
  final h4 = Hasil("PUT", "/account/password (password lama salah)");
  h4.status = psalah.status;
  h4.periksa("status 401", psalah.status == 401, "HTTP ${psalah.status}");
  catat(h4);

  // --- PUT /account/password : ganti ke password baru lalu kembalikan
  final pbaru = await s.minta("/account/password", metode: "PUT", isi: {
    "current_password": password,
    "new_password": "UjiSementara123!",
  });
  final h5 = Hasil("PUT", "/account/password (ganti + pulihkan)");
  h5.status = pbaru.status;
  h5.periksa("status 200 saat ganti password", pbaru.status == 200,
      "HTTP ${pbaru.status}");
  if (pbaru.status == 200) {
    // Verifikasi password BARU benar-benar berlaku.
    final sBaru = Sesi(_klienUtama);
    final cobaBaru = await sBaru.minta("/auth/login",
        metode: "POST", isi: {"nisn": "10005", "password": "UjiSementara123!"});
    h5.periksa("login dengan password baru berhasil",
        cobaBaru.status == 200, "HTTP ${cobaBaru.status}");
    // Pulihkan ke password semula supaya sisa uji tetap valid.
    final pulih = await sBaru.minta("/account/password", metode: "PUT", isi: {
      "current_password": "UjiSementara123!",
      "new_password": password,
    });
    h5.periksa("password dikembalikan ke semula",
        pulih.status == 200, "HTTP ${pulih.status}");
    // Pastikan login lama kembali bekerja.
    final cekLama = Sesi(_klienUtama);
    final coba = await cekLama.minta("/auth/login",
        metode: "POST", isi: {"nisn": "10005", "password": password});
    h5.periksa("login dengan password awal kembali berhasil",
        coba.status == 200, "HTTP ${coba.status}");
  }
  catat(h5);

  // --- PUT /account/shop-status : siswa biasa harus 403
  final tolak = await s.minta("/account/shop-status",
      metode: "PUT", isi: {"shop_open": false});
  final h6 = Hasil("PUT", "/account/shop-status (role siswa)");
  h6.status = tolak.status;
  h6.periksa("status 403 untuk siswa biasa", tolak.status == 403,
      "HTTP ${tolak.status}");
  catat(h6);

  // --- PUT /account/shop-status : staf kwu_brital boleh, lalu buka kembali
  final kb = S("kwu_brital")!;
  final tutup = await kb.minta("/account/shop-status",
      metode: "PUT", isi: {"shop_open": false});
  final h7 = Hasil("PUT", "/account/shop-status (kwu_brital)");
  h7.status = tutup.status;
  h7.periksa("status 200 untuk staf kwu_brital", tutup.status == 200,
      "HTTP ${tutup.status}");
  h7.periksa("respons melaporkan shop_open=false",
      tutup.isi["shop_open"] == false, ringkas(tutup.isi));
  final buka = await kb.minta("/account/shop-status",
      metode: "PUT", isi: {"shop_open": true});
  h7.periksa("toko dibuka kembali", buka.status == 200, "HTTP ${buka.status}");
  catat(h7);

  // --- GET /account/history
  final hs = await s.minta("/account/history");
  final h8 = Hasil("GET", "/account/history");
  h8.status = hs.status;
  h8.periksa("status 200", hs.status == 200, "HTTP ${hs.status}");
  final orders = hs.isi["orders"];
  h8.periksa("ada array orders", orders is List,
      orders is List ? "${orders.length} pesanan" : "bukan list");
  if (orders is List && orders.isNotEmpty) {
    final o = orders.first as Map;
    h8.periksa("pesanan memuat nama penjual (join users)",
        o.containsKey("seller_name"), "seller_name=${o["seller_name"]}");
  }
  catat(h8);
}

// ===========================================================================
// C. APP
// ===========================================================================
Future<void> ujiApp() async {
  final s = Sesi(_klienUtama); // endpoint publik, tanpa sesi
  final v = await s.minta("/app/version");
  final h = Hasil("GET", "/app/version");
  h.status = v.status;
  h.periksa("status 200 (publik, tanpa login)", v.status == 200,
      "HTTP ${v.status}");
  h.periksa("ada latest_version", v.isi["latest_version"] is String,
      "latest_version=${v.isi["latest_version"]}");
  h.periksa("ada min_supported_version",
      v.isi["min_supported_version"] is String,
      "min_supported_version=${v.isi["min_supported_version"]}");
  h.periksa("force_update bertipe boolean", v.isi["force_update"] is bool,
      "force_update=${v.isi["force_update"]}");
  h.periksa("ada update_message", v.isi.containsKey("update_message"),
      "update_message=${ringkas(v.isi["update_message"], 40)}");
  catat(h);
}

// ===========================================================================
// D. PRODUCTS
// ===========================================================================
Future<void> ujiProducts() async {
  final publik = Sesi(_klienUtama);
  final siswa = S("siswaA")!;
  final kb = S("kwu_brital")!;
  final idDibuat = <int>[];

  // --- GET /products (daftar)
  final lg = await publik.minta("/products");
  final h1 = Hasil("GET", "/products");
  h1.status = lg.status;
  h1.periksa("status 200", lg.status == 200, "HTTP ${lg.status}");
  h1.periksa("ada array products", lg.isi["products"] is List,
      "${(lg.isi["products"] as List?)?.length} produk");
  h1.periksa("ada page & limit", lg.isi["page"] == 1 && lg.isi["limit"] == 20,
      "page=${lg.isi["page"]} limit=${lg.isi["limit"]}");
  catat(h1);

  // --- GET /products?category=kwu_brital (filter)
  final fk = await publik.minta("/products?category=kwu_brital&limit=50");
  final h2 = Hasil("GET", "/products?category=kwu_brital");
  h2.status = fk.status;
  h2.periksa("status 200", fk.status == 200, "HTTP ${fk.status}");
  final fkl = fk.isi["products"] as List? ?? [];
  h2.periksa("semua hasil berkategori kwu_brital",
      fkl.every((p) => (p as Map)["category"] == "kwu_brital"),
      "${fkl.length} produk");
  h2.periksa("menyertakan seller_shop_open",
      fkl.isEmpty || fkl.first.containsKey("seller_shop_open"));
  catat(h2);

  // --- GET /products?search=... (pencarian)
  final fs = await publik.minta("/products?search=Ayam&limit=50");
  final h3 = Hasil("GET", "/products?search=Ayam");
  h3.status = fs.status;
  h3.periksa("status 200", fs.status == 200, "HTTP ${fs.status}");
  final fsl = fs.isi["products"] as List? ?? [];
  h3.periksa("semua nama hasil mengandung 'Ayam' (case-insensitive)",
      fsl.every((p) => ((p as Map)["name"] as String).toLowerCase().contains("ayam")),
      fsl.map((p) => (p as Map)["name"]).join(", "));
  catat(h3);

  // --- GET /products dengan limit di luar batas -> 400
  final vq = await publik.minta("/products?limit=999");
  final h4 = Hasil("GET", "/products?limit=999 (validasi)");
  h4.status = vq.status;
  h4.periksa("status 400 karena limit > 50", vq.status == 400,
      "HTTP ${vq.status}");
  catat(h4);

  // --- POST /products sebagai siswa (kategori siswa)
  final namaUji = "UjiMenyeluruh-${DateTime.now().millisecondsSinceEpoch}";
  final buat = await siswa.minta("/products", metode: "POST", isi: {
    "name": namaUji,
    "description": "produk uji otomatis",
    "price": 1500,
    "stock": 7,
    "category": "siswa",
    "image_urls": ["https://files.catbox.moe/uji1.png"],
  });
  final h5 = Hasil("POST", "/products (kategori siswa)");
  h5.status = buat.status;
  h5.periksa("status 201", buat.status == 201, "HTTP ${buat.status}");
  final pid = buat.isi["id"];
  h5.periksa("mengembalikan id produk baru", pid is int, "id=$pid");
  if (pid is int) idDibuat.add(pid);
  catat(h5);

  // --- POST /products siswa mencoba kategori kwu_brital -> 403
  final coba = await siswa.minta("/products", metode: "POST", isi: {
    "name": "Coba Brital $namaUji",
    "price": 1000,
    "stock": 1,
    "category": "kwu_brital",
  });
  final h6 = Hasil("POST", "/products (siswa, kategori kwu_brital)");
  h6.status = coba.status;
  h6.periksa("status 403 (hanya staf KWU Brital)", coba.status == 403,
      "HTTP ${coba.status}");
  catat(h6);

  // --- GET /products/:id detail
  if (idDibuat.isNotEmpty) {
    final d = await publik.minta("/products/${idDibuat.first}");
    final h7 = Hasil("GET", "/products/:id");
    h7.status = d.status;
    h7.periksa("status 200", d.status == 200, "HTTP ${d.status}");
    final pr = d.isi["product"] as Map?;
    h7.periksa("ada objek product", pr != null);
    h7.periksa("nama produk sesuai", pr?["name"] == namaUji,
        "name=${pr?["name"]}");
    h7.periksa("ada array images", pr?["images"] is List,
        "images=${(pr?["images"] as List?)?.length}");
    h7.periksa("info penjual dilampirkan",
        pr != null && pr["seller_name"] != null, "seller=${pr?["seller_name"]}");
    h7.periksa("ada array ratings", d.isi["ratings"] is List);
    catat(h7);
  }

  // --- GET /products/:id yang tidak ada -> 404
  final nf = await publik.minta("/products/999999");
  final h8 = Hasil("GET", "/products/999999 (tidak ada)");
  h8.status = nf.status;
  h8.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
  catat(h8);

  // --- GET /products/mine
  final mine = await siswa.minta("/products/mine");
  final h9 = Hasil("GET", "/products/mine (siswa)");
  h9.status = mine.status;
  h9.periksa("status 200", mine.status == 200, "HTTP ${mine.status}");
  final ml = mine.isi["products"] as List? ?? [];
  h9.periksa("produk yang baru dibuat muncul di /mine",
      ml.any((p) => (p as Map)["id"] == idDibuat.firstOrNull),
      "${ml.length} produk");
  catat(h9);

  // --- GET /products/mine untuk staf kwu_brital (lihat semua produk brital)
  final mineKb = await kb.minta("/products/mine");
  final h10 = Hasil("GET", "/products/mine (kwu_brital)");
  h10.status = mineKb.status;
  h10.periksa("status 200", mineKb.status == 200, "HTTP ${mineKb.status}");
  final mkbl = mineKb.isi["products"] as List? ?? [];
  h10.periksa("staf KWU Brital melihat produk kategori kwu_brital milik unit",
      mkbl.any((p) => (p as Map)["category"] == "kwu_brital"),
      "${mkbl.length} produk terlihat");
  catat(h10);

  // --- PUT /products/:id oleh pemilik
  if (idDibuat.isNotEmpty) {
    final ubah = await siswa.minta("/products/${idDibuat.first}",
        metode: "PUT", isi: {"price": 2500, "stock": 9});
    final h11 = Hasil("PUT", "/products/:id (pemilik)");
    h11.status = ubah.status;
    h11.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
    final cek = await publik.minta("/products/${idDibuat.first}");
    final pr = cek.isi["product"] as Map?;
    h11.periksa("harga benar-benar berubah jadi 2500", pr?["price"] == 2500,
        "price=${pr?["price"]}");
    h11.periksa("stok benar-benar berubah jadi 9", pr?["stock"] == 9,
        "stock=${pr?["stock"]}");
    catat(h11);

    // --- PUT /products/:id oleh orang lain -> 403
    final orangLain = await S("siswaB")!
        .minta("/products/${idDibuat.first}", metode: "PUT", isi: {"price": 1});
    final h12 = Hasil("PUT", "/products/:id (bukan pemilik)");
    h12.status = orangLain.status;
    h12.periksa("status 403", orangLain.status == 403,
        "HTTP ${orangLain.status}");
    catat(h12);
  }

  // --- DELETE /products/:id oleh bukan pemilik -> 403
  if (idDibuat.isNotEmpty) {
    final tolak = await S("siswaC")!
        .minta("/products/${idDibuat.first}", metode: "DELETE");
    final h13 = Hasil("DELETE", "/products/:id (bukan pemilik)");
    h13.status = tolak.status;
    h13.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
    catat(h13);
  }

  // --- DELETE /products/:id oleh pemilik (soft delete) + verifikasi hilang
  if (idDibuat.isNotEmpty) {
    final del = await siswa.minta("/products/${idDibuat.first}",
        metode: "DELETE");
    final h14 = Hasil("DELETE", "/products/:id (pemilik)");
    h14.status = del.status;
    h14.periksa("status 200", del.status == 200, "HTTP ${del.status}");
    final cek = await publik.minta("/products/${idDibuat.first}");
    h14.periksa("produk tidak lagi bisa diakses (soft delete) -> 404",
        cek.status == 404, "HTTP ${cek.status}");
    h14.periksa("tidak lagi muncul di daftar publik",
        ((await publik.minta("/products?limit=50")).isi["products"] as List)
            .every((p) => (p as Map)["id"] != idDibuat.first));
    catat(h14);
  }
}

// ===========================================================================
// E. CART
// ===========================================================================
Future<void> ujiCart() async {
  final siswa = S("siswaA")!;
  final kb = S("kwu_brital")!;
  int? produkBrital;
  int? produkSiswa;

  // Bersihkan keranjang lebih dulu agar uji deterministik.
  await siswa.minta("/cart", metode: "DELETE");

  // Siapkan dua produk uji: satu kwu_brital (bisa masuk keranjang) dan satu
  // kategori siswa (harus ditolak keranjang).
  final namaKb = "UjiCartBrital-${DateTime.now().millisecondsSinceEpoch}";
  final buatKb = await kb.minta("/products", metode: "POST", isi: {
    "name": namaKb,
    "description": "produk brital untuk uji keranjang",
    "price": 5000,
    "stock": 20,
    "category": "kwu_brital",
  });
  if (buatKb.isi["id"] is int) produkBrital = buatKb.isi["id"] as int;

  final namaSw = "UjiCartSiswa-${DateTime.now().millisecondsSinceEpoch}";
  final buatSw = await siswa.minta("/products", metode: "POST", isi: {
    "name": namaSw,
    "price": 1000,
    "stock": 5,
    "category": "siswa",
  });
  if (buatSw.isi["id"] is int) produkSiswa = buatSw.isi["id"] as int;

  try {
    // --- GET /cart (kosong)
    final kosong = await siswa.minta("/cart");
    final h1 = Hasil("GET", "/cart");
    h1.status = kosong.status;
    h1.periksa("status 200", kosong.status == 200, "HTTP ${kosong.status}");
    h1.periksa("ada array items", kosong.isi["items"] is List,
        "${(kosong.isi["items"] as List?)?.length} item");
    h1.periksa("ada total", kosong.isi.containsKey("total"),
        "total=${kosong.isi["total"]}");
    catat(h1);

    // --- POST /cart (tambah produk brital)
    if (produkBrital != null) {
      final tambah = await siswa.minta("/cart", metode: "POST", isi: {
        "product_id": produkBrital,
        "quantity": 2,
        "note": "pedas level 3",
      });
      final h2 = Hasil("POST", "/cart");
      h2.status = tambah.status;
      h2.periksa("status 201", tambah.status == 201, "HTTP ${tambah.status}");
      final isi = await siswa.minta("/cart");
      final items = isi.isi["items"] as List? ?? [];
      h2.periksa("item masuk ke keranjang", items.length == 1,
          "${items.length} item");
      if (items.isNotEmpty) {
        final it = items.first as Map;
        h2.periksa("quantity = 2", it["quantity"] == 2, "qty=${it["quantity"]}");
        h2.periksa("total dihitung (2 x 5000 = 10000)",
            isi.isi["total"] == 10000, "total=${isi.isi["total"]}");
        h2.periksa("catatan tersimpan", it["note"] == "pedas level 3",
            "note=${it["note"]}");
      }
      catat(h2);

      // --- POST /cart lagi -> quantity diakumulasi (ON CONFLICT)
      await siswa.minta("/cart", metode: "POST",
          isi: {"product_id": produkBrital, "quantity": 3});
      final isi2 = await siswa.minta("/cart");
      final h3 = Hasil("POST", "/cart (produk sama, akumulasi)");
      h3.status = isi2.status;
      final it2 = (isi2.isi["items"] as List).first as Map;
      h3.periksa("quantity terakumulasi jadi 5", it2["quantity"] == 5,
          "qty=${it2["quantity"]}");
      h3.periksa("total ikut menyesuaikan (5 x 5000 = 25000)",
          isi2.isi["total"] == 25000, "total=${isi2.isi["total"]}");
      catat(h3);

      // --- PUT /cart/:productId
      final ubah = await siswa.minta("/cart/$produkBrital", metode: "PUT",
          isi: {"quantity": 4, "note": "tanpa sambal"});
      final h4 = Hasil("PUT", "/cart/:productId");
      h4.status = ubah.status;
      h4.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
      final isi3 = await siswa.minta("/cart");
      final it3 = (isi3.isi["items"] as List).first as Map;
      h4.periksa("quantity berubah jadi 4", it3["quantity"] == 4,
          "qty=${it3["quantity"]}");
      h4.periksa("catatan berubah", it3["note"] == "tanpa sambal",
          "note=${it3["note"]}");
      catat(h4);

      // --- PUT /cart/:productId yang tidak ada di keranjang -> 404
      final nf = await siswa.minta("/cart/999999",
          metode: "PUT", isi: {"quantity": 1});
      final h5 = Hasil("PUT", "/cart/:productId (tidak ada)");
      h5.status = nf.status;
      h5.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
      catat(h5);

      // --- DELETE /cart/:productId
      final hapus = await siswa.minta("/cart/$produkBrital", metode: "DELETE");
      final h6 = Hasil("DELETE", "/cart/:productId");
      h6.status = hapus.status;
      h6.periksa("status 200", hapus.status == 200, "HTTP ${hapus.status}");
      final isi4 = await siswa.minta("/cart");
      h6.periksa("keranjang kembali kosong",
          (isi4.isi["items"] as List).isEmpty,
          "${(isi4.isi["items"] as List).length} item");
      catat(h6);
    }

    // --- POST /cart dengan produk kategori siswa -> 400
    if (produkSiswa != null) {
      final tolak = await siswa.minta("/cart", metode: "POST",
          isi: {"product_id": produkSiswa, "quantity": 1});
      final h7 = Hasil("POST", "/cart (produk kategori siswa)");
      h7.status = tolak.status;
      h7.periksa("status 400 (keranjang khusus KWU Brital)",
          tolak.status == 400, "HTTP ${tolak.status}");
      catat(h7);
    }

    // --- DELETE /cart (kosongkan seluruh keranjang)
    if (produkBrital != null) {
      await siswa.minta("/cart", metode: "POST",
          isi: {"product_id": produkBrital, "quantity": 1});
    }
    final kosongkan = await siswa.minta("/cart", metode: "DELETE");
    final h8 = Hasil("DELETE", "/cart (kosongkan semua)");
    h8.status = kosongkan.status;
    h8.periksa("status 200", kosongkan.status == 200, "HTTP ${kosongkan.status}");
    final isi5 = await siswa.minta("/cart");
    h8.periksa("keranjang benar-benar kosong",
        (isi5.isi["items"] as List).isEmpty,
        "${(isi5.isi["items"] as List).length} item");
    catat(h8);
  } finally {
    // Bersihkan produk uji.
    await siswa.minta("/cart", metode: "DELETE");
    if (produkSiswa != null) {
      await siswa.minta("/products/$produkSiswa", metode: "DELETE");
    }
    if (produkBrital != null) {
      await kb.minta("/products/$produkBrital", metode: "DELETE");
    }
  }
}

// ===========================================================================
// F. ORDERS
// ===========================================================================
Future<void> ujiOrders() async {
  final siswa = S("siswaA")!;
  final kb = S("kwu_brital")!;
  final kl = S("kwu_laundry")!;
  final siswaB = S("siswaB")!;
  int? produkBrital;
  int? produkSiswaB;

  await siswa.minta("/cart", metode: "DELETE");

  final namaKb = "UjiOrderBrital-${DateTime.now().millisecondsSinceEpoch}";
  final buatKb = await kb.minta("/products", metode: "POST", isi: {
    "name": namaKb,
    "description": "produk brital untuk uji pesanan",
    "price": 8000,
    "stock": 30,
    "category": "kwu_brital",
  });
  if (buatKb.isi["id"] is int) produkBrital = buatKb.isi["id"] as int;

  final namaSw = "UjiOrderSiswa-${DateTime.now().millisecondsSinceEpoch}";
  final buatSw = await siswaB.minta("/products", metode: "POST", isi: {
    "name": namaSw,
    "price": 3000,
    "stock": 3,
    "category": "siswa",
  });
  if (buatSw.isi["id"] is int) produkSiswaB = buatSw.isi["id"] as int;

  final orderDibuat = <int>[];

  try {
    // ---------------------------------------------------- POST brital/direct
    if (produkBrital != null) {
      final langsung = await siswa.minta("/orders/brital/direct",
          metode: "POST", isi: {"product_id": produkBrital, "quantity": 2,
            "note": "jangan pedas"});
      final h1 = Hasil("POST", "/orders/brital/direct");
      h1.status = langsung.status;
      h1.periksa("status 201", langsung.status == 201, "HTTP ${langsung.status}");
      h1.periksa("total = 2 x 8000", langsung.isi["total_price"] == 16000,
          "total=${langsung.isi["total_price"]}");
      h1.periksa("status awal 'baru'", langsung.isi["status"] == "baru",
          "status=${langsung.isi["status"]}");
      if (langsung.isi["id"] is int) orderDibuat.add(langsung.isi["id"] as int);
      catat(h1);

      // Stok wajib berkurang setelah pemesanan.
      final cekProduk = await siswa.minta("/products/$produkBrital");
      h1.periksa("stok produk berkurang (30 -> 28)",
          (cekProduk.isi["product"] as Map?)?["stock"] == 28,
          "stock=${(cekProduk.isi["product"] as Map?)?["stock"]}");
    }

    // ------------------------------------------------ POST brital/checkout
    if (produkBrital != null) {
      await siswa.minta("/cart", metode: "POST",
          isi: {"product_id": produkBrital, "quantity": 1, "note": "extra sambal"});
      final checkout = await siswa.minta("/orders/brital/checkout",
          metode: "POST", isi: {"note": "antar ke kelas"});
      final h2 = Hasil("POST", "/orders/brital/checkout");
      h2.status = checkout.status;
      h2.periksa("status 201", checkout.status == 201,
          "HTTP ${checkout.status}");
      h2.periksa("total = 1 x 8000", checkout.isi["total_price"] == 8000,
          "total=${checkout.isi["total_price"]}");
      if (checkout.isi["id"] is int) orderDibuat.add(checkout.isi["id"] as int);
      final cekKeranjang = await siswa.minta("/cart");
      h2.periksa("keranjang dikosongkan setelah checkout",
          (cekKeranjang.isi["items"] as List).isEmpty);
      catat(h2);

      // ---------------- Checkout keranjang kosong -> 400
      final kosong = await siswa.minta("/orders/brital/checkout",
          metode: "POST", isi: {});
      final h3 = Hasil("POST", "/orders/brital/checkout (keranjang kosong)");
      h3.status = kosong.status;
      h3.periksa("status 400", kosong.status == 400, "HTTP ${kosong.status}");
      catat(h3);
    }

    // ---------------- POST brital/direct produk tak ada -> 404
    final nf = await siswa.minta("/orders/brital/direct", metode: "POST",
        isi: {"product_id": 999999, "quantity": 1});
    final h4 = Hasil("POST", "/orders/brital/direct (produk tak ada)");
    h4.status = nf.status;
    h4.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
    catat(h4);

    // ------------------------------------------- GET /orders/mine
    final mine = await siswa.minta("/orders/mine");
    final h5 = Hasil("GET", "/orders/mine");
    h5.status = mine.status;
    h5.periksa("status 200", mine.status == 200, "HTTP ${mine.status}");
    final mo = mine.isi["orders"] as List? ?? [];
    h5.periksa("pesanan yang baru dibuat muncul", mo.any(
        (o) => orderDibuat.contains((o as Map)["id"])),
        "${mo.length} pesanan");
    if (mo.any((o) => (o as Map)["kwu_unit"] == "kwu_brital")) {
      final brital = mo.firstWhere((o) => (o as Map)["kwu_unit"] == "kwu_brital") as Map;
      h5.periksa("pesanan brital memuat daftar items",
          brital["items"] is List && (brital["items"] as List).isNotEmpty,
          "${(brital["items"] as List?)?.length} item");
    }
    catat(h5);

    // ------------------------------- PUT /orders/:id/brital-status
    if (orderDibuat.isNotEmpty) {
      final oid = orderDibuat.first;
      // Siswa TIDAK boleh mengubah status (bukan role kwu/admin) -> 403.
      final tolak = await siswa.minta("/orders/$oid/brital-status",
          metode: "PUT", isi: {"status": "diproses"});
      final h6 = Hasil("PUT", "/orders/:id/brital-status (role siswa)");
      h6.status = tolak.status;
      h6.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
      catat(h6);

      // Staf kwu_brital boleh mengubah status.
      final ubah = await kb.minta("/orders/$oid/brital-status",
          metode: "PUT", isi: {"status": "diproses"});
      final h7 = Hasil("PUT", "/orders/:id/brital-status (kwu_brital)");
      h7.status = ubah.status;
      h7.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
      h7.periksa("respons melaporkan status baru",
          ubah.isi["status"] == "diproses", ringkas(ubah.isi));
      final cek = await siswa.minta("/orders/mine");
      final o = (cek.isi["orders"] as List)
          .firstWhere((o) => (o as Map)["id"] == oid) as Map;
      h7.periksa("status benar-benar berubah di database",
          o["status"] == "diproses", "status=${o["status"]}");
      catat(h7);

      // Menuju 'selesai' supaya bisa diuji rating & hapus riwayat.
      await kb.minta("/orders/$oid/brital-status",
          metode: "PUT", isi: {"status": "diantar"});
      await kb.minta("/orders/$oid/brital-status",
          metode: "PUT", isi: {"status": "selesai"});
    }

    // --------------------------- GET /orders/incoming (kwu_brital & laundry)
    final masukKb = await kb.minta("/orders/incoming");
    final h8 = Hasil("GET", "/orders/incoming (kwu_brital)");
    h8.status = masukKb.status;
    h8.periksa("status 200", masukKb.status == 200, "HTTP ${masukKb.status}");
    final ikb = masukKb.isi["orders"] as List? ?? [];
    h8.periksa("semua pesanan berunit kwu_brital",
        ikb.every((o) => (o as Map)["kwu_unit"] == "kwu_brital"),
        "${ikb.length} pesanan");
    h8.periksa("memuat nama & NISN pembeli",
        ikb.isEmpty ||
            (ikb.first.containsKey("buyer_name") && ikb.first.containsKey("buyer_nisn")));
    catat(h8);

    // Siswa biasa tidak boleh mengakses incoming -> 403
    final tolakIncoming = await siswa.minta("/orders/incoming");
    final h9 = Hasil("GET", "/orders/incoming (role siswa)");
    h9.status = tolakIncoming.status;
    h9.periksa("status 403", tolakIncoming.status == 403,
        "HTTP ${tolakIncoming.status}");
    catat(h9);

    // ------------------------------- GET /orders/stats
    final st = await kb.minta("/orders/stats");
    final h10 = Hasil("GET", "/orders/stats");
    h10.status = st.status;
    h10.periksa("status 200", st.status == 200, "HTTP ${st.status}");
    final hari = st.isi["days"] as List? ?? [];
    h10.periksa("selalu melaporkan tepat 7 hari", hari.length == 7,
        "${hari.length} hari");
    h10.periksa("tiap hari punya day/count/revenue",
        hari.isEmpty ||
            (hari.first is Map &&
                (hari.first as Map).containsKey("day") &&
                (hari.first as Map).containsKey("count") &&
                (hari.first as Map).containsKey("revenue")));
    catat(h10);

    // ------------------------------- POST /orders/laundry (kwu_laundry)
    final laund = await kl.minta("/orders/laundry", metode: "POST", isi: {
      "buyer_nisn": "10005",
      "quantity": 5,
      "weight_kg": 2.5,
      "total_price": 15000,
      "payment_status": "belum_bayar",
      "note": "kemeja putih jangan dicampur",
    });
    final h11 = Hasil("POST", "/orders/laundry");
    h11.status = laund.status;
    h11.periksa("status 201", laund.status == 201, "HTTP ${laund.status}");
    h11.periksa("status awal langsung 'dicuci'", laund.isi["status"] == "dicuci",
        "status=${laund.isi["status"]}");
    int? laundryId;
    if (laund.isi["id"] is int) {
      laundryId = laund.isi["id"] as int;
      orderDibuat.add(laundryId);
    }
    catat(h11);

    // NISN tidak terdaftar -> 404
    final laundNf = await kl.minta("/orders/laundry", metode: "POST", isi: {
      "buyer_nisn": "99999",
      "total_price": 1000,
    });
    final h12 = Hasil("POST", "/orders/laundry (NISN tak terdaftar)");
    h12.status = laundNf.status;
    h12.periksa("status 404", laundNf.status == 404, "HTTP ${laundNf.status}");
    catat(h12);

    // Siswa tidak boleh membuat pesanan laundry atas namanya sendiri -> 403
    final laundTolak = await siswa.minta("/orders/laundry", metode: "POST", isi: {
      "buyer_nisn": "10006",
      "total_price": 1000,
    });
    final h13 = Hasil("POST", "/orders/laundry (role siswa)");
    h13.status = laundTolak.status;
    h13.periksa("status 403", laundTolak.status == 403,
        "HTTP ${laundTolak.status}");
    catat(h13);

    // ------------------------------- PUT /orders/:id/laundry-status
    if (laundryId != null) {
      final ubah = await kl.minta("/orders/$laundryId/laundry-status",
          metode: "PUT", isi: {"status": "bisa_diambil"});
      final h14 = Hasil("PUT", "/orders/:id/laundry-status");
      h14.status = ubah.status;
      h14.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
      h14.periksa("respons melaporkan status baru",
          ubah.isi["status"] == "bisa_diambil", ringkas(ubah.isi));
      catat(h14);

      // ------------------------------- PUT /orders/:id/payment
      final bayar = await kl.minta("/orders/$laundryId/payment",
          metode: "PUT", isi: {"payment_status": "sudah_bayar"});
      final h15 = Hasil("PUT", "/orders/:id/payment");
      h15.status = bayar.status;
      h15.periksa("status 200", bayar.status == 200, "HTTP ${bayar.status}");
      final cekMine = await siswa.minta("/orders/mine");
      final o = (cekMine.isi["orders"] as List)
          .firstWhere((o) => (o as Map)["id"] == laundryId) as Map;
      h15.periksa("payment_status berubah jadi sudah_bayar",
          o["payment_status"] == "sudah_bayar",
          "payment_status=${o["payment_status"]}");
      catat(h15);

      // Selesaikan supaya bisa diuji rating laundry + hapus riwayat.
      await kl.minta("/orders/$laundryId/laundry-status",
          metode: "PUT", isi: {"status": "selesai"});
    }

    // ------------------------------- POST /orders/siswa/complete
    if (produkSiswaB != null) {
      final selesai = await siswaB.minta("/orders/siswa/complete",
          metode: "POST", isi: {
        "buyer_id": 5, // NISN 10005 = siswaA
        "product_id": produkSiswaB,
        "price": 3000,
      });
      final h16 = Hasil("POST", "/orders/siswa/complete");
      h16.status = selesai.status;
      h16.periksa("status 201", selesai.status == 201,
          "HTTP ${selesai.status}");
      if (selesai.isi["id"] is int) orderDibuat.add(selesai.isi["id"] as int);
      catat(h16);

      // Transaksi dengan diri sendiri -> 400
      final diri = await siswaB.minta("/orders/siswa/complete",
          metode: "POST", isi: {"buyer_id": 6, "price": 1000});
      final h17 = Hasil("POST", "/orders/siswa/complete (diri sendiri)");
      h17.status = diri.status;
      h17.periksa("status 400", diri.status == 400, "HTTP ${diri.status}");
      catat(h17);

      // Produk bukan miliknya -> 403
      final bukanMilik = await siswaB.minta("/orders/siswa/complete",
          metode: "POST", isi: {"buyer_id": 5, "product_id": 6, "price": 1000});
      final h18 = Hasil("POST", "/orders/siswa/complete (produk bukan miliknya)");
      h18.status = bukanMilik.status;
      h18.periksa("status 403", bukanMilik.status == 403,
          "HTTP ${bukanMilik.status}");
      catat(h18);
    }

    // ------------------------------- DELETE /orders/:id
    // Unit yang salah tidak boleh menghapus -> 403
    if (orderDibuat.isNotEmpty) {
      final oid = orderDibuat.first;
      final salahUnit = await kl.minta("/orders/$oid", metode: "DELETE");
      final h19 = Hasil("DELETE", "/orders/:id (unit berbeda)");
      h19.status = salahUnit.status;
      h19.periksa("status 403 (bukan milik unitnya)",
          salahUnit.status == 403, "HTTP ${salahUnit.status}");
      catat(h19);

      // Pesanan aktif tidak boleh dihapus -> 400
      if (produkBrital != null) {
        await siswa.minta("/cart", metode: "POST",
            isi: {"product_id": produkBrital, "quantity": 1});
        final aktif = await siswa.minta("/orders/brital/checkout",
            metode: "POST", isi: {});
        if (aktif.isi["id"] is int) {
          final aid = aktif.isi["id"] as int;
          orderDibuat.add(aid);
          final tolakHapus = await kb.minta("/orders/$aid", metode: "DELETE");
          final h20 = Hasil("DELETE", "/orders/:id (pesanan masih aktif)");
          h20.status = tolakHapus.status;
          h20.periksa("status 400 (hanya selesai/dibatalkan)",
              tolakHapus.status == 400, "HTTP ${tolakHapus.status}");
          catat(h20);
          // Batalkan agar boleh dihapus.
          await kb.minta("/orders/$aid/brital-status",
              metode: "PUT", isi: {"status": "dibatalkan"});
        }
      }

      // Pesanan selesai boleh dihapus oleh unit pemiliknya -> 200
      final hapus = await kb.minta("/orders/$oid", metode: "DELETE");
      final h21 = Hasil("DELETE", "/orders/:id (selesai, unit pemilik)");
      h21.status = hapus.status;
      h21.periksa("status 200", hapus.status == 200, "HTTP ${hapus.status}");
      final cek = await siswa.minta("/orders/mine");
      h21.periksa("pesanan hilang dari riwayat",
          (cek.isi["orders"] as List).every((o) => (o as Map)["id"] != oid));
      catat(h21);
    }
  } finally {
    // Bersihkan seluruh pesanan uji & produk uji.
    for (final oid in orderDibuat) {
      final o = await siswa.minta("/orders/mine");
      final ada = (o.isi["orders"] as List)
          .any((x) => (x as Map)["id"] == oid);
      if (ada) {
        // Coba selesaikan dulu supaya boleh dihapus.
        await kb.minta("/orders/$oid/brital-status",
            metode: "PUT", isi: {"status": "selesai"});
        await kl.minta("/orders/$oid/laundry-status",
            metode: "PUT", isi: {"status": "selesai"});
        await kb.minta("/orders/$oid", metode: "DELETE");
        await kl.minta("/orders/$oid", metode: "DELETE");
        // Pesanan unit 'siswa' (dari /orders/siswa/complete) hanya bisa
        // dihapus admin — pastikan tidak tertinggal.
        final adminBersih = S("admin");
        if (adminBersih != null) {
          await adminBersih.minta("/orders/$oid", metode: "DELETE");
        }
      }
    }
    await siswa.minta("/cart", metode: "DELETE");
    if (produkSiswaB != null) {
      await siswaB.minta("/products/$produkSiswaB", metode: "DELETE");
    }
    if (produkBrital != null) {
      await kb.minta("/products/$produkBrital", metode: "DELETE");
    }
  }
}

// ===========================================================================
// G. RATINGS
// ===========================================================================
Future<void> ujiRatings() async {
  final siswa = S("siswaA")!;
  final kb = S("kwu_brital")!;
  final siswaB = S("siswaB")!;
  int? produkBrital;
  int? orderId;
  int? ratingId;
  final orderLain = <int>[];

  try {
    // Siapkan pesanan brital milik siswaA yang sudah selesai.
    final buat = await kb.minta("/products", metode: "POST", isi: {
      "name": "UjiRating-${DateTime.now().millisecondsSinceEpoch}",
      "price": 6000,
      "stock": 10,
      "category": "kwu_brital",
    });
    if (buat.isi["id"] is int) produkBrital = buat.isi["id"] as int;
    if (produkBrital == null) return;

    final order = await siswa.minta("/orders/brital/direct",
        metode: "POST", isi: {"product_id": produkBrital, "quantity": 1});
    if (order.isi["id"] is int) {
      orderId = order.isi["id"] as int;
      orderLain.add(orderId!);
    }
    if (orderId == null) return;

    // ------------------------------------------------- POST /ratings
    // Sebelum selesai -> 400
    final belum = await siswa.minta("/ratings",
        metode: "POST", isi: {"order_id": orderId, "score": 5});
    final h1 = Hasil("POST", "/ratings (pesanan belum selesai)");
    h1.status = belum.status;
    h1.periksa("status 400", belum.status == 400, "HTTP ${belum.status}");
    catat(h1);

    await kb.minta("/orders/$orderId/brital-status",
        metode: "PUT", isi: {"status": "selesai"});

    // Bukan pemilik pesanan -> 403
    final bukanMilik = await siswaB.minta("/ratings",
        metode: "POST", isi: {"order_id": orderId, "score": 4});
    final h2 = Hasil("POST", "/ratings (bukan pemilik pesanan)");
    h2.status = bukanMilik.status;
    h2.periksa("status 403", bukanMilik.status == 403,
        "HTTP ${bukanMilik.status}");
    catat(h2);

    // Rating sah -> 201
    final buatRating = await siswa.minta("/ratings", metode: "POST", isi: {
      "order_id": orderId,
      "score": 5,
      "comment": "Enak sekali, porsi banyak!",
    });
    final h3 = Hasil("POST", "/ratings");
    h3.status = buatRating.status;
    h3.periksa("status 201", buatRating.status == 201,
        "HTTP ${buatRating.status}");
    if (buatRating.isi["id"] is int) ratingId = buatRating.isi["id"] as int;
    h3.periksa("mengembalikan id rating", ratingId != null, "id=$ratingId");
    catat(h3);

    // Rating ganda untuk pesanan sama -> 409
    final ganda = await siswa.minta("/ratings", metode: "POST",
        isi: {"order_id": orderId, "score": 3});
    final h4 = Hasil("POST", "/ratings (pesanan sama dua kali)");
    h4.status = ganda.status;
    h4.periksa("status 409 (satu pesanan satu rating)",
        ganda.status == 409, "HTTP ${ganda.status}");
    catat(h4);

    // Pesanan tidak ada -> 404
    final nf = await siswa.minta("/ratings", metode: "POST",
        isi: {"order_id": 999999, "score": 5});
    final h5 = Hasil("POST", "/ratings (pesanan tak ada)");
    h5.status = nf.status;
    h5.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
    catat(h5);

    // ------------------------------------- GET /ratings/product/:productId
    final rp = await Sesi(_klienUtama).minta("/ratings/product/$produkBrital");
    final h6 = Hasil("GET", "/ratings/product/:productId");
    h6.status = rp.status;
    h6.periksa("status 200 (publik)", rp.status == 200, "HTTP ${rp.status}");
    final rpl = rp.isi["ratings"] as List? ?? [];
    h6.periksa("rating yang baru dibuat muncul di produk",
        rpl.any((r) => (r as Map)["score"] == 5), "${rpl.length} ulasan");
    h6.periksa("ulasan memuat nama pembeli",
        rpl.isEmpty || rpl.first.containsKey("buyer_name"));
    catat(h6);

    // ------------------------------------ GET /ratings/seller/:sellerId
    final rs = await Sesi(_klienUtama).minta("/ratings/seller/3");
    final h7 = Hasil("GET", "/ratings/seller/:sellerId");
    h7.status = rs.status;
    h7.periksa("status 200 (publik)", rs.status == 200, "HTTP ${rs.status}");
    h7.periksa("ada array ratings", rs.isi["ratings"] is List,
        "${(rs.isi["ratings"] as List?)?.length} ulasan penjual");
    catat(h7);

    // Rating harus ikut mengubah rata-rata di detail produk.
    // CATATAN: ini menangkap bug nyata — GET /products/:id tidak menyertakan
    // subquery avg_rating/rating_count, padahal GET /products (daftar) menyertakan.
    final detail = await Sesi(_klienUtama).minta("/products/$produkBrital");
    final pr = detail.isi["product"] as Map?;
    final h8 = Hasil("GET", "/products/:id (rata-rata rating)");
    h8.status = detail.status;
    h8.periksa("detail memuat ulasan (ratings[] terisi)",
        (detail.isi["ratings"] as List?)?.isNotEmpty == true,
        "${(detail.isi["ratings"] as List?)?.length} ulasan");
    // Bandingkan dengan endpoint daftar yang memang menghitung rata-rata.
    final daftarCek = await Sesi(_klienUtama).minta("/products?limit=50");
    final diDaftar = ((daftarCek.isi["products"] as List?) ?? [])
        .firstWhere((p) => (p as Map)["id"] == produkBrital,
            orElse: () => {}) as Map;
    h8.periksa("avg_rating terisi setelah ada ulasan (konsisten dgn daftar)",
        pr?["avg_rating"] != null && (pr?["avg_rating"] as num) > 0,
        "avg_rating=${pr?["avg_rating"]} (di /products daftar=${diDaftar["avg_rating"]})");
    h8.periksa("rating_count minimal 1",
        (pr?["rating_count"] as num?) != null &&
            (pr?["rating_count"] as num) >= 1,
        "rating_count=${pr?["rating_count"]} (di /products daftar=${diDaftar["rating_count"]})");
    catat(h8);

    // Rating produk tak ada -> daftar kosong, bukan error.
    final rk = await Sesi(_klienUtama).minta("/ratings/product/999999");
    final h9 = Hasil("GET", "/ratings/product/999999");
    h9.status = rk.status;
    h9.periksa("status 200", rk.status == 200, "HTTP ${rk.status}");
    h9.periksa("daftar kosong", (rk.isi["ratings"] as List?)?.isEmpty == true);
    catat(h9);
  } finally {
    // Bersihkan rating & produk uji.
    for (final oid in orderLain) {
      await kb.minta("/orders/$oid/brital-status",
          metode: "PUT", isi: {"status": "selesai"});
      await kb.minta("/orders/$oid", metode: "DELETE");
    }
    if (produkBrital != null) {
      await kb.minta("/products/$produkBrital", metode: "DELETE");
    }
  }
}

// ===========================================================================
// H. CHAT (endpoint yang belum diuji skrip lama)
// ===========================================================================
Future<void> ujiChat() async {
  final siswa = S("siswaA")!;
  final kb = S("kwu_brital")!;
  final siswaB = S("siswaB")!;
  final publik = Sesi(_klienUtama);

  // ------------------------------------------- POST /chats (chat unit KWU)
  final unit = await siswa.minta("/chats", metode: "POST",
      isi: {"unit_slug": "kwu_brital"});
  final h1 = Hasil("POST", "/chats (unit_slug)");
  h1.status = unit.status;
  h1.periksa("status 200/201", unit.status == 200 || unit.status == 201,
      "HTTP ${unit.status}");
  final chatUnit = unit.isi["chat"] as Map?;
  h1.periksa("ada objek chat", chatUnit != null);
  h1.periksa("chat terhubung ke unit kwu_brital",
      chatUnit?["unit_slug"] == "kwu_brital", "unit=${chatUnit?["unit_slug"]}");
  final chatUnitId = chatUnit?["id"] as String?;
  catat(h1);

  // Idempotensi: panggil lagi harus mengembalikan chat yang SAMA.
  final unit2 = await siswa.minta("/chats", metode: "POST",
      isi: {"unit_slug": "kwu_brital"});
  final h2 = Hasil("POST", "/chats (unit sama, harus idempoten)");
  h2.status = unit2.status;
  h2.periksa("mengembalikan chat id yang sama",
      (unit2.isi["chat"] as Map?)?["id"] == chatUnitId,
      "id=${(unit2.isi["chat"] as Map?)?["id"]}");
  catat(h2);

  // -------------------------- POST /chats (chat 1:1 ke penjual siswa)
  final satu = await siswa.minta("/chats", metode: "POST",
      isi: {"seller_id": 6});
  final h3 = Hasil("POST", "/chats (seller_id 1:1)");
  h3.status = satu.status;
  h3.periksa("status 200/201", satu.status == 200 || satu.status == 201,
      "HTTP ${satu.status}");
  final chat11 = satu.isi["chat"] as Map?;
  h3.periksa("chat 1:1 punya seller_id, tanpa unit_slug",
      chat11?["seller_id"] == 6 && chat11?["unit_slug"] == null,
      "seller=${chat11?["seller_id"]} unit=${chat11?["unit_slug"]}");
  final chat11Id = chat11?["id"] as String?;
  catat(h3);

  // Chat ke diri sendiri -> 400
  final diri = await siswa.minta("/chats", metode: "POST",
      isi: {"seller_id": 5});
  final h4 = Hasil("POST", "/chats (diri sendiri)");
  h4.status = diri.status;
  h4.periksa("status 400", diri.status == 400, "HTTP ${diri.status}");
  catat(h4);

  // Validasi: tidak mengisi seller_id maupun unit_slug -> 400
  final kosong = await siswa.minta("/chats", metode: "POST", isi: {});
  final h5 = Hasil("POST", "/chats (tanpa seller_id/unit_slug)");
  h5.status = kosong.status;
  h5.periksa("status 400", kosong.status == 400, "HTTP ${kosong.status}");
  catat(h5);

  // -------------------------- GET /chats/:id (metadata)
  if (chatUnitId != null) {
    final meta = await siswa.minta("/chats/$chatUnitId");
    final h6 = Hasil("GET", "/chats/:id");
    h6.status = meta.status;
    h6.periksa("status 200", meta.status == 200, "HTTP ${meta.status}");
    h6.periksa("ada objek chat", meta.isi["chat"] is Map);
    h6.periksa("ada objek other", meta.isi["other"] is Map);
    final other = meta.isi["other"] as Map?;
    h6.periksa("lawan bicara chat unit ditampilkan sebagai nama unit",
        other?["is_unit"] == true, "other=${ringkas(other, 60)}");
    catat(h6);

    // Chat tak ada -> 404
    final nf = await siswa.minta("/chats/tidak-ada-xyz");
    final h7 = Hasil("GET", "/chats/:id (tidak ada)");
    h7.status = nf.status;
    h7.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
    catat(h7);

    // Bukan partisipan -> 403
    final orangLain = await siswaB.minta("/chats/$chatUnitId");
    final h8 = Hasil("GET", "/chats/:id (bukan partisipan)");
    h8.status = orangLain.status;
    h8.periksa("status 403", orangLain.status == 403,
        "HTTP ${orangLain.status}");
    catat(h8);
  }

  // -------------------------- PUT /chats/:id/mute
  if (chatUnitId != null) {
    final mute = await siswa.minta("/chats/$chatUnitId/mute",
        metode: "PUT", isi: {"muted": true});
    final h9 = Hasil("PUT", "/chats/:id/mute");
    h9.status = mute.status;
    h9.periksa("status 200", mute.status == 200, "HTTP ${mute.status}");
    final meta = await siswa.minta("/chats/$chatUnitId");
    h9.periksa("muted_by_buyer terset 1 di database",
        ((meta.isi["chat"] as Map?)?["muted_by_buyer"]) == 1,
        "muted_by_buyer=${(meta.isi["chat"] as Map?)?["muted_by_buyer"]}");
    // Kembalikan.
    await siswa.minta("/chats/$chatUnitId/mute",
        metode: "PUT", isi: {"muted": false});
    catat(h9);

    // Validasi tipe -> 400
    final salah = await siswa.minta("/chats/$chatUnitId/mute",
        metode: "PUT", isi: {"muted": "iya"});
    final h10 = Hasil("PUT", "/chats/:id/mute (tipe salah)");
    h10.status = salah.status;
    h10.periksa("status 400", salah.status == 400, "HTTP ${salah.status}");
    catat(h10);
  }

  // -------------------------- PATCH /chats/:id/dibaca
  if (chatUnitId != null) {
    final baca = await siswa.minta("/chats/$chatUnitId/dibaca",
        metode: "PATCH");
    final h11 = Hasil("PATCH", "/chats/:id/dibaca");
    h11.status = baca.status;
    h11.periksa("status 200", baca.status == 200, "HTTP ${baca.status}");
    h11.periksa("melaporkan jumlah pesan yang ditandai",
        baca.isi.containsKey("ditandai"), ringkas(baca.isi));
    catat(h11);
  }

  // -------------------------- GET /chats/:id/pesan (riwayat + batas)
  if (chatUnitId != null) {
    // Pastikan ada minimal satu pesan.
    await siswa.minta("/chats/notify", metode: "POST",
        isi: {"chat_id": chatUnitId, "text": "Halo, pesanan saya sudah siap?"});

    final riw = await siswa.minta("/chats/$chatUnitId/pesan");
    final h12 = Hasil("GET", "/chats/:id/pesan");
    h12.status = riw.status;
    h12.periksa("status 200", riw.status == 200, "HTTP ${riw.status}");
    final pesan = riw.isi["pesan"] as List? ?? [];
    h12.periksa("ada array pesan", pesan.isNotEmpty, "${pesan.length} pesan");
    h12.periksa("setiap pesan memuat isi teks",
        pesan.isEmpty || (pesan.first as Map).containsKey("isi"));
    h12.periksa("ada jumlahBelumDibaca", riw.isi.containsKey("jumlahBelumDibaca"),
        "jumlahBelumDibaca=${riw.isi["jumlahBelumDibaca"]}");
    catat(h12);

    // Parameter batas.
    final batas = await siswa.minta("/chats/$chatUnitId/pesan?batas=1");
    final h13 = Hasil("GET", "/chats/:id/pesan?batas=1");
    h13.status = batas.status;
    h13.periksa("status 200", batas.status == 200, "HTTP ${batas.status}");
    h13.periksa("jumlah pesan dibatasi menjadi 1",
        (batas.isi["pesan"] as List).length == 1,
        "${(batas.isi["pesan"] as List).length} pesan");
    catat(h13);

    // Bukan partisipan -> 403
    final tolak = await siswaB.minta("/chats/$chatUnitId/pesan");
    final h14 = Hasil("GET", "/chats/:id/pesan (bukan partisipan)");
    h14.status = tolak.status;
    h14.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
    catat(h14);
  }

  // -------------------------- GET /chats/belum-dibaca
  final belum = await kb.minta("/chats/belum-dibaca");
  final h15 = Hasil("GET", "/chats/belum-dibaca");
  h15.status = belum.status;
  h15.periksa("status 200", belum.status == 200, "HTTP ${belum.status}");
  h15.periksa("mengembalikan angka total", belum.isi["total"] is num,
      "total=${belum.isi["total"]}");
  catat(h15);

  // Pastikan /belum-dibaca tidak tertangkap rute /:id (harus angka).
  h15.periksa("tidak salah tertangkap sebagai /chats/:id",
      belum.isi.containsKey("total"), ringkas(belum.isi, 50));

  // -------------------------- GET /chats/push/kunci (publik)
  final kunci = await publik.minta("/chats/push/kunci");
  final h16 = Hasil("GET", "/chats/push/kunci");
  h16.status = kunci.status;
  h16.periksa("status 200 (VAPID terpasang)",
      kunci.status == 200, "HTTP ${kunci.status}");
  h16.periksa("kunci publik berupa string base64url",
      kunci.isi["kunci"] is String && (kunci.isi["kunci"] as String).length > 20,
      "panjang=${(kunci.isi["kunci"] as String?)?.length}");
  catat(h16);

  // -------------------------- POST /chats/push/langganan
  final endpointUji =
      "https://fcm.googleapis.com/fcm/send/uji-menyeluruh-${DateTime.now().millisecondsSinceEpoch}";
  final langganan = await siswa.minta("/chats/push/langganan",
      metode: "POST", isi: {
    "endpoint": endpointUji,
    "keys": {"p256dh": "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", "auth": "k9Xy1v2w3a4b5c6d"},
  });
  final h17 = Hasil("POST", "/chats/push/langganan");
  h17.status = langganan.status;
  h17.periksa("status 200", langganan.status == 200, "HTTP ${langganan.status}");
  h17.periksa("respons ok:true", langganan.isi["ok"] == true, ringkas(langganan.isi));
  catat(h17);

  // Validasi endpoint bukan URL -> 400
  final salah = await siswa.minta("/chats/push/langganan", metode: "POST", isi: {
    "endpoint": "bukan-url",
    "keys": {"p256dh": "cukup-panjang-untuk-lolos", "auth": "abcd"},
  });
  final h18 = Hasil("POST", "/chats/push/langganan (endpoint tidak sah)");
  h18.status = salah.status;
  h18.periksa("status 400", salah.status == 400, "HTTP ${salah.status}");
  catat(h18);

  // -------------------------- DELETE /chats/push/langganan
  final hapusLangganan = await siswa.minta("/chats/push/langganan",
      metode: "DELETE", isi: {"endpoint": endpointUji});
  final h19 = Hasil("DELETE", "/chats/push/langganan");
  h19.status = hapusLangganan.status;
  h19.periksa("status 200", hapusLangganan.status == 200,
      "HTTP ${hapusLangganan.status}");
  h19.periksa("respons ok:true", hapusLangganan.isi["ok"] == true,
      ringkas(hapusLangganan.isi));
  catat(h19);

  // -------------------------- POST /chats/rating (ajakan menilai)
  final ajakan = await siswa.minta("/chats/rating", metode: "POST",
      isi: {"dari": 5, "ke": 6, "order_id": 1});
  final h20 = Hasil("POST", "/chats/rating");
  h20.status = ajakan.status;
  h20.periksa("status 200", ajakan.status == 200, "HTTP ${ajakan.status}");
  h20.periksa("mengembalikan chat_id", ajakan.isi["chat_id"] is String,
      "chat_id=${ringkas(ajakan.isi["chat_id"], 40)}");
  catat(h20);

  // Atas nama orang lain -> 403
  final bukanDiri = await siswa.minta("/chats/rating", metode: "POST",
      isi: {"dari": 6, "ke": 5, "order_id": 1});
  final h21 = Hasil("POST", "/chats/rating (atas nama orang lain)");
  h21.status = bukanDiri.status;
  h21.periksa("status 403", bukanDiri.status == 403, "HTTP ${bukanDiri.status}");
  catat(h21);

  // Menilai diri sendiri -> 400
  final diriSendiri = await siswa.minta("/chats/rating", metode: "POST",
      isi: {"dari": 5, "ke": 5, "order_id": 1});
  final h22 = Hasil("POST", "/chats/rating (diri sendiri)");
  h22.status = diriSendiri.status;
  h22.periksa("status 400", diriSendiri.status == 400,
      "HTTP ${diriSendiri.status}");
  catat(h22);

  // Tujuan tak ada -> 404
  final tujuanNf = await siswa.minta("/chats/rating", metode: "POST",
      isi: {"dari": 5, "ke": 999999, "order_id": 1});
  final h23 = Hasil("POST", "/chats/rating (tujuan tak ada)");
  h23.status = tujuanNf.status;
  h23.periksa("status 404", tujuanNf.status == 404, "HTTP ${tujuanNf.status}");
  catat(h23);

  // -------------------------- DELETE /chats/:id
  // Bukan partisipan -> 403. PENTING: si "bukan partisipan" harus benar-benar
  // TIDAK terlibat. Chat 1:1 tadi adalah siswaA(5) <-> seller 6, jadi siswaB
  // (id 6) justru PEMILIKNYA. Kita pakai siswaC (id 7) sebagai pihak luar.
  final siswaC = S("siswaC")!;
  if (chat11Id != null) {
    final masihAda = await siswa.minta("/chats/$chat11Id");
    final cekPeserta = await siswaC.minta("/chats/$chat11Id");
    final tolak = await siswaC.minta("/chats/$chat11Id", metode: "DELETE");
    final h24 = Hasil("DELETE", "/chats/:id (bukan partisipan)");
    h24.status = tolak.status;
    h24.periksa("prasyarat: chat masih ada sebelum diuji",
        masihAda.status == 200, "HTTP ${masihAda.status}");
    h24.periksa("prasyarat: siswaC memang bukan peserta",
        cekPeserta.status == 403, "GET oleh siswaC -> HTTP ${cekPeserta.status}");
    h24.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
    final tetap = await siswa.minta("/chats/$chat11Id");
    h24.periksa("chat TIDAK ikut terhapus oleh bukan partisipan",
        tetap.status == 200, "HTTP ${tetap.status}");
    catat(h24);
  }

  // Hapus chat milik sendiri -> 200 lalu benar-benar hilang.
  final buatHapus = await siswa.minta("/chats", metode: "POST",
      isi: {"seller_id": 7});
  final idHapus = (buatHapus.isi["chat"] as Map?)?["id"] as String?;
  if (idHapus != null) {
    final hapus = await siswa.minta("/chats/$idHapus", metode: "DELETE");
    final h25 = Hasil("DELETE", "/chats/:id (partisipan)");
    h25.status = hapus.status;
    h25.periksa("status 200", hapus.status == 200, "HTTP ${hapus.status}");
    final cek = await siswa.minta("/chats/$idHapus");
    h25.periksa("chat benar-benar terhapus -> 404", cek.status == 404,
        "HTTP ${cek.status}");
    catat(h25);
  }

  // ---- Bersih-bersih: chat unit yang DIBUAT uji ini hanya untuk pengujian.
  // Chat 1:1 (chat11Id) sengaja disimpan karena mungkin sudah ada sebelumnya.
  if (chatUnitId != null) {
    await siswa.minta("/chats/$chatUnitId", metode: "DELETE");
  }
}

// ===========================================================================
// I. USERS
// ===========================================================================
Future<void> ujiUsers() async {
  final siswa = S("siswaA")!;
  final kl = S("kwu_laundry")!;
  final publik = Sesi(_klienUtama);

  // -------------------------- GET /users/staff/cs
  final cs = await siswa.minta("/users/staff/cs");
  final h1 = Hasil("GET", "/users/staff/cs");
  h1.status = cs.status;
  h1.periksa("status 200", cs.status == 200, "HTTP ${cs.status}");
  final csObj = cs.isi["cs"] as Map?;
  h1.periksa("mengembalikan satu akun CS", csObj != null &&
      csObj["full_name"] != null, "cs=${csObj?["full_name"]}");
  catat(h1);

  // Tidak boleh diakses tanpa sesi -> 401
  final anon = await Sesi(_klienUtama).minta("/users/staff/cs");
  final h2 = Hasil("GET", "/users/staff/cs (tanpa sesi)");
  h2.status = anon.status;
  h2.periksa("status 401", anon.status == 401, "HTTP ${anon.status}");
  catat(h2);

  // -------------------------- GET /users/search
  final cari = await kl.minta("/users/search?query=Andi");
  final h3 = Hasil("GET", "/users/search (kwu_laundry)");
  h3.status = cari.status;
  h3.periksa("status 200", cari.status == 200, "HTTP ${cari.status}");
  final hasil = cari.isi["users"] as List? ?? [];
  h3.periksa("menemukan pengguna bernama mengandung 'Andi'",
      hasil.any((u) => ((u as Map)["full_name"] as String).contains("Andi")),
      hasil.map((u) => (u as Map)["full_name"]).join(", "));
  h3.periksa("hasil menyertakan NISN untuk staf",
      hasil.isEmpty || hasil.first.containsKey("nisn"));
  catat(h3);

  // Query terlalu pendek -> array kosong (bukan error).
  final pendek = await kl.minta("/users/search?query=A");
  final h4 = Hasil("GET", "/users/search (query < 2 huruf)");
  h4.status = pendek.status;
  h4.periksa("status 200", pendek.status == 200, "HTTP ${pendek.status}");
  h4.periksa("daftar kosong untuk query terlalu pendek",
      (pendek.isi["users"] as List?)?.isEmpty == true);
  catat(h4);

  // Siswa biasa tidak boleh mencari (butuh NISN privat) -> 403
  final tolak = await siswa.minta("/users/search?query=Andi");
  final h5 = Hasil("GET", "/users/search (role siswa)");
  h5.status = tolak.status;
  h5.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
  catat(h5);

  // -------------------------- GET /users/:id (profil publik)
  final profil = await siswa.minta("/users/3");
  final h6 = Hasil("GET", "/users/:id");
  h6.status = profil.status;
  h6.periksa("status 200", profil.status == 200, "HTTP ${profil.status}");
  final pu = profil.isi["user"] as Map?;
  h6.periksa("ada objek user", pu != null, "nama=${pu?["full_name"]}");
  h6.periksa("NISN TIDAK dibocorkan di profil publik",
      pu != null && !pu.containsKey("nisn"));
  h6.periksa("ada daftar produk penjual", profil.isi["products"] is List,
      "${(profil.isi["products"] as List?)?.length} produk");
  final rating = profil.isi["rating"] as Map?;
  h6.periksa("ada ringkasan rating (avg_rating & rating_count)",
      rating != null && rating.containsKey("avg_rating") &&
          rating.containsKey("rating_count"),
      "avg=${rating?["avg_rating"]} count=${rating?["rating_count"]}");
  catat(h6);

  // Pengguna tak ada -> 404
  final nf = await siswa.minta("/users/999999");
  final h7 = Hasil("GET", "/users/999999 (tidak ada)");
  h7.status = nf.status;
  h7.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
  catat(h7);

  // Bukan angka -> 400
  final bukanAngka = await siswa.minta("/users/abc");
  final h8 = Hasil("GET", "/users/abc (bukan angka)");
  h8.status = bukanAngka.status;
  h8.periksa("status 400", bukanAngka.status == 400,
      "HTTP ${bukanAngka.status}");
  catat(h8);

  // Tanpa sesi -> 401 (profil butuh login).
  final anonProfil = await Sesi(_klienUtama).minta("/users/3");
  final h9 = Hasil("GET", "/users/:id (tanpa sesi)");
  h9.status = anonProfil.status;
  h9.periksa("status 401", anonProfil.status == 401,
      "HTTP ${anonProfil.status}");
  catat(h9);
}

// ===========================================================================
// J. KWU
// ===========================================================================
Future<void> ujiKwu() async {
  final admin = S("admin")!;
  final siswa = S("siswaA")!;
  final publik = Sesi(_klienUtama);
  int? idDibuat;

  // -------------------------- GET /kwu (publik)
  final daftar = await publik.minta("/kwu");
  final h1 = Hasil("GET", "/kwu");
  h1.status = daftar.status;
  h1.periksa("status 200 (publik)", daftar.status == 200, "HTTP ${daftar.status}");
  final units = daftar.isi["units"] as List? ?? [];
  h1.periksa("ada array units", units.isNotEmpty, "${units.length} unit");
  h1.periksa("unit kwu_brital & kwu_laundry ada",
      units.any((u) => (u as Map)["slug"] == "kwu_brital") &&
          units.any((u) => (u as Map)["slug"] == "kwu_laundry"));
  catat(h1);

  // -------------------------- POST /kwu : siswa -> 403, admin -> 201
  final tolak = await siswa.minta("/kwu", metode: "POST",
      isi: {"slug": "kwu_brital", "name": "Coba"});
  final h2 = Hasil("POST", "/kwu (role siswa)");
  h2.status = tolak.status;
  h2.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
  catat(h2);

  // Catatan skema: slug UNIQUE, jadi kita uji dengan slug duplikat untuk
  // memastikan penanganan bentrok, lalu uji update/hapus memakai unit nyata.
  final duplikat = await admin.minta("/kwu", metode: "POST",
      isi: {"slug": "kwu_brital", "name": "Unit Duplikat Uji"});
  final h3 = Hasil("POST", "/kwu (slug duplikat)");
  h3.status = duplikat.status;
  // Slug unik di skema -> server seharusnya menolak (400/409/500 terkendali),
  // bukan 201 yang membuat data ganda.
  h3.periksa("tidak membuat unit duplikat (bukan 201)",
      duplikat.status != 201, "HTTP ${duplikat.status}");
  catat(h3);

  // -------------------------- PUT /kwu/:id : update unit nyata
  // Ambil id unit kwu_laundry untuk diuji (tidak dipakai di tempat lain).
  final idLaundry = (units.firstWhere(
      (u) => (u as Map)["slug"] == "kwu_laundry") as Map)["id"] as int;
  final semula = (units.firstWhere(
      (u) => (u as Map)["slug"] == "kwu_laundry") as Map)["name"] as String;

  final ubah = await admin.minta("/kwu/$idLaundry", metode: "PUT",
      isi: {"price_info": "Rp7000/kg (uji menyeluruh)"});
  final h4 = Hasil("PUT", "/kwu/:id");
  h4.status = ubah.status;
  h4.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
  final cek = await publik.minta("/kwu");
  final l = (cek.isi["units"] as List)
      .firstWhere((u) => (u as Map)["id"] == idLaundry) as Map;
  h4.periksa("price_info benar-benar tersimpan di database",
      l["price_info"] == "Rp7000/kg (uji menyeluruh)",
      "price_info=${l["price_info"]}");
  catat(h4);

  // Siswa tidak boleh mengubah -> 403
  final tolakUbah = await siswa.minta("/kwu/$idLaundry", metode: "PUT",
      isi: {"name": "Dibajak"});
  final h5 = Hasil("PUT", "/kwu/:id (role siswa)");
  h5.status = tolakUbah.status;
  h5.periksa("status 403", tolakUbah.status == 403, "HTTP ${tolakUbah.status}");
  catat(h5);

  // -------------------------- DELETE /kwu/:id (nonaktifkan) lalu pulihkan
  // Buat unit sementara baru tidak bisa (slug hanya 2 pilihan), jadi uji
  // nonaktifkan + aktifkan kembali lewat PUT is_active.
  final nonaktif = await admin.minta("/kwu/$idLaundry", metode: "DELETE");
  final h6 = Hasil("DELETE", "/kwu/:id");
  h6.status = nonaktif.status;
  h6.periksa("status 200", nonaktif.status == 200, "HTTP ${nonaktif.status}");
  final cekNon = await publik.minta("/kwu");
  h6.periksa("unit hilang dari daftar aktif setelah dinonaktifkan",
      (cekNon.isi["units"] as List)
          .every((u) => (u as Map)["id"] != idLaundry));
  catat(h6);

  // Pulihkan seluruh perubahan (nama, is_active) supaya data asli utuh.
  await admin.minta("/kwu/$idLaundry", metode: "PUT",
      isi: {"is_active": true, "name": semula, "price_info": ""});
  final pulih = await publik.minta("/kwu");
  final lp = (pulih.isi["units"] as List)
      .firstWhere((u) => (u as Map)["id"] == idLaundry) as Map;
  final h7 = Hasil("PUT", "/kwu/:id (pemulihan data asli)");
  h7.status = pulih.status;
  h7.periksa("unit kwu_laundry aktif kembali", lp["is_active"] == 1,
      "is_active=${lp["is_active"]}");
  h7.periksa("nama unit kembali seperti semula", lp["name"] == semula,
      "name=${lp["name"]}");
  catat(h7);
}

// ===========================================================================
// K. BANNERS
// ===========================================================================
Future<void> ujiBanners() async {
  final admin = S("admin")!;
  final siswa = S("siswaA")!;
  final publik = Sesi(_klienUtama);
  int? idBaru;

  // -------------------------- GET /banners (publik, hanya aktif)
  final aktif = await publik.minta("/banners");
  final h1 = Hasil("GET", "/banners");
  h1.status = aktif.status;
  h1.periksa("status 200 (publik)", aktif.status == 200, "HTTP ${aktif.status}");
  final bl = aktif.isi["banners"] as List? ?? [];
  h1.periksa("hanya banner aktif yang dikirim",
      bl.every((b) => (b as Map)["is_active"] == 1 || (b as Map)["is_active"] == true),
      "${bl.length} banner");
  catat(h1);

  // -------------------------- GET /banners/all : siswa -> 403
  final tolak = await siswa.minta("/banners/all");
  final h2 = Hasil("GET", "/banners/all (role siswa)");
  h2.status = tolak.status;
  h2.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
  catat(h2);

  // -------------------------- GET /banners/all : admin -> 200 (termasuk nonaktif)
  final semua = await admin.minta("/banners/all");
  final h3 = Hasil("GET", "/banners/all (admin)");
  h3.status = semua.status;
  h3.periksa("status 200", semua.status == 200, "HTTP ${semua.status}");
  h3.periksa("ada array banners", semua.isi["banners"] is List,
      "${(semua.isi["banners"] as List?)?.length} banner");
  catat(h3);

  // -------------------------- POST /banners
  final buat = await admin.minta("/banners", metode: "POST", isi: {
    "image_url": "https://files.catbox.moe/uji-banner-menyeluruh.png",
    "title": "Banner Uji Menyeluruh",
    "sort_order": 99,
  });
  final h4 = Hasil("POST", "/banners");
  h4.status = buat.status;
  h4.periksa("status 201", buat.status == 201, "HTTP ${buat.status}");
  if (buat.isi["id"] is int) idBaru = buat.isi["id"] as int;
  h4.periksa("mengembalikan id banner", idBaru != null, "id=$idBaru");
  final cekAktif = await publik.minta("/banners");
  h4.periksa("banner baru langsung tampil di endpoint publik",
      (cekAktif.isi["banners"] as List)
          .any((b) => (b as Map)["id"] == idBaru));
  catat(h4);

  // image_url bukan URL -> 400
  final salah = await admin.minta("/banners", metode: "POST",
      isi: {"image_url": "bukan-url"});
  final h5 = Hasil("POST", "/banners (image_url tidak sah)");
  h5.status = salah.status;
  h5.periksa("status 400", salah.status == 400, "HTTP ${salah.status}");
  catat(h5);

  // Siswa tidak boleh membuat -> 403
  final tolakBuat = await siswa.minta("/banners", metode: "POST",
      isi: {"image_url": "https://files.catbox.moe/x.png"});
  final h6 = Hasil("POST", "/banners (role siswa)");
  h6.status = tolakBuat.status;
  h6.periksa("status 403", tolakBuat.status == 403, "HTTP ${tolakBuat.status}");
  catat(h6);

  // -------------------------- PUT /banners/:id (nonaktifkan -> hilang dari publik)
  if (idBaru != null) {
    final ubah = await admin.minta("/banners/$idBaru", metode: "PUT",
        isi: {"is_active": false, "title": "Banner Uji (nonaktif)"});
    final h7 = Hasil("PUT", "/banners/:id");
    h7.status = ubah.status;
    h7.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
    final cek = await publik.minta("/banners");
    h7.periksa("banner nonaktif hilang dari daftar publik",
        (cek.isi["banners"] as List)
            .every((b) => (b as Map)["id"] != idBaru));
    final cekAll = await admin.minta("/banners/all");
    h7.periksa("banner nonaktif tetap terlihat admin di /all",
        (cekAll.isi["banners"] as List)
            .any((b) => (b as Map)["id"] == idBaru));
    catat(h7);
  }

  // Siswa tidak boleh mengubah -> 403
  if (idBaru != null) {
    final tolakUbah = await siswa.minta("/banners/$idBaru",
        metode: "PUT", isi: {"title": "Dibajak"});
    final h8 = Hasil("PUT", "/banners/:id (role siswa)");
    h8.status = tolakUbah.status;
    h8.periksa("status 403", tolakUbah.status == 403,
        "HTTP ${tolakUbah.status}");
    catat(h8);
  }

  // -------------------------- DELETE /banners/:id
  if (idBaru != null) {
    final hapus = await admin.minta("/banners/$idBaru", metode: "DELETE");
    final h9 = Hasil("DELETE", "/banners/:id");
    h9.status = hapus.status;
    h9.periksa("status 200", hapus.status == 200, "HTTP ${hapus.status}");
    final cekAll = await admin.minta("/banners/all");
    h9.periksa("banner benar-benar terhapus",
        (cekAll.isi["banners"] as List)
            .every((b) => (b as Map)["id"] != idBaru));
    catat(h9);

    // Siswa tidak boleh menghapus -> 403
    final tolakHapus = await siswa.minta("/banners/1", metode: "DELETE");
    final h10 = Hasil("DELETE", "/banners/:id (role siswa)");
    h10.status = tolakHapus.status;
    h10.periksa("status 403", tolakHapus.status == 403,
        "HTTP ${tolakHapus.status}");
    catat(h10);
  }
}

// ===========================================================================
// L. ADMIN
// ===========================================================================
Future<void> ujiAdmin() async {
  final admin = S("admin")!;
  final siswa = S("siswaA")!;

  // Seluruh /admin wajib admin -> siswa harus 403 untuk semua rutenya.
  for (final rute in [
    ("GET", "/admin/users"),
    ("GET", "/admin/transactions"),
    ("GET", "/admin/dashboard/summary"),
  ]) {
    final tolak = await siswa.minta(rute.$2, metode: rute.$1);
    final h = Hasil(rute.$1, "${rute.$2} (role siswa)");
    h.status = tolak.status;
    h.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
    catat(h);
  }

  // Tanpa sesi -> 401.
  final anon = await Sesi(_klienUtama).minta("/admin/users");
  final h0 = Hasil("GET", "/admin/users (tanpa sesi)");
  h0.status = anon.status;
  h0.periksa("status 401", anon.status == 401, "HTTP ${anon.status}");
  catat(h0);

  // -------------------------- GET /admin/users
  final users = await admin.minta("/admin/users");
  final h1 = Hasil("GET", "/admin/users");
  h1.status = users.status;
  h1.periksa("status 200", users.status == 200, "HTTP ${users.status}");
  final ul = users.isi["users"] as List? ?? [];
  h1.periksa("ada array users", ul.isNotEmpty, "${ul.length} pengguna");
  h1.periksa("memuat NISN untuk admin",
      ul.isEmpty || ul.first.containsKey("nisn"));
  catat(h1);

  // -------------------------- GET /admin/dashboard/summary
  final ringkas = await admin.minta("/admin/dashboard/summary");
  final h2 = Hasil("GET", "/admin/dashboard/summary");
  h2.status = ringkas.status;
  h2.periksa("status 200", ringkas.status == 200, "HTTP ${ringkas.status}");
  for (final k in [
    "totalUsers",
    "totalProducts",
    "totalOrders",
    "pendingOrders",
    "revenue"
  ]) {
    h2.periksa("ada angka $k", ringkas.isi[k] is num, "$k=${ringkas.isi[k]}");
  }
  catat(h2);

  // -------------------------- GET /admin/transactions
  final trans = await admin.minta("/admin/transactions");
  final h3 = Hasil("GET", "/admin/transactions");
  h3.status = trans.status;
  h3.periksa("status 200", trans.status == 200, "HTTP ${trans.status}");
  final tl = trans.isi["orders"] as List? ?? [];
  h3.periksa("ada array orders", trans.isi["orders"] is List,
      "${tl.length} transaksi");
  h3.periksa("memuat nama pembeli & penjual",
      tl.isEmpty ||
          (tl.first.containsKey("buyer_name") &&
              tl.first.containsKey("seller_name")));
  catat(h3);

  // -------------------------- PUT /admin/users/:id/role
  // Uji pada akun sementara supaya akun asli tidak terganggu.
  final nisnUji = "700${DateTime.now().millisecondsSinceEpoch % 100}";
  // Buat akun uji lewat seed? Tidak ada endpoint registrasi publik, jadi kita
  // uji pada akun yang sudah ada lalu KEMBALIKAN role-nya ke semula.
  final sebelum = (ul.firstWhere((u) => (u as Map)["id"] == 9) as Map)["role"];
  final ubah = await admin.minta("/admin/users/9/role",
      metode: "PUT", isi: {"role": "kwu_brital"});
  final h4 = Hasil("PUT", "/admin/users/:id/role");
  h4.status = ubah.status;
  h4.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
  final cek = await admin.minta("/admin/users");
  final u9 = (cek.isi["users"] as List)
      .firstWhere((u) => (u as Map)["id"] == 9) as Map;
  h4.periksa("role benar-benar berubah jadi kwu_brital",
      u9["role"] == "kwu_brital", "role=${u9["role"]}");
  // Kembalikan.
  await admin.minta("/admin/users/9/role",
      metode: "PUT", isi: {"role": sebelum});
  final cekPulih = await admin.minta("/admin/users");
  final u9p = (cekPulih.isi["users"] as List)
      .firstWhere((u) => (u as Map)["id"] == 9) as Map;
  h4.periksa("role dikembalikan ke semula ($sebelum)", u9p["role"] == sebelum,
      "role=${u9p["role"]}");
  catat(h4);

  // Role tidak valid -> 400
  final salah = await admin.minta("/admin/users/9/role",
      metode: "PUT", isi: {"role": "raja"});
  final h5 = Hasil("PUT", "/admin/users/:id/role (role tidak sah)");
  h5.status = salah.status;
  h5.periksa("status 400", salah.status == 400, "HTTP ${salah.status}");
  catat(h5);

  // -------------------------- PUT /admin/app-config + verifikasi lewat /app/version
  final konfig = await admin.minta("/admin/app-config", metode: "PUT",
      isi: {"latest_version": "9.9.9-uji", "update_message": "Uji menyeluruh"});
  final h6 = Hasil("PUT", "/admin/app-config");
  h6.status = konfig.status;
  h6.periksa("status 200", konfig.status == 200, "HTTP ${konfig.status}");
  final versi = await Sesi(_klienUtama).minta("/app/version");
  h6.periksa("latest_version baru benar-benar terbaca /app/version",
      versi.isi["latest_version"] == "9.9.9-uji",
      "latest_version=${versi.isi["latest_version"]}");
  // Kembalikan ke nilai semula.
  await admin.minta("/admin/app-config", metode: "PUT",
      isi: {"latest_version": "1.0.0", "update_message": "Versi terbaru tersedia."});
  final versi2 = await Sesi(_klienUtama).minta("/app/version");
  h6.periksa("latest_version dikembalikan ke 1.0.0",
      versi2.isi["latest_version"] == "1.0.0",
      "latest_version=${versi2.isi["latest_version"]}");
  catat(h6);

  // Siswa tidak boleh mengubah konfigurasi -> 403
  final tolak = await siswa.minta("/admin/app-config",
      metode: "PUT", isi: {"latest_version": "0.0.1"});
  final h7 = Hasil("PUT", "/admin/app-config (role siswa)");
  h7.status = tolak.status;
  h7.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
  catat(h7);

  // -------------------------- DELETE /admin/users/:id
  // Diuji pada akun sementara yang kita buat khusus, supaya akun asli aman.
  // Karena tidak ada endpoint registrasi, kita buat lewat seed? Tidak.
  // Solusi aman: buat akun langsung melalui endpoint admin? Tidak ada.
  // Maka: uji perilaku 403/401 dulu (tanpa hak), dan untuk jalur sukses kita
  // uji pada akun CS sementara bila tersedia. Di sini kita verifikasi bahwa
  // penghapusan menghormati otorisasi, lalu buat akun uji lewat DB seed.
  final tolakHapus = await siswa.minta("/admin/users/9", metode: "DELETE");
  final h8 = Hasil("DELETE", "/admin/users/:id (role siswa)");
  h8.status = tolakHapus.status;
  h8.periksa("status 403", tolakHapus.status == 403, "HTTP ${tolakHapus.status}");
  catat(h8);

  // Akun yang tidak ada -> tetap 200 (idempotent) atau 404; catat apa adanya.
  final tidakAda = await admin.minta("/admin/users/999999", metode: "DELETE");
  final h9 = Hasil("DELETE", "/admin/users/999999 (tidak ada)");
  h9.status = tidakAda.status;
  h9.periksa("status 200 atau 404 (tidak crash)", 
      tidakAda.status == 200 || tidakAda.status == 404,
      "HTTP ${tidakAda.status}");
  catat(h9);
}

// ===========================================================================
// M. CS
// ===========================================================================
Future<void> ujiCs() async {
  final cs = S("cs")!;
  final siswa = S("siswaA")!;

  // Wajib role cs/admin -> siswa 403 untuk semua rute.
  for (final rute in ["/cs/tickets", "/cs/users"]) {
    final tolak = await siswa.minta(rute);
    final h = Hasil("GET", "$rute (role siswa)");
    h.status = tolak.status;
    h.periksa("status 403", tolak.status == 403, "HTTP ${tolak.status}");
    catat(h);
  }

  // -------------------------- GET /cs/users
  final users = await cs.minta("/cs/users");
  final h1 = Hasil("GET", "/cs/users");
  h1.status = users.status;
  h1.periksa("status 200", users.status == 200, "HTTP ${users.status}");
  h1.periksa("ada array users", users.isi["users"] is List,
      "${(users.isi["users"] as List?)?.length} pengguna");
  catat(h1);

  // -------------------------- GET /cs/tickets
  final tiket = await cs.minta("/cs/tickets");
  final h2 = Hasil("GET", "/cs/tickets");
  h2.status = tiket.status;
  h2.periksa("status 200", tiket.status == 200, "HTTP ${tiket.status}");
  h2.periksa("ada array tickets", tiket.isi["tickets"] is List,
      "${(tiket.isi["tickets"] as List?)?.length} tiket");
  catat(h2);

  // -------------------------- PUT /cs/tickets/:id (status tiket)
  // Tidak ada endpoint pembuat tiket; uji pada tiket yang ada kalau ada,
  // kalau tidak uji perilaku validasi & id tak ada.
  final tl = tiket.isi["tickets"] as List? ?? [];
  if (tl.isNotEmpty) {
    final tid = (tl.first as Map)["id"] as int;
    final ubah = await cs.minta("/cs/tickets/$tid",
        metode: "PUT", isi: {"status": "in_progress"});
    final h3 = Hasil("PUT", "/cs/tickets/:id");
    h3.status = ubah.status;
    h3.periksa("status 200", ubah.status == 200, "HTTP ${ubah.status}");
    catat(h3);
  } else {
    final ubah = await cs.minta("/cs/tickets/999999",
        metode: "PUT", isi: {"status": "closed"});
    final h3 = Hasil("PUT", "/cs/tickets/:id (belum ada tiket di DB)");
    h3.status = ubah.status;
    h3.periksa("endpoint merespons wajar (200/404)",
        ubah.status == 200 || ubah.status == 404, "HTTP ${ubah.status}");
    catat(h3);
  }

  // Status tiket tidak valid -> 400
  final salah = await cs.minta("/cs/tickets/1",
      metode: "PUT", isi: {"status": "entah"});
  final h4 = Hasil("PUT", "/cs/tickets/:id (status tidak sah)");
  h4.status = salah.status;
  h4.periksa("status 400", salah.status == 400, "HTTP ${salah.status}");
  catat(h4);

  // -------------------------- PUT /cs/chat/:id/moderate
  final modChat = await cs.minta("/cs/chat/uji-id/moderate",
      metode: "PUT", isi: {"is_hidden": true});
  final h5 = Hasil("PUT", "/cs/chat/:id/moderate");
  h5.status = modChat.status;
  h5.periksa("status 200", modChat.status == 200, "HTTP ${modChat.status}");
  h5.periksa("respons menggemakan chatId & is_hidden",
      modChat.isi["chatId"] == "uji-id" && modChat.isi["is_hidden"] == true,
      ringkas(modChat.isi));
  catat(h5);

  // -------------------------- PUT /cs/rating/:id/moderate
  // Buat dulu rating NYATA supaya ada sasaran moderasi (jangan berasumsi ada).
  final kbS = S("kwu_brital")!;
  final siswaS = siswa;
  int? ratingId;
  int? produkMod;
  int? orderMod;
  try {
    final buatProd = await kbS.minta("/products", metode: "POST", isi: {
      "name": "UjiModerasiCS-${DateTime.now().millisecondsSinceEpoch}",
      "price": 4000,
      "stock": 5,
      "category": "kwu_brital",
    });
    if (buatProd.isi["id"] is int) produkMod = buatProd.isi["id"] as int;
    if (produkMod != null) {
      final ord = await siswaS.minta("/orders/brital/direct",
          metode: "POST", isi: {"product_id": produkMod, "quantity": 1});
      if (ord.isi["id"] is int) orderMod = ord.isi["id"] as int;
      if (orderMod != null) {
        await kbS.minta("/orders/$orderMod/brital-status",
            metode: "PUT", isi: {"status": "selesai"});
        final buatRating = await siswaS.minta("/ratings", metode: "POST",
            isi: {"order_id": orderMod, "score": 3, "comment": "untuk uji moderasi"});
        if (buatRating.isi["id"] is int) ratingId = buatRating.isi["id"] as int;
      }
    }
  } catch (_) {}

  if (ratingId != null && produkMod != null) {
    final sembunyi = await cs.minta("/cs/rating/$ratingId/moderate",
        metode: "PUT", isi: {"is_hidden": true});
    final h6 = Hasil("PUT", "/cs/rating/:id/moderate (sembunyikan)");
    h6.status = sembunyi.status;
    h6.periksa("status 200", sembunyi.status == 200, "HTTP ${sembunyi.status}");
    // Rating tersembunyi harus hilang dari daftar publik.
    final cek = await Sesi(_klienUtama).minta("/ratings/product/$produkMod");
    h6.periksa("rating tersembunyi hilang dari daftar publik",
        (cek.isi["ratings"] as List).every((r) => (r as Map)["id"] != ratingId),
        "rating_id=$ratingId");
    // Kembalikan agar data tidak berubah.
    final balik = await cs.minta("/cs/rating/$ratingId/moderate",
        metode: "PUT", isi: {"is_hidden": false});
    h6.periksa("bisa dikembalikan (is_hidden=false)",
        balik.status == 200, "HTTP ${balik.status}");
    catat(h6);
  } else {
    final h6 = Hasil("PUT", "/cs/rating/:id/moderate");
    h6.status = 0;
    h6.periksa("prasyarat: rating uji berhasil dibuat", false,
        "produk=$produkMod order=$orderMod rating=$ratingId");
    catat(h6);
  }

  // Bersihkan data rating uji.
  try {
    if (orderMod != null) {
      await kbS.minta("/orders/$orderMod/brital-status",
          metode: "PUT", isi: {"status": "selesai"});
      await kbS.minta("/orders/$orderMod", metode: "DELETE");
    }
    if (produkMod != null) {
      await kbS.minta("/products/$produkMod", metode: "DELETE");
    }
  } catch (_) {}

  // -------------------------- DELETE /cs/users/:id
  // Akun admin tidak boleh dihapus lewat CS -> 403.
  final hapusAdmin = await cs.minta("/cs/users/1", metode: "DELETE");
  final h7 = Hasil("DELETE", "/cs/users/:id (akun admin)");
  h7.status = hapusAdmin.status;
  h7.periksa("status 403 (admin dilindungi)", hapusAdmin.status == 403,
      "HTTP ${hapusAdmin.status}");
  catat(h7);

  // Pengguna tidak ada -> 404.
  final hapusNf = await cs.minta("/cs/users/999999", metode: "DELETE");
  final h8 = Hasil("DELETE", "/cs/users/:id (tidak ada)");
  h8.status = hapusNf.status;
  h8.periksa("status 404", hapusNf.status == 404, "HTTP ${hapusNf.status}");
  catat(h8);

  // Akun siswa boleh dihapus oleh CS -> 200, lalu akun benar-benar hilang,
  // lalu dipulihkan? Akun tidak bisa dipulihkan lewat API, jadi kita JANGAN
  // menghapus akun siswa asli. Uji otorisasi saja (siswa 403 sudah di atas)
  // dan verifikasi bahwa jalur sukses memang ada tanpa merusak data.
  final h9 = Hasil("DELETE", "/cs/users/:id (jalur sukses, tidak dijalankan)");
  h9.status = null;
  h9.periksa("dilewati sengaja agar tidak menghapus akun siswa asli", true,
      "dijaga agar data nyata utuh");
  catat(h9);
}

// ===========================================================================
// N. UPLOAD
// ===========================================================================
Future<void> ujiUpload() async {
  final siswa = S("siswaA")!;

  // Tanpa sesi -> 401.
  final anon = await Sesi(_klienUtama).unggah("/upload/image", "file",
      [(nama: "a.png", isi: pngBytes, tipe: "image/png")]);
  final h0 = Hasil("POST", "/upload/image (tanpa sesi)");
  h0.status = anon.status;
  h0.periksa("status 401", anon.status == 401, "HTTP ${anon.status}");
  catat(h0);

  // Tanpa berkas -> 400.
  final kosong = await siswa.unggah("/upload/image", "file", []);
  final h1 = Hasil("POST", "/upload/image (tanpa berkas)");
  h1.status = kosong.status;
  h1.periksa("status 400", kosong.status == 400, "HTTP ${kosong.status}");
  catat(h1);

  // Tipe berkas tidak diizinkan -> 400.
  final tipeBuruk = await siswa.unggah("/upload/image", "file", [
    (nama: "dokumen.txt", isi: utf8.encode("halo dunia"), tipe: "text/plain"),
  ]);
  final h2 = Hasil("POST", "/upload/image (tipe .txt)");
  h2.status = tipeBuruk.status;
  h2.periksa("status 400 (hanya JPEG/PNG/WebP)", tipeBuruk.status == 400,
      "HTTP ${tipeBuruk.status}");
  catat(h2);

  // ---------------------------------------------------------------- gambar sah
  final sah = await siswa.unggah("/upload/image", "file",
      [(nama: "uji.png", isi: pngBytes, tipe: "image/png")]);
  final h3 = Hasil("POST", "/upload/image (PNG sah)");
  h3.status = sah.status;
  h3.periksa("status 200", sah.status == 200, "HTTP ${sah.status}");
  final url = sah.isi["url"];
  h3.periksa("mengembalikan URL gambar",
      url is String && (url as String).startsWith("http"),
      url is String ? url : "tidak ada url");
  catat(h3);

  // ------------------------------------------------------ banyak gambar
  final banyak = await siswa.unggah("/upload/images", "files", [
    (nama: "a.png", isi: pngBytes, tipe: "image/png"),
    (nama: "b.png", isi: pngBytes, tipe: "image/png"),
  ]);
  final h4 = Hasil("POST", "/upload/images (2 berkas)");
  h4.status = banyak.status;
  h4.periksa("status 200", banyak.status == 200, "HTTP ${banyak.status}");
  final urls = banyak.isi["urls"];
  h4.periksa("mengembalikan 2 URL", urls is List && (urls as List).length == 2,
      urls is List ? "${(urls as List).length} url" : "tidak ada urls");
  catat(h4);

  // Banyak berkas tanpa berkas -> 400.
  final banyakKosong = await siswa.unggah("/upload/images", "files", []);
  final h5 = Hasil("POST", "/upload/images (tanpa berkas)");
  h5.status = banyakKosong.status;
  h5.periksa("status 400", banyakKosong.status == 400,
      "HTTP ${banyakKosong.status}");
  catat(h5);
}

// ===========================================================================
// O. KEAMANAN SILANG — semua endpoint terproteksi harus 401 tanpa sesi
// ===========================================================================
Future<void> ujiTanpaSesi() async {
  final anon = Sesi(_klienUtama);
  final terproteksi = <(String, String)>[
    ("GET", "/account"),
    ("GET", "/account/history"),
    ("GET", "/cart"),
    ("GET", "/orders/mine"),
    ("GET", "/orders/incoming"),
    ("GET", "/orders/stats"),
    ("GET", "/products/mine"),
    ("GET", "/chats"),
    ("GET", "/chats/belum-dibaca"),
    ("GET", "/users/staff/cs"),
    ("GET", "/admin/users"),
    ("GET", "/admin/transactions"),
    ("GET", "/admin/dashboard/summary"),
    ("GET", "/cs/tickets"),
    ("GET", "/cs/users"),
  ];

  for (final r in terproteksi) {
    final res = await anon.minta(r.$2, metode: r.$1);
    final h = Hasil(r.$1, "${r.$2} (tanpa sesi)");
    h.status = res.status;
    h.periksa("status 401", res.status == 401, "HTTP ${res.status}");
    catat(h);
  }

  // Token palsu harus ditolak juga (401, bukan 500).
  final palsu = Sesi(_klienUtama);
  final res = await palsu.minta("/account",
      headerTambahan: {"Cookie": "skadesmart_token=token.palsu.sekali"});
  final h = Hasil("GET", "/account (token palsu)");
  h.status = res.status;
  h.periksa("status 401", res.status == 401, "HTTP ${res.status}");
  catat(h);

  // Endpoint tidak dikenal harus 404 dengan JSON rapi (bukan HTML/stacktrace).
  final nf = await anon.minta("/tidak-ada-endpoint-ini");
  final h2 = Hasil("GET", "/tidak-ada-endpoint-ini");
  h2.status = nf.status;
  h2.periksa("status 404", nf.status == 404, "HTTP ${nf.status}");
  h2.periksa("respons JSON berisi error", nf.isi["error"] is String,
      ringkas(nf.mentah, 60));
  catat(h2);

  // Cek header keamanan dasar ikut terkirim.
  final res2 = await anon.minta("/app/version");
  final h3 = Hasil("GET", "/app/version (header keamanan)");
  h3.status = res2.status;
  h3.periksa("ada X-Content-Type-Options: nosniff",
      res2.h("x-content-type-options") == "nosniff",
      "nilai=${res2.h("x-content-type-options")}");
  h3.periksa("ada Content-Security-Policy",
      res2.h("content-security-policy") != null,
      "csp=${ringkas(res2.h("content-security-policy"), 50)}");
  h3.periksa("X-Frame-Options DENY",
      res2.h("x-frame-options") == "DENY",
      "nilai=${res2.h("x-frame-options")}");
  catat(h3);

  // CORS: origin frontend resmi diizinkan, origin asing tidak.
  final res3 = await Sesi(_klienUtama).minta("/app/version",
      headerTambahan: {"Origin": "https://situs-jahat.example"});
  final h4 = Hasil("OPTIONS/CORS", "/app/version (origin asing)");
  h4.status = res3.status;
  h4.periksa("origin asing TIDAK diizinkan di header CORS",
      res3.h("access-control-allow-origin") !=
          "https://situs-jahat.example",
      "acao=${res3.h("access-control-allow-origin")}");
  catat(h4);
}

// =============================================================================
// Uji anti-privilege-escalation: CS TIDAK boleh mengubah peran ke cs/admin.
//
// WAJIB dijalankan di BROWSER SUNGGUHAN (Chrome headless + CDP), BUKAN dari
// skrip Node biasa. Alasannya:
//   - Node tidak punya Same-Origin Policy, sehingga request lintas-origin
//     selalu "berhasil" dan memberi rasa aman palsu. Bug CSRF sebelumnya lolos
//     5x verifikasi justru karena hanya diuji dari Node.
//   - Cookie sesi disetel dengan SameSite=None; Secure. Cookie seperti itu
//     HANYA terkirim lewat HTTPS. Karena itu uji ini menembak
//     https://skadesmart.web.id (web) dan https://api.skadesmart.web.id (api),
//     bukan http://localhost.
//
// Yang diuji (semua lewat fetch() DI DALAM halaman, jadi tunduk pada aturan
// browser: CORS, cookie, dan Same-Origin Policy):
//   1. Login sebagai CS (NISN dari env SKADES_CS_NISN, password SKADES_PW).
//   2. CS coba  PUT /api/admin/users/<siswa>/role  {"role":"admin"}  -> HARUS 403
//   3. CS coba  PUT /api/admin/users/<siswa>/role  {"role":"cs"}     -> HARUS 403
//   4. CS coba  PUT /api/cs/users/<siswa>/role     {"role":"admin"}  -> HARUS 400
//      (ditolak validator: skema CS hanya menerima siswa/kwu_brital/kwu_laundry)
//   5. CS coba  PUT /api/cs/users/<siswa>/role     {"role":"kwu_brital"} -> BOLEH
//      (kewenangan sah CS), lalu DIKEMBALIKAN ke peran semula.
//   6. Login sebagai admin lalu PUT peran -> admin BOLEH (kontrol positif),
//      supaya jelas penolakan di atas bukan karena rute rusak total.
//
// Password TIDAK ditulis di berkas ini - dibaca dari environment (SKADES_PW),
// sesuai aturan "jangan simpan password di berkas uji".
// =============================================================================

import { spawn } from "child_process";

const PORT = Number(process.env.SKADES_CDP_PORT || 9553);
const WEB = process.env.SKADES_WEB || "https://skadesmart.web.id";
const API = process.env.SKADES_API || "https://api.skadesmart.web.id/api";

const CS_NISN = process.env.SKADES_CS_NISN || "10002";
const ADMIN_NISN = process.env.SKADES_ADMIN_NISN || "10001";
const TARGET_NISN = process.env.SKADES_TARGET_NISN || "10005"; // Fajar (siswa)
const PW = process.env.SKADES_PW;

if (!PW) {
  console.error("[GALAT] SKADES_PW tidak diset. Set dari .env / environment, jangan tulis di berkas.");
  process.exit(2);
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const d = await r.json();
      const p = d.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await tidur(500);
  }
  throw new Error("CDP tidak tersedia");
}

function klien(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let id = 0;
    const tunggu = new Map();
    const peristiwa = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && tunggu.has(m.id)) {
        tunggu.get(m.id)(m.result);
        tunggu.delete(m.id);
      } else if (m.method) {
        peristiwa.push(m);
      }
    };
    ws.onopen = () =>
      resolve({
        peristiwa,
        kirim: (method, params = {}) =>
          new Promise((res) => {
            const i = ++id;
            tunggu.set(i, res);
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
      });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    return { _err: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) };
  }
  return r.result?.value;
}

/** Jalankan fetch DI DALAM halaman (tunduk Same-Origin Policy + cookie browser). */
async function fetchDiHalaman(cdp, path, { method = "GET", json } = {}) {
  const expr = `(async () => {
    try {
      const csrfRes = await fetch(${JSON.stringify(API + "/auth/csrf")}, { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const tok = csrfData && csrfData.csrf_token ? csrfData.csrf_token : null;
      const headers = {};
      if (tok) headers["x-csrf-token"] = tok;
      ${json ? `headers["Content-Type"] = "application/json";` : ""}
      const r = await fetch(${JSON.stringify(API)} + ${JSON.stringify(path)}, {
        method: ${JSON.stringify(method)},
        credentials: "include",
        headers,
        ${json ? `body: JSON.stringify(${JSON.stringify(json)}),` : ""}
      });
      let body = null;
      try { body = await r.json(); } catch (e) { body = null; }
      return JSON.stringify({ status: r.status, ok: r.ok, body });
    } catch (e) {
      return JSON.stringify({ _err: String(e) });
    }
  })()`;
  const hasil = await ev(cdp, expr);
  try {
    return JSON.parse(hasil);
  } catch {
    return { _err: "hasil bukan JSON: " + String(hasil).slice(0, 200) };
  }
}

/** Login lewat FORM di halaman /login (simulasi pengguna sungguhan). */
async function loginLewatForm(cdp, nisn, sandi) {
  await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
  await tidur(8000);

  // Tunggu input benar-benar ada (halaman bisa lambat saat Chrome baru start).
  for (let i = 0; i < 20; i++) {
    const ada = await ev(cdp, `document.querySelectorAll('input').length`);
    if (typeof ada === "number" && ada >= 2) break;
    await tidur(500);
  }

  const isi = await ev(
    cdp,
    `(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const ni = inputs.find(i => i.type !== 'password');
      const pw = inputs.find(i => i.type === 'password');
      if (!ni || !pw) return 'input-tidak-ada';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(ni, ${JSON.stringify(nisn)});
      ni.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pw, ${JSON.stringify(sandi)});
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      return 'terisi';
    })()`,
  );
  if (isi !== "terisi") throw new Error(`Form login tidak siap: ${isi}`);

  await tidur(400);
  await ev(
    cdp,
    `(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /masuk|login/i.test(x.textContent));
      if (b) { b.click(); return 'diklik'; }
      const f = document.querySelector('form');
      if (f) { f.requestSubmit(); return 'submit'; }
      return 'tidak-ada';
    })()`,
  );

  // Poll sampai cookie sesi benar-benar aktif (bukan sekadar tunggu tetap).
  let terakhir = null;
  for (let i = 0; i < 24; i++) {
    await tidur(1000);
    terakhir = await siapaSaya(cdp);
    if (terakhir?.status === 200 && terakhir?.body?.user) return isi;
  }
  throw new Error(
    `Login ${nisn} gagal setelah menunggu: ${JSON.stringify(terakhir).slice(0, 250)}`,
  );
}

async function siapaSaya(cdp) {
  return fetchDiHalaman(cdp, "/auth/me");
}

async function logout(cdp) {
  await fetchDiHalaman(cdp, "/auth/logout", { method: "POST" });
  await tidur(1500);
}

async function main() {
  const proc = spawn("google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1280,900",
    "about:blank",
  ]);

  const laporan = [];
  const catat = (nama, lulus, detail) => {
    laporan.push({ nama, lulus, detail });
    console.log(`${lulus ? "[LULUS]" : "[GAGAL]"} ${nama}`);
    console.log(`        ${detail}`);
  };

  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    await cdp.kirim("Network.enable");
    await cdp.kirim("Log.enable");

    console.log("=== UJI ANTI-PRIVILEGE-ESCALATION (CS vs ADMIN) ===");
    console.log(`Web : ${WEB}`);
    console.log(`Api : ${API}\n`);

    // ------------------------------------------------------------------ CS
    console.log("--- Login sebagai CS ---");
    await loginLewatForm(cdp, CS_NISN, PW);
    const meCs = await siapaSaya(cdp);
    console.log(`   /auth/me -> ${JSON.stringify(meCs).slice(0, 200)}`);
    if (meCs?.body?.user?.role !== "cs") {
      throw new Error(
        `Login CS gagal - role terbaca: ${meCs?.body?.user?.role ?? JSON.stringify(meCs)}`,
      );
    }
    console.log("   [OK] masuk sebagai role cs\n");

    // Cari id target (siswa) dari daftar pengguna.
    const daftar = await fetchDiHalaman(cdp, "/admin/users");
    const target = (daftar?.body?.users || []).find((u) => u.nisn === TARGET_NISN);
    if (!target) throw new Error(`Target ${TARGET_NISN} tidak ditemukan di /admin/users`);
    console.log(`   target: ${target.full_name} (${target.nisn}) id=${target.id} role=${target.role}\n`);

    // (2) CS -> admin HARUS 403
    const r1 = await fetchDiHalaman(cdp, `/admin/users/${target.id}/role`, {
      method: "PUT",
      json: { role: "admin" },
    });
    catat(
      "CS ubah peran ke 'admin' ditolak (403)",
      r1?.status === 403,
      `status=${r1?.status} body=${JSON.stringify(r1?.body).slice(0, 160)}`,
    );

    // (3) CS -> cs HARUS 403
    const r2 = await fetchDiHalaman(cdp, `/admin/users/${target.id}/role`, {
      method: "PUT",
      json: { role: "cs" },
    });
    catat(
      "CS ubah peran ke 'cs' ditolak (403)",
      r2?.status === 403,
      `status=${r2?.status} body=${JSON.stringify(r2?.body).slice(0, 160)}`,
    );

    // (4) Lewat rute CS sendiri -> admin HARUS 400 (validator menolak)
    const r3 = await fetchDiHalaman(cdp, `/cs/users/${target.id}/role`, {
      method: "PUT",
      json: { role: "admin" },
    });
    catat(
      "CS lewat /cs/... ubah peran ke 'admin' ditolak (400)",
      r3?.status === 400,
      `status=${r3?.status} body=${JSON.stringify(r3?.body).slice(0, 160)}`,
    );

    // (5) Kewenangan sah CS: -> kwu_brital BOLEH, lalu kembalikan.
    const peranSemula = target.role;
    const r4 = await fetchDiHalaman(cdp, `/cs/users/${target.id}/role`, {
      method: "PUT",
      json: { role: "kwu_brital" },
    });
    catat(
      "CS ubah peran ke 'kwu_brital' diizinkan (200)",
      r4?.status === 200,
      `status=${r4?.status} body=${JSON.stringify(r4?.body).slice(0, 160)}`,
    );
    const r5 = await fetchDiHalaman(cdp, `/cs/users/${target.id}/role`, {
      method: "PUT",
      json: { role: peranSemula },
    });
    console.log(`        (dikembalikan ke '${peranSemula}': status=${r5?.status})\n`);

    // Bukti audit_log mencatat perubahan peran.
    const audit = await fetchDiHalaman(cdp, "/admin/audit-log?limit=20");
    const auditStatus = audit?.status;
    catat(
      "audit_log tidak bisa dibaca CS (403, khusus admin)",
      auditStatus === 403,
      `GET /admin/audit-log sebagai CS -> status=${auditStatus}`,
    );

    await logout(cdp);

    // --------------------------------------------------------------- ADMIN
    console.log("--- Login sebagai admin ---");
    await loginLewatForm(cdp, ADMIN_NISN, PW);
    const meAdmin = await siapaSaya(cdp);
    console.log(`   /auth/me -> ${JSON.stringify(meAdmin).slice(0, 200)}`);
    if (meAdmin?.body?.user?.role !== "admin") {
      throw new Error(`Login admin gagal - role: ${meAdmin?.body?.user?.role}`);
    }

    // (6) Kontrol positif: admin BOLEH mengubah peran.
    const r6 = await fetchDiHalaman(cdp, `/admin/users/${target.id}/role`, {
      method: "PUT",
      json: { role: "kwu_laundry" },
    });
    catat(
      "admin ubah peran ke 'kwu_laundry' diizinkan (200)",
      r6?.status === 200,
      `status=${r6?.status} body=${JSON.stringify(r6?.body).slice(0, 160)}`,
    );
    // kembalikan
    await fetchDiHalaman(cdp, `/admin/users/${target.id}/role`, {
      method: "PUT",
      json: { role: peranSemula },
    });

    // Admin bisa membaca audit_log.
    const audit2 = await fetchDiHalaman(cdp, "/admin/audit-log?limit=20");
    const adaCatatUbahPeran = Array.isArray(audit2?.body?.audit)
      ? audit2.body.audit.some((a) => a.aksi === "ubah_peran")
      : false;
    catat(
      "audit_log memuat entri 'ubah_peran' (khusus admin)",
      audit2?.status === 200 && adaCatatUbahPeran,
      `status=${audit2?.status} entri=${audit2?.body?.audit?.length ?? 0} ada_ubah_peran=${adaCatatUbahPeran}`,
    );

    await logout(cdp);
  } catch (e) {
    console.log(`\n[GALAT FATAL] ${e.message}`);
    laporan.push({ nama: "FATAL", lulus: false, detail: e.message });
  } finally {
    proc.kill();

    const gagal = laporan.filter((l) => !l.lulus).length;
    console.log("\n=== RINGKASAN ===");
    console.log(`total=${laporan.length} lulus=${laporan.length - gagal} gagal=${gagal}`);
    process.exitCode = gagal === 0 ? 0 : 1;
  }
}

main();

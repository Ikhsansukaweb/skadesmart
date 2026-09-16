// Jalankan uji anti-escalation dengan password dibaca dari backend/.env.
// Password TIDAK pernah ditulis di berkas ini - hanya dibaca saat runtime lalu
// diteruskan ke proses anak lewat environment.
import { readFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";

const envPath = path.resolve(process.cwd(), "../backend/.env");
const isi = readFileSync(envPath, "utf-8");
const m = isi.match(/^DUMMY_PASSWORD=(.*)$/m);
if (!m) {
  console.error("DUMMY_PASSWORD tidak ada di " + envPath);
  process.exit(2);
}
const pw = m[1].trim().replace(/^["']|["']$/g, "");

const anak = spawn("node", ["scripts/uji-anti-escalation.mjs"], {
  stdio: "inherit",
  env: { ...process.env, SKADES_PW: pw },
});
anak.on("exit", (kode) => process.exit(kode ?? 1));

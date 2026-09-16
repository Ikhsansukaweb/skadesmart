// Debug langkah login: cetak isi halaman, error konsol, dan hasil /auth/me.
import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const PORT = 9555;
const WEB = "https://skadesmart.web.id";
const API = "https://api.skadesmart.web.id/api";
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const envPath = path.resolve(process.cwd(), "../backend/.env");
const m = readFileSync(envPath, "utf-8").match(/^DUMMY_PASSWORD=(.*)$/m);
const PW = (m ? m[1] : "").trim().replace(/^["']|["']$/g, "");

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
      const msg = JSON.parse(e.data);
      if (msg.id && tunggu.has(msg.id)) { tunggu.get(msg.id)(msg.result); tunggu.delete(msg.id); }
      else if (msg.method) peristiwa.push(msg);
    };
    ws.onopen = () => resolve({
      peristiwa,
      kirim: (method, params = {}) => new Promise((res) => { const i = ++id; tunggu.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
    });
  });
}

async function ev(cdp, expr) {
  const r = await cdp.kirim("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { _err: r.exceptionDetails.exception?.description };
  return r.result?.value;
}

async function main() {
  const proc = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${PORT}`, "--window-size=1280,900", "about:blank"]);
  try {
    const cdp = await klien(await targetWs());
    await cdp.kirim("Runtime.enable");
    await cdp.kirim("Page.enable");
    await cdp.kirim("Network.enable");
    await cdp.kirim("Log.enable");

    console.log("1) buka /login");
    await cdp.kirim("Page.navigate", { url: `${WEB}/login` });
    await tidur(8000);
    console.log("   " + await ev(cdp, `JSON.stringify({url:location.href, title:document.title, inputs:document.querySelectorAll('input').length, buttons:Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).slice(0,5)})`));

    console.log("\n2) isi & submit");
    console.log("   " + await ev(cdp, `(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const ni = inputs.find(i => i.type !== 'password');
      const pw = inputs.find(i => i.type === 'password');
      if (!ni || !pw) return 'input-tidak-ada';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(ni, '10002'); ni.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(pw, ${JSON.stringify(PW)}); pw.dispatchEvent(new Event('input', { bubbles: true }));
      return JSON.stringify({nisn:ni.value, pwLen:pw.value.length});
    })()`));

    await tidur(500);
    console.log("   klik: " + await ev(cdp, `(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /masuk|login/i.test(x.textContent));
      if (b) { b.click(); return 'diklik'; }
      const f = document.querySelector('form'); if (f) { f.requestSubmit(); return 'submit'; }
      return 'tidak-ada';
    })()`));

    await tidur(10000);
    console.log("\n3) setelah submit");
    console.log("   " + await ev(cdp, `JSON.stringify({url:location.pathname, teks:(document.body?document.body.innerText:'').slice(0,250)})`));

    console.log("\n4) /auth/me dari halaman");
    console.log("   " + await ev(cdp, `(async()=>{ const r = await fetch(${JSON.stringify(API + "/auth/me")},{credentials:"include"}); const t = await r.text(); return JSON.stringify({status:r.status, body:t.slice(0,200)}); })()`));

    console.log("\n5) login langsung via fetch di halaman (tanpa form)");
    console.log("   " + await ev(cdp, `(async()=>{
      const csrfRes = await fetch(${JSON.stringify(API + "/auth/csrf")},{credentials:"include"});
      const csrf = await csrfRes.json().catch(()=>({}));
      const r = await fetch(${JSON.stringify(API + "/auth/login")},{
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json", ...(csrf.csrf_token?{"x-csrf-token":csrf.csrf_token}:{})},
        body: JSON.stringify({nisn:"10002", password:${JSON.stringify(PW)}})
      });
      const t = await r.text();
      return JSON.stringify({status:r.status, body:t.slice(0,250)});
    })()`));

    console.log("\n6) error konsol/jaringan:");
    const errKonsol = cdp.peristiwa.filter((x) => x.method === "Runtime.consoleAPICalled" && x.params.type === "error").map((x) => (x.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    const gagal = cdp.peristiwa.filter((x) => x.method === "Network.loadingFailed").map((x) => `${x.params.type} ${x.params.errorText}`.slice(0, 200));
    const logErr = cdp.peristiwa.filter((x) => x.method === "Log.entryAdded" && x.params.entry.level === "error").map((x) => `${x.params.entry.source}: ${x.params.entry.text}`.slice(0, 300));
    errKonsol.slice(0, 8).forEach((x) => console.log("   konsol: " + x));
    gagal.slice(0, 8).forEach((x) => console.log("   jaringan: " + x));
    logErr.slice(0, 10).forEach((x) => console.log("   log: " + x));
  } catch (e) {
    console.log("[GALAT] " + e.message);
  } finally {
    proc.kill();
  }
}
main();

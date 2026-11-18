// Cuadros sueltos: node film/cuadros.mjs carpeta t1,t2,...   (o "beats" = uno por beat)
import { createRequire } from "node:module"; import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
import { servir } from "./servidor.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, "..");
const out = process.argv[2] || "/tmp/cuadros"; fs.mkdirSync(out, { recursive: true });
let ts = process.argv[3] || "beats";
ts = ts === "beats" ? Array.from({ length: 54 }, (_, i) => i * 0.5 + 0.25) : ts.split(",").map(Number);
const { s, url } = await servir(root);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on("pageerror", (e) => console.log("[error]", e.message)); p.on("console", (m) => { if (m.type() === "error" || m.text().startsWith("sin")) console.log("[pág]", m.text()); });
await p.goto(url + "/film/index.html" + (process.env.SIN_NUMERO ? "?numero=0" : ""));
for (const t of ts) {
  const t0 = Date.now();
  await p.evaluate((t) => window.seek(t), t);
  await p.locator("#stage").screenshot({ path: path.join(out, `t_${t.toFixed(2).padStart(5, "0")}.jpg`), type: "jpeg", quality: 85 });
  console.log("t", t, Date.now() - t0, "ms");
}
await b.close(); s.close();

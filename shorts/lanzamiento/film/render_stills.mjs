// Saca los 4 cuadros de prueba: node film/render_stills.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(dir, "..", "cuadros_prueba");
const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
p.on("console", (m) => console.log("[pág]", m.text()));
p.on("pageerror", (e) => console.log("[error]", e.message));
await p.goto("file://" + path.join(dir, "index.html"));
const fs = await import("node:fs"); fs.mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(await p.evaluate(() => window.STILLS))) {
  await p.evaluate(([t, n]) => window.seek(t, n), [t, name]);
  await p.locator("#stage").screenshot({ path: path.join(out, `${name}.png`) });
  console.log("listo", name);
}
await b.close();

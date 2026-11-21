// Graba el comercial: 60 fps, 4 subcuadros por cuadro mezclados con ffmpeg tmix.
// Por tramos de 120 cuadros (out/tramos/f_NNNN.mp4 + .ok); si se corta, al volver a correrlo sigue donde iba.
// Uso: node film/render.mjs [trabajadores=3]
import { createRequire } from "node:module"; import path from "node:path"; import fs from "node:fs"; import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url"; import { servir } from "./servidor.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, "..");
const FPS = 30, SUB = 4, TOTAL = 15.0, N = Math.round(TOTAL * FPS), CH = 120;

const outDir = path.join(root, "out", "tramos"); fs.mkdirSync(outDir, { recursive: true });
const tramos = []; for (let a = 0; a < N; a += CH) tramos.push([a, Math.min(N, a + CH)]);
const pend = tramos.filter(([a]) => !fs.existsSync(path.join(outDir, `f_${String(a).padStart(4, "0")}.mp4.ok`)));
const { s, url } = await servir(root);
const b = await chromium.launch();
async function trabajador(id) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => console.log(`[${id}] error`, e.message));
  await p.goto(url + "/film/index.html");
  const stage = p.locator("#stage");
  while (pend.length) {
    const [a, z] = pend.shift(), name = path.join(outDir, `f_${String(a).padStart(4, "0")}.mp4`);
    const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS * SUB), "-c:v", "mjpeg", "-i", "-",
      "-vf", `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB)`, "-r", String(FPS),
      "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", name], { stdio: ["pipe", "inherit", "inherit"] });
    const t0 = Date.now();
    for (let n = a; n < z; n++) for (let k = 0; k < SUB; k++) {
      const t = Math.max(0, (n + (k + 0.5) / SUB - 0.5) / FPS);
      await p.evaluate((t) => window.seek(t), t);
      const buf = await stage.screenshot({ type: "jpeg", quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end(); await new Promise((r) => ff.on("close", r));
    fs.writeFileSync(name + ".ok", "");
    console.log(`[${id}] tramo ${a}-${z - 1} listo en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await Promise.all(Array.from({ length: Number(process.argv[2] || 2) }, (_, i) => trabajador(i)));
await b.close(); s.close();
const lista = tramos.map(([a]) => `file 'f_${String(a).padStart(4, "0")}.mp4'`).join("\n");
fs.writeFileSync(path.join(outDir, "lista.txt"), lista);
const cc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(outDir, "lista.txt"), "-c", "copy", path.join(outDir, "video.mp4")], { stdio: "inherit" });
cc.on("close", (code) => console.log(code === 0 ? `LISTO ${N} cuadros` : "FALLO al juntar"));

// node scripts/fotos.mjs <prefijo> <cuadros,separados> [escala]  -> fotos sueltas para revisar el look
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const [prefix = "out/f_", frames = "0", scale = "0.5"] = process.argv.slice(2);
const B = process.env.CHROME || "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const inputProps = { post: { dpr: Number(scale) } };
const chromiumOptions = { gl: "swangle" };
const composition = await selectComposition({ serveUrl, id: "Desempleo", inputProps, browserExecutable: B, chromiumOptions });
for (const f of frames.split(",").map(Number)) {
  await renderStill({ serveUrl, composition, frame: f, output: `${prefix}${String(f).padStart(4, "0")}.png`, scale: Number(scale), inputProps, browserExecutable: B, chromiumOptions });
  console.log("foto", f);
}

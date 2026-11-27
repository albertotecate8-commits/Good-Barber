// Servidor estático mínimo para la carpeta del proyecto (el video se lee como blob, sin rangos)
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4", ".css": "text/css" };
export function servir(root, port = 0) {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream" });
      fs.createReadStream(f).pipe(r);
    }).listen(port, "127.0.0.1", () => ok({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

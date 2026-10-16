import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import nspell from "nspell";
import type { Speller } from "./spelling";

// Se carga una sola vez por instancia (~1 s). Los archivos del diccionario se
// incluyen en el despliegue con outputFileTracingIncludes (next.config.ts).
let loading: Promise<Speller | null> | null = null;

export function getSpeller(): Promise<Speller | null> {
  loading ??= (async () => {
    try {
      const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "dictionary-es");
      const [aff, dic] = await Promise.all([
        fs.readFile(path.join(/*turbopackIgnore: true*/ dir, "index.aff")),
        fs.readFile(path.join(/*turbopackIgnore: true*/ dir, "index.dic")),
      ]);
      return nspell({ aff, dic });
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}

#!/usr/bin/env node
// Verifica que ningún secreto llegue al código que descarga el navegador.
// Uso (CI y local): construir con valores CENTINELA y luego revisar .next/static:
//   SUPABASE_SERVICE_ROLE_KEY=centinela-... npm run build && node scripts/check-client-secrets.mjs
// Falla si encuentra un centinela, el nombre de una variable secreta o un módulo
// de servidor (tokens de Meta, service_role) dentro de los archivos públicos.
import fs from "node:fs";
import path from "node:path";

export const SENTINELS = {
  SUPABASE_SERVICE_ROLE_KEY: "centinela-service-role-NO-DEBE-SALIR",
  META_APP_SECRET: "centinela-meta-secret-NO-DEBE-SALIR",
  MKT_TOKEN_KEY: "Y2VudGluZWxhLXRva2VuLWtleS1uby1kZWJlLXNhbGly",
  MKT_CRON_SECRET: "centinela-cron-secret-NO-DEBE-SALIR-123456",
  GEMINI_API_KEY: "centinela-gemini-NO-DEBE-SALIR",
  TAVILY_API_KEY: "centinela-tavily-NO-DEBE-SALIR",
};

const FORBIDDEN = [
  ...Object.values(SENTINELS),
  ...Object.keys(SENTINELS),
  "mkt_social_tokens",
  "mkt_meta_oauth_sessions",
  "token_ciphertext",
];

function walk(dir) {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const root = path.join(process.cwd(), ".next", "static");
  const files = walk(root).filter((f) => /\.(js|css|html|json|map|txt)$/.test(f));
  if (!files.length) {
    console.error("No hay archivos en .next/static: ejecuta primero npm run build.");
    process.exit(2);
  }
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const s of FORBIDDEN) if (text.includes(s)) hits.push(`${path.relative(process.cwd(), f)} contiene «${s}»`);
  }
  if (hits.length) {
    console.error("SECRETOS O CÓDIGO DE SERVIDOR EN EL NAVEGADOR:\n" + hits.join("\n"));
    process.exit(1);
  }
  console.log(`OK: ${files.length} archivos públicos revisados, sin secretos ni módulos de servidor.`);
}

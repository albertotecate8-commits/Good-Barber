// Recibe lo que manda un atajo del iPhone (llave, tipo, concepto, cantidad)
// y lo guarda con public.quick_entry. La llave se valida en la base de datos.
// Desplegada con verify_jwt = false: la autenticación es la llave del atajo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

function parseAmount(raw: unknown): number {
  const s = String(raw ?? "").replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const params: Record<string, string> = Object.fromEntries(url.searchParams);

  if (req.method === "POST") {
    const type = req.headers.get("content-type") || "";
    try {
      if (type.includes("application/json")) {
        Object.assign(params, await req.json());
      } else if (type.includes("form")) {
        (await req.formData()).forEach((v, k) => { params[k] = String(v); });
      }
    } catch {
      return text("No se pudo leer lo que mandaste.", 400);
    }
  } else if (req.method !== "GET") {
    return text("Método no permitido.", 405);
  }

  const token = String(params.t || params.llave || "");
  if (token.length < 20) return text("Falta la llave del atajo.", 401);

  const { data, error } = await supabase.rpc("quick_entry", {
    p_token: token,
    p_tipo: String(params.tipo || ""),
    p_concepto: String(params.concepto || ""),
    p_cantidad: parseAmount(params.cantidad),
  });

  if (error) {
    const known = ["Llave no válida", "Cuenta no autorizada", "Escribe una cantidad mayor a cero", "Escribe el nombre del gasto", "Tipo no válido"];
    const msg = known.find((k) => error.message.includes(k));
    return text(msg ? `No se guardó: ${msg}.` : "No se guardó. Intenta de nuevo.", msg ? 400 : 500);
  }
  return text(String(data));
});

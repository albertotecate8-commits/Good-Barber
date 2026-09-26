// Edge Function: lee la foto de un ticket de compra y devuelve los renglones
// detectados, con la coincidencia sugerida contra el catálogo del usuario.
// NUNCA toca el inventario: la app muestra una pantalla de confirmación.
//
// Secreto requerido: ANTHROPIC_API_KEY  (supabase secrets set ANTHROPIC_API_KEY=...)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@^0.128.0";

const MODEL = "claude-opus-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp"] as const;
type MediaType = (typeof ALLOWED_MEDIA)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CatalogEntry {
  id: string;
  name: string;
}

interface ScanRequest {
  image_base64: string;
  media_type: MediaType;
  catalog: CatalogEntry[];
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["store_name", "purchase_date", "items", "ticket_total", "readable"],
  properties: {
    readable: {
      type: "boolean",
      description: "false si la foto no es un ticket o no se puede leer",
    },
    store_name: { type: ["string", "null"] },
    purchase_date: { type: ["string", "null"], description: "YYYY-MM-DD si aparece" },
    ticket_total: { type: ["number", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "raw_name", "quantity", "unit_price", "line_total",
          "match_product_id", "match_confidence", "suggested_name",
        ],
        properties: {
          raw_name: { type: "string", description: "Texto del renglón tal como aparece" },
          quantity: { type: "integer", description: "Piezas compradas (>= 1)" },
          unit_price: { type: ["number", "null"], description: "Costo por pieza" },
          line_total: { type: ["number", "null"] },
          match_product_id: {
            type: ["string", "null"],
            description: "id del catálogo que corresponde, o null si ninguno",
          },
          match_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
          suggested_name: {
            type: "string",
            description: "Nombre limpio y legible para dar de alta si es producto nuevo",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Lees fotos de tickets de compra de una tiendita de dulces en México.
Extrae SOLO los productos comprados (ignora subtotales, IVA, cambio, forma de pago, puntos, publicidad).

Cantidades:
- La cantidad es en PIEZAS. Si el renglón indica una caja/paquete/display con N piezas
  (p. ej. "CJ 12", "PAQ/20", "x24"), multiplica para dar piezas y usa el costo por pieza.
- Si hay "2 x 35.00" o "2 @ 35.00", la cantidad es 2 y unit_price 35.00.
- Si no aparece cantidad, usa 1.

Coincidencias: compara cada renglón con el catálogo del usuario. Los tickets abrevian
("TAKIS FGO 70G" = "Takis Fuego", "PULPAR" = "Pulparindo", "MAZAP DLAROSA" = "Mazapán").
- high: seguro que es el mismo producto.
- medium: probable pero con duda (sabor/tamaño distinto posible).
- low: parecido lejano.
- none: no hay nada en el catálogo que corresponda (match_product_id = null).
Nunca inventes ids: usa sólo ids del catálogo.

Si un número es ilegible, déjalo en null en lugar de adivinar.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseRequest(body: unknown): ScanRequest | string {
  if (!body || typeof body !== "object") return "Cuerpo inválido";
  const b = body as Record<string, unknown>;
  if (typeof b.image_base64 !== "string" || b.image_base64.length === 0) return "Falta la imagen";
  if (!ALLOWED_MEDIA.includes(b.media_type as MediaType)) return "Formato de imagen no soportado";
  if (b.image_base64.length * 0.75 > MAX_IMAGE_BYTES) return "La imagen es demasiado grande";
  if (!Array.isArray(b.catalog)) return "Falta el catálogo";
  const catalog = b.catalog
    .filter((c): c is CatalogEntry =>
      !!c && typeof c === "object" && typeof (c as CatalogEntry).id === "string" &&
      typeof (c as CatalogEntry).name === "string")
    .slice(0, 1000)
    .map((c) => ({ id: c.id, name: c.name.slice(0, 80) }));
  return { image_base64: b.image_base64, media_type: b.media_type as MediaType, catalog };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "Falta configurar ANTHROPIC_API_KEY en Supabase" }, 500);
  }

  let parsed: ScanRequest | string;
  try {
    parsed = parseRequest(await req.json());
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (typeof parsed === "string") return json({ error: parsed }, 400);

  const client = new Anthropic({ apiKey });
  const catalogText = parsed.catalog.length
    ? parsed.catalog.map((c) => `${c.id} | ${c.name}`).join("\n")
    : "(catálogo vacío)";

  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: parsed.media_type, data: parsed.image_base64 },
          },
          { type: "text", text: `Catálogo del usuario (id | nombre):\n${catalogText}` },
        ],
      }],
    };
    const response = await client.beta.messages.create(params);

    if (response.stop_reason === "refusal") {
      return json({ error: "No se pudo procesar esta imagen" }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "El ticket es demasiado largo; intenta con una foto por sección" }, 422);
    }

    const text = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    const result = JSON.parse(text);

    // Defensa: descarta ids que no existan en el catálogo enviado.
    const validIds = new Set(parsed.catalog.map((c) => c.id));
    for (const item of result.items ?? []) {
      if (item.match_product_id && !validIds.has(item.match_product_id)) {
        item.match_product_id = null;
        item.match_confidence = "none";
      }
      item.quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    }
    return json(result);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Servicio ocupado, intenta en un minuto" }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: "La clave ANTHROPIC_API_KEY no es válida" }, 500);
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error.status, error.message);
      return json({ error: "No se pudo leer el ticket" }, 502);
    }
    console.error(error);
    return json({ error: "No se pudo leer el ticket" }, 500);
  }
});

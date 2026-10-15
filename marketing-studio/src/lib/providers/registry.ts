// Registro honesto de proveedores de IA e integraciones.
//
// Regla económica: presupuesto adicional = $0 MXN. Ningún proveedor de pago se
// puede invocar desde la app (ver budget.ts). Una suscripción de usuario
// (ChatGPT Plus, Claude Pro, Google AI) NO equivale a acceso a una API: para
// esas herramientas la app prepara el trabajo y tú lo ejecutas en su web
// ("flujo asistido"), y luego importas el resultado.
//
// "verifiedOn" es la fecha en que se revisó el estado público del proveedor.
// Las condiciones cambian: revisa la fuente antes de depender de un límite.

export type AccessMode =
  | "free_api" // API oficial con nivel gratuito real, sin tarjeta
  | "free_local" // corre en tu propio servidor/navegador, sin costo por uso
  | "official_setup" // API oficial gratuita que requiere registro/revisión de la plataforma
  | "assisted" // sin API utilizable: la app prepara, tú ejecutas en la herramienta y lo importas
  | "paid_blocked"; // solo existe de pago: bloqueado por la regla de $0

export type Category = "texto" | "imagen" | "video" | "edicion" | "investigacion" | "redes";

export interface Provider {
  id: string;
  name: string;
  category: Category;
  access: AccessMode;
  /** Variables de entorno de servidor necesarias (nunca NEXT_PUBLIC_). */
  envVars?: string[];
  usedFor: string;
  limitations: string[];
  /** Límite de uso diario que la app se impone (más bajo que el del proveedor). */
  dailyCap?: number;
  link: string;
  verifiedOn: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "gemini-text",
    name: "Gemini API (modelos Flash de texto)",
    category: "texto",
    access: "free_api",
    envVars: ["GEMINI_API_KEY", "GEMINI_FREE_TIER_CONFIRMED"],
    usedFor: "Director de Marketing: redactar la estrategia y los anuncios con el contexto del negocio (opcional; sin ella se usa el motor de plantillas).",
    limitations: [
      "GEMINI_FREE_TIER_CONFIRMED=1 es tu confirmación de que el proyecto de la clave no tiene facturación activa; sin ella la app no llama a Gemini.",
      "Modelo configurable con GEMINI_MODEL (por defecto gemini-2.5-flash). Verifica en AI Studio que siga en el nivel gratuito.",
      "La clave se crea en Google AI Studio sin activar facturación. Si el proyecto de Google Cloud tiene facturación activa, el uso podría cobrarse: usa un proyecto sin facturación.",
      "En el nivel gratuito Google puede usar el contenido enviado para mejorar sus productos: no envíes datos personales de clientes.",
      "Los límites por minuto y por día los fija Google y cambian; se consultan en AI Studio.",
    ],
    dailyCap: 200,
    link: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedOn: "2026-10-15",
  },
  {
    id: "gemini-image-api",
    name: "Gemini / Imagen por API (generación de imágenes)",
    category: "imagen",
    access: "paid_blocked",
    usedFor: "Generación automática de imágenes.",
    limitations: [
      "A octubre de 2026 los modelos de imagen de la API de Gemini no tienen nivel gratuito: se bloquea.",
      "Alternativa: flujo asistido con la app de Gemini o Google Flow incluidos en tu plan.",
    ],
    link: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedOn: "2026-10-15",
  },
  {
    id: "gemini-app",
    name: "App de Gemini (tu suscripción de Google)",
    category: "imagen",
    access: "assisted",
    usedFor: "Generar y editar imágenes publicitarias a partir del prompt que prepara la app.",
    limitations: ["Sin API: copias el prompt, generas en gemini.google.com e importas la imagen a la Biblioteca."],
    link: "https://gemini.google.com/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "google-flow",
    name: "Google Flow (Veo) con tu plan de Google",
    category: "video",
    access: "assisted",
    usedFor: "Escenas de video con IA para Reels, historias y anuncios.",
    limitations: [
      "Flow no ofrece una API pública. Veo por API (Gemini API / Vertex AI) es de pago y queda bloqueado.",
      "La app prepara guion, escenas y prompts; tú generas en Flow e importas los clips.",
    ],
    link: "https://labs.google/fx/tools/flow",
    verifiedOn: "2026-10-15",
  },
  {
    id: "chatgpt",
    name: "ChatGPT (tu suscripción)",
    category: "imagen",
    access: "assisted",
    usedFor: "Imágenes y textos alternativos ejecutando en chatgpt.com los prompts que prepara la app.",
    limitations: ["La suscripción ChatGPT no incluye la API de OpenAI (que se paga aparte): no se integra por API."],
    link: "https://chatgpt.com/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "openai-api",
    name: "OpenAI API",
    category: "imagen",
    access: "paid_blocked",
    usedFor: "—",
    limitations: ["Sin nivel gratuito: bloqueada por la regla de $0."],
    link: "https://openai.com/api/pricing/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "claude",
    name: "Claude (tu suscripción)",
    category: "texto",
    access: "assisted",
    usedFor: "Revisión de estrategias y textos largos ejecutando en claude.ai los briefs que prepara la app.",
    limitations: ["La suscripción de Claude no incluye la API de Anthropic (de pago): no se integra por API."],
    link: "https://claude.ai/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "anthropic-api",
    name: "Claude API (Anthropic)",
    category: "texto",
    access: "paid_blocked",
    usedFor: "—",
    limitations: ["Facturación por uso: bloqueada por la regla de $0."],
    link: "https://www.anthropic.com/pricing",
    verifiedOn: "2026-10-15",
  },
  {
    id: "ffmpeg",
    name: "FFmpeg (montaje de video)",
    category: "edicion",
    access: "free_local",
    usedFor: "Unir y recortar clips reales, subtítulos, formatos 9:16 / 1:1 / 16:9, exportar para redes.",
    limitations: [
      "Es edición por código, no generación con IA: un montaje de fotos no se presenta como video generado.",
      "Vercel no incluye FFmpeg: allí la app entrega el comando para montarlo en tu computadora. Funciona en servidores con FFmpeg instalado (como el de desarrollo).",
    ],
    link: "https://ffmpeg.org/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "canvas-editor",
    name: "Editor gráfico por código (navegador)",
    category: "edicion",
    access: "free_local",
    usedFor: "Estudio creativo: recortar, textos y precios exactos, logotipo sin deformar, plantillas, exportar y adaptar a otros formatos.",
    limitations: ["Corre en tu navegador (Canvas): es edición por código, no generación de imágenes con IA."],
    link: "https://developer.mozilla.org/docs/Web/API/Canvas_API",
    verifiedOn: "2026-10-15",
  },
  {
    id: "meta-graph",
    name: "Meta Graph API (Facebook e Instagram)",
    category: "redes",
    access: "official_setup",
    envVars: ["META_APP_ID", "META_APP_SECRET"],
    usedFor: "Conectar la página Good barber y la cuenta profesional de Instagram, publicar y leer estadísticas.",
    limitations: [
      "Requiere crear una app en Meta for Developers (lo haces tú) y, para publicar, pasar App Review con video de demostración.",
      "Tener control total de la página no autoriza a una app nueva: hay que conceder permisos con el inicio de sesión oficial.",
    ],
    link: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
    verifiedOn: "2026-10-15",
  },
  {
    id: "meta-ad-library",
    name: "Biblioteca de anuncios de Meta",
    category: "investigacion",
    access: "assisted",
    usedFor: "Ver qué anuncios activos tienen competidores en Durango.",
    limitations: [
      "La API de la biblioteca exige verificación de identidad y en México solo devuelve anuncios políticos/sociales; para anuncios comerciales se usa la web de forma asistida.",
    ],
    link: "https://www.facebook.com/ads/library/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "osm",
    name: "OpenStreetMap (Nominatim + Overpass)",
    category: "investigacion",
    access: "free_api",
    usedFor: "Competidores mapeados en la ciudad: nombre, dirección, horario y web cuando existen.",
    limitations: [
      "Datos colaborativos (ODbL): el listado puede estar incompleto; se muestra la atribución.",
      "Uso puntual e identificado: 2 consultas por investigación (Nominatim permite máximo 1 por segundo).",
      "Define MKT_CONTACT_EMAIL para identificarte ante OpenStreetMap, como pide su política.",
    ],
    link: "https://operations.osmfoundation.org/policies/nominatim/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "tavily",
    name: "Tavily (búsqueda web)",
    category: "investigacion",
    access: "free_api",
    envVars: ["TAVILY_API_KEY"],
    usedFor: "Buscar sitios, notas y publicaciones públicas sobre el sector en la ciudad.",
    limitations: [
      "Plan gratuito: 1 000 créditos al mes sin tarjeta; cada investigación usa 2. Tope propio: 25 búsquedas al día.",
      "Los fragmentos son de sitios de terceros: se guardan como observaciones de confianza baja.",
    ],
    dailyCap: 25,
    link: "https://docs.tavily.com/documentation/api-credits",
    verifiedOn: "2026-10-15",
  },
  {
    id: "google-cse",
    name: "Google Custom Search JSON API",
    category: "investigacion",
    access: "paid_blocked",
    usedFor: "—",
    limitations: ["Cerrada a clientes nuevos y se apaga el 1 de enero de 2027; además cobra después de 100 consultas diarias."],
    link: "https://developers.google.com/custom-search/v1/overview",
    verifiedOn: "2026-10-15",
  },
  {
    id: "google-trends-rss",
    name: "Google Trends — RSS de tendencias del día (México)",
    category: "investigacion",
    access: "free_api",
    usedFor: "Detectar si alguna búsqueda en tendencia hoy en México se relaciona con el sector.",
    limitations: ["Son tendencias nacionales y generales (no de Durango ni del sector); feed ofrecido en la opción Exportar → RSS de Google Trends."],
    link: "https://support.google.com/trends/answer/3076011",
    verifiedOn: "2026-10-15",
  },
  {
    id: "google-trends",
    name: "Google Trends",
    category: "investigacion",
    access: "assisted",
    usedFor: "Interés de búsqueda por tema y temporada en Durango / México.",
    limitations: [
      "Explorar por tema en Durango: la API oficial está en alfa por invitación y las librerías no oficiales se descartan. La app arma el enlace y registras el resultado a mano.",
    ],
    link: "https://trends.google.com/trends/explore?geo=MX-DUR",
    verifiedOn: "2026-10-15",
  },
  {
    id: "tiktok-creative-center",
    name: "TikTok Creative Center",
    category: "investigacion",
    access: "assisted",
    usedFor: "Formatos, sonidos y hashtags en tendencia en México.",
    limitations: ["Sin API pública: consulta asistida."],
    link: "https://ads.tiktok.com/business/creativecenter/",
    verifiedOn: "2026-10-15",
  },
  {
    id: "google-places",
    name: "Google Maps / Places API",
    category: "investigacion",
    access: "paid_blocked",
    usedFor: "—",
    limitations: [
      "Exige cuenta de facturación aunque tenga crédito mensual: bloqueada. Las fichas públicas se revisan de forma asistida en Google Maps.",
    ],
    link: "https://developers.google.com/maps/billing-and-pricing/pricing",
    verifiedOn: "2026-10-15",
  },
];

export const ACCESS_LABELS: Record<AccessMode, string> = {
  free_api: "API gratuita",
  free_local: "Gratis (local)",
  official_setup: "API oficial: requiere alta",
  assisted: "Flujo asistido",
  paid_blocked: "Bloqueado (de pago)",
};

export type RuntimeStatus = "ready_untested" | "missing_config" | "assisted" | "blocked" | "pending_build";

/**
 * Estado en tiempo de ejecución. Nunca devuelve "funcionando": eso solo se
 * puede afirmar tras una prueba real contra el proveedor (Etapa 4).
 */
export function runtimeStatus(p: Provider, env: Record<string, string | undefined> = process.env): RuntimeStatus {
  if (p.access === "paid_blocked") return "blocked";
  if (p.access === "assisted") return "assisted";
  if (p.access === "free_local") return "ready_untested";
  const missing = (p.envVars ?? []).filter((v) => !env[v]);
  return missing.length ? "missing_config" : "ready_untested";
}

export const STATUS_LABELS: Record<RuntimeStatus, string> = {
  ready_untested: "Configurado, sin probar",
  missing_config: "Falta configurar",
  assisted: "Asistido",
  blocked: "Bloqueado",
  pending_build: "En construcción",
};

// Dirección fotográfica por giro y por servicio para los prompts de imagen.
// Objetivo: que la imagen muestre EL servicio que se anuncia (p. ej. un fade
// reconocible en Good Barber), con aspecto de fotografía publicitaria real y
// no de imagen genérica de banco. Son instrucciones para la herramienta externa
// que elijas; la app no genera imágenes.

export type Sector = "barber" | "beauty" | "finance" | "generic";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function detectSector(sector: string, name = ""): Sector {
  const s = norm(`${sector} ${name}`);
  if (/barber|barberia|peluqueria de caballero/.test(s)) return "barber";
  if (/estetica|salon|belleza|unas|glamour|spa|maquillaje|pestan/.test(s)) return "beauty";
  if (/afore|financ|pension|retiro|seguro|credito|asesor/.test(s)) return "finance";
  return "generic";
}

interface Service {
  match: RegExp;
  subject: string;
}

const BARBER_SERVICES: Service[] = [
  { match: /barba.*ceja|ceja.*barba|corte.*barba.*ceja/, subject: "resultado terminado de corte degradado, barba perfilada y cejas limpias en el mismo cliente, retrato de 3/4" },
  { match: /corte.*barba|barba.*corte/, subject: "corte degradado (fade) medio con transición limpia y barba perfilada con líneas definidas en mejillas y cuello, retrato de 3/4" },
  { match: /corte.*ceja|ceja.*corte/, subject: "corte degradado con parte superior texturizada y cejas masculinas perfiladas de forma natural" },
  { match: /barba/, subject: "perfilado de barba con navaja: el barbero trabaja la línea del cuello con toalla caliente; la barba se ve densa y simétrica" },
  { match: /ceja/, subject: "perfilado de cejas masculinas con navaja, acabado natural (sin cejas delgadas ni depiladas en exceso)" },
  { match: /corte|fade|degradado|taper/, subject: "corte de caballero degradado (fade) bajo/medio con transición suave sin escalones, contorno marcado y parte superior texturizada, visto de perfil y de 3/4" },
];

const DIRECTION: Record<Sector, { look: string; setting: string; avoid: string; note: string }> = {
  barber: {
    look: "Fotografía publicitaria realista de barbería: cámara full frame, lente de 85 mm a f/2, luz principal suave lateral con relleno tenue, textura natural de piel y cabello, profundidad de campo reducida.",
    setting: "Ambiente de barbería real: sillón de barbero clásico, espejo, herramientas profesionales (máquina, navaja, tijeras, peine) usadas correctamente.",
    avoid: "Evita: salón de belleza genérico, peinados femeninos, cabello largo cuando el servicio es un degradado, aspecto de foto de banco, herramientas deformadas, manos o dedos irregulares, piel plástica, filtros exagerados, texto y logotipos.",
    note: "El corte debe ser reconocible a simple vista. Si tienes fotos reales de tus cortes, adjúntalas como referencia: el trabajo real convence más, y una imagen con IA nunca debe presentarse como trabajo hecho en la barbería.",
  },
  beauty: {
    look: "Fotografía publicitaria realista de estética: luz suave y uniforme, colores fieles, detalle nítido del resultado (uñas, maquillaje o peinado), profundidad de campo reducida.",
    setting: "Estación de trabajo limpia y ordenada, productos sin marcas visibles, manos y rostro con textura natural.",
    avoid: "Evita: retoques extremos, piel plástica, dedos irregulares, resultados imposibles de lograr en el salón, marcas de terceros, texto y logotipos.",
    note: "Muestra solo resultados que el salón realmente ofrece; si tienes fotos de trabajos reales, adjúntalas como referencia.",
  },
  finance: {
    look: "Fotografía corporativa realista y cálida: luz natural de oficina, colores sobrios, composición limpia.",
    setting: "Asesor y cliente adulto en un escritorio en México, documentos genéricos sin datos personales legibles.",
    avoid: "Evita: billetes o gráficas que sugieran rendimientos garantizados, logotipos de AFORE, IMSS, CONSAR u otras instituciones, personas famosas, texto y logotipos.",
    note: "No uses imágenes que impliquen promesas de rendimiento ni testimonios falsos.",
  },
  generic: {
    look: "Fotografía publicitaria realista, luz natural, enfoque nítido en el producto o servicio.",
    setting: "Lugar real del negocio o un entorno coherente con el giro.",
    avoid: "Evita: aspecto de banco de imágenes, deformaciones en manos, rostros u objetos, texto y logotipos.",
    note: "Si tienes fotos reales del negocio, adjúntalas como referencia.",
  },
};

/** Sujeto concreto según el servicio anunciado (solo barbería tiene catálogo detallado). */
export function serviceSubject(sector: Sector, adText: string): string | null {
  if (sector !== "barber") return null;
  const t = norm(adText);
  return BARBER_SERVICES.find((s) => s.match.test(t))?.subject ?? null;
}

export function photoDirection(sector: Sector) {
  return DIRECTION[sector];
}

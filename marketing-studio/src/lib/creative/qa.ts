// Control de calidad creativo. Las comprobaciones automáticas solo cubren lo
// que se puede medir; lo demás (defectos visuales de una imagen con IA, que el
// logotipo sea el correcto, permisos de personas) queda como revisión humana
// obligatoria. Nunca se certifica que una imagen sea «indistinguible de una
// foto real» ni que una pieza vaya a vender.

export type QaLevel = "ok" | "warning" | "error";
export interface QaCheck {
  id: string;
  label: string;
  level: QaLevel;
  detail: string;
  /** Dónde se midió: en el navegador (lienzo) o en el servidor (datos). */
  source: "browser" | "server" | "manual";
}

export const MANUAL_CHECKS = [
  { id: "text_exact", label: "Leí todo el texto letra por letra: sin errores y con los precios correctos." },
  { id: "logo_ok", label: "El logotipo es el correcto y no se ve deformado ni cortado." },
  { id: "brand_ok", label: "Colores, tipografía y tono son coherentes con la marca." },
  { id: "no_defects", label: "Revisé defectos visuales: manos, rostros, letras deformes, objetos extraños o bordes raros." },
  { id: "mobile_ok", label: "Lo vi en un teléfono y se lee bien." },
  { id: "people_ok", label: "Las personas que aparecen dieron su permiso (o no aparecen personas reales)." },
  { id: "claims_ok", label: "Cada afirmación comercial está respaldada (no promete resultados ni usa escasez falsa)." },
] as const;
export type ManualCheckId = (typeof MANUAL_CHECKS)[number]["id"];

const CLAIM_RULES: { re: RegExp; level: QaLevel; msg: string }[] = [
  { re: /garantizad|100\s?%|resultados asegurados|seguro que/i, level: "error", msg: "promete resultados garantizados" },
  { re: /[uú]ltimos lugares|quedan pocos|solo quedan|se agota/i, level: "error", msg: "usa escasez que debe ser verdadera y comprobable" },
  { re: /\bel mejor\b|\bla mejor\b|n[uú]mero 1|#1\b|\bl[ií]der\b/i, level: "warning", msg: "usa un superlativo que necesita respaldo (premio, estudio o fuente)" },
  { re: /\bgratis\b/i, level: "warning", msg: "dice «gratis»: confirma que existe esa promoción y sus condiciones" },
  { re: /indistinguible|foto real 100|no es ia/i, level: "error", msg: "afirma que una imagen es real o indistinguible" },
];

export function claimChecks(texts: string[]): QaCheck[] {
  const joined = texts.join(" \n ");
  const found = CLAIM_RULES.filter((r) => r.re.test(joined));
  if (!found.length) return [{ id: "claims", label: "Afirmaciones comerciales", level: "ok", detail: "No se detectaron promesas ni superlativos sin respaldo.", source: "server" }];
  return found.map((r, i) => ({ id: `claims_${i}`, label: "Afirmaciones comerciales", level: r.level, detail: `El texto ${r.msg}.`, source: "server" }));
}

/** Montos en pesos dentro de los textos que no son ningún precio o promoción registrada. */
export function priceCheck(texts: string[], knownCents: number[]): QaCheck {
  const known = new Set(knownCents);
  const unknown = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g)) {
      const cents = Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
      if (!known.has(cents)) unknown.add(m[0].replace(/\s/g, ""));
    }
  }
  return unknown.size
    ? { id: "prices", label: "Precios", level: "error", detail: `No coinciden con ningún precio registrado: ${[...unknown].join(", ")}.`, source: "server" }
    : { id: "prices", label: "Precios", level: "ok", detail: "Todos los montos coinciden con precios registrados (o no hay montos).", source: "server" };
}

export function dimensionCheck(actual: { width: number | null; height: number | null }, target: { width: number; height: number; label: string }): QaCheck {
  if (!actual.width || !actual.height)
    return { id: "dimensions", label: "Formato y dimensiones", level: "warning", detail: "No se pudieron leer las dimensiones del archivo.", source: "server" };
  const ratioA = actual.width / actual.height;
  const ratioT = target.width / target.height;
  const ratioDiff = Math.abs(ratioA - ratioT) / ratioT;
  if (ratioDiff > 0.02)
    return { id: "dimensions", label: "Formato y dimensiones", level: "warning", detail: `Proporción ${actual.width}×${actual.height}; el formato «${target.label}» pide ${target.width}×${target.height}. Ajústalo con el editor antes de publicar.`, source: "server" };
  if (actual.width < target.width * 0.75)
    return { id: "dimensions", label: "Formato y dimensiones", level: "warning", detail: `Resolución baja (${actual.width}×${actual.height}); se recomienda ${target.width}×${target.height}.`, source: "server" };
  return { id: "dimensions", label: "Formato y dimensiones", level: "ok", detail: `${actual.width}×${actual.height}, adecuado para «${target.label}».`, source: "server" };
}

/** Métricas que el editor mide en el lienzo al exportar. */
export interface CanvasMetrics {
  upscale: number | null;
  logo: { drawnRatio: number; naturalRatio: number } | null;
  blocks: { role: string; fontSize: number; contrast: number; insideSafe: boolean; insideCanvas: boolean }[];
  brightness: { mean: number; std: number };
  print: boolean;
  width: number;
}

export function canvasChecks(m: CanvasMetrics): QaCheck[] {
  const out: QaCheck[] = [];
  if (m.upscale !== null) {
    out.push(
      m.upscale > 2
        ? { id: "resolution", label: "Resolución de la foto", level: "error", detail: `La foto se amplía ${m.upscale.toFixed(1)}×: se verá borrosa. Usa una foto más grande o reduce el zoom.`, source: "browser" }
        : m.upscale > 1.3
          ? { id: "resolution", label: "Resolución de la foto", level: "warning", detail: `La foto se amplía ${m.upscale.toFixed(1)}×: puede perder nitidez.`, source: "browser" }
          : { id: "resolution", label: "Resolución de la foto", level: "ok", detail: "La foto tiene resolución suficiente.", source: "browser" },
    );
  }
  if (m.logo) {
    const err = Math.abs(m.logo.drawnRatio - m.logo.naturalRatio) / m.logo.naturalRatio;
    out.push(
      err > 0.01
        ? { id: "logo_ratio", label: "Logotipo sin deformar", level: "error", detail: `La proporción cambió ${(err * 100).toFixed(1)} %.`, source: "browser" }
        : { id: "logo_ratio", label: "Logotipo sin deformar", level: "ok", detail: "Se conserva la proporción original.", source: "browser" },
    );
  }
  // Legibilidad: en el feed una imagen se ve ~400 px de ancho en el teléfono.
  for (const b of m.blocks) {
    const shown = m.print ? (b.fontSize / 300) * 72 : (b.fontSize * 400) / m.width;
    const unit = m.print ? "pt impresos" : "px en un teléfono";
    const min = m.print ? 10 : 11;
    out.push(
      shown < min * 0.8
        ? { id: `size_${b.role}`, label: `Tamaño del texto (${b.role})`, level: "error", detail: `Se vería a ~${shown.toFixed(0)} ${unit}: demasiado pequeño.`, source: "browser" }
        : shown < min
          ? { id: `size_${b.role}`, label: `Tamaño del texto (${b.role})`, level: "warning", detail: `Se vería a ~${shown.toFixed(0)} ${unit}: en el límite de lo legible.`, source: "browser" }
          : { id: `size_${b.role}`, label: `Tamaño del texto (${b.role})`, level: "ok", detail: `~${shown.toFixed(0)} ${unit}.`, source: "browser" },
    );
    out.push(
      b.contrast < 3
        ? { id: `contrast_${b.role}`, label: `Contraste (${b.role})`, level: "error", detail: `Contraste ${b.contrast.toFixed(1)}:1; se necesita al menos 3:1 (ideal 4.5:1). Sube el velo o cambia el color.`, source: "browser" }
        : b.contrast < 4.5
          ? { id: `contrast_${b.role}`, label: `Contraste (${b.role})`, level: "warning", detail: `Contraste ${b.contrast.toFixed(1)}:1 (ideal 4.5:1).`, source: "browser" }
          : { id: `contrast_${b.role}`, label: `Contraste (${b.role})`, level: "ok", detail: `Contraste ${b.contrast.toFixed(1)}:1.`, source: "browser" },
    );
    if (!b.insideCanvas || !b.insideSafe)
      out.push({ id: `safe_${b.role}`, label: `Zona segura (${b.role})`, level: "error", detail: b.insideCanvas ? "El texto queda donde la interfaz de la red lo tapa." : "El texto se sale del diseño.", source: "browser" });
  }
  if (m.brightness.std < 0.02)
    out.push({ id: "blank", label: "Imagen", level: "warning", detail: "La imagen es casi uniforme: ¿falta la foto de fondo?", source: "browser" });
  else if (m.brightness.mean < 0.06) out.push({ id: "dark", label: "Exposición", level: "warning", detail: "La imagen es muy oscura.", source: "browser" });
  else if (m.brightness.mean > 0.94) out.push({ id: "bright", label: "Exposición", level: "warning", detail: "La imagen está sobreexpuesta.", source: "browser" });
  return out;
}

export function qaStatus(checks: QaCheck[]): "passed" | "passed_with_warnings" | "failed" {
  if (checks.some((c) => c.level === "error")) return "failed";
  if (checks.some((c) => c.level === "warning")) return "passed_with_warnings";
  return "passed";
}

/** Valida las métricas que llegan del navegador (pueden venir manipuladas). */
export function sanitizeMetrics(input: unknown): CanvasMetrics | null {
  if (!input || typeof input !== "object") return null;
  const m = input as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
  const blocks = Array.isArray(m.blocks) ? m.blocks.slice(0, 8) : [];
  const brightness = (m.brightness ?? {}) as Record<string, unknown>;
  const width = num(m.width, 100, 8000);
  if (width === null) return null;
  return {
    upscale: num(m.upscale, 0, 100),
    logo:
      m.logo && typeof m.logo === "object"
        ? { drawnRatio: num((m.logo as Record<string, unknown>).drawnRatio, 0.01, 100) ?? 1, naturalRatio: num((m.logo as Record<string, unknown>).naturalRatio, 0.01, 100) ?? 1 }
        : null,
    blocks: blocks.map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return {
        role: ["headline", "price", "body", "cta"].includes(String(o.role)) ? String(o.role) : "texto",
        fontSize: num(o.fontSize, 1, 2000) ?? 1,
        contrast: num(o.contrast, 1, 21) ?? 1,
        insideSafe: o.insideSafe === true,
        insideCanvas: o.insideCanvas === true,
      };
    }),
    brightness: { mean: num(brightness.mean, 0, 1) ?? 0.5, std: num(brightness.std, 0, 1) ?? 0.2 },
    print: m.print === true,
    width,
  };
}

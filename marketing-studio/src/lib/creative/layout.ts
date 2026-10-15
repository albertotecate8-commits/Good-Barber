// Geometría pura del editor: no depende del navegador, se prueba en Node.
import type { Design } from "./design";
import type { CreativeFormat } from "./formats";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recorte de la imagen de fondo para cubrir el lienzo respetando el punto focal. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number, focusX = 0.5, focusY = 0.5, zoom = 1): Rect {
  const scale = Math.max(dstW / srcW, dstH / srcH) * zoom;
  const w = Math.min(srcW, dstW / scale);
  const h = Math.min(srcH, dstH / scale);
  const x = Math.min(Math.max(focusX * srcW - w / 2, 0), srcW - w);
  const y = Math.min(Math.max(focusY * srcH - h / 2, 0), srcH - h);
  return { x, y, w, h };
}

/** Imagen completa dentro de una caja, sin deformar. */
export function containRect(srcW: number, srcH: number, box: Rect): Rect {
  const scale = Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Cuánto se amplía la imagen de origen al dibujarla (1 = sin ampliar). */
export function upscaleFactor(crop: Rect, dstW: number, dstH: number) {
  return Math.max(dstW / crop.w, dstH / crop.h);
}

export function safeArea(width: number, height: number, safe: CreativeFormat["safe"]): Rect {
  const m = Math.round(width * 0.05);
  return {
    x: Math.max(safe.left, m),
    y: Math.max(safe.top, m),
    w: width - Math.max(safe.left, m) - Math.max(safe.right, m),
    h: height - Math.max(safe.top, m) - Math.max(safe.bottom, m),
  };
}

/** Logotipo: ancho = size_pct del lienzo, alto por proporción (nunca se deforma). */
export function logoRect(logoW: number, logoH: number, design: Pick<Design, "width" | "height" | "logo">, area: Rect): Rect {
  let w = (design.width * design.logo.size_pct) / 100;
  let h = (w * logoH) / logoW;
  const maxH = design.height * 0.22;
  if (h > maxH) {
    h = maxH;
    w = (h * logoW) / logoH;
  }
  const pos = design.logo.position;
  const x = pos.endsWith("left") ? area.x : pos.endsWith("right") ? area.x + area.w - w : area.x + (area.w - w) / 2;
  const y = pos.startsWith("top") ? area.y : area.y + area.h - h;
  return { x, y, w, h };
}

/** Divide un texto en líneas que caben en maxWidth según la función de medida. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // Palabra más ancha que la línea: se corta por caracteres.
      let rest = word;
      while (measure(rest) > maxWidth && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n)) > maxWidth) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

export type Role = "headline" | "price" | "body" | "cta";
export interface TextBlock {
  role: Role;
  lines: string[];
  fontSize: number;
  weight: number;
  lineHeight: number;
  align: "left" | "center";
  color: string;
  /** Caja de fondo (CTA como botón, insignia de precio). */
  box: (Rect & { color: string; radius: number }) | null;
  rect: Rect;
}

export interface Layout {
  area: Rect;
  band: (Rect & { color: string; opacity: number }) | null;
  blocks: TextBlock[];
}

const BASE: Record<Role, { size: number; weight: number }> = {
  headline: { size: 0.074, weight: 800 },
  price: { size: 0.092, weight: 900 },
  body: { size: 0.036, weight: 500 },
  cta: { size: 0.042, weight: 700 },
};

/**
 * Coloca los textos según la plantilla dentro de la zona segura.
 * measure(texto, fontSize, weight) devuelve el ancho en px.
 */
export function layoutDesign(design: Design, format: Pick<CreativeFormat, "safe">, measure: (s: string, size: number, weight: number) => number): Layout {
  const area = safeArea(design.width, design.height, format.safe);
  const ref = Math.min(design.width, design.height * 0.8);
  const align: "left" | "center" = design.template === "minimal" ? "left" : "center";
  const pad = Math.round(ref * 0.035);
  const maxW = area.w - (design.template === "band_bottom" ? pad * 2 : 0);

  const make = (role: Role, text: string): TextBlock | null => {
    if (!text.trim()) return null;
    const fontSize = Math.round(ref * BASE[role].size * design.text_scale);
    const weight = BASE[role].weight;
    const boxed = role === "cta" || (role === "price" && design.template === "price_badge");
    const innerW = boxed ? maxW - fontSize * 1.6 : maxW;
    const lines = wrapText(text.trim(), innerW, (s) => measure(s, fontSize, weight));
    const lineHeight = Math.round(fontSize * 1.15);
    const textW = Math.min(innerW, Math.max(...lines.map((l) => measure(l, fontSize, weight))));
    const h = lines.length * lineHeight;
    const color = boxed ? design.colors.accent_text : role === "price" ? design.colors.accent : design.colors.text;
    return {
      role,
      lines,
      fontSize,
      weight,
      lineHeight,
      align,
      color,
      box: boxed ? { x: 0, y: 0, w: textW + fontSize * 1.6, h: h + fontSize * 0.9, color: design.colors.accent, radius: role === "cta" ? (h + fontSize * 0.9) / 2 : fontSize * 0.4 } : null,
      rect: { x: 0, y: 0, w: boxed ? textW + fontSize * 1.6 : textW, h: boxed ? h + fontSize * 0.9 : h },
    };
  };

  const t = design.texts;
  const blocks = (["headline", "body", "price", "cta"] as Role[]).map((r) => make(r, t[r])).filter((b): b is TextBlock => b !== null);
  const gap = Math.round(ref * 0.025);
  const stackHeight = (bs: TextBlock[]) => bs.reduce((a, b) => a + b.rect.h, 0) + Math.max(0, bs.length - 1) * gap;
  const place = (bs: TextBlock[], top: number) => {
    let y = top;
    for (const b of bs) {
      b.rect.x = align === "center" ? area.x + (area.w - b.rect.w) / 2 : area.x + (design.template === "band_bottom" ? pad : 0);
      b.rect.y = y;
      if (b.box) {
        b.box.x = b.rect.x;
        b.box.y = b.rect.y;
      }
      y += b.rect.h + gap;
    }
  };

  let band: Layout["band"] = null;
  const top = blocks.filter((b) => b.role === "headline" || b.role === "body");
  const bottom = blocks.filter((b) => b.role === "price" || b.role === "cta");
  switch (design.template) {
    case "centered":
      place(blocks, area.y + (area.h - stackHeight(blocks)) / 2);
      break;
    case "headline_top":
    case "price_badge":
      place(top, area.y + (design.logo.asset_id && design.logo.position.startsWith("top") ? design.height * 0.12 : 0));
      place(bottom, area.y + area.h - stackHeight(bottom));
      break;
    case "minimal":
      place(blocks, area.y + area.h - stackHeight(blocks));
      break;
    default: {
      const h = stackHeight(blocks) + pad * 2;
      band = { x: area.x, y: area.y + area.h - h, w: area.w, h, color: design.overlay.color, opacity: Math.max(0.55, design.overlay.opacity) };
      place(blocks, band.y + pad);
    }
  }
  return { area, band, blocks };
}

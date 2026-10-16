// Dibuja un diseño en un <canvas> del navegador. Es edición por código: no hay
// IA. La misma función sirve para la vista previa y para exportar a tamaño real.
import type { Design } from "./design";
import type { CreativeFormat } from "./formats";
import { containRect, coverCrop, layoutCollisions, layoutDesign, logoRect, upscaleFactor, type Layout, type Rect } from "./layout";
import { contrastRatio, hexToRgb } from "./color";
import { canvasFontStack, effectiveWeight } from "./fonts";
import type { CanvasMetrics } from "./qa";

export type ImageMap = Map<string, HTMLImageElement>;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.min(radius, r.h / 2, r.w / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

function averageColor(ctx: CanvasRenderingContext2D, r: Rect, W: number, H: number): [number, number, number] {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const w = Math.max(1, Math.min(W - x, Math.ceil(r.w)));
  const h = Math.max(1, Math.min(H - y, Math.ceil(r.h)));
  const data = ctx.getImageData(x, y, w, h).data;
  const step = Math.max(4, Math.floor(data.length / 4 / 4000) * 4);
  let r0 = 0, g0 = 0, b0 = 0, n = 0;
  for (let i = 0; i < data.length; i += step) {
    r0 += data[i];
    g0 += data[i + 1];
    b0 += data[i + 2];
    n++;
  }
  return [r0 / n, g0 / n, b0 / n];
}

export function drawDesign(
  ctx: CanvasRenderingContext2D,
  design: Design,
  format: CreativeFormat,
  images: ImageMap,
  fontFamily: string,
  opts: { measureMetrics: boolean } = { measureMetrics: false },
): { layout: Layout; metrics: CanvasMetrics | null } {
  const { width: W, height: H } = design;
  ctx.save();
  ctx.fillStyle = design.background.color;
  ctx.fillRect(0, 0, W, H);

  let upscale: number | null = null;
  const bg = design.background.asset_id ? images.get(design.background.asset_id) : undefined;
  if (bg) {
    const iw = bg.naturalWidth;
    const ih = bg.naturalHeight;
    if (design.background.fit === "cover") {
      const c = coverCrop(iw, ih, W, H, design.background.focus_x, design.background.focus_y, design.background.zoom);
      ctx.drawImage(bg, c.x, c.y, c.w, c.h, 0, 0, W, H);
      upscale = upscaleFactor(c, W, H);
    } else {
      const r = containRect(iw, ih, { x: 0, y: 0, w: W, h: H });
      ctx.drawImage(bg, r.x, r.y, r.w, r.h);
      upscale = r.w / iw;
    }
  }
  if (design.overlay.opacity > 0) {
    ctx.globalAlpha = design.overlay.opacity;
    ctx.fillStyle = design.overlay.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Títulos, precio y botón usan la tipografía de títulos; el texto secundario, la de texto.
  const fontFor = (role: string, size: number, weight: number) => {
    const key = role === "body" ? design.fonts.body : design.fonts.heading;
    return `${effectiveWeight(key, weight)} ${size}px ${canvasFontStack(key, fontFamily)}`;
  };
  const measure = (s: string, size: number, weight: number, role: string) => {
    ctx.font = fontFor(role, size, weight);
    return ctx.measureText(s).width;
  };
  const layout = layoutDesign(design, format, measure);
  if (layout.band) {
    ctx.globalAlpha = layout.band.opacity;
    ctx.fillStyle = layout.band.color;
    ctx.fillRect(layout.band.x, layout.band.y, layout.band.w, layout.band.h);
    ctx.globalAlpha = 1;
  }

  let logoMetric: CanvasMetrics["logo"] = null;
  let logoBox: ReturnType<typeof logoRect> | null = null;
  const logo = design.logo.asset_id ? images.get(design.logo.asset_id) : undefined;
  if (logo) {
    const r = logoRect(logo.naturalWidth || 1, logo.naturalHeight || 1, design, layout.area);
    logoBox = r;
    ctx.drawImage(logo, r.x, r.y, r.w, r.h);
    logoMetric = { drawnRatio: r.w / r.h, naturalRatio: (logo.naturalWidth || 1) / (logo.naturalHeight || 1) };
  }

  // Fondo debajo de cada texto, medido ANTES de dibujar el texto.
  const backgrounds = opts.measureMetrics ? layout.blocks.map((b) => (b.box ? hexToRgb(b.box.color) : averageColor(ctx, b.rect, W, H))) : [];

  for (const b of layout.blocks) {
    if (b.box) {
      ctx.fillStyle = b.box.color;
      roundRect(ctx, b.box, b.box.radius);
      ctx.fill();
    }
    ctx.fillStyle = b.color;
    ctx.font = fontFor(b.role, b.fontSize, b.weight);
    ctx.textBaseline = "top";
    ctx.textAlign = b.align === "center" || b.box ? "center" : "left";
    const x = b.box || b.align === "center" ? b.rect.x + b.rect.w / 2 : b.rect.x;
    const top = b.box ? b.rect.y + b.fontSize * 0.45 : b.rect.y;
    b.lines.forEach((line, i) => ctx.fillText(line, x, top + i * b.lineHeight + (b.lineHeight - b.fontSize) / 2));
  }
  ctx.restore();
  if (!opts.measureMetrics) return { layout, metrics: null };

  // Exposición: muestreo en rejilla de todo el diseño.
  const step = Math.max(8, Math.floor(Math.min(W, H) / 60));
  const lum: number[] = [];
  const all = ctx.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      lum.push((0.2126 * all[i] + 0.7152 * all[i + 1] + 0.0722 * all[i + 2]) / 255);
    }
  const mean = lum.reduce((a, v) => a + v, 0) / lum.length;
  const std = Math.sqrt(lum.reduce((a, v) => a + (v - mean) ** 2, 0) / lum.length);
  const safe = { l: format.safe.left, t: format.safe.top, r: W - format.safe.right, b: H - format.safe.bottom };
  const collisions = layoutCollisions(layout, logoBox);

  return {
    layout,
    metrics: {
      upscale,
      logo: logoMetric,
      blocks: layout.blocks.map((b, i) => ({
        role: b.role,
        fontSize: b.fontSize,
        contrast: contrastRatio(hexToRgb(b.color), backgrounds[i]),
        insideCanvas: b.rect.x >= 0 && b.rect.y >= 0 && b.rect.x + b.rect.w <= W + 0.5 && b.rect.y + b.rect.h <= H + 0.5,
        insideSafe: b.rect.x >= safe.l - 0.5 && b.rect.y >= safe.t - 0.5 && b.rect.x + b.rect.w <= safe.r + 0.5 && b.rect.y + b.rect.h <= safe.b + 0.5,
        brokenWord: b.brokenWord,
        overlapsText: collisions[i].overlapsText,
        overlapsLogo: collisions[i].overlapsLogo,
      })),
      brightness: { mean, std },
      print: format.platform === "print",
      width: W,
    },
  };
}

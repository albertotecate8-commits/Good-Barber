export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa WCAG (0–1). */
export function luminance([r, g, b]: [number, number, number]) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Razón de contraste WCAG entre dos colores (1–21). */
export function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Mezcla un color sobre otro con una opacidad (para el velo y la franja). */
export function blend(top: [number, number, number], bottom: [number, number, number], alpha: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(top[i] * alpha + bottom[i] * (1 - alpha))) as [number, number, number];
}

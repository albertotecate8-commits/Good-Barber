// Análisis MEDIDO de una imagen de referencia, con sus píxeles (sin IA y sin
// costo). Calcula solo lo que se puede medir: paleta dominante, luminosidad,
// contraste, saturación, temperatura de color, proporción, zona de mayor
// detalle (foco visual) y espacio libre. La tipografía, el estilo o la oferta
// NO se pueden medir así: esos los interpreta la persona.
import type { Measured } from "./styles";

export interface Pixels {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function saturationOf(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Proporción legible: 1080×1350 → «4:5». Si no es exacta, la más cercana conocida. */
export function aspectLabel(w: number, h: number): string {
  const known: [string, number][] = [["1:1", 1], ["4:5", 0.8], ["9:16", 0.5625], ["16:9", 16 / 9], ["3:4", 0.75], ["4:3", 4 / 3], ["2:3", 2 / 3], ["3:2", 1.5], ["1.91:1", 1.91]];
  const r = w / h;
  const best = known.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a));
  if (Math.abs(best[1] - r) < 0.02) return best[0];
  const g = gcd(w, h);
  return `${w / g}:${h / g}`.length <= 9 ? `${w / g}:${h / g}` : `≈${best[0]}`;
}

/** k-means determinista (inicio por cuantiles de luminosidad) sobre una muestra de píxeles. */
export function palette(samples: [number, number, number][], k = 5, iterations = 12): { hex: string; share: number }[] {
  if (!samples.length) return [];
  const sorted = [...samples].sort((a, b) => lum(...a) - lum(...b));
  let centers = Array.from({ length: Math.min(k, sorted.length) }, (_, i) => [...sorted[Math.floor(((i + 0.5) * sorted.length) / k)]] as [number, number, number]);
  let assign = new Array<number>(samples.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    assign = samples.map((p) => {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      return best;
    });
    centers = centers.map((c, j) => {
      const members = samples.filter((_, i) => assign[i] === j);
      if (!members.length) return c;
      return [0, 1, 2].map((ch) => members.reduce((s, m) => s + m[ch], 0) / members.length) as [number, number, number];
    });
  }
  const counts = centers.map((_, j) => assign.filter((a) => a === j).length);
  // Une colores casi iguales (distancia < 24) para no repetir tonos.
  const merged: { rgb: [number, number, number]; n: number }[] = [];
  centers.forEach((c, j) => {
    if (!counts[j]) return;
    const near = merged.find((m) => Math.hypot(m.rgb[0] - c[0], m.rgb[1] - c[1], m.rgb[2] - c[2]) < 24);
    if (near) near.n += counts[j];
    else merged.push({ rgb: c, n: counts[j] });
  });
  return merged
    .sort((a, b) => b.n - a.n)
    .map((m) => ({ hex: hex(...m.rgb), share: Math.round((m.n / samples.length) * 100) / 100 }));
}

function focusLabel(cx: number, cy: number) {
  const col = cx < 0.4 ? "izquierda" : cx > 0.6 ? "derecha" : "centro";
  const row = cy < 0.4 ? "arriba" : cy > 0.6 ? "abajo" : "";
  if (col === "centro" && !row) return "centro";
  return [row, col === "centro" ? "al centro" : col].filter(Boolean).join(", ");
}

/** Mide la imagen. Usa como máximo ~40 000 píxeles para que sea instantáneo en el teléfono. */
export function analyzePixels(img: Pixels): Measured {
  const { data, width, height } = img;
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 40000)));
  const gw = Math.ceil(width / step);
  const gh = Math.ceil(height / step);
  const L = new Float32Array(gw * gh);
  const samples: [number, number, number][] = [];
  let sumL = 0;
  let sumS = 0;
  let warm = 0;
  let n = 0;
  for (let y = 0, gy = 0; y < height; y += step, gy++) {
    for (let x = 0, gx = 0; x < width; x += step, gx++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = lum(r, g, b);
      L[gy * gw + gx] = l;
      sumL += l;
      sumS += saturationOf(r, g, b);
      warm += r - b;
      n++;
      if ((gx + gy) % 2 === 0) samples.push([r, g, b]);
    }
  }
  const meanL = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (L[i] - meanL) ** 2;
  const std = Math.sqrt(varL / n);

  // Detalle (gradiente) por celda: el foco visual es su centro de masa; el espacio libre, las celdas planas.
  let gx = 0;
  let gy = 0;
  let gsum = 0;
  let flat = 0;
  let cells = 0;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const dx = L[y * gw + x + 1] - L[y * gw + x - 1];
      const dy = L[(y + 1) * gw + x] - L[(y - 1) * gw + x];
      const m = Math.hypot(dx, dy);
      cells++;
      if (m < 6) flat++;
      gx += m * (x / gw);
      gy += m * (y / gh);
      gsum += m;
    }
  }
  const cx = gsum ? gx / gsum : 0.5;
  const cy = gsum ? gy / gsum : 0.5;
  const avgWarm = warm / n;
  return {
    palette: palette(samples),
    brightness: Math.round((meanL / 255) * 100),
    contrast: Math.min(100, Math.round((std / 128) * 100)),
    saturation: Math.round((sumS / n) * 100),
    temperature: avgWarm > 12 ? "cálida" : avgWarm < -12 ? "fría" : "neutra",
    aspect: aspectLabel(width, height),
    focus: focusLabel(cx, cy),
    negativeSpace: cells ? Math.round((flat / cells) * 100) : 0,
    width,
    height,
  };
}

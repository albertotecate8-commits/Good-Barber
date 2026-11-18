// Línea de tiempo del short "Dos vecinos" (Afore Pro, retiro por desempleo). Todo se sincroniza con palabras.json
// (tiempos por palabra de la voz). Gramática de cámara de la skill: la cámara nunca se queda quieta (acercamiento
// lento en cada pausa), deslizamientos smootherstep de 18-40 cuadros; al cambiar de lugar, destello de 4 cuadros.
import PAL from "./palabras.json";

export const FPS = 30;
export type V3 = [number, number, number];
export const WORDS = PAL.words as { w: string; s: number; e: number }[];
export const TOTAL = Math.round(PAL.dur * FPS);
/** cuadro donde empieza la palabra i */
export const W = (i: number) => Math.round(WORDS[i].s * FPS);
export const WE = (i: number) => Math.round(WORDS[i].e * FPS);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const smoother = (x: number) => { const u = clamp01(x); return u * u * u * (u * (6 * u - 15) + 10); };
/** pop de caricatura: 0 -> 1.12 -> 1 en n cuadros */
export const pop = (f: number, f0: number, n = 8) => { const u = (f - f0) / n; if (u <= 0) return 0; if (u >= 1.6) return 1; return u < 1 ? 1.12 * smoother(u) : 1.12 - 0.12 * smooth((u - 1) / 0.6); };

// Palabras clave (cuadro de inicio), de palabras.json:
// Dos 2 · uno 77 · hasta 91 · treinta 97 · el otro 176 · casi 192 · nada 200 · Ramiro 214 · fábrica 272 · Toño 289 · renta 318 ·
// Ramiro 333 · renta 358 · gas 378 · luz 396 · perro 416 · Ninguno 431 · Afore 457 · dinero 468 · Toño 522 · trámite 538 ·
// sale 574 · poquito 581 · Ramiro 598 · CURP 620 · WhatsApp 632 · Afore Pro 645 · gratis 708 · Espera 727 · qué 743 ·
// Mismo 754 · más 812 · Fíjate 826 · declaración 911 · bien 964 · regresan 977 · Afore Pro 1005 · máximo 1063 ·
// treinta 1102 · Solo 1152 · IMSS 1204 · cien 1235 · cinco 1273 · y no darte 1345 · Unos 1406 · Ramiro 1455 · perro 1504 ·
// Toño 1518 · prestó 1552 · Pide 1577 · WhatsApp 1636 · seis 1647 ... siete 1769

// ---------------- lugares ----------------
export const SALA_X = 300, OFI_X = 600;
export const SPOT = { // posiciones de los personajes (pies)
  hookR: [-0.8, 0, 0] as V3, hookT: [0.8, 0, 0] as V3,
  fabR: [-5.6, 0, -38.9] as V3, fabT: [-5.6, 0, -40.7] as V3, perroFab: [-4.9, 0, -38.2] as V3,
  cochinito: [-8.7, 0, -43.2] as V3,
  tonoFila: [6.9, 0, 30.6] as V3,
  salaR: [SALA_X, 0.0, -1.7] as V3, salaPerro: [SALA_X + 1.25, 0, -0.9] as V3,
  pA: [OFI_X - 4.6, 0, -0.4] as V3, pB: [OFI_X - 3.4, 0, -0.4] as V3,
  asesora: [OFI_X + 2.6, 0, -1.6] as V3, ofiR: [OFI_X + 1.2, 0, 0.3] as V3,
};
export const REQ_X = [OFI_X + 5.0, OFI_X + 6.6, OFI_X + 8.2, OFI_X + 9.8];

// ---------------- tomas y cámara ----------------
type Key = { f: number; pos: V3; look: V3; fov?: number; roll?: number; glide?: boolean };
export type Shot = { a: number; b: number; light: "day" | "golden"; keys: Key[] };
const T0 = 207, T1 = 518, T2 = 595, T3 = 720, T4 = 820, T5 = 1403; // cambios de lugar (destello)
export const SHOTS: Shot[] = [
  // 1. Gancho: los dos vecinos; a Ramiro le llueven billetes, a Toño le cae una moneda
  { a: 0, b: T0, light: "day", keys: [
    { f: 0, pos: [0, 1.62, 6.6], look: [0, 1.32, 0], fov: 40 },
    { f: 74, pos: [0, 1.58, 5.6], look: [0, 1.32, 0] },
    { f: 98, pos: [-1.9, 1.5, 3.9], look: [-0.75, 1.55, 0], glide: true },
    { f: 170, pos: [-1.65, 1.5, 3.45], look: [-0.75, 1.55, 0] },
    { f: 196, pos: [1.75, 1.45, 3.7], look: [0.75, 1.25, 0], roll: -0.02, glide: true },
    { f: T0, pos: [1.68, 1.44, 3.55], look: [0.75, 1.25, 0], roll: -0.02 },
  ] },
  // 2-3. La fábrica; las preocupaciones; el cochinito gigante de la Afore detrás de ellos
  { a: T0, b: T1, light: "day", keys: [
    { f: T0, pos: [-0.6, 2.1, -35.2], look: [-8.5, 2.7, -41.2], fov: 46 },
    { f: 278, pos: [-1.5, 1.9, -36.4], look: [-8.5, 2.3, -41.0], fov: 46 },
    { f: 300, pos: [-2.0, 1.55, -42.3], look: [-5.6, 1.6, -40.6], fov: 42, glide: true },
    { f: 326, pos: [-2.3, 1.55, -42.1], look: [-5.6, 1.6, -40.6] },
    { f: 348, pos: [-1.9, 1.6, -36.6], look: [-5.6, 1.62, -39.2], glide: true },
    { f: 424, pos: [-2.35, 1.6, -36.9], look: [-5.6, 1.66, -39.2] },
    { f: 462, pos: [1.6, 3.6, -33.8], look: [-8.2, 2.4, -40.2], fov: 50, glide: true },
    { f: T1, pos: [1.2, 3.75, -34.2], look: [-8.2, 2.5, -40.2], fov: 50 },
  ] },
  // 4. Toño en la fila: la cámara corre a lo largo de la fila hasta él, con su sobre flaquito
  { a: T1, b: T2, light: "day", keys: [
    { f: T1, pos: [3.0, 1.7, 14.5], look: [7.2, 1.5, 19], fov: 42 },
    { f: 566, pos: [3.9, 1.55, 27.4], look: [6.9, 1.4, 30.6], glide: true },
    { f: T2, pos: [4.25, 1.5, 28.0], look: [6.9, 1.35, 30.6] },
  ] },
  // 5. Ramiro en su sala con el celular; le llega la palomita
  { a: T2, b: T3, light: "day", keys: [
    { f: T2, pos: [SALA_X - 1.0, 1.5, 3.6], look: [SALA_X + 0.2, 0.85, -1.6], fov: 42 },
    { f: 690, pos: [SALA_X - 0.45, 1.3, 2.35], look: [SALA_X + 0.2, 0.85, -1.6], glide: true },
    { f: T3, pos: [SALA_X - 0.35, 1.27, 2.15], look: [SALA_X + 0.25, 0.85, -1.6] },
  ] },
  // 6. Espera... ¿qué? Los dos con sus sobres; la cámara gira alrededor
  { a: T3, b: T4, light: "day", keys: [
    { f: T3, pos: [0, 1.5, 7.4], look: [0, 1.25, 0], fov: 40 },
    { f: 744, pos: [0, 1.45, 6.1], look: [0, 1.3, 0], glide: true },
    { f: 752, pos: [0, 1.45, 6.0], look: [0, 1.3, 0], roll: 0.07, glide: true },
    { f: 790, pos: [-3.3, 1.5, 5.0], look: [0, 1.3, 0], roll: 0.0, glide: true },
    { f: T4, pos: [-3.6, 1.5, 4.8], look: [0.1, 1.3, 0] },
  ] },
  // 7-9. Fíjate: la declaración; luego Afore Pro y los requisitos en la oficina
  { a: T4, b: T5, light: "day", keys: [
    { f: T4, pos: [OFI_X - 4.0, 1.6, 6.4], look: [OFI_X - 4.0, 1.3, -0.4], fov: 42 },
    { f: 990, pos: [OFI_X - 4.0, 1.5, 5.0], look: [OFI_X - 4.0, 1.3, -0.4] },
    { f: 1024, pos: [OFI_X + 0.4, 1.6, 4.3], look: [OFI_X + 1.9, 1.4, -0.6], glide: true },
    { f: 1140, pos: [OFI_X + 0.8, 1.55, 3.6], look: [OFI_X + 1.9, 1.4, -0.6] },
    { f: 1170, pos: [OFI_X + 4.7, 1.0, 3.3], look: [REQ_X[0], 0.72, 0], fov: 42, glide: true },
    { f: 1210, pos: [OFI_X + 4.85, 0.98, 3.05], look: [REQ_X[0] + 0.1, 0.72, 0] },
    { f: 1236, pos: [OFI_X + 6.3, 1.0, 3.3], look: [REQ_X[1], 0.72, 0], glide: true },
    { f: 1266, pos: [OFI_X + 6.45, 0.98, 3.05], look: [REQ_X[1] + 0.1, 0.72, 0] },
    { f: 1292, pos: [OFI_X + 7.9, 1.0, 3.3], look: [REQ_X[2], 0.72, 0], glide: true },
    { f: 1336, pos: [OFI_X + 8.05, 0.98, 3.05], look: [REQ_X[2] + 0.1, 0.72, 0] },
    { f: 1366, pos: [OFI_X + 7.4, 1.5, 9.6], look: [REQ_X[1] + 0.8, 0.8, 0], fov: 46, glide: true },
    { f: T5, pos: [OFI_X + 7.4, 1.5, 9.1], look: [REQ_X[1] + 0.8, 0.8, 0], fov: 46 },
  ] },
  // 10-11. 45 días después, al atardecer; luego la cámara sube para el cierre
  { a: T5, b: TOTAL + 1, light: "golden", keys: [
    { f: T5, pos: [0.3, 1.45, 5.8], look: [0, 1.25, 0], fov: 40 },
    { f: 1500, pos: [0.15, 1.42, 4.8], look: [0, 1.25, 0] },
    { f: 1530, pos: [1.4, 1.45, 3.6], look: [0.4, 1.3, 0], glide: true },
    { f: 1566, pos: [1.25, 1.45, 3.3], look: [0.3, 1.3, 0] },
    { f: 1640, pos: [0, 3.2, 9.5], look: [0, 4.2, -30], fov: 46, glide: true },
    { f: TOTAL + 1, pos: [0, 4.0, 11.5], look: [0, 5.5, -30], fov: 46 },
  ] },
];
export const FLASHES = SHOTS.slice(1).map((s) => s.a);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const shotAt = (f: number) => { let i = 0; for (let k = 0; k < SHOTS.length; k++) if (f >= SHOTS[k].a) i = k; return i; };
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
export const camAt = (f: number): Cam => {
  const k = SHOTS[shotAt(f)].keys;
  const fill = (q: Key, p?: Key) => ({ fov: q.fov ?? p?.fov ?? 40, roll: q.roll ?? 0 });
  // fov hereda de la llave anterior
  const fovs: number[] = []; k.forEach((q, i) => fovs.push(q.fov ?? (i ? fovs[i - 1] : 40)));
  if (f <= k[0].f) return { pos: k[0].pos, look: k[0].look, fov: fovs[0], roll: k[0].roll ?? 0 };
  for (let i = 1; i < k.length; i++) if (f <= k[i].f) {
    const u = (f - k[i - 1].f) / (k[i].f - k[i - 1].f), t = k[i].glide ? smoother(u) : u;
    return { pos: lerp3(k[i - 1].pos, k[i].pos, t), look: lerp3(k[i - 1].look, k[i].look, t), fov: lerp(fovs[i - 1], fovs[i], t), roll: lerp(k[i - 1].roll ?? 0, k[i].roll ?? 0, t) };
  }
  const l = k[k.length - 1]; void fill;
  return { pos: l.pos, look: l.look, fov: fovs[k.length - 1], roll: l.roll ?? 0 };
};
/** destello blanco de 4 cuadros en cada cambio de lugar (opacidad 0..1) */
export const flashAt = (f: number) => { for (const a of FLASHES) { const d = f - a; if (d >= -2 && d <= 2) return [0.35, 0.85, 1, 0.7, 0.25][d + 2]; } return 0; };
export const lightAt = (f: number) => SHOTS[shotAt(f)].light;

/** desenfoque: foco en los ojos de quien importa; tomas abiertas casi sin desenfoque */
export const dofAt = (f: number): { focus: V3; cInf: number } => {
  const s = shotAt(f);
  if (s === 0) return { focus: f < 80 ? [0, 1.5, 0] : f < 180 ? [-0.8, 1.6, 0] : [0.8, 1.5, 0], cInf: f < 80 ? 9 : 12 };
  if (s === 1) {
    if (f < 290) return { focus: [-5.6, 1.6, -40], cInf: 3 };
    if (f < 455) return { focus: f < 335 ? [-5.6, 1.5, -40.7] : [-5.6, 1.6, -38.9], cInf: 12 };
    return { focus: [-7.5, 2, -40], cInf: 3 };
  }
  if (s === 2) return { focus: f < 550 ? [7, 1.5, 22] : [6.9, 1.5, 30.6], cInf: 11 };
  if (s === 3) return { focus: [SALA_X, 1.05, -1.7], cInf: 13 };
  if (s === 4) return { focus: [0, 1.5, 0], cInf: 11 };
  if (s === 5) {
    if (f < 1005) return { focus: [OFI_X - 4, 1.5, -0.4], cInf: 11 };
    if (f < 1160) return { focus: [OFI_X + 1.9, 1.5, -0.6], cInf: 11 };
    const i = f < 1225 ? 0 : f < 1280 ? 1 : f < 1350 ? 2 : 3;
    if (f > 1360) return { focus: [REQ_X[1] + 0.8, 0.7, 0.2], cInf: 5 };
    return { focus: [REQ_X[i], 0.7, 0.2], cInf: f > 1360 ? 5 : 10 };
  }
  if (f < 1600) return { focus: f < 1520 ? [-0.6, 1.4, 0] : [0.6, 1.4, 0], cInf: 11 };
  return { focus: [0, 3, -20], cInf: lerp(11, 2, smooth((f - 1600) / 40)) };
};

// ---------------- quién aparece y cómo (sprites planos) ----------------
export type SpriteKind = "ramiro" | "tono" | "asesora" | "pA" | "pB" | "fila" | "perro" | "idea" | "check" | "req";
export type Sprite = {
  id: string; kind: SpriteKind; pos: V3; scale?: number; side?: number; // side: corrimiento a la derecha de la cámara (m)
  expr?: string; wave?: number; tilt?: number; headTilt?: number; blink?: number; facing?: -1 | 0 | 1; mode?: "stand" | "sit" | "stroll"; phase?: number;
  hold?: string; arg?: string | number; k?: number;
};
const blinkAt = (seed: number, f: number) => {
  let t0 = 10 + seed * 7;
  while (t0 < f) { const d = f - t0; if (d < 4) return [0.5, 1, 1, 0.5][d]; t0 += 30 + ((t0 * 37 + seed * 13) % 45); }
  return 0;
};
const sway = (f: number, ph: number) => Math.round(3 * Math.sin(f / 22 + ph));
/** la voz no es de los personajes (narrador): bocas cerradas; la cara cuenta la emoción */
export const spritesAt = (f: number): Sprite[] => {
  const s = shotAt(f), out: Sprite[] = [];
  const R = (pos: V3, e: Partial<Sprite>) => out.push({ id: "ramiro", kind: "ramiro", pos, blink: blinkAt(1, f), headTilt: sway(f, 0), facing: 1, expr: "neutral", ...e });
  const T = (pos: V3, e: Partial<Sprite>) => out.push({ id: "tono", kind: "tono", pos, blink: blinkAt(4, f), headTilt: sway(f, 2), facing: -1, expr: "neutral", ...e });
  if (s === 0) {
    R(SPOT.hookR, { expr: f < W(13) - 2 ? "smile" : f < 140 ? "laugh" : "grin", wave: f >= W(13) ? 0.7 + 0.3 * Math.abs(Math.sin(f / 5)) : undefined });
    T(SPOT.hookT, { expr: f < W(26) ? "neutral" : f < W(29) + 6 ? "worry1" : "pained", tilt: f > W(29) ? 3 : 0, hold: f >= W(30) ? "sobre" : undefined, arg: 0 });
  } else if (s === 1) {
    // salen de la fábrica caminando con su caja (hasta el cuadro 270), luego se quedan parados
    const walk = smooth((f - T0) / 63), gate = -9.3;
    const rx = gate + (SPOT.fabR[0] - gate) * walk, tx = gate + (SPOT.fabT[0] - gate) * walk;
    const walking = f < T0 + 63;
    R([rx, 0, SPOT.fabR[2]], { mode: walking ? "stroll" : "stand", phase: (f / 16) % 1, hold: "caja",
      expr: f < W(46) ? "neutral" : f < W(56) ? (f < W(50) ? "worry1" : "worry2") : "worry3", tilt: f > W(56) ? -2 : 0 });
    T([tx, 0, SPOT.fabT[2]], { mode: walking ? "stroll" : "stand", phase: (f / 16 + 0.5) % 1, hold: "caja", expr: f < W(42) ? "neutral" : "worry1" });
    // nubes de pensamiento (una por personaje; la de Ramiro se va llenando)
    if (f >= W(45) - 2 && f < 345) out.push({ id: "ideaT", kind: "idea", pos: [SPOT.fabT[0], 1.38, SPOT.fabT[2]], side: -0.62, scale: 0.42, arg: "renta", k: pop(f, W(45) - 2) * (1 - smooth((f - 334) / 8)) });
    const ideas: [string, number][] = [["renta", W(49)], ["gas", W(51)], ["luz", W(53)], ["perro", W(56)]];
    const n = ideas.filter(([, f0]) => f >= f0 - 2).length;
    if (n > 0 && f < 470) out.push({ id: "ideaR", kind: "idea", pos: [SPOT.fabR[0], 1.4, SPOT.fabR[2]], side: 0.62, scale: 0.42,
      arg: ideas.slice(0, n).map((x) => x[0]).join(","), k: pop(f, W(49) - 2) * (1 - smooth((f - 455) / 10)) });
    if (f >= W(56) - 3) out.push({ id: "perro", kind: "perro", pos: SPOT.perroFab, scale: 0.7, expr: "mira", k: pop(f, W(56) - 3, 7) });
  } else if (s === 2) {
    for (let i = 0; i < 8; i++) out.push({ id: "fila" + i, kind: "fila", arg: i, pos: [6.9 + 0.15 * Math.sin(i * 2.1), 0, 28.9 - i * 1.45], facing: 0,
      expr: ["neutral", "nervous", "dazed", "neutral", "stern", "neutral", "nervous", "dazed"][i], blink: blinkAt(i + 6, f), headTilt: sway(f, i) });
    T(SPOT.tonoFila, { expr: f < W(78) ? "neutral" : f < W(79) ? "shock" : "pained", hold: f >= W(77) - 2 ? "sobre" : undefined, arg: 0, tilt: f > W(79) ? 2 : 0, facing: 0 });
  } else if (s === 3) {
    R(SPOT.salaR, { mode: "sit", hold: "celular", arg: f >= W(95) - 3 ? 1 : 0, expr: f < W(91) ? "neutral" : f < W(95) ? "smile" : "grin", facing: 0 });
    out.push({ id: "perro", kind: "perro", pos: SPOT.salaPerro, scale: 0.7, expr: f > W(95) ? "feliz" : "mira", k: 1 });
    if (f >= W(95) - 3) out.push({ id: "check", kind: "check", pos: [SALA_X + 0.62, 0.95, -1.45], scale: 0.3, k: pop(f, W(95) - 3, 7) });
  } else if (s === 4) {
    R(SPOT.hookR, { hold: "sobre", arg: 1, expr: "smile_closed" });
    T(SPOT.hookT, { hold: "sobre", arg: 0, expr: f < W(97) ? "neutral" : f < W(98) + 10 ? "shock" : "dazed",
      wave: f >= W(98) ? 0.9 + 0.1 * Math.sin(f / 3) : undefined, headTilt: f >= W(98) ? -6 : sway(f, 2) });
  } else if (s === 5) {
    // la declaración: los dos con la misma hoja; al que la hace bien le regresan más
    const reg = f >= W(127) - 2;
    out.push({ id: "pA", kind: "pA", pos: SPOT.pA, expr: reg ? "grin" : "neutral", hold: reg ? "sobre" : "hoja", arg: 1, blink: blinkAt(8, f), facing: 1 });
    out.push({ id: "pB", kind: "pB", pos: SPOT.pB, expr: reg ? "worry1" : "neutral", hold: reg ? "sobre" : "hoja", arg: 0.05, blink: blinkAt(9, f), facing: -1 });
    out.push({ id: "asesora", kind: "asesora", pos: SPOT.asesora, expr: f < W(131) ? "smile" : "smile_closed", blink: blinkAt(3, f), facing: -1,
      wave: f >= W(150) && f < W(152) + 30 ? 1 : undefined, headTilt: sway(f, 5) });
    R(SPOT.ofiR, { expr: f < W(138) ? "neutral" : "smile", facing: 1 });
    const reqs: [string, number][] = [["imss", W(152)], ["semanas", W(160)], ["anios", W(165)], ["pausa", W(174)]];
    reqs.forEach(([n, f0], i) => { if (f >= f0 - 3) out.push({ id: "req" + i, kind: "req", pos: [REQ_X[i], 0.12, 0.2], scale: 0.85, arg: n, k: pop(f, f0 - 3, 8) }); });
  } else {
    const lend = f >= W(199);
    R(SPOT.hookR, { expr: f < W(188) ? "smile" : "laugh", hold: lend ? "billetes" : "correa", facing: 1 });
    T(SPOT.hookT, { expr: f < W(197) ? "nervous" : lend ? "grin" : "relief", tilt: lend ? -2 : 0 });
    out.push({ id: "perro", kind: "perro", pos: [-0.25, 0, 0.55], scale: 0.7, expr: "feliz", k: 1, arg: Math.sin(f / 3) });
  }
  return out;
};

// ---------------- billetes del gancho y la moneda de Toño ----------------
export const BILLS = 140;
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
export const billAt = (i: number, f: number) => {
  const t0 = W(13) - 4 + rnd(i, 1) * 85, dt = (f - t0) / FPS;
  if (dt < 0 || f >= T0) return null;
  const x = SPOT.hookR[0] + (rnd(i, 2) - 0.5) * 1.9, z = (rnd(i, 3) - 0.5) * 1.4, y0 = 3.4 + rnd(i, 4) * 1.2;
  const y = Math.max(0.02 + 0.004 * (i % 5), y0 - 1.25 * dt);
  const land = y <= 0.03 + 0.004 * (i % 5);
  const sw = land ? 0 : Math.sin(dt * 5 + i) * 0.18;
  return { pos: [x + sw, y, z] as V3, rot: land ? [-Math.PI / 2, 0, rnd(i, 6) * 6] as V3 : [-1.2 + Math.sin(dt * 6 + i) * 0.7, rnd(i, 6) * 6 + dt, Math.sin(dt * 4 + i * 2) * 0.6] as V3 };
};
/** la moneda solitaria de Toño: cae en "casi nada" y rebota en el suelo */
export const coinAt = (f: number): V3 | null => {
  const t0 = W(28) - 4; if (f < t0 || f >= T0) return null;
  const dt = (f - t0) / FPS, g = 9.8, y0 = 2.6, tl = Math.sqrt((2 * y0) / g);
  if (dt < tl) return [SPOT.hookT[0] - 0.25, y0 - 0.5 * g * dt * dt, 0.45];
  const b = dt - tl, v = 1.6;
  const y = Math.max(0, v * b - 0.5 * g * b * b);
  return [SPOT.hookT[0] - 0.25, 0.02 + y, 0.45];
};
/** el cochinito gigante de la Afore detrás de ellos: aparece en "Afore" */
export const cochinitoK = (f: number) => (f >= W(62) - 6 && f < T1 ? pop(f, W(62) - 6, 12) : 0);

// ---------------- textos discretos arriba del cuadro (sin tapar a nadie) ----------------
export const CIFRAS = [
  { a: W(13), b: T0 - 4, big: "hasta $35,193", sub: "retiro por desempleo de tu Afore" },
  { a: W(143), b: W(150) - 4, big: "30%", sub: "de lo que retires (honorarios)" },
];
export const CTA = { a: W(205) - 4 };

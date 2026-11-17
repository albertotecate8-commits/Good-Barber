// Línea de tiempo del short de Afore Pro: diálogo (lineas.json, tiempos por palabra), cámara, poses y monedas.
// Todo se sincroniza con lineas.json; boca.json (nivel de boca por cuadro y personaje, sacado del audio) es opcional.
import LINEAS from "./lineas.json";
import BOCA from "./boca.json";

export const FPS = 30;
export type V3 = [number, number, number];
export type Who = "chuy" | "ana";
export type Word = { w: string; s: number; e: number };
export type Line = { who: Who; text: string; s: number; e: number; words: Word[] };
export const LINES = LINEAS.lines as Line[];
export const TOTAL = Math.round(LINEAS.dur * FPS);
const F = (t: number) => Math.round(t * FPS);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };

// posiciones en la plaza (m). La Catedral queda al fondo, hacia -z.
export const POS: Record<Who, V3> = { chuy: [-0.82, 0, 0], ana: [0.82, 0, 0] };
export const HEAD_Y = 1.62; // altura de los ojos
export const TOP_Y: Record<Who, number> = { chuy: 2.35, ana: 2.12 }; // punta del sombrero / del pelo

// momentos clave
const L = LINES;
const wordT = (li: number, needle: string) => (L[li].words.find((w) => w.w.toLowerCase().includes(needle)) ?? L[li].words[0]).s;
export const COIN_T = wordT(4, "llueva") - 0.1;     // empiezan a caer las monedas
export const LOGO_T = L[5].s - 0.25;                 // entra el logo con el lema
export const lineAt = (t: number) => L.findIndex((l) => t >= l.s - 0.05 && t <= l.e + 0.12);

// ---------------- cámara ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = { pos: V3; look: V3; fov?: number; roll?: number };
type Key = { f: number; dur?: number; s: (f: number) => Shot };
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
/** acercamiento lento hacia el punto que mira: la cámara nunca se queda quieta */
const push = (pos: V3, look: V3, f0: number, rate = 0.0022, rest: Partial<Shot> = {}) => (f: number): Shot => {
  const k = Math.exp(-rate * Math.max(0, f - f0));
  return { pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest };
};
/** paneo lateral lento (órbita) alrededor del punto que mira */
const orbit = (look: V3, r: number, y: number, a0: number, a1: number, f0: number, f1: number, fov = 40) => (f: number): Shot => {
  const u = clamp01((f - f0) / Math.max(1, f1 - f0)), a = a0 + (a1 - a0) * u;
  return { pos: [look[0] + r * Math.sin(a), y, look[2] + r * Math.cos(a)], look, fov };
};

const Lf = L.map((l) => ({ a: F(l.s), b: F(l.e) }));
const KEYS: Key[] = [
  // gancho: la Catedral con el papel picado; la cámara baja hasta Don Chuy y Ana
  { f: 0, s: push([0, 11, 20], [0, 15.5, -40], 0, 0.0015, { fov: 52 }) },
  { f: 8, dur: 50, s: push([0.1, 1.95, 9.4], [0.05, 1.5, 0], 58, 0.0024, { fov: 40 }) },
  // Ana contesta: plano medio sobre ella, Don Chuy a la orilla
  { f: Lf[1].a - 10, dur: 26, s: push([-1.55, 1.65, 3.7], [0.75, 1.45, 0], Lf[1].a + 16, 0.0026, { fov: 40 }) },
  // Don Chuy: "¿A poco?"
  { f: Lf[2].a - 9, dur: 22, s: push([1.5, 1.6, 3.4], [-0.8, 1.55, 0], Lf[2].a + 13, 0.0035, { fov: 40, roll: -0.03 }) },
  // Ana explica: órbita suave de dos
  { f: Lf[3].a - 9, dur: 26, s: orbit([0.25, 1.4, 0], 4.6, 1.7, 0.32, -0.12, Lf[3].a + 17, Lf[3].b + 10) },
  // Don Chuy emocionado
  { f: Lf[4].a - 8, dur: 22, s: push([0.55, 1.3, 3.9], [-0.75, 1.7, 0], Lf[4].a + 14, 0.004, { fov: 40, roll: 0.035 }) },
  // ¡Que llueva el dinerito! la cámara se abre para ver la lluvia de monedas frente a la Catedral
  { f: F(COIN_T) - 6, dur: 34, s: push([0, 2.6, 10.5], [0, 3.4, -6], F(COIN_T) + 28, 0.0018, { fov: 48 }) },
];
export const camAt = (f: number): Cam => {
  let cur = full(KEYS[0].s(f));
  for (let i = 1; i < KEYS.length; i++) {
    const k = KEYS[i];
    if (f < k.f) break;
    cur = mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
/** foco del desenfoque: los ojos del que habla (o el centro de los dos); en la toma abierta no hay desenfoque */
export const dofAt = (f: number): { focus: V3; cInf: number } => {
  const t = f / FPS;
  if (t < 1.2) return { focus: [0, 15, -40], cInf: 0 };
  if (t > COIN_T + 0.4) return { focus: [0, 1.5, 0], cInf: 4 };
  const i = lineAt(t), who = i >= 0 ? L[i].who : null;
  return { focus: who ? [POS[who][0], HEAD_Y, 0] : [0, HEAD_Y, 0], cInf: 11 };
};

// ---------------- poses ----------------
const BOCA_ = BOCA as unknown as Partial<Record<Who, number[]>>;
/** apertura de boca 0..3 en el cuadro f */
export const mouthAt = (who: Who, f: number) => {
  const arr = BOCA_[who];
  if (arr && arr.length) return arr[Math.min(arr.length - 1, f)] ?? 0;
  const t = f / FPS;
  for (const l of L) if (l.who === who) for (const w of l.words) if (t >= w.s && t <= w.e) {
    const u = (t - w.s) / Math.max(0.05, w.e - w.s);
    return [1, 2, 3, 2, 1, 2][Math.floor(u * 6) % 6];
  }
  return 0;
};
const blinkAt = (seed: number, f: number) => {
  // parpadeo cada 1.6-3 s, 4 cuadros
  let t0 = 12 + seed * 7;
  while (t0 < f) { const d = f - t0; if (d < 4) return [0.5, 1, 1, 0.5][d]; t0 += 48 + ((t0 * 37 + seed * 13) % 42); }
  return 0;
};
export type PoseOut = { expr: string; wave?: number; blink: number; tilt: number; headTilt: number; facing: -1 | 1; hop: number };
export const poseAt = (who: Who, f: number): PoseOut => {
  const t = f / FPS, m = mouthAt(who, f), blink = blinkAt(who === "chuy" ? 1 : 4, f);
  const facing = who === "chuy" ? 1 : -1;
  let mood: "worry" | "talk" | "joy" = "talk";
  let wave: number | undefined, tilt = 0, headTilt = 0, hop = 0;
  const speak = (li: number) => t >= L[li].s - 0.1 && t <= L[li].e + 0.3;
  if (who === "chuy") {
    if (t < L[1].s + 1.5) mood = "worry";                     // preocupado al principio
    if (t >= L[1].s + 1.5 && t < L[4].s - 0.2) mood = "talk";  // se anima con lo que oye
    if (speak(2)) { mood = "talk"; headTilt = -4 * Math.sin(Math.PI * clamp01((t - L[2].s) / 1.2)); }
    if (t >= L[4].s - 0.2) mood = "joy";
    if (speak(0)) { tilt = -2; headTilt = 3; wave = 0.15 + 0.25 * Math.sin(t * 3.1) ** 2; } // se rasca / manotea
    if (t >= L[4].s) wave = 0.6 + 0.4 * Math.abs(Math.sin(t * 5.2));                       // brazo arriba, festeja
    if (t >= COIN_T) hop = Math.abs(Math.sin((t - COIN_T) * 5.4)) * 0.09 * smooth((t - COIN_T) / 0.3);
  } else {
    mood = t >= COIN_T ? "joy" : "talk";
    if (speak(1) || speak(3)) wave = 0.25 + 0.45 * Math.sin(t * 2.4 + 1) ** 2;             // explica con la mano
    if (speak(5)) wave = 1;
    if (t >= COIN_T) hop = Math.abs(Math.sin((t - COIN_T) * 5.4 + 1.2)) * 0.07 * smooth((t - COIN_T - 0.2) / 0.3);
    headTilt = 3 * Math.sin(t * 1.3);
  }
  const lvl = Math.max(0, Math.min(3, Math.round(m)));
  let expr: string;
  if (mood === "worry") expr = lvl === 0 ? "worry1" : lvl === 1 ? "worry1" : lvl === 2 ? "worry2" : "worry3";
  else if (mood === "joy") expr = lvl >= 2 ? "joy2" : "joy1";
  else expr = lvl === 0 ? "smile" : lvl === 1 ? "talk1" : lvl === 2 ? "talk2" : "talk3";
  return { expr, wave: wave === undefined ? undefined : Math.round(wave * 10) / 10, blink, tilt, headTilt: Math.round(headTilt), facing, hop };
};

// ---------------- monedas ----------------
export const COINS = 280;
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
export type Coin = { pos: V3; rot: V3; on: boolean };
export const coinAt = (i: number, t: number): Coin => {
  const near = i % 5 === 0, t0 = COIN_T + rnd(i, 1) * 3.2, x = (near ? -2.2 : -5) + (near ? 4.4 : 10) * rnd(i, 2), z = near ? 3.5 + 4 * rnd(i, 3) : -4.5 + 8 * rnd(i, 3), y0 = 9 + 4 * rnd(i, 4);
  const dt = t - t0;
  if (dt < 0) return { pos: [0, -10, 0], rot: [0, 0, 0], on: false };
  const g = 5.5, tLand = Math.sqrt((2 * (y0 - 0.02)) / g);
  if (dt < tLand) {
    const sp = 6 + 8 * rnd(i, 5);
    return { pos: [x, y0 - 0.5 * g * dt * dt, z], rot: [dt * sp, dt * sp * 0.7 + rnd(i, 6) * 6, 0], on: true };
  }
  return { pos: [x, 0.03 + 0.012 * (i % 3), z], rot: [0, rnd(i, 6) * 6, 0], on: true };
};

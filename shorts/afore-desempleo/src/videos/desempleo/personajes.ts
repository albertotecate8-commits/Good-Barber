// Personajes y objetos planos dibujados con la API Pen de toon.ts (lienzo 600x1000, pies en y = 975).
// Ramiro (el que se asesora con Afore Pro), Toño (el que lo hace solo), la asesora, gente de la fila y el perro.
import { Outfit, Expr, Pen, bodyFront, townsfolk, INK, Hold } from "./toon";

export const RAMIRO: Outfit = { jacket: "#2f7fc1", pants: "#3a3f55", boots: "#5a3b2a", hat: "hair", hair: "#221a18", skin: "#c99067", buttons: "#e9eef4" };
export const TONO: Outfit = { jacket: "#e8843a", pants: "#4b4a3f", boots: "#6b3f24", hat: "cap", cap: "#c9333b", moustache: "#2a1d18", skin: "#d9a57c", build: "stout", buttons: "#f4e2c4" };
export const ASESORA: Outfit = { jacket: "#1f9e8f", pants: "#2d3550", boots: "#7a2e3b", dress: "#f2f0ea", hat: "hair", hair: "#3a2418", skin: "#e8b991", pony: true, buttons: "#f4f1ea" };
export const PERSONA_A: Outfit = { jacket: "#8b5cc4", pants: "#33364a", boots: "#4a2f22", hat: "hair", hair: "#5a3b2a", skin: "#e2b48c" };
export const PERSONA_B: Outfit = { jacket: "#d94f6a", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#1e1714", skin: "#b9805a", build: "stout" };
export const FILA: Outfit[] = Array.from({ length: 10 }, (_, i) => townsfolk(i));

export type Pose = { expr: Expr; wave?: number; blink?: number; tilt?: number; headTilt?: number; look?: number; facing?: -1 | 0 | 1;
  mode?: "stand" | "sit" | "stroll"; phase?: number; hold?: Hold | null; seed?: number };
export const drawPerson = (p: Pen, o: Outfit, pose: Pose) =>
  bodyFront(p, o, {
    mode: pose.mode ?? "stand", phase: pose.phase ?? 0, expr: pose.expr, wave: pose.wave, blink: pose.blink, tilt: pose.tilt ?? 0, headTilt: pose.headTilt ?? 0,
    look: pose.look ?? 0, facing: pose.facing ?? 0, seed: pose.seed ?? 11, prop: pose.hold ?? null,
  });

// ---------------- objetos en la mano ----------------
const text = (p: Pen, s: string, x: number, y: number, size: number, col = INK, font = "Baloo, DejaVu Sans, sans-serif") => {
  const g = p.g; g.save(); g.font = `800 ${size}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = col; g.fillText(s, x, y); g.restore();
};
/** caja de cartón con sus cosas (al salir de la fábrica) */
export const CAJA: Hold = { hold: (p, x, y, u) => {
  p.poly([[x - 40 * u, y - 46 * u], [x + 40 * u, y - 46 * u], [x + 36 * u, y + 8 * u], [x - 36 * u, y + 8 * u]], "#c99a5c", 2.6 * u);
  p.poly([[x - 12 * u, y - 70 * u], [x + 2 * u, y - 70 * u], [x + 4 * u, y - 46 * u], [x - 14 * u, y - 46 * u]], "#6bb36b", 2 * u); // planta
  p.ell(x - 5 * u, y - 76 * u, 14 * u, 9 * u, "#4d9a3a", 2 * u);
  p.poly([[x + 10 * u, y - 62 * u], [x + 30 * u, y - 62 * u], [x + 30 * u, y - 46 * u], [x + 10 * u, y - 46 * u]], "#f4f1ea", 2 * u); // taza
  p.stroke([[x - 30 * u, y - 30 * u], [x + 30 * u, y - 30 * u]], 2 * u, "#8e6a3c");
} };
/** celular con WhatsApp; ok = palomita verde en la pantalla (0..1) */
export const celular = (ok = 0, up = 0.8): Hold => ({ up, hold: (p, x, y, u0) => {
  const u = u0 * 1.7;
  p.poly([[x - 13 * u, y - 46 * u], [x + 13 * u, y - 46 * u], [x + 13 * u, y + 2 * u], [x - 13 * u, y + 2 * u]], "#2b2f3a", 2.4 * u);
  p.poly([[x - 10 * u, y - 42 * u], [x + 10 * u, y - 42 * u], [x + 10 * u, y - 3 * u], [x - 10 * u, y - 3 * u]], ok > 0 ? "#dff7e4" : "#e9f1f6", 0);
  p.ell(x - 2 * u, y - 31 * u, 6 * u, 4 * u, "#25d366", 0); p.ell(x + 2 * u, y - 19 * u, 6 * u, 4 * u, "#ffffff", 0);
  if (ok > 0) p.stroke([[x - 6 * u, y - 13 * u], [x - 1 * u, y - 7 * u], [x + 8 * u, y - 19 * u]].map(([a, b]) => [a, b]) as [number, number][], 3.2 * u, "#1fa855");
} });
/** sobre de dinero: grueso 0 (flaquito) .. 1 (gordo) */
export const sobre = (grueso: number, up = 0.3): Hold => ({ up, hold: (p, x, y, u) => {
  const h = (6 + 20 * grueso) * u;
  p.poly([[x - 30 * u, y - 12 * u - h], [x + 30 * u, y - 12 * u - h], [x + 30 * u, y + 6 * u], [x - 30 * u, y + 6 * u]], "#f0e2b8", 2.4 * u);
  if (grueso > 0.4) for (let i = 0; i < 3; i++) p.poly([[x - 26 * u + i * 4 * u, y - 16 * u - h], [x + 6 * u + i * 4 * u, y - 16 * u - h], [x + 6 * u + i * 4 * u, y - 8 * u - h], [x - 26 * u + i * 4 * u, y - 8 * u - h]], "#7fbf6a", 1.6 * u);
  p.stroke([[x - 30 * u, y - 12 * u - h], [x, y - 2 * u - h * 0.5], [x + 30 * u, y - 12 * u - h]], 1.8 * u, "#b9a372");
} });
/** hoja de papel (la declaración) */
export const HOJA: Hold = { up: 0.5, hold: (p, x, y, u) => {
  p.poly([[x - 22 * u, y - 58 * u], [x + 22 * u, y - 58 * u], [x + 22 * u, y + 2 * u], [x - 22 * u, y + 2 * u]], "#fbfaf5", 2.2 * u);
  for (let i = 0; i < 5; i++) p.stroke([[x - 15 * u, y - 48 * u + i * 9 * u], [x + 15 * u, y - 48 * u + i * 9 * u]], 1.8 * u, "#9aa3b5");
} };
/** fajo de billetes que Ramiro le presta a Toño */
export const BILLETES: Hold = { up: 0.4, hold: (p, x, y, u) => {
  for (let i = 0; i < 3; i++) p.poly([[x - 30 * u + i * 3 * u, y - 22 * u - i * 5 * u], [x + 26 * u + i * 3 * u, y - 22 * u - i * 5 * u], [x + 26 * u + i * 3 * u, y + 2 * u - i * 5 * u], [x - 30 * u + i * 3 * u, y + 2 * u - i * 5 * u]], "#8fca72", 2 * u);
  p.ell(x - 1 * u, y - 20 * u, 7 * u, 7 * u, "#6aa856", 1.4 * u);
} };
/** correa del perro (cae hacia la derecha) */
export const CORREA: Hold = { up: 0, hold: (p, x, y, u) => { p.stroke([[x, y], [x + 30 * u, y + 60 * u], [x + 60 * u, y + 120 * u]], 2.6 * u, "#c0353a"); } };

// ---------------- el perro (sentado, de frente) ----------------
export const drawPerro = (p: Pen, mood: "mira" | "feliz", blink = 0, tail = 0) => {
  const c = "#c68a4e", d = "#8a5a32";
  p.ol = 7;
  p.stroke([[380, 900], [430 + 20 * tail, 850 - 30 * Math.abs(tail)]], 22, INK); p.stroke([[380, 900], [430 + 20 * tail, 850 - 30 * Math.abs(tail)]], 14, c);
  p.ell(300, 870, 105, 95, c); // cuerpo
  p.ell(300, 905, 60, 55, "#f1dcc0", 0);
  for (const s of [-1, 1]) p.ell(300 + s * 45, 960, 32, 18, c, 6);
  p.ell(300, 720, 95, 85, c); // cabeza
  for (const s of [-1, 1]) p.ell(300 + s * 88, 715, 30, 62, d, 7, 0, 360, s * 0.35); // orejas
  p.ell(300, 760, 48, 34, "#f1dcc0", 6); // hocico
  p.ell(300, 742, 16, 11, INK, 0);
  if (mood === "feliz") { p.arc(300, 768, 20, 14, 10, 170, 5); p.ell(300, 790, 10, 12, "#e2556b", 4); }
  else p.arc(300, 776, 14, 6, 20, 160, 5);
  for (const s of [-1, 1]) {
    if (blink > 0.5 || mood === "feliz") p.arc(300 + s * 36, 700, 12, 8, 200, 340, 6);
    else { p.dot(300 + s * 36, 698, 11, INK); p.dot(300 + s * 36 + 3, 694, 3.5, "#ffffff"); }
  }
  p.ol = 12;
};

// ---------------- nubes de pensamiento (al lado de la cabeza, nunca encima de la cara) ----------------
export type Idea = "renta" | "gas" | "luz" | "perro";
const icon = (p: Pen, idea: Idea, x: number, y: number, s: number) => {
  const g = p.g; g.save(); g.translate(x, y); g.scale(s, s); g.translate(-300, -420);
  if (idea === "renta") {
    p.poly([[210, 420], [300, 330], [390, 420]], "#d9663f", 8); p.poly([[228, 420], [372, 420], [372, 510], [228, 510]], "#f2d7a6", 8);
    p.poly([[283, 450], [317, 450], [317, 510], [283, 510]], "#7a4a2a", 6);
  } else if (idea === "gas") {
    p.ell(300, 430, 72, 92, "#d94f3a", 8); p.poly([[268, 318], [332, 318], [332, 346], [268, 346]], "#8d949c", 7); p.stroke([[240, 425], [360, 425]], 12, "#f4f1ea");
  } else if (idea === "luz") {
    p.ell(300, 400, 78, 82, "#ffd84a", 8); p.poly([[265, 472], [335, 472], [330, 520], [270, 520]], "#8d949c", 7);
    for (let a = 0; a < 5; a++) { const t = (a / 4) * Math.PI - Math.PI; p.stroke([[300 + 102 * Math.cos(t), 400 + 102 * Math.sin(t)], [300 + 126 * Math.cos(t), 400 + 126 * Math.sin(t)]], 9, "#e8a21a"); }
  } else { g.translate(300, 500); g.scale(0.5, 0.5); g.translate(-300, -830); drawPerro(p, "mira"); }
  g.restore(); p.ol = 12;
};
const LABEL: Record<Idea, string> = { renta: "RENTA", gas: "GAS", luz: "LUZ", perro: "PERRO" };
/** nube de pensamiento con 1 a 4 preocupaciones (aparecen una por una); va al lado de la cabeza */
export const drawIdeas = (p: Pen, ideas: Idea[]) => {
  p.ol = 10;
  for (const [x, y, r] of [[90, 900, 26], [140, 820, 38]] as [number, number, number][]) p.ell(x, y, r, r, "#ffffff");
  const blobs: [number, number, number][] = [[300, 420, 230], [130, 450, 140], [470, 450, 140], [200, 250, 150], [400, 250, 150], [300, 640, 165], [150, 600, 120], [450, 600, 120]];
  for (const [x, y, r] of blobs) p.ell(x, y, r, r * 0.85, "#ffffff");
  p.ol = 0; for (const [x, y, r] of blobs) p.ell(x, y, r - 10, r * 0.85 - 10, "#ffffff"); p.ol = 12;
  const n = ideas.length;
  const slots: [number, number][] = n === 1 ? [[300, 400]] : [[195, 300], [405, 300], [195, 560], [405, 560]];
  const s = n === 1 ? 1.15 : 0.62;
  ideas.forEach((id, i) => { const [x, y] = slots[i]; icon(p, id, x, y - (n === 1 ? 30 : 20), s); text(p, LABEL[id], x, y + (n === 1 ? 175 : 95), n === 1 ? 84 : 52, "#c0353a"); });
};

// ---------------- objetos de los requisitos (parados sobre el escritorio) ----------------
export type Req = "imss" | "semanas" | "anios" | "pausa";
export const drawReq = (p: Pen, r: Req) => {
  p.ol = 10;
  if (r === "imss") { // credencial con una X roja: no estar dado de alta
    p.poly([[110, 560], [490, 560], [490, 820], [110, 820]], "#e9f1f6");
    p.poly([[110, 560], [490, 560], [490, 620], [110, 620]], "#2e7d4f", 0);
    text(p, "ALTA IMSS", 300, 592, 44, "#ffffff");
    p.ell(195, 715, 50, 60, "#d8b49a", 6); for (let i = 0; i < 3; i++) p.stroke([[275, 680 + i * 32], [450, 680 + i * 32]], 10, "#9aa3b5");
    p.poly([[110, 560], [490, 560], [490, 820], [110, 820]], null);
    p.line([[90, 530], [510, 850]], "#e0313b", 26); p.line([[510, 530], [90, 850]], "#e0313b", 26);
  } else if (r === "semanas") { // calendario: mínimo 100 semanas
    p.poly([[130, 500], [470, 500], [470, 900], [130, 900]], "#fbfaf5");
    p.poly([[130, 500], [470, 500], [470, 590], [130, 590]], "#c0353a");
    for (const x of [190, 410]) p.ell(x, 500, 14, 30, "#8d949c", 6);
    text(p, "100", 300, 720, 150, INK, "Luckiest, Arial Black, sans-serif"); text(p, "SEMANAS", 300, 840, 54, "#2e7d4f");
  } else if (r === "anios") { // reloj de arena: 5 años desde el último retiro
    p.poly([[170, 470], [430, 470], [430, 500], [170, 500]], "#8a5a34"); p.poly([[170, 880], [430, 880], [430, 910], [170, 910]], "#8a5a34");
    p.poly([[200, 500], [400, 500], [315, 690], [400, 880], [200, 880], [285, 690]], "#dfeef6");
    p.poly([[250, 560], [350, 560], [305, 670], [295, 670]], "#e8c25a", 0); p.poly([[230, 880], [370, 880], [300, 790]], "#e8c25a", 0);
    p.poly([[200, 500], [400, 500], [315, 690], [400, 880], [200, 880], [285, 690]], null);
    text(p, "5 AÑOS", 300, 960, 64, "#2f6b8a");
  } else { // pausa: no darse de alta durante el trámite
    p.ell(300, 700, 170, 170, "#2f7fc1");
    p.poly([[235, 610], [280, 610], [280, 790], [235, 790]], "#ffffff", 0); p.poly([[320, 610], [365, 610], [365, 790], [320, 790]], "#ffffff", 0);
    text(p, "TRÁMITE", 300, 920, 60, "#2f7fc1");
  }
  p.ol = 12;
};

/** palomita verde (Ramiro: su prevalidación salió bien) */
export const drawCheck = (p: Pen, k: number) => {
  const s = Math.max(0.01, k); p.g.save(); p.g.translate(300, 500); p.g.scale(s, s); p.g.translate(-300, -500);
  p.ell(300, 500, 170, 170, "#25d366", 12);
  p.line([[220, 505], [280, 565], [390, 445]], "#ffffff", 40);
  p.g.restore();
};

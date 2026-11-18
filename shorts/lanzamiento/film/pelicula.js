// ============================================================================
// AFORE PRO — Lanzamiento. Una sola toma de 27 s (54 beats a 120 BPM).
// Todo sale de seek(t): cada estilo es función del tiempo. Las cachés sólo
// guardan cálculos puros (mapas de distancia), nunca estado de animación.
// ============================================================================
const TOTAL = 27.0;
const lerp = (a, b, u) => a + (b - a) * u;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeIn = (x) => Math.pow(clamp(x), 3);
const backOut = (x) => { x = clamp(x); const s = 1.4; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const pop = (t, t0, o = {}) => spring(t - t0, { f: o.f || 2.4, z: o.z || 0.48 });
const rectLerp = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u), r: lerp(a.r ?? 0, b.r ?? 0, u) });
const WHITE = "#fff", INK = "#0d0d0e", GOLDC = "#e2c27a";

// ----------------------------------------------------------------- cámara ---
// Llaves (t, zoom, foco x, foco y) interpoladas con Catmull-Rom: nunca se queda quieta.
const CAMK = [
  [0, 1.0, 720, 720], [1.0, 1.04, 760, 720], [1.9, 1.10, 720, 720], [2.6, 1.02, 720, 720], [3.4, 1.0, 720, 720],
  [4.6, 1.04, 720, 640], [5.6, 1.03, 720, 760], [6.0, 1.0, 720, 720], [7.9, 1.05, 720, 700],
  [9.2, 1.03, 720, 720], [11.6, 1.06, 720, 800], [12.8, 1.03, 720, 720], [13.8, 1.06, 720, 800], [14.9, 1.03, 720, 720],
  [16.2, 1.06, 720, 800], [17.7, 1.02, 720, 720], [18.4, 1.0, 720, 720], [19.8, 1.03, 720, 700], [20.4, 1.08, 640, 520],
  [21.4, 1.02, 720, 760], [22.4, 1.10, 720, 1000], [23.2, 1.04, 720, 900], [23.6, 1.0, 720, 720], [25.2, 1.04, 720, 760],
  [26.3, 1.02, 720, 720], [27.0, 1.0, 720, 720],
];
function camAt(t) {
  let i = 0; while (i < CAMK.length - 2 && t > CAMK[i + 1][0]) i++;
  const k0 = CAMK[Math.max(0, i - 1)], k1 = CAMK[i], k2 = CAMK[i + 1], k3 = CAMK[Math.min(CAMK.length - 1, i + 2)];
  const u = clamp((t - k1[0]) / (k2[0] - k1[0]));
  const cr = (j) => { const p0 = k0[j], p1 = k1[j], p2 = k2[j], p3 = k3[j], u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };
  return [cr(1), cr(2), cr(3)];
}

// ------------------------------------------------------------- utilidades ---
function box(parent, r, style = {}) { return div(parent, { left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: r.r ?? 0, ...style }); }
function svgEl(parent, x, y, w, h, inner, style = {}) {
  const d = div(parent, { left: x, top: y, width: w, height: h, ...style });
  d.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">${inner}</svg>`;
  return d;
}
// texto que cambia dentro de una forma: cada texto con su propia máscara
function swapText(parent, items, t, { x, y, w, h, style }) {
  const m = div(parent, { left: x, top: y, width: w, height: h, overflow: "hidden" });
  items.forEach(([t0, str], i) => {
    const tin = easeOut(seg(t, t0 + 0.04, t0 + 0.18)), next = items[i + 1], tout = next ? easeIn(seg(t, next[0] - 0.04, next[0] + 0.08)) : 0;
    if (tin <= 0 || tout >= 1) return;
    text(m, str, { left: 0, top: (1 - tin) * h - tout * h, width: w, lineHeight: h + "px", whiteSpace: "nowrap", ...style }, "abs " + (style.cls || "ui"));
  });
  return m;
}
// tamaño de letra (Archivo ancho) para que la línea más larga quepa en maxW
function fitSize(lines, maxW, base) {
  const g = document.createElement("canvas").getContext("2d");
  g.font = `800 100px Archivo`; g.fontStretch = "expanded";
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) / 100;
  return Math.min(base, Math.floor(maxW / w));
}
// palomita que se dibuja
function check(parent, x, y, s, p, color = GOLDC, bg = null) {
  if (p <= 0) return;
  const L = 2.2 * s;
  svgEl(parent, x, y, s, s, `${bg ? `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 * Math.min(1, p * 2)}" fill="${bg}"/>` : ""}
    <path d="M${s * 0.28} ${s * 0.52} L${s * 0.44} ${s * 0.68} L${s * 0.74} ${s * 0.34}" fill="none" stroke="${color}" stroke-width="${s * 0.09}"
      stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - easeOut(seg(p, 0.25, 1)))}"/>`);
}
function addGoo() { // filtro goo: desenfoque + umbral alfa, y la fuente encima para que el borde siga nítido
  document.getElementById("defs").insertAdjacentHTML("beforeend", `<filter id="goo" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b"/>
    <feColorMatrix in="b" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 26 -11" result="g"/>
    <feComposite in="SourceGraphic" in2="g" operator="atop"/></filter>`);
}

// ------------------------------------------------------------ escena 1 ------
// RETIRA. → acordeón al punto → píldora → iris → foto → cuadrícula → bento → zoom
const WM = { size: 236, y: 720 };
let wmLayout = null;
function wordmarkLayout() {
  if (wmLayout) return wmLayout;
  const g = document.createElement("canvas").getContext("2d");
  g.font = `800 ${WM.size}px Archivo`; g.fontStretch = "expanded";
  const letters = "RETIRA".split("").map((ch) => ({ ch, w: g.measureText(ch).width }));
  const dot = WM.size * 0.24, gap = WM.size * 0.05;
  const total = letters.reduce((a, l) => a + l.w, 0) + gap + dot;
  let x = (W - total) / 2;
  letters.forEach((l) => { l.x = x; x += l.w; });
  wmLayout = { letters, dotX: x + gap + dot / 2, dot, left: (W - total) / 2 };
  return wmLayout;
}
// s = 1 palabra completa … 0 todo dentro del punto
function drawWordmark(c, s, dotScale = 1) {
  const L = wordmarkLayout(), anchor = L.dotX - L.dot / 2 - WM.size * 0.05;
  const cap = WM.size * 0.72, top = WM.y - cap / 2 - WM.size * 0.14;
  if (s > 0.002) L.letters.forEach((l) => {
    const stretch = lerp(62.5, 125, clamp(s * 1.6)), k = s * 125 / stretch;
    const x = anchor - (anchor - l.x) * s;
    text(c, l.ch, { left: x, top, fontSize: WM.size + "px", lineHeight: WM.size + "px", color: INK, fontStretch: stretch + "%", transform: `scaleX(${k})`, transformOrigin: "0 0", whiteSpace: "nowrap" }, "abs wm");
  });
  const d = L.dot * dotScale;
  div(c, { left: L.dotX - d / 2, top: WM.y + cap / 2 - L.dot - 2 + (L.dot - d) / 2, width: d, height: d, borderRadius: "50%", background: EMERALD });
}
const PILL = { x: 90, y: 450, w: 1260, h: 540 };
const GRID = (() => { const s = 300, g = 24, o = (W - 3 * s - 2 * g) / 2; const r = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) r.push({ x: o + i * (s + g), y: o + j * (s + g), w: s, h: s, r: 18 }); return r; })();
// 9 fotos: índice de la celda de la cuadrícula (centro = 4)
const TILES = [
  { img: "plaza", pos: "50% 30%", g: 0, b: [3, 0, 1, 1] },
  { img: "puenteDia", pos: "55% 50%", g: 1, b: [1, 0, 2, 1] },
  { img: "angel", pos: "50% 55%", g: 2, b: [2, 1, 1, 2] },
  { img: "hombre", pos: "40% 25%", g: 3, b: [3, 1, 1, 1] },
  { img: "retrato", pos: "50% 30%", g: 4, b: [0, 0, 1, 2] },
  { img: "cometa", pos: "45% 40%", g: 5, b: [1, 1, 1, 1] },
  { img: "oficina", pos: "50% 45%", g: 6, b: [0, 2, 2, 2] },
  { img: "familia", pos: "50% 60%", g: 7, b: [3, 2, 1, 2] },
  { img: "hombre", pos: "75% 8%", size: "260%", g: 8, b: [2, 3, 1, 1] },
];
const bentoRect = ([c0, r0, cs, rs]) => { const m = 70, g = 20, s = (W - 2 * m - 3 * g) / 4; return { x: m + c0 * (s + g), y: m + r0 * (s + g), w: cs * s + (cs - 1) * g, h: rs * s + (rs - 1) * g, r: 26 }; };
const FULL = { x: 0, y: 0, w: W, h: W, r: 0 };
const T1 = { click1: 1.5, irisClose: [1.55, 1.85], irisOpen: 2.0, square: 2.5, plus: 2.6, corners: 2.75, bento: 3.0, click2: 3.5 };

function segOpen(c, t) {
  c.style.background = "var(--ivory)";
  // 0–1.0: la palabra; 0.5–0.95 acordeón
  const s = 1 - ease(seg(t, 0.5, 0.95));
  if (t < 1.02) drawWordmark(c, s, 1);
  // 1.0–1.4: el punto crece en la píldora
  if (t >= 1.0) {
    const L = wordmarkLayout(), cap = WM.size * 0.72;
    const dot = { x: L.dotX - L.dot / 2, y: WM.y + cap / 2 - L.dot - 2, w: L.dot, h: L.dot, r: L.dot / 2 };
    const g = spring(t - 1.0, { f: 1.9, z: 0.72 });
    // 1.5–1.9: la píldora se vuelve círculo; 2.5–2.8: círculo → cuadrado chico
    const circ = { x: 720 - 270, y: 720 - 270, w: 540, h: 540, r: 270 };
    const sq = { ...GRID[4] };
    let R = rectLerp(dot, PILL, g); R.r = R.h / 2;
    const gc = spring(t - T1.click1 - 0.03, { f: 2.0, z: 0.8 });
    if (t > T1.click1) { R = rectLerp(R, circ, gc); R.r = R.h / 2; }
    const gs = spring(t - T1.square, { f: 2.1, z: 0.75 });
    if (t > T1.square) { R = rectLerp(R, sq, gs); R.r = lerp(R.h / 2, sq.r, clamp(gs * 1.4)); }
    // la cuadrícula se despliega detrás (centro, cruz, esquinas) y luego se reacomoda en bento
    if (t > T1.plus) TILES.forEach((tl, i) => {
      if (tl.g === 4) return;
      const isPlus = [1, 3, 5, 7].includes(tl.g), t0 = isPlus ? T1.plus : T1.corners;
      if (t < t0) return;
      const u = spring(t - t0, { f: 2.2, z: 0.7 });
      let r = rectLerp(sq, GRID[tl.g], u);
      const ub = spring(t - T1.bento, { f: 2.0, z: 0.78 });
      if (t > T1.bento) r = rectLerp(r, bentoRect(tl.b), ub);
      const z = tileZoom(t, tl);
      if (z) r = rectLerp(r, FULL, z);
      const el = box(c, r, { overflow: "hidden", zIndex: z ? 5 : 1 });
      photo(el, IMG[tl.img], 0, 0, r.w, r.h, tl.pos, tl.size ? { backgroundSize: tl.size } : {});
      if (tl.img === "puenteDia" && z) puenteOverlay(el, t, r);
    });
    // la forma principal (píldora → círculo → cuadrado → celda del bento)
    if (t > T1.bento) { const ub = spring(t - T1.bento, { f: 2.0, z: 0.78 }); R = rectLerp(R, bentoRect(TILES[4].b), ub); }
    const shape = box(c, R, { overflow: "hidden", zIndex: 2, ...(t < T1.irisOpen ? brandSurface() : {}) });
    if (t < 1.86) { // contenido de la píldora: logo y etiqueta (se recortan al encogerse)
      const inner = div(shape, { left: R.w / 2 - PILL.w / 2, top: R.h / 2 - PILL.h / 2, width: PILL.w, height: PILL.h });
      const lp = pop(t, 1.14);
      const lg = logo(inner, 46, 30, 480); lg.style.transform = `scale(${lp})`;
      div(inner, { left: 556, top: 120 + 150 * (1 - easeOut(seg(t, 1.18, 1.4))), width: 2, height: 300 * easeOut(seg(t, 1.18, 1.4)), background: "linear-gradient(180deg, transparent, #d9b765 20%, #d9b765 80%, transparent)" });
      ["TU AFORE", "PUEDE", "DARTE MÁS."].forEach((str, i) =>
        riseText(inner, str, { x: 606, y: 141 + i * 86, h: 86, p: seg(t, 1.16 + i * 0.07, 1.42 + i * 0.07), style: { fontSize: "72px", color: WHITE, width: "640px", ...(i === 2 ? goldFill : {}) } }));
    } else {
      photo(shape, IMG.retrato, 0, 0, R.w, R.h, "50% 28%");
    }
    // iris: se cierra sobre la etiqueta y abre de golpe sobre la foto
    if (t > T1.irisClose[0] && t < T1.irisOpen + 0.5) {
      const open = t < T1.irisOpen ? 1 - ease(seg(t, ...T1.irisClose)) : spring(t - T1.irisOpen, { f: 2.6, z: 0.5 });
      if (open < 1.02) {
        const cl = div(c, { left: 0, top: 0, width: W, height: W, zIndex: 3 });
        cl.style.clipPath = `inset(${R.y}px ${W - R.x - R.w}px ${W - R.y - R.h}px ${R.x}px round ${R.r}px)`;
        irisBrand(cl, { cx: R.x + R.w / 2, cy: R.y + R.h / 2, R: Math.hypot(R.w, R.h) / 2 + 2, open: Math.max(0, open), rot: 0.5 * (1 - Math.min(1, open)) });
      }
    }
    // la pregunta, bajo el círculo
    if (t > 2.2 && t < 2.9) {
      const up = seg(t, 2.2, 2.42), down = seg(t, 2.6, 2.8);
      const m = div(c, { left: 0, top: 1050, width: W, height: 96, overflow: "hidden", zIndex: 2 });
      text(m, "¿ESTÁS SIN EMPLEO?", { left: 0, top: (1 - easeOut(up)) * 100 + easeIn(down) * 100, width: W, textAlign: "center", fontSize: "76px", lineHeight: "96px", color: INK }, "abs wm");
    }
  }
  cursorOpen(c, t);
}
function irisBrand(parent, o) { // hojas en esmeralda oscuro con filo dorado
  const s = iris(parent, o);
  s.querySelectorAll("path").forEach((p, i) => { p.setAttribute("fill", i % 2 ? "#0c2723" : "#103430"); p.setAttribute("stroke", "rgba(222,186,110,0.7)"); p.setAttribute("stroke-width", "2.5"); });
}
const tileZoom = (t, tl) => tl.img === "puenteDia" && t > T1.click2 ? spring(t - T1.click2 - 0.02, { f: 1.8, z: 0.8 }) : 0;
function cursorAt(t, path) { // path: [t, x, y, down?] — resortes por tramo
  let x = path[0][1], y = path[0][2], dn = 0;
  for (let i = 1; i < path.length; i++) { const [t0, px, py] = path[i]; const u = spring(t - t0, { f: 2.2, z: 0.85 }); x += (px - path[i - 1][1]) * u; y += (py - path[i - 1][2]) * u; }
  path.forEach((p) => { if (p[3]) dn = Math.max(dn, 1 - Math.abs(t - p[3] - 0.05) / 0.08); });
  return { x, y, down: clamp(dn) };
}
function cursorOpen(c, t) {
  if (t < 0.9 || t > 3.9) return;
  const P = [[0.9, 1560, 1300], [0.9, 1210, 930], [1.65, 1240, 1240, T1.click1], [2.9, 1090, 330], [3.2, 1000, 260, T1.click2], [3.62, 1700, 900]];
  const k = cursorAt(t, P);
  if (t > T1.click1 && t < T1.click1 + 0.45) clickRing(c, 1210, 930, seg(t, T1.click1, T1.click1 + 0.45));
  if (t > T1.click2 && t < T1.click2 + 0.45) clickRing(c, 1000, 260, seg(t, T1.click2, T1.click2 + 0.45));
  const cu = cursor(c, k.x, k.y, 1, k.down); cu.style.zIndex = 20;
}

// ------------------------------------------------------------ escena 2 ------
// el puente a pantalla completa: MÁS de cristal → gota → barra → slider → luz dorada → lente → esfera
const PB = (el) => photo(el, IMG.puenteDia, 0, 0, W, W, "55% 50%");
function puenteOverlay(el, t, r) { // la pregunta sobre la foto que crece
  if (t < 3.72 || t > 4.75) return;
  const up = seg(t, 3.72, 3.95), down = seg(t, 4.5, 4.7);
  ["¿ESTÁS SIN", "EMPLEO?"].forEach((s, i) => {
    const m = div(el, { left: 0, top: r.h - 330 + i * 110, width: r.w, height: 110, overflow: "hidden" });
    text(m, s, { left: 70, top: (1 - easeOut(seg(up, i * 0.25, 1))) * 112 - easeIn(down) * 112, fontSize: "104px", lineHeight: "110px", color: WHITE, whiteSpace: "nowrap", textShadow: "0 2px 18px rgba(0,0,0,0.25)" }, "abs wm");
  });
}
const KNOB = { y: 1206, x0: 470, x1: 970 };
function segGlass(c, t) {
  // fondo: día, con la versión dorada que entra por barrido siguiendo la perilla
  const knob = t < 5.25 ? 0 : ease(seg(t, 5.25, 5.75));
  const wipeX = lerp(-40, W + 40, knob);
  const bg = (el) => { PB(el); if (wipeX > 0) { const g = photo(el, IMG.puenteOro, 0, 0, W, W, "55% 50%"); g.style.clipPath = `inset(0 ${W - wipeX}px 0 0)`; } };
  bg(c);
  if (t < 4.75) puenteOverlay(c, t, FULL);
  // MÁS de cristal, letra por letra
  if (t >= 4.0 && t < 4.85) {
    const melt = easeIn(seg(t, 4.5, 4.78));
    const xs = [410, 720, 1010];
    "MÁS".split("").forEach((ch, i) => {
      const p = pop(t, 4.0 + i * 0.08, { f: 2.6, z: 0.45 });
      const gt = glassText(c, { text: ch, x: xs[i] - 130, y: 470, size: 330, bg, band: 22, scale: 60 });
      const k = p * (1 - 0.75 * melt), dx = (720 - xs[i]) * melt, dy = 120 * melt;
      gt.el.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
      gt.el.style.transformOrigin = "50% 60%";
    });
  }
  // gota → barra de herramientas de cristal (con goo)
  if (t >= 4.5 && t < 8.0) {
    const dg = spring(t - 4.55, { f: 2.0, z: 0.7 }), st = spring(t - 4.78, { f: 2.0, z: 0.72 });
    const drop = { x: 720 - 80 * dg, y: 640 - 80 * dg, w: 160 * dg, h: 160 * dg, r: 80 * dg };
    const bar = { x: 360, y: 1150, w: 720, h: 112, r: 56 };
    let R = rectLerp(drop, bar, st); R.r = Math.min(R.h / 2, R.w / 2);
    // al soltar, la perilla sube como lente y la barra se recoge en la orilla
    const lift = t > 5.75 ? spring(t - 5.75, { f: 2.2, z: 0.8 }) : 0;
    if (lift > 0) { R = rectLerp(R, { x: 700, y: 1206, w: 40, h: 0, r: 0 }, lift); }
    if (R.w > 4 && R.h > 2) {
      if (t < 4.95) { // gotas que se funden: goo
        const goo = div(c, { left: 0, top: 0, width: W, height: W }); goo.style.filter = "url(#goo)";
        const melt = seg(t, 4.5, 4.8);
        [410, 720, 1010].forEach((x) => { const s = 120 * (1 - melt * 0.6); div(goo, { left: lerp(x, 720, easeIn(melt)) - s / 2, top: lerp(600, 680, melt) - s / 2, width: s, height: s, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }); });
      }
      const gp = glassPanel(c, { x: Math.round(R.x), y: Math.round(R.y), w: Math.max(8, Math.round(R.w)), h: Math.max(8, Math.round(R.h)), r: Math.round(R.r), bg, band: Math.min(30, R.h / 2), scale: 48, tint: "rgba(255,255,255,0.20)" });
      // íconos de la barra (recortar, ajustes, filtros); a las 5.0 se vuelven el slider
      if (st > 0.6 && t < 5.75) {
        const ip = pop(t, 4.9), out = seg(t, 5.0, 5.15);
        const icons = [
          `<path d="M14 4 V34 H44 M4 14 H34 V44" fill="none" stroke="#0d0d0e" stroke-width="4" stroke-linecap="round"/>`,
          `<path d="M6 14 H42 M6 34 H42" stroke="#0d0d0e" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="14" r="6" fill="#fff" stroke="#0d0d0e" stroke-width="4"/><circle cx="32" cy="34" r="6" fill="#fff" stroke="#0d0d0e" stroke-width="4"/>`,
          `<circle cx="18" cy="20" r="11" fill="none" stroke="#0d0d0e" stroke-width="4"/><circle cx="30" cy="20" r="11" fill="none" stroke="#0d0d0e" stroke-width="4"/><circle cx="24" cy="30" r="11" fill="none" stroke="#0d0d0e" stroke-width="4"/>`,
        ];
        icons.forEach((svg, i) => {
          const k = i === 1 ? ip * (1 - out) : ip * (1 - easeIn(out));
          if (k > 0.01) svgEl(gp, R.w / 2 + (i - 1) * 170 - 24, R.h / 2 - 24, 48, 48, svg, { transform: `scale(${k})` });
        });
        // el slider: la pista se dibuja desde el ícono de ajustes
        const tr = easeOut(seg(t, 5.02, 5.22));
        if (tr > 0) {
          const x0 = KNOB.x0 - R.x, x1 = KNOB.x1 - R.x, cy = R.h / 2;
          div(gp, { left: lerp(R.w / 2, x0, tr), top: cy - 4, width: (x1 - x0) * tr, height: 8, borderRadius: 4, background: "rgba(13,13,14,0.25)" });
          div(gp, { left: x0, top: cy - 4, width: Math.max(0, (KNOB.x0 + (KNOB.x1 - KNOB.x0) * knob) - KNOB.x0) * (tr >= 1 ? 1 : 0), height: 8, borderRadius: 4, background: "linear-gradient(90deg, #f3e0a8, #c39a4c)" });
        }
      }
    }
    // la perilla: mientras se sostiene es un lente de cristal; al soltar sube y se vuelve esfera con la siguiente foto
    if (t > 5.1) {
      const kx = lerp(KNOB.x0, KNOB.x1, knob), held = clamp(seg(t, 5.2, 5.32) - seg(t, 5.75, 5.8) * 0);
      let sz = lerp(44, 150, ease(held)), cx = kx, cy = KNOB.y;
      if (t > 5.75) { const l = spring(t - 5.75, { f: 2.1, z: 0.78 }); cx = lerp(kx, 720, l); cy = lerp(KNOB.y, 640, l); sz = lerp(sz, 420, l); }
      const orbGrow = t > 6.0 ? easeIn(seg(t, 6.0, 6.24)) : 0;
      if (orbGrow < 1) {
        const S = lerp(sz, 2200, orbGrow);
        const g = glassPanel(c, { x: Math.round(cx - S / 2), y: Math.round(cy - S / 2), w: Math.round(S), h: Math.round(S), r: Math.round(S / 2), bg, band: Math.min(60, S * 0.22), scale: lerp(36, 80, held), tint: "rgba(255,255,255,0.10)" });
        // la siguiente foto abre dentro de la esfera como círculo
        const inner = easeOut(seg(t, 5.8, 6.02));
        if (inner > 0) {
          const ir = S / 2 * inner * 0.86;
          const ph = div(g, { left: S / 2 - ir, top: S / 2 - ir, width: 2 * ir, height: 2 * ir, borderRadius: "50%", overflow: "hidden" });
          lockBg(div(ph, { left: -(cx - ir), top: -(cy - ir), width: W, height: W }));
        }
      }
    }
  }
  // 6.0: la esfera llena el cuadro → pantalla de bloqueo
  if (t >= 6.0) {
    const R = lerp(210, 1100, easeIn(seg(t, 6.0, 6.24)));
    const lk = div(c, { left: 0, top: 0, width: W, height: W });
    lk.style.clipPath = `circle(${R}px at 720px 640px)`;
    lockscreen(lk, t);
  }
  cursorGlass(c, t);
}
function cursorGlass(c, t) {
  if (t < 4.9 || t > 6.1) return;
  const kx = lerp(KNOB.x0, KNOB.x1, t < 5.25 ? 0 : ease(seg(t, 5.25, 5.75)));
  const P = [[4.9, 1500, 1400], [4.9, KNOB.x0 + 4, KNOB.y + 6], [5.95, 1600, 1500]];
  let k = cursorAt(t, P);
  if (t > 5.2 && t < 5.8) k = { x: kx + 4, y: KNOB.y + 6, down: 1 };
  cursor(c, k.x, k.y, 1, k.down).style.zIndex = 20;
}

// --------------------------------------------- pantalla de bloqueo (6–18 s) --
function lockBg(el) {
  photo(el, IMG.cometa, 0, 0, W, W, "50% 62%", { filter: "saturate(1.08) contrast(1.08) brightness(0.86)" });
  div(el, { left: 0, top: 0, width: W, height: W, background: "linear-gradient(180deg, rgba(6,12,22,0.40), rgba(6,12,22,0) 34%, rgba(7,24,22,0.55) 72%, rgba(7,24,22,0.85))" });
}
function lockscreen(c, t) {
  lockBg(c);
  const toUI = t > 8.0 ? spring(t - 8.0, { f: 1.9, z: 0.8 }) : 0; // 8.0: se vuelve interfaz
  const outUp = easeIn(seg(t, 8.0, 8.3)) * 520;
  // fecha y reloj de cristal (7.0)
  if (t > 7.0 && outUp < 500) {
    const d = div(c, { left: 0, top: 62 - outUp, width: W, height: 44, overflow: "hidden" });
    text(d, "martes 18 de noviembre", { left: 0, top: (1 - easeOut(seg(t, 7.0, 7.2))) * 44, width: W, textAlign: "center", fontSize: "34px", fontWeight: 600, color: "rgba(255,255,255,0.86)" }, "abs ui");
    const ck = glassText(c, { text: "10:30", x: "center", y: 104 - outUp, size: 190, bg: lockBg, band: 24, scale: 64 });
    ck.el.style.transform = `scale(${pop(t, 7.05)})`; ck.el.style.transformOrigin = "50% 60%";
  }
  // HASTA en cápsula de cristal (6.5)
  if (t > 6.5 && outUp < 500) {
    const k = pop(t, 6.5), hw = 330;
    const hp = glassPanel(c, { x: (W - hw) / 2, y: 462 - outUp, w: hw, h: 86, r: 43, bg: lockBg, tint: "rgba(255,255,255,0.10)", dark: true, band: 26, scale: 40 });
    hp.style.transform = `scale(${k})`;
    text(hp, "HASTA", { left: 0, top: 18, width: hw, textAlign: "center", fontSize: "44px", letterSpacing: "0.28em", textIndent: "0.28em", color: WHITE }, "abs wm");
  }
  // la cifra (6.05) — al volverse interfaz se encoge hacia arriba
  {
    const k = pop(t, 6.05, { f: 2.2, z: 0.5 });
    const size = lerp(262, 92, toUI), top = lerp(560, 96, toUI);
    const el = text(c, "$35,193", { left: 0, top, width: W, textAlign: "center", fontSize: size + "px", lineHeight: size * 1.18 + "px", ...goldFill, transform: `scale(${k})`, transformOrigin: "50% 50%" }, "abs wm");
    if (toUI > 0.3) { // «HASTA» chico a la izquierda de la cifra
      const m = div(c, { left: 0, top: 128, width: 460, height: 50, overflow: "hidden" });
      text(m, "HASTA", { left: 0, top: (1 - easeOut(seg(t, 8.2, 8.4))) * 50, width: 440, textAlign: "right", fontSize: "34px", letterSpacing: "0.2em", color: WHITE, lineHeight: "50px" }, "abs wm");
    }
  }
  // texto de apoyo (6.5)
  if (t > 6.5 && outUp < 500) ["PUEDES RETIRAR DINERO DE TU AFORE", "POR DESEMPLEO."].forEach((s, i) => {
    const m = div(c, { left: 0, top: 892 + i * 54 - outUp * 0.3, width: W, height: 54, overflow: "hidden" });
    text(m, s, { left: 0, top: (1 - easeOut(seg(t, 6.55 + i * 0.08, 6.8 + i * 0.08))) * 54 + easeIn(seg(t, 8.0, 8.2)) * 54, width: W, textAlign: "center", fontSize: "42px", fontWeight: 600, color: WHITE, letterSpacing: "0.02em", lineHeight: "54px" }, "abs ui");
  });
  // barra de inicio → reproductor (7.5) → hoja de requisitos (8.0)
  const bar = { x: 590, y: 1380, w: 260, h: 9, r: 5 }, player = { x: 330, y: 1118, w: 780, h: 170, r: 54 }, sheet = { x: 150, y: 250, w: 1140, h: 1080, r: 64 };
  const pg = t > 7.5 ? spring(t - 7.5, { f: 2.0, z: 0.72 }) : 0;
  let R = rectLerp(bar, player, pg);
  if (toUI > 0) R = rectLerp(R, sheet, toUI);
  if (pg < 0.05) { div(c, { left: R.x, top: R.y, width: R.w, height: R.h, borderRadius: R.r, background: "rgba(255,255,255,0.85)" }); return; }
  const P = glassPanel(c, { x: Math.round(R.x), y: Math.round(R.y), w: Math.round(R.w), h: Math.round(R.h), r: Math.round(Math.min(R.r, R.h / 2)), bg: lockBg, tint: "rgba(255,255,255,0.08)", dark: true });
  if (toUI < 0.25) playerContents(P, t, 1 - toUI * 4);
  if (t > 8.0) requisitos(P, t, R);
}
function playerContents(P, t, k) {
  const a = pop(t, 7.65);
  const art = photo(P, IMG.plaza, 28, 28, 114, 114, "50% 25%", { borderRadius: "22px", transform: `scale(${a * k})` });
  const m = div(P, { left: 168, top: 30, width: 460, height: 90, overflow: "hidden" });
  text(m, "Tech House Vibes", { left: 0, top: 4 + (1 - easeOut(seg(t, 7.7, 7.9))) * 90, fontSize: "32px", fontWeight: 700, color: WHITE }, "abs ui");
  text(m, "Mixkit", { left: 0, top: 46 + (1 - easeOut(seg(t, 7.75, 7.95))) * 90, fontSize: "26px", fontWeight: 500, color: "rgba(255,255,255,0.65)" }, "abs ui");
  const bw = 560 * easeOut(seg(t, 7.7, 8.0)) * k;
  div(P, { left: 168, top: 126, width: bw, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.25)" });
  div(P, { left: 168, top: 126, width: bw * (0.3 + 0.1 * seg(t, 7.7, 8.2)), height: 6, borderRadius: 3, background: GOLDC });
  svgEl(P, 650, 36, 90, 56, `<rect x="14" y="10" width="11" height="34" rx="3" fill="#fff"/><rect x="35" y="10" width="11" height="34" rx="3" fill="#fff"/><path d="M62 12 L80 27 L62 42 Z" fill="#fff"/>`, { transform: `scale(${pop(t, 7.7) * k})` });
}

// ------------------------------------------------------------ escena 3 ------
const REQ = [
  { n: "01", o: 11.0, lines: ["NO ESTAR DADO", "DE ALTA EN", "EL IMSS."], full: "NO ESTAR DADO DE ALTA EN EL IMSS.", icon: "imss" },
  { n: "02", o: 13.0, lines: ["MÍNIMO 100", "SEMANAS", "COTIZADAS."], full: "MÍNIMO 100 SEMANAS COTIZADAS.", sub: "APROXIMADAMENTE 2 AÑOS.", icon: "cal" },
  { n: "03", o: 15.0, lines: ["5 AÑOS DESDE TU", "ÚLTIMO RETIRO", "POR DESEMPLEO."], full: "5 AÑOS DESDE TU ÚLTIMO RETIRO POR DESEMPLEO.", icon: "reloj" },
];
const reqTimes = (q) => ({ open: q.o, icon: q.o + 0.25, text: q.o + 0.5, chk: q.n === "03" ? 17.0 : q.o + 1.5, close: q.n === "03" ? 17.25 : q.o + 1.75 });
function requisitos(P, t, R) {
  // título (8.5) y las tres pastillas (9.0)
  const m = div(P, { left: 70, top: 64, width: 900, height: 80, overflow: "hidden" });
  text(m, "3 REQUISITOS", { left: 0, top: (1 - easeOut(seg(t, 8.5, 8.75))) * 80, fontSize: "66px", lineHeight: "80px", color: WHITE }, "abs wm");
  const pw = 316, gap = 26, x0 = (R.w - 3 * pw - 2 * gap) / 2, py = 190;
  REQ.forEach((q, i) => {
    const rt = reqTimes(q), k = pop(t, 9.0 + i * 0.08);
    const pill = { x: x0 + i * (pw + gap), y: py, w: pw, h: 104, r: 52 };
    const card = { x: 60, y: 340, w: R.w - 120, h: 560, r: 48 };
    let open = 0;
    if (t > rt.open) open = spring(t - rt.open, { f: 2.0, z: 0.78 });
    if (t > rt.close) open *= 1 - spring(t - rt.close, { f: 2.2, z: 0.8 });
    const done = t > rt.chk;
    // pastilla
    const pe = box(P, pill, { ...brandSurface({ boxShadow: "inset 0 0 0 1.5px rgba(222,186,110,0.5)" }), transform: `scale(${k})` });
    text(pe, q.n, { left: 34, top: 22, fontSize: "50px", lineHeight: "60px", ...goldFill }, "abs wm");
    if (done) check(pe, pw - 92, 16, 72, seg(t, rt.chk, rt.chk + 0.3), INK, GOLDC);
    // tarjeta que sale de la pastilla
    if (open > 0.01) {
      const C = rectLerp(pill, card, open);
      const ce = box(P, C, { overflow: "hidden", ...brandSurface(), zIndex: 2 });
      const inner = div(ce, { left: 0, top: 0, width: card.w, height: card.h, transform: `scale(${C.w / card.w}, ${C.h / card.h})`, transformOrigin: "0 0" });
      text(inner, q.n, { left: 56, top: 40, fontSize: "64px", ...goldFill }, "abs wm");
      reqIcon(inner, q.icon, 40, 170, 240, pop(t, rt.icon, { f: 2.4, z: 0.42 }));
      const fs = fitSize(q.lines, card.w - 330 - 50, 64), lh = Math.round(fs * 1.18), dt = q.n === "03" ? 0.22 : 0.1;
      q.lines.forEach((s, j) => riseText(inner, s, { x: 330, y: 150 + j * lh, h: lh, p: seg(t, rt.text + j * dt, rt.text + 0.22 + j * dt), style: { fontSize: fs + "px", color: WHITE, width: card.w - 340 + "px" } }));
      if (q.sub) riseText(inner, q.sub, { x: 332, y: 150 + 3 * lh + 22, h: 54, p: seg(t, q.o + 1.0, q.o + 1.22), style: { fontSize: "36px", fontWeight: 700, color: GOLDC, letterSpacing: "0.06em", width: "640px" }, cls: "ui" });
      if (t > rt.chk) check(inner, card.w - 160, 48, 100, seg(t, rt.chk, rt.chk + 0.3), INK, GOLDC);
    }
  });
  // nota (17.5)
  ["No te des de alta en el IMSS durante el trámite."].forEach((s) => {
    const n = div(P, { left: 0, top: 360, width: R.w, height: 60, overflow: "hidden" });
    text(n, s, { left: 0, top: (1 - easeOut(seg(t, 17.5, 17.72))) * 60, width: R.w, textAlign: "center", fontSize: "36px", fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: "60px" }, "abs ui");
  });
  if (t > 17.5) { // las tres juntas, con palomita, debajo de la nota
    const done = div(P, { left: 0, top: 470, width: R.w, height: 400, overflow: "hidden" });
    REQ.forEach((q, i) => {
      const y = (1 - easeOut(seg(t, 17.55 + i * 0.07, 17.8 + i * 0.07))) * 400;
      const row = div(done, { left: 120, top: y + i * 120, width: R.w - 240, height: 100, borderRadius: 50, background: "rgba(255,255,255,0.07)", boxShadow: "inset 0 0 0 1.5px rgba(222,186,110,0.35)" });
      check(row, 16, 14, 72, 1, INK, GOLDC);
      text(row, `${q.n}  ${q.full}`, { left: 110, top: 30, fontSize: "30px", fontWeight: 700, color: WHITE, whiteSpace: "nowrap" }, "abs ui");
    });
  }
  cursorReq(P, t);
}
function reqIcon(p, kind, x, y, s, k) {
  if (k <= 0.01) return;
  const g = `stroke="${GOLDC}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const svg = {
    imss: `<rect x="30" y="70" width="240" height="160" rx="22" ${g}/><circle cx="100" cy="135" r="28" ${g}/><path d="M60 205 C70 175 130 175 140 205" ${g}/><path d="M170 120 H240 M170 160 H230" ${g}/><path d="M20 260 L280 40" stroke="#fff" stroke-width="14" stroke-linecap="round"/>`,
    cal: `<rect x="40" y="60" width="220" height="200" rx="24" ${g}/><path d="M40 115 H260 M95 35 V85 M205 35 V85" ${g}/><text x="150" y="222" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="82" font-stretch="125%" fill="#fff">100</text>`,
    reloj: `<path d="M80 40 H220 M80 260 H220 M95 40 C95 120 205 120 205 150 C205 180 95 180 95 260 M205 40 C205 120 95 120 95 150" ${g}/><text x="150" y="182" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="70" font-stretch="125%" fill="#fff">5</text>`,
  }[kind];
  svgEl(p, x, y, s, s, `<g transform="scale(${s / 300})">${svg}</g>`, { transform: `scale(${k})`, transformOrigin: "50% 50%" });
}
function cursorReq(P, t) {
  if (t < 9.4 || t > 17.4) return;
  const pw = 316, gap = 26, x0 = (1140 - 3 * pw - 2 * gap) / 2;
  const px = (i) => x0 + i * (pw + gap) + pw * 0.62, py = 250;
  const P0 = [[9.4, 1300, 1200], [9.5, px(0), py, 10.75], [11.3, 1000, 760], [12.4, px(1), py, 12.85], [13.3, 1000, 760], [14.4, px(2), py, 14.85], [15.3, 1080, 900]];
  const k = cursorAt(t, P0);
  [10.75, 12.85, 14.85].forEach((tc, i) => { if (t > tc && t < tc + 0.45) clickRing(P, px(i), py, seg(t, tc, tc + 0.45)); });
  cursor(P, k.x, k.y, 1, k.down).style.zIndex = 9;
}

// ------------------------------------------------------------ escena 4 ------
// el cuadro se aleja hasta ser un teléfono → la isla se desprende → ventana → arrastrar → página
const PHONE = { x: 520, y: 290, w: 400, h: 860, r: 64 };
const PHONE_C = { x: 1020, y: 1190, w: 380, h: 800, r: 62 };
const WIN = { x: 150, y: 70, w: 1250, h: 1330, r: 38 };
function phoneScreen(c, t, P, bez) {
  const ph = box(c, { x: P.x - bez, y: P.y - bez, w: P.w + 2 * bez, h: P.h + 2 * bez, r: P.r + bez }, { background: "#0b0b0c", boxShadow: bez > 4 ? "0 40px 80px -30px rgba(30,24,14,0.5), inset 0 0 0 2px #2a2a2c" : "none", zIndex: 6 });
  const scr = div(ph, { left: bez, top: bez, width: P.w, height: P.h, borderRadius: P.r, overflow: "hidden" });
  const k = P.h / W; // la pantalla de bloqueo cabe por alto, recortada a los lados
  const inner = div(scr, { left: (P.w - W * k) / 2, top: 0, width: W, height: W, transform: `scale(${k})`, transformOrigin: "0 0" });
  lockscreen(inner, Math.min(t, 17.95));
  return ph;
}
function segStage(c, t) {
  c.style.background = "var(--ivory)";
  // 18.0–18.4: el cuadro se encoge al teléfono y el bisel crece desde la orilla
  const pb = spring(t - 18.0, { f: 1.9, z: 0.82 });
  let P = rectLerp({ x: -W * 0.25, y: 0, w: W * 1.5, h: W, r: 0 }, PHONE, pb);
  if (pb < 0.999) P = rectLerp({ x: 0, y: 0, w: W, h: W, r: 0 }, PHONE, pb);
  const bez = 14 * easeOut(seg(t, 18.15, 18.4));
  // 19.0–19.5: el teléfono se va a la esquina
  const corner = t > 19.0 ? spring(t - 19.0, { f: 1.8, z: 0.85 }) : 0;
  if (corner > 0) P = rectLerp(PHONE, PHONE_C, corner);
  // ventana (crece desde la gota de la isla y se desenrolla como persiana)
  if (t > 18.95) browser(c, t);
  phoneScreen(c, t, P, bez);
  // isla dinámica: se estira como líquido, se pincha y sale volando
  if (t > 18.3) island(c, t, P, bez);
  cursorStage(c, t);
}
function island(c, t, P, bez) {
  const cx = P.x + P.w / 2, iy = P.y + 20;
  const str = easeOut(seg(t, 18.5, 18.7)), pinch = seg(t, 18.68, 18.8);
  const fly = t > 18.75 ? spring(t - 18.75, { f: 2.0, z: 0.8 }) : 0;
  const goo = div(c, { left: 0, top: 0, width: W, height: W, zIndex: 8 }); goo.style.filter = "url(#goo)";
  const iw = lerp(110, 240, str) * (1 - pinch * 0.35);
  if (t < 19.25) div(goo, { left: cx - iw / 2, top: iy, width: iw, height: 34, borderRadius: 17, background: "#000" });
  if (pinch > 0) { // la gota que se desprende
    const s = lerp(34, 120, fly), bx = lerp(cx + iw * 0.3, WIN.x + 200, fly), by = lerp(iy + 4, WIN.y + 40, fly) - Math.sin(fly * Math.PI) * 180;
    const grow = t > 19.0 ? spring(t - 19.0, { f: 2.0, z: 0.82 }) : 0;
    if (grow < 0.98) div(goo, { left: lerp(bx - s / 2, WIN.x, grow), top: lerp(by - s / 2, WIN.y, grow), width: lerp(s, WIN.w, grow), height: lerp(s, 86, grow), borderRadius: lerp(s / 2, 38, grow), background: "#000" });
  }
}
function browser(c, t) {
  const grow = spring(t - 19.0, { f: 2.0, z: 0.82 });
  const R = rectLerp({ x: WIN.x + 140, y: WIN.y - 20, w: 120, h: 120, r: 60 }, WIN, grow);
  const roll = easeOut(seg(t, 19.2, 19.6)); // persiana
  const win = box(c, { ...R, h: Math.max(86, R.h * (0.065 + 0.935 * roll)) }, { background: "#fbf8f2", overflow: "hidden", boxShadow: "0 50px 90px -40px rgba(30,24,14,0.45), 0 0 0 1.5px rgba(20,16,10,0.08)", zIndex: 4 });
  const k = R.w / WIN.w;
  const inner = div(win, { left: 0, top: 0, width: WIN.w, height: WIN.h, transform: `scale(${k})`, transformOrigin: "0 0" });
  page(inner, t);
  if (roll > 0 && roll < 1) div(win, { left: 0, top: R.h * (0.065 + 0.935 * roll) - 14, width: R.w, height: 14, background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.18))" });
}
// la página: galería → arrastrar foto a la pestaña → la página empuja → hero
function page(p, t) {
  div(p, { left: 0, top: 0, width: WIN.w, height: 86, background: "#eee8dc" });
  [0, 1, 2].forEach((i) => div(p, { left: 34 + i * 30, top: 36, width: 15, height: 15, borderRadius: 8, background: "#cfc7b9" }));
  const tab = div(p, { left: 160, top: 18, width: 380, height: 54, borderRadius: 16, background: "#fbf8f2" });
  const fav = div(tab, { left: 16, top: 11, width: 32, height: 32, borderRadius: 9, overflow: "hidden", background: EMERALD });
  logo(fav, -2, -2, 36);
  text(tab, "AFORE PRO", { left: 60, top: 14, fontSize: "23px", fontWeight: 700, color: "#141414" }, "abs ui");
  const plus = { x: 572, y: 22 };
  const pushed = t > 20.5 ? spring(t - 20.5, { f: 2.0, z: 0.85 }) : 0;
  // pestaña nueva que nace al soltar
  if (t > 20.45) { const nt = div(p, { left: 556, top: 18, width: 380 * pop(t, 20.45, { f: 2.6, z: 0.6 }), height: 54, borderRadius: 16, background: "#fff", overflow: "hidden" });
    text(nt, "Asesoría", { left: 22, top: 14, fontSize: "23px", fontWeight: 700, color: "#141414" }, "abs ui"); }
  else text(p, "+", { left: plus.x, top: plus.y, fontSize: "40px", color: "#8b8478" }, "abs ui");
  // página 1: galería (sale empujada a la izquierda)
  const g1 = div(p, { left: -WIN.w * pushed, top: 86, width: WIN.w, height: WIN.h - 86, overflow: "hidden" });
  text(g1, "Nuestro equipo", { left: 64, top: 56, fontSize: "64px", color: INK }, "abs wm");
  const thumbs = [["oficina", "50% 45%"], ["retrato", "50% 25%"], ["plaza", "50% 30%"]];
  const TH = (i) => ({ x: 64 + i * 384, y: 190, w: 360, h: 460, r: 26 });
  thumbs.forEach(([img, pos], i) => {
    if (i === 0 && t > 20.0) return; // la que se arrastra se dibuja aparte
    const r = TH(i), e = box(g1, r, { overflow: "hidden" }); photo(e, IMG[img], 0, 0, r.w, r.h, pos);
  });
  text(g1, "Asesoría personalizada en Durango.", { left: 64, top: 700, fontSize: "40px", fontWeight: 600, color: "#3b352c" }, "abs ui");
  // página 2: hero (entra empujando desde la derecha)
  const HERO = { x: 0, y: 86, w: WIN.w, h: 760, r: 0 };
  if (pushed > 0) {
    const g2 = div(p, { left: WIN.w * (1 - pushed), top: 0, width: WIN.w, height: WIN.h, overflow: "visible" });
    heroPage(g2, t, HERO);
  }
  // la foto arrastrada: se levanta (20.0), viaja a la pestaña (20.2–20.45), y al soltar se vuelve el hero
  if (t > 20.0) {
    const lift = easeOut(seg(t, 20.0, 20.15)), drag = spring(t - 20.15, { f: 2.0, z: 0.85 });
    const r0 = TH(0), thumb = { x: plus.x - 60, y: 6, w: 150, h: 96, r: 16 };
    let r = rectLerp(r0, thumb, t > 20.15 ? drag : 0);
    const land = t > 20.5 ? spring(t - 20.5, { f: 1.9, z: 0.85 }) : 0;
    if (land > 0) r = rectLerp(r, HERO, land);
    const s = 1 - 0.05 * lift * (1 - land);
    const e = box(p, r, { overflow: "hidden", transform: `scale(${s})`, boxShadow: `0 ${30 * lift * (1 - land)}px ${60 * lift * (1 - land)}px rgba(20,14,6,${0.35 * lift * (1 - land)})`, zIndex: 3 });
    photo(e, IMG.oficina, 0, 0, r.w, r.h, "50% 45%");
  }
}
function heroPage(g2, t, HERO) {
  const off = g2.getBoundingClientRect ? 0 : 0;
  const pageX = () => WIN.x; // para el clon de cristal
  const heroBg = (el) => photo(el, IMG.oficina, HERO.x, HERO.y, HERO.w, HERO.h, "50% 45%");
  // barra de navegación de cristal con el logotipo
  const nk = pop(t, 20.62);
  const nav = glassPanel(g2, { x: 36, y: HERO.y + 32, w: WIN.w - 72, h: 108, r: 54, bg: heroBg, tint: "rgba(255,255,255,0.32)" });
  nav.style.transform = `scale(${nk})`; nav.style.zIndex = 4;
  const badge = div(nav, { left: 14, top: 14, width: 80, height: 80, borderRadius: 40, overflow: "hidden", ...brandSurface({ boxShadow: "inset 0 0 0 1.5px rgba(222,186,110,0.5)" }) });
  logo(badge, -4, -4, 88);
  text(nav, "AFORE PRO", { left: 114, top: 32, fontSize: "38px", color: INK }, "abs wm");
  const bw = 250;
  if (t < 21.8) { const btn = div(nav, { left: WIN.w - 72 - bw - 16, top: 16, width: bw, height: 76, borderRadius: 38, background: "#0b0b0c", boxShadow: "inset 0 0 0 1.5px rgba(222,186,110,0.55)" });
    text(btn, "Contacto", { left: 0, top: 19, width: bw, textAlign: "center", fontSize: "31px", fontWeight: 600, color: WHITE }, "abs ui"); }
  // chips (21.0, 21.08, 21.5)
  const chips = ["ASESORÍA PERSONALIZADA", "ATENCIÓN PROFESIONAL", "ACOMPAÑAMIENTO DURANTE EL PROCESO"];
  const mg = document.createElement("canvas").getContext("2d"); mg.font = '700 27px "Geist"';
  chips.forEach((s, i) => {
    const t0 = [21.0, 21.08, 21.5][i]; if (t < t0) return;
    const w = Math.ceil(mg.measureText(s).width) + 120, x = WIN.w - 40 - w, y = HERO.y + HERO.h - 100 - (2 - i) * 92;
    const ch = glassPanel(g2, { x, y, w, h: 76, r: 38, bg: heroBg, tint: "rgba(255,255,255,0.40)", band: 22, scale: 34 });
    ch.style.transform = `scale(${pop(t, t0)})`; ch.style.zIndex = 4;
    check(ch, 14, 14, 48, 1, GOLDC, "#0f2f2b");
    text(ch, s, { left: 78, top: 22, fontSize: "27px", fontWeight: 700, color: INK }, "abs ui");
  });
  riseText(g2, "TU RETIRO MERECE", { x: 64, y: HERO.y + HERO.h + 70, h: 88, p: seg(t, 20.75, 20.98), style: { fontSize: "74px", color: INK } });
  const l2 = riseText(g2, "UNA BUENA ", { x: 64, y: HERO.y + HERO.h + 158, h: 88, p: seg(t, 20.83, 21.06), style: { fontSize: "74px", color: INK } });
  l2.innerHTML = 'UNA BUENA <span style="color:#14463f">ASESORÍA.</span>';
}
function cursorStage(c, t) {
  if (t < 19.5) return;
  const P = [[19.5, 1500, 1350], [19.55, 330, 560, 20.0], [20.15, WIN.x + 600, WIN.y + 60], [20.6, 900, 1200], [21.6, WIN.x + WIN.w - 200, WIN.y + 118]];
  const k = cursorAt(t, P);
  const held = t > 20.0 && t < 20.5 ? 1 : k.down;
  if (t > 20.0 && t < 20.5) clickRing(c, k.x, k.y, 0.35);
  cursor(c, k.x, k.y, 1, held).style.zIndex = 20;
}

// ------------------------------------------------------------ escena 5 ------
// scroll: el hero se vuelve cuadro enmarcado; «Contacto» vuela abajo y se vuelve la figura negra
const FRAME_CARD = { x: 720 - 300, y: 230, w: 600, h: 520 };
const STATES = [[21.85, "CONTACTO RECIBIDO", "ok"], [22.1, "REVISIÓN DE REQUISITOS", "bar"], [22.35, "ASESORÍA PERSONALIZADA", "bar"], [22.6, "SEGUIMIENTO DE TU TRÁMITE", "route"]];
function segOrder(c, t) {
  c.style.background = "var(--ivory)";
  const sc = spring(t - 21.75, { f: 1.9, z: 0.85 });
  // la ventana y su página siguen; el contenido sube
  const win = box(c, WIN, { background: "#fbf8f2", overflow: "hidden", boxShadow: "0 50px 90px -40px rgba(30,24,14,0.45), 0 0 0 1.5px rgba(20,16,10,0.08)", zIndex: 4 });
  const pg = div(win, { left: 0, top: 0, width: WIN.w, height: WIN.h });
  div(pg, { left: 0, top: 0, width: WIN.w, height: 86, background: "#eee8dc", zIndex: 3 });
  [0, 1, 2].forEach((i) => div(pg, { left: 34 + i * 30, top: 36, width: 15, height: 15, borderRadius: 8, background: "#cfc7b9", zIndex: 3 }));
  const body = div(pg, { left: 0, top: -360 * sc, width: WIN.w, height: WIN.h + 400 });
  // el hero se encoge a cuadro: paspartú y moldura crecen desde la orilla de la foto
  const HERO = { x: 0, y: 86, w: WIN.w, h: 760 };
  const card = { x: FRAME_CARD.x - WIN.x, y: FRAME_CARD.y - WIN.y + 360, w: FRAME_CARD.w, h: FRAME_CARD.h };
  const R = rectLerp(HERO, card, sc);
  const mold = 16 * sc, mat = 34 * sc;
  const fr = box(body, { x: R.x - mold - mat, y: R.y - mold - mat, w: R.w + 2 * (mold + mat), h: R.h + 2 * (mold + mat) }, { background: "linear-gradient(135deg, #2a2a2a, #111 40%, #0b0b0b)", boxShadow: `0 ${30 * sc}px ${50 * sc}px -20px rgba(30,20,10,${0.4 * sc})` });
  div(fr, { left: mold, top: mold, width: R.w + 2 * mat, height: R.h + 2 * mat, background: "#f7f3eb" });
  photo(fr, IMG.oficina, mold + mat, mold + mat, R.w, R.h, "50% 45%");
  // títulos que suben con el scroll
  const ty = R.y + R.h + mold + mat + 50;
  riseText(body, "ASESORÍA AFORE PRO", { x: 0, y: ty, h: 70, p: seg(t, 21.8, 22.0), style: { fontSize: "58px", color: INK, width: WIN.w + "px", textAlign: "center" } });
  // la figura negra (sale del botón «Contacto» de la barra)
  const btn0 = { x: WIN.x + WIN.w - 72 - 250 - 16 + 36, y: WIN.y + 86 + 32 + 16, w: 250, h: 76 };
  const fly = spring(t - 21.8, { f: 2.0, z: 0.8 });
  const idx = STATES.reduce((a, s, i) => (t >= s[0] ? i : a), -1);
  const wFor = (s) => { const g = document.createElement("canvas").getContext("2d"); g.font = '700 40px "Geist"'; return g.measureText(s).width + 170; };
  let target = { x: 720 - wFor(STATES[0][1]) / 2, y: 1020, w: wFor(STATES[0][1]), h: 120 };
  // el ancho cambia con un resorte por estado
  let w = btn0.w;
  w = springs(t, btn0.w, STATES.map((s) => [s[0] - 0.06, wFor(s[1])]).concat([[22.94, 760]]), { f: 3.4, z: 0.8 });
  const h = lerp(btn0.h, 120, fly);
  const toCenter = t > 23.0 ? spring(t - 23.0, { f: 2.2, z: 0.82 }) : 0;
  const cy = lerp(lerp(btn0.y + btn0.h / 2, 1080, fly), 720, toCenter);
  const cx = lerp(btn0.x + btn0.w / 2, 720, fly);
  const S = { x: cx - w / 2, y: cy - h / 2, w, h, r: h / 2 };
  const sh = box(c, S, { background: "#0b0b0c", boxShadow: `inset 0 0 0 1.5px rgba(222,186,110,${0.55}), 0 30px 60px -24px rgba(0,0,0,0.45)`, zIndex: 10, overflow: "hidden" });
  const items = [[21.7, "Contacto"], ...STATES.map((s) => [s[0], s[1]]), [23.0, "QUIERO RECIBIR ASESORÍA"]];
  swapText(sh, items, t, { x: 110, y: (h - 60) / 2, w: w - 130, h: 60, style: { fontSize: "40px", fontWeight: 700, color: WHITE, letterSpacing: "0.02em" } });
  // ícono a la izquierda: ✓, barra que se dibuja, ruta con punto
  if (idx >= 0 && t < 23.0) {
    const st = STATES[idx];
    if (st[2] === "ok") check(sh, 26, (h - 64) / 2, 64, seg(t, st[0], st[0] + 0.2), INK, GOLDC);
    if (st[2] === "bar") { const u = easeOut(seg(t, st[0], st[0] + 0.25)); div(sh, { left: 30, top: h / 2 - 5, width: 54, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.2)" }); div(sh, { left: 30, top: h / 2 - 5, width: 54 * u, height: 10, borderRadius: 5, background: GOLDC }); }
    if (st[2] === "route") { const u = easeOut(seg(t, st[0], st[0] + 0.3)); svgEl(sh, 22, h / 2 - 30, 70, 60, `<path d="M6 46 C24 46 22 14 40 14 S62 30 64 14" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="5" stroke-linecap="round"/><circle cx="${lerp(6, 64, u)}" cy="${lerp(46, 14, u)}" r="8" fill="${GOLDC}"/>`); }
  } else if (t >= 23.0) svgEl(sh, 40, h / 2 - 22, 44, 44, `<path d="M22 4 C12 4 4 12 4 21 C4 25 5 28 7 31 L5 40 L14 37 C16 39 19 40 22 40 C32 40 40 32 40 22 C40 12 32 4 22 4 Z" fill="none" stroke="${GOLDC}" stroke-width="4"/>`, { transform: `scale(${pop(t, 23.0)})` });
  // cursor: clic en «QUIERO RECIBIR ASESORÍA»
  const P = [[21.7, WIN.x + WIN.w - 200, WIN.y + 118], [21.8, 1200, 1250], [22.95, 900, 760, 23.2]];
  const k = cursorAt(t, P);
  if (t > 23.2) clickRing(c, 900, 760, seg(t, 23.2, 23.6));
  cursor(c, k.x, k.y, 1, k.down).style.zIndex = 20;
  return S;
}

// ------------------------------------------------------------ escena 6 ------
// inunda negro → un beat negro → se contrae en el cuadro de la pared real → iris → firma → regresa
const WF = (() => { const s = 460, mat = 40, mold = 18, tot = s + 2 * (mat + mold); return { s, mat, mold, tot, x: (W - tot) / 2, y: 262 }; })();
async function wallFrame(t) { // cuadro del video de la pared (blob URL, se espera «seeked»)
  const v = window.__pared; if (!v) return null;
  const want = clamp(t - 23.9, 0, v.duration - 0.05);
  if (Math.abs(v.currentTime - want) > 1e-3) { await new Promise((r) => { v.onseeked = r; v.currentTime = want; }); }
  const cv = document.createElement("canvas"); cv.width = W; cv.height = W; cv.getContext("2d").drawImage(v, 0, 0, W, W);
  return cv.toDataURL("image/jpeg", 0.92);
}
function segWall(c, t, wallUrl) {
  // debajo, mientras inunda: la escena anterior
  if (t < 23.56) segOrder(c, t);
  else {
    const wbg = (el) => { if (wallUrl) photo(el, wallUrl, 0, 0, W, W); else photo(el, IMG.pared, 0, 0, W, W); };
    wbg(c);
    // pregunta (24.5)
    ["¿QUIERES SABER CUÁNTO", "PUEDES RETIRAR?"].forEach((s, i) =>
      riseText(c, s, { x: 0, y: 56 + i * 84, h: 88, p: seg(t, 24.5 + i * 0.08, 24.75 + i * 0.08), style: { fontSize: "74px", color: INK, width: W + "px", textAlign: "center" } }));
    // el cuadro
    const f = WF;
    div(c, { left: f.x + 16, top: f.y + 24, width: f.tot, height: f.tot, background: "rgba(48,30,10,0.32)", filter: "blur(16px)" });
    const fr = div(c, { left: f.x, top: f.y, width: f.tot, height: f.tot, background: "linear-gradient(135deg, #2a2a2a, #111 40%, #0b0b0b)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" });
    const mg = easeOut(seg(t, 24.15, 24.4));
    const mt = div(fr, { left: f.mold, top: f.mold, width: f.s + 2 * f.mat, height: f.s + 2 * f.mat, background: "#f7f3eb", boxShadow: "inset 0 4px 8px rgba(0,0,0,0.22)", clipPath: `inset(${(1 - mg) * 50}% round 2px)` });
    photo(mt, IMG.familia, f.mat, f.mat, f.s, f.s, "50% 60%");
    // iris sobre la foto: cerrado al llegar, abre en 24.5, cierra en 26.25
    const open = t < 24.5 ? 0 : t < 26.25 ? spring(t - 24.5, { f: 2.6, z: 0.5 }) : 1 - ease(seg(t, 26.25, 26.4));
    if (open < 1.02) {
      const cl = div(c, { left: 0, top: 0, width: W, height: W });
      const px = f.x + f.mold + f.mat, py = f.y + f.mold + f.mat;
      cl.style.clipPath = `inset(${py}px ${W - px - f.s}px ${W - py - f.s}px ${px}px)`;
      irisBrand(cl, { cx: px + f.s / 2, cy: py + f.s / 2, R: f.s * 0.72, open: Math.max(0, open), rot: 0.5 * (1 - Math.min(1, open)) });
    }
    // firma de marca (25.0): logo, regla dorada, WhatsApp y Durango
    if (t > 24.95) {
      const by = f.y + f.tot + 40, up = spring(t - 25.0, { f: 2.0, z: 0.8 });
      const m = div(c, { left: 0, top: by - 20, width: W, height: 360, overflow: "hidden" });
      const bar = div(m, { left: 120, top: 20 + (1 - up) * 360, width: 1200, height: 300, borderRadius: 56, overflow: "hidden", ...brandSurface() });
      const lg = logo(bar, 18, 6, 288); lg.style.transform = `scale(${pop(t, 25.25)})`;
      goldRule(bar, 330, 60, 180 * easeOut(seg(t, 25.15, 25.35)));
      riseText(bar, "CONTÁCTANOS POR WHATSAPP", { x: 376, y: 52, h: 44, p: seg(t, 25.1, 25.3), style: { fontSize: "30px", fontWeight: 700, letterSpacing: "0.1em", color: GOLDC, lineHeight: "44px" }, cls: "ui" });
      riseText(bar, "618 367 7047", { x: 372, y: 100, h: 112, p: seg(t, 25.15, 25.38), style: { fontSize: "100px", color: WHITE } });
      riseText(bar, "DURANGO, DURANGO", { x: 378, y: 218, h: 40, p: seg(t, 25.25, 25.45), style: { fontSize: "26px", fontWeight: 600, letterSpacing: "0.26em", color: "rgba(226,226,222,0.75)", lineHeight: "40px" }, cls: "ui" });
      ["Asesoría privada. El trámite oficial es gratuito. No se garantiza autorización ni monto.", "Honorarios: 30% de lo retirado."].forEach((s, i) =>
        riseText(c, s, { x: 0, y: by + 300 + 22 + i * 30, h: 30, p: seg(t, 25.5 + i * 0.06, 25.7 + i * 0.06), style: { fontSize: "22px", fontWeight: 600, color: "rgba(40,30,18,0.9)", width: W + "px", textAlign: "center", lineHeight: "30px" }, cls: "ui" }));
    }
  }
  // negro: inunda desde el botón (23.25–23.55), un beat negro, se contrae en la moldura del cuadro (24.0–24.3)
  const flood = easeIn(seg(t, 23.25, 23.55));
  if (t < 24.0 && flood > 0) div(c, { left: 900 - 2100 * flood, top: 760 - 2100 * flood, width: 4200 * flood, height: 4200 * flood, borderRadius: "50%", background: "#0b0b0c", zIndex: 30 });
  if (t >= 24.0 && t < 24.32) {
    const u = easeOut(seg(t, 24.0, 24.3));
    const R = rectLerp({ x: -60, y: -60, w: W + 120, h: W + 120 }, { x: WF.x, y: WF.y, w: WF.tot, h: WF.tot }, u);
    box(c, R, { background: "#0b0b0c", zIndex: 30 });
  }
  // regreso: el marco inunda (26.4–26.62) → píldora (–26.76) → punto (–26.86) → las letras salen (–26.98)
  if (t >= 26.4) {
    const fl = easeIn(seg(t, 26.4, 26.62));
    let R = rectLerp({ x: WF.x, y: WF.y, w: WF.tot, h: WF.tot, r: 0 }, { x: -80, y: -80, w: W + 160, h: W + 160, r: 0 }, fl);
    let bg = "#0b0b0c";
    if (t >= 26.62) {
      c.innerHTML = ""; c.style.background = "var(--ivory)";
      const L = wordmarkLayout(), cap = WM.size * 0.72;
      const dot = { x: L.dotX - L.dot / 2, y: WM.y + cap / 2 - L.dot - 2, w: L.dot, h: L.dot, r: L.dot / 2 };
      const u1 = ease(seg(t, 26.62, 26.76)), u2 = ease(seg(t, 26.76, 26.86));
      R = rectLerp({ x: -80, y: -80, w: W + 160, h: W + 160, r: 0 }, { ...PILL, r: PILL.h / 2 }, u1);
      if (u1 >= 1) R = rectLerp({ ...PILL, r: PILL.h / 2 }, dot, u2);
      R.r = Math.min(R.r, R.h / 2);
      bg = null;
      if (t >= 26.86) { drawWordmark(c, backOut(seg(t, 26.86, 26.975)), 1); return; }
      box(c, R, { ...brandSurface(), zIndex: 30 });
      return;
    }
    box(c, R, { background: bg, zIndex: 30 });
  }
}

// ----------------------------------------------------------------- seek -----
const STILLS = { open: 1.45, glass: 6.7, stage: 21.3, wall: 25.6 };
let __loaded = false;
async function prepare() {
  if (__loaded) return; __loaded = true;
  await document.fonts.ready;
  await Promise.all([document.fonts.load('800 100px "Archivo"'), document.fonts.load('600 40px "Geist"'), document.fonts.load('700 40px "Geist"')]);
  await Promise.all(Object.values(IMG).map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })));
  // el video de la pared: se carga como blob URL para poder buscar cuadro por cuadro
  try {
    const b = await (await fetch("assets/pared_intra.mp4")).blob();
    const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = URL.createObjectURL(b);
    await new Promise((r) => { v.onloadeddata = r; v.onerror = r; });
    window.__pared = v;
  } catch (e) { console.log("sin video de pared:", e.message); }
}
async function seek(t, which) {
  await prepare();
  if (which && STILLS[which] !== undefined) t = STILLS[which];
  t = clamp(t, 0, TOTAL - 1e-4);
  document.getElementById("defs").innerHTML = ""; addGoo();
  const c = cam(); c.innerHTML = ""; c.style.background = "";
  const [z, fx, fy] = camAt(t); setCam(z, fx, fy);
  let wallUrl = null;
  if (t >= 23.9 && t < 26.7) wallUrl = await wallFrame(t);
  if (t < 3.9) segOpen(c, t);
  else if (t < 8.0) segGlass(c, t);
  else if (t < 18.0) { const lk = div(c, { left: 0, top: 0, width: W, height: W }); lockscreen(lk, t); }
  else if (t < 21.75) segStage(c, t);
  else if (t < 23.25) segOrder(c, t);
  else segWall(c, t, wallUrl);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
window.seek = seek; window.STILLS = STILLS; window.TOTAL = TOTAL;

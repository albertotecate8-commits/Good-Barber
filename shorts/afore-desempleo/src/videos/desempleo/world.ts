// El mundo del short "Dos vecinos": una calle de Durango que termina en la Catedral (con el cerro detrás), la fábrica,
// la oficina con su fila, la sala de Ramiro y la oficina de Afore Pro. Personajes y objetos son tarjetas planas
// iluminadas por la escena (cardShade) en la capa NOINK; el mundo lleva la tinta de la skill.
import * as THREE from "three";
import { ctex, rep, rng, cobbleHD, stoneHD, cloudHD, facadeHD, jit, planksHD, brick } from "./paint";
import { Pen, Outfit } from "./toon";
import { LIGHTS, LOOK } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { cardShade, CARD_K, blobMaterial } from "./cardshade";
import { RAMIRO, TONO, ASESORA, PERSONA_A, PERSONA_B, FILA, drawPerson, drawPerro, drawIdeas, drawReq, drawCheck, CAJA, celular, sobre, HOJA, BILLETES, CORREA, Idea, Req } from "./personajes";
import { FPS, V3, camAt, spritesAt, Sprite, billAt, BILLS, coinAt, cochinitoK, SPOT, SALA_X, OFI_X, lightAt } from "./story";
const lam = (map: THREE.Texture | null, color: THREE.ColorRepresentation = "#ffffff", extra: THREE.MeshLambertMaterialParameters = {}) =>
  twoTone(new THREE.MeshLambertMaterial({ map, color, ...extra }));
const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true;
  return me;
};
/** caja con la textura repetida por metro (UV en metros / tile) */
const stoneBox = (w: number, h: number, d: number, tex: THREE.Texture, tile: number, x: number, y: number, z: number, color = "#ffffff") => {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const su = nx > 0.5 ? d : w, sv = ny > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  const me = new THREE.Mesh(g, lam(tex, color));
  me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true;
  return me;
};

// ---------------- texturas pintadas ----------------
const CANTERA = ["#d9b79b", "#d1ad90", "#ddc0a6", "#cba486"];
const cantera = () => stoneHD("cantera", CANTERA, "#a7836a");
const INK = "#2a1d24";

/** portada barroca de la Catedral: tres cuerpos con columnas, nichos, puerta de arco y ventana del coro */
const portada = () => ctex("portada", 1024, 2048, (g, r) => {
  const W = 1024, H = 2048;
  g.fillStyle = "#d8b69a"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { g.fillStyle = jit(r, "#d3ae90", 0.06); g.globalAlpha = 0.35; g.fillRect(r() * W, r() * H, 6 + r() * 30, 3 + r() * 10); }
  g.globalAlpha = 1;
  g.lineWidth = 7; g.strokeStyle = INK; g.lineJoin = "round";
  const col = (x: number, y0: number, y1: number, w = 46) => {
    g.fillStyle = "#e6c9ae"; g.fillRect(x - w / 2, y0, w, y1 - y0); g.strokeRect(x - w / 2, y0, w, y1 - y0);
    g.lineWidth = 3; for (let y = y0 + 28; y < y1; y += 34) { g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y - 16, x + w / 2, y); g.stroke(); }
    g.lineWidth = 7; g.fillStyle = "#c79f80"; g.fillRect(x - w / 2 - 10, y0 - 22, w + 20, 22); g.strokeRect(x - w / 2 - 10, y0 - 22, w + 20, 22);
    g.fillRect(x - w / 2 - 10, y1, w + 20, 22); g.strokeRect(x - w / 2 - 10, y1, w + 20, 22);
  };
  const cornisa = (y: number) => { g.fillStyle = "#c79f80"; g.fillRect(0, y, W, 34); g.strokeRect(-10, y, W + 20, 34); g.fillStyle = "#e3c5a9"; g.fillRect(0, y + 34, W, 14); g.strokeRect(-10, y + 34, W + 20, 14); };
  const nicho = (x: number, y: number, w = 90, h = 190) => {
    g.fillStyle = "#8c6656"; g.beginPath(); g.moveTo(x - w / 2, y + h); g.lineTo(x - w / 2, y + w / 2); g.arc(x, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w / 2, y + h); g.closePath(); g.fill(); g.stroke();
    // santo: silueta sencilla
    g.fillStyle = "#e8d2bd"; g.beginPath(); g.ellipse(x, y + 62, 17, 19, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 26, y + h - 8); g.quadraticCurveTo(x - 30, y + 90, x, y + 82); g.quadraticCurveTo(x + 30, y + 90, x + 26, y + h - 8); g.closePath(); g.fill(); g.stroke();
  };
  // cuerpo 1: puerta de arco
  cornisa(1290);
  [130, 300, 724, 894].forEach((x) => col(x, 1360, 2010));
  g.fillStyle = "#e3c5a9"; g.beginPath(); g.moveTo(370, H); g.lineTo(370, 1640); g.arc(512, 1640, 142, Math.PI, 0); g.lineTo(654, H); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#5a3424"; g.beginPath(); g.moveTo(400, H); g.lineTo(400, 1650); g.arc(512, 1650, 112, Math.PI, 0); g.lineTo(624, H); g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(512, 1540); g.lineTo(512, H); g.stroke();
  for (let y = 1700; y < H; y += 90) { g.strokeRect(420, y, 75, 70); g.strokeRect(529, y, 75, 70); }
  g.lineWidth = 7;
  for (let k = 0; k < 9; k++) { const a = Math.PI + (Math.PI * k) / 8; g.beginPath(); g.moveTo(512 + 112 * Math.cos(a), 1650 + 112 * Math.sin(a)); g.lineTo(512 + 142 * Math.cos(a), 1640 + 142 * Math.sin(a)); g.stroke(); }
  nicho(215, 1520); nicho(809, 1520);
  // cuerpo 2: ventana del coro + nichos
  cornisa(660);
  [190, 340, 684, 834].forEach((x) => col(x, 730, 1270, 40));
  g.fillStyle = "#e3c5a9"; g.beginPath(); g.ellipse(512, 1000, 128, 170, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = "#33485e"; g.beginPath(); g.ellipse(512, 1000, 92, 132, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.lineWidth = 3; g.strokeStyle = "#7d8fa3"; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(512 + k * 34, 880); g.lineTo(512 + k * 34, 1120); g.stroke(); }
  g.lineWidth = 7; g.strokeStyle = INK;
  nicho(265, 880, 80, 170); nicho(759, 880, 80, 170);
  // cuerpo 3: remate con reloj
  [330, 694].forEach((x) => col(x, 260, 640, 38));
  g.fillStyle = "#f4ecdc"; g.beginPath(); g.arc(512, 430, 100, 0, Math.PI * 2); g.fill(); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(512, 430); g.lineTo(512, 362); g.moveTo(512, 430); g.lineTo(560, 450); g.stroke();
  g.lineWidth = 5; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(512 + 80 * Math.cos(a), 430 + 80 * Math.sin(a)); g.lineTo(512 + 92 * Math.cos(a), 430 + 92 * Math.sin(a)); g.stroke(); }
  g.lineWidth = 7;
  // volutas a los lados del remate
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(512 + s * 240, 650); g.quadraticCurveTo(512 + s * 330, 520, 512 + s * 220, 420); g.stroke(); g.beginPath(); g.arc(512 + s * 228, 418, 22, 0, Math.PI * 2); g.stroke(); }
});

/** cuerpo de campanas de las torres: arcos abiertos con campana adentro, pilastras */
const campanario = () => ctex("campanario", 512, 640, (g, r) => {
  const W = 512, H = 640;
  g.fillStyle = "#d8b69a"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { g.fillStyle = jit(r, "#d0aa8c", 0.06); g.globalAlpha = 0.35; g.fillRect(r() * W, r() * H, 6 + r() * 26, 3 + r() * 8); }
  g.globalAlpha = 1; g.lineWidth = 6; g.strokeStyle = INK;
  g.fillStyle = "#3b2830"; g.beginPath(); g.moveTo(120, H - 40); g.lineTo(120, 230); g.arc(256, 230, 136, Math.PI, 0); g.lineTo(392, H - 40); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#c9932f"; g.beginPath(); g.moveTo(206, 380); g.quadraticCurveTo(210, 270, 256, 268); g.quadraticCurveTo(302, 270, 306, 380); g.lineTo(326, 410); g.lineTo(186, 410); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#e3c5a9"; g.fillRect(0, 0, 40, H); g.fillRect(W - 40, 0, 40, H); g.strokeRect(0, -10, 40, H + 20); g.strokeRect(W - 40, -10, 40, H + 20);
  g.fillStyle = "#c79f80"; g.fillRect(0, H - 40, W, 40); g.strokeRect(-10, H - 40, W + 20, 40);
  g.fillStyle = "#e3c5a9"; g.fillRect(150, H - 70, 212, 30); g.strokeRect(150, H - 70, 212, 30);
});

/** papel picado: hoja de color con figuras recortadas (alfa) */
const PICADO = ["#e8336d", "#ff8a1f", "#ffd12e", "#33b864", "#2f8be0", "#9b4fd6", "#ff5aa5", "#22c3c3"];
const picado = (ci: number, kind: number) => ctex(`picado${ci}_${kind}`, 256, 320, (g) => {
  const W = 256, H = 320;
  g.fillStyle = PICADO[ci]; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "destination-out";
  // flecos abajo
  g.beginPath(); for (let x = 0; x <= W; x += 32) { g.moveTo(x, H); g.lineTo(x + 16, H - 34); g.lineTo(x + 32, H); } g.fill();
  // borde de rombitos
  for (let x = 20; x < W - 10; x += 36) { g.beginPath(); g.moveTo(x, 28); g.lineTo(x + 9, 18); g.lineTo(x + 18, 28); g.lineTo(x + 9, 38); g.fill(); }
  const cx = W / 2, cy = 160;
  if (kind === 0) { // flor
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.ellipse(cx + 48 * Math.cos(a), cy + 48 * Math.sin(a), 22, 12, a, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill();
  } else if (kind === 1) { // pajarito
    g.beginPath(); g.ellipse(cx, cy + 6, 52, 30, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx + 52, cy - 22, 20, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx - 40, cy); g.lineTo(cx - 92, cy - 34); g.lineTo(cx - 84, cy + 18); g.fill();
  } else { // estrella y corazones
    g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 26 : 62; g.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 82, cy + 70, 14, 0, Math.PI * 2); g.fill(); }
  }
  for (let y = 70; y < 260; y += 46) for (const x of [26, W - 26]) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = "source-over";
});

/** tierra y matorral del cerro */
const cerroTex = () => ctex("cerro", 1024, 1024, (g, r) => {
  g.fillStyle = "#8d8a55"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = jit(r, ["#7e8a4c", "#9a8d5a", "#6f7a45", "#a3865f"][i % 4], 0.12);
    g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 6 + r() * 18, 4 + r() * 10, 0, 0, Math.PI * 2); g.fill();
  }
});
const contactTex = () => ctex("contacto", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgb(70,72,110)"); gr.addColorStop(0.55, "rgb(150,152,190)"); gr.addColorStop(1, "rgb(255,255,255)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// ---------------- letreros ----------------
const sign = (key: string, lines: [string, number, string][], w: number, h: number, bg: string, border = INK) => ctex("sign_" + key, w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = Math.max(8, h * 0.06); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  g.textAlign = "center"; g.textBaseline = "middle";
  const tot = lines.reduce((a, l) => a + l[1] * 1.15, 0); let y = h / 2 - tot / 2;
  for (const [t, size, col] of lines) { g.font = `800 ${size}px Baloo, "DejaVu Sans", sans-serif`; g.fillStyle = col; g.fillText(t, w / 2, y + size * 0.6); y += size * 1.15; }
});
const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; return m;
};
/** vista por la ventana de la sala: cielo, cerro y las torres de la Catedral */
const ventanaTex = () => ctex("ventana", 512, 512, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, "#5c9be0"); gr.addColorStop(1, "#bcd6f0"); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#8d8a55"; g.beginPath(); g.moveTo(0, 360); g.quadraticCurveTo(200, 250, 512, 330); g.lineTo(512, 512); g.lineTo(0, 512); g.fill();
  g.fillStyle = "#e3c4a7"; for (const x of [210, 300]) { g.fillRect(x, 260, 40, 190); g.beginPath(); g.ellipse(x + 20, 262, 22, 30, 0, Math.PI, 0); g.fill(); }
  g.fillRect(240, 330, 70, 120);
  g.fillStyle = "#e9b44c"; g.fillRect(0, 440, 512, 72);
  g.strokeStyle = "#f7f3ea"; g.lineWidth = 22; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
});
const billTex = () => ctex("billete", 256, 120, (g) => {
  g.fillStyle = "#8fca72"; g.fillRect(0, 0, 256, 120); g.strokeStyle = "#3f7a3a"; g.lineWidth = 8; g.strokeRect(6, 6, 244, 108);
  g.fillStyle = "#6aa856"; g.beginPath(); g.ellipse(128, 60, 30, 34, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2f5f2c"; g.font = "800 40px Baloo, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", 128, 62);
  g.fillText("500", 52, 30); g.fillText("500", 204, 92);
});
const tiraTex = () => ctex("chimenea", 64, 256, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f4efe6" : "#c43b32"; g.fillRect(0, i * 32, 64, 32); } });

// ---------------- personajes y objetos (tarjetas) ----------------
const SU = 0.00216; // m por unidad de diseño (1000 unidades = 2.16 m)
class Card {
  cv = document.createElement("canvas"); tex: THREE.CanvasTexture; mesh: THREE.Mesh; blob: THREE.Mesh | null = null; key = "";
  constructor(parent: THREE.Object3D, k = 1.0, blobMat: THREE.Material | null = null) {
    this.cv.width = Math.round(600 * k); this.cv.height = Math.round(1000 * k);
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(600 * SU, 1000 * SU); geo.translate(0, 475 * SU, 0); // pies (y = 975) en y = 0
    const m = cardShade(new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh.onBeforeRender = (rr) => { const rt = rr.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : rr.domElement.height) / 1920; };
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    if (blobMat) {
      this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), blobMat);
      this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 0.5; this.blob.layers.set(NOINK); parent.add(this.blob);
    }
  }
  draw(key: string, fn: (p: Pen) => void) {
    if (key === this.key) return;
    this.key = key;
    const g = this.cv.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(this.cv.width / 600, 0, 0, this.cv.height / 1000, 0, 0);
    fn(new Pen(g));
    this.tex.needsUpdate = true;
  }
  show(v: boolean) { this.mesh.visible = v; if (this.blob) this.blob.visible = v; }
}
const OUTFIT: Record<string, Outfit> = { ramiro: RAMIRO, tono: TONO, asesora: ASESORA, pA: PERSONA_A, pB: PERSONA_B };
const SEED: Record<string, number> = { ramiro: 11, tono: 23, asesora: 31, pA: 41, pB: 53 };
const holdOf = (s: Sprite) => {
  switch (s.hold) {
    case "caja": return CAJA;
    case "celular": return celular(Number(s.arg ?? 0));
    case "sobre": return sobre(Number(s.arg ?? 0));
    case "hoja": return HOJA;
    case "billetes": return BILLETES;
    case "correa": return CORREA;
    default: return null;
  }
};
const PEOPLE = new Set(["ramiro", "tono", "asesora", "pA", "pB", "fila", "perro"]);

// ---------------- el mundo ----------------
export class World {
  root = new THREE.Group();
  private sun: THREE.DirectionalLight; private hemi: THREE.HemisphereLight;
  private fog = new THREE.Fog("#b8d0ec", 40, 700);
  private skyMat: THREE.ShaderMaterial; private sky: THREE.Mesh;
  private cards = new Map<string, Card>();
  private blobMat = blobMaterial(contactTex());
  private flags: { m: THREE.Mesh; ph: number }[] = [];
  private bills: THREE.InstancedMesh; private coin: THREE.Mesh; private cochinito = new THREE.Group();
  private dummy = new THREE.Object3D();
  private light = "";

  constructor() {
    const R = this.root;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cloudHD(i + 3), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.05, 1.05, 1.05) }));
      const a = -1.2 + i * 0.4, d = 560 + (i % 3) * 60;
      m.position.set(Math.sin(a) * d, 120 + (i % 3) * 45 + i * 6, -Math.cos(a) * d); m.scale.set(170 + (i % 2) * 70, 85 + (i % 2) * 35, 1);
      m.lookAt(0, m.position.y * 0.7, 0); m.layers.set(NOINK); m.renderOrder = -0.5;
      R.add(m);
    }
    this.hemi = new THREE.HemisphereLight("#dcecff", "#b49a78", 0.55);
    this.sun = new THREE.DirectionalLight("#fff3e0", 2.8);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    R.add(this.hemi, this.sun, this.sun.target);
    this.setLight("day");

    this.buildCalle();
    this.buildCatedral();
    this.buildPicado();
    this.buildCerro();
    this.buildFabrica();
    this.buildFila();
    this.buildSala();
    this.buildOficina();
    this.buildCochinito();
    // billetes del gancho y la moneda de Toño
    const bm = lam(billTex(), "#ffffff", { side: THREE.DoubleSide });
    this.bills = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.14), bm, BILLS);
    this.bills.castShadow = true; this.bills.frustumCulled = false; R.add(this.bills);
    const gold = twoTone(new THREE.MeshLambertMaterial({ color: "#ffcc33", emissive: "#5a3a00", emissiveIntensity: 0.6 }), 1.5);
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 28), gold); this.coin.castShadow = true; R.add(this.coin);
  }

  private setLight(name: "day" | "golden") {
    if (this.light === name) return;
    this.light = name;
    const L = LIGHTS[name], K = LOOK[name];
    K.sky.c.forEach((h, i) => untone(h, (this.skyMat.uniforms["c" + i].value as THREE.Color)));
    const e = K.sky.e.map((d) => THREE.MathUtils.degToRad(d));
    (this.skyMat.uniforms.e.value as THREE.Vector4).set(e[1], e[2], e[3], e[4]);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    untone(L.fog, this.fog.color);
    this.sun.color.set(L.sunCol); this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground);
  }

  private buildCalle() {
    const R = this.root;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), lam(rep(cobbleHD(), 2400 / 8, 2400 / 8)));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; R.add(ground);
    const banq = stoneHD("losas", ["#e2cdb6", "#d9c2aa", "#e8d6c1", "#d2b9a0"], "#b39b84");
    for (const s of [-1, 1]) R.add(stoneBox(3, 0.18, 230, banq, 2.5, s * 7.6, 0.09, -55));
    const cols = [["#e9b44c", "#2f6b8a"], ["#d9663f", "#3b6b3f"], ["#f2d7a6", "#8a3b2f"], ["#7fb3c9", "#7a4a2a"], ["#e58fa0", "#2f5f7a"], ["#c9d97f", "#6b3f2a"], ["#f0a35e", "#2f4f7a"]];
    let i = 0;
    for (const side of [-1, 1]) for (let z = -150; z < 62; z += 10.8) {
      if (side < 0 && z > -58 && z < -22) continue; // fábrica
      if (side > 0 && z > 16 && z < 46) continue;  // oficina
      const [wall, sh] = cols[i++ % cols.length], h = 6.5 + (i % 3) * 1.6;
      const tex = facadeHD(`casa${i}`, 10.6, h, { wall, shutter: sh, door: true });
      const mats = [lam(null, wall), lam(null, wall), lam(null, "#9b5a3c"), lam(null, wall), lam(null, wall), lam(null, wall)];
      mats[side < 0 ? 0 : 1] = lam(tex);
      const g = new THREE.Mesh(new THREE.BoxGeometry(6, h, 10.6), mats);
      g.position.set(side * 12, h / 2, z); g.castShadow = true; g.receiveShadow = true; R.add(g);
      R.add(box(6.4, 0.45, 11, lam(null, "#f3ead8"), side * 12, h + 0.22, z));
    }
    const lampM = lam(null, "#24302c");
    for (const s of [-1, 1]) for (let z = -120; z < 50; z += 18) {
      R.add(box(0.14, 4.2, 0.14, lampM, s * 6.6, 2.1, z + (s > 0 ? 9 : 0)));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.15, 0.45, 8), lam(null, "#fff1c4", { emissive: "#6b5a20" }));
      head.position.set(s * 6.6, 4.4, z + (s > 0 ? 9 : 0)); R.add(head);
    }
  }

  private buildCatedral() {
    const R = this.root, ct = cantera();
    const Z = -176;
    R.add(stoneBox(18, 21, 52, ct, 4, 0, 10.5 + 0.3, Z - 26));
    R.add(stoneBox(40, 17, 12, ct, 4, 0, 8.5 + 0.3, Z - 34));
    R.add(box(18.6, 0.8, 52.6, lam(null, "#c59d80"), 0, 21.6, Z - 26));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), lam(portada()));
    front.position.set(0, 14.3, Z + 0.62); front.receiveShadow = true; R.add(front);
    R.add(stoneBox(15, 28, 0.6, ct, 4, 0, 14.3, Z + 0.3, "#e9cfb6"));
    const sh = new THREE.Shape(); sh.moveTo(-7, 0); sh.quadraticCurveTo(-6.5, 3.2, -3, 3.4); sh.quadraticCurveTo(0, 6.5, 3, 3.4); sh.quadraticCurveTo(6.5, 3.2, 7, 0); sh.lineTo(-7, 0);
    const rem = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }), lam(null, "#ddbb9f"));
    rem.position.set(0, 28.3, Z - 0.1); rem.castShadow = true; R.add(rem);
    this.cross(0, 34.9, Z + 0.35, 1.0);
    for (const s of [-1, 1]) {
      const x = s * 11.2;
      R.add(stoneBox(8, 30, 8, ct, 4, x, 15.3, Z - 2.5));
      R.add(box(8.8, 0.9, 8.8, lam(null, "#c79f80"), x, 30.7, Z - 2.5));
      this.belfry(x, 31.15, Z - 2.5, 7, 8.2);
      R.add(box(7.6, 0.8, 7.6, lam(null, "#c79f80"), x, 39.75, Z - 2.5));
      this.belfry(x, 40.15, Z - 2.5, 5.4, 6.2);
      R.add(box(6, 0.7, 6, lam(null, "#c79f80"), x, 46.7, Z - 2.5));
      const d = new THREE.Mesh(new THREE.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam(null, "#e3c4a7"));
      d.scale.y = 1.35; d.position.set(x, 47.05, Z - 2.5); d.castShadow = true; R.add(d);
      this.cross(x, 52.4, Z - 2.5, 0.9);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 6, 32), lam(null, "#d9b79b"));
    drum.position.set(0, 25, Z - 34); R.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(6.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lam(null, "#e9d27a"));
    dome.scale.y = 1.25; dome.position.set(0, 28, Z - 34); R.add(dome);
    this.cross(0, 38.6, Z - 34, 1.0);
  }
  private belfry(x: number, y0: number, z: number, w: number, h: number) {
    const m = lam(rep(campanario(), 1, 1)), cap = lam(null, "#d8b69a");
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [m, m, cap, cap, m, m]);
    me.position.set(x, y0 + h / 2, z); me.castShadow = true; me.receiveShadow = true; this.root.add(me);
  }
  private cross(x: number, y: number, z: number, s: number) {
    const m = lam(null, "#2b2b30");
    this.root.add(box(0.22 * s, 2.2 * s, 0.22 * s, m, x, y, z), box(1.2 * s, 0.22 * s, 0.22 * s, m, x, y + 0.35 * s, z));
  }

  private buildPicado() {
    const R = this.root, rope = lam(null, "#f4f1e8");
    const strands: [V3, V3][] = [];
    for (const z of [-62, -46, -30, -14, 12, 24]) strands.push([[-8.9, 6.0, z], [8.9, 6.0, z + 2]]);
    strands.push([[-8.9, 5.6, -3], [8.9, 5.8, -9]]);
    let n = 0;
    strands.forEach(([a, b], si) => {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), cnt = Math.floor(len / 0.62);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= cnt; i++) { const u = i / cnt, sag = 1.0 * 4 * u * (1 - u); pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag, a[2] + (b[2] - a[2]) * u)); }
      R.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.015, 4), rope));
      const dir = Math.atan2(b[2] - a[2], b[0] - a[0]);
      for (let i = 1; i < cnt; i++) {
        const p = pts[i], ci = (i + si * 3) % PICADO.length;
        const mat = lam(picado(ci, (i + si) % 3), "#ffffff", { alphaTest: 0.5, side: THREE.DoubleSide });
        const geo = new THREE.PlaneGeometry(0.5, 0.62); geo.translate(0, -0.31, 0);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(p); m.rotation.order = "YXZ"; m.rotation.y = -dir; m.castShadow = true;
        m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5, side: THREE.DoubleSide });
        R.add(m); this.flags.push({ m, ph: n++ * 0.7 });
      }
    });
  }

  private buildCerro() {
    const R = this.root, tex = cerroTex();
    const hill = (x: number, z: number, w: number, h: number, seed: number) => {
      const g = new THREE.PlaneGeometry(w, w * 0.6, 80, 40); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position as THREE.BufferAttribute, r = rng(seed);
      const bumps = Array.from({ length: 6 }, () => [(r() - 0.5) * w * 0.6, (r() - 0.5) * w * 0.25, w * (0.08 + 0.1 * r()), h * (0.1 + 0.15 * r())]);
      for (let i = 0; i < p.count; i++) {
        const X = p.getX(i), Z = p.getZ(i);
        let y = h * Math.exp(-((X / (w * 0.28)) ** 2) - ((Z / (w * 0.16)) ** 2));
        for (const [bx, bz, br, bh] of bumps) y += bh * Math.exp(-(((X - bx) / br) ** 2) - (((Z - bz) / br) ** 2));
        p.setY(i, y - 2);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, lam(rep(tex, 6, 4))); m.position.set(x, 0, z); m.receiveShadow = true; R.add(m);
    };
    hill(-40, -470, 520, 125, 3); hill(170, -520, 380, 80, 9); hill(-260, -440, 300, 60, 5);
  }

  private buildFabrica() {
    const R = this.root;
    // nave de ladrillo con ventanales, techo de dientes de sierra, chimenea y el portón con su letrero
    const tex = facadeHD("fabrica", 30, 9, { wall: "#b5533c", shutter: "#3b5b6b", door: false, brick: true });
    const wall = "#a84a36";
    const mats = [lam(tex), lam(null, wall), lam(null, "#8a8f96"), lam(null, wall), lam(null, wall), lam(null, wall)];
    const g = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 30), mats); g.position.set(-15, 4.5, -40); g.castShadow = true; g.receiveShadow = true; R.add(g);
    for (let k = 0; k < 5; k++) { // dientes de sierra
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(6, 0); sh.lineTo(6, 2.4); sh.lineTo(0, 0);
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 10, bevelEnabled: false }), lam(null, k % 2 ? "#9aa1a8" : "#8a9198"));
      m.rotation.y = Math.PI / 2; m.position.set(-20, 9, -25 - k * 6); m.castShadow = true; R.add(m);
    }
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 18, 16), lam(rep(tiraTex(), 1, 1)));
    ch.position.set(-17, 9, -52); ch.castShadow = true; R.add(ch);
    R.add(box(0.2, 3.8, 4.6, lam(null, "#3a3f46"), -9.95, 1.9, -40)); // portón
    R.add(box(0.3, 0.35, 5.2, lam(null, "#2b2b30"), -9.9, 3.95, -40));
    R.add(plane(6.5, 1.3, lam(sign("fabrica", [["FÁBRICA", 120, "#f4efe6"]], 1024, 205, "#2f4f6b", "#f4efe6")), -9.88, 5.2, -40, Math.PI / 2));
  }

  private buildFila() {
    const R = this.root;
    const tex = facadeHD("oficina", 30, 8, { wall: "#e7dcc4", shutter: "#2f6b8a", door: false });
    const wall = "#e7dcc4";
    const mats = [lam(null, wall), lam(tex), lam(null, "#9b5a3c"), lam(null, wall), lam(null, wall), lam(null, wall)];
    const g = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 30), mats); g.position.set(13, 4, 31); g.castShadow = true; g.receiveShadow = true; R.add(g);
    R.add(box(0.2, 2.8, 2.2, lam(null, "#4a3528"), 8.95, 1.4, 32.2)); // puerta
    R.add(plane(5.2, 1.0, lam(sign("oficina", [["OFICINA DE TRÁMITES", 96, "#2f3a46"]], 1024, 200, "#f6efe0", "#2f3a46")), 8.88, 3.6, 32.2, -Math.PI / 2));
    R.add(box(0.12, 1.0, 0.12, lam(null, "#c0353a"), 7.6, 0.5, 17.2)); // poste de la fila
  }

  private buildSala() {
    const R = this.root, X = SALA_X;
    R.add(stoneBox(7, 0.1, 6, rep(planksHD(), 1, 1), 2.5, X, 0.05, -0.5, "#e2b07a"));
    R.add(box(7.2, 3.2, 0.2, lam(null, "#f0c96a"), X, 1.6, -3.5));
    R.add(box(0.2, 3.2, 6, lam(null, "#e58a6a"), X - 3.6, 1.6, -0.5));
    R.add(box(0.2, 3.2, 6, lam(null, "#e58a6a"), X + 3.6, 1.6, -0.5));
    R.add(plane(1.5, 1.2, lam(ventanaTex()), X - 1.8, 1.85, -3.39));
    R.add(box(1.7, 0.12, 0.25, lam(null, "#f7f3ea"), X - 1.8, 1.18, -3.32));
    // sillón bajito (de caricatura)
    const sof = lam(null, "#3f8f7a"), sof2 = lam(null, "#357a68");
    R.add(box(2.6, 0.24, 0.85, sof, X, 0.17, -2.75), box(2.6, 0.7, 0.24, sof2, X, 0.55, -3.22));
    for (const s of [-1, 1]) R.add(box(0.24, 0.45, 0.9, sof2, X + s * 1.32, 0.32, -2.75));
    // cuadro, lámpara y tapete
    R.add(box(0.9, 0.7, 0.05, lam(null, "#8a5a34"), X + 1.6, 2.1, -3.37), plane(0.75, 0.55, lam(ventanaTex()), X + 1.6, 2.1, -3.34));
    R.add(box(0.06, 1.6, 0.06, lam(null, "#2b2b30"), X + 2.4, 0.8, -2.8));
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.4, 16), lam(null, "#fff1c4", { emissive: "#6b5a20" })); sh.position.set(X + 2.4, 1.75, -2.8); R.add(sh);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), lam(null, "#c0465a")); rug.rotation.x = -Math.PI / 2; rug.scale.y = 0.7; rug.position.set(X + 0.3, 0.105, -0.8); rug.receiveShadow = true; R.add(rug);
  }

  private buildOficina() {
    const R = this.root, X = OFI_X;
    const piso = stoneHD("losasOfi", ["#e9e4da", "#dfd8cb", "#f0ebe2", "#d8d0c2"], "#bcb3a4");
    R.add(stoneBox(22, 0.1, 9, piso, 1.2, X + 2.5, 0.05, 0.5));
    R.add(box(22, 3.4, 0.2, lam(null, "#d9efe9"), X + 2.5, 1.7, -3.5));
    R.add(box(0.2, 3.4, 9, lam(null, "#bfe3da"), X - 8.5, 1.7, 0.5));
    R.add(box(22, 0.3, 0.1, lam(null, "#1f9e8f"), X + 2.5, 1.0, -3.38)); // franja
    // la declaración: mostrador y su letrero
    R.add(box(3.6, 1.05, 0.7, lam(null, "#c9a77c"), X - 4, 0.53, -2.2), box(3.8, 0.08, 0.8, lam(null, "#8a5a34"), X - 4, 1.08, -2.2));
    R.add(plane(3.2, 0.8, lam(sign("decl", [["DECLARACIÓN ANUAL", 104, "#2f3a46"]], 1024, 256, "#ffffff", "#2f3a46")), X - 4, 2.45, -3.38));
    // Afore Pro: escritorio, letrero, planta
    R.add(box(1.9, 0.08, 0.85, lam(null, "#8a5a34"), X + 2.4, 0.78, -0.95));
    R.add(box(1.8, 0.74, 0.75, lam(null, "#f4efe6"), X + 2.4, 0.39, -0.95));
    R.add(box(0.5, 0.32, 0.04, lam(null, "#2b2f3a"), X + 2.0, 1.0, -1.1)); // monitor
    R.add(plane(3.6, 1.15, lam(sign("afore", [["AFORE PRO", 96, "#ffd23f"], ["Asesoría que impulsa tu futuro", 42, "#ffffff"]], 1024, 330, "#1f9e8f", "#ffd23f")), X + 2.5, 2.4, -3.38));
    for (const x of [X - 7.2, X + 0.2, X + 11.5]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 14), lam(null, "#d9663f")); pot.position.set(x, 0.35, -2.8); pot.castShadow = true; R.add(pot);
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), lam(null, k % 2 ? "#4d9a3a" : "#5fae45")); b.position.set(x + (k - 1) * 0.2, 0.9 + 0.25 * (k % 2), -2.8); b.castShadow = true; R.add(b); }
    }
    for (const [x, c] of [[X + 7.0, "#e9b44c"], [X + 9.6, "#7fb3c9"]] as [number, string][]) R.add(plane(1.2, 0.9, lam(null, c), x, 2.2, -3.38));
  }

  private buildCochinito() {
    const C = this.cochinito, pink = lam(null, "#f29bb2"), pink2 = lam(null, "#e07f9a");
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), pink); body.scale.set(1.8, 1.45, 1.35); body.position.y = 1.75; body.castShadow = true; C.add(body);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.4, 24), pink2); snout.rotation.z = Math.PI / 2; snout.position.set(1.9, 1.85, 0); C.add(snout);
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lam(null, "#7a3048")); n.position.set(2.11, 1.85, s * 0.14); C.add(n);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), lam(null, "#241726")); e.position.set(1.45, 2.35, s * 0.55); C.add(e);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 12), pink2); ear.position.set(0.9, 3.05, s * 0.6); ear.rotation.z = -0.3; ear.castShadow = true; C.add(ear);
      for (const t of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.65, 14), pink2); l.position.set(t * 0.95, 0.33, s * 0.7); l.castShadow = true; C.add(l); }
    }
    C.add(box(0.9, 0.08, 0.16, lam(null, "#241726"), -0.1, 3.2, 0));
    const lab = plane(1.7, 0.6, lam(sign("afore_cochi", [["AFORE", 150, "#ffffff"]], 512, 180, "#1f9e8f", "#ffffff")), 0.4, 1.7, 1.37);
    C.add(lab);
    C.rotation.y = 0.35; C.position.set(...SPOT.cochinito); C.visible = false;
    this.root.add(C);
  }

  private card(id: string, kind: string) {
    let c = this.cards.get(id);
    if (!c) {
      const small = kind === "check" || kind === "perro";
      c = new Card(this.root, small ? 0.7 : 1.0, PEOPLE.has(kind) ? this.blobMat : null);
      this.cards.set(id, c);
    }
    return c;
  }

  /** acomoda todo para el cuadro f */
  update(f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, c = camAt(f), ln = lightAt(f);
    this.setLight(ln);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.12; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    cam.layers.enable(NOINK);
    const focus = new THREE.Vector3(...c.look), dist = cam.position.distanceTo(focus);
    const sunDir = ln === "day" ? new THREE.Vector3(0.55, 0.78, 0.55).normalize() : new THREE.Vector3(-0.45, 0.2, 0.87).normalize();
    this.sun.intensity = ln === "day" ? 2.8 : 3.4;
    const Rr = THREE.MathUtils.clamp(dist * 1.2 + 6, 9, 60);
    const sf = new THREE.Vector3(focus.x, Math.min(focus.y, 12), focus.z);
    this.sun.position.copy(sf).addScaledVector(sunDir, 150); this.sun.target.position.copy(sf);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 10; sc.far = 320; sc.updateProjectionMatrix();
    this.sun.shadow.bias = LIGHTS[ln].bias; this.sun.shadow.normalBias = LIGHTS[ln].normalBias * (Rr / 12);
    this.sky.position.copy(cam.position);
    scene.fog = this.fog; scene.background = null;
    for (const fl of this.flags) fl.m.rotation.x = 0.22 * Math.sin(t * 2.3 + fl.ph) + 0.08 * Math.sin(t * 5.1 + fl.ph * 1.7);
    // tarjetas
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); right.y = 0; right.normalize();
    const used = new Set<string>();
    for (const s of spritesAt(f)) {
      const cd = this.card(s.id, s.kind); used.add(s.id);
      const k = s.k ?? 1;
      cd.show(k > 0.01);
      const { pos, k: _k, ...rest } = s; void _k;
      cd.draw(JSON.stringify(rest), (p) => this.drawSprite(p, s));
      const sc0 = (s.scale ?? 1) * Math.max(0.01, k);
      cd.mesh.scale.setScalar(sc0);
      cd.mesh.position.set(pos[0], pos[1], pos[2]);
      if (s.side) cd.mesh.position.addScaledVector(right, s.side);
      cd.mesh.rotation.y = Math.atan2(cam.position.x - cd.mesh.position.x, cam.position.z - cd.mesh.position.z);
      if (cd.blob) { cd.blob.position.set(pos[0], 0.112, pos[2]); cd.blob.scale.setScalar(s.kind === "perro" ? 0.7 : 1); }
    }
    for (const [id, cd] of this.cards) if (!used.has(id)) cd.show(false);
    // billetes, moneda, cochinito
    for (let i = 0; i < BILLS; i++) {
      const b = billAt(i, f);
      if (b) { this.dummy.position.set(...b.pos); this.dummy.rotation.set(...b.rot); this.dummy.scale.setScalar(1); }
      else { this.dummy.position.set(0, -20, 0); this.dummy.scale.setScalar(0.0001); }
      this.dummy.updateMatrix(); this.bills.setMatrixAt(i, this.dummy.matrix);
    }
    this.bills.instanceMatrix.needsUpdate = true;
    const co = coinAt(f); this.coin.visible = !!co; if (co) { this.coin.position.set(...co); this.coin.rotation.set(t * 9, 0, 0.4); if (co[1] < 0.05) this.coin.rotation.set(0, 0, 0); }
    const ck = cochinitoK(f); this.cochinito.visible = ck > 0.01; this.cochinito.scale.setScalar(Math.max(0.01, ck));
    return focus;
  }

  private drawSprite(p: Pen, s: Sprite) {
    if (s.kind === "perro") return drawPerro(p, s.expr === "feliz" ? "feliz" : "mira", s.blink ?? 0, Number(s.arg ?? 0));
    if (s.kind === "idea") return drawIdeas(p, String(s.arg).split(",") as Idea[]);
    if (s.kind === "check") return drawCheck(p, 1);
    if (s.kind === "req") return drawReq(p, s.arg as Req);
    const o = s.kind === "fila" ? FILA[Number(s.arg)] : OUTFIT[s.kind];
    drawPerson(p, o, { expr: (s.expr ?? "neutral") as never, wave: s.wave, blink: s.blink, tilt: s.tilt, headTilt: s.headTilt, facing: s.facing,
      mode: s.mode, phase: s.phase, hold: holdOf(s), seed: s.kind === "fila" ? 60 + Number(s.arg) * 7 : SEED[s.kind] });
  }
}

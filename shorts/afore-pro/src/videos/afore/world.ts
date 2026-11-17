// El mundo: plaza de Durango frente a la Catedral (estilo caricatura), papel picado, árboles, cerro al fondo,
// Don Chuy y Ana como tarjetas planas iluminadas, y la lluvia de monedas.
import * as THREE from "three";
import { ctex, rep, rng, cobbleHD, stoneHD, cloudHD, facadeHD, jit } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { cardShade, CARD_K, blobMaterial } from "./cardshade";
import { drawChar } from "./personajes";
import { FPS, POS, Who, camAt, poseAt, coinAt, COINS, V3 } from "./story";

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

// ---------------- personajes (tarjetas) ----------------
const SU = 0.00216; // m por unidad de diseño (1000 unidades = 2.16 m)
class Card {
  cv = document.createElement("canvas"); tex: THREE.CanvasTexture; mesh: THREE.Mesh; key = "";
  constructor(parent: THREE.Object3D, k = 1.0) {
    this.cv.width = Math.round(600 * k); this.cv.height = Math.round(1000 * k);
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    // pies (y = 975 de 1000 en el lienzo) en y = 0
    const geo = new THREE.PlaneGeometry(600 * SU, 1000 * SU); geo.translate(0, 475 * SU, 0);
    const m = cardShade(new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mesh = new THREE.Mesh(geo, m);
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh.customDepthMaterial = dm;
    this.mesh.onBeforeRender = (rr) => { const rt = rr.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : rr.domElement.height) / 1920; };
    this.mesh.receiveShadow = true; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
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
}

const contactTex = () => ctex("contacto", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgb(70,72,110)"); gr.addColorStop(0.55, "rgb(150,152,190)"); gr.addColorStop(1, "rgb(255,255,255)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

// ---------------- el mundo ----------------
export class World {
  root = new THREE.Group();
  private sun: THREE.DirectionalLight; private hemi: THREE.HemisphereLight;
  private fog = new THREE.Fog("#b8d0ec", 30, 520);
  private skyMat: THREE.ShaderMaterial; private sky: THREE.Mesh;
  private cards: Record<Who, Card>;
  private flags: { m: THREE.Mesh; base: number; ph: number }[] = [];
  private coins: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor() {
    const R = this.root;
    // cielo
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
    const K = LOOK.day;
    K.sky.c.forEach((h, i) => untone(h, (this.skyMat.uniforms["c" + i].value as THREE.Color)));
    const e = K.sky.e.map((d) => THREE.MathUtils.degToRad(d));
    (this.skyMat.uniforms.e.value as THREE.Vector4).set(e[1], e[2], e[3], e[4]);
    // nubes
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cloudHD(i + 3), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.05, 1.05, 1.05) }));
      const a = -1.2 + i * 0.4, d = 520 + (i % 3) * 60;
      m.position.set(Math.sin(a) * d, 120 + (i % 3) * 45 + i * 6, -Math.cos(a) * d); m.scale.set(170 + (i % 2) * 70, 85 + (i % 2) * 35, 1);
      m.lookAt(0, m.position.y * 0.7, 0); m.layers.set(NOINK); m.renderOrder = -0.5;
      R.add(m);
    }
    // luces
    this.hemi = new THREE.HemisphereLight("#dcecff", "#b49a78", 0.55);
    this.sun = new THREE.DirectionalLight("#fff3e0", 2.8);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    R.add(this.hemi, this.sun, this.sun.target);
    const L = LIGHTS.day;
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    untone(L.fog, this.fog.color);

    this.buildPlaza();
    this.buildCatedral();
    this.buildPicado();
    this.buildCerro();
    this.cards = { chuy: new Card(R), ana: new Card(R) };
    const cm = blobMaterial(contactTex());
    for (const w of ["chuy", "ana"] as Who[]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), cm);
      b.rotation.x = -Math.PI / 2; b.position.set(POS[w][0], 0.02, POS[w][2]); b.renderOrder = 0.5; b.layers.set(NOINK);
      R.add(b);
    }
    // monedas
    const cg = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 28);
    const gold = new THREE.MeshLambertMaterial({ color: "#ffcc33", emissive: "#5a3a00", emissiveIntensity: 0.6 });
    twoTone(gold, 1.5);
    this.coins = new THREE.InstancedMesh(cg, gold, COINS);
    this.coins.castShadow = true; this.coins.frustumCulled = false;
    R.add(this.coins);
  }

  private buildPlaza() {
    const R = this.root;
    const cob = cobbleHD();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lam(rep(cob, 600 / 8 * 0.5 * 2, 600 / 8 * 0.5 * 2)));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; R.add(ground);
    // banqueta de cantera alrededor del atrio
    const piso = stoneHD("losas", ["#e2cdb6", "#d9c2aa", "#e8d6c1", "#d2b9a0"], "#b39b84");
    const atrio = stoneBox(44, 0.3, 22, piso, 3, 0, 0.15, -33);
    R.add(atrio);
    // reja del atrio
    const iron = lam(null, "#2e3a36");
    const posts = lam(null, "#d4b296");
    for (let x = -21; x <= 21; x += 3.5) {
      if (Math.abs(x) < 3) continue;
      R.add(box(0.6, 1.6, 0.6, posts, x, 1.1, -22.4));
      R.add(box(0.8, 0.18, 0.8, posts, x, 1.95, -22.4));
    }
    for (let x = -21; x < 21; x += 0.28) { if (Math.abs(x) < 3) continue; R.add(box(0.05, 1.3, 0.05, iron, x, 0.95, -22.4)); }
    R.add(box(42, 0.08, 0.08, iron, 0, 1.55, -22.4));
    // árboles (laureles redondos) y bancas a los lados
    const leaf = lam(null, "#4d9a3a"), leaf2 = lam(null, "#5fae45"), trunk = lam(null, "#6b4a33");
    const r = rng(7);
    const tree = (x: number, z: number, s: number) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 2.6 * s, 10), trunk);
      t.position.set(x, 1.3 * s, z); t.castShadow = true; t.receiveShadow = true; R.add(t);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 + r() * 0.6) * s, 1), k % 2 ? leaf : leaf2);
        b.position.set(x + (r() - 0.5) * 1.6 * s, (3.2 + r() * 1.0) * s, z + (r() - 0.5) * 1.6 * s);
        b.castShadow = true; b.receiveShadow = true; R.add(b);
      }
    };
    for (const z of [-15, -6, 3, 12]) { tree(-11.5 + r(), z, 1.1); tree(11.5 - r(), z + 2, 1.1); }
    const bench = lam(null, "#2f6b4f");
    for (const [x, z] of [[-7.5, -4], [7.5, -4], [-7.5, 5], [7.5, 5]] as [number, number][]) {
      R.add(box(0.5, 0.08, 2.0, bench, x, 0.48, z)); R.add(box(0.08, 0.5, 2.0, bench, x + Math.sign(x) * 0.25, 0.75, z));
      R.add(box(0.4, 0.45, 0.08, bench, x, 0.22, z - 0.9)); R.add(box(0.4, 0.45, 0.08, bench, x, 0.22, z + 0.9));
    }
    // edificios coloniales a los lados de la plaza
    const cols = [["#e9b44c", "#2f6b8a"], ["#d9663f", "#3b6b3f"], ["#f2d7a6", "#8a3b2f"], ["#7fb3c9", "#7a4a2a"], ["#e58fa0", "#2f5f7a"], ["#c9d97f", "#6b3f2a"]];
    let i = 0;
    for (const side of [-1, 1]) for (let z = -48; z < 40; z += 13) {
      const [wall, sh] = cols[i++ % cols.length], h = 8 + (i % 3) * 1.5;
      const tex = facadeHD(`casa${i}`, 12.6, h, { wall, shutter: sh, door: true });
      const mats = [lam(null, wall), lam(null, wall), lam(null, "#9b5a3c"), lam(null, wall), lam(null, wall), lam(null, wall)];
      mats[side < 0 ? 0 : 1] = lam(tex);
      const g = new THREE.Mesh(new THREE.BoxGeometry(10, h, 12.6), mats);
      g.position.set(side * 26, h / 2, z); g.castShadow = true; g.receiveShadow = true; R.add(g);
      R.add(box(10.4, 0.5, 13, lam(null, "#f3ead8"), side * 26, h + 0.25, z));
    }
    // faroles
    const lampM = lam(null, "#24302c");
    for (const x of [-9.5, 9.5]) for (const z of [-11, 6]) {
      R.add(box(0.16, 4.6, 0.16, lampM, x, 2.3, z));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.5, 8), lam(null, "#fff1c4", { emissive: "#6b5a20" }));
      head.position.set(x, 4.85, z); R.add(head);
    }
  }

  private buildCatedral() {
    const R = this.root, ct = cantera();
    const Z = -42; // fachada
    // nave y crucero
    R.add(stoneBox(18, 21, 52, ct, 4, 0, 10.5 + 0.3, Z - 26));
    R.add(stoneBox(40, 17, 12, ct, 4, 0, 8.5 + 0.3, Z - 34));
    // techo plano con pretil
    R.add(box(18.6, 0.8, 52.6, lam(null, "#c59d80"), 0, 21.6, Z - 26));
    // portada pintada (un poco al frente de la nave)
    const pm = lam(portada());
    const front = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), pm);
    front.position.set(0, 14.3, Z + 0.62); front.receiveShadow = true; R.add(front);
    R.add(stoneBox(15, 28, 0.6, ct, 4, 0, 14.3, Z + 0.3, "#e9cfb6"));
    // remate curvo arriba de la portada
    const sh = new THREE.Shape(); sh.moveTo(-7, 0); sh.quadraticCurveTo(-6.5, 3.2, -3, 3.4); sh.quadraticCurveTo(0, 6.5, 3, 3.4); sh.quadraticCurveTo(6.5, 3.2, 7, 0); sh.lineTo(-7, 0);
    const rem = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }), lam(null, "#ddbb9f"));
    rem.position.set(0, 28.3, Z - 0.1); rem.castShadow = true; R.add(rem);
    this.cross(0, 34.9, Z + 0.35, 1.0);
    // torres gemelas
    for (const s of [-1, 1]) {
      const x = s * 11.2;
      R.add(stoneBox(8, 30, 8, ct, 4, x, 15.3, Z - 2.5));
      R.add(box(8.8, 0.9, 8.8, lam(null, "#c79f80"), x, 30.7, Z - 2.5));
      this.belfry(x, 31.15, Z - 2.5, 7, 8.2);
      R.add(box(7.6, 0.8, 7.6, lam(null, "#c79f80"), x, 39.75, Z - 2.5));
      this.belfry(x, 40.15, Z - 2.5, 5.4, 6.2);
      R.add(box(6, 0.7, 6, lam(null, "#c79f80"), x, 46.7, Z - 2.5));
      // cupulín
      const d = new THREE.Mesh(new THREE.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam(null, "#e3c4a7"));
      d.scale.y = 1.35; d.position.set(x, 47.05, Z - 2.5); d.castShadow = true; R.add(d);
      const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.6, 10), lam(null, "#d8b69a"));
      lt.position.set(x, 51.1, Z - 2.5); R.add(lt);
      this.cross(x, 52.4, Z - 2.5, 0.9);
      // pináculos en las esquinas del campanario
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const pn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 8), lam(null, "#d8b69a"));
        pn.position.set(x + a * 3.6, 41.9, Z - 2.5 + b * 3.6); pn.castShadow = true; R.add(pn);
      }
    }
    // cúpula del crucero
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 6, 32), lam(null, "#d9b79b"));
    drum.position.set(0, 25, Z - 34); drum.castShadow = true; R.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(6.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lam(this.tiles(), "#ffffff"));
    dome.scale.y = 1.25; dome.position.set(0, 28, Z - 34); dome.castShadow = true; R.add(dome);
    const lant = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 2.6, 12), lam(null, "#e3c4a7"));
    lant.position.set(0, 36.9, Z - 34); R.add(lant);
    this.cross(0, 38.6, Z - 34, 1.0);
  }
  private tiles() {
    return ctex("azulejo", 512, 256, (g) => {
      g.fillStyle = "#e9d27a"; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = "#b58a3a"; g.lineWidth = 4;
      for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
      for (let y = 0; y < 256; y += 24) for (let x = (y / 24) % 2 ? 16 : 0; x < 512; x += 32) { g.fillStyle = "#3f6fb0"; g.fillRect(x + 8, y + 6, 14, 12); }
    });
  }
  private belfry(x: number, y0: number, z: number, w: number, h: number) {
    const t = rep(campanario(), 1, 1);
    const m = lam(t), cap = lam(null, "#d8b69a");
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [m, m, cap, cap, m, m]);
    me.position.set(x, y0 + h / 2, z); me.castShadow = true; me.receiveShadow = true;
    this.root.add(me);
  }
  private cross(x: number, y: number, z: number, s: number) {
    const m = lam(null, "#2b2b30");
    this.root.add(box(0.22 * s, 2.2 * s, 0.22 * s, m, x, y, z), box(1.2 * s, 0.22 * s, 0.22 * s, m, x, y + 0.35 * s, z));
  }

  private buildPicado() {
    const R = this.root;
    const rope = lam(null, "#f4f1e8");
    // tiras de papel picado que cruzan la plaza entre los faroles y los árboles
    const strands: [V3, V3][] = [
      [[-9.5, 5.4, -11], [9.5, 5.6, -11]], [[-9.5, 5.2, 6], [9.5, 5.2, 6]], [[-9.5, 5.5, -11], [9.5, 5.3, 6]],
      [[9.5, 5.5, -11], [-9.5, 5.3, 6]], [[-9.5, 5.4, -2.5], [9.5, 5.4, -2.5]], [[-11, 6.4, -20], [11, 6.4, -20]],
    ];
    let n = 0;
    strands.forEach(([a, b], si) => {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]), cnt = Math.floor(len / 0.62);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= cnt; i++) {
        const u = i / cnt, sag = 1.1 * 4 * u * (1 - u);
        pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag, a[2] + (b[2] - a[2]) * u));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.015, 4), rope);
      R.add(tube);
      const dir = Math.atan2(b[2] - a[2], b[0] - a[0]);
      for (let i = 1; i < cnt; i++) {
        const p = pts[i], ci = (i + si * 3) % PICADO.length;
        const mat = lam(picado(ci, (i + si) % 3), "#ffffff", { alphaTest: 0.5, side: THREE.DoubleSide, transparent: false });
        const geo = new THREE.PlaneGeometry(0.5, 0.62); geo.translate(0, -0.31, 0);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(p); m.rotation.order = "YXZ"; m.rotation.y = -dir; m.castShadow = true;
        const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5, side: THREE.DoubleSide });
        m.customDepthMaterial = dm;
        R.add(m);
        this.flags.push({ m, base: 0, ph: n++ * 0.7 });
      }
    });
  }

  private buildCerro() {
    const R = this.root, tex = cerroTex();
    // el cerro detrás de la Catedral: una loma grande, con otra más baja a la derecha
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
      const m = new THREE.Mesh(g, lam(rep(tex, 6, 4)));
      m.position.set(x, 0, z); m.receiveShadow = true; R.add(m);
    };
    hill(-40, -330, 520, 125, 3);
    hill(170, -380, 380, 80, 9);
    hill(-260, -300, 300, 60, 5);
  }

  /** acomoda todo para el cuadro f */
  update(f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, c = camAt(f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    cam.layers.enable(NOINK);
    const focus = new THREE.Vector3(...c.look), dist = cam.position.distanceTo(focus);
    // sol fijo: alto, detrás de la cámara a la derecha (ilumina la fachada)
    const sunDir = new THREE.Vector3(0.55, 0.78, 0.55).normalize();
    const Rr = THREE.MathUtils.clamp(dist * 1.2 + 8, 12, 80);
    const sf = new THREE.Vector3(focus.x, Math.min(focus.y, 20), focus.z);
    this.sun.position.copy(sf).addScaledVector(sunDir, 200); this.sun.target.position.copy(sf);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 420; sc.updateProjectionMatrix();
    this.sun.shadow.bias = LIGHTS.day.bias; this.sun.shadow.normalBias = LIGHTS.day.normalBias * (Rr / 12);
    this.sky.position.copy(cam.position);
    this.fog.near = 40; this.fog.far = 700;
    scene.fog = this.fog; scene.background = null;
    // papel picado: se mece con el viento
    for (const fl of this.flags) fl.m.rotation.x = 0.22 * Math.sin(t * 2.3 + fl.ph) + 0.08 * Math.sin(t * 5.1 + fl.ph * 1.7);
    // personajes: tarjetas que miran a la cámara
    for (const w of ["chuy", "ana"] as Who[]) {
      const p = poseAt(w, f), card = this.cards[w];
      const key = JSON.stringify(p);
      card.draw(key, (pen) => drawChar(pen, w, { expr: p.expr as never, wave: p.wave, blink: p.blink, tilt: p.tilt, headTilt: p.headTilt, facing: p.facing }));
      const [x, , z] = POS[w];
      card.mesh.position.set(x, p.hop, z);
      card.mesh.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z);
    }
    // monedas
    for (let i = 0; i < COINS; i++) {
      const cn = coinAt(i, t);
      this.dummy.position.set(...cn.pos); this.dummy.rotation.set(...cn.rot);
      this.dummy.scale.setScalar(cn.on ? 1 : 0.0001); this.dummy.updateMatrix();
      this.coins.setMatrixAt(i, this.dummy.matrix);
    }
    this.coins.instanceMatrix.needsUpdate = true;
    return focus;
  }
}

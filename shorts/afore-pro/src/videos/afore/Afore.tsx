// Short de Afore Pro: un mundo three.js (world.ts) con la cadena de post de la skill
// (tinta -> desenfoque -> bloom -> mapeo de tono NEUTRAL -> corrección de color, MSAA 4),
// más los globos de diálogo que se van escribiendo y el logo final, dibujados encima en HTML.
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, Audio, getInputProps, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH } from "./grade";
import { FPS, LINES, POS, TOP_Y, LOGO_T, camAt, dofAt, Line } from "./story";

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass, setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};
const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const Inner: React.FC = () => {
  const f = useCurrentFrame();
  const { camera, scene, gl, size } = useThree();
  const world = useMemo(() => new World(), []);
  const on = useMemo(() => ({ ink: true, lens: true, bloom: true, grade: true, off: false, ...((getInputProps() as { post?: Record<string, boolean> }).post ?? {}) }), []);
  const fx = useMemo(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const ink = new InkPass(scene, cam), lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
    const bloom = makeBloom(), tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), grade = new GradeEffect(GRADES.day, GRADE_STRENGTH.day);
    const composer = new EffectComposer(gl, { multisampling: (getInputProps() as { post?: { ms?: number } }).post?.ms ?? 4, frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, cam));
    if (on.ink) composer.addPass(ink);
    if (on.lens) { composer.addPass(new EffectPass(cam, lens.pre)); composer.addPass(new EffectPass(cam, lens.main)); }
    composer.addPass(new EffectPass(cam, ...(on.bloom ? [bloom] : []), tone, ...(on.grade ? [grade] : [])));
    return { ink, lens, composer };
  }, [camera, scene, gl, on]);
  useEffect(() => { fx.composer.setSize(size.width, size.height); }, [fx, size.width, size.height]);
  useFrame(() => { if (on.off) gl.render(scene, camera); else fx.composer.render(); }, 1);
  const cam = camera as THREE.PerspectiveCamera;
  world.update(f, cam, scene);
  noInkFallback(world.root);
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  fpt.set(...d.focus);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  return <primitive object={world.root} dispose={null} />;
};

const dpr = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;

// ---------------- globos de diálogo ----------------
const FONT = `@font-face { font-family: "Luckiest"; src: url(${staticFile("fonts/luckiest.woff2")}) format("woff2"); }
@font-face { font-family: "Baloo"; font-weight: 800; src: url(${staticFile("fonts/baloo800.woff2")}) format("woff2"); }`;
const W = 1080, H = 1920;
const projCam = new THREE.PerspectiveCamera(40, W / H, 0.15, 1500);
const project = (f: number, p: [number, number, number]) => {
  const c = camAt(f);
  projCam.position.set(...c.pos); projCam.up.set(0, 1, 0); projCam.lookAt(...c.look); projCam.rotateZ(c.roll);
  projCam.fov = c.fov; projCam.updateProjectionMatrix(); projCam.updateMatrixWorld();
  const v = new THREE.Vector3(...p).project(projCam);
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 };
};
/** texto visible en el tiempo t: cada palabra se escribe letra por letra mientras se dice */
const typed = (l: Line, t: number) => {
  let out = "";
  for (const w of l.words) {
    if (t < w.s - 0.04) break;
    const u = Math.min(1, (t - w.s + 0.04) / Math.max(0.12, (w.e - w.s) * 0.8));
    out += (out ? " " : "") + w.w.slice(0, Math.max(1, Math.ceil(w.w.length * u)));
  }
  return out;
};
const Bubble: React.FC<{ l: Line; f: number }> = ({ l, f }) => {
  const { fps } = useVideoConfig();
  const t = f / fps;
  const idx = LINES.indexOf(l), next = LINES[idx + 1];
  const a0 = Math.round((l.s - 0.12) * fps), a1 = Math.round(Math.min(l.e + 0.5, next ? next.s - 0.3 : l.e + 0.5) * fps);
  if (f < a0 || f > a1 + 5) return null;
  const pop = spring({ frame: f - a0, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
  const out = interpolate(f, [a1, a1 + 5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const head = project(f, [POS[l.who][0], TOP_Y[l.who], POS[l.who][2]]);
  const full = l.text, shown = typed(l, t);
  const fontPx = full.length > 70 ? 50 : full.length > 40 ? 56 : 64;
  const bw = Math.min(900, Math.max(420, full.length * fontPx * 0.36 + 120));
  // el globo flota arriba de la cabeza, dentro del cuadro, sin tapar caras
  const cx = Math.max(bw / 2 + 50, Math.min(W - bw / 2 - 50, head.x + (l.who === "chuy" ? 90 : -90)));
  const bottom = Math.max(380, Math.min(head.y - 70, 1300));
  const tailX = Math.max(cx - bw / 2 + 60, Math.min(cx + bw / 2 - 60, head.x));
  const color = l.who === "chuy" ? "#fff8e6" : "#ffffff";
  const name = l.who === "chuy" ? "DON CHUY" : "ANA";
  const tag = l.who === "chuy" ? "#d9662b" : "#1f9e8f";
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: out }}>
      <div style={{
        position: "absolute", left: cx - bw / 2, width: bw, bottom: H - bottom, transformOrigin: `${tailX - (cx - bw / 2)}px 100%`,
        transform: `scale(${0.3 + 0.7 * pop})`,
      }}>
        <div style={{
          position: "relative", background: color, border: "8px solid #241726", borderRadius: 58, padding: "40px 46px 38px",
          boxShadow: "0 12px 0 rgba(36,23,38,0.25)", fontFamily: "Baloo", fontWeight: 800, fontSize: fontPx, lineHeight: 1.08,
          color: "#241726", textAlign: "center",
        }}>
          <div style={{ position: "absolute", top: -34, left: l.who === "chuy" ? 34 : undefined, right: l.who === "ana" ? 34 : undefined,
            background: tag, color: "white", fontFamily: "Luckiest", fontSize: 38, padding: "6px 22px 0", borderRadius: 20, border: "6px solid #241726" }}>{name}</div>
          {/* el texto completo invisible reserva el tamaño; encima se escribe lo dicho */}
          <span style={{ visibility: "hidden" }}>{full}</span>
          <span style={{ position: "absolute", left: 46, right: 46, top: 40 }}>{shown}</span>
        </div>
        <svg width={bw} height={90} style={{ position: "absolute", left: 0, top: "100%", marginTop: -10, overflow: "visible" }}>
          <path d={`M ${tailX - (cx - bw / 2) - 36 + (l.who === "chuy" ? 40 : -40)} 0 L ${tailX - (cx - bw / 2)} 80 L ${tailX - (cx - bw / 2) + 34 + (l.who === "chuy" ? 40 : -40)} 0 Z`}
            fill={color} stroke="#241726" strokeWidth={8} strokeLinejoin="round" />
          <rect x={tailX - (cx - bw / 2) - 30 + (l.who === "chuy" ? 40 : -40)} y={-4} width={60} height={12} fill={color} />
        </svg>
      </div>
    </div>
  );
};

// ---------------- logo final ----------------
const Logo: React.FC<{ f: number }> = ({ f }) => {
  const { fps } = useVideoConfig();
  const a = Math.round(LOGO_T * fps);
  if (f < a) return null;
  const s = spring({ frame: f - a, fps, config: { damping: 9, stiffness: 140, mass: 0.7 } });
  const s2 = spring({ frame: f - a - 9, fps, config: { damping: 12, stiffness: 160 } });
  const wob = Math.sin((f - a) / 6) * 1.5;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 230 }}>
      <div style={{ transform: `scale(${s}) rotate(${-3 + wob}deg)`, textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "linear-gradient(#1fb39f, #157a6e)", border: "10px solid #241726", borderRadius: 48,
          padding: "26px 56px 6px", boxShadow: "0 16px 0 rgba(36,23,38,0.35)" }}>
          <div style={{ fontFamily: "Luckiest", fontSize: 156, lineHeight: 1, color: "#ffd23a", WebkitTextStroke: "8px #241726", paintOrder: "stroke fill",
            textShadow: "0 9px 0 #241726" }}>AFORE PRO</div>
        </div>
      </div>
      <div style={{ marginTop: 40, transform: `scale(${s2})`, background: "#e8336d", border: "8px solid #241726", borderRadius: 30, padding: "16px 40px 8px",
        fontFamily: "Luckiest", fontSize: 66, color: "white", WebkitTextStroke: "4px #241726", paintOrder: "stroke fill", boxShadow: "0 12px 0 rgba(36,23,38,0.3)" }}>
        ¡Retira más de tu Afore!
      </div>
    </AbsoluteFill>
  );
};

export const AforeShort: React.FC = () => {
  const f = useCurrentFrame();
  const { audio } = getInputProps() as { audio?: string };
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      <style>{FONT}</style>
      <AbsoluteFill>
        <ThreeCanvas width={W} height={H} {...(dpr() ? { dpr: dpr() } : {})} shadows
          gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
          camera={{ fov: 40, near: 0.15, far: 1500 }}>
          <Inner />
        </ThreeCanvas>
      </AbsoluteFill>
      {LINES.map((l, i) => (i === 5 ? null : <Bubble key={i} l={l} f={f} />))}
      <Logo f={f} />
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};
export { FPS };

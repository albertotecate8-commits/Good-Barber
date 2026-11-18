// Short "Dos vecinos" (Afore Pro): mundo three.js (world.ts) con la cadena de post de la skill
// (tinta -> desenfoque -> bloom -> mapeo de tono NEUTRAL -> corrección de color, MSAA 4).
// Encima, en HTML: la cifra discreta arriba del cuadro, el destello de los cambios de lugar y el cierre.
// Sin subtítulos. La voz y la música se juntan después con ffmpeg (audio/mezcla.py).
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { CIFRAS, CTA, TOTAL, dofAt, flashAt, lightAt, pop, smooth } from "./story";

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
  const fx = useMemo(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const ink = new InkPass(scene, cam), lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), grade = new GradeEffect(GRADES.day, GRADE_STRENGTH.day);
    const composer = new EffectComposer(gl, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, cam));
    composer.addPass(ink);
    composer.addPass(new EffectPass(cam, lens.pre)); composer.addPass(new EffectPass(cam, lens.main));
    composer.addPass(new EffectPass(cam, makeBloom(), tone, grade));
    return { ink, lens, grade, composer };
  }, [camera, scene, gl]);
  useEffect(() => { fx.composer.setSize(size.width, size.height); }, [fx, size.width, size.height]);
  useFrame(() => { fx.composer.render(); }, 1);
  const cam = camera as THREE.PerspectiveCamera;
  world.update(f, cam, scene);
  noInkFallback(world.root);
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  fpt.set(...d.focus);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, lightAt(f));
  return <primitive object={world.root} dispose={null} />;
};

const FONT = `@font-face { font-family: "Luckiest"; src: url(${staticFile("fonts/luckiest.woff2")}) format("woff2"); }
@font-face { font-family: "Baloo"; font-weight: 800; src: url(${staticFile("fonts/baloo800.woff2")}) format("woff2"); }`;
const outline = (w: number, c = "#1a1010") => ({ WebkitTextStroke: `${w}px ${c}`, paintOrder: "stroke fill" as const });

/** cifra discreta arriba del cuadro (no tapa a nadie) */
const Cifra: React.FC<{ f: number }> = ({ f }) => {
  const c = CIFRAS.find((x) => f >= x.a && f <= x.b);
  if (!c) return null;
  const k = pop(f, c.a, 8), out = 1 - smooth((f - (c.b - 6)) / 6);
  return (
    <div style={{ position: "absolute", top: 210, width: "100%", textAlign: "center", opacity: out, transform: `scale(${0.85 + 0.15 * k})`, transformOrigin: "50% 0" }}>
      <div style={{ fontFamily: "Luckiest", fontSize: 104, color: "#ffd23f", letterSpacing: 2, ...outline(10), opacity: Math.min(1, k * 1.5) }}>{c.big}</div>
      <div style={{ fontFamily: "Baloo", fontWeight: 800, fontSize: 40, color: "#ffffff", ...outline(7), marginTop: 2, opacity: Math.min(1, k * 1.5) }}>{c.sub}</div>
    </div>
  );
};

/** cierre: logo, WhatsApp y el texto legal pequeño */
const Cierre: React.FC<{ f: number }> = ({ f }) => {
  if (f < CTA.a) return null;
  const k1 = pop(f, CTA.a, 10), k2 = pop(f, CTA.a + 50, 10), k3 = pop(f, CTA.a + 10, 10);
  // acercamiento lento y constante de todo el cierre: nunca se queda quieto
  const z = 0.9 + 0.22 * Math.min(1, (f - CTA.a) / (TOTAL - CTA.a));
  return (
    <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "50% 92%" }}>
      <div style={{ position: "absolute", top: 230, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ transform: `scale(${k1})`, background: "#1f9e8f", border: "8px solid #1a1010", borderRadius: 34, padding: "14px 46px 6px", boxShadow: "0 12px 0 #1a1010" }}>
          <div style={{ fontFamily: "Luckiest", fontSize: 128, color: "#ffd23f", ...outline(9), lineHeight: 1.05 }}>AFORE PRO</div>
        </div>
        <div style={{ transform: `scale(${k3})`, fontFamily: "Baloo", fontWeight: 800, fontSize: 46, color: "#ffffff", ...outline(8) }}>Asesoría que impulsa tu futuro</div>
        <div style={{ transform: `scale(${k2})`, marginTop: 26, background: "#25d366", border: "7px solid #1a1010", borderRadius: 30, padding: "14px 40px", textAlign: "center", boxShadow: "0 10px 0 #1a1010" }}>
          <div style={{ fontFamily: "Baloo", fontWeight: 800, fontSize: 40, color: "#ffffff", ...outline(6) }}>Prevalidación gratuita por WhatsApp</div>
          <div style={{ fontFamily: "Luckiest", fontSize: 104, color: "#ffffff", ...outline(9), letterSpacing: 3 }}>618 367 7047</div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 70, left: 70, right: 70, textAlign: "center", fontFamily: "Baloo", fontWeight: 800, fontSize: 25, lineHeight: 1.3,
        color: "#ffffff", ...outline(5), opacity: smooth((f - CTA.a - 20) / 12) }}>
        Asesoría privada. El trámite oficial es gratuito. No se garantiza autorización ni monto.
        El titular realiza personalmente sus validaciones. Monto: hasta $35,193. Honorarios: 30% de lo retirado.
      </div>
    </AbsoluteFill>
  );
};

const dpr = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
/** las letras de los letreros se pintan en Canvas2D: primero hay que cargar las fuentes */
const useFonts = () => {
  const [ready, setReady] = useState(false);
  const [h] = useState(() => delayRender("fuentes"));
  useEffect(() => {
    const ff = [new FontFace("Baloo", `url(${staticFile("fonts/baloo800.woff2")})`, { weight: "800" }), new FontFace("Luckiest", `url(${staticFile("fonts/luckiest.woff2")})`)];
    Promise.all(ff.map((x) => x.load())).then((xs) => { xs.forEach((x) => (document.fonts as unknown as { add: (f: FontFace) => void }).add(x)); setReady(true); continueRender(h); })
      .catch(() => { setReady(true); continueRender(h); });
  }, [h]);
  return ready;
};
export const DesempleoShort: React.FC = () => {
  const f = useCurrentFrame();
  const ready = useFonts();
  const fl = flashAt(f);
  return (
    <AbsoluteFill style={{ background: "#b8d0ec" }}>
      <style>{FONT}</style>
      {ready && <ThreeCanvas width={1080} height={1920} {...(dpr() ? { dpr: dpr() } : {})} shadows
        gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }} camera={{ fov: 40, near: 0.12, far: 1500 }}>
        <Inner />
      </ThreeCanvas>}
      <Cifra f={f} />
      <Cierre f={f} />
      {fl > 0 && <AbsoluteFill style={{ background: "#fff8ec", opacity: fl }} />}
    </AbsoluteFill>
  );
};
export { TOTAL };

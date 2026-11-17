// Don Chuy y Ana: dos personajes planos dibujados con la API Pen de toon.ts (lienzo 600x1000, pies en y = 975).
import { Outfit, Expr, Pen, bodyFront } from "./toon";

export const DON_CHUY: Outfit = {
  jacket: "#f3ecdc", pants: "#5b4636", boots: "#6b3f24", hat: "sombrero", moustache: "#e4ddd2",
  skin: "#c99067", build: "stout", buttons: "#c7b79a",
};
export const ANA: Outfit = {
  jacket: "#1f9e8f", pants: "#2d3550", boots: "#7a2e3b", dress: "#e04f7a", hat: "hair", hair: "#3a2418",
  skin: "#e8b991", pony: true, buttons: "#f4f1ea",
};

export type Pose = { expr: Expr; wave?: number; blink?: number; tilt?: number; headTilt?: number; look?: number; facing: -1 | 0 | 1 };
export const drawChar = (p: Pen, who: "chuy" | "ana", pose: Pose) =>
  bodyFront(p, who === "chuy" ? DON_CHUY : ANA, {
    mode: "stand", expr: pose.expr, wave: pose.wave, blink: pose.blink, tilt: pose.tilt ?? 0, headTilt: pose.headTilt ?? 0,
    look: pose.look ?? 0, facing: pose.facing, seed: who === "chuy" ? 11 : 23,
  });

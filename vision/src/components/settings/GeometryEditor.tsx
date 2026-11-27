"use client";

/**
 * Editor de geometría sobre el encuadre de una cámara (coordenadas
 * normalizadas 0–1, iguales a las que usa el motor de visión).
 *   - mode "polygon": zona de una estación (3 a 32 puntos).
 *   - mode "line":    línea de conteo A→B; el lado de entrada se elige aparte.
 * Mientras no exista una captura real de la cámara se dibuja sobre una
 * cuadrícula 16:9 (el encuadre de la Tapo C110: 2304 × 1296).
 */
import { useRef } from "react";
import { Button } from "../ui/primitives";

export type NPoint = [number, number];

const W = 1000;
const H = 562; // 16:9

export function GeometryEditor({
  mode,
  points,
  onChange,
  entrySide,
  backgroundUrl,
}: {
  mode: "polygon" | "line";
  points: NPoint[];
  onChange: (p: NPoint[]) => void;
  entrySide?: "left" | "right";
  backgroundUrl?: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const max = mode === "line" ? 2 : 32;

  function add(e: React.PointerEvent<SVGSVGElement>) {
    if (points.length >= max) return;
    const r = svgRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange([...points, [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]]);
  }

  const px = (p: NPoint) => `${p[0] * W},${p[1] * H}`;
  let arrow: { x: number; y: number; x2: number; y2: number } | null = null;
  if (mode === "line" && points.length === 2 && entrySide) {
    const [a, b] = points as [NPoint, NPoint];
    const mx = ((a[0] + b[0]) / 2) * W;
    const my = ((a[1] + b[1]) / 2) * H;
    // normal izquierda de A→B en coordenadas de pantalla (y hacia abajo): (-dy, dx) invertida
    let nx = -(b[1] - a[1]) * H;
    let ny = (b[0] - a[0]) * W;
    const len = Math.hypot(nx, ny) || 1;
    nx = (nx / len) * 70;
    ny = (ny / len) * 70;
    // side_of_line > 0 ("left" en el motor) corresponde a +(-dy, dx) en estos ejes
    const sign = entrySide === "left" ? -1 : 1;
    arrow = { x: mx, y: my, x2: mx - sign * nx, y2: my - sign * ny };
  }

  return (
    <div className="geo">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="geo-canvas"
        onPointerUp={add}
        role="img"
        aria-label={mode === "line" ? "Dibuja la línea tocando dos puntos" : "Dibuja la zona tocando sus esquinas"}
      >
        {backgroundUrl ? (
          <image href={backgroundUrl} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <>
            <rect width={W} height={H} fill="var(--bg-input)" />
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={(i + 1) * 100} y1="0" x2={(i + 1) * 100} y2={H} stroke="var(--border-soft)" />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={(i + 1) * 94} x2={W} y2={(i + 1) * 94} stroke="var(--border-soft)" />
            ))}
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="28">
              Encuadre de la cámara (sin captura todavía)
            </text>
          </>
        )}
        {mode === "polygon" && points.length >= 3 && (
          <polygon points={points.map(px).join(" ")} fill="rgba(212,162,78,0.25)" stroke="var(--accent)" strokeWidth="4" />
        )}
        {mode === "polygon" && points.length === 2 && (
          <polyline points={points.map(px).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="4" />
        )}
        {mode === "line" && points.length === 2 && (
          <line x1={points[0]![0] * W} y1={points[0]![1] * H} x2={points[1]![0] * W} y2={points[1]![1] * H} stroke="var(--success)" strokeWidth="6" />
        )}
        {arrow && (
          <g stroke="var(--info)" strokeWidth="5" fill="var(--info)">
            <line x1={arrow.x} y1={arrow.y} x2={arrow.x2} y2={arrow.y2} />
            <circle cx={arrow.x2} cy={arrow.y2} r="10" />
            <text x={arrow.x2 + 14} y={arrow.y2 + 10} fontSize="30" stroke="none">Adentro</text>
          </g>
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p[0] * W} cy={p[1] * H} r="12" fill="var(--accent)" />
            {mode === "line" && (
              <text x={p[0] * W + 16} y={p[1] * H - 12} fontSize="30" fill="var(--text)">{i === 0 ? "A" : "B"}</text>
            )}
          </g>
        ))}
      </svg>
      <div className="geo-actions">
        <small className="muted">
          {mode === "line"
            ? points.length < 2 ? `Toca ${2 - points.length} punto(s) sobre la puerta.` : "Línea lista."
            : points.length < 3 ? `Toca las esquinas de la zona (faltan ${3 - points.length} como mínimo).` : `${points.length} puntos.`}
        </small>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(points.slice(0, -1))} disabled={!points.length}>Deshacer</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={!points.length}>Borrar</Button>
      </div>
    </div>
  );
}

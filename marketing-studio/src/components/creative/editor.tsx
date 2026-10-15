"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOGO_POSITIONS, TEMPLATES, TEMPLATE_LABELS, type Design } from "@/lib/creative/design";
import { drawDesign, loadImage, type ImageMap } from "@/lib/creative/draw";
import type { CreativeFormat } from "@/lib/creative/formats";
import type { QaCheck } from "@/lib/creative/qa";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { saveDesignVersion } from "@/app/(app)/estudio/actions";
import { Badge, Button } from "../ui";
import { QaList } from "./qa-list";

export interface EditorImage {
  id: string;
  title: string;
  kind: string;
  width: number | null;
  height: number | null;
}

const POSITION_LABELS: Record<(typeof LOGO_POSITIONS)[number], string> = {
  "top-left": "Arriba izquierda",
  "top-center": "Arriba al centro",
  "top-right": "Arriba derecha",
  "bottom-left": "Abajo izquierda",
  "bottom-right": "Abajo derecha",
};

const src = (id: string) => `/api/biblioteca/archivo/${id}?via=app`;

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
      {children}
    </label>
  );
}

export function CreativeEditor({
  projectId,
  projectTitle,
  businessId,
  format,
  otherFormats,
  initialDesign,
  images,
  parentVersionId,
}: {
  projectId: string;
  projectTitle: string;
  businessId: string;
  format: CreativeFormat;
  otherFormats: CreativeFormat[];
  initialDesign: Design;
  images: EditorImage[];
  parentVersionId: string | null;
}) {
  const router = useRouter();
  const [design, setDesign] = useState<Design>(initialDesign);
  const [loaded, setLoaded] = useState<ImageMap>(new Map());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [results, setResults] = useState<{ label: string; status: string; checks: QaCheck[] }[]>([]);
  const [adapt, setAdapt] = useState<string[]>([]);
  const preview = useRef<HTMLCanvasElement>(null);
  const [fontFamily, setFontFamily] = useState("sans-serif");

  const backgrounds = images.filter((i) => i.kind === "image" || i.kind === "logo");
  const logos = images.filter((i) => i.kind === "logo" || i.kind === "image");

  // Carga (una vez) las imágenes usadas por el diseño.
  const neededKey = [design.background.asset_id, design.logo.asset_id].filter(Boolean).join(",");
  useEffect(() => {
    let alive = true;
    const ids = neededKey.split(",").filter((id) => id && !loaded.has(id));
    if (!ids.length) return;
    Promise.all(ids.map(async (id) => [id, await loadImage(src(id))] as const))
      .then((pairs) => {
        if (!alive) return;
        setLoaded((prev) => new Map([...prev, ...pairs]));
      })
      .catch(() => alive && setStatus({ tone: "error", text: "No se pudo cargar una de las imágenes." }));
    return () => {
      alive = false;
    };
  }, [neededKey, loaded]);

  useEffect(() => {
    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    document.fonts.ready.then(() => setFontFamily(family));
  }, []);

  // Vista previa: el mismo dibujo, escalado.
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth || 360;
    const scale = (cssW * (window.devicePixelRatio || 1)) / design.width;
    canvas.width = Math.round(design.width * scale);
    canvas.height = Math.round(design.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawDesign(ctx, design, format, loaded, fontFamily);
  }, [design, loaded, fontFamily, format]);

  const set = <K extends keyof Design>(key: K, value: Partial<Design[K]>) =>
    setDesign((d) => ({ ...d, [key]: typeof value === "object" && value !== null ? { ...(d[key] as object), ...value } : value }) as Design);

  async function exportOne(target: CreativeFormat, base: Design) {
    const d: Design = { ...base, format_key: target.key, width: target.width, height: target.height };
    const canvas = document.createElement("canvas");
    canvas.width = d.width;
    canvas.height = d.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("El navegador no permite dibujar.");
    const { metrics } = drawDesign(ctx, d, target, loaded, fontFamily, { measureMetrics: true });
    const photo = Boolean(d.background.asset_id);
    const mime = photo ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.93));
    if (!blob) throw new Error("No se pudo exportar la imagen.");
    const up = await uploadToLibrary(blob, {
      business_id: businessId,
      kind: "image",
      origin: "code_edited",
      title: `${projectTitle} — ${target.label}`.slice(0, 160),
      description: "Diseño hecho con el editor de la app (edición por código, no generado con IA).",
      tags: `estudio, ${target.key}`,
      license_note: "",
      asset_date: "",
      original_name: `diseno-${target.key}.${photo ? "jpg" : "png"}`,
      mime_type: mime,
    });
    if (!up.ok) throw new Error(up.message);
    const saved = await saveDesignVersion(projectId, { assetId: up.id, design: d, metrics, parentVersionId });
    if (!saved.ok) throw new Error(saved.message);
    return { label: target.label, status: saved.status, checks: saved.checks };
  }

  async function onExport() {
    setBusy(true);
    setStatus({ tone: "info", text: "Exportando a resolución completa…" });
    setResults([]);
    try {
      const targets = [format, ...otherFormats.filter((f) => adapt.includes(f.key))];
      const out = [];
      for (const t of targets) out.push(await exportOne(t, design));
      setResults(out);
      setStatus({ tone: "ok", text: `${out.length} versión(es) guardadas en la Biblioteca y en el proyecto. Revisa el control de calidad abajo.` });
      router.refresh();
    } catch (e) {
      setStatus({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const ratio = useMemo(() => `${design.width} / ${design.height}`, [design.width, design.height]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <div className="mx-auto w-full max-w-[540px]">
          <canvas
            ref={preview}
            role="img"
            aria-label={`Vista previa: ${design.texts.headline || "diseño"}`}
            className="h-auto w-full rounded-xl border border-line bg-surface-2"
            style={{ aspectRatio: ratio }}
          />
          <p className="mt-2 text-center text-xs text-faint">
            {format.label} · {format.width}×{format.height} px · edición por código (no es IA)
          </p>
          {format.safe.top + format.safe.bottom > 0 && <p className="text-center text-xs text-faint">{format.note}</p>}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 text-sm">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">Textos (exactos)</legend>
          {(["headline", "price", "body", "cta"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1">
              <Label htmlFor={`ed-${k}`}>{{ headline: "Título", price: "Precio", body: "Texto secundario", cta: "Llamada a la acción" }[k]}</Label>
              <input id={`ed-${k}`} className="input" value={design.texts[k]} maxLength={k === "body" ? 280 : 140} onChange={(e) => set("texts", { [k]: e.target.value })} />
            </div>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="ed-template">Composición</Label>
            <select id="ed-template" className="input" value={design.template} onChange={(e) => setDesign((d) => ({ ...d, template: e.target.value as Design["template"] }))}>
              {TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {TEMPLATE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="ed-bg">Foto de fondo</Label>
            <select id="ed-bg" className="input" value={design.background.asset_id ?? ""} onChange={(e) => set("background", { asset_id: e.target.value || null })}>
              <option value="">Solo color</option>
              {backgrounds.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                  {i.width ? ` (${i.width}×${i.height})` : ""}
                </option>
              ))}
            </select>
          </div>
          {design.background.asset_id && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ed-fit">Ajuste</Label>
                <select id="ed-fit" className="input" value={design.background.fit} onChange={(e) => set("background", { fit: e.target.value as "cover" | "contain" })}>
                  <option value="cover">Llenar (recortar)</option>
                  <option value="contain">Completa (sin recorte)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ed-zoom">Zoom ({design.background.zoom.toFixed(1)}×)</Label>
                <input id="ed-zoom" type="range" min={1} max={3} step={0.1} value={design.background.zoom} onChange={(e) => set("background", { zoom: Number(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ed-fx">Encuadre horizontal</Label>
                <input id="ed-fx" type="range" min={0} max={1} step={0.01} value={design.background.focus_x} onChange={(e) => set("background", { focus_x: Number(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ed-fy">Encuadre vertical</Label>
                <input id="ed-fy" type="range" min={0} max={1} step={0.01} value={design.background.focus_y} onChange={(e) => set("background", { focus_y: Number(e.target.value) })} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ed-bgcolor">Color de fondo</Label>
            <input id="ed-bgcolor" type="color" className="h-11 w-full rounded-lg border border-line bg-transparent" value={design.background.color} onChange={(e) => set("background", { color: e.target.value.toUpperCase() })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ed-overlay">Velo oscuro ({Math.round(design.overlay.opacity * 100)} %)</Label>
            <input id="ed-overlay" type="range" min={0} max={0.9} step={0.05} value={design.overlay.opacity} onChange={(e) => set("overlay", { opacity: Number(e.target.value) })} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="ed-logo">Logotipo</Label>
            <select id="ed-logo" className="input" value={design.logo.asset_id ?? ""} onChange={(e) => set("logo", { asset_id: e.target.value || null })}>
              <option value="">Sin logotipo</option>
              {logos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                  {i.kind === "logo" ? " (logotipo)" : ""}
                </option>
              ))}
            </select>
          </div>
          {design.logo.asset_id && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ed-logopos">Posición</Label>
                <select id="ed-logopos" className="input" value={design.logo.position} onChange={(e) => set("logo", { position: e.target.value as Design["logo"]["position"] })}>
                  {LOGO_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ed-logosize">Tamaño ({design.logo.size_pct} %)</Label>
                <input id="ed-logosize" type="range" min={5} max={40} step={1} value={design.logo.size_pct} onChange={(e) => set("logo", { size_pct: Number(e.target.value) })} />
              </div>
            </>
          )}
          {(["text", "accent", "accent_text"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1">
              <Label htmlFor={`ed-c-${k}`}>{{ text: "Color del texto", accent: "Color de acento", accent_text: "Texto sobre acento" }[k]}</Label>
              <input id={`ed-c-${k}`} type="color" className="h-11 w-full rounded-lg border border-line bg-transparent" value={design.colors[k]} onChange={(e) => set("colors", { [k]: e.target.value.toUpperCase() })} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ed-scale">Tamaño de letra ({Math.round(design.text_scale * 100)} %)</Label>
            <input id="ed-scale" type="range" min={0.6} max={1.6} step={0.05} value={design.text_scale} onChange={(e) => setDesign((d) => ({ ...d, text_scale: Number(e.target.value) }))} />
          </div>
        </div>

        {otherFormats.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-medium">Adaptar también a</legend>
            {otherFormats.map((f) => (
              <label key={f.key} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--action)]" checked={adapt.includes(f.key)} onChange={(e) => setAdapt((a) => (e.target.checked ? [...a, f.key] : a.filter((k) => k !== f.key)))} />
                {f.label} <span className="text-xs text-faint">({f.width}×{f.height})</span>
              </label>
            ))}
          </fieldset>
        )}

        <Button type="button" onClick={onExport} disabled={busy}>
          {busy ? "Exportando…" : "Exportar y revisar"}
        </Button>
        {status && (
          <p role={status.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${status.tone === "error" ? "bg-danger-soft text-danger" : status.tone === "ok" ? "bg-positive-soft text-positive" : "bg-surface-2 text-muted"}`}>
            {status.text}
          </p>
        )}
        {results.map((r) => (
          <div key={r.label} className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="mb-2 flex items-center justify-between gap-2 font-medium">
              {r.label}
              <Badge tone={r.status === "failed" ? "danger" : r.status === "passed" ? "positive" : "warn"}>
                {r.status === "failed" ? "Con errores" : r.status === "passed" ? "Sin observaciones" : "Con advertencias"}
              </Badge>
            </p>
            <QaList checks={r.checks} />
          </div>
        ))}
      </div>
    </div>
  );
}

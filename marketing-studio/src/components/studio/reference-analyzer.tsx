"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardCopy, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { analyzePixels } from "@/lib/studio/analysis";
import { INTERPRETED_FIELDS, type Interpreted, type Measured } from "@/lib/studio/styles";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { saveStyle } from "@/app/(app)/_studio/actions";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Prompt para pedir a ChatGPT la parte que NO se puede medir con píxeles. */
export function analysisPrompt(businessName: string) {
  return [
    "Analiza la imagen publicitaria que adjunto como referencia de estilo (no la voy a copiar).",
    "Responde SOLO con estas 7 líneas, en español, una frase concreta cada una:",
    ...INTERPRETED_FIELDS.map((f) => `${f.label}: (${f.hint.toLowerCase()})`),
    `No identifiques personas ni marcas. Después de eso, en una línea «Adaptación:», explica cómo adaptar este estilo a ${businessName} sin copiar logotipos, textos ni la obra.`,
  ].join("\n");
}

/** Lee «Campo: valor» de la respuesta pegada. */
export function parseAnalysis(text: string): Interpreted {
  const out: Interpreted = {};
  for (const line of text.split(/\n+/)) {
    const m = line.replace(/^[-*•\s]+/, "").match(/^\**([^:*]{3,40})\**\s*:\s*(.+)$/);
    if (!m) continue;
    const f = INTERPRETED_FIELDS.find((x) => norm(m[1]).startsWith(norm(x.label).split(" ")[0]));
    if (f) out[f.key] = m[2].trim().slice(0, 600);
  }
  return out;
}

async function measure(file: File): Promise<Measured> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  const m = analyzePixels({ data, width: w, height: h });
  return { ...m, width: bmp.width, height: bmp.height, aspect: m.aspect };
}

export function MeasuredView({ m }: { m: Measured }) {
  return (
    <div className="rounded-2xl border border-line p-3 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">Medido por la app</p>
      <div className="mb-2 flex h-8 overflow-hidden rounded-lg ring-1 ring-line" aria-label={`Paleta: ${m.palette.map((p) => p.hex).join(", ")}`} role="img">
        {m.palette.map((p) => (
          <span key={p.hex} style={{ background: p.hex, flexGrow: Math.max(p.share, 0.04) }} title={`${p.hex} · ${Math.round(p.share * 100)}%`} />
        ))}
      </div>
      <p className="font-mono text-xs text-muted">{m.palette.map((p) => `${p.hex} ${Math.round(p.share * 100)}%`).join(" · ")}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {(
          [
            ["Luminosidad", `${m.brightness}/100`],
            ["Contraste", `${m.contrast}/100`],
            ["Saturación", `${m.saturation}/100`],
            ["Temperatura", m.temperature],
            ["Proporción", `${m.aspect} (${m.width}×${m.height})`],
            ["Foco visual", m.focus],
            ["Espacio libre", `${m.negativeSpace}%`],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ReferenceAnalyzer({ businessId, businessName, onSaved }: { businessId: string; businessName: string; onSaved?: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [interp, setInterp] = useState<Interpreted>({});
  const [paste, setPaste] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const pick = async (f: File) => {
    setError(null);
    setSaved(null);
    setFile(f);
    setUrl(URL.createObjectURL(f));
    try {
      setMeasured(await measure(f));
    } catch {
      setMeasured(null);
      setError("No se pudo leer la imagen. Usa JPG, PNG o WebP.");
    }
  };

  const save = async () => {
    if (!file || !measured) return;
    setBusy(true);
    setError(null);
    const up = await uploadToLibrary(file, {
      business_id: businessId,
      kind: "image",
      origin: "imported_design",
      title: `Referencia de estilo: ${name}`.slice(0, 160),
      description: "Referencia visual para crear un estilo. No es contenido propio: no se publica.",
      tags: "referencia, estilo",
      license_note: "Referencia de terceros o propia, solo para análisis de estilo. No publicar ni copiar.",
      asset_date: "",
      original_name: file.name || "referencia.png",
    });
    if (!up.ok) {
      setBusy(false);
      setError(up.message);
      return;
    }
    const r = await saveStyle({ id: null, businessId, name, description, attributes: { measured, interpreted: interp }, referenceAssetIds: [up.id], source: "reference_image" });
    setBusy(false);
    if (!r.ok) setError(r.message);
    else {
      setSaved({ id: r.id, name });
      onSaved?.(r.id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="pressable flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong p-4 text-center text-sm text-muted hover:border-action hover:text-action-strong">
        <ImagePlus className="size-6" aria-hidden />
        {file ? "Cambiar imagen" : "Elige un diseño de referencia (JPG, PNG o WebP)"}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>

      {url && (
        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local antes de subir */}
          <img src={url} alt="Referencia elegida" className="w-full rounded-xl bg-surface-3 object-contain" />
          <div className="flex flex-col gap-3">
            {measured && <MeasuredView m={measured} />}
            <div className="rounded-2xl border border-line p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-warn">Interpretado (lo describe una persona o ChatGPT)</p>
              <p className="mb-2 text-xs text-muted">La tipografía, el estilo, la jerarquía y el enfoque comercial no se pueden medir con píxeles. Escríbelos o pide el análisis a ChatGPT y pega la respuesta.</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <a
                  href="https://chatgpt.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => navigator.clipboard?.writeText(analysisPrompt(businessName)).then(() => setCopied(true), () => setCopied(false))}
                  className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold hover:bg-surface-2"
                >
                  <ClipboardCopy className="size-3.5" aria-hidden /> {copied ? "Prompt copiado · adjunta la imagen en ChatGPT" : "Copiar prompt de análisis y abrir ChatGPT"}
                </a>
              </div>
              <label className="mb-3 flex flex-col gap-1 text-xs font-medium">
                Pegar respuesta de ChatGPT (opcional)
                <textarea
                  className="input min-h-20 text-xs"
                  value={paste}
                  onChange={(e) => {
                    setPaste(e.target.value);
                    const parsed = parseAnalysis(e.target.value);
                    if (Object.keys(parsed).length) setInterp((cur) => ({ ...cur, ...parsed }));
                  }}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {INTERPRETED_FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1 text-xs font-medium">
                    {f.label}
                    <input className="input h-10 text-sm" placeholder={f.hint} value={interp[f.key] ?? ""} maxLength={600} onChange={(e) => setInterp((c) => ({ ...c, [f.key]: e.target.value }))} />
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Nombre del estilo
                <input className="input h-11" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej.: Barbería noir" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Nota (opcional)
                <input className="input h-11" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Para qué funciona este estilo" />
              </label>
            </div>
            <p className="text-xs text-muted">Se guarda la referencia y su análisis. Al crear, se adapta a la identidad de {businessName}: nunca se copian logotipos, textos ni la obra exacta.</p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {saved ? (
              <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-positive-soft p-3 text-sm text-positive">
                Estilo «{saved.name}» guardado.
                <Link
                  href={`/?nueva=1&estilo=${saved.id}&idea=${encodeURIComponent(`Crea algo con el estilo ${saved.name} para ${businessName}`)}`}
                  className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-action px-3 font-semibold text-on-action"
                >
                  <Sparkles className="size-4" aria-hidden /> Crear con este estilo
                </Link>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy || !measured || name.trim().length < 2}
                onClick={save}
                className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action shadow-raised disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Guardar como estilo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

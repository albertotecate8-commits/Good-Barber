"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, Check, ClipboardCopy, Download, ExternalLink, ImageUp, Loader2, PenLine, ScrollText, Share2, Wand2 } from "lucide-react";
import type { Proposal } from "@/lib/studio/propose";
import { CHAT_FORMATS } from "@/lib/studio/propose";
import { MODIFIERS } from "@/lib/studio/intent";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { generateImage, importGeneratedImage } from "@/app/(app)/_studio/actions";
import { buildReferenceForm, libraryFile, type PlannedReference } from "./refs";
import { assetSrc, type StudioVersion } from "./types";

/** Boceto de la composición: NO es la imagen final, solo muestra la jerarquía del texto. */
export function Sketch({ p, color, className }: { p: Proposal; color: string; className?: string }) {
  const vertical = p.format === "story" || p.format === "reel";
  return (
    <div
      aria-label={`Boceto de «${p.headline}»`}
      role="img"
      className={clsx("relative flex w-full flex-col justify-end overflow-hidden rounded-xl p-3 text-white", className)}
      style={{ aspectRatio: CHAT_FORMATS[p.format].ratio, background: `radial-gradient(120% 80% at 70% 20%, ${color}55, transparent 60%), linear-gradient(160deg, #1d2633, #0b0f15)` }}
    >
      <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium tracking-wide">Boceto · no es la imagen</span>
      <div className={clsx("flex flex-col gap-1", vertical && "mb-[18%]")}>
        <p className="text-balance text-sm font-bold leading-tight sm:text-base">{p.headline}</p>
        {p.price && (
          <span className="w-fit rounded-md px-1.5 py-0.5 text-xs font-bold text-[#0b0f15]" style={{ background: color }}>
            {p.price}
          </span>
        )}
        <span className="mt-1 w-fit rounded-full border border-white/40 px-2 py-0.5 text-[10px]">{p.cta}</span>
      </div>
    </div>
  );
}

/** Cómo se obtuvo cada imagen: siempre visible para no confundir un prompt con una imagen real. */
export function originLabel(tool: string | null | undefined, kind: string) {
  if (kind === "code_edit") return "Editada con texto exacto";
  if (tool === "cloudflare-flux2") return "Generada · FLUX.2";
  if (tool === "chatgpt") return "Importada · ChatGPT";
  if (tool === "gemini") return "Importada · Gemini";
  return "Importada";
}

export function ProposalCard({
  p,
  index,
  color,
  threadId,
  projectId,
  businessId,
  businessName,
  images,
  selectedId,
  canGenerate,
  generationNote,
  plannedRefs,
  attachFiles,
  onSelect,
  onNotice,
  onImported,
}: {
  p: Proposal & { versionId: string };
  index: number;
  color: string;
  threadId: string;
  projectId: string | null;
  businessId: string;
  businessName: string;
  images: StudioVersion[];
  selectedId: string | null;
  canGenerate: boolean;
  generationNote: string;
  /** Referencias que se enviarán a la generación directa, con su función. */
  plannedRefs: PlannedReference[];
  /** Archivos para adjuntar en ChatGPT (logotipo y referencias). */
  attachFiles: { assetId: string; label: string }[];
  onSelect: (versionId: string) => void;
  onNotice: (text: string, tone?: "ok" | "error") => void;
  onImported: (versionId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [withText, setWithText] = useState(false);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  const copy = () => {
    // Se copia dentro del clic (los navegadores lo exigen); el enlace abre ChatGPT en otra pestaña.
    navigator.clipboard?.writeText(p.prompt).then(
      () => {
        setCopied(true);
        onNotice(
          attachFiles.length
            ? `Prompt copiado. En ChatGPT pégalo y adjunta: ${attachFiles.map((f) => f.label).join(", ")} (descárgalos abajo). Después pega o sube aquí la imagen.`
            : "Prompt copiado. Pégalo en ChatGPT y, cuando tengas la imagen, pégala (Ctrl+V) o súbela aquí.",
        );
      },
      () => {
        setShowPrompt(true);
        onNotice("No se pudo copiar automáticamente: abre «Ver prompt» y cópialo a mano.", "error");
      },
    );
  };

  // En el teléfono: un solo paso abre la hoja de compartir con el prompt y los archivos (elige ChatGPT).
  const share = async () => {
    try {
      const files = await Promise.all(attachFiles.map((f, i) => libraryFile(f.assetId, `${i + 1}-${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)));
      const data: ShareData = { text: p.prompt, files };
      if (!navigator.canShare(data)) throw new Error("Tu navegador no permite compartir estos archivos.");
      await navigator.share(data);
      onNotice("Compartido. Al tener la imagen en ChatGPT, guárdala y súbela aquí con «Subir imagen generada».");
    } catch (e) {
      if ((e as Error).name !== "AbortError") onNotice((e as Error).message, "error");
    }
  };

  const upload = async (f: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      onNotice("Usa una imagen JPG, PNG o WebP.", "error");
      return;
    }
    setUploading(true);
    const r = await uploadToLibrary(f, {
      business_id: businessId,
      kind: "image",
      origin: "ai_generated",
      title: `${p.title} · ${businessName}`.slice(0, 160),
      description: `Generada en ChatGPT a partir del prompt de la propuesta «${p.title}» (${p.angle}).`.slice(0, 2000),
      tags: "chat, chatgpt",
      license_note: "",
      asset_date: "",
      original_name: f.name || "imagen.png",
    });
    if (!r.ok) {
      setUploading(false);
      onNotice(r.message, "error");
      return;
    }
    const res = await importGeneratedImage({ threadId, conceptVersionId: p.versionId, assetId: r.id, tool: "chatgpt" });
    setUploading(false);
    if (!res.ok) onNotice(res.message, "error");
    else {
      onNotice("Imagen importada con su prompt, estilo y versión.");
      onImported(res.versionId);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const form = await buildReferenceForm(plannedRefs, { threadId, conceptVersionId: p.versionId, includeText: withText ? "1" : "0" });
      const r = await generateImage(form);
      if (!r.ok) onNotice(r.message, "error");
      else {
        onNotice("Imagen generada y guardada como nueva versión.");
        onImported(r.versionId);
      }
    } catch (e) {
      onNotice((e as Error).message, "error");
    }
    setGenerating(false);
  };

  const onPaste = (e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      void upload(item);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    if (f) void upload(f);
  };

  const busy = uploading || generating;
  return (
    <article
      className={clsx("@container surface-raised flex flex-col gap-3 rounded-2xl border p-3", dragging ? "border-action ring-2 ring-action" : "border-line/70")}
      aria-label={`Propuesta ${index + 1}: ${p.title}`}
      onPaste={onPaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-action-strong">
            Propuesta {index + 1} · {CHAT_FORMATS[p.format].label}
          </p>
          <h3 className="truncate text-sm font-semibold">{p.title}</h3>
          <p className="text-xs text-muted">
            {p.angle}
            {p.styleName ? ` · estilo «${p.styleName}»` : ""}
          </p>
        </div>
        <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", images.length ? "bg-positive-soft text-positive" : "bg-surface-3 text-muted")}>
          {images.length ? `${images.length} imagen(es)` : "Solo prompt"}
        </span>
      </div>

      {images.length > 0 ? (
        <div className={clsx("grid gap-2", images.length > 1 && "grid-cols-2")}>
          {images.map((v) => (
            <div key={v.id} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                aria-pressed={selectedId === v.id}
                className={clsx("pressable relative overflow-hidden rounded-xl ring-2", selectedId === v.id ? "ring-action" : "ring-transparent")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
                <img src={assetSrc(v.asset_id!)} alt={`Imagen v${v.version_no} de «${p.title}» (${originLabel(v.tool, v.kind)})`} className="w-full object-cover" style={{ aspectRatio: CHAT_FORMATS[p.format].ratio }} />
                <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  v{v.version_no} · {originLabel(v.tool, v.kind)}
                  {v.is_final ? " · aprobada" : ""}
                </span>
              </button>
              {projectId && v.kind !== "code_edit" && (
                <Link href={`/estudio/${projectId}?tab=editor&desde=${v.id}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-action-strong underline">
                  <PenLine className="size-3" aria-hidden /> Poner texto y logotipo exactos
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => onSelect(p.versionId)} className="pressable rounded-xl text-left" aria-label={`Ver propuesta ${index + 1} en grande`}>
          <Sketch p={p} color={color} />
        </button>
      )}

      <p className="text-sm text-ink">{p.text}</p>
      {p.modifiers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.modifiers.map((m) => (
            <span key={m} className="rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-medium text-action-strong">
              {MODIFIERS[m].label}
            </span>
          ))}
        </div>
      )}
      {p.warnings.map((w) => (
        <p key={w} className="flex gap-1.5 text-xs text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
        </p>
      ))}

      {canGenerate ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-2">
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-action px-3 text-sm font-semibold text-on-action shadow-raised hover:bg-action-strong disabled:opacity-60"
          >
            {generating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
            {generating ? "Generando imagen…" : images.length ? "Generar otra versión" : "Generar imagen"}
          </button>
          <p className="text-[11px] text-muted">
            {plannedRefs.length ? `Usará: ${plannedRefs.map((r) => r.label).join(", ")}. ` : ""}
            {generationNote}
          </p>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" className="size-3.5 accent-[var(--action)]" checked={withText} onChange={(e) => setWithText(e.target.checked)} />
            Intentar el texto dentro de la imagen (lo seguro es ponerlo con el editor)
          </label>
        </div>
      ) : (
        <p className="rounded-xl bg-surface-2 p-2 text-[11px] text-muted">{generationNote}</p>
      )}

      <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
        <a
          href="https://chatgpt.com/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={copy}
          className={clsx(
            "pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold",
            canGenerate ? "border border-line bg-surface text-ink shadow-soft hover:bg-surface-2" : "bg-action text-on-action shadow-raised hover:bg-action-strong",
          )}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
          Copiar prompt y abrir ChatGPT
          <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => file.current?.click()}
          className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink shadow-soft hover:bg-surface-2 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
          {uploading ? "Subiendo…" : "Subir imagen generada"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={`Imagen generada para la propuesta ${index + 1}`}
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      <p className="-mt-1 text-[11px] text-faint">También puedes pegar (Ctrl+V) o arrastrar aquí la imagen que te dio ChatGPT.</p>
      {(attachFiles.length > 0 || canShareFiles) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {canShareFiles && (
            <button type="button" onClick={share} className="inline-flex items-center gap-1 font-medium text-action-strong underline">
              <Share2 className="size-3" aria-hidden /> Compartir prompt y archivos con ChatGPT
            </button>
          )}
          {attachFiles.map((f) => (
            <a key={f.assetId} href={`${assetSrc(f.assetId)}?descargar=1`} className="inline-flex items-center gap-1 text-muted underline">
              <Download className="size-3" aria-hidden /> {f.label}
            </a>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted hover:text-ink">
        <ScrollText className="size-3.5" aria-hidden /> {showPrompt ? "Ocultar prompt" : "Ver prompt"}
      </button>
      {showPrompt && (
        <textarea readOnly value={p.prompt} aria-label={`Prompt de la propuesta ${index + 1}`} className="input min-h-48 font-mono" style={{ fontSize: 13, lineHeight: 1.45 }} onFocus={(e) => e.currentTarget.select()} />
      )}
    </article>
  );
}

"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, ClipboardCopy, ExternalLink, ImageUp, Loader2, ScrollText } from "lucide-react";
import type { Proposal } from "@/lib/studio/propose";
import { CHAT_FORMATS } from "@/lib/studio/propose";
import { MODIFIERS } from "@/lib/studio/intent";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { importGeneratedImage } from "@/app/(app)/_studio/actions";
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

export function ProposalCard({
  p,
  index,
  color,
  threadId,
  businessId,
  businessName,
  images,
  selectedId,
  onSelect,
  onNotice,
  onImported,
}: {
  p: Proposal & { versionId: string };
  index: number;
  color: string;
  threadId: string;
  businessId: string;
  businessName: string;
  images: StudioVersion[];
  selectedId: string | null;
  onSelect: (versionId: string) => void;
  onNotice: (text: string, tone?: "ok" | "error") => void;
  onImported: (versionId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const copy = () => {
    // Se copia dentro del clic (los navegadores lo exigen); el enlace abre ChatGPT en otra pestaña.
    navigator.clipboard?.writeText(p.prompt).then(
      () => {
        setCopied(true);
        onNotice("Prompt copiado. Pégalo en ChatGPT (y adjunta el logotipo y las referencias si las tienes). Cuando tengas la imagen, súbela con «Subir imagen generada».");
      },
      () => {
        setShowPrompt(true);
        onNotice("No se pudo copiar automáticamente: abre «Ver prompt» y cópialo a mano.", "error");
      },
    );
  };

  const upload = async (f: File) => {
    setUploading(true);
    const r = await uploadToLibrary(f, {
      business_id: businessId,
      kind: "image",
      origin: "ai_generated",
      title: `${p.title} · ${businessName}`.slice(0, 160),
      description: `Generada a partir del prompt de la propuesta «${p.title}» (${p.angle}).`.slice(0, 2000),
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

  return (
    <article className="@container surface-raised flex flex-col gap-3 rounded-2xl border border-line/70 p-3" aria-label={`Propuesta ${index + 1}: ${p.title}`}>
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
      </div>

      {images.length > 0 ? (
        <div className={clsx("grid gap-2", images.length > 1 && "grid-cols-2")}>
          {images.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              aria-pressed={selectedId === v.id}
              className={clsx("pressable relative overflow-hidden rounded-xl ring-2", selectedId === v.id ? "ring-action" : "ring-transparent")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
              <img src={assetSrc(v.asset_id!)} alt={`Imagen importada v${v.version_no} de «${p.title}»`} className="w-full object-cover" style={{ aspectRatio: CHAT_FORMATS[p.format].ratio }} />
              <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                v{v.version_no}
                {v.is_final ? " · aprobada" : ""}
              </span>
            </button>
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

      <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
        <a
          href="https://chatgpt.com/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={copy}
          className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-action px-3 text-sm font-semibold text-on-action shadow-raised hover:bg-action-strong"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
          Copiar prompt y abrir ChatGPT
          <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </a>
        <button
          type="button"
          disabled={uploading}
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
      <button type="button" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted hover:text-ink">
        <ScrollText className="size-3.5" aria-hidden /> {showPrompt ? "Ocultar prompt" : "Ver prompt"}
      </button>
      {showPrompt && (
        <textarea readOnly value={p.prompt} aria-label={`Prompt de la propuesta ${index + 1}`} className="input min-h-48 font-mono" style={{ fontSize: 13, lineHeight: 1.45 }} onFocus={(e) => e.currentTarget.select()} />
      )}
    </article>
  );
}

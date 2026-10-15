"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ASSET_KINDS, ASSET_KIND_LABELS, ASSET_ORIGINS, ASSET_ORIGIN_LABELS, type AssetKind, type AssetOrigin } from "@/lib/content-labels";
import { ALLOWED_MIME, MAX_ASSET_BYTES, acceptFor } from "@/lib/validation/asset";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { useHydrated } from "@/lib/use-action-form";
import { Button, Field } from "./ui";

type Status = { tone: "idle" | "busy" | "ok" | "error"; text: string };

export function AssetUploader({
  businesses,
  defaultBusinessId,
  disabledReason,
  defaultKind = "image",
  defaultOrigin = "unspecified",
  defaultTags = "",
  onUploaded,
  submitLabel = "Subir archivo",
}: {
  businesses: { id: string; name: string }[];
  defaultBusinessId?: string;
  disabledReason?: string;
  defaultKind?: AssetKind;
  defaultOrigin?: AssetOrigin;
  defaultTags?: string;
  /** Se llama con el id del recurso ya verificado (p. ej. para crear una versión). */
  onUploaded?: (assetId: string) => void | Promise<void>;
  submitLabel?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const ready = useHydrated();
  const [kind, setKind] = useState<AssetKind>(defaultKind);
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  // El título sigue al archivo elegido hasta que el usuario lo escribe a mano.
  const [titleTouched, setTitleTouched] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    setErrors({});
    if (!(file instanceof File) || file.size === 0) {
      setErrors({ file: "Elige un archivo." });
      return;
    }
    // Validación previa (el servidor vuelve a validar todo).
    if (!ALLOWED_MIME[kind].includes(file.type)) {
      setErrors({ file: `Este tipo de archivo (${file.type || "desconocido"}) no se permite como «${ASSET_KIND_LABELS[kind]}».` });
      return;
    }
    if (file.size > MAX_ASSET_BYTES) {
      setErrors({ file: "El archivo supera 50 MB." });
      return;
    }

    setStatus({ tone: "busy", text: "Subiendo archivo…" });
    const result = await uploadToLibrary(file, {
      business_id: String(form.get("business_id") ?? ""),
      kind,
      origin: String(form.get("origin") ?? "unspecified") as AssetOrigin,
      title: String(form.get("title") ?? "") || file.name,
      description: String(form.get("description") ?? ""),
      tags: String(form.get("tags") ?? ""),
      license_note: String(form.get("license_note") ?? ""),
      asset_date: String(form.get("asset_date") ?? ""),
      original_name: file.name,
    });
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setStatus({ tone: "error", text: result.message });
      return;
    }
    onUploaded?.(result.id);

    setStatus({ tone: "ok", text: `«${file.name}» se subió correctamente.` });
    formRef.current?.reset();
    setTitle("");
    setTitleTouched(false);
    router.refresh();
  }

  if (disabledReason) {
    return <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{disabledReason}</p>;
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Negocio" name="up-business">
        <select id="up-business" name="business_id" className="input" defaultValue={defaultBusinessId ?? businesses[0]?.id}>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tipo de recurso" name="up-kind" error={errors.kind}>
        <select id="up-kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
          {ASSET_KINDS.map((k) => (
            <option key={k} value={k}>
              {ASSET_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Origen" name="up-origin" hint="Si lo generaste con ChatGPT, Gemini o Flow, elige «Generado con IA».">
        <select id="up-origin" name="origin" className="input" defaultValue={defaultOrigin}>
          {ASSET_ORIGINS.map((o) => (
            <option key={o} value={o}>
              {ASSET_ORIGIN_LABELS[o]}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Archivo" name="up-file" error={errors.file} hint="Máximo 50 MB por archivo.">
          <input
            id="up-file"
            name="file"
            type="file"
            accept={acceptFor(kind)}
            className="input file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-ink"
            aria-invalid={errors.file ? true : undefined}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && !titleTouched) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
        </Field>
      </div>
      {kind === "audio" && (
        <div className="sm:col-span-2">
          <Field label="Licencia de la música" name="up-license" error={errors.license_note} hint="Obligatorio: música propia, comprada o libre de regalías, y de dónde viene (enlace).">
            <input id="up-license" name="license_note" className="input" maxLength={1000} aria-invalid={errors.license_note ? true : undefined} />
          </Field>
        </div>
      )}
      <Field label="Título" name="up-title" error={errors.title}>
        <input id="up-title" name="title" className="input" value={title} onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(e.target.value !== "");
          }} maxLength={160} />
      </Field>
      <Field label="Fecha del recurso" name="up-date" error={errors.asset_date} hint="Cuándo se tomó o creó (opcional).">
        <input id="up-date" name="asset_date" type="date" className="input" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Etiquetas" name="up-tags" hint="Separadas por comas: promoción, fade, local…">
          <input id="up-tags" name="tags" className="input" maxLength={2000} defaultValue={defaultTags} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Descripción" name="up-description">
          <textarea id="up-description" name="description" className="input" maxLength={2000} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        {status.text && (
          <p
            role={status.tone === "error" ? "alert" : "status"}
            className={`rounded-lg px-3 py-2 text-sm ${
              status.tone === "error"
                ? "bg-danger-soft text-danger"
                : status.tone === "ok"
                  ? "bg-positive-soft text-positive"
                  : "bg-surface-2 text-muted"
            }`}
          >
            {status.text}
          </p>
        )}
        <Button type="submit" disabled={status.tone === "busy" || !ready} className="sm:self-start">
          {status.tone === "busy" ? "Subiendo…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

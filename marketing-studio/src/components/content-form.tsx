"use client";

import { useActionForm } from "@/lib/use-action-form";
import { useMemo, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import type { Asset, ContentItem } from "@/lib/data/types";
import { ASSET_KIND_LABELS, CONTENT_FORMATS, CONTENT_STATUS_LABELS, EDITABLE_STATUSES, FORMAT_LABELS } from "@/lib/content-labels";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/validation/business";
import { INSTAGRAM_CAPTION_MAX, composePostText, parseHashtags } from "@/lib/validation/content";
import { utcToZoned } from "@/lib/tz";
import { Badge, Button, Field } from "./ui";

type FormAction = (state: ActionState, form: FormData) => Promise<ActionState>;
type AssetOption = Pick<Asset, "id" | "business_id" | "title" | "kind" | "mime_type">;

export function ContentForm({
  action,
  businesses,
  assets,
  item,
  defaults,
  submitLabel,
}: {
  action: FormAction;
  businesses: { id: string; name: string }[];
  assets: AssetOption[];
  item?: ContentItem;
  defaults?: { business_id?: string; date?: string };
  submitLabel: string;
}) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const local = item?.scheduled_at ? utcToZoned(item.scheduled_at) : null;
  const [businessId, setBusinessId] = useState(item?.business_id ?? defaults?.business_id ?? businesses[0]?.id ?? "");
  const [platform, setPlatform] = useState<string>(item?.platform ?? "instagram");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [hashtags, setHashtags] = useState(item?.hashtags.map((t) => `#${t}`).join(" ") ?? "");
  const serverOnlyStatus = item && !EDITABLE_STATUSES.includes(item.status as (typeof EDITABLE_STATUSES)[number]);

  const businessAssets = useMemo(() => assets.filter((a) => a.business_id === businessId), [assets, businessId]);
  const finalLength = composePostText(caption, parseHashtags(hashtags).tags).length;
  const tagCount = parseHashtags(hashtags).tags.length;
  const e = state.errors ?? {};
  const aria = (name: string) => ({
    id: name,
    name,
    "aria-invalid": e[name] ? true : undefined,
    "aria-describedby": e[name] ? `${name}-error` : undefined,
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Negocio" name="business_id" error={e.business_id}>
        <select
          {...aria("business_id")}
          className="input"
          value={businessId}
          onChange={(ev) => setBusinessId(ev.target.value)}
          disabled={Boolean(item)}
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      {/* Un select deshabilitado no se envía: el negocio de una publicación existente no cambia. */}
      {item && <input type="hidden" name="business_id" value={item.business_id} />}

      <Field label="Plataforma" name="platform" error={e.platform}>
        <select {...aria("platform")} className="input" value={platform} onChange={(ev) => setPlatform(ev.target.value)}>
          {SOCIAL_PLATFORMS.filter((p) => p !== "website").map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Formato" name="format" error={e.format}>
        <select {...aria("format")} className="input" defaultValue={item?.format ?? "post"}>
          {CONTENT_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Estado" name="status" error={e.status} hint={serverOnlyStatus ? undefined : "«Publicado» y «Error» solo los asigna una integración oficial."}>
        {serverOnlyStatus ? (
          <>
            {/* Sin campo "status": el servidor conserva el estado asignado por la plataforma. */}
            <p className="flex min-h-11 items-center">
              <Badge tone={item.status === "published" ? "positive" : "danger"}>{CONTENT_STATUS_LABELS[item.status]}</Badge>
            </p>
          </>
        ) : (
          <select {...aria("status")} className="input" defaultValue={item?.status ?? "draft"}>
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="sm:col-span-2">
        <Field label="Título interno" name="title" error={e.title} hint="Para identificarla en el calendario; no se publica.">
          <input {...aria("title")} className="input" defaultValue={item?.title} maxLength={200} />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="Texto de la publicación" name="caption" error={e.caption}>
          <textarea
            {...aria("caption")}
            className="input min-h-36"
            value={caption}
            onChange={(ev) => setCaption(ev.target.value)}
            maxLength={5000}
          />
        </Field>
        {platform === "instagram" && (
          <p className={`mt-1 text-xs ${finalLength > INSTAGRAM_CAPTION_MAX ? "text-danger" : "text-faint"}`} aria-live="polite">
            {finalLength} / {INSTAGRAM_CAPTION_MAX} caracteres con hashtags (límite de Instagram)
          </p>
        )}
      </div>

      <div className="sm:col-span-2">
        <Field label="Hashtags" name="hashtags" error={e.hashtags} hint="Separados por espacios o comas. Máximo 30.">
          <input
            {...aria("hashtags")}
            className="input"
            value={hashtags}
            onChange={(ev) => setHashtags(ev.target.value)}
            placeholder="#barberia #durango #fade"
          />
        </Field>
        <p className="mt-1 text-xs text-faint">{tagCount} hashtag(s)</p>
      </div>

      <Field label="Fecha" name="date" error={e.date}>
        <input {...aria("date")} type="date" className="input" defaultValue={local?.date ?? defaults?.date ?? ""} />
      </Field>
      <Field label="Hora (Ciudad de México)" name="time" error={e.time}>
        <input {...aria("time")} type="time" className="input" defaultValue={local?.time ?? ""} step={60} />
      </Field>

      <div className="sm:col-span-2">
        <Field
          label="Recurso creativo"
          name="asset_id"
          error={e.asset_id}
          hint={businessAssets.length ? "Imagen, video o diseño de la biblioteca de este negocio." : "Este negocio aún no tiene archivos en la Biblioteca."}
        >
          <select {...aria("asset_id")} className="input" defaultValue={item?.asset_id ?? ""} key={businessId}>
            <option value="">Sin recurso</option>
            {businessAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {ASSET_KIND_LABELS[a.kind]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-col gap-3 sm:col-span-2">
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}
          >
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

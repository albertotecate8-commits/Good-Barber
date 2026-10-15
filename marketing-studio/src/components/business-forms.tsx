"use client";

import { useActionForm } from "@/lib/use-action-form";
import { useRef, useEffect, useTransition } from "react";
import type { ActionState } from "@/lib/action-state";
import type { BrandProfile, Business, Offering } from "@/lib/data/types";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/validation/business";
import { Button, Field } from "./ui";

type FormAction = (state: ActionState, form: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}
    >
      {state.message}
    </p>
  );
}

function errProps(state: ActionState, name: string) {
  const error = state.errors?.[name];
  return {
    id: name,
    name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : undefined,
  } as const;
}

/** Limpia el formulario tras guardar con éxito (para formularios de alta). */
function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function BusinessForm({
  action,
  business,
  submitLabel,
}: {
  action: FormAction;
  business?: Business;
  submitLabel: string;
}) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const b = business;
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Nombre del negocio" name="name" error={state.errors?.name}>
        <input {...errProps(state, "name")} className="input" defaultValue={b?.name} required maxLength={80} />
      </Field>
      <Field label="Sector" name="sector" error={state.errors?.sector} hint="Ej. Barbería, Salón de uñas">
        <input {...errProps(state, "sector")} className="input" defaultValue={b?.sector} maxLength={80} />
      </Field>
      <Field
        label="Identificador en la URL"
        name="slug"
        error={state.errors?.slug}
        hint="Opcional. Se genera a partir del nombre."
      >
        <input {...errProps(state, "slug")} className="input" defaultValue={b?.slug} maxLength={60} />
      </Field>
      <Field label="Ciudad" name="city" error={state.errors?.city}>
        <input {...errProps(state, "city")} className="input" defaultValue={b?.city} maxLength={120} placeholder="Durango, Durango" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Descripción" name="description" error={state.errors?.description}>
          <textarea {...errProps(state, "description")} className="input" defaultValue={b?.description} maxLength={2000} />
        </Field>
      </div>
      <Field label="Dirección" name="address" error={state.errors?.address}>
        <input {...errProps(state, "address")} className="input" defaultValue={b?.address} maxLength={300} />
      </Field>
      <Field label="Área de servicio" name="service_area" error={state.errors?.service_area} hint="Colonias, municipios o «a domicilio»">
        <input {...errProps(state, "service_area")} className="input" defaultValue={b?.service_area} maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label="Público objetivo"
          name="target_audience"
          error={state.errors?.target_audience}
          hint="Quiénes son tus clientes ideales, qué buscan y qué les preocupa."
        >
          <textarea {...errProps(state, "target_audience")} className="input" defaultValue={b?.target_audience} maxLength={2000} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Feedback state={state} />
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

const COLOR_FIELDS = [
  ["color_primary", "Color principal"],
  ["color_secondary", "Color secundario"],
  ["color_accent", "Color de acento"],
  ["color_background", "Fondo"],
] as const;

export function BrandForm({ action, brand }: { action: FormAction; brand: BrandProfile }) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <fieldset className="grid grid-cols-2 gap-3 sm:col-span-2 md:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Colores de marca</legend>
        {COLOR_FIELDS.map(([name, label]) => (
          <ColorField key={name} name={name} label={label} value={brand[name]} error={state.errors?.[name]} />
        ))}
      </fieldset>
      <Field label="Tipografía de títulos" name="font_heading" error={state.errors?.font_heading}>
        <input {...errProps(state, "font_heading")} className="input" defaultValue={brand.font_heading} placeholder="Ej. Montserrat" />
      </Field>
      <Field label="Tipografía de textos" name="font_body" error={state.errors?.font_body}>
        <input {...errProps(state, "font_body")} className="input" defaultValue={brand.font_body} placeholder="Ej. Inter" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Logotipo (enlace https)" name="logo_url" error={state.errors?.logo_url} hint="La subida de archivos llega con la Biblioteca.">
          <input {...errProps(state, "logo_url")} className="input" defaultValue={brand.logo_url ?? ""} inputMode="url" placeholder="https://…" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Tono de voz" name="tone_of_voice" error={state.errors?.tone_of_voice} hint="Cómo habla la marca: cercano, elegante, con humor, formal…">
          <textarea {...errProps(state, "tone_of_voice")} className="input" defaultValue={brand.tone_of_voice} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Reglas visuales" name="visual_rules" error={state.errors?.visual_rules}>
          <textarea {...errProps(state, "visual_rules")} className="input" defaultValue={brand.visual_rules} />
        </Field>
      </div>
      <Field label="Siempre (una regla por línea)" name="dos" error={state.errors?.dos}>
        <textarea {...errProps(state, "dos")} className="input" defaultValue={brand.dos.join("\n")} placeholder={"Mostrar precios exactos\nUsar fotos reales del local"} />
      </Field>
      <Field label="Nunca (una regla por línea)" name="donts" error={state.errors?.donts}>
        <textarea {...errProps(state, "donts")} className="input" defaultValue={brand.donts.join("\n")} placeholder={"Prometer resultados garantizados"} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Feedback state={state} />
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Guardando…" : "Guardar identidad"}
        </Button>
      </div>
    </form>
  );
}

function ColorField({ name, label, value, error }: { name: string; label: string; value: string; error?: string }) {
  const textRef = useRef<HTMLInputElement>(null);
  const swatchRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-xs text-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={swatchRef}
          type="color"
          aria-label={`${label}: selector`}
          defaultValue={value}
          onChange={(e) => {
            if (textRef.current) textRef.current.value = e.target.value.toUpperCase();
          }}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
        />
        <input
          ref={textRef}
          id={name}
          name={name}
          defaultValue={value}
          className="input font-mono uppercase"
          maxLength={7}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            if (/^#[0-9a-f]{6}$/i.test(e.target.value) && swatchRef.current) swatchRef.current.value = e.target.value;
          }}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const KIND_LABELS = { service: "Servicio", package: "Paquete", product: "Producto" } as const;

export function OfferingForm({ action, offering, submitLabel }: { action: FormAction; offering?: Offering; submitLabel: string }) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const ref = useResetOnSuccess(offering ? {} : state);
  const suffix = offering?.id ?? "new";
  const p = (name: string) => {
    const props = errProps(state, name);
    return {
      ...props,
      id: `${name}-${suffix}`,
      "aria-describedby": props["aria-describedby"] ? `${name}-${suffix}-error` : undefined,
    };
  };
  return (
    <form ref={ref} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]" noValidate>
      <Field label="Nombre" name={`name-${offering?.id ?? "new"}`} error={state.errors?.name}>
        <input {...p("name")} className="input" defaultValue={offering?.name} required maxLength={120} />
      </Field>
      <Field label="Precio (MXN)" name={`price-${offering?.id ?? "new"}`} error={state.errors?.price} hint="Vacío = sin precio">
        <input
          {...p("price")}
          className="input"
          inputMode="decimal"
          defaultValue={offering?.price_cents != null ? String(offering.price_cents / 100) : ""}
          placeholder="120"
        />
      </Field>
      <Field label="Tipo" name={`kind-${offering?.id ?? "new"}`}>
        <select {...p("kind")} className="input" defaultValue={offering?.kind ?? "service"}>
          {Object.entries(KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-3">
        <Field label="Descripción (opcional)" name={`description-${offering?.id ?? "new"}`} error={state.errors?.description}>
          <input {...p("description")} className="input" defaultValue={offering?.description} maxLength={1000} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="active" defaultChecked={offering?.active ?? true} className="size-4 accent-[var(--action)]" />
        Activo (se puede usar en anuncios)
      </label>
      <div className="flex flex-col gap-3 sm:col-span-3">
        <Feedback state={state} />
        <Button type="submit" disabled={pending || !ready} variant={offering ? "secondary" : "primary"} className="sm:self-start">
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function PromotionForm({ action }: { action: FormAction }) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <Field label="Título" name="title" error={state.errors?.title}>
          <input {...errProps(state, "title")} className="input" maxLength={120} placeholder="Ej. Martes de corte + cejas" />
        </Field>
      </div>
      <Field label="Detalles" name="details" error={state.errors?.details}>
        <textarea {...errProps(state, "details")} className="input" />
      </Field>
      <Field label="Restricciones" name="restrictions" error={state.errors?.restrictions} hint="Lo que el anuncio debe aclarar">
        <textarea {...errProps(state, "restrictions")} className="input" />
      </Field>
      <Field label="Inicia" name="starts_on" error={state.errors?.starts_on}>
        <input {...errProps(state, "starts_on")} type="date" className="input" />
      </Field>
      <Field label="Termina" name="ends_on" error={state.errors?.ends_on}>
        <input {...errProps(state, "ends_on")} type="date" className="input" />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked className="size-4 accent-[var(--action)]" /> Activa
      </label>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Feedback state={state} />
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Guardando…" : "Agregar promoción"}
        </Button>
      </div>
    </form>
  );
}

export function SocialForm({ action }: { action: FormAction }) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3" noValidate>
      <Field label="Plataforma" name="platform">
        <select id="platform" name="platform" className="input" defaultValue="instagram">
          {SOCIAL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Usuario o nombre" name="handle" error={state.errors?.handle}>
        <input {...errProps(state, "handle")} className="input" placeholder="@usuario" maxLength={120} />
      </Field>
      <Field label="Enlace (https)" name="url" error={state.errors?.url}>
        <input {...errProps(state, "url")} className="input" inputMode="url" placeholder="https://…" />
      </Field>
      <div className="sm:col-span-3">
        <Field label="Notas" name="notes" error={state.errors?.notes}>
          <input {...errProps(state, "notes")} className="input" maxLength={1000} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-3">
        <Feedback state={state} />
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Guardando…" : "Registrar perfil"}
        </Button>
      </div>
    </form>
  );
}

/** Botón que ejecuta una acción de servidor previa confirmación. */
export function ConfirmButton({
  action,
  confirmText,
  children,
  variant = "danger",
}: {
  action: () => Promise<void>;
  confirmText: string;
  children: React.ReactNode;
  variant?: "danger" | "secondary" | "ghost";
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (window.confirm(confirmText)) start(() => action());
      }}
    >
      {pending ? "…" : children}
    </Button>
  );
}

/**
 * Validación de formularios (cliente). La base de datos repite estas
 * reglas con CHECK constraints: la validación del cliente solo mejora los
 * mensajes, nunca es la única barrera.
 */
import { z } from "zod";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label}: escribe al menos ${min} carácter${min === 1 ? "" : "es"}.`)
    .max(max, `${label}: máximo ${max} caracteres.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

/** Entero opcional desde un input de texto: "" → null. */
const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (!/^\d+$/.test(v)) {
        ctx.addIssue({ code: "custom", message: `${label}: escribe un número entero.` });
        return z.NEVER;
      }
      const n = Number(v);
      if (n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}: entre ${min} y ${max}.` });
        return z.NEVER;
      }
      return n;
    });

const requiredInt = (min: number, max: number, label: string) =>
  optionalInt(min, max, label).refine((v) => v !== null, `${label}: es obligatorio.`).transform((v) => v as number);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(72, "Máximo 72 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

export const businessSchema = z.object({
  name: trimmed(1, 60, "Nombre"),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color: usa el formato #RRGGBB."),
  default_dwell_seconds: requiredInt(5, 3600, "Permanencia mínima (s)"),
  active: z.boolean(),
});

export const cameraSchema = z.object({
  business_id: z.guid("Elige el negocio."),
  name: trimmed(1, 60, "Nombre"),
  model: trimmed(1, 60, "Modelo"),
  location_note: optionalText(200, "Ubicación"),
  stream_profile: z.enum(["stream1", "stream2"]),
  analysis_enabled: z.boolean(),
  active: z.boolean(),
});

export const stationSchema = z.object({
  business_id: z.guid("Elige el negocio."),
  camera_id: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.guid("Cámara no válida.").nullable()),
  name: trimmed(1, 40, "Nombre"),
  kind: z.enum(["silla", "mesa", "lavabo", "espera", "otro"]),
  dwell_threshold_seconds: optionalInt(5, 3600, "Permanencia mínima (s)"),
  release_grace_seconds: requiredInt(0, 600, "Tolerancia de salida (s)"),
  active: z.boolean(),
});

export const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  role: z.enum(["owner", "admin", "viewer"]),
  display_name: optionalText(60, "Nombre"),
});

/** slug a partir de un nombre: "Glamour Studio" → "glamour-studio". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Primer mensaje de error legible de un resultado de zod. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos del formulario.";
}

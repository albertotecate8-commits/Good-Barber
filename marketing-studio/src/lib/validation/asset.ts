import { z } from "zod";
import { ASSET_KINDS, type AssetKind } from "@/lib/content-labels";
import { isValidDateString } from "@/lib/tz";

// Límite por archivo del plan gratuito de Supabase Storage.
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const VIDEOS = ["video/mp4", "video/webm", "video/quicktime"];
const DOCS = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const SVG = "image/svg+xml";

export const ALLOWED_MIME: Record<AssetKind, string[]> = {
  image: IMAGES,
  logo: [...IMAGES, SVG],
  video: VIDEOS,
  document: DOCS,
  other: [...IMAGES, SVG, ...VIDEOS, ...DOCS],
};

export function acceptFor(kind: AssetKind) {
  return ALLOWED_MIME[kind].join(",");
}

export function isPreviewableImage(mime: string) {
  return mime.startsWith("image/");
}

/** Nombre de archivo seguro para la ruta de almacenamiento (conserva la extensión). */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
  return `${stem || "archivo"}${ext ? `.${ext}` : ""}`;
}

export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const k = t.toLocaleLowerCase("es-MX");
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out.slice(0, 30);
}

const metaFields = {
  kind: z.enum(ASSET_KINDS as [AssetKind, ...AssetKind[]], { message: "Elige un tipo" }),
  title: z.string().trim().min(1, "Escribe un título").max(160),
  description: z.string().trim().max(2000),
  tags: z.string().max(2000).transform(parseTags),
  asset_date: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidDateString(v), "Fecha no válida")
    .transform((v) => v || null),
};

export const assetMetaSchema = z.object(metaFields);

export const assetUploadSchema = z
  .object({
    ...metaFields,
    business_id: z.string().regex(/^[0-9a-f-]{36}$/i, "Elige un negocio"),
    original_name: z.string().min(1).max(255),
    mime_type: z.string().toLowerCase(),
    size: z.number().int().positive("El archivo está vacío"),
  })
  .superRefine((v, ctx) => {
    if (!ALLOWED_MIME[v.kind].includes(v.mime_type)) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: `Tipo de archivo no permitido para «${v.kind}» (${v.mime_type || "desconocido"}).`,
      });
    }
    if (v.size > MAX_ASSET_BYTES) {
      ctx.addIssue({ code: "custom", path: ["file"], message: "El archivo supera 50 MB (límite por archivo del plan gratuito)." });
    }
  });
export type AssetUploadInput = z.input<typeof assetUploadSchema>;

/**
 * Comprueba que los primeros bytes correspondan al tipo declarado, para que
 * un archivo no se haga pasar por imagen. Devuelve false si no coincide.
 */
export function sniffMatches(mime: string, head: Uint8Array): boolean {
  const b = head;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  switch (mime) {
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/gif":
      return ascii(0, 4) === "GIF8";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/avif":
      return ascii(4, 8) === "ftyp" && /avi[fs]/.test(ascii(8, 12));
    case "video/mp4":
    case "video/quicktime":
      return ascii(4, 8) === "ftyp" || ascii(4, 8) === "moov" || ascii(4, 8) === "wide" || ascii(4, 8) === "mdat";
    case "video/webm":
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "image/svg+xml": {
      const text = new TextDecoder().decode(b).trimStart().toLowerCase();
      return text.startsWith("<svg") || text.startsWith("<?xml");
    }
    case "text/plain":
      return !b.includes(0);
    default:
      // docx/xlsx/pptx son archivos ZIP.
      if (mime.startsWith("application/vnd.openxmlformats")) return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
      return false;
  }
}

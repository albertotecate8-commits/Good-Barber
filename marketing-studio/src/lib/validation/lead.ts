import { z } from "zod";
import { parsePriceToCents } from "@/lib/money";

// Prospectos y resultados comerciales capturados o importados por ti. La app
// no inventa ventas ni atribuye conversiones: guarda lo que registras y cómo
// sabes de qué campaña vino cada cliente.

export const LEAD_SOURCES = ["instagram_dm", "facebook_messenger", "whatsapp", "phone", "walk_in", "referral", "google", "website", "other"] as const;
export const LEAD_SOURCE_LABELS: Record<(typeof LEAD_SOURCES)[number], string> = {
  instagram_dm: "Mensaje de Instagram",
  facebook_messenger: "Messenger (Facebook)",
  whatsapp: "WhatsApp",
  phone: "Llamada",
  walk_in: "Llegó al local",
  referral: "Recomendación",
  google: "Google / Maps",
  website: "Sitio web",
  other: "Otro",
};
export const LEAD_STATUSES = ["new", "contacted", "appointment", "customer", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  appointment: "Con cita",
  customer: "Cliente (compró)",
  lost: "No se concretó",
};
export const ATTRIBUTIONS = ["declared", "campaign_code", "unknown"] as const;
export const ATTRIBUTION_LABELS: Record<(typeof ATTRIBUTIONS)[number], string> = {
  declared: "El cliente dijo que vio la campaña",
  campaign_code: "Usó el código o enlace de la campaña",
  unknown: "Sin atribución",
};

const optionalUuid = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().uuid().safeParse(v).success, "Campaña no válida.");

export const leadSchema = z
  .object({
    business_id: z.string().uuid(),
    campaign_id: optionalUuid.default(""),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha válida."),
    source: z.enum(LEAD_SOURCES).default("other"),
    contact_name: z.string().trim().max(120).default(""),
    contact_hint: z.string().trim().max(120).default(""),
    status: z.enum(LEAD_STATUSES).default("new"),
    value: z.string().trim().max(20).default(""),
    attribution: z.enum(ATTRIBUTIONS).default("unknown"),
    notes: z.string().trim().max(2000).default(""),
  })
  .transform((v, ctx) => {
    let value_cents: number | null = null;
    if (v.value) {
      let cents: number | null = null;
      try {
        cents = parsePriceToCents(v.value);
      } catch {
        cents = null;
      }
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: "custom", path: ["value"], message: `Monto no válido: "${v.value}".` });
        return z.NEVER;
      }
      value_cents = cents;
    }
    if (value_cents !== null && v.status !== "customer") {
      ctx.addIssue({ code: "custom", path: ["value"], message: "El monto de venta solo se registra cuando el prospecto ya es cliente." });
      return z.NEVER;
    }
    if (v.attribution !== "unknown" && !v.campaign_id) {
      ctx.addIssue({ code: "custom", path: ["campaign_id"], message: "Para atribuirlo a una campaña, elige cuál." });
      return z.NEVER;
    }
    const { value: _value, ...rest } = v;
    void _value;
    return { ...rest, campaign_id: rest.campaign_id || null, value_cents };
  });
export type LeadInput = z.infer<typeof leadSchema>;

// ---------------------------------------------------------------------------
// Importación CSV (hecho en Excel/Google Sheets, separado por comas o punto y coma)
// ---------------------------------------------------------------------------

/** Divide un CSV respetando comillas. Acepta coma o punto y coma (Excel en español). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const HEADERS: Record<string, keyof RawLead> = {
  fecha: "occurred_on",
  date: "occurred_on",
  nombre: "contact_name",
  cliente: "contact_name",
  contacto: "contact_hint",
  telefono: "contact_hint",
  usuario: "contact_hint",
  origen: "source",
  canal: "source",
  estado: "status",
  monto: "value",
  venta: "value",
  importe: "value",
  campana: "campaign",
  codigo: "campaign",
  notas: "notes",
  nota: "notes",
};

interface RawLead {
  occurred_on: string;
  contact_name: string;
  contact_hint: string;
  source: string;
  status: string;
  value: string;
  campaign: string;
  notes: string;
}

const SOURCE_WORDS: [RegExp, (typeof LEAD_SOURCES)[number]][] = [
  [/insta/, "instagram_dm"],
  [/messenger|facebook|fb/, "facebook_messenger"],
  [/whats|wa\b/, "whatsapp"],
  [/llamada|telefono|phone/, "phone"],
  [/local|visita|llego|walk/, "walk_in"],
  [/recomend|referid|amig/, "referral"],
  [/google|maps/, "google"],
  [/web|sitio|pagina/, "website"],
];
const STATUS_WORDS: [RegExp, LeadStatus][] = [
  [/cliente|compro|vendid|pag|atendid/, "customer"],
  [/cita|agend|reserv/, "appointment"],
  [/contact|respond/, "contacted"],
  [/perdid|no se|cancel|no vino|no asist/, "lost"],
  [/nuevo|pendiente/, "new"],
];

/** Convierte fechas dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd a aaaa-mm-dd. */
export function normalizeDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export interface ImportRow {
  line: number;
  ok: boolean;
  errors: string[];
  value?: LeadInput;
}

/**
 * Valida un CSV contra el negocio elegido. `campaigns` son SOLO las campañas de
 * ese negocio: una campaña de otro negocio nunca se puede asociar.
 */
export function prepareImport(csv: string, businessId: string, campaigns: { id: string; name: string }[], maxRows = 500): { rows: ImportRow[]; headerError: string | null } {
  const table = parseCsv(csv);
  if (table.length < 2) return { rows: [], headerError: "El archivo no tiene encabezados y al menos una fila." };
  const header = table[0].map((h) => HEADERS[norm(h)] ?? null);
  if (!header.includes("occurred_on")) return { rows: [], headerError: "Falta la columna «fecha»." };
  if (table.length - 1 > maxRows) return { rows: [], headerError: `Máximo ${maxRows} filas por importación.` };
  const byName = new Map(campaigns.map((c) => [norm(c.name), c.id]));
  const byId = new Set(campaigns.map((c) => c.id));

  const rows = table.slice(1).map((cells, i): ImportRow => {
    const raw: RawLead = { occurred_on: "", contact_name: "", contact_hint: "", source: "", status: "", value: "", campaign: "", notes: "" };
    header.forEach((key, j) => {
      if (key) raw[key] = (cells[j] ?? "").trim();
    });
    const errors: string[] = [];
    const date = normalizeDate(raw.occurred_on);
    if (!date) errors.push(`Fecha no válida: "${raw.occurred_on}".`);
    const s = norm(raw.source);
    const st = norm(raw.status);
    let campaignId = "";
    if (raw.campaign) {
      const c = byId.has(raw.campaign) ? raw.campaign : byName.get(norm(raw.campaign));
      if (!c) errors.push(`La campaña "${raw.campaign}" no existe en este negocio.`);
      else campaignId = c;
    }
    const status = (STATUS_WORDS.find(([re]) => re.test(st))?.[1] ?? (raw.value ? "customer" : "new")) as LeadStatus;
    const parsed = leadSchema.safeParse({
      business_id: businessId,
      campaign_id: campaignId,
      occurred_on: date ?? "1900-01-01",
      source: SOURCE_WORDS.find(([re]) => re.test(s))?.[1] ?? "other",
      contact_name: raw.contact_name,
      contact_hint: raw.contact_hint,
      status,
      value: raw.value,
      // Con columna de campaña, la atribución es la que tú registraste en el archivo.
      attribution: campaignId ? "declared" : "unknown",
      notes: raw.notes,
    });
    if (!parsed.success) errors.push(...parsed.error.issues.map((x) => x.message));
    return errors.length ? { line: i + 2, ok: false, errors } : { line: i + 2, ok: true, errors: [], value: parsed.data! };
  });
  return { rows, headerError: null };
}

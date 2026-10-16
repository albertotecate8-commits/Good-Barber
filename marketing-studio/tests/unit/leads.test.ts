import { describe, expect, it } from "vitest";
import { leadSchema, normalizeDate, parseCsv, prepareImport } from "@/lib/validation/lead";
import { campaignStats, contentSummary, summarizeLeads, type LeadRow } from "@/lib/analytics";

const BIZ = "11111111-1111-4111-8111-111111111111";
const CAMP = "22222222-2222-4222-8222-222222222222";
const OTHER_CAMP = "33333333-3333-4333-8333-333333333333";

describe("prospectos: validación", () => {
  const base = { business_id: BIZ, occurred_on: "2026-10-16", source: "whatsapp", status: "new" };
  it("acepta un prospecto mínimo y convierte el monto a centavos", () => {
    expect(leadSchema.parse(base)).toMatchObject({ value_cents: null, attribution: "unknown", campaign_id: null });
    expect(leadSchema.parse({ ...base, status: "customer", value: "$1,170.50" }).value_cents).toBe(117050);
  });
  it("no deja registrar ventas de quien no compró ni montos inválidos", () => {
    expect(leadSchema.safeParse({ ...base, status: "appointment", value: "$170" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, status: "customer", value: "mucho" }).success).toBe(false);
  });
  it("una atribución exige campaña", () => {
    expect(leadSchema.safeParse({ ...base, attribution: "declared" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, attribution: "declared", campaign_id: CAMP }).success).toBe(true);
  });
});

describe("importación CSV", () => {
  it("lee comillas, punto y coma (Excel en español) y BOM", () => {
    expect(parseCsv('﻿fecha;nombre;notas\n16/10/2026;"Pérez; Juan";"dijo ""hola"""\n')).toEqual([
      ["fecha", "nombre", "notas"],
      ["16/10/2026", "Pérez; Juan", 'dijo "hola"'],
    ]);
    expect(normalizeDate("6/9/26")).toBe("2026-09-06");
    expect(normalizeDate("2026-10-16")).toBe("2026-10-16");
    expect(normalizeDate("ayer")).toBeNull();
  });
  it("interpreta origen, estado y campaña por nombre (solo del mismo negocio)", () => {
    const csv = "fecha,nombre,origen,estado,monto,campaña\n16/10/2026,Juan,Instagram,cliente,$170,Corte octubre\n17/10/2026,,WhatsApp,agendó,,\n";
    const r = prepareImport(csv, BIZ, [{ id: CAMP, name: "Corte Octubre" }]);
    expect(r.headerError).toBeNull();
    expect(r.rows.every((x) => x.ok)).toBe(true);
    expect(r.rows[0].value).toMatchObject({ source: "instagram_dm", status: "customer", value_cents: 17000, campaign_id: CAMP, attribution: "declared" });
    expect(r.rows[1].value).toMatchObject({ source: "whatsapp", status: "appointment", attribution: "unknown", campaign_id: null });
  });
  it("rechaza campañas de otro negocio, fechas inválidas y archivos sin fecha", () => {
    const r = prepareImport(`fecha,campaña,monto\nayer,${OTHER_CAMP},\n16/10/2026,,abc\n`, BIZ, [{ id: CAMP, name: "Corte" }]);
    expect(r.rows[0].errors.join(" ")).toMatch(/Fecha no válida.*no existe en este negocio/);
    expect(r.rows[1].ok).toBe(false);
    expect(prepareImport("nombre\nJuan\n", BIZ, []).headerError).toMatch(/fecha/);
  });
});

describe("analíticas (solo datos registrados)", () => {
  const leads: LeadRow[] = [
    { campaign_id: CAMP, status: "customer", source: "instagram_dm", value_cents: 17000, attribution: "declared" },
    { campaign_id: CAMP, status: "appointment", source: "whatsapp", value_cents: null, attribution: "campaign_code" },
    { campaign_id: CAMP, status: "customer", source: "walk_in", value_cents: 12000, attribution: "unknown" },
    { campaign_id: null, status: "lost", source: "phone", value_cents: null, attribution: "unknown" },
  ];
  it("resume sin inventar y separa lo atribuido", () => {
    const s = summarizeLeads(leads);
    expect(s).toMatchObject({ total: 4, revenueCents: 29000, attributed: 2, unattributed: 2 });
    expect(s.toAppointmentRate).toBe(0.75);
    expect(summarizeLeads([]).toAppointmentRate).toBeNull();
  });
  it("por campaña solo cuenta prospectos atribuidos y el costo exige gasto real", () => {
    const [noSpend] = campaignStats([CAMP], leads, [], []);
    expect(noSpend).toMatchObject({ leads: 2, appointments: 2, customers: 1, revenueCents: 17000, costPerCustomerCents: null });
    const [withSpend] = campaignStats([CAMP], leads, [], [{ campaign_id: CAMP, messages: 10, appointments: 3, customers: 1, revenue_cents: 0, ad_spend_cents: 20000 }]);
    expect(withSpend.costPerCustomerCents).toBe(10000);
  });
  it("distingue publicaciones confirmadas por Meta de las declaradas a mano", () => {
    expect(
      contentSummary([
        { campaign_id: null, status: "published", manual_posted_at: null, external_post_id: "1_2" },
        { campaign_id: null, status: "approved", manual_posted_at: "2026-10-16T00:00:00Z", external_post_id: null },
        { campaign_id: null, status: "error", manual_posted_at: null, external_post_id: null },
      ]),
    ).toMatchObject({ confirmedByPlatform: 1, declaredManual: 1, errors: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { describeSchedule, draftFromRows, scheduleStatus, validateDrafts } from "./schedule";
import type { BusinessHoursRow } from "./types";

const TZ = "America/Mexico_City"; // UTC-6 todo el año (sin horario de verano desde 2022)
const BIZ = "b";
const goodBarber: BusinessHoursRow[] = [
  { business_id: BIZ, weekday: 0, is_closed: true, opens_at: null, closes_at: null },
  ...[1, 2, 3, 4, 5].map((weekday) => ({ business_id: BIZ, weekday, is_closed: false, opens_at: "14:00:00", closes_at: "20:00:00" })),
  { business_id: BIZ, weekday: 6, is_closed: false, opens_at: "11:00:00", closes_at: "20:00:00" },
];

describe("scheduleStatus", () => {
  it("lunes 15:00 local → abierto", () => {
    // 2026-11-30 es lunes. 15:00 CDMX = 21:00 UTC
    const s = scheduleStatus(goodBarber, true, new Date("2026-11-30T21:00:00Z"), TZ);
    expect(s.kind).toBe("open");
    expect(describeSchedule(s)).toBe("Abierto · cierra 8:00 p. m.");
  });
  it("lunes 13:59 local → antes de abrir", () => {
    const s = scheduleStatus(goodBarber, true, new Date("2026-11-30T19:59:00Z"), TZ);
    expect(s.kind).toBe("before_open");
  });
  it("lunes 20:00 local → cerrado por hoy (cierre exclusivo)", () => {
    const s = scheduleStatus(goodBarber, true, new Date("2026-12-01T02:00:00Z"), TZ);
    expect(s.kind).toBe("after_close");
  });
  it("sábado 11:00 local → abierto", () => {
    const s = scheduleStatus(goodBarber, true, new Date("2026-11-28T17:00:00Z"), TZ);
    expect(s.kind).toBe("open");
  });
  it("domingo → cerrado hoy", () => {
    const s = scheduleStatus(goodBarber, true, new Date("2026-11-29T20:00:00Z"), TZ);
    expect(s.kind).toBe("closed_today");
  });
  it("sin horario (Glamour Studio) → desconocido y sin confirmar", () => {
    const s = scheduleStatus([], false, new Date("2026-11-30T21:00:00Z"), TZ);
    expect(s).toEqual({ kind: "unknown", confirmed: false });
    expect(describeSchedule(s)).toBe("Horario pendiente de confirmar");
  });
});

describe("drafts", () => {
  it("convierte filas a borradores con lunes primero", () => {
    const d = draftFromRows(goodBarber);
    expect(d[0]).toEqual({ weekday: 1, state: "open", opensAt: "14:00", closesAt: "20:00" });
    expect(d[6]).toEqual({ weekday: 0, state: "closed", opensAt: "", closesAt: "" });
    expect(draftFromRows([]).every((x) => x.state === "unset")).toBe(true);
  });
  it("detecta horarios inválidos", () => {
    expect(validateDrafts([{ weekday: 1, state: "open", opensAt: "20:00", closesAt: "10:00" }])).toHaveLength(1);
    expect(validateDrafts([{ weekday: 1, state: "open", opensAt: "", closesAt: "10:00" }])).toHaveLength(1);
    expect(validateDrafts([{ weekday: 1, state: "closed", opensAt: "", closesAt: "" }])).toHaveLength(0);
  });
});

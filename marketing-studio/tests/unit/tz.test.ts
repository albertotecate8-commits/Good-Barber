import { describe, expect, it } from "vitest";
import { addDays, addMonths, isValidDateString, monthGrid, startOfWeek, todayInTz, utcRangeForDays, utcToZoned, zonedToUtc } from "@/lib/tz";

describe("zona horaria America/Mexico_City", () => {
  it("convierte hora local de México a UTC (UTC-6 sin horario de verano desde 2022)", () => {
    expect(zonedToUtc("2026-10-20", "18:30")).toBe("2026-10-21T00:30:00.000Z");
    expect(zonedToUtc("2026-06-15", "09:00")).toBe("2026-06-15T15:00:00.000Z");
  });
  it("respeta el horario de verano histórico (2021)", () => {
    expect(zonedToUtc("2021-07-01", "12:00")).toBe("2021-07-01T17:00:00.000Z");
  });
  it("detecta horas inexistentes por cambio de horario", () => {
    expect(() => zonedToUtc("2021-04-04", "02:30")).toThrow(/no existe/);
  });
  it("hace el viaje de ida y vuelta", () => {
    expect(utcToZoned("2026-10-21T00:30:00.000Z")).toEqual({ date: "2026-10-20", time: "18:30" });
  });
  it("funciona con otras zonas (para negocios futuros)", () => {
    expect(zonedToUtc("2026-10-20", "18:30", "America/Tijuana")).toBe("2026-10-21T01:30:00.000Z");
  });
  it("rechaza fechas y horas inválidas", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(() => zonedToUtc("2026-13-01", "10:00")).toThrow(/Fecha/);
    expect(() => zonedToUtc("2026-10-01", "24:00")).toThrow(/Hora/);
  });
  it("calcula el día de hoy en México aunque en UTC ya sea mañana", () => {
    expect(todayInTz(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-20");
  });
});

describe("aritmética de calendario", () => {
  it("suma días y meses", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("las semanas empiezan en lunes", () => {
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12"); // domingo -> lunes anterior
    expect(startOfWeek("2026-10-12")).toBe("2026-10-12");
  });
  it("la cuadrícula del mes cubre semanas completas", () => {
    const g = monthGrid("2026-10-15");
    expect(g[0][0]).toBe("2026-09-28");
    expect(g.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("el rango UTC de un día local empieza a las 06:00Z", () => {
    expect(utcRangeForDays("2026-10-20", "2026-10-21")).toEqual({
      start: "2026-10-20T06:00:00.000Z",
      end: "2026-10-21T06:00:00.000Z",
    });
  });
});

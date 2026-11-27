import { describe, expect, it } from "vitest";
import { addDaysISO, formatClock, formatDuration, localDateISO } from "./time";
import { businessSchema, slugify, stationSchema } from "./validation";
import { friendlyError } from "./errors";
import { looksLikeServiceRole } from "../env";

describe("time", () => {
  it("fecha local según zona del sitio", () => {
    // 03:00 UTC del 28 = 21:00 del 27 en CDMX
    expect(localDateISO(new Date("2026-11-28T03:00:00Z"), "America/Mexico_City")).toBe("2026-11-27");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(formatClock("11:00:00")).toBe("11:00 a. m.");
    expect(formatClock("12:30")).toBe("12:30 p. m.");
    expect(formatDuration(3900)).toBe("1 h 05 min");
  });
});

describe("validation", () => {
  it("slugify", () => {
    expect(slugify("Glamour Studio")).toBe("glamour-studio");
    expect(slugify("  Peluquería Ñandú! ")).toBe("peluqueria-nandu");
  });
  it("estación: vacío = usar valor del negocio; rangos", () => {
    const base = { business_id: "7d1a8f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", camera_id: "", name: "Silla 1", kind: "silla", release_grace_seconds: "15", active: true };
    const ok = stationSchema.safeParse({ ...base, dwell_threshold_seconds: "" });
    expect(ok.success && ok.data.dwell_threshold_seconds).toBe(null);
    expect(ok.success && ok.data.camera_id).toBe(null);
    expect(stationSchema.safeParse({ ...base, dwell_threshold_seconds: "2" }).success).toBe(false);
    expect(stationSchema.safeParse({ ...base, dwell_threshold_seconds: "abc" }).success).toBe(false);
  });
  it("negocio", () => {
    expect(businessSchema.safeParse({ name: "X", accent_color: "red", default_dwell_seconds: "60", active: true }).success).toBe(false);
    expect(businessSchema.safeParse({ name: "X", accent_color: "#aabbcc", default_dwell_seconds: "60", active: true }).success).toBe(true);
  });
});

describe("errores y claves", () => {
  it("traduce errores comunes", () => {
    expect(friendlyError({ message: "Invalid login credentials" })).toBe("Correo o contraseña incorrectos.");
    expect(friendlyError({ code: "23503", message: "fk" })).toMatch(/historial/);
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/Sin conexión/);
  });
  it("detecta una service_role puesta por error", () => {
    const payload = btoa(JSON.stringify({ role: "service_role" })).replace(/=+$/, "");
    expect(looksLikeServiceRole(`xx.${payload}.yy`)).toBe(true);
    expect(looksLikeServiceRole("sb_secret_abc")).toBe(true);
    expect(looksLikeServiceRole("sb_publishable_abc")).toBe(false);
  });
});

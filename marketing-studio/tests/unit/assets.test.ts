import { describe, expect, it } from "vitest";
import { assetUploadSchema, parseTags, safeFileName, sniffMatches } from "@/lib/validation/asset";
import { storageConfig, storagePath } from "@/lib/storage/config";
import { publishAvailability, type Publisher } from "@/lib/publishing";

const BIZ = "11111111-1111-4111-8111-111111111111";
const bytes = (...b: (number | string)[]) =>
  new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("validación de subida", () => {
  const ok = { business_id: BIZ, kind: "image", title: "Foto", description: "", tags: "", asset_date: "", original_name: "a.jpg", mime_type: "image/jpeg", size: 100 };
  it("acepta una imagen válida", () => {
    expect(assetUploadSchema.safeParse(ok).success).toBe(true);
  });
  it("rechaza tipos no permitidos para el tipo de recurso", () => {
    expect(assetUploadSchema.safeParse({ ...ok, mime_type: "video/mp4" }).success).toBe(false);
    expect(assetUploadSchema.safeParse({ ...ok, mime_type: "image/svg+xml" }).success).toBe(false);
    expect(assetUploadSchema.safeParse({ ...ok, kind: "logo", mime_type: "image/svg+xml" }).success).toBe(true);
    expect(assetUploadSchema.safeParse({ ...ok, kind: "other", mime_type: "application/x-msdownload" }).success).toBe(false);
  });
  it("rechaza archivos de más de 50 MB y vacíos", () => {
    expect(assetUploadSchema.safeParse({ ...ok, size: 50 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(assetUploadSchema.safeParse({ ...ok, size: 0 }).success).toBe(false);
  });
  it("normaliza etiquetas", () => {
    expect(parseTags(" Promo , promo, fade ,, Local ")).toEqual(["Promo", "fade", "Local"]);
  });
});

describe("nombres y rutas seguras", () => {
  it("limpia nombres de archivo", () => {
    expect(safeFileName("../../etc/Fotó Final!.JPG")).toBe("Foto-Final.jpg");
    expect(safeFileName("sin-extension")).toBe("sin-extension");
    expect(safeFileName("....")).toBe("archivo");
  });
  it("la ruta empieza con el negocio", () => {
    expect(storagePath(BIZ, "a1", "x.png")).toBe(`${BIZ}/a1/x.png`);
  });
});

describe("detección del tipo real por bytes", () => {
  it("reconoce formatos comunes", () => {
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, "PNG"))).toBe(true);
    expect(sniffMatches("image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(sniffMatches("video/mp4", bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe(true);
    expect(sniffMatches("application/pdf", bytes("%PDF-1.7"))).toBe(true);
    expect(sniffMatches("image/svg+xml", bytes("  <svg xmlns"))).toBe(true);
  });
  it("detecta un archivo disfrazado", () => {
    expect(sniffMatches("image/jpeg", bytes("MZ", 0x90, 0))).toBe(false); // ejecutable de Windows
    expect(sniffMatches("image/png", bytes("<html>"))).toBe(false);
    expect(sniffMatches("text/plain", bytes("a", 0, "b"))).toBe(false);
  });
});

describe("configuración de almacenamiento", () => {
  it("usa Supabase por defecto", () => {
    expect(storageConfig({}).backend).toBe("supabase");
  });
  it("permite el modo local solo fuera de Vercel", () => {
    const local = storageConfig({ MKT_STORAGE_BACKEND: "local" });
    expect(local.backend).toBe("local_dev");
    expect(local.problem).toBeUndefined();
    expect(storageConfig({ MKT_STORAGE_BACKEND: "local", VERCEL: "1" }).problem).toMatch(/Vercel/);
  });
  it("informa valores inválidos", () => {
    expect(storageConfig({ MKT_STORAGE_BACKEND: "s3" }).problem).toMatch(/no es válido/);
  });
});

describe("disponibilidad de publicación", () => {
  it("todo es manual mientras no exista integración", () => {
    expect(publishAvailability("instagram", [])).toMatchObject({ mode: "manual" });
    expect(publishAvailability("instagram", [{ platform: "instagram", connection_status: "manual" }])).toMatchObject({ mode: "manual" });
    expect(publishAvailability("instagram", [{ platform: "instagram", connection_status: "connected" }])).toMatchObject({ mode: "manual" });
  });
  it("solo ofrece API con integración registrada y cuenta conectada", () => {
    const fake: Publisher = { id: "meta", platforms: ["instagram"], isAvailableFor: () => true, publish: async () => ({ ok: true }) };
    expect(publishAvailability("instagram", [{ platform: "instagram", connection_status: "connected" }], [fake])).toEqual({ mode: "api", publisherId: "meta" });
    expect(publishAvailability("instagram", [{ platform: "instagram", connection_status: "expired" }], [fake])).toMatchObject({ mode: "manual" });
  });
});

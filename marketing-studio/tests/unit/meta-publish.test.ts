import { describe, expect, it, vi } from "vitest";
import { META_PUBLISH_SCOPES, publishingConfig } from "@/lib/meta/config";
import { authorizeUrl } from "@/lib/meta/graph";
import { missingScopes, publishToMeta, validateForPlatform, verifyPublishAccess } from "@/lib/meta/publish";

// Graph API simulada que registra cada llamada. Ninguna prueba publica de verdad.
function graph(responses: (url: URL, init?: RequestInit) => unknown) {
  const calls: { method: string; path: string; params: URLSearchParams }[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = init?.body instanceof URLSearchParams ? init.body : url.searchParams;
    calls.push({ method: init?.method ?? "GET", path: url.pathname.replace("/v26.0/", ""), params });
    const body = responses(url, init);
    return new Response(JSON.stringify(body), { status: (body as { error?: unknown }).error ? 400 : 200 });
  }) as unknown as typeof fetch;
  return { calls, o: { appId: "1", appSecret: "s", graphVersion: "v26.0", redirectUri: "https://x/api/meta/retorno", fetchImpl: f } };
}
const img = { url: "https://storage.example/firmado.jpg", kind: "image" as const };
const vid = { url: "https://storage.example/firmado.mp4", kind: "video" as const };

describe("permisos de publicación", () => {
  it("Facebook e Instagram exigen los permisos documentados", () => {
    expect(missingScopes("facebook_page", ["pages_show_list", "pages_read_engagement"])).toEqual(["pages_manage_posts"]);
    expect(missingScopes("instagram", ["instagram_basic", "instagram_content_publish", "pages_read_engagement"])).toEqual([]);
  });
  it("solo se piden permisos de publicar con «Autorizar publicación»", () => {
    const o = { appId: "1", appSecret: "s", graphVersion: "v26.0", redirectUri: "https://x/api/meta/retorno" };
    expect(new URL(authorizeUrl(o, "st")).searchParams.get("scope")).not.toMatch(/pages_manage_posts/);
    expect(META_PUBLISH_SCOPES).toEqual(["pages_manage_posts", "instagram_content_publish"]);
  });
  it("la publicación automática está apagada por defecto", () => {
    expect(publishingConfig({}).enabled).toBe(false);
    expect(publishingConfig({ MKT_PUBLISHING_ENABLED: "1", MKT_CRON_SECRET: "corto" }).enabled).toBe(false);
    expect(publishingConfig({ MKT_PUBLISHING_ENABLED: "1", MKT_CRON_SECRET: "x".repeat(32) }).enabled).toBe(true);
  });
});

describe("validación previa", () => {
  it("Instagram exige imagen o video, 2200 caracteres y 30 hashtags", () => {
    expect(validateForPlatform({ platform: "instagram", media: null, caption: "hola", format: "post" })).toMatch(/exige una imagen/);
    expect(validateForPlatform({ platform: "instagram", media: img, caption: "x".repeat(2201), format: "post" })).toMatch(/2 200/);
    expect(validateForPlatform({ platform: "instagram", media: img, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "), format: "post" })).toMatch(/30 hashtags/);
    expect(validateForPlatform({ platform: "facebook_page", media: null, caption: " ", format: "post" })).toMatch(/vacía/);
    expect(validateForPlatform({ platform: "facebook_page", media: null, caption: "Texto", format: "post" })).toBeNull();
  });
});

describe("publicación (Graph API simulada)", () => {
  it("Facebook con imagen usa /photos y devuelve el id del post", async () => {
    const g = graph(() => ({ id: "photo1", post_id: "page_post1" }));
    const r = await publishToMeta(g.o, { platform: "facebook_page", externalId: "1001", pageToken: "PT", caption: "Corte $120", format: "post", media: img });
    expect(r.externalPostId).toBe("page_post1");
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]).toMatchObject({ method: "POST", path: "1001/photos" });
    expect(g.calls[0].params.get("url")).toBe(img.url);
    expect(g.calls[0].params.get("caption")).toBe("Corte $120");
  });
  it("Facebook solo texto usa /feed", async () => {
    const g = graph(() => ({ id: "1001_9" }));
    await publishToMeta(g.o, { platform: "facebook_page", externalId: "1001", pageToken: "PT", caption: "Hola", format: "post", media: null });
    expect(g.calls[0].path).toBe("1001/feed");
  });
  it("Instagram imagen: contenedor y luego media_publish", async () => {
    const g = graph((u) => (u.pathname.endsWith("/media") ? { id: "container1" } : { id: "igpost1" }));
    const r = await publishToMeta(g.o, { platform: "instagram", externalId: "1784", pageToken: "PT", caption: "Corte", format: "post", media: img });
    expect(r.externalPostId).toBe("igpost1");
    expect(g.calls.map((c) => c.path)).toEqual(["1784/media", "1784/media_publish"]);
    expect(g.calls[1].params.get("creation_id")).toBe("container1");
  });
  it("Instagram Reel espera a que el video esté listo", async () => {
    let polls = 0;
    const g = graph((u) => {
      if (u.pathname.endsWith("/media")) return { id: "c2" };
      if (u.pathname.endsWith("/c2")) return { status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" };
      return { id: "reel1" };
    });
    const r = await publishToMeta(g.o, { platform: "instagram", externalId: "1784", pageToken: "PT", caption: "Reel", format: "reel", media: vid }, { sleep: async () => {} });
    expect(r.externalPostId).toBe("reel1");
    expect(g.calls[0].params.get("media_type")).toBe("REELS");
  });
  it("si el video falla en Instagram no se publica", async () => {
    const g = graph((u) => (u.pathname.endsWith("/media") ? { id: "c3" } : { status_code: "ERROR" }));
    await expect(publishToMeta(g.o, { platform: "instagram", externalId: "1784", pageToken: "PT", caption: "x", format: "reel", media: vid }, { sleep: async () => {} })).rejects.toMatchObject({ code: "container_error" });
    expect(g.calls.some((c) => c.path.endsWith("media_publish"))).toBe(false);
  });
  it("los errores de Meta se informan sin el token", async () => {
    const g = graph(() => ({ error: { message: "(#200) Requires pages_manage_posts permission", code: 200 } }));
    const e = await publishToMeta(g.o, { platform: "facebook_page", externalId: "1001", pageToken: "TOKEN-SECRETO", caption: "x", format: "post", media: null }).catch((x) => x);
    expect(e.code).toBe("graph_200");
    expect(e.message).not.toContain("TOKEN-SECRETO");
  });
  it("la verificación de permisos solo lee: nunca hace POST", async () => {
    const g = graph(() => ({ id: "1001", name: "Good barber" }));
    const v = await verifyPublishAccess(g.o, { platform: "facebook_page", externalId: "1001", pageId: "1001", pageToken: "PT", scopes: ["pages_show_list"], pageTasks: ["MANAGE"] });
    expect(v).toEqual({ reachable: true, missing: ["pages_manage_posts", "pages_read_engagement"], canCreateContent: true });
    expect(g.calls.every((c) => c.method === "GET")).toBe(true);
  });
});

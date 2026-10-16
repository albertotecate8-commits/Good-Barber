import { describe, expect, it, vi } from "vitest";
import {
  DAILY_GROUP_LIMIT,
  TASK_STATUS_LABELS,
  activityLast24h,
  frequencyCheck,
  groupText,
  nextTask,
  normalizeGroupUrl,
  progress,
  shareUrl,
  type QueueTask,
} from "@/lib/distribution/core";
import { fetchPermalink } from "@/lib/meta/publish";

describe("direcciones de grupos", () => {
  it("normaliza variantes de facebook.com/groups y quita parámetros", () => {
    expect(normalizeGroupUrl("https://m.facebook.com/groups/barberosdgo?ref=share")).toBe("https://www.facebook.com/groups/barberosdgo/");
    expect(normalizeGroupUrl("  https://web.facebook.com/groups/123456789/ ")).toBe("https://www.facebook.com/groups/123456789/");
    expect(normalizeGroupUrl("https://facebook.com/groups/vecinos.durango/#top")).toBe("https://www.facebook.com/groups/vecinos.durango/");
  });
  it("rechaza lo que no es un grupo de Facebook", () => {
    for (const bad of [
      "http://www.facebook.com/groups/x/",
      "https://www.facebook.com/goodbarber/",
      "https://www.facebook.com.evil.test/groups/x/",
      "https://evil.test/https://www.facebook.com/groups/x/",
      "https://www.facebook.com/groups/",
      "javascript:alert(1)",
    ])
      expect(normalizeGroupUrl(bad), bad).toBeNull();
  });
});

describe("interfaz nativa para compartir", () => {
  const post = "https://www.facebook.com/1001/posts/9";
  it("con META_APP_ID usa el Share Dialog oficial (la persona elige el grupo)", () => {
    const u = new URL(shareUrl(post, "123456789012", "https://app.test/distribucion/abc"));
    expect(`${u.origin}${u.pathname}`).toBe("https://www.facebook.com/dialog/share");
    expect(u.searchParams.get("href")).toBe(post);
    expect(u.searchParams.get("app_id")).toBe("123456789012");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/distribucion/abc");
  });
  it("sin app id (o inválido) usa sharer.php; nunca endpoints de grupos", () => {
    for (const id of [null, undefined, "", "abc", "1"]) {
      const u = new URL(shareUrl(post, id));
      expect(`${u.origin}${u.pathname}`).toBe("https://www.facebook.com/sharer/sharer.php");
      expect(u.searchParams.get("u")).toBe(post);
    }
    expect(shareUrl(post, "123456789012")).not.toMatch(/groups|graph\.facebook/);
  });
});

describe("texto por grupo", () => {
  const base = { groupName: "Vecinos Durango", businessName: "Good Barber", sector: "Barbería", caption: "Corte + barba $250", sourceUrl: "https://www.facebook.com/1/posts/2" };
  it("varía la introducción entre grupos para no repetir el mismo mensaje", () => {
    const texts = [0, 1, 2, 3, 4].map((position) => groupText({ ...base, mode: "share_page_post", position }));
    expect(new Set(texts).size).toBe(5);
    expect(groupText({ ...base, mode: "share_page_post", position: 5 })).toBe(texts[0]);
  });
  it("al compartir el original solo agrega el comentario; en publicación nueva incluye texto y enlace", () => {
    const share = groupText({ ...base, mode: "share_page_post", position: 0 });
    expect(share).toContain("Vecinos Durango");
    expect(share).not.toContain("$250");
    const fresh = groupText({ ...base, mode: "new_post_as_page", position: 1 });
    expect(fresh).toContain("Corte + barba $250");
    expect(fresh).toContain("Publicación original: https://www.facebook.com/1/posts/2");
  });
});

describe("frecuencia, cola y progreso", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("respeta los días mínimos entre publicaciones en un grupo", () => {
    expect(frequencyCheck(7, null, now).allowed).toBe(true);
    const r = frequencyCheck(7, "2026-10-12T12:00:00Z", now);
    expect(r.allowed).toBe(false);
    expect(r.nextAllowedAt?.toISOString()).toBe("2026-10-19T12:00:00.000Z");
    expect(frequencyCheck(3, "2026-10-12T12:00:00Z", now).allowed).toBe(true);
  });
  const t = (id: string, position: number, status: QueueTask["status"], opened_at: string | null = null, confirmed_at: string | null = null): QueueTask => ({ id, position, status, opened_at, confirmed_at });
  it("el siguiente grupo es el primer pendiente o abierto sin confirmar, en orden", () => {
    expect(nextTask([t("c", 2, "pending"), t("a", 0, "confirmed"), t("b", 1, "opened")])?.id).toBe("b");
    expect(nextTask([t("a", 0, "confirmed"), t("b", 1, "skipped"), t("c", 2, "awaiting_approval")])).toBeNull();
  });
  it("cuenta la actividad de 24 h para el tope diario", () => {
    const tasks = [
      t("a", 0, "opened", "2026-10-16T10:00:00Z"),
      t("b", 1, "confirmed", "2026-10-16T09:00:00Z", "2026-10-16T09:05:00Z"),
      t("c", 2, "confirmed", "2026-10-14T09:00:00Z", "2026-10-14T09:05:00Z"),
      t("d", 3, "pending"),
    ];
    expect(activityLast24h(tasks, now)).toBe(2);
    expect(DAILY_GROUP_LIMIT).toBeGreaterThan(0);
  });
  it("progreso separa pendientes, aprobación, confirmados y errores", () => {
    expect(progress([{ status: "pending" }, { status: "opened" }, { status: "awaiting_approval" }, { status: "confirmed" }, { status: "failed" }, { status: "cancelled" }])).toEqual({
      total: 6,
      pending: 2,
      awaitingApproval: 1,
      confirmed: 1,
      failed: 1,
      skipped: 1,
    });
  });
  it("los estados que ve la persona distinguen pendiente, aprobación, confirmado y error", () => {
    expect(TASK_STATUS_LABELS.pending).toBe("Pendiente de compartir");
    expect(TASK_STATUS_LABELS.awaiting_approval).toBe("Pendiente de aprobación del grupo");
    expect(TASK_STATUS_LABELS.confirmed).toBe("Confirmado como publicado");
    expect(TASK_STATUS_LABELS.failed).toBe("Error");
    expect(TASK_STATUS_LABELS.opened).toMatch(/sin confirmar/);
  });
});

describe("enlace de la publicación (Graph API simulada)", () => {
  const opts = (body: unknown, status = 200) => {
    const calls: URL[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls.push(new URL(String(input)));
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { calls, o: { appId: "1", appSecret: "s", graphVersion: "v26.0", redirectUri: "https://x/api/meta/retorno", fetchImpl } };
  };
  it("Facebook: pide permalink_url y lo marca confirmado", async () => {
    const g = opts({ permalink_url: "https://www.facebook.com/goodbarber/posts/pfbid0abc", id: "1001_9" });
    const r = await fetchPermalink(g.o, "facebook_page", "1001_9", "PT");
    expect(r).toEqual({ url: "https://www.facebook.com/goodbarber/posts/pfbid0abc", confirmed: true });
    expect(g.calls[0].pathname).toBe("/v26.0/1001_9");
    expect(g.calls[0].searchParams.get("fields")).toBe("permalink_url");
  });
  it("Instagram: pide permalink", async () => {
    const g = opts({ permalink: "https://www.instagram.com/p/ABC123/" });
    expect(await fetchPermalink(g.o, "instagram", "1789", "PT")).toEqual({ url: "https://www.instagram.com/p/ABC123/", confirmed: true });
    expect(g.calls[0].searchParams.get("fields")).toBe("permalink");
  });
  it("si Meta falla, usa la URL estándar del post SIN marcarla confirmada", async () => {
    const g = opts({ error: { message: "Unsupported get request", code: 100 } }, 400);
    expect(await fetchPermalink(g.o, "facebook_page", "1001_9", "PT")).toEqual({ url: "https://www.facebook.com/1001/posts/9", confirmed: false });
    expect(await fetchPermalink(g.o, "instagram", "1789", "PT")).toEqual({ url: null, confirmed: false });
  });
  it("ignora enlaces que no son de Facebook o Instagram", async () => {
    const g = opts({ permalink_url: "https://evil.test/post" });
    expect(await fetchPermalink(g.o, "facebook_page", "1001_9", "PT")).toEqual({ url: "https://www.facebook.com/1001/posts/9", confirmed: false });
  });
});

import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { META_LINK_SCOPES, META_PUBLISH_SCOPES, metaConfig } from "@/lib/meta/config";
import { decryptToken, encryptToken, signState, verifyState } from "@/lib/meta/crypto";
import { authorizeUrl, exchangeCode, inspectToken, listPages, MetaError, normalizeName, verifyPageToken } from "@/lib/meta/graph";

const KEY = randomBytes(32).toString("base64");
const FULL = {
  META_APP_ID: "123456789012345",
  META_APP_SECRET: "s3cr3t-s3cr3t-s3cr3t",
  MKT_APP_URL: "https://studio.example.netlify.app/",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  MKT_TOKEN_KEY: KEY,
};
const opts = (fetchImpl: typeof fetch) => ({
  appId: FULL.META_APP_ID,
  appSecret: FULL.META_APP_SECRET,
  graphVersion: "v26.0",
  redirectUri: "https://studio.example.netlify.app/api/meta/retorno",
  fetchImpl,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("configuración de Meta", () => {
  it("lista lo que falta sin exponer valores", () => {
    const c = metaConfig({});
    expect(c.ready).toBe(false);
    expect(c.missing).toEqual(["META_APP_ID", "META_APP_SECRET", "MKT_APP_URL", "SUPABASE_SERVICE_ROLE_KEY", "MKT_TOKEN_KEY"]);
  });
  it("queda lista con todo configurado y arma la URL de retorno", () => {
    const c = metaConfig(FULL);
    expect(c.ready).toBe(true);
    expect(c.redirectUri).toBe("https://studio.example.netlify.app/api/meta/retorno");
    expect(c.graphVersion).toBe("v26.0");
  });
  it("usa la URL que Netlify define (URL) si no hay MKT_APP_URL", () => {
    const c = metaConfig({ ...FULL, MKT_APP_URL: undefined, URL: "https://x.netlify.app" });
    expect(c.redirectUri).toBe("https://x.netlify.app/api/meta/retorno");
  });
  it("rechaza claves de cifrado que no miden 32 bytes y URLs sin https", () => {
    expect(metaConfig({ ...FULL, MKT_TOKEN_KEY: "corta" }).missing).toContain("MKT_TOKEN_KEY");
    expect(metaConfig({ ...FULL, MKT_APP_URL: "http://studio.example.com" }).missing).toContain("MKT_APP_URL");
  });
});

describe("cifrado de tokens y state firmado", () => {
  it("cifra y descifra; detecta manipulación", () => {
    const sealed = encryptToken("EAAB-token-de-pagina", KEY);
    expect(sealed).not.toContain("EAAB");
    expect(decryptToken(sealed, KEY)).toBe("EAAB-token-de-pagina");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptToken(parts.join("."), KEY)).toThrow();
    expect(() => decryptToken(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
  it("valida firma y vencimiento del state", () => {
    const s = { u: "user", b: "biz", n: "nonce", e: Date.now() + 60_000 };
    const raw = signState(s, KEY);
    expect(verifyState(raw, KEY)).toEqual(s);
    expect(verifyState(raw, randomBytes(32).toString("base64"))).toBeNull();
    const [payload, sig] = raw.split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, b: "otro-negocio" })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, KEY)).toBeNull();
    expect(verifyState(`${payload}.${sig}`, KEY, Date.now() + 120_000)).toBeNull();
  });
});

describe("Graph API (respuestas simuladas con el formato documentado)", () => {
  it("el diálogo pide solo permisos de lectura, nunca de publicación", () => {
    const url = new URL(authorizeUrl(opts(fetch), "st"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    const scopes = url.searchParams.get("scope")!.split(",");
    expect(scopes).toEqual([...META_LINK_SCOPES]);
    for (const p of META_PUBLISH_SCOPES) expect(scopes).not.toContain(p);
    expect(url.searchParams.get("redirect_uri")).toBe("https://studio.example.netlify.app/api/meta/retorno");
  });

  it("cambia el código por un token de larga duración", async () => {
    const f = vi.fn(async (u: string | URL | Request) => {
      const url = new URL(String(u));
      if (url.searchParams.get("code")) return json({ access_token: "corto", token_type: "bearer", expires_in: 3600 });
      expect(url.searchParams.get("grant_type")).toBe("fb_exchange_token");
      expect(url.searchParams.get("fb_exchange_token")).toBe("corto");
      return json({ access_token: "largo", token_type: "bearer", expires_in: 5184000 });
    }) as unknown as typeof fetch;
    const r = await exchangeCode(opts(f), "CODE");
    expect(r.token).toBe("largo");
    expect(r.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 864e5);
  });

  it("rechaza tokens inválidos o de otra app", async () => {
    const other = (async () => json({ data: { is_valid: true, app_id: "999", user_id: "1", scopes: [] } })) as unknown as typeof fetch;
    await expect(inspectToken(opts(other), "t")).rejects.toMatchObject({ code: "wrong_app" });
    const invalid = (async () => json({ data: { is_valid: false } })) as unknown as typeof fetch;
    await expect(inspectToken(opts(invalid), "t")).rejects.toMatchObject({ code: "invalid_token" });
    const ok = (async () => json({ data: { is_valid: true, app_id: FULL.META_APP_ID, user_id: "42", scopes: ["pages_show_list"] } })) as unknown as typeof fetch;
    await expect(inspectToken(opts(ok), "t")).resolves.toEqual({ userId: "42", scopes: ["pages_show_list"] });
  });

  it("lista páginas con su Instagram y no filtra el token en los errores", async () => {
    const f = (async () =>
      json({
        data: [
          { id: "1001", name: "Good barber", link: "https://www.facebook.com/goodbarber", tasks: ["MANAGE", "CREATE_CONTENT"], access_token: "PAGE-TOKEN", instagram_business_account: { id: "1784", username: "good_barber_oficial" } },
          { id: "1002", name: "Otra", tasks: ["ANALYZE"], access_token: "T2" },
          { name: "sin id" },
        ],
      })) as unknown as typeof fetch;
    const pages = await listPages(opts(f), "USER-TOKEN");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ id: "1001", instagram: { id: "1784", username: "good_barber_oficial" } });
    expect(pages[1].instagram).toBeNull();

    const err = (async () => json({ error: { message: "Invalid OAuth access token.", code: 190 } }, 400)) as unknown as typeof fetch;
    const e = await listPages(opts(err), "SECRET-USER-TOKEN").catch((x) => x);
    expect(e).toBeInstanceOf(MetaError);
    expect(e.code).toBe("graph_190");
    expect(e.message).not.toContain("SECRET-USER-TOKEN");
  });

  it("verifica que el token de página corresponde a la página elegida", async () => {
    const f = (async () => json({ id: "2002", name: "Otra" })) as unknown as typeof fetch;
    await expect(verifyPageToken(opts(f), "1001", "T")).rejects.toMatchObject({ code: "page_mismatch" });
  });

  it("sugiere la página por nombre sin acentos ni mayúsculas", () => {
    expect(normalizeName("Good barber")).toBe(normalizeName("GOOD  Barber"));
    expect(normalizeName("Glamour Studio")).toBe("glamourstudio");
    expect(normalizeName("Peluquería")).toBe("peluqueria");
  });
});

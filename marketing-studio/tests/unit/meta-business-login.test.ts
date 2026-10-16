import { describe, expect, it } from "vitest";
import { META_LINK_SCOPES, META_PUBLISH_SCOPES, metaConfig, metaSetupInfo } from "@/lib/meta/config";
import { authorizeUrl } from "@/lib/meta/graph";

const o = { appId: "123456789012", appSecret: "s".repeat(32), graphVersion: "v26.0", redirectUri: "https://ejemplo.netlify.app/api/meta/retorno" };

describe("Facebook Login for Business (config_id)", () => {
  it("con config_id NO envía scope (los permisos vienen de la configuración en Meta)", () => {
    const u = new URL(authorizeUrl(o, "st", [...META_LINK_SCOPES, ...META_PUBLISH_SCOPES], "987654321098"));
    expect(u.searchParams.get("config_id")).toBe("987654321098");
    expect(u.searchParams.has("scope")).toBe(false);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe(o.redirectUri);
    expect(u.searchParams.get("state")).toBe("st");
    expect(`${u.origin}${u.pathname}`).toBe("https://www.facebook.com/v26.0/dialog/oauth");
  });
  it("sin config_id usa Facebook Login clásico con scope", () => {
    const u = new URL(authorizeUrl(o, "st"));
    expect(u.searchParams.get("scope")).toBe(META_LINK_SCOPES.join(","));
    expect(u.searchParams.has("config_id")).toBe(false);
  });
  it("solo acepta ids numéricos de configuración", () => {
    const base = { META_APP_ID: "123456789012", META_APP_SECRET: "s".repeat(32), MKT_APP_URL: "https://x.netlify.app" };
    expect(metaConfig({ ...base, META_LOGIN_CONFIG_ID: "111222333444", META_PUBLISH_CONFIG_ID: "555666777888" })).toMatchObject({ loginConfigId: "111222333444", publishConfigId: "555666777888" });
    expect(metaConfig({ ...base, META_LOGIN_CONFIG_ID: "abc&scope=x", META_PUBLISH_CONFIG_ID: "" })).toMatchObject({ loginConfigId: "", publishConfigId: "" });
  });
});

describe("datos para el panel de Meta", () => {
  it("deriva dominio, redirección, privacidad y eliminación de la URL de Netlify", () => {
    expect(metaSetupInfo({ URL: "https://marketing-ai-studio.netlify.app/" })).toEqual({
      appUrl: "https://marketing-ai-studio.netlify.app",
      https: true,
      appDomain: "marketing-ai-studio.netlify.app",
      redirectUri: "https://marketing-ai-studio.netlify.app/api/meta/retorno",
      privacyUrl: "https://marketing-ai-studio.netlify.app/privacidad",
      deletionUrl: "https://marketing-ai-studio.netlify.app/eliminacion-de-datos",
    });
  });
  it("MKT_APP_URL tiene prioridad y sin URL no inventa direcciones", () => {
    expect(metaSetupInfo({ URL: "https://a.netlify.app", MKT_APP_URL: "https://b.example.com" }).appDomain).toBe("b.example.com");
    expect(metaSetupInfo({}).redirectUri).toBe("");
  });
});

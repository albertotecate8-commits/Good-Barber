import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Cifrado de tokens (AES-256-GCM) y firma del parámetro `state` de OAuth
// (HMAC-SHA256). La clave vive solo en el hosting (MKT_TOKEN_KEY).

const key = (b64: string) => Buffer.from(b64, "base64");

export function encryptToken(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyB64), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(sealed: string, keyB64: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Token cifrado con formato desconocido.");
  const decipher = createDecipheriv("aes-256-gcm", key(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export interface OAuthState {
  u: string; // usuario
  b: string; // negocio
  n: string; // nonce (también en cookie httpOnly)
  e: number; // vencimiento (ms)
}

const hmac = (payload: string, keyB64: string) => createHmac("sha256", key(keyB64)).update(payload).digest("base64url");

export function signState(state: OAuthState, keyB64: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${hmac(payload, keyB64)}`;
}

export function verifyState(raw: string, keyB64: string, now = Date.now()): OAuthState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(hmac(payload, keyB64));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof s.u !== "string" || typeof s.b !== "string" || typeof s.n !== "string" || typeof s.e !== "number") return null;
    return s.e > now ? s : null;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(18).toString("base64url");

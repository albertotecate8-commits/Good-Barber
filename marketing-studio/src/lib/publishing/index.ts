// Arquitectura de publicación.
//
// HOY no existe ninguna integración oficial conectada: todas las
// publicaciones son MANUALES. «Programar» en la app solo organiza la fecha;
// nada se envía a Facebook ni a Instagram.
//
// La vinculación con Meta ya existe (src/lib/meta, solo lectura). Cuando se
// agregue la publicación, con los permisos de publicar autorizados por ti:
//   1. Un proceso del servidor (service_role) buscará publicaciones con
//      status = 'scheduled', publish_mode = 'api' y scheduled_at <= ahora.
//   2. Llamará al Publisher de la plataforma (Graph API), registrará cada
//      intento en mkt_publish_attempts y solo con la confirmación de la
//      plataforma (id del post) pondrá status = 'published'.
//   3. Si falla: status = 'error' + last_error, con reintentos limitados.
//   La base de datos ya impide que el navegador haga los pasos 2 y 3.
import type { SocialAccount } from "@/lib/data/types";
import type { SocialPlatform } from "@/lib/validation/business";

export type PublishAvailability =
  | { mode: "manual"; reason: string }
  | { mode: "api"; publisherId: string };

export interface PublishResult {
  ok: boolean;
  externalPostId?: string;
  error?: string;
}

/** Contrato que implementarán las integraciones oficiales (p. ej. Meta Graph API). */
export interface Publisher {
  id: string;
  platforms: SocialPlatform[];
  isAvailableFor(account: SocialAccount): boolean;
  publish(input: { caption: string; mediaUrl: string | null; account: SocialAccount }): Promise<PublishResult>;
}

/** Integraciones registradas. Vacío a propósito: todavía no hay ninguna. */
export const PUBLISHERS: Publisher[] = [];

export function publishAvailability(
  platform: SocialPlatform,
  accounts: Pick<SocialAccount, "platform" | "connection_status">[],
  publishers: Publisher[] = PUBLISHERS,
): PublishAvailability {
  const account = accounts.find((a) => a.platform === platform);
  const publisher = publishers.find((p) => p.platforms.includes(platform));
  if (publisher && account?.connection_status === "connected" && publisher.isAvailableFor(account as SocialAccount)) {
    return { mode: "api", publisherId: publisher.id };
  }
  if (!account) {
    return { mode: "manual", reason: "Este negocio no tiene registrado un perfil en esta plataforma. Publícalo tú desde la app de la red." };
  }
  if (account.connection_status !== "connected") {
    return {
      mode: "manual",
      reason: "El perfil está registrado pero no conectado por la API oficial. Publícalo tú: descarga el recurso y copia el texto.",
    };
  }
  return { mode: "manual", reason: "La publicación automática para esta plataforma aún no está implementada." };
}

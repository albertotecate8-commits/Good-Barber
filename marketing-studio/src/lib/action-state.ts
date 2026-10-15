export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
}

export const initialActionState: ActionState = {};

/** Traduce errores de Postgres/PostgREST a mensajes comprensibles. */
export function friendlyDbError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado.";
  switch (error.code) {
    case "23505":
      return "Ya existe un registro con esos datos (identificador o perfil repetido).";
    case "42501":
      return error.message?.includes("solo") ? error.message : "No tienes permiso para hacer este cambio.";
    case "23514":
      return "Algún dato no cumple el formato permitido.";
    case "23503":
      return "El registro relacionado ya no existe.";
    case "PGRST116":
      return "No se encontró el registro.";
    default:
      return `No se pudo guardar: ${error.message ?? "error desconocido"}`;
  }
}

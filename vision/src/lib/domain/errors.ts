/**
 * Traduce errores de Supabase/PostgREST/Auth a mensajes claros en español.
 * Nunca oculta un error real: si no se reconoce, se muestra el original.
 */
export type ErrorLike = { code?: string; message?: string; details?: string | null; hint?: string | null; status?: number };

export class AppError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Tu correo aún no está confirmado. Revisa tu bandeja de entrada."],
  [/rate limit|too many requests/i, "Demasiados intentos. Espera unos minutos y vuelve a intentar."],
  [/should be different from the old password/i, "La nueva contraseña debe ser distinta de la anterior."],
  [/password should be at least/i, "La contraseña es demasiado corta."],
  [/auth session missing/i, "Tu sesión expiró. Vuelve a iniciar sesión."],
];

export function friendlyError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  const e = (err ?? {}) as ErrorLike;
  const message = typeof e.message === "string" ? e.message : String(err ?? "Error desconocido");

  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  }
  for (const [re, text] of AUTH_MESSAGES) if (re.test(message)) return text;

  switch (e.code) {
    case "42501":
      return "No tienes permiso para hacer esto.";
    case "23505":
      return "Ya existe un registro con ese nombre.";
    case "23503":
      return "No se puede eliminar porque tiene historial asociado. Desactívalo en su lugar.";
    case "23514":
      // Los CHECK y los RAISE con mensaje propio traen un texto útil.
      return /violates check constraint/i.test(message) ? "Algún dato está fuera del rango permitido." : message;
    case "22023":
    case "22001":
    case "P0002":
      return message;
    case "PGRST106":
    case "3F000":
      return "El esquema de la base de datos no está expuesto. Revisa vision/docs/BASE-DE-DATOS.md (Exposed schemas).";
    case "PGRST202":
    case "42883":
      return "Falta una función en la base de datos. ¿Se aplicaron todas las migraciones?";
    case "PGRST205":
    case "42P01":
      return "Falta una tabla en la base de datos. ¿Se aplicaron todas las migraciones?";
    case "PGRST301":
    case "PGRST303":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
  }
  return message;
}

/** Lanza AppError si una respuesta de Supabase trae error; devuelve los datos. */
export function unwrap<T>(res: { data: T | null; error: ErrorLike | null }): T {
  if (res.error) throw new AppError(friendlyError(res.error), res.error.code);
  return res.data as T;
}

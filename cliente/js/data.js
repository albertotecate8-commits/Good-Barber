// Única fuente de datos de la experiencia pública: las vistas públicas ya
// existentes en Supabase. SOLO LECTURA, sin RPC y sin autenticación.
//
// Regla de la aplicación entera: aquí no se inventa nada. Cada campo se lee
// tal cual viene, y si no viene, la pieza de interfaz que lo usaba no se
// dibuja. Nunca se rellena con datos de ejemplo.

function sb() {
  return window.supabaseClient;
}

export function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// La fotografía del servicio la administra el panel (services.image_url, ya
// expuesta por public_services). Se siguen aceptando photo_url y cover_url
// por si la vista cambiara de nombre de columna. Si no hay ninguna —porque
// el administrador aún no ha subido foto o la quitó— devuelve null y la
// tarjeta usa su respaldo visual de siempre.
export function serviceImage(service) {
  for (const key of ["image_url", "photo_url", "cover_url"]) {
    if (hasText(service?.[key])) return service[key].trim();
  }
  return null;
}

export function barberImage(barber) {
  return hasText(barber?.photo_url) ? barber.photo_url.trim() : null;
}

// Igual que arriba para la galería de trabajos: se acepta un arreglo de URLs
// o una cadena separada por comas, en varios nombres posibles de columna. Si
// no hay ninguna fotografía real, devuelve [] y la sección no se muestra.
export function galleryImages(business) {
  for (const key of ["gallery_urls", "gallery", "work_photos", "portfolio_urls"]) {
    const raw = business?.[key];
    if (Array.isArray(raw)) {
      const list = raw.filter(hasText).map((v) => v.trim());
      if (list.length) return list;
    } else if (hasText(raw)) {
      const list = raw.split(",").map((v) => v.trim()).filter(Boolean);
      if (list.length) return list;
    }
  }
  return [];
}

/* ===============================================================
   Compatibilidad de esquema — una columna nueva no tumba la página
   ===============================================================

   La base de datos puede ir por detrás del código: una columna recién
   añadida (barbers.sort_order, services.image_url) puede no existir todavía
   en la vista pública que sirve la API. Cuando eso pasa, Supabase responde
   «column public_barbers.sort_order does not exist» y, hasta ahora, la
   página entera se quedaba en blanco con ese mensaje encima.

   A partir de aquí ese caso —y SOLO ese— tiene salida: se reintenta la
   consulta anterior, la que no pide la columna nueva, y la página carga
   igual. Cuando la columna sí existe se usa, así que no se pierde ninguna
   función: el orden del panel sigue mandando y las fotos de los servicios
   siguen apareciendo.

   Lo que NO se tolera: cualquier otro error. Permisos, autenticación, red,
   RPC, una columna distinta que falte... todos se propagan tal cual, como
   siempre, para que un fallo real siga viéndose y no quede enmascarado. */

// Las únicas columnas por las que se acepta reintentar. Son las que el
// código añadió después y la base de datos puede no tener todavía.
export const COLUMNAS_TOLERADAS = ["sort_order", "image_url"];

// Devuelve el nombre de la columna tolerada que falta, o null si este error
// no es exactamente eso. Se mira el texto completo que manda Supabase
// (message, details, hint) porque la parte útil no siempre va en el mismo.
//
// El criterio es el MENSAJE, no el código: solo se reintenta si el error dice
// literalmente que falta una de las dos columnas de la lista. Un error de
// permisos, de red, de autenticación o de RPC nunca dice eso, así que nunca
// entra por aquí. El código (SQLSTATE 42703) se deja fuera a propósito: no
// todas las versiones de PostgREST lo mandan igual, y un código inesperado
// no debe volver a dejar la página caída.
export function columnaToleradaAusente(error) {
  if (!error) return null;
  const texto = [error.message, error.details, error.hint]
    .filter((t) => typeof t === "string")
    .join(" ");
  if (!texto) return null;
  for (const columna of COLUMNAS_TOLERADAS) {
    // Como lo dice PostgreSQL, que es lo que devuelve la API hoy:
    // «column public_barbers.sort_order does not exist». Acepta la forma
    // cualificada y la entrecomillada.
    const postgres = new RegExp(
      `column\\s+(?:"?[\\w.]+"?\\.)?"?${columna}"?\\s+does\\s+not\\s+exist`,
      "i",
    );
    // Y como lo dice PostgREST cuando lo detecta en su caché de esquema:
    // «Could not find the 'image_url' column of 'public_services' ...».
    const postgrest = new RegExp(
      `could\\s+not\\s+find\\s+the\\s+['"]?${columna}['"]?\\s+column`,
      "i",
    );
    if (postgres.test(texto) || postgrest.test(texto)) return columna;
  }
  return null;
}

// Ejecuta la consulta moderna. Si —y solo si— falla porque falta una columna
// tolerada, ejecuta una vez la consulta de respaldo. Nunca reintenta más de
// una vez y nunca convierte otro error en un respaldo silencioso.
export async function consultaTolerante(moderna, respaldo) {
  const res = await moderna();
  const ausente = res?.error ? columnaToleradaAusente(res.error) : null;
  if (!ausente) return res;
  return respaldo(ausente);
}

// Columnas que public_services y public_barbers han expuesto desde el primer
// día. Solo se nombran de forma explícita en el respaldo, para poder pedir la
// vista sin la columna que falta. El camino normal sigue usando select("*").
const SERVICIOS_SIEMPRE = "id, name, description, icon, price_cents, duration_minutes";

export function cargarServiciosPublicos() {
  return consultaTolerante(
    () => sb().from("public_services").select("*").order("sort_order"),
    (ausente) => {
      // Falta la foto: se piden las columnas de siempre y se conserva el
      // orden del panel, que en esta vista existe desde la primera versión.
      if (ausente === "image_url") {
        return sb()
          .from("public_services")
          .select(`${SERVICIOS_SIEMPRE}, sort_order`)
          .order("sort_order");
      }
      // Falta el propio orden: se cae a un orden estable por nombre.
      return sb().from("public_services").select(SERVICIOS_SIEMPRE).order("name");
    },
  );
}

export function cargarBarberosPublicos() {
  return consultaTolerante(
    // El orden del equipo lo decide el panel (barbers.sort_order). El nombre
    // queda como desempate, que es exactamente el orden de antes mientras
    // todos compartan el mismo sort_order.
    () => sb().from("public_barbers").select("*").order("sort_order").order("name"),
    // Respaldo: la consulta de siempre, ordenada por nombre. Los barberos
    // siguen apareciendo y la página carga.
    () => sb().from("public_barbers").select("*").order("name"),
  );
}

export async function loadPublicData() {
  const [business, services, barbers] = await Promise.all([
    sb().from("public_business").select("*").single(),
    cargarServiciosPublicos(),
    cargarBarberosPublicos(),
  ]);
  if (business.error) throw business.error;
  if (services.error) throw services.error;
  if (barbers.error) throw barbers.error;
  return {
    business: business.data || null,
    services: services.data || [],
    barbers: barbers.data || [],
  };
}

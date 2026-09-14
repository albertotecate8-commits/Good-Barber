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

export async function loadPublicData() {
  const [business, services, barbers] = await Promise.all([
    sb().from("public_business").select("*").single(),
    sb().from("public_services").select("*").order("sort_order"),
    // El orden del equipo lo decide el panel (barbers.sort_order). El nombre
    // queda como desempate, que es exactamente el orden de antes mientras
    // todos compartan el mismo sort_order.
    sb().from("public_barbers").select("*").order("sort_order").order("name"),
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

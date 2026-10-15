// Fuentes sin API gratuita utilizable: la app arma el enlace de consulta, tú
// la abres en tu navegador y registras lo que viste como hallazgo manual.
// No se automatizan navegadores ni se extrae información de estas páginas.
import type { AssistedSource } from "../types";

const enc = encodeURIComponent;

export const ASSISTED_SOURCES: AssistedSource[] = [
  {
    id: "meta_ad_library",
    name: "Biblioteca de anuncios de Meta",
    why: "Ver anuncios activos de competidores (promociones, formatos, textos). Su API solo entrega anuncios comerciales de la UE/Reino Unido; para México se consulta en la web.",
    links: (q) =>
      q.keywords.slice(0, 2).map((k) => ({
        label: `Anuncios activos en México: «${k} ${q.city}»`.trim(),
        url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MX&media_type=all&search_type=keyword_unordered&q=${enc(`${k} ${q.city.split(",")[0]}`.trim())}`,
      })),
  },
  {
    id: "google_maps",
    name: "Google Maps (fichas públicas)",
    why: "Competidores cercanos, calificaciones y reseñas públicas. La API de Places requiere facturación, por eso se consulta a mano.",
    links: (q) => [
      { label: `«${q.keywords[0] ?? q.sector}» en ${q.city}`, url: `https://www.google.com/maps/search/${enc(`${q.keywords[0] ?? q.sector} ${q.city}`)}` },
    ],
  },
  {
    id: "google_trends",
    name: "Google Trends (Explorar, estado de Durango)",
    why: "Comparar interés de búsqueda entre temas y temporadas. La API oficial está en alfa por invitación.",
    links: (q) => [
      {
        label: `Comparar: ${q.keywords.slice(0, 5).join(", ")} (últimos 12 meses, Durango)`,
        url: `https://trends.google.com/trends/explore?geo=MX-DUR&q=${q.keywords.slice(0, 5).map(enc).join(",")}`,
      },
    ],
  },
  {
    id: "tiktok_creative_center",
    name: "TikTok Creative Center",
    why: "Hashtags, sonidos y formatos en tendencia (filtra región México en la página). Sin API pública.",
    links: () => [
      { label: "Hashtags populares", url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/es" },
      { label: "Anuncios destacados", url: "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/es" },
    ],
  },
  {
    id: "web_search",
    name: "Búsqueda web manual",
    why: "Sitios y redes de competidores, notas locales y eventos.",
    links: (q) => [
      { label: `Promociones de ${q.keywords[0] ?? q.sector} en ${q.city}`, url: `https://www.google.com/search?q=${enc(`${q.keywords[0] ?? q.sector} ${q.city} promoción`)}` },
      { label: `Eventos en ${q.city} este mes`, url: `https://www.google.com/search?q=${enc(`eventos ${q.city} este mes`)}` },
    ],
  },
];

// Formatos por plataforma. Las medidas son las recomendadas por guías de 2026
// (no por documentación oficial de Meta, que no las publica de forma única);
// las zonas seguras indican dónde la interfaz de la app tapa el contenido.

export const MATERIAL_TYPES = ["ad", "flyer", "product_photo", "story", "cover", "reel", "video"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export const MATERIAL_LABELS: Record<MaterialType, string> = {
  ad: "Anuncio",
  flyer: "Flyer",
  product_photo: "Fotografía de producto o servicio",
  story: "Historia",
  cover: "Portada",
  reel: "Reel",
  video: "Video publicitario",
};
export const isVideoMaterial = (m: MaterialType) => m === "reel" || m === "video";

export interface CreativeFormat {
  key: string;
  label: string;
  platform: "instagram" | "facebook_page" | "tiktok" | "whatsapp" | "print" | "other";
  width: number;
  height: number;
  /** Márgenes (px) que la interfaz de la plataforma puede tapar. */
  safe: { top: number; bottom: number; left: number; right: number };
  materials: MaterialType[];
  video?: boolean;
  note: string;
}

const none = { top: 0, bottom: 0, left: 0, right: 0 };

export const FORMATS: CreativeFormat[] = [
  { key: "ig_portrait", label: "Instagram/Facebook publicación vertical 4:5", platform: "instagram", width: 1080, height: 1350, safe: { top: 0, bottom: 0, left: 0, right: 0 }, materials: ["ad", "product_photo", "flyer"], note: "El formato más usado en el feed y el más seguro para anuncios." },
  { key: "ig_square", label: "Instagram publicación cuadrada 1:1", platform: "instagram", width: 1080, height: 1080, safe: none, materials: ["ad", "product_photo"], note: "Se ve completo en la cuadrícula del perfil." },
  { key: "ig_story", label: "Historia 9:16 (Instagram/Facebook/WhatsApp)", platform: "instagram", width: 1080, height: 1920, safe: { top: 250, bottom: 250, left: 60, right: 60 }, materials: ["story", "ad"], note: "Deja ~250 px libres arriba y abajo: ahí van el perfil y los botones." },
  { key: "reel_cover", label: "Portada de Reel 9:16", platform: "instagram", width: 1080, height: 1920, safe: { top: 285, bottom: 285, left: 0, right: 0 }, materials: ["cover"], note: "La cuadrícula muestra solo el centro: pon el título dentro de la franja central." },
  { key: "fb_cover", label: "Portada de página de Facebook", platform: "facebook_page", width: 1640, height: 624, safe: { top: 0, bottom: 0, left: 210, right: 210 }, materials: ["cover"], note: "Se diseña al doble de 820×312; la foto de perfil tapa la esquina inferior izquierda." },
  { key: "fb_link", label: "Facebook publicación horizontal 1.91:1", platform: "facebook_page", width: 1200, height: 628, safe: none, materials: ["ad"], note: "Para publicaciones con enlace." },
  { key: "flyer_letter", label: "Flyer tamaño carta (impresión 300 ppp)", platform: "print", width: 2550, height: 3300, safe: { top: 75, bottom: 75, left: 75, right: 75 }, materials: ["flyer"], note: "21.6 × 27.9 cm a 300 ppp con margen de seguridad de 6 mm." },
  { key: "flyer_half", label: "Volante media carta (impresión 300 ppp)", platform: "print", width: 1650, height: 2550, safe: { top: 75, bottom: 75, left: 75, right: 75 }, materials: ["flyer"], note: "14 × 21.6 cm a 300 ppp." },
  { key: "video_vertical", label: "Video vertical 9:16 (Reels, TikTok, historias)", platform: "instagram", width: 1080, height: 1920, safe: { top: 250, bottom: 320, left: 60, right: 120 }, materials: ["reel", "video"], video: true, note: "Abajo y a la derecha están los botones y el texto de la publicación." },
  { key: "video_portrait", label: "Video vertical 4:5 (feed)", platform: "instagram", width: 1080, height: 1350, safe: none, materials: ["video"], video: true, note: "Ocupa más pantalla que el cuadrado en el feed." },
  { key: "video_square", label: "Video cuadrado 1:1", platform: "facebook_page", width: 1080, height: 1080, safe: none, materials: ["video"], video: true, note: "Compatible con casi todas las ubicaciones." },
];

export function formatByKey(key: string) {
  return FORMATS.find((f) => f.key === key) ?? null;
}

export function formatsFor(material: MaterialType) {
  return FORMATS.filter((f) => f.materials.includes(material));
}

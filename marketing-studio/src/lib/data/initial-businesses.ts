// Datos REALES proporcionados por el dueño (no son de demostración). Lo que no
// se conoce se deja vacío para completarlo en la app: nunca se inventan
// precios, direcciones ni públicos.

export interface InitialBusiness {
  name: string;
  slug: string;
  sector: string;
  description: string;
  city: string;
  brand?: {
    color_primary: string;
    color_secondary: string;
    color_accent: string;
    color_background: string;
    font_heading: string;
    font_body: string;
    visual_rules: string;
  };
  offerings: { name: string; price_cents: number; kind: "service" | "package" }[];
  socials: { platform: "instagram" | "facebook_page"; handle: string; url: string | null; notes: string }[];
}

export const INITIAL_BUSINESSES: InitialBusiness[] = [
  {
    name: "Good Barber",
    slug: "good-barber",
    sector: "Barbería",
    description: "Barbería en Durango capital.",
    city: "Durango, Durango",
    // Tomado de la identidad visual existente (app de clientes de Good Barber).
    brand: {
      color_primary: "#D6A73A",
      color_secondary: "#10130F",
      color_accent: "#F2D07A",
      color_background: "#05070B",
      font_heading: "Inter",
      font_body: "Inter",
      visual_rules: "Fondo negro profundo, acentos dorados, estética premium y masculina.",
    },
    offerings: [
      { name: "Corte", price_cents: 12000, kind: "service" },
      { name: "Barba", price_cents: 5000, kind: "service" },
      { name: "Cejas", price_cents: 3000, kind: "service" },
      { name: "Corte y barba", price_cents: 17000, kind: "package" },
      { name: "Corte y cejas", price_cents: 15000, kind: "package" },
      { name: "Corte, barba y cejas", price_cents: 19900, kind: "package" },
    ],
    socials: [
      {
        platform: "instagram",
        handle: "good_barber_oficial",
        url: "https://www.instagram.com/good_barber_oficial/",
        notes: "",
      },
      {
        platform: "facebook_page",
        handle: "Good barber",
        url: null,
        notes:
          "Página existente administrada desde el perfil personal, dentro de un portafolio comercial de Meta con control total. No crear otra página.",
      },
    ],
  },
  {
    name: "Glamour Studio",
    slug: "glamour-studio",
    sector: "Salón de uñas",
    description: "Salón de uñas con perfiles sociales e identidad visual propios.",
    city: "",
    offerings: [],
    socials: [],
  },
  {
    name: "AFORE PRO",
    slug: "afore-pro",
    sector: "Asesoría en trámites y retiros AFORE",
    description: "Asesoría sobre trámites y retiros AFORE, con perfiles y materiales de marca propios.",
    city: "",
    offerings: [],
    socials: [],
  },
];

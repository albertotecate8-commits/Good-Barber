import {
  BarChart3,
  Building2,
  CalendarDays,
  FolderOpen,
  Home,
  Megaphone,
  MessagesSquare,
  Palette,
  Search,
  Settings,
  Share2,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Aparece en la barra inferior del móvil. */
  primary?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Acción principal de la app: está siempre a la vista (barra superior y navegación móvil). */
export const CREATE_AD: NavItem = { href: "/anuncio/nuevo", label: "Crear anuncio", icon: Sparkles };

// Agrupadas para que la barra lateral no sea una lista interminable.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/", label: "Inicio", icon: Home, primary: true },
      { href: "/negocios", label: "Negocios", icon: Building2, primary: true },
    ],
  },
  {
    label: "Crear y publicar",
    items: [
      CREATE_AD,
      { href: "/campanas", label: "Campañas", icon: Megaphone },
      { href: "/calendario", label: "Calendario", icon: CalendarDays, primary: true },
      { href: "/biblioteca", label: "Biblioteca", icon: FolderOpen },
      { href: "/distribucion", label: "Distribución", icon: Share2 },
    ],
  },
  {
    label: "Planear y crecer",
    items: [
      { href: "/crear", label: "Director de marketing", icon: Wand2 },
      { href: "/investigacion", label: "Investigación", icon: Search },
      { href: "/estudio", label: "Estudio creativo", icon: Palette },
      { href: "/mensajes", label: "Prospectos", icon: MessagesSquare },
      { href: "/analiticas", label: "Analíticas", icon: BarChart3 },
    ],
  },
  {
    label: "Cuenta",
    items: [{ href: "/configuracion", label: "Configuración", icon: Settings }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

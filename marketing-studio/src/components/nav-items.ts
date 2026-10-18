import {
  BarChart3,
  Building2,
  CalendarDays,
  FolderOpen,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Palette,
  PenTool,
  Search,
  Settings,
  Share2,
  Sparkles,
  Telescope,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Las tres áreas principales del estudio. */
export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Crear", icon: Sparkles, description: "Chat creativo" },
  { href: "/investigar", label: "Investigar", icon: Telescope, description: "Tendencias y referencias" },
  { href: "/estilos", label: "Estilos y memoria", icon: Palette, description: "Identidad de cada negocio" },
];

// Funciones secundarias: siguen disponibles (mismas rutas), fuera de la vista principal.
export const NAV_MORE: NavGroup[] = [
  {
    label: "Publicar",
    items: [
      { href: "/calendario", label: "Calendario", icon: CalendarDays },
      { href: "/distribucion", label: "Distribución a grupos", icon: Share2 },
      { href: "/biblioteca", label: "Biblioteca", icon: FolderOpen },
    ],
  },
  {
    label: "Planear",
    items: [
      { href: "/campanas", label: "Campañas", icon: Megaphone },
      { href: "/crear", label: "Director de marketing", icon: Wand2 },
      { href: "/anuncio/nuevo", label: "Anuncio guiado", icon: PenTool },
      { href: "/estudio", label: "Editor y proyectos", icon: Palette },
      { href: "/investigacion", label: "Informes de investigación", icon: Search },
    ],
  },
  {
    label: "Resultados",
    items: [
      { href: "/resumen", label: "Resumen", icon: LayoutDashboard },
      { href: "/mensajes", label: "Prospectos", icon: MessagesSquare },
      { href: "/analiticas", label: "Analíticas", icon: BarChart3 },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { href: "/negocios", label: "Negocios", icon: Building2 },
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = [...NAV_MAIN, ...NAV_MORE.flatMap((g) => g.items)];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

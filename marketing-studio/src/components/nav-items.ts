import {
  BarChart3,
  Building2,
  CalendarDays,
  FolderOpen,
  Home,
  Megaphone,
  Palette,
  MessagesSquare,
  Search,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Aparece en la barra inferior del móvil. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home, primary: true },
  { href: "/negocios", label: "Negocios", icon: Building2, primary: true },
  { href: "/crear", label: "Crear contenido", icon: Sparkles, primary: true },
  { href: "/estudio", label: "Estudio creativo", icon: Palette },
  { href: "/investigacion", label: "Investigación", icon: Search },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, primary: true },
  { href: "/campanas", label: "Campañas", icon: Megaphone },
  { href: "/mensajes", label: "Mensajes y prospectos", icon: MessagesSquare },
  { href: "/analiticas", label: "Analíticas", icon: BarChart3 },
  { href: "/biblioteca", label: "Biblioteca", icon: FolderOpen },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

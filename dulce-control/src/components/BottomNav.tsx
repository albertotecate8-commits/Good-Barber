import { clsx } from "clsx";
import { Candy, ClipboardCheck, History, Home, ShoppingBag } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/conteo", label: "Conteo", icon: ClipboardCheck },
  { to: "/compras", label: "Compras", icon: ShoppingBag },
  { to: "/historial", label: "Historial", icon: History },
  { to: "/productos", label: "Productos", icon: Candy },
];

export function BottomNav({ badge }: { badge?: number }) {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md" aria-label="Navegación principal">
      <ul className="mx-auto grid max-w-3xl grid-cols-5 px-2">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition", isActive ? "text-pink" : "text-ink-3 hover:text-ink-2")
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx("grid h-8 w-12 place-items-center rounded-full transition", isActive && "bg-pink-soft")}>
                    <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {label}
                  {to === "/compras" && !!badge && (
                    <span className="absolute right-[calc(50%-22px)] top-1.5 grid min-w-5 place-items-center rounded-full bg-pink px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

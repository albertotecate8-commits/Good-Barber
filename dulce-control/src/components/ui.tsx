import { cn as clsx } from "../lib/cn";
import { ChevronLeft, Minus, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { CategoryColor } from "../api";

// ---------------------------------------------------------------------------
// Colores por categoría (los "sabores" de la referencia)
// ---------------------------------------------------------------------------
export const flavor: Record<CategoryColor, { soft: string; solid: string; ring: string; text: string }> = {
  pink: { soft: "bg-pink-soft", solid: "bg-pink", ring: "ring-pink/40", text: "text-pink-ink" },
  mango: { soft: "bg-mango-soft", solid: "bg-mango", ring: "ring-mango/50", text: "text-[#b07b00] dark:text-mango" },
  mint: { soft: "bg-mint-soft", solid: "bg-mint", ring: "ring-mint/50", text: "text-[#1f8f63] dark:text-mint" },
  choco: { soft: "bg-choco-soft", solid: "bg-choco", ring: "ring-choco/40", text: "text-choco dark:text-[#e2b894]" },
  grape: { soft: "bg-grape-soft", solid: "bg-grape", ring: "ring-grape/40", text: "text-[#7a4fd0] dark:text-grape" },
  sky: { soft: "bg-sky-soft", solid: "bg-sky", ring: "ring-sky/40", text: "text-[#2382bf] dark:text-sky" },
};
export const FLAVORS = Object.keys(flavor) as CategoryColor[];

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

export function Button({
  variant = "primary", size = "md", block, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100 select-none",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "h-14 px-6 text-base",
        size === "xl" && "min-h-16 px-6 py-3 text-lg",
        variant === "primary" && "bg-pink text-white shadow-pop hover:bg-pink-strong",
        variant === "secondary" && "bg-surface text-ink border-2 border-line hover:border-pink/40",
        variant === "soft" && "bg-pink-soft text-pink-ink hover:brightness-95",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2",
        variant === "danger" && "bg-danger-soft text-danger hover:brightness-95",
        block && "w-full",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ className, children, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={clsx(
        "grid size-10 place-items-center rounded-full bg-surface text-ink border border-line shadow-card transition active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Estructura de pantalla
// ---------------------------------------------------------------------------
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={clsx("mx-auto w-full max-w-3xl px-4 pb-36 animate-fade-up", className)}>{children}</main>;
}

export function TopBar({ title, back, right, sticky = true }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; sticky?: boolean }) {
  const nav = useNavigate();
  return (
    <header className={clsx("pt-safe z-20 bg-bg/85 backdrop-blur-md", sticky && "sticky top-0")}>
      <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
        <div className="w-10">
          {back && (
            <IconButton label="Regresar" onClick={() => (typeof back === "string" ? nav(back) : nav(-1))}>
              <ChevronLeft className="size-5" />
            </IconButton>
          )}
        </div>
        <h1 className="flex-1 truncate text-center text-lg font-semibold">{title}</h1>
        <div className="flex w-10 justify-end">{right}</div>
      </div>
    </header>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("font-display font-bold tracking-tight text-pink", className)}>
      Dulce<span className="text-ink"> </span>Control
    </span>
  );
}

/** Borde chorreado (como el helado derretido de la referencia). */
export function Drip({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden className={clsx("block w-full", flip && "rotate-180", className)}>
      <path
        fill="currentColor"
        d="M0 0H400V14C392 14 390 30 380 30C368 30 372 12 358 12C344 12 348 44 332 44C317 44 322 16 306 16C292 16 296 26 284 26C272 26 276 10 262 10C248 10 252 38 236 38C221 38 226 14 210 14C196 14 199 24 188 24C176 24 180 8 166 8C152 8 156 40 140 40C125 40 130 14 114 14C100 14 104 28 92 28C80 28 84 10 70 10C56 10 60 34 44 34C30 34 34 14 20 14C10 14 8 22 0 22Z"
      />
    </svg>
  );
}

export function Card({ children, className, onClick, as = "div" }: { children: ReactNode; className?: string; onClick?: () => void; as?: "div" | "button" | "li" }) {
  const Tag = as;
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        "rounded-3xl border border-line bg-surface shadow-card",
        onClick && "text-left transition active:scale-[0.99] hover:border-pink/30 cursor-pointer",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {action && <div className="text-sm text-ink-3">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatares de dulce
// ---------------------------------------------------------------------------
export function CandyAvatar({ emoji, color = "pink", size = "md", className }: { emoji?: string | null; color?: CategoryColor; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center rounded-full",
        flavor[color].soft,
        size === "sm" && "size-9 text-lg",
        size === "md" && "size-12 text-2xl",
        size === "lg" && "size-16 text-4xl",
        size === "xl" && "size-24 text-6xl",
        className,
      )}
    >
      <span className="candy-emoji" aria-hidden>{emoji || "🍬"}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stepper: − [ n ] +   (null = "sin contar", distinto de 0)
// ---------------------------------------------------------------------------
export function Stepper({
  value, onChange, min = 0, size = "md", label, placeholder = "—", autoFocus,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  size?: "sm" | "md" | "lg";
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const btn = clsx(
    "grid shrink-0 place-items-center rounded-full border-2 border-line bg-surface text-ink transition active:scale-90 active:bg-pink-soft disabled:opacity-40",
    size === "sm" && "size-8", size === "md" && "size-10", size === "lg" && "size-12",
  );
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} aria-label={`Menos ${label}`} disabled={value == null || value <= min}
        onClick={() => onChange(Math.max((value ?? min) - 1, min))}>
        <Minus className="size-4" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 5);
          onChange(digits === "" ? null : Math.max(parseInt(digits, 10), min));
        }}
        className={clsx(
          "tabular rounded-2xl border-2 bg-surface text-center font-semibold outline-none transition focus:border-pink focus:ring-4 focus:ring-pink/15",
          value == null ? "border-dashed border-line text-ink-3" : "border-line",
          size === "sm" && "h-9 w-12 text-base", size === "md" && "h-11 w-16 text-lg", size === "lg" && "h-14 w-20 text-2xl",
        )}
      />
      <button type="button" className={clsx(btn, "border-pink/30 text-pink")} aria-label={`Más ${label}`}
        onClick={() => onChange((value ?? min - 1) + 1)}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-base outline-none transition placeholder:text-ink-3 focus:border-pink focus:ring-4 focus:ring-pink/15";

export function MoneyInput({ id, value, onChange, placeholder = "0" }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">$</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
        className={clsx(inputClass, "tabular pl-8")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etiquetas y estados
// ---------------------------------------------------------------------------
export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "pink" | "ok" | "warn" | "danger"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "pink" && "bg-pink-soft text-pink-ink",
        tone === "ok" && "bg-mint-soft text-[#1f8f63] dark:text-mint",
        tone === "warn" && "bg-warn-soft text-[#b86400] dark:text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ emoji, title, children, action }: { emoji: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center animate-pop-in">
      <div className="mb-4 grid size-24 place-items-center rounded-full bg-pink-soft text-5xl">
        <span className="candy-emoji animate-float">{emoji}</span>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-xs text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-3" role="status">
      <span className="text-4xl candy-emoji animate-wiggle">🍬</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-3xl bg-danger-soft p-5 text-center text-danger">
      <p className="font-semibold">No se pudo cargar</p>
      <p className="mt-1 text-sm opacity-80">{msg}</p>
      {onRetry && <Button variant="secondary" className="mt-3" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hoja inferior (modal)
// ---------------------------------------------------------------------------
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label="Cerrar" className="absolute inset-0 bg-[#2b1b21]/45 backdrop-blur-[2px] animate-[fade-up_.2s_ease-out]" onClick={onClose} />
      <div ref={ref} className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[2rem] bg-bg shadow-2xl animate-[fade-up_.25s_ease-out] sm:rounded-[2rem]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose} className="size-9 shadow-none"><X className="size-4" /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Barra inferior fija para la acción principal de la pantalla. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl gap-3 px-4 py-3">{children}</div>
    </div>
  );
}

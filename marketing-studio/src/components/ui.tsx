import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="animate-rise mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-gold">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={clsx("surface-raised rounded-2xl border border-line/70 p-4 sm:p-5", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

type Tone = "neutral" | "gold" | "positive" | "action" | "warn" | "danger";
const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  gold: "bg-gold-soft text-gold",
  positive: "bg-positive-soft text-positive",
  action: "bg-action-soft text-action-strong",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", toneClasses[tone])}>
      {children}
    </span>
  );
}

const buttonBase =
  "pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const buttonVariants = {
  primary: "bg-action text-on-action shadow-raised hover:bg-action-strong hover:shadow-float",
  secondary: "border border-line bg-surface text-ink shadow-soft hover:border-line-strong hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
};
export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return clsx(buttonBase, buttonVariants[variant], className);
}

export function Button({ variant = "primary", className, ...rest }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action, icon: Icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-4 py-8 text-center">
      {Icon && (
        <span aria-hidden className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-action-soft text-action-strong shadow-soft">
          <Icon className="size-6" />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "action", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "warn" && "border-warn/30 bg-warn-soft",
        tone === "danger" && "border-danger/30 bg-danger-soft",
        tone === "positive" && "border-positive/30 bg-positive-soft",
        tone === "gold" && "border-gold/30 bg-gold-soft",
        (tone === "action" || tone === "neutral") && "border-action/30 bg-action-soft",
      )}
    >
      {title && <p className="mb-0.5 font-medium text-ink">{title}</p>}
      <div className="text-muted">{children}</div>
    </div>
  );
}

const statTones = {
  teal: "from-[#d9f1f0] to-[#c4e8e6] dark:from-[#17393d] dark:to-[#123034]",
  sky: "from-[#e0ecf8] to-[#cfe0f2] dark:from-[#1a2e47] dark:to-[#15263d]",
  violet: "from-[#e6e3f7] to-[#d6d1f1] dark:from-[#272646] dark:to-[#201f3b]",
  sand: "from-[#f5ecd9] to-[#ecdfc2] dark:from-[#3a3020] dark:to-[#30281b]",
  slate: "from-surface to-surface-2",
} as const;

/**
 * Tarjeta de métrica. `value` null = no hay dato real: se muestra el estado
 * vacío en lugar de inventar un número.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
  href,
}: {
  label: string;
  value: number | string | null;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof statTones;
  href?: string;
}) {
  const body = (
    <div className={clsx("h-full rounded-2xl bg-gradient-to-br p-4 shadow-raised ring-1 ring-black/5 dark:ring-white/5", statTones[tone])}>
      <span aria-hidden className="mb-3 grid size-10 place-items-center rounded-xl bg-surface/80 text-action-strong shadow-soft">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="pressable block h-full rounded-2xl hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Acceso directo grande y táctil (acciones rápidas del inicio). */
export function QuickAction({ href, icon: Icon, label, description }: { href: string; icon: LucideIcon; label: string; description?: string }) {
  return (
    <Link
      href={href}
      className="pressable surface-raised group flex min-h-16 items-center gap-3 rounded-2xl border border-line/70 p-3 hover:-translate-y-0.5 hover:border-action/40"
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-action-soft text-action-strong transition-colors group-hover:bg-action group-hover:text-on-action">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block truncate text-xs text-muted">{description}</span>}
      </span>
    </Link>
  );
}

/** Indicador de pasos de un asistente. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Paso ${current + 1} de ${steps.length}: ${steps[current]}`}>
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1">
          <span
            aria-hidden
            className={clsx("h-1.5 rounded-full transition-colors", i < current ? "bg-action" : i === current ? "bg-action-strong" : "bg-surface-3")}
          />
          <span className={clsx("hidden truncate text-[11px] sm:block", i === current ? "font-semibold text-ink" : "text-faint")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

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
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
    <section className={clsx("rounded-2xl border border-line bg-surface p-4 sm:p-5", className)} {...rest}>
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
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const buttonVariants = {
  primary: "bg-action text-white hover:bg-action-strong",
  secondary: "border border-line-strong bg-surface-2 text-ink hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
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

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
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

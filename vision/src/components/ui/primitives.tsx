"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useId, useRef } from "react";

// ------------------------------------------------------------------ Button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, block, icon, children, className, disabled, ...rest }: ButtonProps) {
  const cls = ["btn", `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block", className].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner small /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span className={small ? "spinner spinner-sm" : "spinner"} role="status" aria-label={label ?? "Cargando"} />
  );
}

// ------------------------------------------------------------------ Layout

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["card", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export function Section({ title, action, children, description }: { title: string; action?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {description && <p className="section-desc">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, accent, back, action }: { title: string; subtitle?: ReactNode; accent?: string; back?: ReactNode; action?: ReactNode }) {
  return (
    <header className="page-header" style={accent ? ({ "--biz": accent } as React.CSSProperties) : undefined}>
      {back}
      <div className="page-header-row">
        <div className="page-header-text">
          {accent && <span className="page-accent" aria-hidden />}
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ Feedback

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <div className="notice-body">
        {title && <strong className="notice-title">{title}</strong>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="loading-block">
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice tone="danger" title="No se pudo cargar" action={onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>}>
      {message}
    </Notice>
  );
}

// ------------------------------------------------------------------ Forms

type FieldProps = { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode };

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className={error ? "field field-error" : "field"}>
      <label htmlFor={id} className="field-label">{label}</label>
      {children(id)}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-msg" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input textarea" {...props} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="input select" {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <label htmlFor={id}>{label}</label>
        {description && <p className="field-hint">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? "switch switch-on" : "switch"}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "segmented-item active" : "segmented-item"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Error de formulario que se desplaza a la vista (en una hoja larga del iPhone quedaría oculto). */
export function FormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref}>
      <Notice tone="danger">{message}</Notice>
    </div>
  );
}

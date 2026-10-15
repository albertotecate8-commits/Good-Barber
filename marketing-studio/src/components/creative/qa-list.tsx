import { AlertTriangle, CheckCircle2, User, XCircle } from "lucide-react";
import type { QaCheck } from "@/lib/creative/qa";

const SOURCE = { browser: "medido en el lienzo", server: "verificado en el servidor", manual: "revisión humana" } as const;

export function QaList({ checks }: { checks: QaCheck[] }) {
  if (!checks.length) return <p className="text-xs text-muted">Sin revisión todavía.</p>;
  const order = { error: 0, warning: 1, ok: 2 } as const;
  return (
    <ul className="flex flex-col gap-1.5">
      {[...checks].sort((a, b) => order[a.level] - order[b.level]).map((c, i) => {
        const Icon = c.source === "manual" ? User : c.level === "error" ? XCircle : c.level === "warning" ? AlertTriangle : CheckCircle2;
        const tone = c.level === "error" ? "text-danger" : c.level === "warning" ? "text-warn" : "text-positive";
        return (
          <li key={`${c.id}-${i}`} className="flex gap-2 text-xs">
            <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-hidden />
            <span className="min-w-0">
              <span className="font-medium text-ink">{c.label}</span>
              <span className="sr-only"> ({c.level === "error" ? "error" : c.level === "warning" ? "advertencia" : "correcto"})</span>: <span className="text-muted">{c.detail}</span>{" "}
              <span className="text-faint">· {SOURCE[c.source]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

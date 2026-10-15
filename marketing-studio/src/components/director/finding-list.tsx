import { ExternalLink } from "lucide-react";
import type { Finding } from "@/lib/data/director";
import { formatDateTime } from "@/lib/dates";
import { SOURCE_LABELS, type EvidenceLevel } from "@/lib/research/types";
import { ConfirmButton } from "../business-forms";
import { ConfidenceBadge, EvidenceBadge } from "./badges";
import { Badge, EmptyState } from "../ui";

const ORDER: EvidenceLevel[] = ["fact", "observation", "hypothesis"];
const GROUP_TITLES: Record<EvidenceLevel, string> = {
  fact: "Hechos comprobados",
  observation: "Observaciones",
  hypothesis: "Hipótesis",
};

export function FindingList({
  findings,
  highlight,
  onDelete,
}: {
  findings: Finding[];
  highlight?: Set<string>;
  onDelete?: (id: string) => () => Promise<void>;
}) {
  if (!findings.length) return <EmptyState title="Sin hallazgos todavía" />;
  return (
    <div className="flex flex-col gap-5">
      {ORDER.map((level) => {
        const list = findings.filter((f) => f.evidence_level === level);
        if (!list.length) return null;
        return (
          <section key={level} aria-label={GROUP_TITLES[level]}>
            <h3 className="mb-2 text-sm font-semibold">
              {GROUP_TITLES[level]} <span className="font-normal text-muted">({list.length})</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((f) => (
                <li key={f.id} className="min-w-0 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <EvidenceBadge level={f.evidence_level} />
                    <ConfidenceBadge confidence={f.confidence} />
                    <Badge>{f.capture_method === "manual" ? "Registro manual" : "Automático"}</Badge>
                    {highlight?.has(f.id) && <Badge tone="gold">Citado en la campaña</Badge>}
                  </div>
                  <p className="mt-2 break-words font-medium">{f.summary}</p>
                  {f.evidence && <p className="mt-1 break-words text-muted">{f.evidence}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                    <span>
                      {SOURCE_LABELS[f.source_type]} · {f.source_name}
                    </span>
                    <span>Consultado: {formatDateTime(f.consulted_at)}</span>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-action-strong hover:underline">
                        Abrir fuente <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </p>
                  {onDelete && (
                    <div className="mt-2">
                      <ConfirmButton action={onDelete(f.id)} confirmText="¿Eliminar este hallazgo?" variant="ghost">
                        Eliminar
                      </ConfirmButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

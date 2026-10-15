import { BASIS_LABELS, type Basis } from "@/lib/director/plan";
import { CONFIDENCE_LABELS, EVIDENCE_LABELS, type Confidence, type EvidenceLevel } from "@/lib/research/types";
import { Badge } from "../ui";

const BASIS_TONE: Record<Basis, "positive" | "action" | "warn" | "gold"> = {
  fact: "positive",
  observation: "action",
  hypothesis: "warn",
  recommendation: "gold",
};

export function BasisBadge({ basis }: { basis: Basis }) {
  return <Badge tone={BASIS_TONE[basis]}>{BASIS_LABELS[basis]}</Badge>;
}

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return <Badge tone={BASIS_TONE[level]}>{EVIDENCE_LABELS[level]}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <Badge tone={confidence === "high" ? "positive" : confidence === "medium" ? "neutral" : "warn"}>Confianza {CONFIDENCE_LABELS[confidence].toLowerCase()}</Badge>;
}

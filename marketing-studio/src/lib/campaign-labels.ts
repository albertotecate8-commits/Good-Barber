import type { CampaignStatus } from "@/lib/data/types";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  idea: "Idea",
  research: "Investigando",
  draft: "Borrador",
  review: "En revisión",
  approved: "Aprobada",
  active: "Activa",
  finished: "Terminada",
  archived: "Archivada",
};
export const CAMPAIGN_STATUSES = Object.keys(CAMPAIGN_STATUS_LABELS) as CampaignStatus[];

/** Etapas para separar lo que solo es una idea de lo que ya se ejecuta. */
export const CAMPAIGN_STAGES: { key: string; label: string; hint: string; statuses: CampaignStatus[] }[] = [
  { key: "ideas", label: "Ideas sugeridas y borradores", hint: "Propuestas que aún no se ejecutan.", statuses: ["idea", "research", "draft", "review"] },
  { key: "running", label: "Aprobadas y en ejecución", hint: "Campañas que decidiste lanzar.", statuses: ["approved", "active"] },
  { key: "done", label: "Terminadas", hint: "Historial con sus resultados.", statuses: ["finished", "archived"] },
];

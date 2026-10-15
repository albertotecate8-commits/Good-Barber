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

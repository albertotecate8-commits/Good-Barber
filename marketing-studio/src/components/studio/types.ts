import type { StudioMessage, StudioPublication, StudioVersion } from "@/lib/data/studio";

export type { StudioMessage, StudioPublication, StudioVersion };

export interface StudioBusiness {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface StyleChip {
  id: string;
  name: string;
  palette: string[];
  createdAt: string;
}

export interface DestinationState {
  ready: boolean;
  reason: string | null;
  accountName: string | null;
  publishingOn: boolean;
}

export type Readiness = Record<"facebook_page" | "instagram", DestinationState>;

export const assetSrc = (id: string) => `/api/biblioteca/archivo/${id}`;

export const DESTINATION_LABELS = { facebook_page: "Facebook", instagram: "Instagram" } as const;

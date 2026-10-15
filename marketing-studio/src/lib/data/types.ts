import type { SocialPlatform } from "@/lib/validation/business";

export interface Business {
  id: string;
  slug: string;
  name: string;
  sector: string;
  description: string;
  city: string;
  service_area: string;
  address: string;
  target_audience: string;
  timezone: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface BrandProfile {
  business_id: string;
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  color_background: string;
  font_heading: string;
  font_body: string;
  tone_of_voice: string;
  visual_rules: string;
  dos: string[];
  donts: string[];
  logo_url: string | null;
  updated_at: string;
}

export interface Offering {
  id: string;
  business_id: string;
  name: string;
  description: string;
  kind: "service" | "product" | "package";
  price_cents: number | null;
  currency: string;
  active: boolean;
  sort_order: number;
}

export interface Promotion {
  id: string;
  business_id: string;
  title: string;
  details: string;
  restrictions: string;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
}

export type ConnectionStatus = "not_connected" | "manual" | "connected" | "expired" | "error";

export interface SocialAccount {
  id: string;
  business_id: string;
  platform: SocialPlatform;
  handle: string;
  url: string | null;
  connection_status: ConnectionStatus;
  token_expires_at: string | null;
  last_checked_at: string | null;
  notes: string;
}

export type ContentStatus = "draft" | "pending" | "approved" | "scheduled" | "published" | "error";

export interface ContentItem {
  id: string;
  business_id: string;
  campaign_id: string | null;
  platform: SocialPlatform;
  format: string;
  title: string;
  caption: string;
  scheduled_at: string | null;
  status: ContentStatus;
  published_at: string | null;
  last_error: string | null;
}

export type CampaignStatus = "idea" | "research" | "draft" | "review" | "approved" | "active" | "finished" | "archived";

export interface Campaign {
  id: string;
  business_id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  starts_on: string | null;
  ends_on: string | null;
  kpi: string;
}

export interface AuditEntry {
  id: number;
  business_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

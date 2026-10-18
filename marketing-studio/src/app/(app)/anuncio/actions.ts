"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError } from "@/lib/action-state";
import { validateContent } from "@/lib/validation/content";

// Guarda el anuncio del asistente como publicación del calendario. Reutiliza
// las mismas reglas que el calendario (fechas futuras, límites de texto,
// Instagram exige imagen al programar). Nunca publica: la publicación
// automática sigue requiriendo cuenta conectada y aprobación del dueño.

export interface SaveAdInput {
  business_id: string;
  platform: string;
  format: string;
  headline: string;
  text: string;
  hashtags: string;
  asset_id: string;
  mode: "draft" | "review" | "scheduled";
  date: string;
  time: string;
}

export type SaveAdResult = { ok: true; id: string } | { ok: false; message: string; errors?: Record<string, string> };

export async function saveAd(input: SaveAdInput): Promise<SaveAdResult> {
  await requireUser();
  const v = validateContent({
    business_id: input.business_id,
    platform: input.platform,
    format: input.format,
    title: input.headline,
    caption: input.text,
    hashtags: input.hashtags,
    date: input.mode === "scheduled" ? input.date : "",
    time: input.mode === "scheduled" ? input.time : "",
    status: input.mode,
    asset_id: input.asset_id ?? "",
  });
  if (!v.ok) return { ok: false, message: "Revisa lo marcado antes de guardar.", errors: v.errors };
  const id = randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_content_items").insert({ id, ...v.data, publish_mode: "manual" });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/calendario", "layout");
  revalidatePath("/");
  return { ok: true, id };
}

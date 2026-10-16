import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { POSTING_MODE_LABELS, frequencyCheck, type PostingMode } from "@/lib/distribution/core";
import { Card, CardTitle, EmptyState, Notice, buttonClass } from "@/components/ui";
import { DistributeForm } from "@/components/distribution";
import { startDistribution } from "../actions";

export const metadata = { title: "Distribuir a grupos" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewDistribution({ searchParams }: { searchParams: Promise<{ contenido?: string }> }) {
  await requireUser();
  const { contenido = "" } = await searchParams;
  if (!UUID.test(contenido)) notFound();
  const supabase = await createClient();
  const { data: item } = await supabase.from("mkt_content_items").select("id, business_id, title, caption, platform, external_post_url, manual_post_url").eq("id", contenido).maybeSingle();
  if (!item) notFound();
  const { data: biz } = await supabase.from("mkt_businesses").select("name, slug").eq("id", item.business_id).maybeSingle();
  const [{ data: groups }, { data: tasks }] = await Promise.all([
    supabase.from("mkt_fb_groups").select("id, name, posting_mode, active, min_days_between, page_can_participate").eq("business_id", item.business_id).eq("active", true).order("name"),
    supabase.from("mkt_distribution_tasks").select("group_id, content_id, status, opened_at, confirmed_at").eq("business_id", item.business_id).in("status", ["opened", "awaiting_approval", "confirmed"]),
  ]);
  const { data: existing } = await supabase.from("mkt_distribution_tasks").select("group_id").eq("content_id", item.id);
  const inQueue = new Set((existing ?? []).map((e) => e.group_id));
  const last = new Map<string, string>();
  for (const t of tasks ?? []) {
    const at = t.confirmed_at ?? t.opened_at;
    if (at && (!last.has(t.group_id) || at > last.get(t.group_id)!)) last.set(t.group_id, at);
  }
  const source = item.external_post_url ?? item.manual_post_url;
  const options = (groups ?? []).map((g) => {
    const f = frequencyCheck(g.min_days_between, last.get(g.id) ?? null);
    return {
      id: g.id,
      name: g.name,
      mode: `${POSTING_MODE_LABELS[g.posting_mode as PostingMode]}${g.page_can_participate === "no" ? " · solo perfiles" : ""}`,
      lastActivity: last.get(g.id) ? formatDateTime(last.get(g.id)!) : null,
      blockedReason: inQueue.has(g.id)
        ? "Ya está en la cola de esta publicación."
        : f.allowed
          ? null
          : `Pausa de ${g.min_days_between} días: disponible desde el ${formatDateTime(f.nextAllowedAt!.toISOString())}.`,
    };
  });

  return (
    <>
      <div className="mb-5">
        <Link href={`/distribucion?negocio=${biz?.slug ?? ""}`} className="text-sm text-muted hover:text-ink">
          ← Distribución a grupos
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Distribuir a grupos</h1>
        <p className="text-sm text-muted">
          {biz?.name} · {item.title || "Publicación"}
        </p>
      </div>
      <div className="grid gap-4">
        {!source ? (
          <Notice tone="warn" title="Falta la publicación original">
            Primero publícala en la página (o registra su enlace en «Registro manual»): los grupos reciben la publicación original.
          </Notice>
        ) : (
          <Card>
            <CardTitle>Publicación original</CardTitle>
            <a href={source} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-action-strong hover:underline">
              {source}
            </a>
          </Card>
        )}
        <Card>
          <CardTitle>Elige los grupos de {biz?.name}</CardTitle>
          {options.length === 0 ? (
            <EmptyState title="No hay grupos activos" action={<Link href={`/distribucion?negocio=${biz?.slug ?? ""}`} className={buttonClass("primary")}>Agregar grupos</Link>} />
          ) : source ? (
            <DistributeForm action={startDistribution.bind(null, item.id)} groups={options} submitLabel="Crear cola de distribución" />
          ) : null}
        </Card>
      </div>
    </>
  );
}

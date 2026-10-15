import Link from "next/link";
import { BarChart3, Sparkles } from "lucide-react";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { listCampaigns } from "@/lib/data/director";
import { GOAL_LABELS, PLAN_SOURCE_LABELS } from "@/lib/director/plan";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from "@/lib/campaign-labels";
import { formatDate } from "@/lib/dates";
import { Badge, ButtonLink, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Campañas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ negocio?: string; estado?: string; grupo?: string; eliminada?: string }> }) {
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const selected = businesses.find((b) => b.slug === sp.negocio);
  const status = CAMPAIGN_STATUSES.find((s) => s === sp.estado);
  const campaigns = await listCampaigns({ businessId: selected?.id, status, group: sp.grupo });
  const bizMap = new Map(businesses.map((b) => [b.id, b]));

  return (
    <>
      <PageHeader
        title="Campañas"
        description="Estrategias guardadas, sus piezas y los resultados registrados."
        actions={
          <>
            <ButtonLink href="/crear">
              <Sparkles className="size-4" aria-hidden /> Nueva con el Director
            </ButtonLink>
            <ButtonLink href="/campanas/comparar" variant="secondary">
              <BarChart3 className="size-4" aria-hidden /> Comparar resultados
            </ButtonLink>
          </>
        }
      />
      {sp.eliminada === "1" && (
        <div className="mb-4" role="status">
          <Notice tone="positive">Campaña eliminada. Sus borradores del calendario se conservan sin campaña.</Notice>
        </div>
      )}
      {sp.grupo && (
        <div className="mb-4" role="status">
          <Notice tone="positive">
            Se creó una campaña por cada negocio elegido. <Link href="/campanas" className="underline">Ver todas</Link>
          </Notice>
        </div>
      )}
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:items-end" aria-label="Filtros de campañas">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Negocio
          <select name="negocio" defaultValue={selected?.slug ?? ""} className="input min-h-10 py-1.5 text-sm">
            <option value="">Todos</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Estado
          <select name="estado" defaultValue={status ?? ""} className="input min-h-10 py-1.5 text-sm">
            <option value="">Todos</option>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CAMPAIGN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex gap-2">
          <button type="submit" className={buttonClass("secondary", "min-h-10")}>
            Filtrar
          </button>
          <Link href="/campanas" className={buttonClass("ghost", "min-h-10")}>
            Limpiar
          </Link>
        </div>
      </form>
      {campaigns.length === 0 ? (
        <EmptyState title="Aún no hay campañas" action={<ButtonLink href="/crear">Crear con el Director</ButtonLink>}>
          Escribe una instrucción sencilla y el Director prepara la estrategia, los anuncios y el calendario.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {campaigns.map((c) => {
            const b = bizMap.get(c.business_id);
            return (
              <li key={c.id} className="min-w-0">
                <Link href={`/campanas/${c.id}`} className="block h-full rounded-2xl border border-line bg-surface p-4 hover:border-line-strong" style={{ borderLeft: `3px solid ${b?.color ?? "var(--gold)"}` }}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    <Badge tone="action">{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {b?.name} · {c.goal ? GOAL_LABELS[c.goal] : c.objective || "Sin objetivo"}
                  </span>
                  <span className="mt-1 block text-xs text-faint">
                    {formatDate(c.starts_on)} – {formatDate(c.ends_on)} · {PLAN_SOURCE_LABELS[c.plan_source]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

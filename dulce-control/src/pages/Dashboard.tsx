import { clsx } from "clsx";
import { ArrowRight, ClipboardCheck, ReceiptText, Settings } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { CandyAvatar, Card, Chip, ErrorBox, IconButton, Loading, Logo, Page, SectionTitle, flavor } from "../components/ui";
import { useLatestWeekly, useProfile } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { isSaturday, int, money, sameLocalDay, weekLabel } from "../lib/format";

export function DashboardPage() {
  const nav = useNavigate();
  const profile = useProfile();
  const catalog = useCatalog();
  const { counts, latest } = useLatestWeekly();

  if (counts.isLoading || catalog.isLoading) return <Loading />;
  if (counts.error) return <Page className="pt-10"><ErrorBox error={counts.error} onRetry={() => counts.refetch()} /></Page>;
  if ((counts.data?.length ?? 0) === 0) return <Navigate to="/bienvenida" replace />;

  const toBuy = catalog.active
    .filter((p) => p.shopping_qty != null && !p.shopping_checked)
    .sort((a, b) => a.current_quantity - b.current_quantity);
  const countedToday = latest && sameLocalDay(latest.counted_at, new Date());
  const saturdayNudge = isSaturday() && !countedToday;

  return (
    <>
      <header className="pt-safe">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <span className="w-10" />
          <Logo className="text-2xl" />
          <IconButton label="Ajustes" onClick={() => nav("/ajustes")}><Settings className="size-5" /></IconButton>
        </div>
      </header>

      <Page>
        {profile.data?.business_name && <p className="-mt-1 mb-3 text-center text-sm text-ink-3">{profile.data.business_name}</p>}

        {/* Tarjeta principal (como "Bubblegum Pink" de la referencia) */}
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ff8aa8] via-pink to-[#ef4a73] p-5 text-white shadow-pop">
          <div className="sprinkles absolute inset-0 opacity-70 [background-size:140px_140px]" />
          <span className="candy-emoji pointer-events-none absolute -right-3 -top-1 text-[7.5rem] animate-float select-none">🍭</span>
          <div className="relative max-w-[70%]">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/85">
              {latest ? weekLabel(latest.period_start, latest.counted_at) : "Esta semana"}
            </p>
            {latest ? (
              <>
                <p className="mt-2 text-sm text-white/85">Ganancia estimada</p>
                <p className="tabular font-display text-5xl font-bold leading-tight">{money(latest.total_profit)}</p>
              </>
            ) : (
              <p className="mt-2 font-display text-2xl font-semibold leading-snug">Tu primer resumen aparece después del conteo del sábado</p>
            )}
          </div>
          <button
            onClick={() => nav(latest ? `/semana/${latest.id}` : "/conteo")}
            className="relative mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-pink shadow-card active:scale-95"
          >
            {latest ? "Ver resumen" : "Hacer conteo"} <ArrowRight className="size-4" />
          </button>
        </section>

        {/* Indicadores */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat emoji="💰" label="Ventas" value={latest ? money(latest.total_sales) : "—"} color="mango" />
          <Stat emoji="📈" label="Ganancia" value={latest ? money(latest.total_profit) : "—"} color="mint" />
          <Stat emoji="📦" label="Vendidos" value={latest ? int(latest.total_units_sold) : "—"} color="grape" />
          <Stat emoji="🛒" label="Por comprar" value={int(toBuy.length)} color="pink" onClick={() => nav("/compras")} />
        </div>

        {/* Acciones grandes */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <BigAction onClick={() => nav("/conteo")} primary icon={<ClipboardCheck className="size-7" />} title="Hacer conteo" subtitle="Cuenta tus dulces del sábado" />
          <BigAction onClick={() => nav("/compras/nueva?modo=ticket")} icon={<ReceiptText className="size-7" />} title="Registrar compra" subtitle="Con foto del ticket o a mano" />
        </div>

        {saturdayNudge && (
          <button onClick={() => nav("/conteo")} className="relative mt-5 flex w-full items-center overflow-hidden rounded-[1.75rem] bg-gradient-to-r from-pink to-[#ff8a7a] p-5 text-left text-white shadow-pop active:scale-[0.99]">
            <div className="relative z-10">
              <p className="text-sm text-white/90">¡Hoy es sábado!</p>
              <p className="font-display text-2xl font-bold">Hora de contar 📦</p>
              <p className="text-sm text-white/90">Te toma pocos minutos</p>
            </div>
            <span className="candy-emoji absolute -right-2 bottom-[-10px] text-8xl">🍫</span>
          </button>
        )}

        {/* Lista para comprar (como "Featured Flavors") */}
        <SectionTitle action={<button className="font-medium" onClick={() => nav("/compras")}>Ver todo</button>}>
          🛒 Lista para comprar
        </SectionTitle>
        {toBuy.length === 0 ? (
          <Card className="flex items-center gap-4 p-5">
            <span className="text-4xl">🎉</span>
            <p className="text-sm text-ink-2">Nada por comprar por ahora. Todo está arriba del mínimo.</p>
          </Card>
        ) : (
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {toBuy.slice(0, 12).map((p) => {
              const look = catalog.look(p);
              const out = p.current_quantity === 0;
              return (
                <button key={p.id} onClick={() => nav("/compras")}
                  className={clsx("relative w-36 shrink-0 snap-start overflow-hidden rounded-3xl p-3 text-left transition active:scale-95", flavor[look.color].soft)}>
                  {out && <Chip tone="danger" className="absolute left-2 top-2">Agotado</Chip>}
                  <div className="grid h-24 place-items-center">
                    <span className="candy-emoji text-6xl">{look.emoji}</span>
                  </div>
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-ink-2">Tienes {p.current_quantity} · mín {p.min_quantity}</p>
                  <p className="mt-1 text-sm font-bold text-pink-ink">Comprar {p.shopping_qty}</p>
                </button>
              );
            })}
          </div>
        )}

        {latest && <RecentWeeks />}
      </Page>
    </>
  );
}

function Stat({ emoji, label, value, color, onClick }: { emoji: string; label: string; value: string; color: keyof typeof flavor; onClick?: () => void }) {
  return (
    <Card as={onClick ? "button" : "div"} onClick={onClick} className="flex items-center gap-3 p-3.5">
      <CandyAvatar emoji={emoji} color={color} size="sm" className="size-11 text-xl" />
      <div className="min-w-0">
        <p className="text-xs text-ink-3">{label}</p>
        <p className="tabular truncate text-lg font-semibold">{value}</p>
      </div>
    </Card>
  );
}

function BigAction({ onClick, icon, title, subtitle, primary }: { onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={clsx("flex items-center gap-4 rounded-[1.75rem] p-4 text-left transition active:scale-[0.98]",
        primary ? "bg-pink text-white shadow-pop" : "border-2 border-line bg-surface text-ink shadow-card")}>
      <span className={clsx("grid size-14 shrink-0 place-items-center rounded-2xl", primary ? "bg-white/20" : "bg-pink-soft text-pink")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold uppercase tracking-wide">{title}</span>
        <span className={clsx("block text-sm", primary ? "text-white/85" : "text-ink-2")}>{subtitle}</span>
      </span>
      <ArrowRight className="size-5 opacity-70" />
    </button>
  );
}

function RecentWeeks() {
  const nav = useNavigate();
  const { counts } = useLatestWeekly();
  const weeks = (counts.data ?? []).filter((c) => c.kind === "weekly").slice(0, 6).reverse();
  if (weeks.length < 2) return null;
  const max = Math.max(...weeks.map((w) => w.total_sales), 1);
  return (
    <>
      <SectionTitle action={<button className="font-medium" onClick={() => nav("/historial")}>Historial</button>}>📊 Últimas semanas</SectionTitle>
      <Card className="p-4">
        <div className="flex h-36 items-end gap-3">
          {weeks.map((w, i) => (
            <button key={w.id} onClick={() => nav(`/semana/${w.id}`)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="tabular text-[11px] font-semibold text-ink-2">{money(w.total_profit)}</span>
              <span className="relative w-full max-w-12 overflow-hidden rounded-t-xl rounded-b-md bg-pink-soft" style={{ height: `${Math.max((w.total_sales / max) * 100, 6)}%` }}>
                <span className={clsx("absolute inset-x-0 bottom-0 rounded-t-xl", i === weeks.length - 1 ? "bg-pink" : "bg-pink/55")}
                  style={{ height: `${w.total_sales ? (w.total_profit / w.total_sales) * 100 : 0}%` }} />
              </span>
              <span className="text-[11px] text-ink-3">{new Date(w.counted_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "")}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-4 text-xs text-ink-3">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-pink-soft ring-1 ring-pink/30" />Ventas</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-pink" />Ganancia</span>
        </div>
      </Card>
    </>
  );
}

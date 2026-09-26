import { clsx } from "clsx";
import { ChevronRight, ReceiptText } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Empty, ErrorBox, Loading, Page, TopBar } from "../components/ui";
import { useCounts, usePurchases } from "../hooks/data";
import { fmtDay, fmtFull, int, money, weekLabel } from "../lib/format";

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "compras" ? "compras" : "semanas";
  return (
    <>
      <TopBar title="Historial" />
      <Page>
        <div className="mb-5 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-sm font-semibold">
          {(["semanas", "compras"] as const).map((t) => (
            <button key={t} onClick={() => setParams(t === "compras" ? { tab: t } : {}, { replace: true })}
              className={clsx("h-11 rounded-full transition", tab === t ? "bg-surface text-pink shadow-card" : "text-ink-3")}>
              {t === "semanas" ? "📊 Semanas" : "🧾 Compras"}
            </button>
          ))}
        </div>
        {tab === "semanas" ? <Weeks /> : <Purchases />}
      </Page>
    </>
  );
}

function Weeks() {
  const nav = useNavigate();
  const { data, isLoading, error, refetch } = useCounts();
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const weeks = (data ?? []).filter((c) => c.kind === "weekly");
  const initial = (data ?? []).find((c) => c.kind === "initial");
  if (weeks.length === 0) {
    return <Empty emoji="📊" title="Aún no hay semanas">Cuando hagas tu primer conteo del sábado, aquí verás cómo te fue.</Empty>;
  }
  const total = weeks.reduce((s, w) => ({ sales: s.sales + w.total_sales, profit: s.profit + w.total_profit }), { sales: 0, profit: 0 });
  const best = Math.max(...weeks.map((w) => w.total_profit));

  return (
    <>
      <Card className="mb-4 grid grid-cols-2 divide-x divide-line p-4 text-center">
        <div><p className="text-xs text-ink-3">Ventas ({weeks.length} sem.)</p><p className="tabular text-xl font-semibold">{money(total.sales)}</p></div>
        <div><p className="text-xs text-ink-3">Ganancia</p><p className="tabular text-xl font-semibold text-pink">{money(total.profit)}</p></div>
      </Card>
      <ul className="space-y-3">
        {weeks.map((w, i) => {
          const prev = weeks[i + 1];
          const delta = prev ? w.total_profit - prev.total_profit : null;
          return (
            <Card as="li" key={w.id} onClick={() => nav(`/semana/${w.id}`)} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{weekLabel(w.period_start, w.counted_at)}</p>
                  <p className="text-xs text-ink-3">{int(w.total_units_sold)} piezas vendidas</p>
                </div>
                <div className="flex items-center gap-1">
                  {w.total_profit === best && weeks.length > 1 && <span title="Mejor semana">🏆</span>}
                  <ChevronRight className="size-5 text-ink-3" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-mango-soft px-3 py-2">
                  <p className="text-xs text-ink-2">Ventas estimadas</p>
                  <p className="tabular font-semibold">{money(w.total_sales)}</p>
                </div>
                <div className="rounded-2xl bg-mint-soft px-3 py-2">
                  <p className="text-xs text-ink-2">Ganancia</p>
                  <p className="tabular font-semibold">
                    {money(w.total_profit)}
                    {delta != null && delta !== 0 && (
                      <span className={clsx("ml-1.5 text-xs", delta > 0 ? "text-ok" : "text-danger")}>{delta > 0 ? "▲" : "▼"} {money(Math.abs(delta))}</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </ul>
      {initial && (
        <button onClick={() => nav(`/semana/${initial.id}`)} className="mt-4 w-full text-center text-sm text-ink-3 underline underline-offset-4">
          Inventario inicial · {fmtFull(initial.counted_at)}
        </button>
      )}
    </>
  );
}

function Purchases() {
  const nav = useNavigate();
  const { data, isLoading, error, refetch } = usePurchases();
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const list = data ?? [];
  if (list.length === 0) return <Empty emoji="🧾" title="Sin compras registradas">Registra tu primera compra desde la lista de compras.</Empty>;

  // Agrupar por semana (inicia sábado) para "cuánto compré cada semana".
  const groups = new Map<string, typeof list>();
  for (const p of list) {
    const d = new Date(p.purchased_at);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 1) % 7));
    const k = start.toISOString();
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([start, items]) => {
        const s = new Date(start);
        const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
        const sum = items.reduce((a, p) => a + p.total_cost, 0);
        return (
          <section key={start}>
            <div className="mb-2 flex items-end justify-between">
              <h3 className="text-sm font-semibold text-ink-2">Semana {fmtDay(s)} – {fmtDay(e)}</h3>
              <span className="tabular text-sm font-semibold">{money(sum)}</span>
            </div>
            <ul className="space-y-2">
              {items.map((p) => (
                <Card as="li" key={p.id} onClick={() => nav(`/compras/${p.id}`)} className="flex items-center gap-3 p-3.5">
                  <span className="grid size-11 place-items-center rounded-2xl bg-pink-soft text-pink"><ReceiptText className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.store_name || (p.source === "ticket" ? "Compra con ticket" : "Compra")}</p>
                    <p className="text-xs text-ink-3">{fmtFull(p.purchased_at)} · {int(p.total_units)} pzas {p.ticket_path && "· 📷"}</p>
                  </div>
                  <span className="tabular font-semibold">{money(p.total_cost)}</span>
                </Card>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

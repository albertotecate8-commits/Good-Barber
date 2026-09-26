import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { friendlyError, type WeeklyCountItem } from "../api";
import { useToast } from "../components/toast";
import { Button, CandyAvatar, Card, Chip, ErrorBox, Loading, Page, SectionTitle, Stepper, TopBar } from "../components/ui";
import { useCount, useCounts, useUpdateProduct } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { useDebouncedCallback } from "../hooks/useDebounced";
import { fmtFull, fmtTime, int, money, weekLabel } from "../lib/format";

type SortKey = "sales" | "sold" | "profit";

export function WeekSummaryPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const count = useCount(id);
  const counts = useCounts();
  const catalog = useCatalog();
  const [sort, setSort] = useState<SortKey>("sales");
  const justSaved = params.get("nuevo") === "1";

  if (count.isLoading || catalog.isLoading) return <Loading />;
  if (count.error || !count.data) return <Page className="pt-10"><ErrorBox error={count.error ?? "No encontrado"} /></Page>;

  const c = count.data;
  const isLatest = counts.data?.[0]?.id === c.id;
  const sold = [...c.items].filter((i) => i.units_sold > 0).sort((a, b) =>
    sort === "sold" ? b.units_sold - a.units_sold : sort === "profit" ? b.profit_amount - a.profit_amount : b.sales_amount - a.sales_amount);
  const out = c.items.filter((i) => i.stock_status === "out");
  const low = c.items.filter((i) => i.stock_status === "low");
  const surplus = c.items.filter((i) => i.surplus > 0);

  if (c.kind === "initial") {
    return (
      <>
        <TopBar title="Inventario inicial" back />
        <Page>
          <p className="mb-4 text-center text-sm text-ink-2">{fmtFull(c.counted_at)} · {c.items.length} productos</p>
          <Card className="divide-y divide-line">
            {c.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium">{i.product_name}</span>
                <span className="tabular">{i.counted_quantity} pzas</span>
              </div>
            ))}
          </Card>
        </Page>
      </>
    );
  }

  return (
    <>
      <TopBar title="Resumen de la semana" back={justSaved ? "/" : true} />
      <Page>
        {justSaved && (
          <div className="mb-4 flex items-center gap-3 rounded-3xl bg-mint-soft p-4 animate-pop-in">
            <span className="text-3xl">🎉</span>
            <div>
              <p className="font-semibold">¡Conteo guardado!</p>
              <p className="text-sm text-ink-2">Tu inventario quedó actualizado y la lista de compras está lista.</p>
            </div>
          </div>
        )}

        <p className="text-center text-xs font-semibold uppercase tracking-wider text-pink">📊 {weekLabel(c.period_start, c.counted_at)}</p>
        <p className="mb-4 text-center text-xs text-ink-3">Contado el {fmtFull(c.counted_at).toLowerCase()} a las {fmtTime(c.counted_at)}</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <BigStat label="Ventas estimadas" value={money(c.total_sales)} emoji="💰" />
          <BigStat label="Costo de mercancía" value={money(c.total_cost)} emoji="🧾" />
          <BigStat label="Ganancia estimada" value={money(c.total_profit)} emoji="📈" highlight />
          <BigStat label="Productos vendidos" value={int(c.total_units_sold)} emoji="📦" />
        </div>

        <SectionTitle action={
          <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
            <option value="sales">Por ventas</option>
            <option value="sold">Por piezas</option>
            <option value="profit">Por ganancia</option>
          </select>
        }>Por producto</SectionTitle>
        {sold.length === 0 ? (
          <Card className="p-5 text-sm text-ink-2">Esta semana no hubo ventas registradas.</Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-2 py-2.5 text-right font-medium">Vendidos</th>
                  <th className="px-2 py-2.5 text-right font-medium">Ventas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sold.map((i) => {
                  const look = catalog.look(catalog.byId.get(i.product_id));
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-medium"><span aria-hidden>{look.emoji}</span>{i.product_name}</span>
                        <span className="text-xs text-ink-3">{i.previous_quantity} → {i.counted_quantity} · {money(i.unit_price)} c/u</span>
                      </td>
                      <td className="tabular px-2 text-right font-semibold">{i.units_sold}</td>
                      <td className="tabular px-2 text-right">{money(i.sales_amount)}</td>
                      <td className="tabular px-4 text-right font-semibold text-pink-ink">{money(i.profit_amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-surface-2 font-semibold">
                <tr>
                  <td className="px-4 py-2.5">Total</td>
                  <td className="tabular px-2 text-right">{c.total_units_sold}</td>
                  <td className="tabular px-2 text-right">{money(c.total_sales)}</td>
                  <td className="tabular px-4 text-right text-pink-ink">{money(c.total_profit)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )}

        <SectionTitle>🛒 Lista para comprar</SectionTitle>
        {out.length + low.length === 0 ? (
          <Card className="p-5 text-sm text-ink-2">🎉 Nada quedó debajo del mínimo esta semana.</Card>
        ) : (
          <div className="space-y-4">
            {out.length > 0 && <RestockGroup title="🔴 Agotados" items={out} editable={isLatest} />}
            {low.length > 0 && <RestockGroup title="🟠 Stock bajo" items={low} editable={isLatest} />}
            {isLatest && (
              <Button block size="lg" onClick={() => nav("/compras")}>Ver mi lista de compras <ArrowRight className="size-5" /></Button>
            )}
          </div>
        )}

        {surplus.length > 0 && (
          <>
            <SectionTitle>⚠️ Sobrantes</SectionTitle>
            <Card className="p-4 text-sm">
              <p className="mb-2 text-ink-2">Se contó más de lo esperado (no se toma como venta):</p>
              {surplus.map((i) => <p key={i.id}>{i.product_name}: +{i.surplus}</p>)}
            </Card>
          </>
        )}

        {c.notes && (
          <>
            <SectionTitle>📝 Nota</SectionTitle>
            <Card className="p-4 text-sm">{c.notes}</Card>
          </>
        )}
      </Page>
    </>
  );
}

function BigStat({ label, value, emoji, highlight }: { label: string; value: string; emoji: string; highlight?: boolean }) {
  return (
    <Card className={clsx("p-4", highlight && "border-transparent bg-pink text-white shadow-pop")}>
      <p className={clsx("text-xs", highlight ? "text-white/85" : "text-ink-3")}>{emoji} {label}</p>
      <p className="tabular mt-1 font-display text-2xl font-bold sm:text-3xl">{value}</p>
    </Card>
  );
}

function RestockGroup({ title, items, editable }: { title: string; items: WeeklyCountItem[]; editable: boolean }) {
  const catalog = useCatalog();
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 pt-2 text-xs text-ink-3">
        <span>Producto</span><span className="w-12 text-right">Actual</span><span className="w-12 text-right">Mínimo</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((i) => {
          const product = catalog.byId.get(i.product_id);
          const look = catalog.look(product);
          return (
            <li key={i.id} className="px-4 py-3">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                <span className="flex min-w-0 items-center gap-2">
                  <CandyAvatar emoji={look.emoji} color={look.color} size="sm" />
                  <span className="truncate font-medium">{i.product_name}</span>
                </span>
                <span className={clsx("tabular w-12 text-right font-semibold", i.counted_quantity === 0 && "text-danger")}>{i.counted_quantity}</span>
                <span className="tabular w-12 text-right text-ink-2">{i.min_quantity}</span>
              </div>
              {editable && product ? <BuyQty productId={product.id} qty={product.shopping_qty} suggested={i.suggested_qty} /> : (
                <p className="mt-1 text-xs text-ink-3">Sugerido: comprar {i.suggested_qty}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function BuyQty({ productId, qty, suggested }: { productId: string; qty: number | null; suggested: number }) {
  const update = useUpdateProduct();
  const toast = useToast();
  const [value, setValue] = useState<number | null>(qty ?? suggested);
  const persist = useDebouncedCallback((v: number | null) => {
    update.mutateAsync({ id: productId, patch: { shopping_qty: v ?? 0 } }).catch((e) => toast(friendlyError(e), "error"));
  });
  const commit = (v: number | null) => { setValue(v); persist(v); };
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2">
      <span className="text-sm leading-tight"><span className="text-ink-2">Sugerido</span> <b>{suggested}</b><br /><span className="text-xs text-ink-3">¿Cuántas comprar?</span></span>
      <Stepper size="sm" value={value} onChange={commit} label="cantidad a comprar" />
      {value != null && value !== suggested && <Chip tone="pink" className="hidden sm:inline-flex">Ajustado</Chip>}
    </div>
  );
}

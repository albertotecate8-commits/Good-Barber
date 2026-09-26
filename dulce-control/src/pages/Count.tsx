import { clsx } from "clsx";
import { AlertTriangle, ArrowRight, Check, ChevronLeft, MoreHorizontal, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { friendlyError, type Product } from "../api";
import { ProductFormSheet } from "../components/ProductForm";
import { useToast } from "../components/toast";
import {
  ActionBar, Button, CandyAvatar, Card, Chip, Drip, Empty, IconButton, Loading, Page, Sheet, Stepper, TopBar, inputClass,
} from "../components/ui";
import { useCounts, useSaveCount, useUpdateProduct } from "../hooks/data";
import { useUser } from "../hooks/auth";
import { useCatalog } from "../hooks/useCatalog";
import { countLine, sumLines } from "../lib/calc";
import { fmtFull, int, money } from "../lib/format";

type Values = Record<string, number | null>;
interface Draft { startedAt: string; values: Values }

function useDraft(userId: string | undefined, lastCountAt: string | undefined) {
  const key = `dulce-count-draft:${userId ?? "anon"}`;
  const [values, setValues] = useState<Values>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
      // Un borrador más viejo que el último conteo ya no sirve.
      if (d && (!lastCountAt || d.startedAt > lastCountAt)) return d.values;
    } catch { /* */ }
    return {};
  });
  const started = useRef(new Date().toISOString());
  useEffect(() => {
    try {
      if (Object.keys(values).length) localStorage.setItem(key, JSON.stringify({ startedAt: started.current, values }));
    } catch { /* */ }
  }, [key, values]);
  const clear = () => { try { localStorage.removeItem(key); } catch { /* */ } };
  return [values, setValues, clear] as const;
}

export function CountPage() {
  const catalog = useCatalog();
  const counts = useCounts();
  if (catalog.isLoading || counts.isLoading) return <Loading />;
  return <CountFlow lastCountAt={counts.data?.[0]?.counted_at} />;
}

function CountFlow({ lastCountAt }: { lastCountAt?: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const user = useUser();
  const catalog = useCatalog();
  const save = useSaveCount();
  const deactivate = useUpdateProduct();
  const [values, setValues, clearDraft] = useDraft(user?.id, lastCountAt);
  const [phase, setPhase] = useState<"count" | "review">("count");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | string>("all");
  const [missingOpen, setMissingOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Product | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const products = useMemo(() => {
    const order = new Map(catalog.categories.map((c, i) => [c.id, i]));
    return [...catalog.active].sort((a, b) =>
      (order.get(a.category_id ?? "") ?? 999) - (order.get(b.category_id ?? "") ?? 999) || a.name.localeCompare(b.name, "es"));
  }, [catalog.active, catalog.categories]);

  const counted = products.filter((p) => values[p.id] != null).length;
  const missing = products.filter((p) => values[p.id] == null);
  const progress = products.length ? counted / products.length : 0;

  const visible = products.filter((p) => {
    if (filter === "pending" && values[p.id] != null) return false;
    if (filter !== "all" && filter !== "pending" && p.category_id !== filter) return false;
    if (query && !p.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const lines = useMemo(() => products.filter((p) => values[p.id] != null).map((p) => ({
    product: p,
    ...countLine({ previous: p.current_quantity, counted: values[p.id]!, unitCost: p.cost_price, unitPrice: p.sale_price, minQuantity: p.min_quantity }),
  })), [products, values]);
  const totals = sumLines(lines);

  const set = (id: string, v: number | null) => setValues((x) => ({ ...x, [id]: v }));

  async function discontinue(p: Product) {
    try {
      await deactivate.mutateAsync({ id: p.id, patch: { is_active: false, shopping_qty: null, shopping_checked: false } });
      setValues((x) => { const n = { ...x }; delete n[p.id]; return n; });
      toast(`${p.name} marcado como descontinuado`);
    } catch (e) { toast(friendlyError(e), "error"); }
  }

  async function submit() {
    try {
      const id = await save.mutateAsync({
        kind: "weekly",
        notes,
        items: products.map((p) => ({ product_id: p.id, counted_quantity: values[p.id]! })),
      });
      clearDraft();
      nav(`/semana/${id}?nuevo=1`, { replace: true });
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  if (products.length === 0) {
    return (
      <>
        <TopBar title="Conteo" back="/" />
        <Empty emoji="🍬" title="Aún no tienes productos" action={<Button onClick={() => nav("/productos")}>Agregar productos</Button>}>
          Agrega tus dulces para poder contarlos.
        </Empty>
      </>
    );
  }

  // ---------------------------------------------------------------- Revisión
  if (phase === "review") {
    const surplus = lines.filter((l) => l.surplus > 0);
    const sold = lines.filter((l) => l.sold > 0).sort((a, b) => b.sales - a.sales);
    const out = lines.filter((l) => l.status === "out").length;
    const low = lines.filter((l) => l.status === "low").length;
    return (
      <>
        <TopBar title="Revisar conteo" right={null} back={false} />
        <Page>
          <button className="mb-3 flex items-center gap-1 text-sm font-medium text-ink-2" onClick={() => setPhase("count")}>
            <ChevronLeft className="size-4" /> Seguir contando
          </button>
          <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ff8aa8] to-pink p-5 text-white shadow-pop">
            <div className="sprinkles absolute inset-0 opacity-60 [background-size:140px_140px]" />
            <div className="relative">
              <p className="text-sm text-white/85">Ganancia estimada de la semana</p>
              <p className="tabular font-display text-5xl font-bold">{money(totals.profit)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-white/80">Ventas</p><p className="tabular font-semibold">{money(totals.sales)}</p></div>
                <div><p className="text-white/80">Costo</p><p className="tabular font-semibold">{money(totals.cost)}</p></div>
                <div><p className="text-white/80">Vendidos</p><p className="tabular font-semibold">{int(totals.units)}</p></div>
              </div>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-4"><p className="text-xs text-ink-3">🔴 Agotados</p><p className="text-2xl font-semibold">{out}</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-3">🟠 Stock bajo</p><p className="text-2xl font-semibold">{low}</p></Card>
          </div>

          {surplus.length > 0 && (
            <Card className="mt-4 border-warn/40 bg-warn-soft p-4">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-5 text-warn" /> Contaste más de lo que había</p>
              <p className="mt-1 text-sm text-ink-2">¿Hubo una compra sin registrar o un error al contar? No se cuenta como venta; revisa si es correcto.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {surplus.map((l) => (
                  <li key={l.product.id} className="flex justify-between"><span>{l.product.name}</span><span className="tabular">antes {l.product.current_quantity} → ahora {values[l.product.id]} (+{l.surplus})</span></li>
                ))}
              </ul>
            </Card>
          )}

          <h2 className="mb-2 mt-6 font-semibold">Lo que se vendió</h2>
          {sold.length === 0 ? (
            <p className="text-sm text-ink-2">No hay ventas: todas las cantidades son iguales o mayores que antes.</p>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-ink-3">
                  <tr><th className="px-4 py-2 font-medium">Producto</th><th className="px-2 py-2 text-right font-medium">Vend.</th><th className="px-2 py-2 text-right font-medium">Ventas</th><th className="px-4 py-2 text-right font-medium">Ganancia</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sold.map((l) => (
                    <tr key={l.product.id}>
                      <td className="px-4 py-2.5 font-medium">{l.product.name}</td>
                      <td className="tabular px-2 text-right">{l.sold}</td>
                      <td className="tabular px-2 text-right">{money(l.sales)}</td>
                      <td className="tabular px-4 text-right font-semibold text-pink-ink">{money(l.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <label className="mt-6 block">
            <span className="text-sm font-medium text-ink-2">Nota (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Ej. hubo kermés, se regalaron 3 paletas…"
              className={clsx(inputClass, "mt-1.5 h-auto py-3")} />
          </label>
        </Page>
        <ActionBar>
          <Button block size="lg" disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Guardando…" : <>Guardar conteo <Check className="size-5" /></>}
          </Button>
        </ActionBar>
      </>
    );
  }

  // ---------------------------------------------------------------- Conteo
  return (
    <>
      <header className="pt-safe relative bg-gradient-to-br from-[#ff7b9c] to-pink text-white">
        <div className="sprinkles absolute inset-0 opacity-60 [background-size:150px_150px]" />
        <div className="relative mx-auto max-w-3xl px-4 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <IconButton label="Salir" onClick={() => nav("/")} className="border-white/30 bg-white/20 text-white shadow-none"><ChevronLeft className="size-5" /></IconButton>
            <span className="text-sm font-medium text-white/90">{fmtFull(new Date())}</span>
            <span className="w-10" />
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold">📦 Conteo del sábado</h1>
          <p className="text-sm text-white/90">Escribe cuántas piezas tienes de cada dulce.</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="tabular text-sm font-semibold">{counted} de {products.length}</span>
          </div>
        </div>
      </header>
      <Drip className="-mt-px h-6 text-pink" />

      <Page className="pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
          <input className={clsx(inputClass, "pl-11")} placeholder="Buscar dulce…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar dulce" />
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>Todos</FilterChip>
          <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")}>Pendientes · {missing.length}</FilterChip>
          {catalog.categories.map((c) => (
            <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>{c.emoji} {c.name}</FilterChip>
          ))}
        </div>

        {visible.length === 0 && filter === "pending" && (
          <Empty emoji="✅" title="¡Todo contado!">Ya puedes revisar y guardar tu conteo.</Empty>
        )}

        <ul className="mt-3 space-y-3">
          {visible.map((p) => {
            const look = catalog.look(p);
            const v = values[p.id];
            const line = v == null ? null : countLine({ previous: p.current_quantity, counted: v, unitCost: p.cost_price, unitPrice: p.sale_price, minQuantity: p.min_quantity });
            return (
              <Card as="li" key={p.id} className={clsx("p-3.5 transition", v != null && "border-pink/25")}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <CandyAvatar emoji={look.emoji} color={look.color} />
                    {v != null && <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-ok text-white ring-2 ring-surface"><Check className="size-3" strokeWidth={3} /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{p.name}</p>
                    <p className="text-sm text-ink-2">Inventario anterior: <span className="tabular font-semibold text-ink">{p.current_quantity}</span></p>
                  </div>
                  <button className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2" aria-label={`Opciones de ${p.name}`} onClick={() => setMenuFor(p)}>
                    <MoreHorizontal className="size-5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    {line == null ? (
                      <button className="font-medium text-ink-3 underline decoration-dotted underline-offset-4" onClick={() => set(p.id, 0)}>No hay ninguno (0)</button>
                    ) : line.surplus > 0 ? (
                      <Chip tone="warn">+{line.surplus} de más</Chip>
                    ) : line.sold > 0 ? (
                      <Chip tone="pink">{line.sold} vendidos</Chip>
                    ) : (
                      <Chip>Sin ventas</Chip>
                    )}
                    {line?.status === "out" && <Chip tone="danger" className="ml-1">Agotado</Chip>}
                  </div>
                  <Stepper value={v ?? null} onChange={(x) => set(p.id, x)} label={`cantidad actual de ${p.name}`} size="lg" />
                </div>
              </Card>
            );
          })}
        </ul>
        <Button variant="ghost" block className="mt-4" onClick={() => setNewOpen(true)}><Plus className="size-4" /> Producto nuevo</Button>
      </Page>

      <ActionBar>
        <Button block size="lg" onClick={() => (missing.length ? setMissingOpen(true) : setPhase("review"))}>
          Revisar conteo <span className="tabular opacity-80">({counted}/{products.length})</span> <ArrowRight className="size-5" />
        </Button>
      </ActionBar>

      <Sheet open={missingOpen} onClose={() => setMissingOpen(false)} title="⚠️ Faltan productos por contar"
        footer={<Button block size="lg" onClick={() => { setFilter("pending"); setMissingOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Contar pendientes</Button>}>
        <p className="text-sm text-ink-2">
          No asumimos que no hay: cuenta {missing.length === 1 ? "este producto" : `estos ${missing.length} productos`} (pon 0 si ya no hay) o márcalo como descontinuado si ya no lo vendes.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {missing.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <CandyAvatar emoji={catalog.look(p).emoji} color={catalog.look(p).color} size="sm" />
              <span className="flex-1 truncate font-medium">{p.name}</span>
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => discontinue(p)}>Descontinuado</Button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ""}>
        <div className="space-y-2 pb-2">
          <Button variant="secondary" block onClick={() => { if (menuFor) set(menuFor.id, null); setMenuFor(null); }}>Borrar mi conteo de este producto</Button>
          <Button variant="danger" block onClick={() => { if (menuFor) discontinue(menuFor); setMenuFor(null); }}>Ya no lo vendo (descontinuar)</Button>
        </div>
      </Sheet>

      <ProductFormSheet open={newOpen} onClose={() => setNewOpen(false)} onSaved={(p) => toast(`${p.name}: inventario anterior ${p.current_quantity}. Ahora cuéntalo.`, "info")} />
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={clsx("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition", active ? "bg-pink text-white shadow-pop" : "border border-line bg-surface text-ink-2")}>
      {children}
    </button>
  );
}

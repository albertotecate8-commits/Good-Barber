import { clsx } from "clsx";
import { Camera, Check, PencilLine, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { friendlyError, type Product } from "../api";
import { useToast } from "../components/toast";
import { Button, CandyAvatar, Card, Chip, Empty, Loading, Page, Sheet, Stepper, TopBar, inputClass } from "../components/ui";
import { useUpdateProduct } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { useDebouncedCallback } from "../hooks/useDebounced";
import { money } from "../lib/format";

export function ShoppingListPage() {
  const nav = useNavigate();
  const catalog = useCatalog();
  const [adding, setAdding] = useState(false);

  if (catalog.isLoading) return <Loading />;

  const list = catalog.active.filter((p) => p.shopping_qty != null);
  const pending = list.filter((p) => !p.shopping_checked).sort((a, b) => a.current_quantity - b.current_quantity);
  const done = list.filter((p) => p.shopping_checked);
  const estimate = pending.reduce((s, p) => s + (p.shopping_qty ?? 0) * p.cost_price, 0);

  return (
    <>
      <TopBar title="🛒 Mi lista de compras" />
      <Page>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => nav("/compras/nueva?modo=ticket")}
            className="flex flex-col items-start gap-3 rounded-[1.75rem] bg-pink p-4 text-left text-white shadow-pop active:scale-[0.98]">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/20"><Camera className="size-6" /></span>
            <span className="font-semibold leading-tight">Agregar compra con ticket</span>
          </button>
          <button onClick={() => nav("/compras/nueva?modo=manual")}
            className="flex flex-col items-start gap-3 rounded-[1.75rem] border-2 border-line bg-surface p-4 text-left shadow-card active:scale-[0.98]">
            <span className="grid size-11 place-items-center rounded-2xl bg-pink-soft text-pink"><PencilLine className="size-6" /></span>
            <span className="font-semibold leading-tight">Registrar compra a mano</span>
          </button>
        </div>

        {list.length === 0 ? (
          <Empty emoji="🛒" title="Tu lista está vacía" action={<Button variant="soft" onClick={() => setAdding(true)}><Plus className="size-4" />Agregar producto</Button>}>
            Después de cada conteo aquí aparecen los productos agotados o por debajo del mínimo.
          </Empty>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between">
              <p className="text-sm text-ink-2"><b className="text-ink">{done.length}</b> de {list.length} comprados</p>
              {pending.length > 0 && <p className="text-sm text-ink-2">Costo aprox. <b className="tabular text-ink">{money(estimate)}</b></p>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-pink-soft">
              <div className="h-full rounded-full bg-pink transition-all" style={{ width: `${(done.length / list.length) * 100}%` }} />
            </div>

            <ul className="mt-4 space-y-3">
              {pending.map((p) => <ListRow key={p.id} product={p} />)}
            </ul>

            <Button variant="ghost" block className="mt-3" onClick={() => setAdding(true)}><Plus className="size-4" />Agregar otro producto</Button>

            {done.length > 0 && (
              <>
                <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-3">Comprados ✓</h2>
                <ul className="space-y-2">{done.map((p) => <ListRow key={p.id} product={p} />)}</ul>
                <p className="mt-3 text-xs text-ink-3">Palomear no suma inventario: para eso registra la compra (con ticket o a mano).</p>
              </>
            )}
          </>
        )}
      </Page>
      <AddToListSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function ListRow({ product: p }: { product: Product }) {
  const catalog = useCatalog();
  const update = useUpdateProduct();
  const toast = useToast();
  const look = catalog.look(p);
  const [qty, setQty] = useState<number | null>(p.shopping_qty);
  const persist = useDebouncedCallback((v: number | null) => {
    update.mutateAsync({ id: p.id, patch: { shopping_qty: v ?? 0 } }).catch((e) => toast(friendlyError(e), "error"));
  });
  const patch = (x: Partial<Product>) => update.mutateAsync({ id: p.id, patch: x }).catch((e) => toast(friendlyError(e), "error"));
  const suggested = Math.max(p.min_quantity - p.current_quantity, 0);

  return (
    <Card as="li" className={clsx("flex items-center gap-3 p-3", p.shopping_checked && "opacity-60")}>
      <button aria-label={p.shopping_checked ? `Desmarcar ${p.name}` : `Marcar ${p.name} como comprado`} aria-pressed={p.shopping_checked}
        onClick={() => patch({ shopping_checked: !p.shopping_checked })}
        className={clsx("grid size-8 shrink-0 place-items-center rounded-full border-2 transition", p.shopping_checked ? "border-ok bg-ok text-white" : "border-line")}>
        {p.shopping_checked && <Check className="size-4" strokeWidth={3} />}
      </button>
      <CandyAvatar emoji={look.emoji} color={look.color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={clsx("truncate font-semibold", p.shopping_checked && "line-through")}>{p.name}</p>
        <p className="text-xs text-ink-2">
          Tienes <b className={clsx(p.current_quantity === 0 && "text-danger")}>{p.current_quantity}</b> · mín {p.min_quantity}
          {!p.shopping_checked && suggested > 0 && <> · sugerido {suggested}</>}
        </p>
        {p.current_quantity === 0 && !p.shopping_checked && <Chip tone="danger" className="mt-1">Agotado</Chip>}
      </div>
      {!p.shopping_checked ? (
        <Stepper size="sm" value={qty} onChange={(v) => { setQty(v); persist(v); }} label={`cantidad a comprar de ${p.name}`} />
      ) : (
        <span className="tabular text-sm font-semibold">{p.shopping_qty}</span>
      )}
      <button aria-label={`Quitar ${p.name} de la lista`} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
        onClick={() => patch({ shopping_qty: null, shopping_checked: false })}>
        <X className="size-4" />
      </button>
    </Card>
  );
}

function AddToListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const catalog = useCatalog();
  const update = useUpdateProduct();
  const toast = useToast();
  const [q, setQ] = useState("");
  const options = catalog.active
    .filter((p) => p.shopping_qty == null || p.shopping_checked)
    .filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Agregar a la lista">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
        <input className={clsx(inputClass, "pl-11")} placeholder="Buscar dulce…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      </div>
      <ul className="divide-y divide-line">
        {options.map((p) => {
          const look = catalog.look(p);
          return (
            <li key={p.id}>
              <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={async () => {
                try {
                  await update.mutateAsync({ id: p.id, patch: { shopping_qty: Math.max(p.min_quantity - p.current_quantity, 1), shopping_checked: false } });
                  toast(`${p.name} agregado a la lista`);
                } catch (e) { toast(friendlyError(e), "error"); }
              }}>
                <CandyAvatar emoji={look.emoji} color={look.color} size="sm" />
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-xs text-ink-3">tienes {p.current_quantity}</span>
                <Plus className="size-5 text-pink" />
              </button>
            </li>
          );
        })}
        {options.length === 0 && <li className="py-6 text-center text-sm text-ink-3">No hay más productos para agregar.</li>}
      </ul>
    </Sheet>
  );
}

import { clsx } from "clsx";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { ApiError, friendlyError, type Product } from "../api";
import { ProductFormSheet } from "../components/ProductForm";
import { useToast } from "../components/toast";
import { Button, CandyAvatar, Card, Chip, Empty, IconButton, Loading, Page, Sheet, TopBar, inputClass } from "../components/ui";
import { useDeleteProduct, useUpdateProduct } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { marginPct, stockStatus, unitProfit } from "../lib/calc";
import { money, pct } from "../lib/format";

export function ProductsPage() {
  const catalog = useCatalog();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<{ open: boolean; product?: Product | null }>({ open: false });
  const [actions, setActions] = useState<Product | null>(null);

  if (catalog.isLoading) return <Loading />;

  const list = catalog.products
    .filter((p) => (showInactive ? !p.is_active : p.is_active))
    .filter((p) => cat === "all" || p.category_id === cat)
    .filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const inactiveCount = catalog.products.filter((p) => !p.is_active).length;

  return (
    <>
      <TopBar title="Productos" right={<IconButton label="Agregar producto" className="bg-pink text-white border-pink" onClick={() => setForm({ open: true })}><Plus className="size-5" /></IconButton>} />
      <Page>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
          <input className={clsx(inputClass, "pl-11")} placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
        </div>

        {/* Categorías como los círculos de la referencia */}
        <div className="no-scrollbar -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1">
          <CatCircle active={cat === "all"} onClick={() => setCat("all")} emoji="🍬" label="Todos" color="pink" />
          {catalog.categories.map((c) => (
            <CatCircle key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} emoji={c.emoji} label={c.name} color={c.color} />
          ))}
        </div>

        {list.length === 0 ? (
          <Empty emoji={showInactive ? "📦" : "🍭"} title={showInactive ? "No hay productos descontinuados" : "Sin productos"}
            action={!showInactive && <Button onClick={() => setForm({ open: true })}><Plus className="size-4" /> Agregar producto</Button>}>
            {!showInactive && "Agrega los dulces que vendes."}
          </Empty>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {list.map((p) => {
              const look = catalog.look(p);
              const status = stockStatus(p.current_quantity, p.min_quantity);
              const category = catalog.categoryOf(p);
              return (
                <Card as="li" key={p.id} className="p-0">
                  <button className="flex w-full items-center gap-3 p-3.5 text-left" onClick={() => setActions(p)}>
                    <CandyAvatar emoji={look.emoji} color={look.color} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 truncate font-semibold">{p.name}</p>
                        {p.is_active && status === "out" && <Chip tone="danger" className="shrink-0">Agotado</Chip>}
                        {p.is_active && status === "low" && <Chip tone="warn" className="shrink-0">Bajo</Chip>}
                      </div>
                      <p className="text-xs text-ink-3">{category ? `${category.emoji} ${category.name}` : "Sin categoría"}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
                        <span>Costo <b className="tabular text-ink">{money(p.cost_price)}</b></span>
                        <span>Precio <b className="tabular text-ink">{money(p.sale_price)}</b></span>
                        <span className="text-pink-ink">+{money(unitProfit(p.cost_price, p.sale_price))} · {pct(marginPct(p.cost_price, p.sale_price))}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-2xl font-bold leading-none">{p.current_quantity}</p>
                      <p className="text-[11px] text-ink-3">mín {p.min_quantity}</p>
                    </div>
                  </button>
                </Card>
              );
            })}
          </ul>
        )}

        {(inactiveCount > 0 || showInactive) && (
          <button className="mt-5 w-full text-center text-sm text-ink-3 underline underline-offset-4" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? "← Ver productos activos" : `Ver descontinuados (${inactiveCount})`}
          </button>
        )}
      </Page>

      <ProductActions product={actions} onClose={() => setActions(null)} onEdit={(p) => { setActions(null); setForm({ open: true, product: p }); }} />
      <ProductFormSheet open={form.open} product={form.product} onClose={() => setForm({ open: false })} />
    </>
  );
}

function CatCircle({ active, onClick, emoji, label, color }: { active: boolean; onClick: () => void; emoji: string; label: string; color: Parameters<typeof CandyAvatar>[0]["color"] }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
      <CandyAvatar emoji={emoji} color={color} size="lg" className={clsx("transition", active && "ring-4 ring-pink/40 scale-105")} />
      <span className={clsx("truncate text-xs", active ? "font-semibold text-pink" : "text-ink-2")}>{label}</span>
    </button>
  );
}

function ProductActions({ product, onClose, onEdit }: { product: Product | null; onClose: () => void; onEdit: (p: Product) => void }) {
  const update = useUpdateProduct();
  const del = useDeleteProduct();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!product) return null;
  const p = product;
  const close = () => { setConfirmDelete(false); onClose(); };

  async function toggleActive() {
    try {
      await update.mutateAsync({ id: p.id, patch: p.is_active ? { is_active: false, shopping_qty: null, shopping_checked: false } : { is_active: true } });
      toast(p.is_active ? `${p.name} descontinuado` : `${p.name} reactivado`);
      close();
    } catch (e) { toast(friendlyError(e), "error"); }
  }

  async function remove() {
    try {
      await del.mutateAsync(p.id);
      toast(`${p.name} eliminado`);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.code === "EN_USO") {
        toast("Tiene historial de conteos o compras: mejor lo descontinuamos.", "info");
        setConfirmDelete(false);
      } else toast(friendlyError(e), "error");
    }
  }

  return (
    <Sheet open={!!product} onClose={close} title={p.name}>
      <div className="space-y-2 pb-2">
        <Button variant="secondary" block size="lg" onClick={() => onEdit(p)}>✏️ Editar datos y precios</Button>
        <Button variant="secondary" block size="lg" onClick={toggleActive}>{p.is_active ? "📦 Descontinuar (ya no lo vendo)" : "♻️ Reactivar"}</Button>
        {!confirmDelete ? (
          <Button variant="ghost" block onClick={() => setConfirmDelete(true)}>Eliminar</Button>
        ) : (
          <div className="rounded-2xl bg-danger-soft p-3 text-sm">
            <p>¿Eliminar {p.name}? Sólo se puede si nunca se ha contado ni comprado; si no, se descontinúa.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button variant="danger" className="flex-1" onClick={remove}>Eliminar</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

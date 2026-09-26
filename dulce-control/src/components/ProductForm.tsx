import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { friendlyError, type Category, type CategoryColor, type Product } from "../api";
import { useCategories, useCostHistory, useCreateCategory, useCreateProduct, useUpdateProduct } from "../hooks/data";
import { marginPct, unitProfit } from "../lib/calc";
import { fmtDay, money, pct } from "../lib/format";
import { useToast } from "./toast";
import { Button, CandyAvatar, Chip, FLAVORS, Field, MoneyInput, Sheet, Stepper, flavor, inputClass } from "./ui";

export const CANDY_EMOJIS = ["🍬", "🍭", "🍫", "🌶️", "🥔", "🍪", "🥜", "🍮", "🐻", "🍡", "🍩", "🧁", "🍿", "🥤", "🧃", "🍋", "🍓", "🥭", "🍉", "🍒", "🌽", "🧂", "🍯", "⭐"];

export interface ProductPrefill {
  name?: string;
  cost_price?: number | null;
  current_quantity?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  product?: Product | null; // editar
  prefill?: ProductPrefill; // crear con datos (p. ej. desde un ticket)
  askInitialQty?: boolean; // en alta: pedir inventario inicial
  onSaved?: (p: Product) => void;
}

const toStr = (n: number | null | undefined) => (n == null ? "" : String(n));

export function ProductFormSheet({ open, onClose, product, prefill, askInitialQty = true, onSaved }: Props) {
  const { data: categories = [] } = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const toast = useToast();
  const editing = !!product;

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [min, setMin] = useState<number | null>(10);
  const [qty, setQty] = useState<number | null>(0);
  const [newCat, setNewCat] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? prefill?.name ?? "");
    setCategoryId(product?.category_id ?? null);
    setEmoji(product?.emoji ?? null);
    setCost(toStr(product?.cost_price ?? prefill?.cost_price));
    setPrice(toStr(product?.sale_price));
    setMin(product?.min_quantity ?? 10);
    setQty(prefill?.current_quantity ?? 0);
    setNewCat(false);
  }, [open, product, prefill]);

  const category = categories.find((c) => c.id === categoryId);
  const costN = parseFloat(cost);
  const priceN = parseFloat(price);
  const valid = name.trim().length > 0 && !Number.isNaN(costN) && costN >= 0 && !Number.isNaN(priceN) && priceN >= 0 && min != null;
  const busy = create.isPending || update.isPending;

  async function submit() {
    if (!valid) return;
    try {
      const base = { name: name.trim(), category_id: categoryId, emoji, cost_price: costN, sale_price: priceN, min_quantity: min ?? 0 };
      if (editing) {
        await update.mutateAsync({ id: product!.id, patch: base });
        toast("Producto actualizado");
        onSaved?.({ ...product!, ...base });
      } else {
        const p = await create.mutateAsync({ ...base, current_quantity: askInitialQty ? qty ?? 0 : 0 });
        toast(`${p.name} agregado`);
        onSaved?.(p);
      }
      onClose();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Editar producto" : "Nuevo producto"}
      footer={<Button block size="lg" disabled={!valid || busy} onClick={submit}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Agregar producto"}</Button>}
    >
      <div className="space-y-5 pt-1">
        <div className="flex items-center gap-4">
          <CandyAvatar emoji={emoji ?? category?.emoji} color={category?.color ?? "pink"} size="lg" />
          <div className="flex-1">
            <Field label="Nombre">
              {(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Takis Fuego" autoFocus={!editing} maxLength={80} />}
            </Field>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-2">Categoría</p>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <CatChip active={categoryId == null} onClick={() => setCategoryId(null)} emoji="🍬" label="Sin categoría" color="pink" />
            {categories.map((c) => (
              <CatChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} emoji={c.emoji} label={c.name} color={c.color} />
            ))}
            <button type="button" onClick={() => setNewCat(true)} className="flex shrink-0 items-center gap-1 rounded-full border-2 border-dashed border-line px-3 py-2 text-sm font-medium text-ink-2">
              <Plus className="size-4" /> Nueva
            </button>
          </div>
          {newCat && <NewCategory onDone={(c) => { setNewCat(false); if (c) setCategoryId(c.id); }} />}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-2">Ícono</p>
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
            {CANDY_EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(emoji === e ? null : e)} aria-pressed={emoji === e}
                className={clsx("grid size-11 shrink-0 place-items-center rounded-2xl text-2xl transition", emoji === e ? "bg-pink-soft ring-2 ring-pink" : "bg-surface-2")}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Costo de compra">{(id) => <MoneyInput id={id} value={cost} onChange={setCost} />}</Field>
          <Field label="Precio de venta">{(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}</Field>
        </div>

        {!Number.isNaN(costN) && !Number.isNaN(priceN) && priceN > 0 && (
          <div className={clsx("flex items-center justify-between rounded-2xl px-4 py-3 text-sm", priceN >= costN ? "bg-mint-soft" : "bg-danger-soft")}>
            <span className="text-ink-2">Ganancia por pieza</span>
            <span className="font-semibold">
              {money(unitProfit(costN, priceN))} <span className="font-normal text-ink-2">· margen {pct(marginPct(costN, priceN))}</span>
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Cantidad mínima</p>
            <p className="text-xs text-ink-3">Debajo de esto entra a la lista de compras</p>
          </div>
          <Stepper value={min} onChange={setMin} label="cantidad mínima" />
        </div>

        {!editing && askInitialQty && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">¿Cuántos tienes hoy?</p>
              <p className="text-xs text-ink-3">Inventario inicial</p>
            </div>
            <Stepper value={qty} onChange={setQty} label="inventario inicial" />
          </div>
        )}

        {editing && <CostHistory productId={product!.id} />}
      </div>
    </Sheet>
  );
}

function CatChip({ active, onClick, emoji, label, color }: { active: boolean; onClick: () => void; emoji: string; label: string; color: CategoryColor }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={clsx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition",
        active ? clsx(flavor[color].soft, "ring-2", flavor[color].ring, "text-ink") : "bg-surface-2 text-ink-2")}>
      <span>{emoji}</span>{label}
    </button>
  );
}

function NewCategory({ onDone }: { onDone: (c: Category | null) => void }) {
  const create = useCreateCategory();
  const toast = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍬");
  const [color, setColor] = useState<CategoryColor>("pink");
  return (
    <div className="space-y-3 rounded-3xl bg-surface-2 p-4 animate-pop-in">
      <div className="flex gap-2">
        <select aria-label="Ícono de categoría" value={emoji} onChange={(e) => setEmoji(e.target.value)} className={clsx(inputClass, "w-20 px-2 text-xl")}>
          {CANDY_EMOJIS.map((e) => <option key={e}>{e}</option>)}
        </select>
        <input aria-label="Nombre de la categoría" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Chocolates" autoFocus maxLength={60} />
      </div>
      <div className="flex gap-2">
        {FLAVORS.map((f) => (
          <button key={f} type="button" aria-label={`Color ${f}`} onClick={() => setColor(f)}
            className={clsx("size-8 rounded-full", flavor[f].solid, color === f && "ring-4 ring-offset-2 ring-offset-surface-2", color === f && flavor[f].ring)} />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone(null)}>Cancelar</Button>
        <Button disabled={!name.trim() || create.isPending} onClick={async () => {
          try { onDone(await create.mutateAsync({ name: name.trim(), emoji, color })); }
          catch (e) { toast(friendlyError(e), "error"); }
        }}>Crear</Button>
      </div>
    </div>
  );
}

function CostHistory({ productId }: { productId: string }) {
  const { data = [] } = useCostHistory(productId);
  const rows = useMemo(() => data.slice(0, 6), [data]);
  if (rows.length === 0) return null;
  const label = { alta: "Alta", edicion: "Edición", compra: "Compra" } as const;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink-2">Historial de costos</p>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
        {rows.map((h) => (
          <li key={h.id} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-ink-2">{fmtDay(h.effective_from)} <Chip className="ml-1">{label[h.source]}</Chip></span>
            <span className="tabular">costo {money(h.cost_price)} · precio {money(h.sale_price)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-3">Cada semana usa el costo que estaba vigente cuando se contó.</p>
    </div>
  );
}
